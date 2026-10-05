# web/ —— 前端

图谱站点。**纯静态**：构建产物是一堆 HTML/JS/CSS/JSON，丢到任何静态托管上就能跑，没有后端、没有数据库、没有账户。

v2 起站点以 **AI 产品经理为第一受众**：`#/` 是 PM 首页，主导航是必修地图 / 案例库 / 面试准备；
完整图谱与学习路径收进次级导航，v1 功能一个不删。

## 跑起来

前端消费的五个 JSON 是**构建产物、不入库**，所以第一次要先跑一次内容构建：

```bash
cd ..
node build/index.js     # 产出 web/public/{graph,paths,content,cases,interview}.json

cd web
npm install
npm run dev             # 本地开发
npm run build           # 产出 dist/（纯静态）
npm run preview         # 预览 dist/
npm test                # 前端逻辑的单元测试
```

`npm run build` 会先跑 `tsc --noEmit` 再打包——类型不过就不出产物。

## 目录

```
web/
  public/            构建产物落点（五个 JSON，Vite 会原样拷进 dist/）；favicon.ico / og-image.png 是入库的静态资产
  src/
    types.ts         构建产物的类型（前端只消费，不生成）
    App.tsx          页面骨架、状态、hash 路由
    lib/
      data.ts        拉取并粗校验五个产物
      deps.ts        依赖图索引、依赖子图、拓扑序（聚焦模式的核心）
      layout.ts      确定性分层布局
      markdown.ts    L2/L3 正文的块级解析
      domains.ts     领域色相（知识领域 + PM 能力域）
      theme.ts       亮暗主题
      storage.ts     本地存储：路径进度 + 三个勾选清单（必修已掌握 / 案例已读 / 题目已掌握）
      route.ts       hash 路由
      search.ts      全站搜索（知识点 / 案例 / 面试题的统一索引与打分）
      pm.ts          PM 视图共用计算：分组顺序、冲刺路径识别、节点 → 案例反向索引
    components/
      HomeView.tsx         PM 首页：定位语 + 三大入口 + 次级导航（v2）
      PmMapView.tsx        必修地图：六域分组 + 进度 + 进阶折叠（v2）
      CasesView.tsx        案例库：筛选列表 + 五节详情 + 双向可达（v2）
      InterviewView.tsx    面试准备：分组题库 + 详情 + 复习节点（v2）
      GraphView.tsx        图谱：缩放 / 平移 / 拖拽节点 / 键盘导航
      NodePanel.tsx        三层卡片 + 聚焦模式面板 + 「相关案例」区（v2）
      PathView.tsx         路径视图
      SearchBox.tsx        搜索（combobox 键盘契约）
      NodeListFallback.tsx 窄屏降级列表
      Markdown.tsx         L2/L3 与案例 / 题目正文的渲染
      ThemeToggle.tsx      主题切换
  test/              node --test 直接跑 .ts，不需要额外的测试框架
  tools/             冒烟测试（smoke.mjs 起服务拉浏览器，cdp-check.mjs 跑断言）
```

## 路由

hash 路由，不需要服务端配合（v1 的 `#/n/<id>`、`#/p/<id>` 老链接原样可用）：

| hash | 视图 |
|---|---|
| `#/` | PM 首页（v2） |
| `#/map` | 必修地图（v2） |
| `#/cases` / `#/c/<case-id>` | 案例列表 / 案例详情（v2） |
| `#/interview` / `#/q/<question-id>` | 题库 / 题目详情（v2） |
| `#/graph` / `#/n/<node-id>` | 完整图谱 / 图谱 + 打开节点卡片 |
| `#/paths` / `#/p/<path-id>` | 路径列表 / 路径详情 |

## 数据契约

五个产物都由 `node build/index.js` 写出，结构见仓库根 README 与 `build/lib/serialize.js`。

### graph.json

只含**元数据**（id / title / domain / pm / summary / tags / prerequisites / related / sources / updated_at），
L1 在 `summary` 里，不含 L2/L3 正文。

```jsonc
{
  "version": 1,
  "generated_at": "2026-09-29T13:40:11Z",
  "edge_semantics": "source -> target 表示「先学 source，才能学 target」",
  "domains": [{ "id": "foundations", "label": "基础概念", "order": 1, "node_count": 2 }],
  "pm_domains": [
    // v2：PM 六大能力域，必修地图的分组依据（schema/pm-domains.json）
    { "id": "capability-boundaries", "label": "能力边界判断", "order": 1, "summary": "……", "core_nodes": ["hallucination"] }
  ],
  "nodes": [
    {
      "id": "transformer",
      "title": "Transformer",
      "domain": "transformer",
      "pm": "useful",          // v2：core / useful / null（无标记）
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
  "stats": { "node_count": 55, "edge_count": 165, "domain_count": 12, "pm_core_count": 25, "pm_useful_count": 26 }
}
```

**边的方向别搞反**：`source` 是前置，`target` 是后继。聚焦模式要的「某节点的完整依赖子图」就是沿 `prerequisite` 边**反向**遍历（从目标节点往回走）。

### paths.json

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

### content.json

三层卡片的 L2/L3 正文包，按节点 id 索引：

