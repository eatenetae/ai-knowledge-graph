---
id: parameters-and-hyperparameters
title: 参数与超参数
domain: foundations
summary: 模型里有两类数字：一类是它自己学出来的，一类是你提前定好的。
prerequisites:
  - what-is-machine-learning
related:
  - loss-function
  - training-vs-inference
  - fine-tuning
tags:
  - 入门
  - 基础
sources:
  - title: PyTorch 官方文档：优化器与参数更新
    url: https://pytorch.org/docs/stable/optim.html
  - title: Deep Learning（Goodfellow 等）第 5 章 机器学习基础
    url: https://www.deeplearningbook.org/contents/ml.html
updated_at: 2026-09-29
---

## 直觉

上一张卡片说「机器学习 = 调参数」。但一个模型里其实有两类数字，它们的来历完全不同，混在一起想就会一直糊涂。

第一类叫**参数（parameter）**：模型自己学出来的。你给数据，它自己算，算完存下来。GPT 的「1750 亿参数」说的就是这一类——它们是模型的知识本身，没人能手写。

第二类叫**超参数（hyperparameter）**：你在训练开始前定好的。学多久、一次看多少条数据、每步挪多大——这些模型自己决定不了，必须你来定。它们不进入模型文件，但**决定了模型能学成什么样**。

一个类比：**带徒弟**。徒弟最终练成的手感（火候、力道）是参数——只能靠他自己练出来，你替不了。而你定的「每天练几小时、用哪本教材、先练基本功还是先上台」是超参数——你定完就固定了，剩下的交给徒弟自己长。

为什么这个区分重要：调不好模型时，**先想清楚是参数的问题还是超参数的问题**。模型学不会，往往是你数据不够或训练轮数不对（超参数）；模型学会了但答得不好，往往得换数据或换训练目标（参数层面的事）。很多人一上来就狂调超参数，其实问题在数据。

## 细节

**关键机制**

- **参数量决定模型多大**。一个 `d` 维输入、`h` 维输出的全连接层有 `d × h + h` 个参数。Transformer 的参数主要堆在注意力层的四个投影矩阵和前馈网络里。参数量直接决定：显存占用、推理延迟、以及能不能塞进一张卡。
- **常见超参数**：
  - **学习率（learning rate）**：每步往梯度方向挪多远。太小则训练慢到看不出来，太大则直接发散。这是最需要认真调的一个。
  - **批大小（batch size）**：一步同时看多少条样本。越大越稳但越吃显存，且通常需要配合调大学习率。
  - **训练轮数（epochs）**：同一份数据反复看几遍。太多会**过拟合**——模型把训练数据背下来了，换新数据就崩。
  - **层数 / 隐藏维度 / 注意力头数**：决定模型容量，属于架构超参数，改它们等于换一个模型。
- **学习率调度**：实践中很少用固定学习率。常见做法是**预热（warmup）**——前几百步从很小的值线性升上去，避免一开始就把参数带飞；之后再逐步衰减。
- **怎么判断超参数没调好**：看**训练损失和验证损失**两条曲线。训练降、验证不降 → 过拟合，该加数据或减轮数。两条都不降 → 学习率可能太小，或者模型容量不够。两条都剧烈震荡 → 学习率太大。

**和微调的关系**

微调（fine-tuning）改的是**参数**，但用的**超参数**通常比预训练小得多——学习率常常小一到两个数量级。原因很直白：预训练是从随机开始找路，微调是在一个已经很好的位置上做微调，步子大了会把原有能力踩坏（见 `catastrophic-forgetting`）。

**可运行代码**

```python
import torch

# 参数：需要训练，requires_grad=True
weight = torch.nn.Parameter(torch.randn(3, 4))
bias = torch.nn.Parameter(torch.zeros(4))

# 超参数：你定的，不参与训练
lr = 1e-3
batch_size = 32
epochs = 10

optimizer = torch.optim.AdamW([weight, bias], lr=lr)   # lr 是超参数

print("参数量:", sum(p.numel() for p in (weight, bias)))   # 3*4 + 4 = 16
print("超参数: lr=%g, batch=%d, epochs=%d" % (lr, batch_size, epochs))

# 只有 Parameter 会被优化器更新；普通 tensor 不会
```

一句话记法：**`optimizer` 里装的是参数，`optimizer` 外面写的是超参数。**
