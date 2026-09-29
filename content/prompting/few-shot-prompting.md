---
id: few-shot-prompting
title: 少样本提示
domain: prompting
summary: 在问题前面给几个「输入→输出」的例子，模型就能照葫芦画瓢。
prerequisites:
  - prompt-engineering
related:
  - fine-tuning
tags:
  - 应用开发
  - 实用技巧
sources:
  - title: Language Models are Few-Shot Learners (GPT-3, 2020)
    url: https://arxiv.org/abs/2005.14165
  - title: Language Models are Unsupervised Multitask Learners (GPT-2, 2019)
    url: https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf
updated_at: 2026-09-29
---

## 直觉

想教模型做一件新任务，最直接的办法不是训练它，而是**在提问前先给它看几个做好的样例**。

```
把这句话的情绪分类：
「这家店服务太差了」 → 负面
「味道还不错，就是有点贵」 → 中性
「强烈推荐，下次还来」 → 正面
「等了一个小时才上菜」 →
```

模型会顺着这个模式补上「负面」。你没改任何参数，只是给了三个例子。

为什么有效：模型在做「接着往下写」。前面三个例子的格式高度一致，第四个位置接着写「负面」的概率就被推到了最高。**例子在告诉它「这里该输出什么形状的东西」。**

一个类比：**给新人看三份填好的报销单**，比口头讲十分钟报销规则都快。他不是学会了规则，是照着样子填。

## 细节

**关键机制**

- **零样本 / 单样本 / 少样本**：不给例子叫 zero-shot，给一个叫 one-shot，给几个叫 few-shot。GPT-3 论文的标题就是「Language Models are Few-Shot Learners」——它发现规模够大的模型不用微调，靠例子就能学会新任务。
- **例子的选择比数量重要**：
  - **标签要均衡**。三个例子全是「正面」，模型会倾向于全答正面。
  - **例子要覆盖边界情况**。想让它正确区分「中性」和「负面」，就得给一个模棱两可的样例。
  - **顺序有影响**。靠后的例子权重更大，把最想让它模仿的放最后。
- **格式一致性是命门**。箭头符号、空格、换行只要有一个例子不一样，模型就可能学歪。**用代码拼提示词，别手敲。**

**和微调怎么选**

| | 少样本提示 | 微调 |
|---|---|---|
| 成本 | 几乎为零，改几行提示词 | 要数据、要训练、要部署 |
| 例子数量 | 几个到几十个 | 几百到几万条 |
| 适合 | 快速验证、任务会变、格式约束 | 稳定任务、要压低延迟和成本 |
| 缺点 | 占上下文、例子多了变贵变慢 | 更新知识要重训 |

**经验法则：先用少样本提示验证需求成不成立，确认任务稳定且量大了，再考虑微调。** 反过来做，通常是在浪费钱。

**可运行代码**

```python
import json
import anthropic

client = anthropic.Anthropic()

EXAMPLES = [
    {"text": "这家店服务太差了", "label": "负面"},
    {"text": "味道还不错，就是有点贵", "label": "中性"},
    {"text": "强烈推荐，下次还来", "label": "正面"},
]

def build_prompt(examples, target):
    # 用代码拼格式，保证每个例子长得一模一样
    lines = ["把这句话的情绪分类："]
    lines += [f"「{e['text']}」 → {e['label']}" for e in examples]
    lines.append(f"「{target}」 →")
    return "\n".join(lines)

target = "等了一个小时才上菜"
msg = client.messages.create(
    model="claude-sonnet-5", max_tokens=10,
    messages=[{"role": "user", "content": build_prompt(EXAMPLES, target)}],
)
print(f"{target} -> {msg.content[0].text.strip()}")   # 负面
```

试试把 `EXAMPLES` 换成三个「正面」，再看输出——**它会开始把负面句子也判成正面**。这就是例子偏置，生产环境里最常见的坑。