```jsonc
{
  "version": 1,
  "generated_at": "...",
  "node_count": 23,
  "nodes": {
    "transformer": {
      "id": "transformer",
      "l2": "（`## 直觉` 小节的 Markdown 原文）",
      "l3": "（`## 细节` 小节的 Markdown 原文）"
    }
  }
}
```

正文按**原文的 Markdown** 存放，渲染在前端完成——构建期不做 Markdown 转换，
这样卡片里的排版调整不需要重新构建内容。渲染器只覆盖内容实际用到的语法
（段落、粗体/斜体、行内代码、链接、围栏代码块、嵌套列表、表格），
并且**不渲染原始 HTML**。

### cases.json（v2）

PM 决策案例。正文五节映射为英文键，正文同样是 Markdown 原文：

```jsonc
{
  "version": 1,
  "generated_at": "...",
  "case_count": 2,
  "cases": [
    {
      "id": "ecommerce-cs-refund-policy",
      "title": "电商客服机器人：退款政策问答敢不敢交给大模型",
      "industry": "电商客服",
      "domains": ["capability-boundaries", "solution-intuition", "evaluation-quality"],
      "nodes": ["rag", "hallucination", "rag-failure-modes", "llm-evaluation", "context-window"],
      "tags": ["RAG", "客服", "上线决策"],
      "sources": [],
      "updated_at": "2026-10-05",
      "sections": {
        "background": "（`## 场景背景` 的 Markdown 原文）",
        "decision_points": "（`## 决策点`）",
        "process": "（`## 决策过程`）",
        "outcome": "（`## 结果与教训`）",
        "interview_pitch": "（`## 面试怎么讲`）"
      },
      "file": "content/cases/ecommerce-cs-refund-policy.md"
    }
  ]
}
```

`nodes` 只存 id，节点标题/领域从 `graph.json` join（前端本来就拿着它）。

### interview.json（v2）

AI PM 面试题，正文三节映射为 `good_answer / wrong_answers / follow_ups`：

```jsonc
{
  "version": 1,
  "generated_at": "...",
  "question_count": 3,
  "questions": [
    {
      "id": "why-llm-hallucinates",
      "question": "大模型为什么会「一本正经地胡说八道」？……",
      "category": "幻觉与质量",     // 八类分组之一
      "frequency": "高频",          // 高频 / 常见 / 偶见
      "nodes": ["hallucination", "next-token-prediction", "rag", "llm-evaluation"],
      "updated_at": "2026-10-05",
      "sections": { "good_answer": "…", "wrong_answers": "…", "follow_ups": "…" },
      "file": "content/interview/why-llm-hallucinates.md"
    }
  ]
}
```

## 几个实现上的取舍

**布局不用力导向。** 力导向每次跑出来的位置都不一样，刷新一下整张图就散架，
用户刚建立的空间记忆立刻作废。这里用的是确定性的分层布局：按最长路径分层
（没有前置的节点在第 0 层），层内用重心法压交叉，全程没有随机数。
副产品是依赖方向天然从上往下，读图不用看箭头也能懂。

并列排序只依赖**内容本身**（领域序 → id），不依赖数组下标——所以 `graph.json`
里节点换个排列顺序，画出来的图完全一样。

**节点大小 = 被依赖程度。** 半径由「传递依赖它的节点数」决定，
越基础越显眼，和分层位置相互印证。

**领域色只定义色相。** 明度和饱和度交给 CSS 变量按主题决定，
所以亮暗两套主题下都够对比度，不用在 JS 里维护两份色值。

**聚焦模式自动开、可关。** 选中节点就沿 `prerequisite` 边反向算出完整依赖子图
（含多层递归），面板给出「你现在只需要看这 N 个节点」并按依赖顺序列出；
关掉开关就回到全图，视野也跟着回到全图。

**窄屏降级成列表。** 手机上把 23 个节点挤进一张可缩放的小图，收益是负的。
列表保留同样的信息（标题 + L1 + 领域），三层卡片照常打开，交互一个不少。

**PM 视图复用 v1 的交互，不重做。** 必修地图 / 案例 / 面试题里的知识点都是
`#/n/<id>` 跳进图谱 + 三层卡片，讲解只有一份；案例与节点通过 `cases.nodes`
双向可达（案例详情列关联节点，节点卡片聚合「相关案例」）。
面试题的「复习这些节点」用 `sortByDependency` 排序——前置在前，照着从上往下复习。

**冲刺路径按内容识别，不写死 id。** 「AI PM 面试冲刺」路径由内容任务产出、
id 未冻结，前端按标题 / id 里的「冲刺 / sprint」关键词找：找到就深链，找不到
就退回路径列表，两种情况题库都不缺入口。

**勾选清单只存浏览器。** 必修「已掌握」（`akg:learned`）、案例「已读」（`akg:cases-read`）、
题目「已掌握」（`akg:mastered`）与 v1 的路径进度（`akg:progress`）同一思路：
个人的进度不值得为它拉一套账户，存坏了也静默降级成空清单。

## 无障碍

- 图谱里每个节点都能 Tab 到，方向键在节点间按几何方向移动，回车打开卡片
- 搜索是标准的 combobox + listbox 键盘契约（上下键移动、回车选中、Esc 关闭）
- 卡片打开时焦点移入标题，Esc 关闭
- 所有可聚焦元素都有可见的焦点环；`prefers-reduced-motion` 下关掉过渡
- PM 视图的入口 / 节点 / 题目 / 勾选全部是原生 `button` / `input`，天然可 Tab、可回车；
  勾选框沿用 v1 的「视觉隐藏但可聚焦」模式（`.pm-node-check input`）
