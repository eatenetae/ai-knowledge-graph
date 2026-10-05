---
id: llm-pretraining
title: 预训练
domain: llm-training
pm: core
summary: 用海量文本把一个大网络从随机状态练成「什么都懂一点」的通用模型。
prerequisites:
  - next-token-prediction
  - transformer
related: []
tags:
  - 训练
  - 必读
sources:
  - title: GPT-3 - Language Models are Few-Shot Learners (2020)
    url: https://arxiv.org/abs/2005.14165
  - title: LLaMA - Open and Efficient Foundation Language Models (2023)
    url: https://arxiv.org/abs/2302.13971
updated_at: 2026-09-29
---

## 直觉

预训练是整个大模型生命周期里最贵、也最关键的一步：**拿几万亿个词的文本，让模型反复做「猜下一个字」的练习，直到它把这套语言里的规律都吃进去。**

结果是得到一个「什么都懂一点、但不太听话」的模型。你问它问题，它可能接着给你编出三个新问题——因为在它的经验里，一段文字后面接什么都有可能，它并不知道你想要的是「回答」。

但它已经有了最关键的东西：**对世界的压缩理解**。语法、常识、代码、翻译、推理的雏形，全都以参数的形式存在了。后面的所有工作（指令微调、对齐）都只是在这个底座上做「行为引导」。

一个类比：**读完整个图书馆的实习生**。知识面极广，但你问他「帮我写个周报」，他可能反手给你列十本周报写作参考书——**能力有了，听不听得懂人话是另一回事**。

## 细节

**关键机制**

- **数据**：万亿级 token，来源是网页抓取、书籍、代码、论文。清洗和去重极其重要——重复数据会让模型退化成复读机。
- **算力**：几千到几万张 GPU 连着跑几周到几个月。一次预训练的成本在千万美元量级，所以全世界只有少数机构从头做。
- **并行策略**：单卡装不下，必须切分。数据并行（不同卡喂不同数据）、张量并行（一层拆到多卡）、流水线并行（不同层放不同卡），通常三种混用。
- **训练不稳定性**：loss 会突然飙升（loss spike），需要回滚检查点、调小学习率重跑。这是预训练里最耗心力的工程问题之一。
- **「涌现」现象**：某些能力（多步推理、算术）在小模型上几乎为零，规模跨过某个阈值后突然出现。这是 `scaling-law` 想描述的东西。

**预训练 / 后训练的分界**

| | 预训练 | 后训练（微调、对齐） |
|---|---|---|
| 目标 | 预测下一个 token | 听懂指令、符合偏好 |
| 数据 | 万亿 token 通用文本 | 万到百万条高质量对话 |
| 成本 | 千万美元级 | 百到万美元级 |
| 产出 | 基座模型（base） | 对话模型（instruct/chat） |

**应用开发者要知道的事**：你几乎永远不会自己预训练。但你要理解**基座模型的截止日期**——预训练数据有截止时间，之后发生的事它一概不知，这既解释了幻觉，也解释了为什么需要 `rag`。

**可运行代码**

用 nanoGPT 风格的最小循环看清预训练在做什么：

```python
import torch, torch.nn as nn

vocab, dim, seq = 1000, 128, 32
model = nn.Sequential(
    nn.Embedding(vocab, dim),
    nn.TransformerEncoder(
        nn.TransformerEncoderLayer(dim, 4, 512, batch_first=True, dropout=0.0), 2),
    nn.Linear(dim, vocab),
)
opt = torch.optim.AdamW(model.parameters(), lr=3e-4)

data = torch.randint(0, vocab, (64, seq + 1))   # 假装这是真实语料
for step in range(50):
    x, y = data[:, :-1], data[:, 1:]            # 输入与「右移一位」的答案
    logits = model(x)
    loss = nn.functional.cross_entropy(logits.reshape(-1, vocab), y.reshape(-1))
    opt.zero_grad(); loss.backward(); opt.step()
    if step % 10 == 0:
        print(f"step {step:3d}  loss {loss.item():.3f}   ppl {loss.exp():.1f}")
```

真实预训练和这 15 行的差别只有三个：**数据是真的、模型大几万倍、跑几个月**。
