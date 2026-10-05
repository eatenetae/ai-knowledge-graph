---
id: prompt-caching
title: 提示缓存
domain: deployment
pm: useful
summary: 把每次都要重复发的那段话存在服务商那边，下次直接跳过，省钱也省时间。
prerequisites:
  - prompt-engineering
related:
  - inference-cost
tags:
  - 成本优化
  - 工程实践
sources:
  - title: Prompt Caching (Anthropic Docs)
    url: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
  - title: Prompt Caching (OpenAI Docs)
    url: https://platform.openai.com/docs/guides/prompt-caching
updated_at: 2026-10-03
---

## 直觉

每次调用大模型，你发过去的不只是那一个问题——还有系统提示、工具定义、检索回来的文档。这些**每次都一模一样的前缀**，在很多应用里占了请求的大半，而每一次调用你都在为它们全价买单。

提示缓存做的事：让服务商把这段不变的前缀存下来。第一次请求照常（甚至略贵），之后的请求只要前缀和上次对得上，这部分就不再重新计算——按零头计费，回答也更快，因为最重的计算被跳过了。

为什么重要：大量 LLM 应用的账单结构是「一大段固定前缀 + 每次变一点的用户输入」。不对固定部分做缓存，等于每次都重新付一遍装订费。对长系统提示、大知识库的应用，这一项能把固定部分的成本压掉一个数量级。

一个类比：**公司前台的访客登记**。每天来的常客每次都要把姓名、公司、电话、事由从头填一遍。前台看不下去，给他办了张常客卡：以后刷卡进门，登记只剩「今天来干嘛」一行。办卡那次多花两分钟，换来之后每天的一秒钟。

## 细节

**关键机制**

- 缓存按**前缀**匹配：从请求的第一个字节开始逐个对比，第一个不一致的位置之后全部失效。改一个标点，缓存就作废。
- 请求的渲染顺序是**工具 → 系统提示 → 对话历史**，所以要按「稳定在前、易变在后」排布：固定的系统提示和工具定义放前面，时间戳、会话 ID、用户问题放最后。
- 显式缓存要在内容块上打断点（Anthropic 的 `cache_control`）；OpenAI 与 Google 对超过一定长度的前缀自动缓存，不需要标记。
- 缓存有生存期（Anthropic 默认 5 分钟，可显式延长到 1 小时），相邻请求隔太久就失效。
- 太短的前缀缓存不了（约 1024 token 起），一个请求里的断点数量也有限（4 个）。
- 计费量级（以 Anthropic 公布的价格为例）：**写入约 1.25 倍、读取约 0.1 倍**。同一前缀只要被读到第二次就开始赚，读得越多赚得越多。

**最常见的翻车方式**

把「当前时间」或每轮变化的会话 ID 拼在系统提示开头——命中率直接归零，而且账单上看不出为什么。判断方法：看响应里的 `cache_read_input_tokens`，连续几次请求都是 0，就说明前缀里有东西在偷偷变。

**可运行代码**

```python
# pip install anthropic
import anthropic

client = anthropic.Anthropic()  # 读环境变量 ANTHROPIC_API_KEY

SYSTEM = "你是一家电商的客服助手。以下是完整的退货政策……" * 40  # 模拟很长的固定前缀

def ask(question: str) -> None:
    response = client.messages.create(
        model="claude-opus-5",
        max_tokens=200,
        system=[{
            "type": "text",
            "text": SYSTEM,
            "cache_control": {"type": "ephemeral"},  # 在这个内容块上打断点
        }],
        messages=[{"role": "user", "content": question}],
    )
    usage = response.usage
    print(
        f"写入 {usage.cache_creation_input_tokens} tok · "
        f"命中 {usage.cache_read_input_tokens} tok · 未缓存 {usage.input_tokens} tok"
    )

ask("退货要收运费吗？")   # 第一次：前缀写入缓存
ask("换货呢？")           # 第二次：前缀命中缓存，这一段按约 0.1 倍计费
```

连问两次，第二次的「命中」不再是 0——省下的就是那笔重复装订费。
