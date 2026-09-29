---
id: cycle-a
title: 环 A
domain: foundations
summary: 环的一半，前置依赖指向 cycle-b，构成互相依赖。
prerequisites:
  - cycle-b
related: []
tags: []
sources: []
updated_at: 2026-09-29
---

## 直觉

它依赖 cycle-b，而 cycle-b 又依赖它，谁都不能先学。

## 细节

用来验证循环依赖能被检出，并且打印出完整的环路径。
