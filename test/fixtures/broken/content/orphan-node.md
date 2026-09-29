---
id: orphan-node
title: 孤立节点
domain: foundations
summary: 没有任何前置依赖，也没有任何节点引用它，谁也走不到这里。
prerequisites: []
related: []
tags: []
sources: []
updated_at: 2026-09-29
---

## 直觉

孤立节点在图上是一颗飘着的星星——用户永远无法从别处导航到它。

## 细节

它既没有入边也没有出边，构建应该把它报出来。
