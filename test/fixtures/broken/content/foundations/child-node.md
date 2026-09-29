---
id: child-node
title: 子节点
domain: foundations
summary: 一个合法节点，前置依赖指向根节点，用来提供正常的图结构。
prerequisites:
  - root-node
related: []
tags:
  - 测试
sources: []
updated_at: 2026-09-29
---

## 直觉

同样合法。它和根节点一起，构成坏样例里唯一的正常边。

## 细节

前置依赖是 root-node，方向是 root-node -> child-node。
