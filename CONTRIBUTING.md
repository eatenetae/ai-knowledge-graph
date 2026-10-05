# 贡献指南

这份文档写给你：**没参与过这个项目，但想往图谱里加一个知识点的人**。

读完照着做，你就能独立完成一次内容更新，并且知道构建拦住你的时候该怎么办。

## 先理解一件事：内容即数据

这个项目里**没有数据库，也没有需要手工维护的图**。整个站点是从 `content/` 目录下的一堆 Markdown 文件在构建期生成的：

```
content/**/*.md  ──构建──▶  web/public/{graph,paths,content,cases,interview}.json  ──打包──▶  静态站点
```

所以你更新内容的方式，就是加一个 Markdown 文件、提交、发 PR。图谱、索引、学习路径、节点大小、配色，全都是构建期算出来的——你不需要碰，也不应该去碰。

**要改站点上的内容，改 `content/` 就够了。** 如果你发现某件事必须改构建脚本或前端才能做到，那多半是设计上还没想清楚，先在 issue 里说一声。

## 环境准备

只需要 Node.js。**内容侧零依赖，不需要 `npm install`**。

| 你要做的事 | Node 版本要求 |
|---|---|
| 写内容、构建、跑内容测试 | 20 或更高 |
| 构建前端 | 20.19 或更高（vite 7 的要求） |
| 跑前端单元测试 | **22.18 或更高**（测试是 `.ts`，直接由 node 跑，需要类型擦除） |
| 跑真实浏览器冒烟 | **22.4 或更高**（用了全局 `WebSocket`） |

**结论：装 Node 22 或更高版本，三层就都能跑。** 只改内容的话，20 就够了——内容侧
从解析到校验全是自己实现的，不依赖任何新语法。

CI 固定跑在 Node 22 上。

## 本地跑起来

```bash
git clone <repo>
cd ai-knowledge-graph

# 1. 校验内容并产出图数据（零依赖，一条命令）
node build/index.js

# 2. 起前端看效果
cd web
npm install
npm run dev          # 打开终端里提示的地址
```

`node build/index.js` 正常时输出大致是这样（数字随内容规模变化）：

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

**改完内容要重跑一次 `node build/index.js` 才会生效**：前端的三个 JSON 是构建产物，不入库，`npm run dev` 只是在读它们。改一个文件刷新页面看不到变化，多半就是忘了这一步。

## 新增一个节点

跟着走一遍，五分钟。

### 第 1 步：想清楚它在图谱里的位置

先回答一个问题：**学它之前，需要先懂什么？**

答案就是 `prerequisites`。这是图谱里唯一一种有向边，也是「聚焦模式」和「学习路径」赖以工作的东西。想不清楚就先别写——一个挂错位置的节点比一个缺失的节点更麻烦。

### 第 2 步：建文件

文件放在 `content/<domain>/<id>.md`，**文件名必须和 `id` 一模一样**（构建会检查，对不上直接报错）。

```bash
# 例：加一个叫 prompt-caching 的节点，属于 deployment 领域
$EDITOR content/deployment/prompt-caching.md
```

可选的 `domain` 就这 12 个，取自 `schema/domains.json`：

`foundations`（基础概念）· `neural-networks`（神经网络）· `transformer`（Transformer）· `llm-training`（大模型训练）· `prompting`（提示工程）· `retrieval`（检索）· `rag`（RAG）· `agents`（智能体）· `finetuning`（微调）· `evaluation`（评估）· `deployment`（部署与推理）· `safety`（安全与对齐）

### 第 3 步：抄模板

下面这份可以直接复制改。frontmatter 的字段一个不多一个不少——**多写一个未登记的字段会被构建拒绝**。

```markdown
---
id: prompt-caching
title: 提示缓存
domain: deployment
summary: 把每次都要重复发的那段话存在服务商那边，下次直接跳过，省钱也省时间。
prerequisites:
  - prompt-engineering
related:
  - inference-cost
tags:
  - 成本优化
  - 工程实践
sources:
  - title: Prompt Caching (Anthropic Docs)
    url: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
updated_at: 2026-09-30
---

## 直觉

（L2：为什么重要、解决什么问题、一个类比。写给「知道这个概念存在，但没想明白它值在哪」的人。）

## 细节

（L3：关键机制、代表论文、可运行代码。写给「要动手用起来」的人。）
```

