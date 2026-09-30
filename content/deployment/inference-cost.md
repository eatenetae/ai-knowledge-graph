---
id: inference-cost
title: 推理成本
domain: deployment
summary: 每次调用模型都要花钱，钱主要花在「读进去多少字」和「写出来多少字」上。
prerequisites:
  - autoregressive-generation
  - context-window
  - kv-cache
related:
  - latency-cost-tradeoff
  - model-quantization
  - context-engineering
tags:
  - 部署
  - 成本
  - 必读
sources:
  - title: Efficient Memory Management for Large Language Model Serving with PagedAttention (vLLM, 2023)
    url: https://arxiv.org/abs/2309.06180
  - title: FlashAttention - Fast and Memory-Efficient Exact Attention with IO-Awareness (2022)
    url: https://arxiv.org/abs/2205.14135
  - title: A Survey on Efficient Inference for Large Language Models (2023)
    url: https://arxiv.org/abs/2312.15234
updated_at: 2026-09-29
---

## 直觉

大模型的账单按 **token** 算，不是按「一次调用」算。所以成本的第一课是：**养成按 token 估价的习惯。**

一份 5000 字的中文文档，大约是多少 token？中文大致是 **1 个字 ≈ 0.6-1 个 token**（取决于分词器，见 `tokenization`）。所以 5000 字约 3000-5000 token。你每问一次都带上这份文档，就是每次都在为这几千 token 付费——**用户问十次，你付十次。**

更关键的是**输入和输出价格不一样**：输出通常比输入贵好几倍。原因在 `autoregressive-generation`：**输入可以并行算完，输出必须一个一个串行生成**，GPU 利用率天差地别。

一个类比：**打车计费**。起步价是固定的（系统提示词），里程按公里算（对话长度），堵车时还要加时长费（输出慢）。**想省钱，要么少跑里程，要么别堵在路上。** 而大多数人只盯着「换个便宜车型」（换模型），忽略了前面两项。

## 细节

**关键机制**

- **成本公式**（自建和 API 通用）：
  ```
  单次成本 = 输入 token × 输入单价 + 输出 token × 输出单价
  ```
  自建的话，换成「GPU 小时成本 ÷ 吞吐」——**吞吐取决于批大小**，所以自建的成本模型里，**并发利用率比单次速度更重要**。一张卡跑满和跑 10%，单次成本差十倍。
- **四个最有效的降本手段，按性价比排序**：
  1. **减少输入 token**。这是最大的一块，也最容易被忽视。做法：裁剪历史对话、精简系统提示词、RAG 只取 top-3 而不是 top-10（见 `context-engineering`）。**很多应用的输入有 60% 是浪费的。**
  2. **缓存（prompt caching）**。主流厂商都支持对**不变的前缀**（长系统提示词、固定文档）做缓存，命中时输入价格能降到十分之一左右。**前提是把变化的内容放在提示词末尾**——缓存是按前缀匹配的，中间插一个变量就会让后面全部失效。
  3. **控制输出长度**。在提示词里明确「用三句话回答」比事后截断有效得多。输出单价高，且长度直接决定延迟。
  4. **模型路由**。简单任务（分类、抽取、路由）用便宜的小模型，复杂任务才用大模型。**实践中 70% 的请求可以用小模型处理**，成本能降一个数量级。
- **量化（`model-quantization`）是自建场景的降本手段**：4 位量化让显存需求降到约四分之一，同一张卡能塞更大的模型或更多并发。但**要重跑评估**，掉点风险是真实存在的。
- **算清楚「值不值」**：一次调用 0.01 元，一天 10 万次就是 1000 元，一个月 3 万。**先把量乘出来再决定优化投入**——很多时候真正的问题是调用量，不是单价。

**两个常见的成本陷阱**

1. **把整个知识库塞进系统提示词**。看起来很聪明（「这样就不用检索了」），实际上**每次调用都在为整个知识库付费**。正确做法是 `rag`：只取相关的那几块。
2. **不做输出长度上限**。一个跑飞的循环（见 `multi-step-planning`）能在几分钟内烧掉一天的量。**`max_tokens` 和每日配额上限，两样都要设。**

**可运行代码**

```python
# 一个成本估算器：把「感觉有点贵」变成具体数字
import anthropic

# 单价按各厂商官网填写（这里用相对值示意）
PRICE = {"in": 3.0 / 1_000_000, "out": 15.0 / 1_000_000}   # 每 token

def estimate(system_prompt: str, doc: str, question: str,
             calls_per_day: int, cache_hit: bool = True) -> None:
    client = anthropic.Anthropic()

    # 用官方接口数 token，不要靠字数猜
    def count(text: str) -> int:
        return client.messages.count_tokens(
            model="claude-sonnet-5",
            messages=[{"role": "user", "content": text}],
        ).input_tokens

    n_sys, n_doc, n_q = count(system_prompt), count(doc), count(question)
    n_out = 200                                   # 预估输出长度

    # 缓存命中时，不变的前缀按十分之一计价
    prefix = n_sys + n_doc
    prefix_cost = prefix * PRICE["in"] * (0.1 if cache_hit else 1.0)
    per_call = prefix_cost + n_q * PRICE["in"] + n_out * PRICE["out"]

    print(f"输入构成：系统 {n_sys} + 文档 {n_doc} + 问题 {n_q} token")
    print(f"单次成本：{per_call:.6f} 元")
    print(f"每天 {calls_per_day} 次：{per_call * calls_per_day:.2f} 元")
    print(f"每月约：{per_call * calls_per_day * 30:.0f} 元")
    if not cache_hit:
        print("（未命中缓存；把不变内容放前面、变化内容放最后可以开启缓存）")

estimate(
    system_prompt="你是一个客服助手。" * 20,
    doc="产品手册……" * 500,
    question="退款要几天到账？",
    calls_per_day=100_000,
)
```

把 `cache_hit` 从 `True` 改成 `False` 跑一次，你会看到**成本差出一个数量级**——而代价只是「把固定的内容放在提示词前面」这一个习惯。
