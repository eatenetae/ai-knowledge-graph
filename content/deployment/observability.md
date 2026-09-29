---
id: observability
title: 可观测性
domain: deployment
summary: 把每次调用的输入、输出、耗时和花费都记下来，出问题时才查得动。
prerequisites:
  - llm-evaluation
  - latency-cost-tradeoff
related:
  - llm-as-judge
  - rag-failure-modes
  - inference-cost
tags:
  - 部署
  - 工程实践
  - 必读
sources:
  - title: OpenTelemetry - GenAI 语义约定
    url: https://opentelemetry.io/docs/specs/semconv/gen-ai/
  - title: OpenLLMetry（开源 LLM 可观测性方案）
    url: https://github.com/traceloop/openllmetry
updated_at: 2026-09-29
---

## 直觉

传统服务出问题，你能看日志、看堆栈。**LLM 应用出问题，你什么都没有。**

用户说「它昨天答得挺好的，今天不对了」。你去查——查什么？没有请求记录、没有当时的上下文、不知道用的哪个版本、不知道检索到了什么。**你只能猜。**

可观测性（observability）解决的就是这件事：**把每一次调用完整记录下来**，让「猜」变成「查」。

为什么 LLM 应用尤其需要它：**它的失败是概率性的、非确定性的。** 传统程序同一个输入永远同一个输出，能稳定复现；LLM 同一个输入可能这次对下次错，**不复现就没法调试**。你唯一能依赖的就是「把每一次都记下来」。

一个类比：**飞机的黑匣子**。飞机正常飞的时候，黑匣子看起来完全是浪费——占地方、增加成本、没人看。但出事的那一刻，**它是唯一能告诉你发生了什么的东西**。可观测性就是 LLM 应用的黑匣子。

## 细节

**关键机制**

- **必须记录的四类信息**：
  1. **请求与响应**：完整的输入（含系统提示词、检索内容、历史对话）和完整输出。**不要只记用户那句话**——问题往往出在拼装好的上下文里。
  2. **性能指标**：首 token 时间（TTFT）、总耗时、每 token 时间（TPOT）。见 `streaming-output`。
  3. **成本指标**：输入 / 输出 token 数、缓存命中情况、折算金额。**按用户、按功能、按版本分别统计**——不然你永远不知道钱花在哪。
  4. **中间步骤**：检索到了哪些块、重排后的排名、调用了哪些工具、工具返回了什么。**这是定位 `rag-failure-modes` 的唯一手段。**
- **一次调用应该是一条 Trace**：LLM 应用天然是分布式的——检索服务、向量库、模型 API、工具服务分散在几处。用 **OpenTelemetry** 的标准做法把一次用户请求串成一条 trace，每一段是一个 span：
  ```
  用户请求
   ├─ 检索 (120ms)
   │   ├─ 向量查询 (40ms)
   │   └─ 重排 (80ms)
   ├─ 模型调用 (2.1s, 3200 in / 180 out)
   └─ 工具调用 (340ms)
  ```
  OpenTelemetry 已经发布了 **GenAI 语义约定**，规定了这些字段的标准命名。**按标准来，将来换工具不用重做。**
- **采样策略**：全量记录很贵（尤其是长上下文）。常见做法：
  - **全量记录指标**（token 数、耗时）——便宜；
  - **按比例采样记录完整内容**（比如 10%）；
  - **错误和慢请求 100% 记录**——这些才是你要看的；
  - **用户反馈为负的请求 100% 记录**。
- **线上质量监控**：把 `llm-evaluation` 的评测集搬到线上。除了传统指标，还要盯：
  - **拒答率**突然上升（可能是提示词或安全策略变了）；
  - **输出长度分布**突然变化（可能是模型版本更新）；
  - **用户追问率 / 重试率**（用户不满意的最直接信号）；
  - **引用缺失率**（RAG 场景里，回答没有引用来源 = 可能在编，见 `hallucination`）。
- **把版本打进 trace**：**提示词版本、模型版本、检索配置版本**，三个都要记。否则你无法回答「昨天到今天改了什么」——而这恰恰是最常被问的问题。

**一条实践建议**

**先把「输入 + 输出 + token 数」记全，再谈高级分析。** 很多团队一上来就搭复杂的看板，结果最基础的原始记录都没存。等真出问题时，**能翻出三天前那次调用的完整上下文，比任何漂亮的图表都有用。**

**可运行代码**

```python
# 一个最小的 LLM 调用记录器：把一次调用记成一条结构化 trace
import json, time, uuid, anthropic
from datetime import datetime, timezone

client = anthropic.Anthropic()
TRACES = []          # 真实项目里写进日志系统或数据库

def traced_call(question: str, retrieved: list[str], prompt_version: str,
                model: str = "claude-sonnet-5") -> str:
    trace_id = str(uuid.uuid4())[:8]
    started = time.perf_counter()
    ttft = None

    context = "\n".join(f"[{i+1}] {d}" for i, d in enumerate(retrieved))
    prompt = f"只依据资料回答。\n\n资料：\n{context}\n\n问题：{question}"

    chunks = []
    with client.messages.stream(
        model=model, max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        for text in stream.text_stream:
            if ttft is None:
                ttft = time.perf_counter() - started
            chunks.append(text)
        usage = stream.get_final_message().usage

    TRACES.append({
        "trace_id": trace_id,
        "ts": datetime.now(timezone.utc).isoformat(),
        "prompt_version": prompt_version,      # 版本必须记，否则无法归因
        "model": model,
        "retrieved": retrieved,                # 检索到了什么，是排错的关键
        "input": prompt,
        "output": "".join(chunks),
        "ttft_ms": round((ttft or 0) * 1000),
        "total_ms": round((time.perf_counter() - started) * 1000),
        "usage": {"in": usage.input_tokens, "out": usage.output_tokens},
    })
    return TRACES[-1]["output"]

traced_call("退款要几天到账？", ["退款将在 3 个工作日内原路退回。"], "v3")
traced_call("可以退货吗？", ["生鲜类商品不支持七天无理由退货。"], "v3")

for t in TRACES:
    print(json.dumps({k: v for k, v in t.items() if k not in ("input", "output")},
                     ensure_ascii=False))
```

注意 `retrieved` 那个字段：**它是你在用户投诉时唯一能回答「到底是没检索到还是没用对」的依据**（见 `rag-failure-modes`）。不记它，你只能重跑一遍——而重跑的结果可能和当时完全不同。
