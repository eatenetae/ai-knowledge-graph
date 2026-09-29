---
id: neural-network
title: 神经网络
domain: neural-networks
summary: 把许多个极简单的判断单元叠在一起，就能拟合出非常复杂的规律。
prerequisites:
  - what-is-machine-learning
related: []
tags:
  - 入门
  - 基础
sources:
  - title: Learning representations by back-propagating errors (Rumelhart, Hinton, Williams, 1986)
    url: https://www.nature.com/articles/323533a0
  - title: Deep Learning (LeCun, Bengio, Hinton, Nature 2015)
    url: https://www.nature.com/articles/nature14539
updated_at: 2026-09-29
---

## 直觉

上一张卡片说「机器学习 = 调参数」。问题是：**用什么函数来装这些参数？**

线性回归只能画直线，遇到「这张图是不是猫」就无能为力了。神经网络给的答案是：**别用一个复杂函数，用一大堆简单函数叠起来。**

每个简单单元只做一件事：把收到的几个数字加权求和，然后决定「要不要被激活」。神奇的地方在于——只要层数够多、单元够多，这种堆叠能逼近**任何**连续函数。简单积木，无限造型。

一个类比：**工厂流水线**。第一道工序只看线条和色块，第二道把线条拼成轮廓，第三道把轮廓认成眼睛和耳朵，最后一道说「这是猫」。每一道工序都很笨，但串起来就完成了谁都写不出规则的任务。

## 细节

**关键机制**

- **一个神经元**：`输出 = 激活函数(输入 · 权重 + 偏置)`。权重和偏置就是被训练的参数。
- **激活函数是非线性的关键**。如果全是线性的，一百层叠起来等价于一层。早期用 Sigmoid/Tanh，现在主流是 **ReLU**（`max(0, x)`）——计算便宜，而且梯度不容易消失。
- **反向传播**：训练时，先向前算出预测（前向传播），再用链式法则把「误差该由每个参数负多少责任」从后往前算一遍（反向传播），然后每个参数按责任大小反向调整一点。这就是 `what-is-machine-learning` 里那个「求梯度 → 更新」的推广版。
- **深度**：层数多 = 能表达更抽象的概念。浅层学边缘和纹理，深层学物体部件，这是卷积网络的经典观察。

**常见误区**

- 参数多不等于强。没有足够数据和正则化，网络会直接把训练集背下来。
- 「神经元」是借来的名字，它和生物神经元的关系比营销话术里说的弱得多。

**可运行代码**

手写一个两层网络做异或（XOR）——这个任务线性模型永远学不会，是「非线性」最直观的证据：

```python
import numpy as np

X = np.array([[0,0],[0,1],[1,0],[1,1]], dtype=float)
y = np.array([[0],[1],[1],[0]], dtype=float)   # XOR

rng = np.random.default_rng(42)
W1 = rng.normal(0, 1, (2, 4)); b1 = np.zeros((1, 4))   # 隐藏层：4 个神经元
W2 = rng.normal(0, 1, (4, 1)); b2 = np.zeros((1, 1))

relu = lambda z: np.maximum(0, z)
for step in range(5000):
    h = relu(X @ W1 + b1)          # 前向：第一层
    pred = h @ W2 + b2             # 前向：第二层
    err = pred - y
    dW2 = h.T @ err; db2 = err.sum(0, keepdims=True)
    dh = (err @ W2.T) * (h > 0)    # 反向：穿过 ReLU 时，负值处梯度为 0
    dW1 = X.T @ dh;  db1 = dh.sum(0, keepdims=True)
    for p, g in ((W1,dW1),(b1,db1),(W2,dW2),(b2,db2)):
        p -= 0.5 * g

print(np.round(relu(X @ W1 + b1) @ W2 + b2, 3).ravel())   # [0. 1. 1. 0.]
```

把 `relu` 换成恒等函数再跑一次，网络就再也学不会 XOR 了——**非线性是深度的前提**。
