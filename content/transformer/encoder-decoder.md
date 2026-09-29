---
id: encoder-decoder
title: 编码器与解码器
domain: transformer
summary: 同一套结构可以摆成三种姿势：只看不写、只写不看、先看后写。
prerequisites:
  - transformer
related:
  - attention
  - llm-pretraining
  - embedding
tags:
  - 核心架构
  - 必读
sources:
  - title: Attention Is All You Need (2017)
    url: https://arxiv.org/abs/1706.03762
  - title: BERT - Pre-training of Deep Bidirectional Transformers (2019)
    url: https://arxiv.org/abs/1810.04805
  - title: Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer (T5, 2019)
    url: https://arxiv.org/abs/1910.10683
updated_at: 2026-09-29
---

## 直觉

Transformer 本身只是一层「让每个字收集全局信息」的积木。把它摆成什么姿势，决定了这个模型能干什么活。

只有三种摆法，区别就一件事：**每个位置能往哪边看。**

- **只能往左看**（因果掩码）→ 适合**生成**。因为在写第 5 个字的时候，第 6 个字还不存在，偷看就是作弊。
- **两边都能看**（双向）→ 适合**理解**。判断「苹果」在句子里指水果还是公司，看后面半句往往更准。
- **先两边都看一遍，再往左看一遍**（一个读、一个写）→ 适合**翻译**这类「输入一段、输出一段」的任务。

为什么必须搞清这三种：**模型的形态决定了它适合做什么，用错了形态再怎么调提示词都白搭。** 你没法让一个只能往左看的模型去做「读完整个句子再判断」的活——它读每个字的时候还没看到后面。

一个类比：**三种阅读方式**。第一种是**听写**，只能根据已经听到的内容猜下一个字；第二种是**批改作文**，可以反复通读全文再下判断；第三种是**同声传译**，一边听完整段一边往外说。

## 细节

**关键机制**

| 形态 | 注意力 | 代表模型 | 擅长 | 不擅长 |
|---|---|---|---|---|
| **Encoder-only** | 双向 | BERT、bge、各类 embedding 模型 | 分类、抽取、**生成向量** | 生成文本 |
| **Decoder-only** | 因果（只看左） | GPT、Llama、Claude、Qwen | **生成、对话、推理** | 天生不擅长「先看全局再输出」 |
| **Encoder-Decoder** | 双向编码 + 因果解码 + 交叉注意力 | 原始 Transformer、T5、BART | 翻译、摘要、改写 | 结构重、部署成本高 |

- **交叉注意力（cross-attention）**是 Encoder-Decoder 独有的：解码器在生成每个字时，可以回头查询编码器输出的整段表示。这是「输入和输出是两段独立序列」这类任务的标配。
- **今天的大模型几乎全是 Decoder-only**。原因不是双向注意力不好，而是**一个形态能通吃**：只要把任务都写成「给一段前缀，续写下去」，翻译、摘要、问答、写代码全都变成了同一件事。工程上只需要一套架构、一套训练代码、一套推理优化，规模效应就此打开。
- **BERT 没有消失，它换了岗位**。BERT 类模型现在是**检索系统里的 embedding 模型**——你用的向量库背后，十有八九跑的是一个 encoder-only 模型（见 `embedding`、`semantic-search`）。
- **前缀语言模型（prefix LM）**是折中：对输入部分用双向注意力，对输出部分用因果注意力。T5 的 span 去噪、GLM 系列都用过类似思路，但没有成为主流。

**一句话选型**

要**生成**选 Decoder-only；要**向量**选 Encoder-only；要做**固定格式的序列到序列转换**且对延迟不敏感，Encoder-Decoder 仍然有优势。

**可运行代码**

```python
import torch, torch.nn as nn

# Encoder-only：双向，输出和输入等长
encoder = nn.TransformerEncoder(
    nn.TransformerEncoderLayer(d_model=64, nhead=4, batch_first=True), num_layers=2)
x = torch.randn(1, 6, 64)
print("encoder:", encoder(x).shape)          # [1, 6, 64] —— 每个位置都看到了全句

# Decoder-only：因果掩码，每个位置只能看到左边
decoder = nn.TransformerDecoder(
    nn.TransformerDecoderLayer(d_model=64, nhead=4, batch_first=True), num_layers=2)
memory = torch.randn(1, 6, 64)               # 假装是编码器的输出
tgt = torch.randn(1, 4, 64)
print("decoder:", decoder(tgt, memory).shape) # [1, 4, 64]

# 掩码就是那个「不许偷看」的开关
causal = nn.Transformer.generate_square_subsequent_mask(4)
print(causal)                                 # 上三角是 -inf，下三角是 0
```

把 `generate_square_subsequent_mask` 去掉（传 `None`），解码器就变成了双向——那就是 BERT 的注意力方式。**三种形态的差别，真的就只有这一个掩码。**
