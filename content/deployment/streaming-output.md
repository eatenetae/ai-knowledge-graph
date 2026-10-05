---
id: streaming-output
title: 流式输出
domain: deployment
pm: useful
summary: 模型每写一个字就立刻发给用户，而不是等整段写完再一次性显示。
prerequisites:
  - autoregressive-generation
related:
  - latency-cost-tradeoff
  - observability
  - context-engineering
tags:
  - 部署
  - 体验
sources:
  - title: Anthropic 文档：流式响应（Streaming Messages）
    url: https://docs.anthropic.com/en/docs/build-with-claude/streaming
  - title: MDN - Server-Sent Events
    url: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
updated_at: 2026-09-29
---

## 直觉

模型生成一段 500 字的回答要 15 秒。如果等它全部写完再显示，用户就要**盯着空白屏幕 15 秒**——大概率会以为页面卡了，然后刷新。

但模型本来就是**一个字一个字生成的**（见 `autoregressive-generation`）。那为什么不等第一个字出来就立刻显示？

流式输出（streaming output）做的就是这件事：**生成一个 token，推一个 token。** 用户 0.5 秒就看到开头，然后文字像打字机一样往外冒。

**总耗时没有变短，但体感完全不同。** 这是投入产出比最高的一个体验优化——它不减少任何计算，只是改变了「什么时候把结果给用户看」。

一个类比：**餐厅上菜**。等所有菜都做好再一起端上来，客人要饿着等 40 分钟；先上面包和凉菜，客人立刻有事可做，后面的菜慢慢上也不觉得久。**同样的厨房，同样的总时间，体验差出十倍。**

## 细节

**关键机制**

- **两个必须分开看的指标**：
  - **TTFT（Time To First Token，首 token 时间）**：从发请求到看到第一个字。**流式输出优化的就是它**——用户感知到的「快慢」主要由它决定。
  - **TPOT（Time Per Output Token，每 token 时间）**：生成后续每个字的速度。它决定文字「冒」得顺不顺。
  - 一个 TTFT 很差但 TPOT 很好的模型，用流式会感觉「等一下然后哗哗地出」；反过来则是「很快就出字但一个字一个字磨」。**两种体验都不好，要同时看。**
- **技术形态**：
  - **SSE（Server-Sent Events）**：最简单，单向推送，基于普通 HTTP。**LLM 流式的默认选择**，浏览器原生支持 `EventSource`。
  - **WebSocket**：双向，适合需要中途打断、双向交互的场景。比 SSE 重。
  - **不要用轮询**：每次轮询都建立新连接，开销大且延迟高。
- **流式带来的三个新问题**：
  1. **错误处理变复杂**。请求返回 200 不代表成功——错误可能在**流的中途**才发生。必须处理「已经显示了 200 字，然后连接断了」这种情况。**对策：保留已生成的内容并给出重试入口，不要清空重来。**
  2. **不能事后校验再显示**。非流式时你可以先校验格式（`structured-output`），确认合法再给用户。流式时内容已经在屏幕上了。**对策：需要严格格式的场景（JSON、代码）用非流式，或者只对结果做增量解析而不是等完整。**
  3. **无法重试**。非流式失败了可以悄悄重发一次；流式已经吐了一半，重发会让用户看到重复内容。
- **流式和结构化输出可以兼得**：不要等整个 JSON 解析完，而是**增量解析**——边收边解析已经完整的字段。这样用户能立刻看到 `reasoning` 字段的内容，而结论字段稍后补上。
- **别忘了最后一帧**：流结束时通常还有一个包含 **token 用量**的收尾事件。**一定要读它并记下来**——这是你做成本核算和可观测性的唯一数据来源（见 `observability`）。

**什么时候不该用流式**

- 输出很短（一句话的标签、一个分类结果）：流式反而增加复杂度，用户也感觉不到差别。
- 需要**先校验再展示**的场景：结构化抽取、要写库的字段、代码补丁。

**可运行代码**

```python
# 流式输出 + 首 token 计时 + 用量统计
import time, anthropic

client = anthropic.Anthropic()

def stream_answer(question: str) -> str:
    start = time.perf_counter()
    ttft = None
    chunks = []
    usage = None

    with client.messages.stream(
        model="claude-sonnet-5", max_tokens=500,
        messages=[{"role": "user", "content": question}],
    ) as stream:
        for text in stream.text_stream:
            if ttft is None:
                ttft = time.perf_counter() - start      # 首 token 时间
            chunks.append(text)
            print(text, end="", flush=True)             # 边收边显示

        final = stream.get_final_message()
        usage = final.usage                             # 收尾事件里的用量

    total = time.perf_counter() - start
    answer = "".join(chunks)
    n_out = len(chunks)

    print(f"\n\n--- 指标 ---")
    print(f"首 token 时间 (TTFT): {ttft:.2f}s")
    print(f"总耗时: {total:.2f}s")
    if n_out > 1:
        print(f"每 token 时间 (TPOT): {(total - ttft) / (n_out - 1) * 1000:.1f}ms")
    print(f"用量: 输入 {usage.input_tokens} / 输出 {usage.output_tokens} token")

    return answer

stream_answer("用三句话解释什么是 RAG。")
```

跑这段时注意：**总耗时可能和不用流式差不多，但你在 0.5 秒内就看到了第一个字。** 这就是流式输出的全部价值——**它不改变速度，它改变等待的形态。**
