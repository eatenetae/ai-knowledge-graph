---
id: semantic-search
title: 语义检索
domain: retrieval
pm: core
summary: 按「意思」而不是按「字面」找东西，你问「怎么退货」，它能找到「售后流程说明」。
prerequisites:
  - embedding
  - vector-database
related: []
tags:
  - 应用开发
  - 检索
sources:
  - title: Dense Passage Retrieval for Open-Domain Question Answering (2020)
    url: https://arxiv.org/abs/2004.04906
  - title: Sentence-BERT - Sentence Embeddings using Siamese BERT-Networks (2019)
    url: https://arxiv.org/abs/1908.10084
updated_at: 2026-09-29
---

## 直觉

传统搜索是**对字**：你搜「退货」，它就找包含「退货」两个字的文档。可用户不会按你的用词提问——他会搜「买错了想退掉怎么办」。字面上一个词都不重合，传统搜索一条都找不出来。

语义检索换了个做法：**先把问题和文档都变成向量，再比距离。** 因为「买错了想退掉」和「售后流程」在意思上很近，它们的向量也近，所以能被找出来。哪怕两段文字一个字都不重复。

一个类比：**问路**。传统搜索是查路牌——牌子上没写这个名字就找不到。语义检索是问一个熟悉全城的人——你描述得再口语，他也知道你说的是哪儿。

## 细节

**关键机制**

- **双塔结构**：问题和文档分别过一个编码器，得到两个向量，然后算相似度。因为两边**不互相看见**，所有文档的向量可以**离线算好存起来**，查询时只编码问题——这是它能做到毫秒级响应的原因。
- **对比学习训练**：拿「真问题 + 真答案段落」当正例，「问题 + 随机段落」当负例，把正例拉近、负例推远。负例挑得越难（越像正确答案），效果越好。
- **对称 vs 非对称**：句子之间比相似（对称）和「短问题找长文档」（非对称）需要不同的模型。拿一个对称模型做问答检索，效果会明显打折——**选模型前先看它的训练目标**。

**和关键词检索的关系**

语义检索不擅长**精确匹配**：搜订单号 `ORD-2024-8871`、错误码、人名，向量模型会把它们糊成一团。所以生产系统几乎都是**混合检索**：

- 关键词（BM25）负责精确命中；
- 向量负责语义召回；
- 两路结果用 **RRF（倒数排名融合）** 合并，再交给重排模型精排。

**只做向量检索，是新手最常见的失分点。**

**可运行代码**

一个完整的混合检索骨架（BM25 + 向量 + RRF 融合）：

```python
# pip install rank_bm25 sentence-transformers numpy
import numpy as np
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer

docs = [
    "订单 ORD-2024-8871 的退款将在 3 个工作日内到账",
    "七天无理由退货的适用条件与售后流程说明",
    "如何修改收货地址",
    "发票开具与邮寄说明",
]
model = SentenceTransformer("all-MiniLM-L6-v2")
doc_vecs = model.encode(docs, normalize_embeddings=True)

def search(query, top_k=3):
    # 路 1：关键词
    bm25 = BM25Okapi([d.lower().split() for d in docs])
    kw = bm25.get_scores(query.lower().split())
    # 路 2：语义
    sem = model.encode([query], normalize_embeddings=True)[0] @ doc_vecs.T
    # 融合：只看排名，不看分数（RRF）
    fused = np.zeros(len(docs))
    for scores in (kw, sem):
        for rank, idx in enumerate(np.argsort(-scores)[:top_k]):
            fused[idx] += 1 / (60 + rank + 1)
    return [(docs[i], round(float(fused[i]), 4)) for i in np.argsort(-fused)[:top_k]]

for doc, score in search("ORD-2024-8871 什么时候退钱"):
    print(f"{score:.4f}  {doc}")
```

注意第一句里，**订单号靠 BM25 命中，退款语义靠向量召回**——两路各管一段，合起来才是可用的检索。
