---
id: hallucination
title: 幻觉
domain: evaluation
pm: core
summary: 模型会一本正经地说出完全不存在的事实，而且语气和说真话时一模一样。
prerequisites:
  - llm-pretraining
  - llm-evaluation
related:
  - rag
  - rag-failure-modes
  - content-safety
tags:
  - 评估
  - 必读
sources:
  - title: Survey of Hallucination in Natural Language Generation (2022)
    url: https://arxiv.org/abs/2202.03629
  - title: TruthfulQA - Measuring How Models Mimic Human Falsehoods (2021)
    url: https://arxiv.org/abs/2109.07958
  - title: SELFCHECKGPT - Zero-Resource Black-Box Hallucination Detection (2023)
    url: https://arxiv.org/abs/2303.08896
updated_at: 2026-09-29
---

## 直觉

问模型「请介绍一下张三教授的《认知科学导论》这本书」，它可能给你一段像模像样的介绍：出版年份、核心观点、章节目录，写得比书评还专业。

**而这本书根本不存在。**

这就是幻觉（hallucination）：模型**生成了流畅、具体、结构完整，但事实上不存在的内容**。最麻烦的不是它会错，而是**它错得和它对的时候没有任何区别**——同样的语气、同样的自信、同样的细节丰富度。

为什么必然如此：回到 `next-token-prediction`——模型的训练目标永远是「猜下一个最可能的词」，**它从来没有被训练过说「我不知道」**。当上下文提示这里应该有一本书名时，它就会生成一个最像书名的字符串。**对它来说，「编一个合理的」和「说一个真的」是同一个动作。**

一个类比：**一个特别想帮你、但不懂装懂的同事**。你问他一个他不知道的问题，他不会说「我不清楚」，而是根据手头线索**现场编一个听起来很靠谱的答案**。他不是在骗你——他真心觉得自己在帮忙。

## 细节

**关键机制**

- **两种幻觉，成因不同、修法不同**：
  - **事实性幻觉（factuality）**：说的东西和现实不符。比如编造论文、法律条文、API 参数。**根因是知识缺失或记忆错误。**
  - **忠实性幻觉（faithfulness）**：说的东西和**给它的资料**不符。RAG 场景里资料明明写着「3 天」，它答「30 天」。**根因是指令遵循失败或注意力分配问题**，而不是知识问题。
  - 分清这两类极其重要：前者要补知识（`rag`），后者要改提示词和上下文组织（`context-engineering`）。
- **为什么模型「不知道自己不知道」**：它的输出是概率分布上的采样，不是对内部知识的检索。**没有「查无此项」这个返回值。** 所以它对自己答案的置信度，和答案的真实性**没有可靠的对应关系**。
- **什么时候幻觉最多**：
  - 问**长尾事实**（冷门人名、具体数字、小众论文）——训练数据里出现得少；
  - 问**训练截止之后**的事；
  - 要求**精确格式**（引用编号、URL、代码 API）——格式压力会诱导它编出「看起来对」的内容；
  - 上下文里**有相关内容但不完整**——它会自动补全缺口。
- **缓解手段，按有效性排序**：
  1. **给它资料并强制依据资料回答**（`rag`）。这是最有效的一招，直接消除事实性幻觉的大部分场景。
  2. **明确给出「不知道」的退路**：在提示词里写「资料未提及时，回答『资料未提及』，不要推测」。**不给退路，它就只能编。**
  3. **要求引用来源**，并在程序里**校验引用是否真的存在**。注意：模型会编造看起来合理的引用编号，所以校验必须在代码里做，不能靠它自觉。
  4. **降低采样温度**：事实型问答用温度 0（见 `sampling-strategies`）。这能减少随机性带来的错误，但**不能消除**——模型确信的错误答案，温度 0 时照样错。
  5. **自动检测**：让模型自己给自己的答案挑刺（SelfCheckGPT 的思路是多次采样看答案是否一致——**同一问题多次采样答案互相矛盾，就是幻觉的强信号**）。
- **不要指望微调解决它**：微调改变的是**行为风格**，灌不进可靠的新知识（见 `catastrophic-forgetting`）。而且用「正确事实」去微调，往往只是让模型**更自信地重复训练集里的事实**，遇到没见过的照样编。

**工程上的正确态度**

**幻觉无法被消除，只能被管理。** 你的目标不是「让模型不犯错」，而是：

1. 让它**在关键场景下有据可依**（RAG + 引用）；
2. 让它**在没有依据时会承认**（提示词给退路）；
3. 让**错误可以被用户发现**（展示来源，让用户能核对）；
4. 让**高风险动作有人工确认**（涉及金额、法律、医疗时）。

**可运行代码**

```python
# 用「多次采样的一致性」检测幻觉：同一问题问 5 次，答案互相矛盾 = 高风险
import anthropic
from collections import Counter

client = anthropic.Anthropic()

def selfcheck(question: str, n: int = 5, temperature: float = 1.0) -> None:
    answers = []
    for _ in range(n):
        msg = client.messages.create(
            model="claude-sonnet-5", max_tokens=120, temperature=temperature,
            messages=[{"role": "user", "content":
                f"{question}\n只回答事实本身，不确定就回答「不确定」。"}],
        )
        answers.append(msg.content[0].text.strip())

    print(f"问题：{question}")
    for i, a in enumerate(answers):
        print(f"  采样 {i+1}: {a[:60]}")

    counts = Counter(answers)
    top, hits = counts.most_common(1)[0]
    print(f"  一致性：{hits}/{n}")
    print("  → " + ("答案稳定，可信度较高" if hits >= 4 else "答案互相矛盾，很可能是幻觉\n"))

selfcheck("张三教授的《认知科学导论》是哪一年出版的？")   # 不存在的书 → 答案会发散
selfcheck("法国的首都是哪里？")                          # 确定事实 → 答案会高度一致
```

第一个问题你会看到五次采样给出**五个不同的年份**——这就是幻觉的指纹。**模型编造时没有稳定的内部依据，所以每次编的都不一样；而它真的知道时，答案会高度一致。**
