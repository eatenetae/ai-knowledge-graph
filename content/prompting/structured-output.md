---
id: structured-output
title: 结构化输出
domain: prompting
pm: core
summary: 让模型按固定格式（比如一张表格）回答，程序才接得住它的结果。
prerequisites:
  - prompt-engineering
related:
  - tool-use
  - llm-as-judge
  - chain-of-thought
tags:
  - 应用开发
  - 实用技巧
sources:
  - title: JSON Schema 官方网站
    url: https://json-schema.org/
  - title: Efficient Guided Generation for Large Language Models (Outlines, 2023)
    url: https://arxiv.org/abs/2307.09702
updated_at: 2026-09-29
---

## 直觉

模型输出的是**一段文字**。而你的程序需要的是**一个能直接用的数据**。

「用户想要退款，情绪比较激动，涉及订单号 A123」——这句话人读得懂，但代码读不懂。你没法可靠地用正则去抠出「情绪」和「订单号」。**只要模型换个说法，你的解析就崩。**

结构化输出（structured output）解决这件事：**要求模型按事先约定好的格式回答**，比如一段 JSON、一张固定列的表格。这样输出就从「给人读的段落」变成了「给程序读的数据」。

为什么这是 LLM 应用工程化最基础的一步：**它是「模型」和「业务逻辑」之间的接口。** 没有这个接口，你的系统只能做聊天框；有了它，模型才能变成流程里的一环——分类、抽取、路由、决策。

一个类比：**点菜要用点菜单，不能口头描述。** 客人说「随便来个清淡点的、不要香菜、微辣」——服务员能听懂，但厨房的流水线接不住。填进点菜单（菜品编号、辣度、忌口），后厨才能自动化处理。**格式不是限制，格式是接口。**

## 细节

**关键机制**

- **三个层次的做法，可靠性递增**：
  1. **提示词里写要求**：「请以 JSON 输出，包含 `intent` 和 `order_id` 两个字段。」——最省事，但**没有任何保证**，模型可能加上解释性文字、用 markdown 代码块包起来、或者漏字段。
  2. **约束解码（constrained decoding）**：在生成时**直接禁止非法 token**。如果下一个位置按语法必须是 `"`，那模型在引号外的所有候选词概率都被置零。这是**从机制上保证**格式正确，而不是靠模型自觉。Outlines、XGrammar 这类库做的就是这件事。
  3. **API 原生支持**：主流厂商现在都提供 `response_format` / `strict` 模式，内部就是约束解码。**能用就用它**，别自己写解析。
- **Schema 越严越好**：把字段定义成枚举（`"intent": {"enum": ["退款", "咨询", "投诉"]}`）而不是自由字符串。**约束越紧，模型越不容易自由发挥**——这既是可靠性，也是安全性（见 `prompt-injection`）。
- **字段顺序影响效果**：让模型**先写推理、再写结论字段**。因为它是逐字生成的，先写结论等于让它没想就答（见 `chain-of-thought`）。常见做法是加一个 `reasoning` 字段放在最前面。
- **仍然必须校验**：约束解码保证的是**语法**合法，不是**语义**正确。模型完全可能吐出一个格式完美、但 `order_id` 是编造的 JSON。**永远在服务端再校验一遍**，尤其是要写库、要发起支付的字段。

**和工具调用的关系**

结构化输出和 `tool-use` 是同一套底层能力的两面：工具调用本质就是「让模型输出一个符合工具参数 schema 的结构化对象」。所以**工具描述写得越清楚、参数 schema 定得越严，工具选错和传错参的概率就越低**。

**可运行代码**

```python
# pip install anthropic pydantic
import json, anthropic
from pydantic import BaseModel, Field
from typing import Literal

class Ticket(BaseModel):
    reasoning: str = Field(description="先写判断依据，再给结论")
    intent: Literal["退款", "咨询", "投诉"]      # 枚举：不给自由发挥的空间
    order_id: str | None = Field(default=None, description="没提到就填 null")
    urgent: bool

client = anthropic.Anthropic()

def parse_ticket(text: str) -> Ticket:
    resp = client.messages.create(
        model="claude-sonnet-5", max_tokens=500,
        messages=[{"role": "user", "content": f"从客服对话里抽取工单信息：\n{text}"}],
        tools=[{
            "name": "emit_ticket",
            "description": "输出结构化的工单信息",
            "input_schema": Ticket.model_json_schema(),   # schema 直接由类型生成
        }],
        tool_choices=[{"type": "tool", "name": "emit_ticket"}],   # 强制走这个工具
    )
    for block in resp.content:
        if block.type == "tool_use":
            return Ticket(**block.input)          # 解析后仍然要校验

t = parse_ticket("订单 A123 都三天了还没退款，太离谱了")
print(t.intent, t.order_id, t.urgent)   # 退款 A123 True
```

注意 `reasoning` 排在第一位——**模型会先写它，再写结论**。这一个字段顺序的调整，比在提示词里加十句「请认真思考」都管用。