模板里没有 `pm` 字段——它是可选的：v2 起可以给节点标 `pm: core`（AI PM 面试前必须掌握，**同时**要登记进 `schema/pm-domains.json` 对应能力域的 `core_nodes`）或 `pm: useful`（相关但非必须）。不标就表示与 PM 无关，什么都不用写。判断标准见 [`docs/pm-competency.md`](docs/pm-competency.md)。

### 第 4 步：写三层正文

三层不是三种详略，是**三种读者**：

| 层 | 写在哪 | 写给谁 | 长度 |
|---|---|---|---|
| **L1** | frontmatter 的 `summary` | 完全的新手 | 一句话，10–100 字，**零术语** |
| **L2** | 正文 `## 直觉` | 知道概念但没想明白的人 | 为什么重要 + 解决什么问题 + 一个类比 |
| **L3** | 正文 `## 细节` | 要动手用起来的人 | 关键机制 + 代表论文 + 可运行代码 |

**L1 是整件事的门面。** 默认状态下用户只看得到 L1，他会不会点开往下看，全看这一句话。写 L1 的唯一标准：把它读给一个没学过 AI 的人听，他能懂。

L1 反例（术语堆砌，新手直接劝退）：

> 通过 KV 缓存复用与注意力状态持久化降低首 token 延迟

L1 正例：

> 把每次都要重复发的那段话存在服务商那边，下次直接跳过，省钱也省时间。

L2 的类比要具体，别用「就像人类大脑一样」这种。翻翻已有节点，`content/transformer/attention.md` 用「开会点名」讲注意力，是可以参照的水准。

L3 不要求每篇都有代码，但有代码的话**必须是能跑的**，不要贴伪代码。

### 第 5 步：校验

```bash
node build/index.js
```

过了就接着做第 6 步。没过就跳到下面的「常见构建报错」。

### 第 6 步：在浏览器里确认

```bash
cd web && npm run dev
```

打开页面，确认三件事：

1. 新节点出现在图谱里，位置符合直觉（它应该排在你写的前置节点下面）
2. 点开它，L1 只露一句话，展开能看到 L2/L3
3. 选中它，聚焦模式算出的依赖子图是对的

### 第 7 步：提 PR

```bash
git checkout -b content/prompt-caching
git add content/deployment/prompt-caching.md
git commit -m "内容：新增「提示缓存」节点"
git push
```

PR 里说明：**这个节点是什么、你为什么把它挂在现在这个位置**。第二点比第一点重要——位置是这张图唯一需要人来判断的东西。

## 修改已有节点

直接编辑对应的 Markdown 文件，然后 `node build/index.js`。

几条规矩：

- **`id` 一经使用不可更改。** 它是图节点 key，改了等于删掉旧节点、新建一个，所有指向它的依赖边和学习路径都会断。真要改 id，得同时改掉所有引用它的地方。
- **改 `prerequisites` 要格外小心**：可能引入环，也可能让别的节点变成孤立节点。
- **改完记得更新 `updated_at`**，这是站点上「最后更新」的来源。

## 新增一条学习路径

路径放在 `content/paths/<id>.md`，回答的是「一个具体的人，按什么顺序走」。

```markdown
---
id: backend-engineer-to-rag
title: 后端工程师转 RAG
summary: 会写 Go 和 SQL，想在不碰训练的前提下做出一个能上线的问答服务。
audience: 有后端经验、没接触过 AI 的工程师
updated_at: 2026-09-30
steps:
  - id: what-is-machine-learning
    note: 先掰正「训练是调参数，不是写规则」这个心智模型
  - id: embedding
    note: 全篇最关键的一跳——把「意思」变成「距离」
  - id: vector-database
    note: 数据上量之后才需要，但选型要看过滤能力和更新方式
  - id: rag
    note: 把前面串起来，交付第一个真实应用
---

## 这条路径怎么走

（正文写这条路径的设计意图：为什么是这个顺序、哪里可以跳、哪里容易卡住。）
```

