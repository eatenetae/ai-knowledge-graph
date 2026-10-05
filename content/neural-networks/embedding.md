---
id: embedding
title: 词向量
domain: neural-networks
pm: core
summary: 把每个词变成一串数字，意思相近的词，数字也挨得近。
prerequisites:
  - neural-network
  - tokenization
related: []
tags:
  - 入门
  - 表示学习
sources:
  - title: Efficient Estimation of Word Representations in Vector Space (Word2Vec, 2013)
    url: https://arxiv.org/abs/1301.3781
  - title: GloVe - Global Vectors for Word Representation
    url: https://nlp.stanford.edu/projects/glove/
updated_at: 2026-09-29
---

## 直觉

模型只认数字。可「猫」和「狗」的编号是 4021 和 8873——这两个数字之间没有任何关系，模型没法从编号里看出它俩是一类东西。

词向量解决的就是这件事：**给每个词配一串数字（比如 768 个），让「意思相近」直接变成「数字上挨得近」。** 训练完之后，「猫」和「狗」的向量距离很近，「猫」和「微积分」离得很远。

更妙的是，这些数字还能做算术。「国王 − 男人 + 女人」算出来的向量，最接近的词是「女王」。没人教过它这个规则，它是从大量文本里自己读出来的。

一个类比：**地图坐标**。给每个城市一个经纬度，你就能算距离、判方向。词向量就是给词在「意思空间」里定坐标——只不过这个空间有几百个维度，比地球表面难想象，但道理一样。

## 细节

**关键机制**

- **怎么训练出来的**：Word2Vec 的思路是「一个词的意思由它周围的词决定」。拿一句话，遮住中间词让模型猜（CBOW），或者拿中间词猜周围（Skip-gram）。猜着猜着，能互相替换的词就被推到了一起。
- **静态 vs 上下文相关**：Word2Vec/GloVe 给每个词**一个固定向量**，所以处理不了多义词——「苹果」在「吃苹果」和「苹果发布会」里是同一个向量。BERT 之后的做法是**每个词在不同句子里得到不同的向量**，这才解决了歧义。但底层机制没变：还是把 token 映射成向量。
- **维度**：常见 384 / 768 / 1536 / 3072。维度越高能装的信息越多，检索也越慢越贵。
- **归一化很重要**：算相似度前通常先把向量长度缩到 1，这样「余弦相似度」就退化成点积，又快又稳。

**在 LLM 里的位置**

词向量是 Transformer 的第一层：token 编号 → 查表得到向量 → 加上位置信息 → 送进注意力层。所以「词向量」不是历史知识，它是每个大模型都还在用的入口。

**可运行代码**

```python
# pip install sentence-transformers
from sentence_transformers import SentenceTransformer
import numpy as np

model = SentenceTransformer("all-MiniLM-L6-v2")   # 384 维，本地可跑
sentences = ["猫坐在垫子上", "一只小猫趴在垫子", "今天股市大跌", "上证指数走低"]

vecs = model.encode(sentences, normalize_embeddings=True)
sim = vecs @ vecs.T                                # 归一化后点积 = 余弦相似度

for i in range(len(sentences)):
    for j in range(i + 1, len(sentences)):
        print(f"{sim[i][j]:.3f}  {sentences[i]}  <->  {sentences[j]}")

# 前两行（同义句）接近 1.0，跨语义的只有 0.1 左右
```

这段代码就是**语义检索**的全部原理：把句子变成向量，比较距离。`semantic-search` 那张卡片会把它放大成一套系统。
