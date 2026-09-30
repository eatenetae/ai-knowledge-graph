---
id: chunking
title: 文本切分
domain: retrieval
summary: 把长文档剪成一小块一小块，检索时才能精准地只取出相关的那一段。
prerequisites:
  - tokenization
related:
  - rag
  - rag-failure-modes
  - semantic-search
tags:
  - 应用开发
  - 必读
sources:
  - title: Dense Passage Retrieval for Open-Domain Question Answering (DPR, 2020)
    url: https://arxiv.org/abs/2004.04906
  - title: Dense X Retrieval - What Retrieval Granularity Should We Use? (2023)
    url: https://arxiv.org/abs/2312.06648
updated_at: 2026-09-29
---

## 直觉

一份 80 页的产品手册，用户只问其中一个小功能怎么用。你要把**整本手册**都塞给模型吗？

不行。原因有三个：一是贵，二是长上下文里模型会「中间迷失」（见 `rag-failure-modes`），三是**检索的根本目的是「只给相关的」**——如果每次都全给，那就不叫检索了。

所以必须先**把文档剪成小块**。每个小块单独变成一串数字存起来（见 `embedding`），用户提问时只把最像的几个小块取出来。

为什么这一步值得单独讲：**切分是 RAG 里最容易被忽视、又最容易毁掉效果的一环。** 切得太碎，一句完整的话被拦腰截断，模型拿到半句话；切得太大，一个块里混了五个主题，检索时「像」的程度被稀释，而且浪费上下文预算。**很多人调不动 RAG 的效果，根因就在切分。**

一个类比：**把一本没有目录的书拆成卡片**。每张卡片写一个完整的知识点。卡片太大，你翻到它还得自己找重点；卡片太小，一句话被拆成两张，读哪张都不完整。**好的卡片是「一个自洽的小单元」。**

## 细节

**关键机制**

- **切分粒度（chunk size）**：常见 200-800 token。**没有通用最优值**，取决于你的文档类型和问题类型：
  - 事实型问答（「退款要几天」）→ 小块更准（200-400）；
  - 需要上下文的问答（「这个方案为什么被否了」）→ 大块更完整（600-1000）。
- **重叠（overlap）**：相邻块之间保留 10%-20% 的重叠。目的是**避免答案正好卡在切割线上**——重叠之后，无论答案落在哪，总有一块完整包含它。代价是存储和检索成本上升。
- **切分策略，从差到好**：
  1. **固定长度切**：每 500 个字符一刀。最省事，也最容易把句子切断。
  2. **按结构切**：按 Markdown 标题、段落、代码块切。**绝大多数场景下这是性价比最高的做法**——文档本身的结构就是作者给的语义边界。
  3. **语义切分**：算相邻句子的向量相似度，在「意思发生转折」的地方下刀。效果最好，也最慢最贵。
- **小块检索、大块喂给模型（small-to-big）**：用一个巧妙的折中——**用小块建索引**（保证检索精准），但**取回它所在的大块或整节**喂给模型（保证上下文完整）。这是生产系统里最常见的做法。
- **别忘了元数据**：每个块要带上来源文件、章节标题、页码、更新时间。检索时可以先按元数据过滤（「只在 2025 年后的版本里找」），回答时才能给出可核对的引用。

**一个具体的坑**

**表格和代码不要按字数切。** 一张 10 行的表格被切成两半，两半都失去意义。正确做法是**整表作为一个块**，如果超过大小上限，就按行切并在每块里重复表头。

**可运行代码**

```python
# 一个按结构切分 + 重叠的最小实现（不依赖任何框架）
import re

def chunk_by_structure(text, max_chars=400, overlap=60):
    # 先按 Markdown 标题切，保住文档自身的语义边界
    sections = re.split(r"\n(?=#{1,6}\s)", text)
    chunks = []
    for sec in sections:
        sec = sec.strip()
        if not sec:
            continue
        if len(sec) <= max_chars:
            chunks.append(sec)
            continue
        # 超长小节再按段落切，带重叠
        start = 0
        while start < len(sec):
            end = start + max_chars
            piece = sec[start:end]
            chunks.append(piece)
            if end >= len(sec):
                break
            start = end - overlap      # 回退一段，避免答案卡在切割线上
    return chunks

doc = """# 退款政策
退款将在审核通过后 3 个工作日内原路退回。

## 生鲜例外
生鲜类商品不支持七天无理由退货，质量问题需在签收后 24 小时内提交照片。

## 发票
发票需在订单完成后 30 天内申请，逾期不再补开。
"""

for i, c in enumerate(chunk_by_structure(doc)):
    print(f"--- chunk {i} ({len(c)} 字) ---")
    print(c[:60].replace("\n", " ") + ("..." if len(c) > 60 else ""))
```

注意每个块都**自带小节标题**——这一行标题在检索时是极强的信号。**切分时保留标题，是投入产出比最高的一个小技巧。**
