# ai-knowledge-graph

AI 知识图谱：内容驱动的 AI 知识网络，三层讲解 + 依赖路径 + 决策案例 + 面试题库。

[![CI](https://github.com/eatenetae/ai-knowledge-graph/actions/workflows/ci.yml/badge.svg)](https://github.com/eatenetae/ai-knowledge-graph/actions/workflows/ci.yml)

## 线上地址

**https://eatenetae.github.io/ai-knowledge-graph/**

**v2 定位：面向 AI 产品经理。** 站点正在从「学 AI 的知识地图」再定位为 AI PM 的学习与面试准备工具——理清需要掌握哪些知识（六大能力域 + 节点 `pm` 标注 + 必修地图）、面试前必须学会什么（面试冲刺路径 + 题库）、用具体案例建立判断力（PM 决策型案例库）。其他受众的学习路径保留但从属。

**内容即数据。** 每个知识点就是 `content/` 下的一个 Markdown 文件，图谱、索引、学习路径、案例库、题库全部由构建期自动生成。没有数据库，没有手工维护的大图。

想往图谱里加东西？直接看 **[CONTRIBUTING.md](CONTRIBUTING.md)**——这份 README 讲这个项目是什么，那份讲你怎么改它。

## 快速开始

需要 Node.js 20 或更高版本。**内容构建没有任何第三方依赖**，不需要 `npm install`。

```bash
node build/index.js
```

一条命令完成校验并产出：

```
✓ 内容校验通过

  节点 55 个 · 边 165 条（前置 72 / 相关 93） · 领域 12 个 · 路径 7 条
  PM 标注：core 25 个（覆盖 6 个能力域） · useful 26 个
  案例 2 个 · 面试题 3 道
  已写出 web/public/graph.json
  已写出 web/public/paths.json
  已写出 web/public/content.json
  已写出 web/public/cases.json
  已写出 web/public/interview.json
```

校验不通过时，构建**以非零码退出**，并打印可读的错误（见「构建失败长什么样」）。

想看站点，接着起前端（这一步需要 `npm install`）：

```bash
cd web && npm install && npm run dev
```

## 目录结构

```
content/                  知识点与路径，唯一需要人写的地方
  foundations/            按领域分子目录（目录名建议与 domain 一致，但不强制）
  transformer/
  ...
  paths/                  学习路径定义
  cases/                  PM 决策案例（v2）
  interview/              AI PM 面试题（v2）
schema/
  node.schema.json        节点 frontmatter 的 JSON Schema（字段契约的唯一出处）
  path.schema.json        学习路径的 JSON Schema
  case.schema.json        案例的 JSON Schema（v2）
  interview-question.schema.json  面试题的 JSON Schema（v2）
  domains.json            领域登记表（id / 展示名 / 排序），构建期校验与 schema 一致
  pm-domains.json         PM 六大能力域登记表 + 必修节点（v2），构建期双向校验
build/
  index.js                构建入口
  lib/
    frontmatter.js        frontmatter 解析（YAML 子集，报错带行号）
    schema-validator.js   JSON Schema 校验（报错是中文，字段级定位）
    load-content.js       扫描 content/、读取 schema
    graph.js              建图 + 跨文件检查（悬空 / 环 / 孤立 / 重复）
    pm.js                 PM 体系的跨文件校验（挂靠 / 能力域 / 标注约束）（v2）
    serialize.js          产出五个产物 JSON
    problems.js           问题的统一表示与渲染
test/                     单元测试 + 故意损坏的 fixture
web/                      前端（Vite + React + TS），见 web/README.md
docs/
  content-patrol.md       内容巡检流程：扫什么、按什么标准筛、产出成什么样
  pm-competency.md        AI PM 六大能力域框架：为什么是这六个、pm 标注怎么打（v2）
.github/workflows/
  ci.yml                  校验 → 构建 → 浏览器冒烟 → 发布
CONTRIBUTING.md           怎么改这个项目（新增节点 / 路径 / 案例 / 面试题 / 依赖怎么定 / 报错怎么办）
CHANGELOG.md              变更记录与格式约定
```

## 命令

内容侧（零依赖）：

| 命令 | 作用 |
|---|---|
| `node build/index.js` | 校验并写出 `web/public/` 下的五个产物 |
| `node build/index.js --check` | 只校验，不写文件（CI / pre-commit 用） |
| `node build/index.js --quiet` | 只输出结论 |
| `npm run build` / `npm run build:graph` | 同上（等价于第一条） |
| `npm test` | 跑内容侧全部单元测试 |

前端（在 `web/` 下）：

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发服务器 |
| `npm run build` | 类型检查 + 打包出纯静态的 `dist/` |
| `npm run preview` | 预览 `dist/` |
| `npm test` | 跑前端逻辑的单元测试 |

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
| `pm` | string | — | 可选（v2）。`core` = AI PM 面试前必须掌握（还要登记进 `schema/pm-domains.json` 的能力域）；`useful` = 相关但非必须；不写 = 无 PM 标记。见 `docs/pm-competency.md`。 |
| `summary` | string | ✅ | **L1**，10-100 字，零术语。一句话说清「是什么」。 |
| `prerequisites` | string[] | ✅ | 前置节点 id 列表，最多 8 个。**构成图谱的边**，含义是「学它之前需要先懂什么」。必须指向已存在的节点，且整体不可成环。没有前置就写 `[]`。 |
| `related` | string[] | ✅ | 相关节点 id 列表，最多 8 个。**弱关联**，不构成学习路径约束，也不参与环检测。没有就写 `[]`。 |
| `tags` | string[] | ✅ | 自由标签，最多 10 个，用于检索与筛选。没有就写 `[]`。 |
| `sources` | object[] | ✅ | 原始资料（论文、官方文档）。每项是 `{ title, url }`，`url` 必须是完整 http(s) 链接。没有就写 `[]`。 |
| `updated_at` | string | ✅ | 最后更新日期，`YYYY-MM-DD`。 |

正文必须包含两个小节，且不能为空：`## 直觉`（L2）和 `## 细节`（L3）。

路径文件的字段见 `schema/path.schema.json`：`id` / `title` / `summary` / `audience` / `steps` / `updated_at`，
其中 `steps` 是 `{ id, note? }` 的列表，`id` 必须指向已存在的节点。

**案例**（`content/cases/*.md`，v2）的字段见 `schema/case.schema.json`：`id` / `title` / `industry`（行业场景）/
`domains`（PM 能力域，1-6 个）/ `nodes`（挂靠知识节点，**至少 3 个**，悬空构建失败）/ `tags` / `sources` / `updated_at`。
正文五节：`## 场景背景` / `## 决策点` / `## 决策过程` / `## 结果与教训` / `## 面试怎么讲`。

**面试题**（`content/interview/*.md`，v2）的字段见 `schema/interview-question.schema.json`：`id` / `question`（问题原话）/
`category`（八类分组）/ `frequency`（高频 / 常见 / 偶见）/ `nodes`（复习节点，**至少 1 个**）/ `updated_at`。
正文三节：`## 好答案的要点` / `## 常见的错误答案` / `## 追问`。

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

> 这一节是速查。[CONTRIBUTING.md](CONTRIBUTING.md) 里有完整版：可复制的模板、
> 依赖关系怎么定（什么算前置、什么算相关）、常见构建报错的处理方式。

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
| 案例 / 面试题悬空挂靠 | 指明是第几个节点 + 候选（v2） |
| 案例能力域未登记 | 列出已登记的能力域（v2） |
| pm 枚举与 core↔登记表一致性 | 双向指出哪边漂移了（v2） |
| 能力域覆盖 / core 数量区间 / 必修可回溯 | 指明违反了哪条约束（v2） |

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

- **`graph.json`** —— `nodes`（id / title / domain / **pm** / summary / tags / prerequisites / related / sources / updated_at）、
  `edges`（`source` / `target` / `type`）、`domains`、**`pm_domains`**（v2，六大能力域 + 必修节点，必修地图的分组依据）、`stats`。
- **`paths.json`** —— 学习路径，步骤里已带 `title` 和 `domain`。
- **`content.json`** —— L2/L3 正文，按节点 id 索引。三层卡片要渲染正文，而 `graph.json` 只有元数据
  （L1 在 `summary` 里），所以正文单独出一份包，前端不必回头解析 Markdown 源文件。
- **`cases.json`**（v2）—— PM 决策案例，正文五节映射为 `background / decision_points / process / outcome / interview_pitch`。
- **`interview.json`**（v2）—— 面试题，正文三节映射为 `good_answer / wrong_answers / follow_ups`。

**边的方向**：`source -> target` 表示「先学 `source`，才能学 `target`」。
所以「聚焦模式」要的依赖子图，是沿 `prerequisite` 边从目标节点**反向**遍历。

字段细节和 JSON 样例见 `web/README.md`。

## 前端

`web/` 下是一个 **Vite + React + TypeScript** 的静态站点，消费上面三个产物。
它把内容变成三件事：

- **图谱视图**：按前置依赖分层排布的知识网络。缩放、平移、拖拽节点，节点按领域着色，
  越基础的节点画得越大。布局是**确定性**的——同一份内容每次画出来都一样，刷新不会散架。
- **三层卡片**：点开节点默认只露 L1 一句话，点「为什么重要」展开 L2、点「深入细节」展开 L3，
  都在同一个面板里切换，不跳页。
- **聚焦模式**：选中一个节点，沿依赖边反向算出完整的前置子图，其余淡化，并告诉你
  「学会这个，你现在只需要看这 N 个节点」，按依赖顺序列出。这是把「一张吓人的大图」
  变成「一条可执行的路径」的关键。

另有路径视图（线性步骤 + 本地完成进度）、搜索（标题 / 标签 / L1 模糊匹配，键盘可选中）、
亮暗主题（跟随系统 + 手动切换），以及窄屏下的列表降级。

```bash
cd web && npm install && npm run dev
```

细节、数据契约与实现取舍见 `web/README.md`。

## 测试

三层，由浅到深。CI 每次都跑全部三层——**任何一层挂掉，发布都不会开始**。

```bash
# 第一层：内容侧（零依赖）
npm test

# 第二层：前端逻辑
cd web && npm test

# 第三层：真实浏览器冒烟
node web/tools/smoke.mjs --dist web/dist
```

**内容侧**覆盖：frontmatter 解析（含各种坏写法）、Schema 校验通过/失败、悬空依赖、循环依赖、
孤立节点、重复 id、文件名一致性、路径检查、边方向与去重、端到端构建与产物结构、L2/L3 正文包、
PM 标注与能力域登记表的一致性、案例与面试题的全部校验（各有专门的 fixture）。

其中 `test/fixtures/broken/` 是一个**故意写坏的内容仓库**，覆盖了每一类错误；
测试会断言错误信息「指明了文件、字段和原因，且不含堆栈或英文断言」。真实内容仓库本身也被当作
一个测试用例跑一遍。

**前端**覆盖依赖子图（对全部节点与暴力实现逐一比对）、依赖顺序、布局的确定性与分层、
以及 L2/L3 的 Markdown 解析。

**浏览器冒烟**覆盖单元测试够不着的那一层：React 真的渲染出来了吗、SVG 交互、
缩放与居中、聚焦模式的淡化、主题切换与持久化、localStorage、窄屏降级、控制台干不干净。
它自己起静态服务器、自己拉一个无头浏览器，跑完自己收工——本地和 CI 跑的是同一条命令。
需要本机装有 Chrome，且 Node ≥ 22.4。

> 三层测试的**数量都与内容规模解耦**，不写死节点数：断言用的期望值从站点自己产出的
> `graph.json` / `paths.json` / `content.json` 现算。内容增删不会让测试假报警。

## 设计约束

- **内容即数据**：图谱由内容文件生成，禁止手工维护一张大图，禁止用数据库存内容。
- **面向 AI 产品经理（v2 起）**：首页、导航、内容组织以 PM 为第一受众，面向 PM 的内容零术语门槛（不写代码也读得懂）；其他受众的学习路径保留但从属。
- **知识与案例、面试题互相可达**：每个案例挂靠 ≥3 个知识节点、每道面试题挂靠 ≥1 个复习节点，悬空挂靠构建失败。
- **零依赖构建**：`node build/index.js` 直接能跑，不需要 `npm install`。JSON Schema 校验器和
  frontmatter 解析器都是自己实现的——唯一目的是让每条错误信息都能写成「哪个文件、哪个字段、为什么错」。
- **不引入数据库、账户、后端服务**，前端静态部署。
