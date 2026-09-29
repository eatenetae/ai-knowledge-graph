---
id: ai-agent
title: 智能体
domain: agents
summary: 让模型自己决定下一步做什么，做完看结果，再决定下一步，直到任务完成。
prerequisites:
  - prompt-engineering
  - llm-pretraining
related: []
tags:
  - 应用开发
  - 必读
sources:
  - title: ReAct - Synergizing Reasoning and Acting in Language Models (2022)
    url: https://arxiv.org/abs/2210.03629
  - title: Building Effective Agents (Anthropic)
    url: https://www.anthropic.com/engineering/building-effective-agents
updated_at: 2026-09-29
---

## 直觉

普通的模型调用是**一问一答**：你问，它答，结束。它没法查资料、没法算数、没法改文件——只能凭脑子里有的东西说。

智能体把这条线拉成了一个**循环**：模型不只是回答问题，它还能**说出下一步要做什么动作**；系统执行这个动作，把结果喂回去；模型看到结果，再决定下一步。如此往复，直到它认为任务完成。

```
想 → 做 → 看结果 → 再想 → 再做 → …… → 完成
```

为什么这是质变：模型从「只能说的东西」变成了「能动手的东西」。它可以先搜索、发现信息不够、换个关键词再搜、拿到数据后写代码算一遍、最后给出结论——中间每一步都是它自己决定的。

一个类比：**实习生 vs 顾问**。顾问只能给你一份报告，剩下的你自己做。实习生可以自己去查、去跑、去问，做完把结果放你桌上。智能体就是把模型从顾问变成了实习生。

## 细节

**核心循环（ReAct 模式）**

1. **思考**：我现在缺什么信息？
2. **行动**：调用一个工具（搜索 / 查数据库 / 执行代码）
3. **观察**：拿到工具返回的结果
4. 回到第 1 步，直到模型输出最终答案

关键在于**推理和行动交替**：让模型把「为什么调这个工具」说出来，它下一步的行动质量会明显提高——这和 `prompt-engineering` 里的思维链是同一个道理。

**工程上真正难的地方**

- **工具设计比模型选择更重要**。工具名和描述就是模型的「说明书」。`search_docs(query)` 和 `find_relevant_company_documentation_by_semantic_search(query)` 相比，前者更容易被正确调用。**描述里写清楚什么时候用、什么时候不要用。**
- **错误处理**：工具会失败。把错误信息原样返回给模型，它通常能自己改参数重试——**别把异常直接抛给用户**。
- **循环上限**：模型可能陷入「搜索 → 没找到 → 再搜索」的死循环。必须有最大步数，超了就返回当前最好的结果并说明。
- **上下文膨胀**：每一步的观察结果都会进上下文，几轮之后窗口就满了。需要截断或摘要。
- **成本**：一次任务可能触发十几次模型调用，成本是单次问答的十几倍。**能用固定流程解决的，别用智能体。**

**什么时候该用智能体**

| 场景 | 选择 |
|---|---|
| 步骤固定、可预先写死 | 普通工作流（便宜、可控、快） |
| 步骤数量不确定、需要根据中间结果决策 | 智能体 |
| 只是要查资料后回答 | `rag` 就够了 |

Anthropic 那篇《Building Effective Agents》的核心建议就是：**先用最简单的方法，只有在确实需要动态决策时才升级到智能体。**

**可运行代码**

一个手写的 ReAct 循环，看清智能体到底是怎么转起来的：

```python
import json, anthropic

client = anthropic.Anthropic()
TOOLS = [{
    "name": "get_weather",
    "description": "查询指定城市的当前天气。仅在用户明确询问天气时使用。",
    "input_schema": {
        "type": "object",
        "properties": {"city": {"type": "string", "description": "城市名，如 北京"}},
        "required": ["city"],
    },
}]

def get_weather(city):                       # 真实系统里这里会调外部 API
    return json.dumps({"city": city, "temp_c": 21, "condition": "晴"})

def run(question, max_steps=5):
    messages = [{"role": "user", "content": question}]
    for step in range(max_steps):
        resp = client.messages.create(
            model="claude-sonnet-5", max_tokens=500,
            tools=TOOLS, messages=messages,
        )
        messages.append({"role": "assistant", "content": resp.content})

        if resp.stop_reason != "tool_use":       # 模型不再调工具 = 给出最终答案
            return "".join(b.text for b in resp.content if b.type == "text")

        results = []
        for block in resp.content:
            if block.type == "tool_use":
                print(f"  [step {step}] 调用 {block.name}({block.input})")
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": get_weather(**block.input),
                })
        messages.append({"role": "user", "content": results})

    return "已达到最大步数，任务未完成。"

print(run("北京现在天气怎么样？"))
```

`max_steps` 那一行不是可选项——**没有循环上限的智能体，就是一台会自己烧钱的机器。**
