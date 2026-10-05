---
id: dangling-case
title: 挂靠节点与能力域都悬空的案例
industry: 测试行业
domains:
  - domain-one
  - not-registered
nodes:
  - fine-node
  - base-node
  - ghost-case-node
tags: []
sources: []
updated_at: 2026-09-29
---

## 场景背景

挂靠了一个不存在的节点，引用了一个未登记的能力域。

## 决策点

1. nodes 里混进拼错的 id。
2. domains 里写了没登记的域。

## 决策过程

悬空引用必须让构建失败。

## 结果与教训

构建失败。

## 面试怎么讲

这是坏样例。
