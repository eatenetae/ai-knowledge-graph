---
id: rlhf
title: 基于人类反馈的强化学习
domain: safety
pm: useful
summary: 让人类给模型的多个回答排个优劣，模型照着这个偏好越学越对味。
prerequisites:
  - fine-tuning
related:
  - llm-evaluation
tags:
  - 对齐
  - 训练
sources:
  - title: Training Language Models to Follow Instructions with Human Feedback (InstructGPT, 2022)
    url: https://arxiv.org/abs/2203.02155
  - title: Proximal Policy Optimization Algorithms (PPO, 2017)
    url: https://arxiv.org/abs/1707.06347
updated_at: 2026-09-29
---

## 直觉

预训练出来的模型只会「接着写」。你问它问题，它可能给你续写出三个新问题。怎么让它学会「好好回答」？

问题在于：**「好好回答」很难写成一条规则。** 你没法用代码判断一段话是不是「有帮助、诚实、无害」。但人类看一眼就知道哪个回答更好——**判断比生成容易得多**。

RLHF 就是围绕这个不对称设计的：

1. 让模型对同一个问题生成几个不同回答；
2. 请人来**排序**——哪个最好，哪个最差；
3. 用这些排序数据训练一个「打分器」，让它学会预测人类会给几分；
4. 用这个打分器当奖励，强化学习去调模型，让它输出得分越来越高的回答。

最终模型学到的是**人类的偏好**，而不是某条写死的规则。今天你用的每一个对话模型，几乎都经过这一步。

一个类比：**教做菜没法给菜谱，但可以尝**。学徒做十盘，你说「这盘最好，那盘太咸」。重复几千次，他就摸到了你的口味——虽然你说不清「好吃」的定义。

## 细节

**三阶段流程**

| 阶段 | 数据 | 做什么 |
|---|---|---|
| SFT（指令微调） | 几万条「指令 → 理想回答」 | 先让模型学会「回答」这个形式 |
| 奖励模型（RM） | 几十万条人类排序 | 训练一个能预测人类偏好的打分器 |
| RL（PPO） | 无标注提示词 | 用 RM 当奖励，优化生成策略 |

**为什么用「排序」而不是「打分」**

让人给回答打 1-10 分，不同人的标准天差地别，同一个人的标准也会漂移。但让人在两个回答里选一个更好的，**一致性和可靠性都高得多**。所以工程上都用成对比较，再转成训练信号。

**KL 惩罚：防止模型「刷分」**

如果只顾着让奖励模型打高分，模型会找到捷径——输出一堆奖励模型喜欢但人类觉得莫名其妙的套话。所以 PPO 阶段会加一个 **KL 散度惩罚**，约束新模型不要偏离 SFT 模型太远。

**这个约束一放松，就会出现「奖励黑客」**：模型学会了讨好打分器，而不是真的变好。这也是为什么奖励模型必须持续用新数据重训。

**RLHF 之后的路**

- **RLAIF / Constitutional AI**：用 AI 按一套明文原则来给回答排序，替代大部分人工标注。成本低得多，也是 Claude 系列的核心方法之一。
- **DPO（直接偏好优化）**：跳过奖励模型和强化学习，直接用偏好数据优化模型。实现简单得多，效果在很多任务上接近 PPO，现在是开源社区的主流选择。

**应用开发者要知道的**

- RLHF 是**训练方**的工作，你几乎不会自己做。但你要知道它的副作用：**对齐税**——过度优化「有用、无害」会让模型变得啰嗦、爱加免责声明、不敢给确定答案。
- 遇到模型「不肯直说」时，先想到这是对齐的产物，然后用 `prompt-engineering` 里的明确指令去引导，而不是断定模型能力不行。

**可运行代码**

用 DPO 的损失函数看清「偏好学习」到底在优化什么：

```python
import torch
import torch.nn.functional as F

def dpo_loss(policy_chosen, policy_rejected,
             ref_chosen, ref_rejected, beta=0.1):
    """
    让「被选中的回答」相对「被拒绝的回答」的概率优势变大。
    ref_* 是未微调前的参考模型给出的对数概率，用来约束偏移幅度。
    beta 控制允许偏离参考模型多远（越大越保守）。
    """
    chosen_adv = policy_chosen - ref_chosen        # 选中项相对参考的提升
    rejected_adv = policy_rejected - ref_rejected  # 拒绝项相对参考的提升
    logits = beta * (chosen_adv - rejected_adv)
    return -F.logsigmoid(logits).mean()

# 造一组模拟的对数概率（真实场景由模型对完整回答求和得到）
p_c, p_r = torch.tensor([-2.0]), torch.tensor([-5.0])   # 当前模型
r_c, r_r = torch.tensor([-3.0]), torch.tensor([-3.5])   # 参考模型

loss = dpo_loss(p_c, p_r, r_c, r_r)
print(f"loss = {loss.item():.4f}")
```

关键在 `chosen_adv - rejected_adv` 这一项：**它不要求模型把正确答案的概率绝对提高，只要求它相对错误答案更有优势。** 这个「相对」的设计，正是偏好学习比监督学习更稳的原因。
