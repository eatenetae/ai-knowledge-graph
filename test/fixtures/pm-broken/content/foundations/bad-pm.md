---
id: bad-pm
title: 非法 pm 值
domain: foundations
pm: very-important
summary: pm 字段写了枚举之外的值。
prerequisites:
  - base-node
related: []
tags: []
sources: []
updated_at: 2026-09-29
---

## 直觉

pm 只能是 core 或 useful。

## 细节

枚举校验在 schema 层拦截。
