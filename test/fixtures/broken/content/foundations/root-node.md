---
id: root-node
title: 根节点
domain: foundations
summary: 一个合法的、没有前置依赖的基础节点，用作其他坏样例的挂载点。
prerequisites: []
related:
  - child-node
tags:
  - 测试
sources:
  - title: 示例资料
    url: https://example.com/root
updated_at: 2026-09-29
---

## 直觉

这是一个完全合法的节点，用来保证坏样例里只有我们想测的那几个问题。

## 细节

它没有前置依赖，但被别的节点引用，所以不算孤立节点。
