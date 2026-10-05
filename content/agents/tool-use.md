---
id: tool-use
title: 工具调用
domain: agents
pm: core
summary: 让模型不只会说话，还能真的去查、去算、去改，把活干完。
prerequisites:
  - ai-agent
related:
  - prompt-injection
tags:
  - 应用开发
  - 工程实践
sources:
  - title: Toolformer - Language Models Can Teach Themselves to Use Tools (2023)
    url: https://arxiv.org/abs/2302.04761
  - title: Tool use with Claude (Anthropic Docs)
    url: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
updated_at: 2026-09-29
---

## 直觉

模型本身只会一件事：生成文字。它不能查天气、不能读你的数据库、不能算 3847 × 2913——**它只会把看起来最像答案的文字写出来**，包括算错的时候。

工具调用补上了这一环：**让模型输出一段结构化的「我要调用某个函数，参数是这些」，由你的程序去真正执行，再把结果还给模型。**

模型从此有了手。算数交给计算器，实时信息交给搜索 API，业务数据交给你的内部接口。模型负责**判断该用什么**和**读懂结果**，真正干活的还是传统程序——这个分工是它能可靠落地的前提。

一个类比：**指挥中心**。指挥官不下场搬箱子，他只下命令「三号仓库调 200 箱」；执行结果回报上来，他再决定下一步。指挥官的强项是判断，不是体力。

## 细节

**工作机制**

1. 你把可用工具的清单（名字、说明、参数结构）随请求一起发给模型；
2. 模型判断需要工具时，返回一个**结构化的调用请求**，而不是普通文本；
3. 你的代码执行这个函数，把结果按约定格式回传；
4. 模型基于结果继续，或再调下一个工具。

模型**从不自己执行任何东西**。它只产生「调用意图」——这一点决定了安全边界在哪里（见 `prompt-injection`）。

**工具设计的经验**

- **名字要动词开头、语义单一**：`search_orders` 好过 `query`。
- **描述是给模型看的文档**，必须写清「什么时候用」和「什么时候不要用」。模型选错工具，九成是描述没写清。
- **参数宁少勿多**，必填项越少越不容易出错。
- **返回结果要精简**。把整个数据库行丢回去，既贵又会淹没重点——只返回模型需要的字段。
- **错误要可读**。「参数 user_id 格式不对，应为 8 位数字」能让模型自己改对；「500 Internal Error」只会让它重试同一个错误。

**幂等性是安全底线**

写操作（下单、发邮件、删记录）必须幂等或需要确认。模型重试是常态，**没有幂等键的写接口，迟早会重复下单**。

**可运行代码**

```python
import json

# 工具定义：注意 description 里明确写了「什么时候用 / 不用」
TOOLS = [{
    "name": "calculate",
    "description": "计算一个数学表达式并返回精确结果。"
                   "任何涉及数字运算的问题都必须用它，不要自己心算。",
    "input_schema": {
        "type": "object",
        "properties": {
            "expression": {"type": "string", "description": "Python 数学表达式，如 (3847*2913)"}
        },
        "required": ["expression"],
    },
}]

def calculate(expression: str) -> str:
    # 只允许数字和运算符 —— 绝不直接 eval 用户可控的字符串
    allowed = set("0123456789+-*/(). ")
    if not set(expression) <= allowed:
        return json.dumps({"error": f"表达式含不允许的字符，只支持数字与 +-*/()"})
    try:
        return json.dumps({"result": eval(expression, {"__builtins__": {}}, {})})
    except Exception as exc:
        return json.dumps({"error": f"计算失败：{exc}"})
```

`allowed` 那一行是必须的：**模型生成的参数是不可信输入**，和用户输入同级。把 `eval` 直接暴露给它，等于把服务器交出去。

**什么时候不该用工具**：如果一件事用普通代码就能确定地做完（比如格式化日期），就别绕道模型。**每多一次模型调用，就多一份延迟、成本和不确定性。**
