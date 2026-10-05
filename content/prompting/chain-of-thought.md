---
id: chain-of-thought
title: 思维链
domain: prompting
pm: useful
summary: 让模型先把推理过程一步步写出来，再给答案，正确率会明显提高。
prerequisites:
  - prompt-engineering
related:
  - few-shot-prompting
  - multi-step-planning
  - structured-output
tags:
  - 应用开发
  - 必读
sources:
  - title: Chain-of-Thought Prompting Elicits Reasoning in Large Language Models (2022)
    url: https://arxiv.org/abs/2201.11903
  - title: Large Language Models are Zero-Shot Reasoners (Zero-shot CoT, 2022)
    url: https://arxiv.org/abs/2205.11916
updated_at: 2026-09-29
---

## 直觉

模型是**逐字往外写**的（见 `autoregressive-generation`）。这意味着一个残酷的事实：**它给答案之前没有「想」的环节。**

你问「一个班 23 个人，至少两人生日相同的概率是多少？」，如果它直接开始写数字，那这个数字就是**脱口而出**的——和抛硬币猜没有本质区别。它没有草稿纸。

思维链（chain-of-thought，CoT）就是给它一张草稿纸：**明确要求它先写推理步骤，再给结论。**

```
请一步步分析，最后给出答案。

一个班 23 个人，至少两人生日相同的概率是多少？
```

一旦它开始写「先算所有人都不相同的概率……第一个人随便哪天，第二个人要和第一个不同，概率是 364/365……」——**后面的每一步都建立在前面已经写出来的内容之上**。推理被外化成了文本，而文本会成为下一步的输入。正确率因此大幅提升，而且**过程可检查**：错了能看出错在哪一步。

一个类比：**心算 vs 笔算**。三位数乘法你能心算，但五位数的你会找张纸。不是脑子变好了，是**纸上的中间结果解放了你的工作记忆**。思维链就是模型的草稿纸。

## 细节

**关键机制**

- **两种触发方式**：
  - **少样本 CoT**：给几个带完整推理过程的例子，模型照葫芦画瓢。效果好，但要写例子（见 `few-shot-prompting`）。
  - **零样本 CoT**：只在提示词末尾加一句「Let's think step by step」（让我们一步步思考）。几乎零成本，在数学和逻辑题上就能带来可观提升。这句「咒语」的发现过程本身就是个著名故事。
- **为什么有效**：Transformer 每一层能做的计算量是固定的，**深度决定了「一次能想多复杂」**。把推理展开成几十个 token，相当于让模型用序列长度换计算深度——**用更多的层数去做同一道题**。
- **只在足够大的模型上有效**：小模型写出来的推理链往往是**流畅但错误**的，加上 CoT 反而可能更差。这是个典型的**涌现能力（emergent ability）**。
- **CoT 的代价**：输出 token 数大幅增加。推理链可能比答案长十倍，**延迟和成本同步上涨**。生产环境里常常用「简单问题不开启、复杂问题才开启」的路由策略来平衡。
- **重要变体**：
  - **Self-Consistency**：采样多条推理链，对最终答案投票。比单条链准，成本也翻几倍。
  - **ReAct**：把推理和工具调用交替进行——想一步、查一次、再想。这是 `multi-step-planning` 的基础。
  - **推理模型（reasoning model）**：新一代模型把 CoT 训练进了参数里，模型会自动产生很长的内部推理，不再需要你在提示词里哄它。**但原理没变：还是用输出长度换推理深度。**

**一个常见误区**

**CoT 不能弥补知识缺失。** 如果模型根本不知道某个事实，写再长的推理链也只会让它**自信地编出一段逻辑通顺的错话**。CoT 提升的是推理，不是事实准确性——后者要靠 `rag` 或 `hallucination` 里讲的手段。

**可运行代码**

```python
# pip install anthropic
import anthropic

client = anthropic.Anthropic()

QUESTION = "一个班 23 个人，至少两人生日相同的概率大约是多少？"

def ask(prompt):
    msg = client.messages.create(
        model="claude-sonnet-5", max_tokens=800,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text

# 不给草稿纸：模型必须脱口而出
direct = ask(f"{QUESTION}\n只回答一个数字。")

# 给草稿纸：先推理，再结论
cot = ask(f"{QUESTION}\n请一步步分析，最后单独一行给出答案。")

print("直接作答:\n", direct)
print("\n思维链:\n", cot)
```

对比两次输出，你会看到：直接作答往往给出 0.5 附近的直觉答案（错误），而思维链版本会算出 **50.7%** 左右。**同一个模型、同一个问题，差别只在有没有给它草稿纸。**
