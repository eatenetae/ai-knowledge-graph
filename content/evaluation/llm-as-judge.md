---
id: llm-as-judge
title: 用模型当裁判
domain: evaluation
summary: 让一个模型去给另一个模型的回答打分，把主观质量变成可批量计算的分数。
prerequisites:
  - llm-evaluation
  - structured-output
related:
  - evaluation-benchmarks
  - hallucination
  - observability
tags:
  - 评估
  - 实用技巧
sources:
  - title: Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena (2023)
    url: https://arxiv.org/abs/2306.05685
  - title: G-Eval - NLG Evaluation using GPT-4 with Better Human Alignment (2023)
    url: https://arxiv.org/abs/2303.16634
updated_at: 2026-09-29
---

## 直觉

评估 LLM 应用时，你很快会撞上一个尴尬的事实：**很多质量问题没法用代码判断。**

「这个回答够不够清楚」「语气是不是太生硬」「摘要有没有抓住重点」——这些是主观判断。传统指标（BLEU、ROUGE 这类比字面重合度的）在生成式任务上基本失效：**同一句话换个说法，意思完全一样，字面重合度却可能很低。**

人工评估准确，但**贵且慢**。你不可能每改一版提示词就找人标 200 条。

用模型当裁判（LLM-as-judge）给了一个折中：**让一个模型按你给的评分标准去打分。** 它便宜、快、可以批量跑，而且和人类判断的一致性能达到相当高的水平。

一个类比：**请一个助教批作业**。助教不如教授权威，但他能按评分标准快速批完两百份，把明显不合格的挑出来。**教授只需要复核助教标了「有疑问」的那几份。** 这就是它正确的定位——**不是替代人工，是把人工的注意力集中到真正需要的地方。**

## 细节

**关键机制**

- **两种常见形式**：
  - **打分（scoring）**：给定标准，输出 1-5 分。适合比较不同版本。
  - **成对比较（pairwise）**：给两个回答，判断哪个更好。**比绝对打分更可靠**——人（和模型）都更擅长比较而不是给绝对分数。MT-Bench 用的就是这个。
- **评分标准必须写死**：不要只说「打个分」。要给出**可操作的档位描述**：
  ```
  5 分：完全回答了问题，事实准确，有明确依据
  4 分：回答了问题，但有一处不精确或遗漏
  3 分：部分回答，或存在需要用户自行澄清的含糊
  2 分：答非所问，或包含明显错误
  1 分：拒答、空白、或完全无关
  ```
  **档位描述写得越具体，评分的一致性越高。**
- **已知的四种偏差，必须主动防**：
  1. **位置偏差**：成对比较时倾向于选**第一个**（或最后一个）出现的。对策：**交换顺序各评一次，只保留两次一致的结论。**
  2. **长度偏差**：倾向于给**更长**的回答打高分，哪怕内容一样。对策：在评分标准里明确「长度不影响分数」。
  3. **自我偏好**：模型倾向于给自己（或同家族模型）的输出打高分。对策：**用不同的模型当裁判**，或和人工标注对比校准。
  4. **格式偏好**：倾向于给**有标题、有分点、有表情符号**的回答高分。这一条最隐蔽——它会让你的产品悄悄往「看起来专业」而不是「真的有用」的方向优化。
- **必须先人工校准**：随机抽 30-50 条，**人工和模型各打一遍分**，算一致率。一致率低于 70% 就先改评分标准，别急着批量跑。**没有校准过的自动评分，只是把随机数包装成了数字。**
- **裁判模型的输入**：最好包含**参考答案**或**原始资料**。只给问题和回答，裁判只能凭感觉；给了依据，它才能判断事实准确性。

**它适合和不适合什么**

- **适合**：开放式生成的质量、指令遵循程度、语气风格、A/B 两个提示词的比较。
- **不适合**：需要精确计算的（数学、金额）、需要外部事实核验的（用检索或规则）、安全边界的最终判定（**必须有人工兜底**）。

**可运行代码**

```python
# 成对比较 + 交换顺序消除位置偏差
import anthropic
from pydantic import BaseModel
from typing import Literal

class Verdict(BaseModel):
    reason: str
    winner: Literal["A", "B", "平局"]

client = anthropic.Anthropic()

RUBRIC = """按以下标准比较两个回答：
- 是否真正回答了问题（最重要）
- 事实是否准确、是否有依据
- 是否简洁。注意：更长的回答不代表更好
- 格式美观与否不计入评分"""

def judge(question: str, a: str, b: str) -> Verdict:
    resp = client.messages.create(
        model="claude-sonnet-5", max_tokens=400, temperature=0,
        messages=[{"role": "user", "content":
            f"{RUBRIC}\n\n问题：{question}\n\n回答 A：\n{a}\n\n回答 B：\n{b}"}],
        tools=[{"name": "verdict", "description": "给出判定",
                "input_schema": Verdict.model_json_schema()}],
        tool_choices=[{"type": "tool", "name": "verdict"}],
    )
    for block in resp.content:
        if block.type == "tool_use":
            return Verdict(**block.input)

def compare(q, a, b):
    v1 = judge(q, a, b)          # A 在前
    v2 = judge(q, b, a)          # B 在前
    # 交换后结论应该反过来，否则说明是位置偏差
    consistent = (v1.winner, v2.winner) in {("A", "B"), ("B", "A"), ("平局", "平局")}
    final = v1.winner if consistent else "平局"
    print(f"第一次: {v1.winner} | 交换后: {v2.winner} | 结论: {final}")
    return final

compare(
    "退款要几天到账？",
    "3 个工作日。",
    "通常情况下，退款的到账时间会受到多种因素的影响，包括支付方式、银行处理时效等。一般建议您耐心等待，如有疑问可联系客服。",
)
```

跑这段你会看到一个非常典型的结果：**B 又长又客气，但没回答问题；A 只有五个字，却完全正确。** 没有明确评分标准的裁判，很容易把票投给 B——**这就是为什么评分标准里必须写「长度不影响分数」。**
