---
id: vector-similarity
title: 向量空间与相似度
domain: neural-networks
pm: useful
summary: 把每样东西变成一串数字后，靠量两串数字的距离来判断它们像不像。
prerequisites:
  - embedding
related:
  - semantic-search
  - vector-database
  - reranking
tags:
  - 表示学习
  - 必读
sources:
  - title: PyTorch 官方文档：余弦相似度
    url: https://pytorch.org/docs/stable/generated/torch.nn.CosineSimilarity.html
  - title: Efficient Estimation of Word Representations in Vector Space (Word2Vec, 2013)
    url: https://arxiv.org/abs/1301.3781
updated_at: 2026-09-29
---

## 直觉

上一张卡片把「意思」变成了「一串数字」。但变成数字本身没有用，**有用的是变成数字之后我们能对它做运算**。

向量空间与相似度说的就是这套运算：把每样东西摆进一个高维空间里，**离得近的就是像的，离得远的就是不像的**。于是「这两句话是不是一个意思」这种说不清的问题，变成了「算一下这两个点距离多远」这种能算的问题。

为什么这一步是整个 AI 应用层的地基：搜索、推荐、去重、聚类、RAG 的召回——**全部都是同一个动作**：把要查的东西变成一串数字，然后在一堆数字里找最近的几个。学会这一张，后面 `semantic-search`、`vector-database`、`rag` 都只是它的工程放大版。

一个类比：**给每道菜在「口味地图」上标一个点**。酸甜苦辣咸各是一个维度，红烧肉和糖醋排骨都偏甜偏油，两个点挨得近；它们和清炒时蔬离得远。你不需要尝第二遍，**看坐标就知道像不像**。

## 细节

**关键机制**

- **两种常见距离**：
  - **余弦相似度（cosine similarity）**：看两个向量的**夹角**，不看长度。取值 −1 到 1，越接近 1 越像。它是检索的默认选择，因为它只关心「方向」——一段话写长写短，方向不变。
  - **欧氏距离（Euclidean distance）**：看两点的**直线距离**。关心绝对位置，适合向量长度本身有意义的场景。
  - **归一化之后，两者等价**：把所有向量长度都缩成 1，余弦相似度就退化成**点积**。点积是矩阵乘法，GPU 算起来极快——**这就是所有向量检索库的第一步都是「先归一化」的原因**。
- **维度灾难**：维度越高，空间越空旷，任意两点之间的距离差别越小，「最近邻」就越没有区分度。这也是为什么 384 / 768 维通常比 3072 维更适合做检索——**更高维不等于更好检索**。
- **相似度有阈值吗**：没有通用阈值。0.85 在某个模型上算高度相关，在另一个模型上可能只是平均水平。**必须拿你自己的数据量一遍**（做法见 `llm-evaluation`）。
- **近似最近邻（ANN）**：60 亿条向量逐个算距离是不可行的。工程上用 HNSW、IVF 这类索引结构，牺牲一点点召回率换取几百倍的速度。这是 `vector-database` 存在的全部理由。

**一个必须警惕的陷阱**

**语义相似不等于任务相关。** 「如何取消订阅」和「如何续订」在向量空间里非常接近——它们用词几乎一样，方向几乎一致。但对用户来说这是两个相反的需求。所以真实系统里几乎都会在向量召回之后再加一层**重排（`reranking`）**，用更贵但更准的模型重新打分。

**可运行代码**

```python
import numpy as np

def cosine(a, b):
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))

# 假装这是 embedding 模型吐出来的 4 维向量（真实是几百维）
docs = {
    "红烧肉":   np.array([0.9, 0.1, 0.8, 0.2]),
    "糖醋排骨": np.array([0.8, 0.3, 0.7, 0.1]),
    "清炒时蔬": np.array([0.1, 0.9, 0.2, 0.3]),
}
q = np.array([0.85, 0.2, 0.75, 0.15])   # 用户想要「偏甜偏油的肉菜」

for name, v in docs.items():
    print(f"{cosine(q, v):+.3f}  {name}")

# 归一化后点积 == 余弦相似度，而且能一次性算完所有候选
M = np.stack(list(docs.values()))
M = M / np.linalg.norm(M, axis=1, keepdims=True)
qn = q / np.linalg.norm(q)
print("归一化后点积:", np.round(M @ qn, 3))
```

最后那三行就是向量检索的全部：**归一化 → 一次矩阵乘法 → 取最大的几个。** 所谓「向量数据库」，本质就是把这三行做成了能存几十亿条、还能按条件过滤的工程系统。
