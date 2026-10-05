---
id: latency-cost-tradeoff
title: 延迟与成本的权衡
domain: deployment
pm: core
summary: 更快、更便宜、更准这三件事很难同时要，必须按场景选两个。
prerequisites:
  - inference-cost
  - model-quantization
related:
  - streaming-output
  - inference-cost
  - model-quantization
  - observability
tags:
  - 部署
  - 工程取舍
  - 必读
sources:
  - title: Anthropic 文档：降低延迟
    url: https://docs.anthropic.com/en/docs/build-with-claude/reducing-latency
  - title: Efficient Memory Management for Large Language Model Serving with PagedAttention (vLLM, 2023)
    url: https://arxiv.org/abs/2309.06180
  - title: FlashAttention - Fast and Memory-Efficient Exact Attention with IO-Awareness (2022)
    url: https://arxiv.org/abs/2205.14135
updated_at: 2026-09-29
---

## 直觉

工程上有个老话：**快、好、便宜，只能选两个。** 大模型应用里这句话特别真实，而且**大多数人只盯着「好」，把另外两个当成事后才想的事**——直到账单和用户投诉一起到来。

三个维度会互相拉扯：

- 换**更大的模型** → 更准，但更慢更贵；
- 加长**思维链**（`chain-of-thought`）→ 更准，但输出 token 翻几倍，延迟和成本同步上涨；
- 加**重排序**（`reranking`）→ 更准，但每次请求多几百毫秒；
- 做**量化**（`model-quantization`）→ 更快更便宜，但可能掉点；
- 扩大**检索范围**（top-10 而不是 top-3）→ 召回更全，但输入 token 翻三倍，还更容易「中间迷失」。

**关键认识：这不是一道一次性的选择题，而是每个请求都要做的动态决策。** 一个成熟系统里，不同请求走不同的路径。

一个类比：**出行方式**。赶时间就打车（快、贵），不赶就地铁（便宜、慢），要舒服就专车（贵、舒服）。**没有人会问「哪种交通方式最好」——问题永远是「这一趟，什么最重要」。**

## 细节

**关键机制**

- **先量化目标，再谈优化**。没有数字的优化都是瞎猜。至少要定下：
  - **P50 / P95 延迟**（不是平均值——平均值会掩盖那 5% 的糟糕体验）；
  - **每千次调用成本**；
  - **质量下限**（用 `llm-evaluation` 的评测集守住）。
  **三者缺一，你就无法判断一次优化是赚了还是亏了。**
- **延迟的构成，以及各自的对策**：

  | 环节 | 典型占比 | 优化手段 |
  |---|---|---|
  | 网络往返 | 小 | 选离用户近的区域 |
  | 输入处理（prefill） | 随输入长度增长 | 减少上下文、开前缀缓存 |
  | **输出生成（decode）** | **通常最大** | **减少输出长度**；流式改善体感 |
  | 检索 / 重排 / 工具调用 | 外部依赖决定 | 并行化；加缓存；设超时 |

  **输出长度几乎总是最大的那一项**，因为生成是串行的。**「让它答短一点」往往比换模型更有效。**
- **模型路由（routing）**：先用一个便宜的小模型判断任务难度，简单任务直接小模型处理，复杂任务才升级到大模型。实践中**大部分请求是简单的**（分类、抽取、格式转换），这一步能同时改善延迟和成本。
- **并行化**：多个独立的工具调用、多路检索，全部**并发发出**而不是串行等待。这一步经常能把延迟砍掉一半，而且**不牺牲任何质量**——是最该先做的一件事。
- **缓存**：
  - **精确缓存**：相同问题直接返回上次的答案。适合 FAQ 类场景。
  - **语义缓存**：问题向量相似度超过阈值就复用答案。能提高命中率，但有**答错的风险**——阈值必须用真实数据校准。
  - **前缀缓存**：见 `inference-cost`，对固定前缀最有效。
- **降级策略（graceful degradation）**：高峰期或上游故障时，主动降低质量而不是直接报错——少检索几块、跳过重排、换小模型。**关键是把降级做成显式的、可观测的开关，而不是悄悄发生。**

**一个决策顺序（按性价比）**

```
1. 并行化独立调用           —— 零质量代价，立竿见影
2. 开启前缀缓存             —— 零质量代价
3. 限制输出长度             —— 通常还能提升质量（更简洁）
4. 减少检索块数 + 加重排     —— 质量可能反而上升
5. 模型路由                 —— 需要评测集支撑
6. 量化                     —— 需要重跑评测
7. 换更小的模型             —— 最后手段，必须评估兜底
```

**可运行代码**

```python
# 用 P95 而不是平均值来评估延迟 —— 平均值会骗人
import time, statistics

def measure(fn, n: int = 50):
    latencies = []
    for _ in range(n):
        t0 = time.perf_counter()
        fn()
        latencies.append((time.perf_counter() - t0) * 1000)
    latencies.sort()

    def pct(p):
        return latencies[min(int(len(latencies) * p), len(latencies) - 1)]

    print(f"  平均 {statistics.mean(latencies):7.0f}ms   ← 这个数字最没用")
    print(f"  P50  {pct(0.50):7.0f}ms")
    print(f"  P95  {pct(0.95):7.0f}ms   ← 用户抱怨的是这个")
    print(f"  P99  {pct(0.99):7.0f}ms")
    return pct(0.95)

# 对比两种实现：串行 vs 并行
def serial():
    for _ in range(3):
        time.sleep(0.05)          # 假装是三次独立的检索

def parallel():
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor() as pool:
        list(pool.map(lambda _: time.sleep(0.05), range(3)))

print("串行三次检索:")
measure(serial)
print("并行三次检索:")
measure(parallel)
```

这段跑出来的对比，是**「优化延迟」这件事里唯一一个不需要任何取舍的动作**：三个独立调用并行发出，延迟直接降到三分之一，质量一点没变。**先做这个，再考虑要不要动模型。**
