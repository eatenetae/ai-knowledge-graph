---
id: positional-encoding
title: 位置编码
domain: transformer
summary: 给每个字额外加一个「你在第几位」的记号，否则模型分不清语序。
prerequisites:
  - transformer
related:
  - attention
  - context-window
tags:
  - 核心机制
  - 进阶
sources:
  - title: Attention Is All You Need (2017)
    url: https://arxiv.org/abs/1706.03762
  - title: RoFormer - Enhanced Transformer with Rotary Position Embedding (RoPE, 2021)
    url: https://arxiv.org/abs/2104.09864
updated_at: 2026-09-29
---

## 直觉

Transformer 有一个很反直觉的性质：**它完全不知道顺序。**

注意力做的事情是「每个字去问所有字有多相关，然后加权求和」。而加法是**可交换的**——把「我打你」和「你打我」的输入顺序换一下，注意力算出来的东西一模一样。对模型来说这两句话没有区别。

可意思完全不同。所以必须**额外告诉模型每个字在第几位**，这就是位置编码（positional encoding）。

为什么重要：**没有位置信息，Transformer 只是一个高级的词袋模型**——它能知道句子里有哪些词，但不知道谁在前谁在后。语序、指代、因果，全都建立在顺序上。

一个类比：**给排队的人发号码牌**。每个人的长相（词义）已经写脸上了，但队伍里谁先谁后，光看脸看不出来。发一张号码牌贴身上，所有人一比号码就知道顺序。位置编码就是这张号码牌——**它不是内容，它是关于内容在哪里的信息。**

## 细节

**关键机制**

- **最早的做法（正弦编码）**：用一组不同频率的 sin/cos 函数，按位置算出固定向量，**直接加到词向量上**。好处是不用训练、理论上能外推到任意长度。坏处是「相对距离」要模型自己从绝对位置里学出来，效果一般。
- **现在的主流（RoPE，旋转位置编码）**：不再「加」位置，而是**把向量按位置旋转一个角度**。两个词做点积时，结果自然只依赖它们的**相对距离**，与绝对位置无关。
  - 这个性质极其重要：模型在 4K 长度上训练，却能在更长的文本上保持一定的表现——因为「相隔 3 个词」这件事，无论出现在第 10 位还是第 1000 位，表达方式是一样的。
  - 今天几乎所有开源大模型（Llama、Qwen、DeepSeek 等）都用 RoPE。
- **外推 vs 内插**：RoPE 也不是无限可外推。想让 8K 训练的模型处理 128K，常用手段是**位置内插（position interpolation）**或 YaRN 这类频率缩放——把超出训练范围的位置「压」回模型见过的区间。这就是很多模型「支持 128K 上下文」背后的实际做法。
- **长度外推会掉点**：即使厂商声称支持 128K，模型在**中间位置**的信息检索能力通常明显弱于开头和结尾。这就是 `Lost in the Middle` 现象，做长文档应用时必须实测（见 `context-engineering`）。

**和上下文窗口的关系**

`context-window` 说的是「模型一次能看多少字」，位置编码决定的是「它能不能分清这些字谁先谁后、以及超长之后还准不准」。**窗口大小是容量问题，位置编码是精度问题。** 两个都重要，但后者更容易被忽略——很多「长上下文效果差」的抱怨，根因在这里。

**可运行代码**

```python
import numpy as np

def sinusoidal_encoding(seq_len, d_model):
    """原始论文的正弦位置编码：位置 -> 固定向量"""
    pos = np.arange(seq_len)[:, None]                      # (L, 1)
    i = np.arange(d_model)[None, :]                        # (1, D)
    angle = pos / np.power(10000, (2 * (i // 2)) / d_model) # (L, D)
    pe = np.zeros((seq_len, d_model))
    pe[:, 0::2] = np.sin(angle[:, 0::2])                   # 偶数维用 sin
    pe[:, 1::2] = np.cos(angle[:, 1::2])                   # 奇数维用 cos
    return pe

pe = sinusoidal_encoding(seq_len=8, d_model=16)
print(pe.shape)                    # (8, 16) —— 每个位置一个固定向量

# 关键性质：不同位置的编码互不相同，且相邻位置更接近
sim = pe @ pe.T
print("位置 0 与位置 1 的相似度:", round(float(sim[0, 1]), 3))
print("位置 0 与位置 7 的相似度:", round(float(sim[0, 7]), 3))   # 明显更低

# 用法：直接加到词向量上
word_vecs = np.random.default_rng(0).normal(size=(8, 16))
x = word_vecs + pe                 # 内容 + 位置
print("送入注意力层的输入形状:", x.shape)
```

把 `sinusoidal_encoding` 换成 RoPE 的旋转实现，就是现代大模型的做法。想看 RoPE 的完整推导，L3 引用的 RoFormer 论文第 3 节写得最清楚。
