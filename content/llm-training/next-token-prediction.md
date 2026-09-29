---
id: next-token-prediction
title: 下一词预测
domain: llm-training
summary: 大模型唯一被训练去做的事，就是猜下一个字最可能是什么。
prerequisites:
  - transformer
related: []
tags:
  - 核心机制
  - 必读
sources:
  - title: Improving Language Understanding by Generative Pre-Training (GPT-1, 2018)
    url: https://cdn.openai.com/research-covers/language-unsupervised/language_understanding_paper.pdf
  - title: Language Models are Unsupervised Multitask Learners (GPT-2, 2019)
    url: https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf
updated_at: 2026-09-29
---

## 直觉

训练大模型的目标函数简单到有点荒谬：**给它一段文字，让它猜下一个字是什么。**

「今天天气真」→ 猜「好」。「中国的首都是」→ 猜「北」。

就这。没有专门的语法课，没有知识库录入，没有推理训练。但为了把这件事做得足够好，模型被迫学会了语法（不然接不上）、事实（不然猜错）、逻辑（不然前后矛盾），甚至一些推理能力。

为什么这个目标这么有威力：**答案就在文本里，不需要人标注。** 互联网上的每一句话都是一个免费的训练样本。这让数据规模从「百万级人工标注」一跃变成「万亿级网页文本」——大模型的「大」正是这么来的。

一个类比：**完形填空做到极致**。一个人如果能把全世界所有文章的每一个空都填对，你很难说他「不懂」这些内容。预测能力就是理解能力的影子。

## 细节

**关键机制**

- 模型对词表里每个 token 输出一个分数（logit），softmax 之后变成概率分布，训练目标是最小化「正确那个 token 的概率的负对数」（交叉熵）。
- **一次前向，处处监督**：输入 `n` 个 token，模型同时预测第 2、3、…、n+1 个位置，一次得到 `n` 个训练信号。这比一次只学一个样本高效得多，是 Transformer 并行性的直接红利。
- **采样策略决定「性格」**：
  - **贪心**（每次取概率最高的）→ 死板、容易复读。
  - **温度**：`T < 1` 让分布更尖锐（更保守），`T > 1` 更平坦（更发散）。
  - **top-p / top-k**：只在概率最高的若干候选里采样，砍掉长尾胡言乱语。
- **预训练 vs 后训练**：下一词预测是**预训练**阶段的目标。之后的指令微调、RLHF 换的是数据和目标形式，但底层机制仍是「预测下一个 token」。

**这个目标解释了很多「怪现象」**

- 模型会**一本正经地编造**：它的目标是把话说顺，不是把话说对。`llm-evaluation` 和 `rag` 都是在补这个洞。
- 模型**不擅长数数**：数字在分词后被切碎，逐位预测本来就难。
- **提示词里的格式示例极其有效**：你给了模式，它顺着往下接的概率就大幅提高——这就是 `few-shot-prompting` 的原理。

**可运行代码**

```python
# pip install transformers torch
import torch
from transformers import GPT2LMHeadModel, GPT2TokenizerFast

tok = GPT2TokenizerFast.from_pretrained("gpt2")
model = GPT2LMHeadModel.from_pretrained("gpt2").eval()

prompt = "The capital of France is"
ids = tok(prompt, return_tensors="pt").input_ids

with torch.no_grad():
    logits = model(ids).logits[0, -1]          # 只看最后一个位置的预测
probs = torch.softmax(logits, dim=-1)

top = torch.topk(probs, 5)
for score, idx in zip(top.values, top.indices):
    print(f"{tok.decode(idx):>12}  {score.item():.3f}")
```

你会看到 ` Paris` 以压倒性概率排第一。整段代码只有一次前向传播——**推理就是反复调用它，每次把新词接回输入**。
