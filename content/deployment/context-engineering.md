---
id: context-engineering
title: 上下文工程
domain: deployment
pm: core
summary: 精心安排模型这一次能看到的所有内容，而不只是打磨你写的那句话。
prerequisites:
  - context-window
  - prompt-engineering
related:
  - rag
  - prompt-injection
  - inference-cost
  - multi-step-planning
tags:
  - 应用开发
  - 进阶
  - 必读
sources:
  - title: Lost in the Middle - How Language Models Use Long Contexts (2023)
    url: https://arxiv.org/abs/2307.03172
  - title: Anthropic - Effective context engineering for AI agents
    url: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
  - title: Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (2020)
    url: https://arxiv.org/abs/2005.11401
updated_at: 2026-09-29
---

## 直觉

提示工程（prompt engineering）关注的是「**我写的那句话**怎么说更好」。但真实应用里，模型看到的远不止你写的那句话：

```
[系统提示词] + [检索到的文档] + [历史对话] + [工具返回的结果] + [用户这句话]
```

这五部分一起挤在有限的上下文窗口里。**上下文工程（context engineering）管的是整体怎么安排**——哪部分该留、哪部分该扔、按什么顺序摆、预算怎么分配。

为什么它比提示工程更重要：**模型的效果不取决于你写的那句话有多好，而取决于它这一刻看到的全部内容。** 系统提示词写得再漂亮，如果检索塞了 10 段无关文档、历史对话占了 80% 的窗口、工具返回了一大坨 JSON——模型照样答不好。

一个类比：**给专家准备briefing材料**。你不会把公司所有文件都堆到他桌上，也不会只递一张便签。你会挑出**这次决策真正需要的几份**，按重要性排序，把最关键的那份放在最上面。**上下文工程就是这份材料怎么选、怎么排。**

## 细节

**关键机制**

- **预算分配（budgeting）**：上下文窗口是**固定资源**，必须像分预算一样分配。一个可用的起点：

  | 部分 | 建议占比 | 超了怎么办 |
  |---|---|---|
  | 系统提示词 | 5%-10% | 精简；重复的规则合并 |
  | 检索资料 | 30%-50% | 减少块数、加重排、压缩摘要 |
  | 历史对话 | 10%-20% | 滚动摘要，只留最近 N 轮 |
  | 工具结果 | 10%-20% | **只取需要的字段，别回传整个 JSON** |
  | 留给输出 | 至少 20% | 输出也要占窗口，别把窗口塞满 |

  **最后一行最常被忽略**：上下文窗口是输入和输出**共享**的。输入塞满 128K，模型就没有空间写回答了。
- **顺序很重要（Lost in the Middle）**：实验很清楚——模型对**开头和结尾**的信息利用最好，**中间的最容易被忽略**。所以：
  - 最关键的指令放**开头**（系统提示词）；
  - 最相关的资料放**开头和结尾**，别放中间；
  - 用户当前的问题放**最后**（紧挨着生成位置，影响最大）。
- **压缩（compaction）**：对话变长时，不要简单地丢掉早期内容，而是**让模型把前面的对话总结成一段话**再放回去。这样保留了要点，token 数却大幅下降。这是长会话 Agent 的标准做法。
- **隔离（isolation）**：不要让一个 Agent 背着所有东西跑。把子任务交给**独立的子 Agent**，它有自己的干净上下文，只把结论返回给主流程。**上下文污染是 Agent 长任务失败的头号原因**——一个跑偏的工具返回能把后面所有推理带歪。
- **最小必要原则**：**能不给的就不给。** 每多塞一段内容，就多一分被忽略、被误解、被注入的风险（见 `prompt-injection`），也多一分成本（见 `inference-cost`）。**上下文不是越多越好，是越准越好。**

**三个最常见的错误**

1. **把整个 JSON 塞进上下文**。工具返回 5000 行的响应，你全塞进去——模型只需要其中 3 个字段。**在代码里先裁剪，再喂给模型。**
2. **历史对话无限增长**。聊到第 50 轮时，前面 49 轮还在窗口里占着位置，而用户早就换话题了。
3. **系统提示词越写越长**。每次出问题就加一条规则，半年后系统提示词有 3000 token，里面还有互相矛盾的条款。**定期重写，而不是不断追加。**

**可运行代码**

```python
# 一个上下文预算管理器：超预算时按优先级裁剪，而不是截断
import anthropic

client = anthropic.Anthropic()

class ContextBuilder:
    def __init__(self, max_tokens: int = 8000):
        self.max_tokens = max_tokens
        self.parts = []      # (优先级, 名称, 内容)

    def add(self, name: str, content: str, priority: int):
        """priority 越小越重要，最先被保留"""
        self.parts.append((priority, name, content))
        return self

    def _count(self, text: str) -> int:
        return client.messages.count_tokens(
            model="claude-sonnet-5",
            messages=[{"role": "user", "content": text}]).input_tokens

    def build(self, reserve_for_output: int = 1000) -> str:
        budget = self.max_tokens - reserve_for_output
        kept, dropped = [], []

        # 按优先级从高到低填，填不下就丢（丢的是最不重要的）
        for priority, name, content in sorted(self.parts):
            cost = self._count(content)
            if cost <= budget:
                kept.append(content)
                budget -= cost
            else:
                dropped.append(f"{name}({cost} token)")

        if dropped:
            print(f"⚠ 因预算不足被裁剪：{', '.join(dropped)}")
        return "\n\n".join(kept)

ctx = (ContextBuilder(max_tokens=2000)
       .add("系统提示词", "你是客服助手，只依据资料回答。", priority=0)
       .add("检索资料", "退款将在 3 个工作日内原路退回。" * 30, priority=2)
       .add("历史对话", "用户：你好\n助手：您好" * 50, priority=3)
       .add("当前问题", "退款要几天？", priority=1))

print(ctx.build())
```

注意 `reserve_for_output` 那个参数：**它是很多「上下文塞满后模型突然不回答」问题的解药。** 输入占满了窗口，模型就没有余量生成输出了。