约束：

- `steps` 至少 2 步、最多 40 步，同一个节点不能出现两次
- 每一步引用一个**已存在**的节点 id
- **每一步的前置依赖应当排在它前面**。如果没排（比如你故意让读者跳过某个前置，自行补课），构建会给一条**警告**，不会失败——但如果一条路径里警告很多，说明这条路径的顺序有问题，回去调
- `note` 是这一步的「为什么现在学它」，不是节点标题的复述

写路径的常用手法是**倒着设计**：先定终点，再一路往回推「要走到那儿必须先懂什么」。看看 `content/paths/llm-app-developer.md`，它就是这么做出来的。

## 新增一个案例

案例回答的是「**一个真实的产品决策是怎么做出来的**」。它不是技术方案文档，是判断力的示范：面对什么场景、在哪些选项里权衡、结果如何、教训是什么。v2 起站点面向 AI 产品经理，案例是给他们建立判断力的核心素材。

文件放在 `content/cases/<id>.md`，照抄这个模板：

```markdown
---
id: ecommerce-cs-refund-policy
title: 电商客服机器人：退款政策问答敢不敢交给大模型
industry: 电商客服
domains:
  - capability-boundaries
  - solution-intuition
  - evaluation-quality
nodes:
  - rag
  - hallucination
  - rag-failure-modes
  - llm-evaluation
  - context-window
tags:
  - RAG
  - 客服
sources: []
updated_at: 2026-10-05
---

## 场景背景

（谁、在什么产品里、遇到了什么问题。有真实来源的数字注明出处；没有就写明「虚构但典型」。）

## 决策点

（当时要在哪几个选项之间做选择？一列出来。）

## 决策过程

（每一关用了什么知识、怎么权衡的。这一节要让读者看到「思考过程」而不是「结论」。）

## 结果与教训

（结果如何、哪一步走对了、哪一步如果重来会怎么做。教训比成功更值钱。）

## 面试怎么讲

（这个案例在面试里怎么用：一句话怎么概括、重点讲哪两个判断、用什么数字收尾。）
```

规则：

- **`nodes` 至少 3 个**，必须挂到真实存在的知识节点——「知识是骨架、案例是血肉」，两边必须互相可达，悬空挂靠构建直接失败
- **`domains` 至少 1 个**，取值只能是 `schema/pm-domains.json` 里登记的六大能力域 id
- **正文五节一节不能少**（`## 场景背景` / `## 决策点` / `## 决策过程` / `## 结果与教训` / `## 面试怎么讲`）
- **零术语门槛**：案例正文和节点 L1 一样，写给不写代码的人读。可以提 RAG、微调这类产品级词汇（站内节点会解释它们），但不能出现代码和未解释的工程术语
- **数字要么有来源，要么标虚构**：来自公开资料就写进 `sources` 并在正文标注；否则在正文写明「虚构但典型的场景」——这是冻结决策，不能含糊

写完跑 `node build/index.js`，按报错改到通过。可以对照 `content/cases/ecommerce-cs-refund-policy.md` 找手感。

## 新增一道面试题

面试题回答的是「**AI PM 面试里真的会被问到的问题**」。题目用面试官的原话写，答案要点讲「好答案长什么样」，而不是给标准答案。

文件放在 `content/interview/<id>.md`：

```markdown
---
id: why-llm-hallucinates
question: 大模型为什么会「一本正经地胡说八道」？你负责的产品里出现这个问题，你会怎么办？
category: 幻觉与质量
frequency: 高频
nodes:
  - hallucination
  - next-token-prediction
  - rag
  - llm-evaluation
updated_at: 2026-10-05
---

## 好答案的要点

（好答案的骨架：先答什么、再答什么、体现什么判断力。用要点列表。）

## 常见的错误答案

（面试里真实出现的错误答法，以及它暴露了什么。这一节比要点更值钱。）

## 追问

（面试官顺着这道题会往下问什么？好的候选人应该能接住。）
```

