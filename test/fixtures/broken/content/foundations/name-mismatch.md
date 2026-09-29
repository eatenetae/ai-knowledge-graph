---
id: totally-different
title: 文件名对不上
domain: foundations
summary: 这个节点的 id 和文件名不一致，用来触发文件名校验。
prerequisites:
  - root-node
related: []
tags: []
sources: []
updated_at: 2026-09-29
---

## 直觉

文件叫 name-mismatch.md，id 却叫 totally-different，构建应该拒绝。

## 细节

id 是图节点 key，文件名是它的落盘位置，两者必须一致。
