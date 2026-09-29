---
id: llm-evaluation
title: 大模型评估
domain: evaluation
summary: 怎么知道模型答得好不好——把「感觉还行」变成能对比、能回归的数字。
prerequisites:
  - llm-pretraining
related:
  - rag
  - scaling-law
tags:
  - 工程实践
  - 必读
sources:
  - title: Holistic Evaluation of Language Models (HELM, 2022)
    url: https://arxiv.org/abs/2211.09110
  - title: Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena (2023)
    url: https://arxiv.org/abs/2306.05685
updated_at: 2026-09-29
---

## 直觉

传统软件有明确的对错：测试通过就是通过。大模型的输出是开放文本，同一句话可以有一百种正确说法——**没法用 `assertEqual` 判断。**

于是团队很容易滑向一个危险状态：改了一版提示词，几个人试了试，觉得「好像好一点」，就上线了。过两周用户投诉变多，回头一查，根本说不清是哪次改动引入的。

评估要解决的就是这件事：**建一套能重复跑、能对比、能拦住退化的度量。** 它的价值不在于得到一个漂亮的分数，而在于**让每次改动都有据可依，让退化在合并前就被发现**。

一个类比：**体检**。你不需要每天测，但没有体检，你只能等身体出问题才知道。评估就是给系统做定期体检——而且要在改动前后各做一次。

## 细节

**三种评估方式**

| 方式 | 怎么做 | 优点 | 缺点 |
|---|---|---|---|
| 规则匹配 | 断言输出包含某关键词、符合某格式、能 `json.loads` | 快、免费、确定性 | 只能测有标准答案的部分 |
| 模型打分 | 用另一个模型当裁判，按维度打分 | 能处理开放文本，贴近人类判断 | 有偏差，要校准 |
| 人工评估 | 人来看 | 最准 | 贵、慢、无法高频跑 |

**实践中的组合**：规则匹配跑在 CI 里（每次提交都跑，快且免费），模型打分跑在发版前，人工评估只在关键决策点上用。

**模型裁判（LLM-as-a-Judge）的已知偏差**

- **位置偏差**：两个答案比较时，它倾向于选先出现的那个。**做法：把顺序对调再测一次，只有两次都选同一个才算赢。**
- **长度偏差**：更长的答案更容易得高分，哪怕内容更啰嗦。
- **自我偏好**：裁判模型倾向于给同族模型的输出打高分。

所以用模型裁判时，**必须用人工标注过的一小批样本校准它**，确认它的判断和人类一致，再拿它去跑大规模评测。

**RAG 系统要拆开评估**

RAG 出错有两个完全不同的原因，混在一起测永远修不好：

- **检索质量**：正确的那段资料，在不在召回的 top-k 里？——算 **recall@k**。
- **生成质量**：资料给对了，答案有没有用对、有没有编？

**先测检索，再测生成。** 检索召回率只有 60%，你把提示词改出花来也没用。

**建立你自己的评估集**

公开榜单（MMLU、HELM）测的是通用能力，**和你业务好不好用基本无关**。真正有用的是：

1. 从真实用户问题里采样 50-200 条；
2. 覆盖正常情况和已知的失败案例（那些曾经出过 bug 的）；
3. 人工标注期望答案或判定标准；
4. **固定下来，每次改动都跑同一套。**

这套东西通常比换模型带来的提升更大。

**可运行代码**

一个可以塞进 CI 的最小评估框架：

```python
import json
from dataclasses import dataclass

@dataclass
class Case:
    question: str
    must_contain: list[str]     # 规则断言：必须出现的关键词
    must_not_contain: list[str] # 绝不能出现（比如编造的承诺）

CASES = [
    Case("退款要多久到账？", ["3 个工作日"], ["7 天", "14 天"]),
    Case("生鲜能退货吗？", ["不支持"], ["可以退"]),
]

def evaluate(agent, cases):
    passed, failures = 0, []
    for case in cases:
        answer = agent(case.question)
        missing = [k for k in case.must_contain if k not in answer]
        forbidden = [k for k in case.must_not_contain if k in answer]
        if missing or forbidden:
            failures.append({
                "question": case.question, "answer": answer,
                "缺少关键词": missing, "出现了不该有的词": forbidden,
            })
        else:
            passed += 1

    print(f"通过 {passed}/{len(cases)}  ({passed/len(cases):.0%})")
    if failures:
        print(json.dumps(failures, ensure_ascii=False, indent=2))
    return passed == len(cases)

# 在 CI 里：断言为真，否则构建失败
# assert evaluate(agent, CASES), "评估未通过，本次改动引入了退化"
```

**`must_not_contain` 是这套东西里最有价值的部分**——它把「模型开始乱承诺」这类回归变成了构建失败，而不是等用户来告诉你。
