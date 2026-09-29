---
id: build-ai-agent
title: 构建 AI 智能体
summary: 从理解模型到让它自己动手：工具调用、循环控制与安全边界。
audience: 已经做过提示工程和 RAG，想让模型自己完成多步任务的人
updated_at: 2026-09-29
steps:
  - id: what-is-machine-learning
    note: 快速过一遍，建立「模型是函数不是人」的基本认知
  - id: tokenization
    note: 智能体每一步的观察结果都进上下文，token 预算从这里开始算
  - id: neural-network
    note: 理解模型能力的边界从哪来，避免对它有不该有的期待
  - id: embedding
    note: 工具选择本质上也是一次语义匹配
  - id: attention
    note: 理解为什么上下文越长越贵、越容易「中间迷失」
  - id: transformer
    note: 架构层面的直觉，知道为什么长上下文是平方级开销
  - id: next-token-prediction
    note: 关键一步——想通「调用工具」其实也只是模型在生成特定格式的文字
  - id: llm-pretraining
    note: 知道模型的知识边界和截止日期，决定哪些事必须交给工具
  - id: prompt-engineering
    note: 工具描述就是提示工程。描述写不好，工具一定选错
  - id: few-shot-prompting
    note: 用例子固定工具调用的格式，比写一长串规则可靠得多
  - id: ai-agent
    note: 核心循环。重点看循环上限、错误处理和成本控制
  - id: tool-use
    note: 落地细节：幂等、权限、参数校验——以及为什么 eval 是禁忌
---

## 这条路径怎么走

智能体是 LLM 应用里**最容易做、也最容易做砸**的一类。做起来只要几十行代码，做砸的方式却有几十种：无限循环、上下文爆炸、重复下单、被注入后乱发邮件。

所以这条路径前面八步看起来「和智能体无关」，其实全都在为最后四步服务——**你必须知道模型的边界在哪，才知道哪些事不能交给它自己决定。**

## 最容易忽略的两点

**工具描述是提示工程。** 很多人花三天调系统提示，却用一行字写工具描述。模型选错工具时，先回去改描述，别急着换模型。

**写操作必须有人工确认。** `ai-agent` 卡片里的 `max_steps` 和 `tool-use` 卡片里的权限讨论，是这条路径里唯一不能妥协的部分。一个能自主转账的智能体，加上 `prompt-injection`，就是一场事故。

## 走完之后

建议紧接着读 `prompt-injection`——它不在本路径的步骤里，但**是智能体上线前的必读项**。工具越强，注入的后果越严重。

再往后是 `llm-evaluation`：智能体的输出不确定性最高，没有评估集，你没法判断改动是变好还是变坏。
