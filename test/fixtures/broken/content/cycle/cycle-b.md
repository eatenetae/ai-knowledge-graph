---
id: cycle-b
title: 环 B
domain: foundations
summary: 环的另一半，前置依赖指回 cycle-a，和它互相依赖成环。
prerequisites:
  - cycle-a
related: []
tags: []
sources: []
updated_at: 2026-09-29
---

## 直觉

和 cycle-a 互相把对方当作前置，学习顺序无法确定。

## 细节

环路径应该被完整打印出来，而不是只说「检测到环」。
