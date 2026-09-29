# ai-knowledge-graph

AI 知识图谱：内容驱动的 AI 行业知识网络，三层讲解 + 依赖路径 + 持续更新。

**内容即数据。** 每个知识点就是 `content/` 下的一个 Markdown 文件，图谱、索引、学习路径全部由构建期自动生成。没有数据库，没有手工维护的大图。

## 快速开始

需要 Node.js 20 或更高版本。**没有任何第三方依赖**，不需要 `npm install`。

```bash
node build/index.js
```

一条命令完成校验并产出：

```
✓ 内容校验通过

  节点 23 个 · 边 35 条（前置 27 / 相关 8） · 领域 12 个 · 路径 4 条
  已写出 web/public/graph.json
  已写出 web/public/paths.json
```

校验不通过时，构建**以非零码退出**，并打印可读的错误（见「构建失败长什么样」）。

## 目录结构

```
content/                  知识点与路径，唯一需要人写的地方
  foundations/            按领域分子目录（目录名建议与 domain 一致，但不强制）
  transformer/
  ...
  paths/                  学习路径定义
schema/
  node.schema.json        节点 frontmatter 的 JSON Schema（字段契约的唯一出处）
  path.schema.json        学习路径的 JSON Schema
  domains.json            领域登记表（id / 展示名 / 排序），构建期校验与 schema 一致
build/
  index.js                构建入口
  lib/
    frontmatter.js        frontmatter 解析（YAML 子集，报错带行号）
    schema-validator.js   JSON Schema 校验（报错是中文，字段级定位）
    load-content.js       扫描 content/、读取 schema
    graph.js              建图 + 跨文件检查（悬空 / 环 / 孤立 / 重复）
    serialize.js          产出 graph.json / paths.json
    problems.js           问题的统一表示与渲染
test/                     单元测试 + 故意损坏的 fixture
web/                      前端占位目录，见 web/README.md
```

## 命令

| 命令 | 作用 |
|---|---|
| `node build/index.js` | 校验并写出 `web/public/graph.json` 和 `paths.json` |
| `node build/index.js --check` | 只校验，不写文件（CI / pre-commit 用） |
| `node build/index.js --quiet` | 只输出结论 |
| `npm run build` / `npm run build:graph` | 同上（等价于第一条） |
| `npm test` | 跑全部单元测试 |

## 三层内容模型

| 层 | 内容 | 放在哪 | 给谁看 |
|---|---|---|---|
| **L1** | 一句话说清「是什么」，**零术语** | frontmatter 的 `summary` | 完全的新手 |
| **L2** | 为什么重要、解决什么问题、一个类比 | 正文 `## 直觉` | 想建立直觉的人 |
| **L3** | 关键机制、代表论文、可运行代码 | 正文 `## 细节` | 要动手的人 |

L1 放在 frontmatter 是刻意的：**列表页只读 frontmatter 就能渲染，不用解析全文。**

## Schema：每个字段的含义

见 `schema/node.schema.json`。这是字段契约的唯一出处，构建期按它校验，改契约改这一个文件。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✅ | 稳定唯一标识。小写 kebab-case，**同时是文件名和图节点 key，一经使用不可更改**（改 id 等于换一个节点）。 |
| `title` | string | ✅ | 中文标题，2-40 字。 |
| `domain` | string | ✅ | 所属领域，必须是 `schema/domains.json` 里登记过的 id 之一。决定图谱分组与配色。 |
| `summary` | string | ✅ | **L1**，10-100 字，零术语。一句话说清「是什么」。 |
| `prerequisites` | string[] | ✅ | 前置节点 id 列表，最多 8 个。**构成图谱的边**，含义是「学它之前需要先懂什么」。必须指向已存在的节点，且整体不可成环。没有前置就写 `[]`。 |
| `related` | string[] | ✅ | 相关节点 id 列表，最多 8 个。**弱关联**，不构成学习路径约束，也不参与环检测。没有就写 `[]`。 |
| `tags` | string[] | ✅ | 自由标签，最多 10 个，用于检索与筛选。没有就写 `[]`。 |
| `sources` | object[] | ✅ | 原始资料（论文、官方文档）。每项是 `{ title, url }`，`url` 必须是完整 http(s) 链接。没有就写 `[]`。 |
| `updated_at` | string | ✅ | 最后更新日期，`YYYY-MM-DD`。 |

正文必须包含两个小节，且不能为空：`## 直觉`（L2）和 `## 细节`（L3）。

路径文件的字段见 `schema/path.schema.json`：`id` / `title` / `summary` / `audience` / `steps` / `updated_at`，
其中 `steps` 是 `{ id, note? }` 的列表，`id` 必须指向已存在的节点。

### frontmatter 支持的写法

构建脚本自带一个**刻意做小的 YAML 子集**（换来零依赖 + 带行号的报错）。支持：

```yaml
key: 字符串                  # 标量一律按字符串处理
key: "带 空格 的字符串"
key: []                      # 空列表（推荐，比留空更明确）
key: [a, b, c]               # 行内列表
key:                         # 块状列表
  - a
  - b
sources:                     # 块状对象列表
  - title: 一篇论文
    url: https://arxiv.org/abs/1706.03762
```

