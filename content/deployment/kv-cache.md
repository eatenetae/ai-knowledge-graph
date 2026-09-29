---
id: kv-cache
title: KV Cache
domain: deployment
summary: 把前面算过的中间结果存下来，写每个新字时就不用从头重算一遍。
prerequisites:
  - autoregressive-generation
  - attention
related:
  - inference-cost
  - context-window
  - latency-cost-tradeoff
tags:
  - 推理
  - 性能优化
  - 必读
sources:
  - title: Efficient Memory Management for Large Language Model Serving with PagedAttention (vLLM, 2023)
    url: https://arxiv.org/abs/2309.06180
  - title: Fast Transformer Decoding - One Write-Head is All You Need (MQA, 2019)
    url: https://arxiv.org/abs/1911.02150
  - title: GQA - Training Generalized Multi-Query Transformer Models (2023)
    url: https://arxiv.org/abs/2305.13245
updated_at: 2026-09-29
---

## 直觉

自回归生成有个巨大的浪费：**写第 100 个字的时候，前面 99 个字的信息已经算过了，但每一步都要重新算一遍。**

注意力机制里，每个 token 会生成三个向量：Query（我在找什么）、Key（我是什么）、Value（我有什么）。当新 token 进来时，它需要和**前面所有 token 的 Key 和 Value** 做计算。而前面那些 token 的 Key 和 Value——**它们从头到尾没有变过。**

那为什么要重算？**存下来就好了。**

KV Cache 就是干这个的：把每一步算出来的 Key 和 Value 缓存起来，下一个 token 来时直接用缓存，只算新 token 自己的那一份。效果是**把每一步的计算量从「和序列长度成正比」降到「几乎恒定」**。

为什么它是推理优化的第一课：**没有 KV Cache，大模型的推理速度会慢到无法商用。** 它不是「优化项」，它是所有推理引擎的默认配置。

一个类比：**读书做笔记**。不缓存的话，每读一个新段落都要把前面所有段落重读一遍，才能理解上下文——读第 100 页时要重读前 99 页。做笔记（缓存）之后，你只需要读新的一页，再翻一下笔记。**笔记占地方（显存），但省下的时间是指数级的。**

## 细节

**关键机制**

- **缓存的是什么**：每一层、每个注意力头、每个已生成 token 的 **K 和 V 矩阵**。Q 不需要缓存——它只用一次，算完就丢。
- **显存占用公式**（这是部署时最该背下来的一个）：
  ```
  KV Cache 大小 = 2 × 层数 × 注意力头数 × 头维度 × 序列长度 × 批大小 × 精度字节数
  ```
  其中 `2` 是 K 和 V 两份。**它和序列长度、批大小都成正比**——这解释了长上下文和高并发为什么同时吃显存。
  一个具体例子：7B 模型（32 层、32 头、头维度 128、FP16），单条 8K 上下文的 KV Cache 约为 `2 × 32 × 32 × 128 × 8192 × 2 字节 ≈ 4.3 GB`。**比模型本身（14 GB）的三分之一还多**，而且这只是一条请求。
- **三种压缩手段**（都是为了省这块显存）：
  - **MQA（多查询注意力）**：所有注意力头**共享同一份 K/V**。显存降到 1/头数，但效果有损失。
  - **GQA（分组查询注意力）**：折中方案——头分成若干组，组内共享 K/V。**今天主流大模型基本都用 GQA**（Llama 3、Qwen 等都是）。
  - **PagedAttention（vLLM 的核心创新）**：借鉴操作系统的**虚拟内存分页**，把 KV Cache 切成固定大小的块，按需分配、可以不连续存放。它把显存碎片从 60%-80% 的浪费降到几乎为零，**同一张卡能服务的并发数因此提升好几倍**。
- **两个容易被忽略的点**：
  1. **缓存是「按会话」的**。多轮对话里，前几轮的 KV Cache 可以复用——这就是为什么**多轮对话的第二轮通常比第一轮快**。但如果中途改了系统提示词，整个缓存就作废，必须重算。
  2. **前缀缓存（prefix caching）**：多个请求共享相同的前缀（比如同一段长系统提示词），可以复用同一份 KV Cache。**在系统提示词很长的应用里，这一项能省掉大量重复计算**，是目前最划算的优化之一。

**和「上下文窗口」的关系**

上下文窗口决定「能塞多少」，KV Cache 决定「塞这么多要花多少显存」。**两者相乘才是真实的部署成本。** 很多团队选了支持 128K 的模型，上线才发现：并发 10 个 128K 请求就把显存吃光了——瓶颈不在模型，在 KV Cache。

**可运行代码**

```python
# 用一个极简实现说明 KV Cache 到底省了什么
import torch, torch.nn.functional as F

def attention_step(x, cache=None):
    """单步注意力：x 是当前 token 的表示 (1, d)"""
    K_new = x @ torch.randn(x.shape[-1], x.shape[-1])
    V_new = x @ torch.randn(x.shape[-1], x.shape[-1])

    if cache is None:
        K, V = K_new, V_new
    else:
        K = torch.cat([cache[0], K_new], dim=0)     # 复用历史，只追加新的
        V = torch.cat([cache[1], V_new], dim=0)

    scores = (x @ K.T) / (x.shape[-1] ** 0.5)
    out = F.softmax(scores, dim=-1) @ V
    return out, (K, V)                              # 返回新缓存

torch.manual_seed(0)
cache, x = None, torch.randn(1, 64)

for step in range(5):
    out, cache = attention_step(x, cache)
    k_bytes = cache[0].numel() * 4
    print(f"第 {step+1} 步：K 的形状 {tuple(cache[0].shape)}，缓存 {k_bytes} 字节")

print("\n每步新增的计算量固定为 1 个 token，而不是重算全部历史。")
```

关键在 `torch.cat([cache[0], K_new])` 这一行：**历史部分原样复用，只追加当前 token。** 真实推理引擎不会真的做 `cat`（那样反而慢），而是预分配一块连续显存往里写——但**语义上做的就是这件事**。
