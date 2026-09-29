---
id: context-window
title: 上下文窗口
domain: transformer
summary: 模型一次能「同时看见」的文字总量，超出部分它就真的看不到了。
prerequisites:
  - transformer
related: []
tags:
  - 工程实践
  - 必读
sources:
  - title: Lost in the Middle - How Language Models Use Long Contexts (2023)
    url: https://arxiv.org/abs/2307.03172
  - title: RoFormer - Rotary Position Embedding (RoPE)
    url: https://arxiv.org/abs/2104.09864
updated_at: 2026-09-29
---

## 直觉

模型没有记忆。它每次回答问题时，只能看到你**这一次**递给它的全部文字——包括你的问题、你贴的文档、之前的对话记录。这个「一次能看多少」的上限，就是上下文窗口。

超出窗口的内容不是「记不太清」，而是**根本不存在**。就像一张桌子，只能摊开这么多纸；再往上放，旧的就被挤下去了。

为什么应用开发者必须记住它：**多轮对话会不断变长**。聊到第 50 轮时，最早那几轮可能已经被挤出窗口，模型「忘记」了你说过的要求。这时候需要的是主动总结或检索，而不是反复提醒它「我不是说过了吗」。

一个类比：**白板**。你可以在上面写满推理过程，写得越满，模型能参考的越多；但白板就那么大，写满了要擦掉旧的才能写新的。

## 细节

**关键机制**

- 窗口的单位是 **token**，不是字数。中文一个字通常 1 个 token，英文一个词可能 2-3 个。
- 窗口被三部分瓜分：**系统提示 + 对话历史 + 本次输入**，还要给**输出**留位置。所以「128K 窗口」实际能塞的输入远少于 128K。
- **位置编码决定外推能力**。原始正弦编码超出训练长度就崩；RoPE 加上插值/缩放后可以外推，但**外推不等于等效**——在 100K 处找一条信息，准确率通常明显低于在 5K 处找同一条。

**两个反直觉的坑**

1. **中间迷失**：把关键信息放在超长上下文的**开头或结尾**，模型找得到；放在**正中间**，准确率会明显掉。这是 `Lost in the Middle` 那篇论文的核心发现。所以 RAG 拼上下文时，最相关的片段应该放两头，别埋中间。
2. **塞满不等于更好**。无关内容会稀释注意力，还可能引入矛盾信息。**精准检索 3 段 > 粗暴塞 30 段。**

**成本视角**

注意力的计算量随长度平方增长，所以长上下文不仅更慢，还更贵。很多团队的做法是：能用检索解决的就别用长窗口硬塞。

**可运行代码**

```python
# 用 tiktoken 预估一段上下文占多少 token，避免运行时才发现超限
import tiktoken

enc = tiktoken.get_encoding("cl100k_base")

def budget(system, history, question, max_output=1024, window=128_000):
    used = sum(len(enc.encode(t)) for t in [system, *history, question])
    left = window - used - max_output
    print(f"已用 {used} token，为输出预留 {max_output}，剩余可再塞 {left} token")
    return left

system = "你是一个严谨的技术助手。"
history = ["什么是注意力？", "注意力是……", "那多头呢？", "多头是……"]
print(budget(system, history, "再讲讲位置编码"))
```

**工程上的应对**：接近窗口时，把早期对话压缩成摘要；或者把历史存进向量库，每轮按需检索相关片段回填——后者就是 `rag` 卡片讲的东西。