规则：

- **`question` 用原话**，不是主题概括。「大模型为什么会胡说八道」是问题，「幻觉问题综述」不是
- **`category` 八选一**：能力边界 / 幻觉与质量 / RAG 与知识库 / Agent / 成本与延迟 / 评测 / 数据与安全 / 项目与协作
- **`frequency` 三选一**：高频 / 常见 / 偶见——按你在真实面试里见到的频率标，拿不准就标常见
- **`nodes` 至少 1 个**，挂到答好这道题需要复习的知识节点（悬空构建失败）
- **正文三节一节不能少**：`## 好答案的要点` / `## 常见的错误答案` / `## 追问`

## 依赖关系怎么定

这是整份文档里最需要判断力的一节。

### 什么时候算「前置」（写进 `prerequisites`）

判断标准只有一条：

> **不懂 A，是不是就学不懂 B？**

如果是，A 就是 B 的前置。注意是「学不懂」，不是「学起来更轻松」。

- ✅ `attention` 是 `transformer` 的前置——不懂注意力，看不懂 Transformer 在干什么
- ❌ `tokenization` 不是 `rag` 的前置——做 RAG 确实会碰到 token，但不影响你理解 RAG 是什么
- ✅ 前置要尽量**直接**。A→B→C 就够了，不要让 A 直接指向 C。间接依赖由聚焦模式自己递归算出来，手工拉直只会让图变乱

数量上，`prerequisites` 最多 8 个。**超过 3 个通常说明你没想清楚**——一个知识点需要先懂四五个别的才能学，多半是它自己定义得太大了，应该拆成两个节点。

### 什么时候算「相关」（写进 `related`）

相关是**弱关联**：不构成学习前提，只是「你可能也想看看」。

> **不懂 A，也能学懂 B；但学完 B 的人，大概率对 A 有兴趣。**

- ✅ `rag` 和 `fine-tuning`——两条都是「让模型更懂你的业务」的路子，读者会想比较，但没有先后关系
- ✅ 两个经常被放在一起对比的概念（如 `full-finetuning-vs-peft` 和它比较的对象）
- ❌ 不要拿 `related` 当「我觉得这两个有关系」的垃圾桶。它不会影响学习路径，但会让图变噪

`related` 是对称的：A 写了 B，图上就有一条 A–B 的边（B 不需要反过来再写一次）。

### 两条硬约束

- **不能有环。** A 是 B 的前置、B 又是 A 的前置，学习路径就永远走不通。构建会把整个环打印出来。
- **不能有孤立节点。** 每个节点至少要有一条边（有前置，或者被别的节点当作前置）。一个谁都不依赖、也没人依赖它的节点，在图上就是一个飘着的点，读者点进去就走进死胡同了。

## 本地校验与测试

三层，由浅到深。**只改内容的话，第一层就够了**，但 CI 会跑全部三层。

```bash
# 第一层：内容校验 + 内容侧单元测试
node build/index.js          # 校验并写出产物
node build/index.js --check  # 只校验，不写文件
npm test                     # 内容侧单元测试（79 项）

# 第二层：前端单元测试与构建
cd web
npm test                     # 前端单元测试（38 项）
npm run build                # tsc --noEmit + vite build，产出 dist/

# 第三层：真实浏览器冒烟（43 项）
node tools/smoke.mjs --dist dist
```

第三层需要本机装了 Chrome。它会自己起静态服务器、自己拉一个无头浏览器，跑完自己收工——不需要你手动准备任何东西。跑不过但你看不出原因时，加 `--chrome <路径>` 指定浏览器，或者看它打印的 Chrome 输出。

> **别把 `npm test` 改回 `node --test test/`。** 传目录给 `--test` 在 Node 26 上能用，在 Node 22 上会被当成「要加载的模块」而直接报错（`Cannot find module '.../test'`）——CI 跑的正是 22。写成显式的 `test/*.test.js` 两个版本都对。

