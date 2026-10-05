---
id: ci-gate-probe-v2
title: CI 闸门探针（v2）
industry: SaaS
domains:
  - capability-boundaries
nodes:
  - rag
  - this-node-does-not-exist
  - hallucination
tags:
  - 临时
sources: []
updated_at: 2026-10-05
---

## 场景背景

临时探针（v2 破坏性验证）：这个案例的 nodes 挂了一个不存在的知识节点，用来验证 CI 的内容校验拦得住、线上不被污染。验证完立即回滚。

## 决策点

无。这是探针，不是真实案例。

## 决策过程

无。这是探针，不是真实案例。

## 结果与教训

预期：构建校验失败（悬空挂靠），CI 内容 job 红，发布不跑，线上产物保持不变。

## 面试怎么讲

无。这是探针，不是真实案例。
