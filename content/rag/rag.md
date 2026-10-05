---
id: rag
title: RAG（检索增强生成）
domain: rag
pm: core
summary: 回答前先去你的资料里查一遍，把查到的内容连同问题一起交给模型。
prerequisites:
  - semantic-search
  - prompt-engineering
related:
  - ai-agent
  - llm-evaluation
tags:
  - 应用开发
  - 必读
sources:
  - title: Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (2020)
    url: https://arxiv.org/abs/2005.11401
  - title: Lost in the Middle - How Language Models Use Long Contexts (2023)
    url: https://arxiv.org/abs/2307.03172
updated_at: 2026-09-29
---

## 直觉

模型有两个硬伤：**知识有截止日期**，而且**不知道自己不知道**——所以它会编。

RAG 的思路非常直白：**别指望模型记得，回答前先帮它查。** 用户问「我们产品的退款政策是什么」，系统先去公司文档库里检索出相关段落，再把「问题 + 这几段资料」一起交给模型，让它**基于资料**回答。

这样一来：知识更新只需更新文档库，不用重训模型；答案有出处，可以附引用让用户自己核对；模型没查到就说没查到，编造的空间被大幅压缩。

一个类比：**开卷考试**。闭卷时学生只能靠记忆，记错了也照样写。开卷时他可以先翻书再作答——不是他变聪明了，是他手边有了正确的材料。

## 细节

**完整链路**

```
离线：文档 → 切分 → 向量化 → 存入向量库
在线：问题 → （可选）改写 → 检索 → 重排 → 拼进提示词 → 生成 → 附引用
```

**每一环的常见坑**

| 环节 | 典型问题 | 应对 |
|---|---|---|
| 切分 | 切得太碎，一句完整的话被截断 | 按语义/标题切，块间留重叠 |
| 检索 | 只做向量检索，漏掉订单号等精确匹配 | 混合检索（BM25 + 向量 + RRF） |
| 重排 | 召回了 50 条，最相关的排在第 30 位 | 加一个 cross-encoder 重排模型 |
| 拼装 | 把最相关的塞在正中间 | 重要的放开头和结尾（`Lost in the Middle`） |
| 生成 | 资料里没有，模型自己补 | 明确指令「资料未提及时回答不知道」 |

**RAG 还是微调？**

- 要**新知识**（政策、文档、实时数据）→ RAG。改一次文档就生效，不用训练。
- 要**新行为**（固定语气、特定输出格式、领域黑话）→ 微调。
- 两者不冲突，成熟系统常常是「微调过的小模型 + RAG」。

**评估不能少**

RAG 的失败要分开定位：是**没检索到**（检索问题），还是**检索到了但没用对**（生成问题）？这两类问题的修法完全不同。`llm-evaluation` 卡片会讲怎么把它们拆开度量。

**可运行代码**

一个最小可用的 RAG（内存向量库 + 强制引用）：

```python
# pip install anthropic sentence-transformers numpy
import numpy as np, anthropic
from sentence_transformers import SentenceTransformer

DOCS = [
    "退款将在审核通过后 3 个工作日内原路退回。",
    "生鲜类商品不支持七天无理由退货。",
    "发票需在订单完成后 30 天内申请。",
]

model = SentenceTransformer("all-MiniLM-L6-v2")
doc_vecs = model.encode(DOCS, normalize_embeddings=True)
client = anthropic.Anthropic()

def answer(question, top_k=2):
    q = model.encode([question], normalize_embeddings=True)[0]
    hits = np.argsort(-(q @ doc_vecs.T))[:top_k]
    context = "\n".join(f"[{i+1}] {DOCS[i]}" for i in hits)

    prompt = f"""只依据下面的资料回答问题，并在句末用 [编号] 标注依据。
如果资料里没有答案，就回答「资料未提及」，不要自己推测。

资料：
{context}

问题：{question}"""

    msg = client.messages.create(
        model="claude-sonnet-5", max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text

print(answer("退款要多久到账？"))     # 引用 [1]
print(answer("可以退货吗？"))          # 引用 [2]，并说明生鲜例外
print(answer("支持花呗分期吗？"))      # 资料未提及
```

最后一句是关键：**没有资料时它应该承认不知道**。如果你的 RAG 在这里开始编，问题不在模型，在提示词没给退路。
