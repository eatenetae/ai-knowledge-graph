---
id: sampling-strategies
title: 采样策略
domain: deployment
summary: 模型给出的是每个候选字的概率，怎么从中挑一个，决定了回答的风格。
prerequisites:
  - autoregressive-generation
related:
  - hallucination
  - latency-cost-tradeoff
  - structured-output
tags:
  - 推理
  - 实用技巧
  - 必读
sources:
  - title: The Curious Case of Neural Text Degeneration (top-p 采样, 2019)
    url: https://arxiv.org/abs/1904.09751
  - title: Hierarchical Neural Story Generation (top-k 采样, 2018)
    url: https://arxiv.org/abs/1805.04833
updated_at: 2026-09-29
---

## 直觉

模型每一步吐出的不是一个词，而是**整个词表上的一张概率表**：

```
今天天气真 →  好: 0.62   不: 0.11   热: 0.09   冷: 0.05   ...（还有几万个）
```

采样策略（sampling strategy）要回答的就是：**从这张表里怎么挑下一个词？**

这个选择看似技术细节，实际上**直接决定了产品的性格**：

- 永远挑概率最高的（**贪心**）→ 稳定、可复现，但容易**车轱辘话**、缺乏变化；
- 完全按概率随机抽 → 有创意，但**容易跑偏、胡说八道**；
- 只在**头部几个候选**里抽 → 兼顾稳定和多样，这是主流做法。

一个类比：**点菜**。贪心是「每次都点你最常点的那道」——稳，但吃腻了。完全随机是「闭着眼睛在菜单上指」——有惊喜，也容易踩雷。理性做法是「**在前三页里挑一个没吃过的**」——**把选择范围收窄到合理的候选，再在其中随机**。这就是 top-p 的思路。

## 细节

**关键机制**

- **几个核心参数**：
  - **temperature（温度）**：在 softmax 之前把 logits 除以 T。
    - `T = 0`：退化成贪心，每次选最高概率的。**事实型问答、代码生成、结构化抽取用这个。**
    - `T = 1`：按模型原始概率采样。
    - `T > 1`：概率分布被抹平，低概率词也有机会。**创意写作可以到 1.2-1.5**，再高就开始语无伦次。
  - **top-k**：只保留概率最高的 k 个候选。`k=1` 就是贪心。问题是 k 固定——有时模型很确信（第 1 名 0.95），有时很犹豫（第 1 名 0.05），固定的 k 两种情况都不合适。
  - **top-p（核采样，nucleus sampling）**：**动态地**保留累积概率达到 p 的最小候选集。模型确信时集合可能只有 1 个词，犹豫时可能包含 50 个。**这是它比 top-k 更常用的原因。**
  - **重复惩罚（repetition penalty / frequency penalty）**：降低已出现过的词的权重，缓解复读机现象。
- **推荐起点**：

| 场景 | temperature | top_p |
|---|---|---|
| 事实问答 / RAG | 0 | 1 |
| 结构化抽取 / 代码 | 0 | 1 |
| 通用对话 | 0.7 | 0.9 |
| 创意写作 / 头脑风暴 | 1.0 - 1.2 | 0.95 |

- **温度 0 不等于完全确定**：由于浮点运算和批处理的并行归约顺序，同一输入在不同批次、不同硬件上仍可能有微小差异，**极端情况下会选出不同的 token**。要严格可复现，需要固定随机种子并保证批处理一致——生产环境里通常做不到，所以**关键路径要有校验而不是假设确定性**。
- **温度影响不了的事实**：**降低温度不能减少模型「确信的错误」**。如果模型坚定地认为某个错误答案是对的，`T=0` 只会让它每次都错得一模一样。治幻觉要靠 `rag` 和提示词（见 `hallucination`），不是靠调温度。

**和成本的关系**

采样参数**不改变生成速度**（每一步还是算一次前向），但会通过**输出长度**间接影响成本和延迟：温度高的模型更容易跑偏、更容易说废话，输出变长，账单变大。**把事实型任务的温度调到 0，往往能同时省钱和提质。**

**可运行代码**

```python
import torch, torch.nn.functional as F

logits = torch.tensor([3.0, 2.0, 1.0, 0.5, 0.1, -1.0, -3.0])   # 7 个候选

def sample(logits, temperature=1.0, top_p=1.0, top_k=None):
    if temperature == 0:
        return int(logits.argmax())                      # 贪心

    logits = logits / temperature
    probs = F.softmax(logits, dim=-1)

    if top_k is not None:                                # 只留前 k 个
        kth = torch.topk(probs, top_k).values[-1]
        probs = torch.where(probs < kth, torch.zeros_like(probs), probs)

    if top_p < 1.0:                                      # 累积概率到 p 就截断
        sorted_probs, order = torch.sort(probs, descending=True)
        cumulative = torch.cumsum(sorted_probs, dim=-1)
        cutoff = cumulative > top_p
        cutoff[..., 1:] = cutoff[..., :-1].clone()
        cutoff[..., 0] = False
        sorted_probs[cutoff] = 0.0
        probs = torch.zeros_like(probs).scatter(0, order, sorted_probs)

    probs = probs / probs.sum()                          # 重新归一化
    return int(torch.multinomial(probs, 1))

torch.manual_seed(0)
print("贪心      :", [sample(logits, temperature=0) for _ in range(8)])
print("T=0.7,p=.9:", [sample(logits, temperature=0.7, top_p=0.9) for _ in range(8)])
print("T=1.5     :", [sample(logits, temperature=1.5) for _ in range(8)])
```

跑出来会看到：**贪心每次都选 0；`T=1.5` 时会开始选到索引 5、6 这些原本概率极低的候选**——那就是「胡说八道」在参数上的样子。**top-p 的作用就是在温度调高的同时，把这类垃圾候选挡在门外。**
