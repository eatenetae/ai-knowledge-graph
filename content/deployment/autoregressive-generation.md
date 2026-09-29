---
id: autoregressive-generation
title: 自回归生成
domain: deployment
summary: 模型一个字一个字往外蹦，每写一个字都要把前面所有字重看一遍。
prerequisites:
  - next-token-prediction
related:
  - sampling-strategies
  - kv-cache
  - streaming-output
  - inference-cost
tags:
  - 推理
  - 必读
sources:
  - title: The Unreasonable Effectiveness of Recurrent Neural Networks (Karpathy, 2015)
    url: https://karpathy.github.io/2015/05/21/rnn-effectiveness/
  - title: Language Models are Unsupervised Multitask Learners (GPT-2, 2019)
    url: https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf
updated_at: 2026-09-29
---

## 直觉

`next-token-prediction` 讲的是训练目标：猜下一个词。自回归生成（autoregressive generation）讲的是**推理时怎么把这个能力用起来**——答案简单到有点笨：

**猜一个，接上去，再猜下一个，再接上去，循环。**

```
输入：今天天气真
第 1 步 → 好        现在有：今天天气真好
第 2 步 → ，        现在有：今天天气真好，
第 3 步 → 适合      现在有：今天天气真好，适合
第 4 步 → 出门      ...
```

就这么简单。**没有「先想好整句话再写」这一步**——它写第一个字的时候，还不知道后面要写什么。

为什么这个细节决定了很多工程决策：**生成是串行的，没法并行。** 输入 1000 个字，GPU 可以一次算完；输出 1000 个字，必须老老实实循环 1000 次。**这就是为什么输出的价格通常是输入的几倍，也是为什么「打字机效果」是天然的而不是刻意做出来的。**

一个类比：**玩接龙**。每个人只能说一个词，下一个人根据前面所有词接。你不能跳过前面直接说第 20 个词——**第 20 个词取决于前 19 个已经说出来的词**，而它们是一步步长出来的。

## 细节

**关键机制**

- **一次前向，只产出一个 token**。这听起来极其浪费：为了写第 100 个字，把前 99 个字重新算了一遍。**KV Cache 就是为了消除这个浪费而存在的**（见 `kv-cache`）——把前面算过的中间结果存下来复用，让每一步只需要算新来的那一个 token。
- **两个阶段，性能特征完全不同**：
  - **预填充（prefill）**：处理你的输入。**可以并行**，GPU 利用率高，是计算密集型。输入越长，这一步越慢。
  - **解码（decode）**：逐个生成输出。**完全串行**，每一步只算一个 token，GPU 大部分时间在等显存读取权重，是**显存带宽密集型**。
  - 这个区别解释了一个反直觉现象：**长输入 + 短输出，往往比短输入 + 长输出更快**，即使总 token 数一样。
- **停止条件**：模型怎么知道该停了？
  - 生成到一个特殊的**结束标记（EOS token）**；
  - 达到 `max_tokens` 上限（**必须设置**，否则可能一直写到额度耗尽）；
  - 命中你配置的停止词（stop sequence）。
- **误差累积**：第 3 步写错一个字，第 4 步是在**错误的基础上**继续写的，后面全歪。这既是幻觉的放大器（见 `hallucination`），也是为什么「一次生成一大段」比「分多轮生成」风险更高。
- **流式输出是免费的**：既然本来就是一个个生成的，**边生成边推给用户**不需要额外成本，却能显著改善体感（见 `streaming-output`）。首 token 时间（TTFT）和每秒输出 token 数（TPOT）是两个独立指标，优化手段也不同。

**为什么不能并行生成**

有人会想：既然模型能一次算出「今天天气真好，适合出门」这整句话的概率，为什么不一次性输出？

因为**联合概率不等于独立预测**。模型在只看「今天天气真」时，对第二个字的判断，和在看到「今天天气真好」时对第三个字的判断，是**两次不同的计算**。自回归的定义就是「每一步都基于前面真实生成的内容重新算」——这也是它比一次性生成质量更高的原因。

**可运行代码**

```python
# 手写自回归循环：不调用任何 generate()，看清每一步在做什么
import torch, torch.nn.functional as F
from transformers import AutoModelForCausalLM, AutoTokenizer

tok = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-0.5B")
model = AutoModelForCausalLM.from_pretrained("Qwen/Qwen2.5-0.5B").eval()

ids = tok("今天天气真", return_tensors="pt").input_ids
generated = []

with torch.inference_mode():
    for step in range(12):                      # 最多生成 12 个 token
        out = model(ids)                        # 一次前向
        logits = out.logits[0, -1]              # 只看最后一个位置的预测
        next_id = logits.argmax().item()        # 贪心：选概率最高的那个
        generated.append(next_id)

        ids = torch.cat([ids, torch.tensor([[next_id]])], dim=1)   # 接上去
        if next_id == tok.eos_token_id:
            break

print("生成结果:", tok.decode(generated))
print("总步数:", len(generated))
```

注意 `ids = torch.cat(...)` 那一行：**每次循环都把新 token 接到输入后面，下一轮重新喂进去**。这就是「自回归」的字面含义。真实推理引擎用 KV Cache 避免重复计算，但**逻辑上做的事情完全一样**。
