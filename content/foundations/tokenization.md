---
id: tokenization
title: 分词
domain: foundations
summary: 把一句话切成模型能处理的小块，是文字进入模型前的第一道工序。
prerequisites: []
related: []
tags:
  - 入门
  - 基础
sources:
  - title: Neural Machine Translation of Rare Words with Subword Units (BPE, 2016)
    url: https://arxiv.org/abs/1508.07909
  - title: SentencePiece
    url: https://github.com/google/sentencepiece
updated_at: 2026-09-29
---

## 直觉

模型只会算数字，不认识汉字和字母。所以文字要先被切成一块块，每块换成一个编号——这个过程就是分词，切出来的每一块叫一个 **token**。

为什么不直接按字切、或者按词切？按字切，一句话会变得很长，模型要处理的序列变长，慢且容易断掉上下文；按词切，词表会爆炸（中文词组无穷无尽），而且遇到没见过的新词就抓瞎。

折中方案是**子词**：常见的词整块留着（`the`、`学习`），罕见词拆成更小的部件（`tokenization` → `token` + `ization`）。这样词表能控制在几万到十几万，又几乎不会遇到「完全不认识」的输入。

一个类比：像**乐高**。常用形状有整块的（一整面墙），不够用时就拿小砖拼。词表就是你的积木盒——形状有限，但能拼出任何东西。

## 细节

**关键机制**

- **BPE（Byte Pair Encoding）**：从单个字符出发，反复统计「哪两个相邻块最常一起出现」，把它们合并成新块。重复几万次，就得到词表。GPT 系列用的是它的字节版（BBPE），先把文本转成 UTF-8 字节，所以任何语言、甚至 emoji 和二进制都能编码，永远不会出现「未登录词」。
- **WordPiece**：BERT 用的方案，合并标准不是频率而是**似然增益**，罕见词用 `##` 前缀标记续接（`playing` → `play` + `##ing`）。
- **SentencePiece**：把空格也当成普通字符处理，不依赖语言的分词规则，中英日韩一视同仁。

**为什么应用开发者要关心**

- **计费按 token 算**，不按字数。中文一个字常常是 1 个 token，英文一个词可能被拆成 2-3 个。
- **上下文窗口的单位是 token**。同样长度的中英文，占用的 token 数不同。
- **模型的「拼写能力」有上限**。因为词被拆成子词，模型看到 `strawberry` 可能是 `straw` + `berry`，数某个字母出现几次这类任务就容易出错——这不是模型笨，是它压根没按字母看。

**可运行代码**

```python
# pip install tiktoken
import tiktoken

enc = tiktoken.get_encoding("cl100k_base")   # GPT-3.5/4 用的词表
for text in ["Hello world", "机器学习", "tokenization", "🦄"]:
    ids = enc.encode(text)
    print(f"{text!r:20} -> {len(ids)} 个 token: {ids}")
    print(f"{'':20}    还原: {[enc.decode([i]) for i in ids]}")

# 一个反直觉的例子：同一个词，加个空格 token 数就变了
print(len(enc.encode("hello")))    # 1
print(len(enc.encode(" hello")))   # 1，但 id 不同 —— 空格是粘在前面的
```

跑一遍你会发现：`机器学习` 是 2 个 token，`🦄` 要 3 个。**估算成本时别用字数，用 token 数。**
