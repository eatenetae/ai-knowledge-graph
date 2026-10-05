---
id: prompt-engineering
title: 提示工程
domain: prompting
pm: core
summary: 通过组织你输入的文字，让模型给出你想要的结果，而不改动模型本身。
prerequisites:
  - llm-pretraining
related: []
tags:
  - 应用开发
  - 必读
sources:
  - title: Prompt Engineering Guide
    url: https://www.promptingguide.ai/
  - title: Chain-of-Thought Prompting Elicits Reasoning in Large Language Models (2022)
    url: https://arxiv.org/abs/2201.11903
updated_at: 2026-09-29
---

## 直觉

模型没变，参数没动，只是你说话的方式变了，效果就从「没法用」变成「能用」。这就是提示工程。

为什么有用？回到 `next-token-prediction`：模型做的事情是「接着往下写」。你给的文字就是它的**起跑姿势**。姿势对了，它顺着往下滑就滑到你要的地方；姿势歪了，它也会很认真地滑到别处去。

一个关键心法：**别把模型当成听话的员工，把它当成一个刚入职、知识渊博但完全不熟悉你业务的专家。** 你不知道的上下文，它也不知道；你以为是常识的约定，它没有。说清楚背景、目标、输出格式，比堆砌「请你务必认真思考」有用一百倍。

一个类比：**给代驾指路**。说「往前开」和说「前面路口右转，第二个红绿灯左转进地库 B2」——同一个司机，完全不同的结果。

## 细节

**几个真正有效的招式**

- **给角色和场景**：「你是一个给非技术读者写说明的编辑」比「你是一个AI助手」有效，因为它收窄了「接下来最可能是什么文字」的分布。
- **给输出格式**：明确要求 JSON，并给一个字段示例。模型对格式的模仿能力极强，`few-shot-prompting` 就是这一点的极端用法。
- **思维链（CoT）**：在答案前要求它「一步步说明推理过程」。这不是玄学——自回归模型把中间步骤写出来，这些步骤就成了后续推理的**上下文依据**，等于用输出给自己搭脚手架。数学、多步逻辑题上提升尤其明显。
- **拆解任务**：与其让模型「一次做完」，不如「先抽取要点，再根据要点写摘要」。每一步都简单，整体错误率反而低。
- **给边界**：明确说「如果资料里没有提到，就回答『资料未提及』」。不给出路，模型就只能编——那是幻觉的主要来源之一。

**常见误区**

- **堆形容词没用**。「请非常仔细认真地回答」几乎不影响输出质量。
- **否定指令容易翻车**。「不要提到价格」——「价格」这个词一旦出现在提示里，反而提高了它出现在输出里的概率。改成正面表述：「只描述功能与适用场景」。
- **提示工程有上限**。它改不了模型不知道的事。需要外部知识就上 `rag`，需要固定风格和行为就上 `fine-tuning`。

**可运行代码**

同一个任务，两种问法，看输出差异：

```python
# pip install anthropic
import anthropic

client = anthropic.Anthropic()

doc = "本产品支持离线模式，缓存有效期 7 天，到期后需联网刷新授权。"

weak = f"总结一下：{doc}"

strong = f"""你是给非技术用户写说明的技术编辑。

请阅读下面的产品说明，输出 JSON，字段如下：
- "one_line": 一句话说明（不超过 30 字，不含术语）
- "caveat": 用户最容易踩的坑（一句话）
如果原文没有提到某个字段的信息，该字段填 "原文未提及"。

产品说明：
{doc}
"""

for label, prompt in [("弱提示", weak), ("强提示", strong)]:
    msg = client.messages.create(
        model="claude-sonnet-5", max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    print(f"--- {label} ---\n{msg.content[0].text}\n")
```

弱提示给你一段散文，强提示给你能直接 `json.loads` 的结构化结果。**差别不在模型，在你。**
