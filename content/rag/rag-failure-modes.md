---
id: rag-failure-modes
title: RAG 的失败模式
domain: rag
summary: 查资料答题出错时，先分清是「没找到」还是「找到了没用对」，这两件事的修法完全不同。
prerequisites:
  - rag
related:
  - reranking
  - chunking
  - hallucination
  - llm-evaluation
tags:
  - 应用开发
  - 排错
  - 必读
sources:
  - title: Seven Failure Points When Engineering a Retrieval Augmented Generation System (2024)
    url: https://arxiv.org/abs/2401.05856
  - title: Lost in the Middle - How Language Models Use Long Contexts (2023)
    url: https://arxiv.org/abs/2307.03172
  - title: Retrieval-Augmented Generation for Large Language Models - A Survey (2023)
    url: https://arxiv.org/abs/2312.10997
updated_at: 2026-09-29
---

## 直觉

RAG 系统上线后最常见的抱怨是同一句：**「它答得不对。」**

这句话没法直接修。因为「答得不对」至少有两种完全不同的原因，**修法正好相反**：

- **没找到**：正确的资料压根没被检索出来。这时候去改提示词、换更大的模型，全是白费力气——**模型手里根本没有那份资料。**
- **找到了没用对**：资料就在上下文里，模型却忽略了它、或者理解偏了。这时候去优化检索、换 embedding 模型，同样白费力气。

为什么这张卡片重要：**RAG 的调试，90% 的功夫花在「先分清是哪一类」。** 分错了，你会在错误的方向上优化好几周，而且每次改动都「好像有点效果又好像没有」。

一个类比：**开卷考试考砸了**。可能是书里根本没这一页（检索问题），也可能是书翻到了、学生没看仔细（生成问题）。**你得先看他的书翻在哪一页，才知道该补教材还是该补阅读方法。**

## 细节

**关键机制**

**第一步永远是同一个动作：把检索到的原文打印出来看。** 不要猜。把「用户问题 + 检索到的 top-k 块 + 模型最终回答」三条并排打日志，一眼就能分类。

| 症状 | 属于哪一类 | 真实原因 | 修法 |
|---|---|---|---|
| 正确文档不在 top-k 里 | **检索** | 切分太碎/太大；只做向量检索漏了精确匹配 | 调 `chunking`；加 BM25 混合检索；加 `reranking` |
| 正确文档在 top-k 里但排在第 8 位 | **检索** | 召回够但排序不准 | 加重排，取 top-3 而不是 top-10 |
| 正确文档在上下文里，模型却说「资料未提及」 | **生成** | 提示词没说清「必须依据资料回答」 | 明确指令 + 要求引用编号 |
| 正确文档在上下文里，模型答得含糊 | **生成** | 资料被淹没在中间（Lost in the Middle） | 把最相关的放开头或结尾，减少块数 |
| 资料里没有，模型自己编了 | **两者都不是** | 提示词没给「不知道」的退路 | 显式写「资料未提及时回答不知道」 |
| 同一问题两次答案不同 | **生成** | 采样随机性（见 `sampling-strategies`） | 事实型问答把温度调到 0 |
| 多轮对话后突然变差 | **上下文** | 历史对话挤占了资料的位置 | 做上下文压缩/裁剪（见 `context-engineering`） |

**三个最容易踩的坑**

1. **只做向量检索。** 用户搜「错误码 E1024」，向量检索会返回一堆「错误处理」相关但**不含这个码**的文档。**混合检索（向量 + 关键词）不是优化项，是必需品。**
2. **把最相关的块放在中间。** `Lost in the Middle` 的实验很清楚：模型对上下文**开头和结尾**的信息利用最好，中间的信息明显被忽略。所以拼接时把最相关的放两端。
3. **没有评估集。** 没有固定的「问题 → 正确资料 → 正确答案」样本，你无法判断一次改动是变好了还是碰巧。**先攒 50 条真实问题**，比任何调参都重要（见 `llm-evaluation`）。

**怎么建立定位能力**

把链路拆成三段分别度量，不要只看最终答案：

```
召回率（正确资料在不在 top-k 里）  →  重排后排名（在第几位）  →  答案忠实度（有没有依据资料）
```

- **召回率低** → 问题在切分或检索策略；
- **召回率高但最终答案差** → 问题在重排或提示词；
- **两者都高但用户仍不满意** → 问题可能在**问题本身**：用户的问法和文档的写法差太远，需要**查询改写（query rewriting）**。

**可运行代码**

```python
# 一个最小的 RAG 排错脚本：把「检索到了什么」和「模型说了什么」并排打出来
import numpy as np, anthropic
from sentence_transformers import SentenceTransformer

DOCS = [
    "退款将在审核通过后 3 个工作日内原路退回。",
    "生鲜类商品不支持七天无理由退货。",
    "错误码 E1024 表示支付网关超时，请重试。",
    "发票需在订单完成后 30 天内申请。",
]

model = SentenceTransformer("all-MiniLM-L6-v2")
dv = model.encode(DOCS, normalize_embeddings=True)
client = anthropic.Anthropic()

def debug(question, top_k=3):
    qv = model.encode([question], normalize_embeddings=True)[0]
    scores = qv @ dv.T
    hits = np.argsort(-scores)[:top_k]

    print(f"问题：{question}")
    print("检索结果：")
    for rank, i in enumerate(hits):
        print(f"  {rank+1}. [{scores[i]:.3f}] {DOCS[i]}")

    context = "\n".join(f"[{r+1}] {DOCS[i]}" for r, i in enumerate(hits))
    msg = client.messages.create(
        model="claude-sonnet-5", max_tokens=300, temperature=0,
        messages=[{"role": "user", "content":
            f"只依据资料回答，句末标注 [编号]。资料没有就说「资料未提及」。\n\n"
            f"资料：\n{context}\n\n问题：{question}"}],
    )
    print("模型回答：", msg.content[0].text, "\n")

debug("退款几天到账？")     # 检索正常 → 回答应引用 [1]
debug("E1024 是什么？")      # 向量检索很可能漏掉它 —— 这就是检索问题
```

跑第二个问题，你会亲眼看到**向量检索把「错误码 E1024」漏掉**——因为「E1024」这个字面串在向量空间里几乎没有信号。**看到这一幕，你就再也不会只做向量检索了。**
