---
id: transformer
title: Transformer
domain: transformer
pm: useful
summary: 一种让每个字都能直接看到句子里所有其他字的结构，今天几乎所有大模型都用它。
prerequisites:
  - attention
related: []
tags:
  - 核心架构
  - 必读
sources:
  - title: Attention Is All You Need (2017)
    url: https://arxiv.org/abs/1706.03762
  - title: The Illustrated Transformer (Jay Alammar)
    url: https://jalammar.github.io/illustrated-transformer/
updated_at: 2026-09-29
---

## 直觉

2017 年之前，处理语言主要靠「从左往右一个词一个词读」的结构，慢，而且长句子里前面的信息容易丢。

Transformer 提出了一件当时很大胆的事：**把「按顺序读」这件事整个扔掉，只留注意力。** 每个词同时看到所有其他词，一次算完。这一下同时解决了两个问题——长距离依赖不再衰减，而且所有位置可以并行计算，终于能喂饱 GPU 了。

论文标题就叫《Attention Is All You Need》（你需要的只是注意力）。它本来是为翻译写的，结果成了整个大模型时代的底座：GPT、BERT、Claude、Llama、Qwen，无一例外都是 Transformer。

一个类比：**从「接力赛」改成「圆桌讨论」**。接力赛必须按顺序跑，交接棒处最容易掉链子；圆桌讨论里每个人同时听到所有人发言，一轮就能对齐信息，而且可以同时进行。

## 细节

**关键机制**

一个 Transformer 层由两个子模块组成，每个子模块外面套一层「残差连接 + 归一化」：

1. **多头自注意力**：见 `attention` 卡片。让每个位置收集全局信息。
2. **前馈网络（FFN）**：一个两层的全连接网络，对每个位置**独立**作用。它占了模型大部分参数，通常被认为是「知识存储」的地方。

残差连接（`输出 = 子层(x) + x`）是能堆很深的关键——它给梯度留了一条高速公路，否则几十层根本训不动。

**三种形态**

- **Encoder-only**（BERT）：双向注意力，擅长理解类任务——分类、抽取、检索向量。
- **Decoder-only**（GPT / Llama / Claude）：因果掩码，只能看左边，擅长生成。**今天的 LLM 基本都是这个形态。**
- **Encoder-Decoder**（原始 Transformer、T5）：一个读一个写，适合翻译这类输入输出都成序列的任务。

**位置信息从哪来**

注意力本身对顺序一无所知——打乱输入，输出只是跟着打乱。所以必须额外注入位置信息：原始论文用正弦函数，后来主流换成**旋转位置编码（RoPE）**，它让「相对距离」自然地体现在点积里，是现代长上下文外推的基础。

**可运行代码**

```python
import torch, torch.nn as nn

layer = nn.TransformerEncoderLayer(
    d_model=512, nhead=8, dim_feedforward=2048,
    dropout=0.0, batch_first=True,
)
encoder = nn.TransformerEncoder(layer, num_layers=6)

x = torch.randn(2, 10, 512)          # (batch, 序列长度, 维度)
out = encoder(x)
print(out.shape)                     # torch.Size([2, 10, 512]) —— 形状不变，信息被重新混合
print("参数量:", sum(p.numel() for p in encoder.parameters()) / 1e6, "M")
```

注意输入输出形状完全一样——Transformer 层是**同构**的，这正是它能被简单粗暴地堆几百层的原因。
