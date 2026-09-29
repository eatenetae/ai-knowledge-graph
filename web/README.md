# web/ —— 前端占位目录

本目录是**留给前端的位置**，当前阶段不实现任何 UI。

## 约定

- 构建脚本（`node build/index.js`）把产物写到 **`web/public/`**：
  - `web/public/graph.json` —— 图谱数据（节点 + 边）
  - `web/public/paths.json` —— 学习路径数据
- 这两个文件是**构建产物，不入库**（见根目录 `.gitignore`）。全新克隆后跑一次构建即可得到。
- 前端从这里读取数据，静态部署，不引入数据库或后端服务。

## 给阶段 2 的实现者

`graph.json` 只包含**元数据**（id / title / domain / summary / tags / prerequisites / related / sources / updated_at），
不含 L2、L3 的正文——正文在 `content/**/*.md` 里，构建脚本目前不把它们打进产物。

如果前端需要渲染 L2/L3，需要在构建期多产出一份内容包（例如按节点切分的 JSON，或一个 `content.json`）。
这是有意留出的扩展点：**内容模型已经就位，加产出不需要改 `content/` 下的任何文件。**

### graph.json 的形状

```jsonc
{
  "version": 1,
  "generated_at": "2026-09-29T13:40:11Z",
  "edge_semantics": "source -> target 表示「先学 source，才能学 target」",
  "domains": [{ "id": "foundations", "label": "基础概念", "order": 1, "node_count": 2 }],
  "nodes": [
    {
      "id": "transformer",
      "title": "Transformer",
      "domain": "transformer",
      "summary": "一种把「注意力」当主料的网络结构……",   // L1
      "tags": ["核心架构"],
      "prerequisites": ["attention"],
      "related": [],
      "sources": [{ "title": "Attention Is All You Need (2017)", "url": "https://arxiv.org/abs/1706.03762" }],
      "updated_at": "2026-09-29",
      "file": "content/transformer/transformer.md"
    }
  ],
  "edges": [
    { "source": "attention", "target": "transformer", "type": "prerequisite" },
    { "source": "a", "target": "b", "type": "related" }
  ],
  "stats": { "node_count": 23, "edge_count": 35, "domain_count": 12 }
}
```

**边的方向别搞反**：`source` 是前置，`target` 是后继。聚焦模式要的「某节点的完整依赖子图」就是沿 `prerequisite` 边**反向**遍历（从目标节点往回走）。

### paths.json 的形状

```jsonc
{
  "version": 1,
  "generated_at": "...",
  "paths": [
    {
      "id": "llm-app-developer",
      "title": "LLM 应用开发者入门",
      "summary": "从零开始，一路走到能独立做出一个带知识库的问答应用。",
      "audience": "会写 Python、想用大模型做产品……",
      "updated_at": "2026-09-29",
      "steps": [
        { "id": "what-is-machine-learning", "note": "先建立正确的心智模型", "title": "什么是机器学习", "domain": "foundations" }
      ],
      "file": "content/paths/llm-app-developer.md"
    }
  ]
}
```

步骤里已经带上了 `title` 和 `domain`，渲染路径视图不用再回头查 `graph.json`。
