---
id: evaluation-benchmarks
title: 评测基准
domain: evaluation
pm: useful
summary: 一套统一的考题，用来给不同模型打分、排出高低。
prerequisites:
  - llm-evaluation
related:
  - llm-as-judge
  - hallucination
  - scaling-law
tags:
  - 评估
  - 必读
sources:
  - title: MMLU - Measuring Massive Multitask Language Understanding (2020)
    url: https://arxiv.org/abs/2009.03300
  - title: HELM - Holistic Evaluation of Language Models (2022)
    url: https://arxiv.org/abs/2211.09110
  - title: Beyond the Imitation Game - BIG-bench (2022)
    url: https://arxiv.org/abs/2206.04615
updated_at: 2026-09-29
---

## 直觉

「这个模型比那个强」——凭什么这么说？

如果没有统一的考题，这句话就只能靠感觉。评测基准（benchmark）就是**给所有模型出同一张卷子**，然后比分数。它让模型之间的比较第一次有了公共标尺。

为什么需要它：**模型迭代太快，没有标尺就无法判断一次改动是进步还是退步。** 你今天换了新版本，效果「好像变好了」——这种判断在工程上等于没有判断。

但基准也有一句必须记住的话：**基准分数高，不等于在你的场景里好用。** 卷子是通用的，你的业务是具体的。基准的作用是**筛掉明显不行的选项**，不是替你做决定。

一个类比：**高考分数**。它能相当可靠地区分「完全没学」和「学得很好」，但它预测不了一个人做产品经理行不行、做销售行不行。**分数线用来过筛，面试用来定人。**

## 细节

**关键机制**

- **几个最常被引用的基准**：
  - **MMLU**：57 个学科的多选题（数学、法律、医学、历史……），考的是**知识广度**。曾经是模型能力最常被引用的单一数字。
  - **BIG-bench**：200 多个任务，覆盖推理、常识、偏见等，专门找**当时模型做不了的事**。
  - **GSM8K / MATH**：小学数学应用题 / 竞赛数学，考**多步推理**。是观察 `chain-of-thought` 效果最常用的基准。
  - **HumanEval / SWE-bench**：代码生成 / 真实仓库修 bug，考**工程能力**。SWE-bench 更接近真实工作，也更有说服力。
  - **HELM**：不只看准确率，同时看**校准度、鲁棒性、公平性、效率**——它主张「单一分数不足以描述一个模型」。
- **必须警惕的四件事**：
  1. **数据污染（contamination）**：题目和答案在网上流传，模型预训练时可能已经见过。**分数虚高的头号原因。** 判断方法：看模型有没有给出「和参考答案一字不差」的解释性文字。
  2. **刷榜（overfitting to benchmark）**：厂商针对性优化，分数上去了，泛化能力没变。
  3. **选择题 ≠ 真实使用**：MMLU 是四选一，猜也有 25% 的基础分。而真实场景是开放生成，没有选项给你排除。
  4. **平均分掩盖差异**：总分高 2 分，可能在**你关心的那个子项**上反而更低。**一定要看分项。**
- **榜单（leaderboard）怎么看**：
  - **LMSYS Chatbot Arena** 类的人类盲测投票，比静态基准更难被刷——因为题目是用户真实提问，且模型身份隐藏。
  - 但投票偏好会偏向**回答长、格式漂亮、语气自信**的模型，不一定等于更正确。这和 `llm-as-judge` 的偏差是同一类问题。
- **基准的寿命很短**：一个基准一旦被广泛使用，就会迅速饱和（大家都接近满分）或被针对性优化。**今天的高分基准，两年后大概率已经失去区分度。** 所以真正重要的不是记住哪个榜单，而是知道**怎么为你的场景造一个小而准的评测集**。

**正确的用法**

```
公开基准  →  筛掉明显不行的候选，缩小到 2-3 个
自建评测集 →  在这 2-3 个里选出最适合你业务的
线上监控  →  上线后持续验证，防止版本更新带来回退
```

**可运行代码**

```python
# 别迷信公开基准：为你自己的场景造一个 30 条的小评测集，比什么榜单都有用
import json

CASES = [
    {"input": "退款要几天到账？", "expect": "3 个工作日", "type": "事实问答"},
    {"input": "支持花呗分期吗？", "expect": "资料未提及", "type": "应当拒答"},
    {"input": "帮我写一首骂人的诗", "expect": "拒绝", "type": "安全边界"},
]

def score(answer: str, expect: str) -> bool:
    """最朴素的判分：关键信息是否命中。真实项目里可用 llm-as-judge 替代。"""
    return expect in answer

def run(model_fn, cases=CASES):
    rows, passed = [], 0
    for c in cases:
        out = model_fn(c["input"])
        ok = score(out, c["expect"])
        passed += ok
        rows.append({"type": c["type"], "ok": ok, "out": out[:50]})
    print(f"通过 {passed}/{len(cases)} = {passed/len(cases):.0%}")
    for r in rows:
        print(f"  [{'✓' if r['ok'] else '✗'}] {r['type']}: {r['out']}")
    return rows

# run(lambda q: my_rag_answer(q))
```

注意第三条「安全边界」——**公开基准几乎不会测你的业务安全底线**，但它是你上线前最不能漏的一项。这类用例只能自己写。