`node build/index.js` 的退出码：`0` 通过、`1` 校验失败、`2` 用法或环境错误。

## 常见构建报错及处理方式

构建失败时它打印的不是堆栈，是「哪个文件、哪个字段、为什么错」。下面是最常见的几类。

### 悬空依赖

```
1) content/deployment/rag-cache.md
   字段 `prerequisites[0]`：悬空依赖：前置依赖 `vector-db` 不存在
   ↳ 现有节点：ai-agent、alignment-problem、attention、……
```

你引用的 id 在仓库里找不到。两种情况：

- **拼错了**。构建会在你写错得足够近的时候直接提示「你是不是想写 `vector-database`？」——先看有没有这句提示
- **那个节点还不存在**。要么你先把它写出来，要么换一个真正存在的前置

### 循环依赖

```
1) content/foundations/a.md
   字段 `prerequisites`：循环依赖：a -> b -> c -> a
```

箭头读作「先学……才能学……」。上面这行是说：要学 a 得先学 b，要学 b 得先学 c，要学 c 又得先学 a——死锁。

处理方式是找出这个环里**最基础的那一个**，把它的 `prerequisites` 里指向环内的那条边去掉。环往往是「A 需要 B 帮忙解释、B 又需要 A 帮忙解释」这种概念上的纠缠，通常意味着这两个概念应该合并，或者其中一个才是真正的基础。

### 孤立节点

```
1) content/deployment/rag-cache.md
   字段 `prerequisites`：孤立节点：既没有任何前置依赖，也没有任何节点依赖它
   ↳ 给它补一条 prerequisites（挂到已有节点下），或在别的节点里把它列为前置
```

这个节点在图上飘着。两种修法：给它补一条 `prerequisites` 挂到已有节点下，或者在别的节点的 `prerequisites` 里把它列上。

**一个谁都够不着的基础概念也算孤立节点**——比如你新写了「什么是机器学习」这种最底层的节点，它自己可以没有前置，但必须至少有一个节点把它当前置。不然读者永远走不到它。

### 文件名与 id 对不上

```
1) content/deployment/prompt-cache.md
   字段 `id`：文件名与 id 对不上：id 是 `prompt-caching`，文件名应该是 `prompt-caching.md`
```

改文件名，或者改 `id`，让它们一致。**改文件名更安全**——`id` 是别的节点引用你的方式。

### 字段校验失败

```
1) content/deployment/prompt-caching.md
   字段 `summary`：L1 一句话，10-100 个字符，且必须零术语
```

Schema 里每条规则都配了人话错误信息，照做就行。几个高频的：

- 多写了未登记的字段（比如顺手加了个 `author`）→ frontmatter 是**严格模式**，多余字段一律拒绝
- `updated_at` 写成了 `2026/9/30` → 必须是 `YYYY-MM-DD`
- `summary` 超了 100 字 → L1 就是一句话，超了说明你在往下写 L2 的内容
- `prerequisites` 里 id 写成了大写或下划线 → 必须是小写 kebab-case

### 路径相关的报错

```
1) content/paths/llm-app-developer.md
   字段 `steps[7].id`：悬空依赖：路径引用了不存在的节点 `vector-db`
   ↳ 你是不是想写 `vector-database`？
```

```
⚠ 1 条提示（不影响构建）：
  · content/paths/llm-app-developer.md steps[3].id
    第 4 步 `rag` 的前置依赖 `semantic-search` 没有出现在它前面
```

带 `⚠` 的只是提示，构建会照常通过。但如果一条路径里攒了一堆这种提示，回去调顺序。

### PM 标注相关的报错

v2 起节点可以标 `pm: core / useful`，core 节点还必须登记进 `schema/pm-domains.json` 的能力域。两边是**双向校验**——只改一边就会看到这些报错：

```
1) content/rag/rag.md
   字段 `pm`：节点 `rag` 标了 pm: core，但没有登记进 schema/pm-domains.json 的任何能力域
   ↳ 必修地图按能力域分组，漏登记的 core 节点用户看不到
```

