---
id: training-vs-inference
title: 训练与推理
domain: foundations
summary: 一个模型一辈子只学一次，之后每次回答都只是把学到的拿出来用。
prerequisites:
  - neural-network
  - loss-function
related:
  - llm-pretraining
  - inference-cost
  - catastrophic-forgetting
tags:
  - 入门
  - 基础
sources:
  - title: PyTorch 官方文档：模型的训练模式与评估模式
    url: https://pytorch.org/docs/stable/generated/torch.nn.Module.html
  - title: Deep Learning（Goodfellow 等）第 5 章 机器学习基础
    url: https://www.deeplearningbook.org/contents/ml.html
updated_at: 2026-09-29
---

## 直觉

模型的生命分成两段，中间隔着一堵墙：

**训练（training）**：你给它海量数据，它一遍遍猜、一遍遍被纠正，参数在这个过程中不断变化。这一段又慢又贵，可能要几千张显卡跑几个月。

**推理（inference）**：训练结束后参数就**冻住了**。之后每一次回答，模型都是拿这套固定的参数算一遍，参数一个都不会变。

这堵墙带来一个很多人想不通的结论：**你在对话里告诉模型的事，它不会记住。** 你说「我叫小明」，它这一轮回答里会用上；换个新会话，它就完全不知道了。不是它忘了，是**推理阶段根本没有「记」这个动作**——没有任何东西被写回参数。

一个类比：**考试前背书的你和考场上答题的你**。考场上的你只能调用脑子里已经有的东西，做错一道题并不会让脑子里的知识当场更新。想让下次考得更好，只能**考完回去重新学**——那就是下一轮训练。

## 细节

**关键机制**

- **训练时有两个模式，行为不一样**：
  - `model.train()`：开启 Dropout（随机丢弃一部分神经元，防止过拟合）和 BatchNorm 的批统计更新；
  - `model.eval()`：关掉它们，让输出稳定可复现。
  - **推理时忘了切 `eval()` 是最常见的低级 bug**：同一个输入两次得到不同结果，你会以为是模型不稳定，其实是 Dropout 还开着。
- **不需要梯度就别算**：推理时用 `torch.no_grad()` 或 `@torch.inference_mode()`。训练时必须保存中间结果才能反向求梯度，这些中间结果占的显存常常比参数本身还多。关掉之后，显存占用能降一大截，速度也更快。
- **量级差别**：训练是「前向 + 反向」，一次要算两遍还多；推理只有前向。所以**同一张卡，推理能服务的吞吐远高于训练**。这也解释了为什么 API 按 token 计费时，输入（一次前向）比输出便宜——输出是逐 token 串行生成的，见 `autoregressive-generation`。
- **在线学习（online learning）是个例外，但很少真用**：理论上可以让模型边服务边更新参数，实践中几乎不做——参数一改，所有行为都变，评估过的效果全部作废，还可能出现灾难性遗忘（`catastrophic-forgetting`）。工业界的做法是**定期离线重训 + 用检索补新知识**（`rag`）。

**一个直接推论**

「模型怎么知道我上周发布的新产品？」——它不知道。要么把资料放进上下文（RAG），要么重新训练。**没有第三条路。** 想清楚这一点，能省下很多无用的尝试。

**可运行代码**

```python
import torch, torch.nn as nn

model = nn.Sequential(nn.Linear(4, 8), nn.Dropout(0.5), nn.Linear(8, 1))
x = torch.randn(1, 4)

model.train()                       # 训练模式：Dropout 生效
print("train 两次:", model(x).item(), model(x).item())   # 结果不同

model.eval()                        # 推理模式：Dropout 关闭
with torch.inference_mode():        # 不建计算图，省显存
    print("eval  两次:", model(x).item(), model(x).item())  # 结果相同

# 参数量没变，行为变了 —— 这就是「模式」的影响
print("参数量:", sum(p.numel() for p in model.parameters()))
```
