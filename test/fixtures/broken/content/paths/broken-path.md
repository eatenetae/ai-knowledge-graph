---
id: broken-path
title: 坏掉的路径
summary: 这条路径引用了不存在的节点，而且把同一个节点走了两遍。
audience: 测试用
steps:
  - id: root-node
    note: 第一步是好的
  - id: ghost-node
    note: 这一步引用了不存在的节点
  - id: root-node
    note: 这一步重复了
updated_at: 2026-09-29
---

## 说明

用来验证路径的悬空引用和重复步骤能被检出。