**不支持**：多行字符串（`|` / `>`）、锚点与别名（`&` / `*`）、两层以上的嵌套结构、行尾注释
（`#` 只有独占一行时才是注释——这样 URL 里的 `#` 不会被吃掉）。

缩进必须用**空格**（2 个），不能用 Tab。

## 新增一个节点

1. **挑一个领域**，在 `schema/domains.json` 里找它的 id（比如 `retrieval`）。
2. **建文件**：`content/<领域目录>/<id>.md`。文件名必须和 `id` 完全一致。
3. **抄这个模板**：

```markdown
---
id: vector-database
title: 向量数据库
domain: retrieval
summary: 专门用来在几百万条「意思」里，飞快找出跟你的问题最接近的那几条。
prerequisites:
  - embedding
related: []
tags:
  - 工程实践
sources:
  - title: Efficient and Approximate Nearest Neighbor Search Using HNSW (2016)
    url: https://arxiv.org/abs/1603.09320
updated_at: 2026-09-29
---

## 直觉

（L2：为什么重要、解决什么问题、一个类比。写给刚听懂 L1 的人。）

## 细节

（L3：关键机制、代表论文、可运行代码。写给要动手的人。）
```

4. **跑一次 `node build/index.js`**，按提示改到通过。

### 写的时候注意

- **`summary` 要真的零术语**。不要出现「梯度」「嵌入」「注意力」这类词——那是 L2 的事。判断标准：完全不懂 AI 的人读一遍，能不能说出「哦，是干这个的」。
- **`prerequisites` 只写「不先懂就学不会」的**，不要把沾边的都塞进来。它是学习路径的约束，塞多了路径就走不通。
- **只沾边、不构成前置的，放 `related`**。它不会影响学习顺序。
- **新节点必须连进图里**。要么它有前置，要么有别的节点把它列为前置——否则构建会报「孤立节点」。这是有意的：**用户走不到的节点等于不存在。**

## 构建会检查什么

| 检查 | 报错长什么样 |
|---|---|
| Schema 校验 | 指明文件 + 字段 + 为什么错 |
| 重复 id | 指出是哪个文件先用掉的 |
| 文件名与 id 不一致 | 给出正确的文件名 |
| 悬空依赖 | 给出最接近的候选（「你是不是想写 X？」） |
| 自引用 | 节点把自己列为前置 |
| 循环依赖 | **打印完整的环路径** |
| 孤立节点 | 既无入边也无出边 |
| 路径悬空 / 重复步骤 | 指明是第几步 |

域登记表与 schema 的一致性、路径步骤的前置顺序也会检查——后者只是**提示**，不影响构建。

### 构建失败长什么样

```
✗ 构建失败，共 1 个问题：

  1) content/transformer/transformer.md
     字段 `prerequisites[0]`：悬空依赖：前置依赖 `attentoin` 不存在
     ↳ 你是不是想写 `attention`？

提示：README 的「新增一个节点」一节写了每个字段的写法。
```

环检测会打印完整路径，而不是只说「检测到环」：

```
✗ 构建失败，共 1 个问题：

  1) content/transformer/transformer.md
     字段 `prerequisites`：循环依赖：transformer → attention → embedding → transformer
     ↳ 这 3 个节点互为前置，学习顺序无法确定；断开其中任意一条边即可
```

## 产出物

构建写到 `web/public/`，**不入库**（构建产物，见 `.gitignore`）：

- **`graph.json`** —— `nodes`（id / title / domain / summary / tags / prerequisites / related / sources / updated_at）、`edges`（`source` / `target` / `type`）、`domains`、`stats`。
- **`paths.json`** —— 学习路径，步骤里已带 `title` 和 `domain`。

**边的方向**：`source -> target` 表示「先学 `source`，才能学 `target`」。
所以「聚焦模式」要的依赖子图，是沿 `prerequisite` 边从目标节点**反向**遍历。

字段细节和 JSON 样例见 `web/README.md`。

## 测试

```bash
npm test
```

覆盖：frontmatter 解析（含各种坏写法）、Schema 校验通过/失败、悬空依赖、循环依赖、孤立节点、
重复 id、文件名一致性、路径检查、边方向与去重、端到端构建与产物结构。

其中 `test/fixtures/broken/` 是一个**故意写坏的内容仓库**，覆盖了上表里的每一类错误；
测试会断言错误信息「指明了文件、字段和原因，且不含堆栈或英文断言」。真实内容仓库本身也被当作
一个测试用例跑一遍。

## 设计约束

- **内容即数据**：图谱由内容文件生成，禁止手工维护一张大图，禁止用数据库存内容。
- **零依赖构建**：`node build/index.js` 直接能跑，不需要 `npm install`。JSON Schema 校验器和
  frontmatter 解析器都是自己实现的——唯一目的是让每条错误信息都能写成「哪个文件、哪个字段、为什么错」。
- **首版不引入数据库、账户、后端服务**，前端静态部署。
