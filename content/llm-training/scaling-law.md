---
id: scaling-law
title: 规模定律
domain: llm-training
pm: useful
summary: 模型变大的收益是可以预测的，这让「烧钱堆规模」变成了一门可计算的生意。
prerequisites:
  - llm-pretraining
related:
  - model-quantization
  - llm-evaluation
tags:
  - 训练
  - 经验规律
sources:
  - title: Scaling Laws for Neural Language Models (2020)
    url: https://arxiv.org/abs/2001.08361
  - title: Training Compute-Optimal Large Language Models (Chinchilla, 2022)
    url: https://arxiv.org/abs/2203.15556
updated_at: 2026-09-29
---

## 直觉

在深度学习的大部分领域，「模型调大一点会不会更好」只能靠试。Scaling Law 说：**在大模型这里，答案可以提前算出来。**

把模型参数、数据量、算力分别乘几倍，最终的错误率会以一条**平滑的幂律曲线**下降。也就是说，在花掉几千万美元之前，你可以先在纸上估算这笔钱能买到多少效果。这让「要不要把规模翻十倍」从赌博变成了一道算术题。

更反直觉的是第二层结论（Chinchilla）：**光把模型堆大是浪费的**。给定固定的算力预算，模型大小和训练数据量应该**同比例增长**。当时很多大模型「参数够大但喂得不够饱」，相当于买了一台超大发动机却只加半箱油。

一个类比：**做菜的火候与时间**。火开大（模型大）确实熟得快，但如果只烧五分钟（数据少），里面还是生的。Chinchilla 说的就是：给定燃气费，火候和时长要配比，不能只开大火。

## 细节

**关键机制**

- **幂律关系**：`L(N, D) = 不可约损失 + a·N^(-α) + b·D^(-β)`。`N` 是参数量，`D` 是数据量。两侧都是对数坐标下的直线，所以外推很可靠。
- **Chinchilla 配比**：算力最优时，大约每 **1 个参数配 20 个训练 token**。一个 70B 的模型，理想数据量在 1.4T token 量级。
- **推理成本改变了结论**：Chinchilla 优化的是**训练**算力。但模型上线后要服务几亿次请求，**推理**成本才是大头。于是业界转向「过训练」——用远超 Chinchilla 配比的数据去训一个更小的模型（比如 Llama 3 8B 用了 15T token）。训练时多花点，换来一辈子推理都便宜。这正是 `model-quantization` 之外的另一条降本路线。
- **能力的涌现**：有些能力在曲线上不是平滑出现的，而是跨过某个规模后突然具备。这让「小模型验证，大模型上线」的做法有风险——小规模测不出来的能力，大规模可能凭空出现。

**工程上的用法**

- **用小规模实验拟合曲线**，外推预测大模型的表现，决定是否值得投入。这是大厂做训练决策的标准动作。
- **判断一个模型「训够了没有」**：拿它的参数量和训练 token 数比一比，远低于 20 倍的就是欠训练。

**可运行代码**

```python
import numpy as np

# 用论文里的幂律形式，估算不同规模下的损失
def loss_at(params_b, tokens_b, irreducible=1.69, a=406.4, alpha=0.34, b=410.7, beta=0.28):
    N, D = params_b * 1e9, tokens_b * 1e9
    return irreducible + a * N ** (-alpha) + b * D ** (-beta)

print(f"{'参数量':>8} {'数据量':>10} {'损失':>8}   chinchilla 配比(20x)")
for params in [1, 7, 13, 70]:
    for ratio in [5, 20, 100]:
        tokens = params * ratio / 1000        # 换算成 B
        print(f"{params:>6}B {tokens:>9.1f}B {loss_at(params, tokens):>8.3f}   {ratio}x")
```

跑一遍能看出两件事：**同配比下参数越大损失越低**，以及**配比从 5x 提到 20x 的收益，远大于从 20x 提到 100x**——收益递减得很快，这就是「最优配比」存在的原因。
