---
id: multi-step-planning
title: 多步规划
domain: agents
pm: useful
summary: 让模型把大任务拆成一串小步骤，走一步看一步，而不是一口气答完。
prerequisites:
  - ai-agent
  - chain-of-thought
related:
  - tool-use
  - mcp
  - hallucination
tags:
  - 应用开发
  - 进阶
sources:
  - title: ReAct - Synergizing Reasoning and Acting in Language Models (2022)
    url: https://arxiv.org/abs/2210.03629
  - title: Tree of Thoughts - Deliberate Problem Solving with Large Language Models (2023)
    url: https://arxiv.org/abs/2305.10601
  - title: Reflexion - Language Agents with Verbal Reinforcement Learning (2023)
    url: https://arxiv.org/abs/2303.11366
updated_at: 2026-09-29
---

## 直觉

`ai-agent` 讲了循环的骨架，`tool-use` 讲了怎么让模型动手。但还有一层没解决：**模型怎么知道下一步该干什么？**

如果你只给一句「帮我查一下上个月的销售数据并做个总结」，模型很可能**一口气编出**整个流程和结果——因为它最擅长的事就是流畅地往下写（见 `next-token-prediction`）。它会写出一段看起来很专业的分析，数字全是编的。

多步规划（multi-step planning）把这件事掰开：**不要一次想完，走一步、看一步结果、再决定下一步。**

为什么必须这样：**规划的质量取决于信息，而信息是走出来的。** 在不知道数据库里有哪些表之前，你没法规划出正确的查询。让模型先查表结构、看到真实结果、再决定下一步——**每一步都建立在真实反馈上，而不是想象上。**

一个类比：**做饭 vs 看菜谱**。看菜谱是一口气读完十步，然后凭记忆操作——中间忘了就瞎编。真正的厨师是**做一步尝一口**：咸了加水、淡了加盐。**反馈驱动，而不是计划驱动。**

## 细节

**关键机制**

- **ReAct 模式**：把「推理（Reason）」和「行动（Act）」交替进行。每一轮模型输出三样东西：
  ```
  思考：我需要先知道数据库里有哪些表
  行动：list_tables()
  观察：orders, users, refunds
  思考：有 orders 表，我查一下上个月的金额
  行动：query("SELECT sum(amount) FROM orders WHERE ...")
  ...
  ```
  **关键在「观察」这一步**——它是**外部世界的真实返回**，不是模型生成的。这是 ReAct 和纯思维链（`chain-of-thought`）最本质的区别：CoT 全在脑子里想，ReAct 每想一步就去现实里看一眼。
- **三种规划粒度，成本递增**：
  1. **隐式规划**：不显式列计划，靠 ReAct 循环自然展开。简单任务够用。
  2. **显式计划**：先让模型输出一个步骤列表，再逐步执行。好处是**计划可见、可人工审核、可中断**——涉及写操作时强烈建议这么做。
  3. **搜索式规划**：树状展开多个分支，评估后选最优（Tree of Thoughts）。效果最好，token 成本可能高一个数量级。
- **反思（Reflexion）**：失败后让模型**写下失败原因**，把这段文字放进下一轮的上下文再试。相当于让模型「吃一堑长一智」——但注意，**这个「长智」只存在于当前这次任务里**，不会写回参数（见 `training-vs-inference`）。
- **必须有终止条件**：模型不会自己知道该停了。硬性上限（`max_steps`）、重复动作检测、连续无进展检测，三样至少要有一样。**没有上限的智能体 = 一张不封顶的账单。**

**多步规划最容易翻车的地方**

- **错误累积**：第 2 步查错了，后面 8 步全都建立在错的数字上，而且模型会**非常自信**。所以关键步骤要加校验（比如「查到的行数为 0 就停下来报告，不要继续」）。
- **目标漂移**：跑了十几步之后，模型忘了最初要干什么。对策是**每一轮都把原始目标重新贴进上下文**。
- **过度规划**：明明一步就能查完的事，模型规划出八步。对策是在提示词里明确「能一步完成的不要拆成多步」。

**可运行代码**

```python
# ReAct 循环的最小骨架：思考 -> 行动 -> 观察 -> 再思考
import json, anthropic

client = anthropic.Anthropic()

TOOLS = [{
    "name": "run_sql",
    "description": "在只读副本上执行 SQL 查询，返回 JSON 行数组",
    "input_schema": {
        "type": "object",
        "properties": {"sql": {"type": "string", "description": "单条 SELECT 语句"}},
        "required": ["sql"],
    },
}]

def fake_db(sql: str) -> str:
    """假装是数据库，返回真实反馈（而不是模型想象的结果）"""
    if "sqlite_master" in sql or "information_schema" in sql:
        return json.dumps([{"table": "orders"}, {"table": "refunds"}])
    return json.dumps([{"month": "2026-08", "amount": 128400}])

def plan_and_run(goal: str, max_steps: int = 6) -> str:
    messages = [{"role": "user", "content":
        f"目标：{goal}\n每轮只做一个动作，看到结果再决定下一步。"
        f"最多 {max_steps} 步，完成后用一句话给结论。"}]

    for step in range(max_steps):
        resp = client.messages.create(
            model="claude-sonnet-5", max_tokens=600, tools=TOOLS, messages=messages)
        messages.append({"role": "assistant", "content": resp.content})

        tool_calls = [b for b in resp.content if b.type == "tool_use"]
        if not tool_calls:
            return resp.content[-1].text          # 模型自己收尾了

        results = []
        for call in tool_calls:
            print(f"[第 {step+1} 步] {call.name}({call.input})")
            out = fake_db(**call.input)
            print(f"         观察: {out}")
            results.append({"type": "tool_result", "tool_use_id": call.id, "content": out})
        messages.append({"role": "user", "content": results})

    return "达到步数上限，任务未完成"

print(plan_and_run("查一下上个月的销售总额"))
```

注意 `max_steps` 那个参数：**它不是可选项。** 一个没有步数上限的循环，遇到工具持续报错时会一直重试到你的额度烧完。
