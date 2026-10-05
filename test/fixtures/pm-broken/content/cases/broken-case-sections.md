---
id: broken-case-sections
title: 正文缺小节的案例
industry: 测试行业
domains:
  - domain-one
nodes:
  - fine-node
  - base-node
  - mid-node
tags: []
sources: []
updated_at: 2026-09-29
---

## 场景背景

frontmatter 合法，但正文缺「决策过程」和「面试怎么讲」两节。

## 决策点

1. 缺节必须报错。

## 结果与教训

构建失败。