```
1) schema/pm-domains.json
   字段 `domains[3].core_nodes[0]`：节点 `fine-tuning` 同时登记在「技术方案理解」和「落地方法」两个能力域里
   ↳ 每个必修节点只归一个域，必修地图才能不重不漏
```

```
1) content/evaluation/hallucination.md
   字段 `pm`：登记表把 `hallucination` 列为「能力边界判断」的必修节点，但它的 frontmatter 没有标 pm: core
   ↳ 两边要对上：要么节点补 pm: core，要么把它从 core_nodes 里拿掉
```

案例与面试题的报错样式与节点一致（文件 + 字段 + 原因 + 怎么改），常见的有：挂靠节点悬空、能力域未登记、正文缺小节、id 重复。打 pm 标注的判断标准见 [`docs/pm-competency.md`](docs/pm-competency.md)。

## 提交规范

- 一个 PR 只做一件事：加一个节点、改一个节点、加一条路径，别混在一起
- commit message 用中文，动词开头：`内容：新增「提示缓存」节点`
- PR 描述里说清楚**为什么把它挂在现在这个位置**
- CI 会跑三层测试。全绿才能合

## 发布

站点推送到 `main` 分支后由 CI 自动构建并发布，不需要人工操作。

CI（`.github/workflows/ci.yml`）把四件事串成一条链：

```
content ──▶ web ──▶ smoke ──▶ deploy
校验+测试   测试+打包  浏览器冒烟   发布
```

任何一层失败，后面的都不会开始——所以**校验没过的产物不可能被发布出去**，这是由 job 依赖关系保证的，不是靠发布脚本里的额外检查。

`deploy` 这一步有一个一次性开关：仓库变量 `PAGES_ENABLED`。没有打开时，主分支只跑校验、不发布。打开步骤见下方「首次启用发布」。

### 首次启用发布

> 本仓库已完成这一步（2026-10）：Pages 已启用（Source = GitHub Actions）、`PAGES_ENABLED` 已置 `true`，推送 `main` 即自动发布。以下步骤留作记录，换仓库或重置托管时照做。

1. 确认仓库可以发布 Pages：**私有仓库需要 GitHub Pro/Team/Enterprise**，或者把仓库转成公开。免费账号下的私有仓库无法启用 Pages（API 会直接返回 `Your current plan does not support GitHub Pages for this repository`）。
2. 仓库 **Settings → Pages**，把 **Source** 选成 **GitHub Actions**。
3. 仓库 **Settings → Secrets and variables → Actions → Variables**，新建变量 `PAGES_ENABLED`，值填 `true`。
4. 往 `main` 推一个提交，`deploy` job 会自动跑起来，线上地址是 `steps.deployment.outputs.page_url`（在 job 摘要里能看到）。

第 3 步的变量是有意留的：它让「还没决定用哪种托管」和「代码有问题」在 CI 上看起来不一样——前者主分支照样是绿的。

### 换成别的托管

`deploy` job 是整条链上唯一和托管商绑定的地方。要换成 Vercel / Netlify / Cloudflare Pages：

- 删掉 `deploy` job 里的 `configure-pages` / `upload-pages-artifact` / `deploy-pages` 三步，换成对应平台的 action
- **保留 `needs: [content, web, smoke]` 和那条 `if`**——发布必须挂在三层校验的下游，这是「不发布坏产物」的唯一保证
- 产物就是上一步 `download-artifact` 拿到的 `dist/`，纯静态，任何静态托管都能直接吃

## 内容巡检

图谱要持续更新，靠的不是等人想起来，而是一套定期跑的巡检流程。它扫 AI 领域的新模型、新范式、新概念，产出「建议新增 / 建议更新节点」的清单，变成 issue。

流程文档在 [`docs/content-patrol.md`](docs/content-patrol.md)，写到了「另一个 agent 读完就能直接执行」的程度。你要手工做一次巡检、或者想弄清「什么样的东西值得进图谱」，看那份文档。
