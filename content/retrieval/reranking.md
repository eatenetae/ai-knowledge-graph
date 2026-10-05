---
id: reranking
title: 重排序
domain: retrieval
pm: useful
summary: 先快速粗筛出一批候选，再用更准但更慢的方法重新排个序。
prerequisites:
  - semantic-search
related:
  - rag
  - vector-similarity
  - rag-failure-modes
tags:
  - 应用开发
  - 性能优化
sources:
  - title: Passage Re-ranking with BERT (2019)
    url: https://arxiv.org/abs/1901.04085
  - title: ColBERT - Efficient and Effective Passage Search via Contextualized Late Interaction (2020)
    url: https://arxiv.org/abs/2004.12832
updated_at: 2026-09-29
---

## 直觉

向量检索有个绕不开的矛盾：**它很快，但不够准。**

原因是它**把整段文本压成了一个向量**。一段话里的细节全被平均进那几百个数字里了——「退款 3 天到账」和「退款 30 天到账」，两段话的向量可能几乎一样，因为只差一个字。检索系统分不出这个区别。

重排序（reranking）的思路是**分两步走**：

1. **召回（recall）**：用向量检索快速捞出 50-100 个候选。这一步**只看速度**，宁可错捞，不可漏掉。
2. **重排（rerank）**：用一个更慢但更准的模型，把「问题和每一个候选」**放在一起**仔细读一遍，重新打分排序，只留最相关的 3-5 个。

为什么这个组合有效：**快的方法做粗筛，准的方法做精选。** 两步的成本加起来，远低于用准方法去扫全库，效果又远好于只用快方法。

一个类比：**招聘**。第一轮用关键词筛简历（快，几秒过一百份，可能漏掉几个好的）；第二轮 HR 把通过的人**和岗位要求放在一起**逐份细读（慢，但判断准）。**没有人会用第二轮的方式去看全部一万份简历，也没有人敢只靠第一轮就发 offer。**

## 细节

**关键机制**

- **双编码器 vs 交叉编码器**，这是理解重排序的核心：
  - **双编码器（bi-encoder）**：问题和文档**各自**编码成向量，最后算个点积。文档向量可以**离线算好存起来**，所以快。缺点是两者从头到尾没见过面，交互只发生在最后一个点积上。
  - **交叉编码器（cross-encoder）**：把问题和文档**拼在一起**送进模型，直接输出一个相关性分数。模型能逐词比对，准得多。缺点是**每个候选都要跑一次完整推理**，没法预计算——所以只能用在少量候选上。
  - **一句话**：双编码器快在「可以预计算」，交叉编码器准在「能逐词交互」。重排序就是把两者的长处接起来。
- **典型参数**：召回 50-100 条，重排后取 top 3-5 条喂给模型。重排的延迟通常在几十到几百毫秒，相比它带来的效果提升，这笔开销几乎总是值得的。
- **多路召回 + 融合**：常见做法是**向量检索 + 关键词检索（BM25）各召回一批，用 RRF（倒数排序融合）合并**，再统一重排。关键词检索能补上向量检索的短板——订单号、错误码、人名这类**精确匹配**，向量检索经常漏，因为它关心的是「意思像」而不是「字面一样」。
- **评估必须分开做**：召回率和重排质量是**两个独立的问题**。如果正确文档根本没被召回，再怎么重排也没用。定位问题时必须先看「正确文档在不在候选里」——这就是 `rag-failure-modes` 里讲的「检索问题 vs 生成问题」的第一刀。

**什么时候可以不上重排**

语料很小（几千块）、查询很简单、对延迟极敏感的场景，可以省掉。但只要你的 RAG 开始出现「答非所问」，**加一个重排模型通常是最快见效的一步**——它不需要改任何提示词，也不需要重训任何东西。

**可运行代码**

```python
# pip install sentence-transformers
from sentence_transformers import SentenceTransformer, CrossEncoder

docs = [
    "退款将在审核通过后 3 个工作日内原路退回。",
    "退款将在审核通过后 30 个工作日内原路退回。",   # 和上面只差一个字
    "生鲜类商品不支持七天无理由退货。",
    "发票需在订单完成后 30 天内申请。",
]
query = "退款几天到账？"

# 第一步：双编码器召回（真实系统里这一步来自向量库，这里直接全算）
bi = SentenceTransformer("all-MiniLM-L6-v2")
dv = bi.encode(docs, normalize_embeddings=True)
qv = bi.encode([query], normalize_embeddings=True)[0]
recall = sorted(range(len(docs)), key=lambda i: -(qv @ dv[i]))
print("召回顺序:", recall)

# 第二步：交叉编码器重排（问题和文档一起送进模型）
cross = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
scores = cross.predict([(query, docs[i]) for i in recall])
reranked = [recall[i] for i in sorted(range(len(recall)), key=lambda i: -scores[i])]

print("\n重排后:")
for rank, i in enumerate(reranked):
    print(f"  {rank+1}. [{scores[recall.index(i)]:+.2f}] {docs[i]}")
```

关键在最后几行：**召回阶段可能把「3 天」和「30 天」混在一起分不出来，重排阶段能靠逐词比对把它们分开。** 这就是「快筛 + 精选」两段式的价值。
