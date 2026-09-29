---
id: vector-database
title: 向量数据库
domain: retrieval
summary: 专门用来在几百万条「意思」里，飞快找出跟你的问题最接近的那几条。
prerequisites:
  - embedding
related: []
tags:
  - 工程实践
  - 基础设施
sources:
  - title: Efficient and Robust Approximate Nearest Neighbor Search Using HNSW (2016)
    url: https://arxiv.org/abs/1603.09320
  - title: FAISS - A Library for Efficient Similarity Search
    url: https://github.com/facebookresearch/faiss
updated_at: 2026-09-29
---

## 直觉

有了词向量，每段文字都变成了一个坐标点。那么「找出跟我的问题最像的文档」，就变成了「在空间里找出离我最近的几个点」。

问题在于规模。100 万个点，如果老老实实跟每一个都算一遍距离，一次查询就是 100 万次运算——慢到没法用。向量数据库存在的意义就是：**用一点点准确率，换几百倍的速度。**

一个类比：**图书馆的索引卡**。要在一百万本书里找「讲宋朝经济的」，你不会从第一本翻到最后一本，而是先按分类柜缩小范围，再在里面细找。向量数据库做的就是建这种「柜子」——只不过柜子是按「意思的相近程度」分的。

## 细节

**关键机制**

- **ANN（近似最近邻）**：放弃「保证找到最近的那个」，改成「大概率找到足够近的几个」。工程上完全够用，速度却是数量级的提升。
- **HNSW**：目前最主流的索引。把向量组织成一张多层图，上层稀疏用来快速跳转，下层密集用来精确定位——像先坐高铁到城市，再走路到门牌号。查询复杂度接近对数级。
- **IVF**：先用聚类把空间切成若干区域，查询时只搜最近的几个区域。省内存，但边界附近的点容易漏。
- **量化（PQ）**：把向量压缩存储，用少量精度换大幅内存下降。1000 万条 1536 维向量，原始存储要 60GB，量化后可能只要几 GB。

**选型时真正要看的东西**

| 关注点 | 说明 |
|---|---|
| 规模 | 几千条用不着数据库，NumPy 暴力算就行；上百万条才需要 ANN |
| 过滤 | 能不能「先按 user_id 过滤，再做向量检索」——很多场景的硬需求 |
| 更新 | 支持实时增删改，还是要全量重建索引 |
| 运维 | 是独立服务（Milvus/Qdrant），还是能嵌进进程（FAISS/Chroma/SQLite 扩展） |

**一个常被忽略的事实**：对大多数应用，**检索质量的上限由切分策略和向量模型决定，跟用哪个数据库关系不大**。先花时间调切分，再纠结选型。

**可运行代码**

先用 FAISS 感受一下 ANN 到底快多少：

```python
# pip install faiss-cpu numpy
import time
import numpy as np
import faiss

rng = np.random.default_rng(0)
d, n = 384, 200_000
base = rng.normal(size=(n, d)).astype("float32")
faiss.normalize_L2(base)
query = rng.normal(size=(1, d)).astype("float32")
faiss.normalize_L2(query)

# 暴力：跟每一条都比一遍
t0 = time.perf_counter()
flat = faiss.IndexFlatIP(d)
flat.add(base)
_, exact = flat.search(query, 1)
t_exact = time.perf_counter() - t0

# HNSW：近似，但快得多
t0 = time.perf_counter()
hnsw = faiss.IndexHNSWFlat(d, 32); hnsw.add(base); _, approx = hnsw.search(query, 1)
t_hnsw = time.perf_counter() - t0

print(f"暴力 {t_exact*1000:.1f} ms -> {exact[0][0]}")
print(f"HNSW {t_hnsw*1000:.1f} ms -> {approx[0][0]}   （结果一致: {exact[0][0] == approx[0][0]}）")
```

20 万条数据上，HNSW 通常比暴力快一到两个数量级，而返回的结果**几乎总是同一条**。这就是 ANN 划算的地方。
