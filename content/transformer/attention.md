---
id: attention
title: 注意力机制
domain: transformer
pm: useful
summary: 处理每个词时，先看一眼句子里其他词，决定该重点参考谁。
prerequisites:
  - embedding
related: []
tags:
  - 核心机制
  - 必读
sources:
  - title: Attention Is All You Need (2017)
    url: https://arxiv.org/abs/1706.03762
  - title: Neural Machine Translation by Jointly Learning to Align and Translate (2015)
    url: https://arxiv.org/abs/1409.0473
updated_at: 2026-09-29
---

## 直觉

考虑这句话：「小明把书递给了小红，因为她需要它。」

「她」指的是谁？「它」又是什么？要理解这句话，你在读到「她」的时候，**不自觉地回头扫了一遍前面的词**，然后把注意力落在「小红」上。

注意力机制做的就是这件事：处理每个词的时候，让它先去问一遍句子里所有其他词——「你和我有多相关？」——然后按相关程度把大家的信息加权揉进自己身上。

为什么重要：在它之前，模型只能从左到右一个一个读，读到后面时前面的信息已经被压缩成一团模糊的记忆了。注意力让每个词都能**直接看到**任何距离外的词，一步到位。长句子的理解能力因此大幅提升。

一个类比：**开会点名**。以前是「传话游戏」，消息从第一个人依次传到最后一个，传到最后早变形了。注意力是**每个人都能直接向全场提问**，谁的答案相关就多听谁的。

## 细节

**关键机制**

- 每个词生成三个向量：**Query（我在找什么）**、**Key（我是什么）**、**Value（我有什么内容）**。
- 计算分三步：
  1. `Q · Kᵀ` —— 每个 Query 和所有 Key 做点积，得到一张「相关度打分表」；
  2. 除以 `√d` 再 softmax —— 缩放是为了防止维度高时点积过大、softmax 之后梯度消失；softmax 把分数变成加起来为 1 的权重；
  3. 权重 × Value 求和 —— 相关度高的词，它的内容就更多地混进来。
- **多头注意力**：并行跑好几套 Q/K/V，每套关注不同的关系——有的头盯语法主谓，有的头盯指代，有的头盯位置邻近。最后拼接起来。
- **因果掩码**：生成式模型里，每个位置只能看到自己左边的词（否则就是抄答案）。做法是把右上角的分数设成负无穷，softmax 之后权重为 0。

**代价**

注意力要对每一对词算一次分，复杂度是序列长度的平方。上下文翻倍，计算量翻四倍——这是长上下文昂贵的根本原因，也是 FlashAttention 这类工作的动机。

**可运行代码**

```python
import numpy as np

def softmax(x, axis=-1):
    e = np.exp(x - x.max(axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

def self_attention(X, Wq, Wk, Wv, causal=True):
    Q, K, V = X @ Wq, X @ Wk, X @ Wv
    scores = Q @ K.T / np.sqrt(Q.shape[-1])
    if causal:                                  # 只能看自己和左边
        mask = np.triu(np.ones_like(scores), k=1).astype(bool)
        scores = np.where(mask, -np.inf, scores)
    weights = softmax(scores)
    return weights @ V, weights

rng = np.random.default_rng(0)
X = rng.normal(size=(4, 8))                     # 4 个 token，每个 8 维
Wq, Wk, Wv = (rng.normal(size=(8, 8)) for _ in range(3))

out, weights = self_attention(X, Wq, Wk, Wv)
print(np.round(weights, 2))     # 下三角矩阵：每个 token 只对左边（含自己）有权重
```

把 `causal=False` 打开，矩阵会变成全满——那就是 BERT 这类「能看两边」的模型用的双向注意力。
