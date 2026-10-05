/**
 * 用 Chrome DevTools Protocol 跑一遍真实浏览器冒烟测试。
 *
 * 单元测试能覆盖依赖运算和布局，但覆盖不了「页面在浏览器里到底能不能跑起来」——
 * React 渲染、SVG 交互、主题切换、localStorage 这些都要真跑一次才算数。
 *
 * 期望值一律从站点自己的 graph.json / paths.json / content.json /
 * cases.json / interview.json 现算，不写死节点数——内容会持续增长，
 * 写死规模的检查在内容一变就会假报警（v1 阶段 2 的教训）。
 *
 * 用法：node tools/cdp-check.mjs <baseUrl>
 */

const BASE = process.argv[2] ?? 'http://127.0.0.1:8733';
const DEBUG_PORT = process.env.CDP_PORT ?? '9222';

const [graphData, pathsData, contentData, casesData, interviewData] = await Promise.all(
  ['graph.json', 'paths.json', 'content.json', 'cases.json', 'interview.json'].map((name) =>
    fetch(`${BASE}/${name}`).then((response) => {
      if (!response.ok) throw new Error(`取不到 ${name}：${response.status}`);
      return response.json();
    }),
  ),
);

/** 面试题分组的固定顺序：与 schema/interview-question.schema.json 的枚举一致 */
const CATEGORY_ORDER = [
  '能力边界',
  '幻觉与质量',
  'RAG 与知识库',
  'Agent',
  '成本与延迟',
  '评测',
  '数据与安全',
  '项目与协作',
];

const byId = new Map(graphData.nodes.map((node) => [node.id, node]));

const EXPECT = {
  nodes: graphData.nodes.length,
  edges: graphData.edges.length,
  domains: graphData.domains.length,
  paths: pathsData.paths.length,
  cases: casesData.cases.length,
  questions: interviewData.questions.length,
  pmDomains: graphData.pm_domains.length,
  pmCore: graphData.stats.pm_core_count,
  pmUseful: graphData.stats.pm_useful_count,
};

/** 按登记表的 order 排好序的能力域（必修地图的 DOM 顺序） */
const pmDomainsSorted = [...graphData.pm_domains].sort((a, b) => a.order - b.order);
const pmDomainLabels = pmDomainsSorted.map((domain) => domain.label);

/** 案例与面试题在产物里都按 id 排序，列表视图照这个顺序渲染 */
const casesSorted = casesData.cases;
const interviewSorted = interviewData.questions;

/** 每道题挂靠的节点 → 详情页「复习这些节点」的期望数量 */
const questionNodesOf = (question) => question.nodes.filter((id) => byId.has(id)).length;

/** 沿 prerequisite 边反向算依赖子图大小（含目标自身），用来核对面板上的「N 个节点」 */
function focusSize(targetId) {
  const seen = new Set([targetId]);
  const stack = [targetId];
  while (stack.length > 0) {
    const id = stack.pop();
    for (const prereq of byId.get(id)?.prerequisites ?? []) {
      if (seen.has(prereq)) continue;
      seen.add(prereq);
      stack.push(prereq);
    }
  }
  return seen.size;
}

/**
 * 挑一个用来验证聚焦模式的节点：依赖子图至少三层，且 L3 里有代码块，
 * 这样「多层递归」和「三层卡片」两类断言都不会落空。
 */
const focusTarget = graphData.nodes
  .filter((node) => focusSize(node.id) >= 3)
  .filter((node) => (contentData.nodes[node.id]?.l3 ?? '').includes('```'))
  .map((node) => node.id)
  .sort()[0];

if (!focusTarget) {
  throw new Error('内容里找不到「依赖子图 ≥ 3 层且 L3 有代码块」的节点，冒烟检查没法跑');
}

const FOCUS_SIZE = focusSize(focusTarget);

// 搜索用聚焦目标的标题当关键词：它一定存在，且一定命中自己。
// 但 v2 起案例标题和面试题也进搜索，同分时排序可能把案例排到节点前面——
// 所以先试标题前缀，一旦有案例/题目同样以它开头，就退回整条标题（撞车概率可忽略）。
let SEARCH_QUERY = byId.get(focusTarget).title.slice(0, 3);
const collidesAtStart = (query) =>
  casesData.cases.some((item) => item.title.toLowerCase().startsWith(query.toLowerCase())) ||
  interviewData.questions.some((item) =>
    item.question.toLowerCase().startsWith(query.toLowerCase()),
  );
if (collidesAtStart(SEARCH_QUERY)) SEARCH_QUERY = byId.get(focusTarget).title;

console.log(
  `数据规模：${EXPECT.nodes} 节点 / ${EXPECT.edges} 边 / ${EXPECT.domains} 领域 / ${EXPECT.paths} 路径` +
    `；PM core ${EXPECT.pmCore} / useful ${EXPECT.pmUseful}` +
    `；案例 ${EXPECT.cases} / 面试题 ${EXPECT.questions}` +
    `；聚焦样本 ${focusTarget}（${FOCUS_SIZE} 个节点）\n`,
);

const targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`).then((r) => r.json());
const page = targets.find((target) => target.type === 'page');
if (!page) throw new Error('没有找到可用的页面 target');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const consoleErrors = [];

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(`未捕获异常: ${message.params.exceptionDetails.text} ${message.params.exceptionDetails.exception?.description ?? ''}`);
  }
  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
    consoleErrors.push(`console.${message.params.type}: ${message.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    consoleErrors.push(`日志错误: ${message.params.entry.text}`);
  }
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, (message) => {
      if (message.error) reject(new Error(`${method}: ${message.error.message}`));
      else resolve(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression: `(() => { ${expression} })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`求值失败: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
  }
  return result.result.value;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function goto(hash) {
  await send('Page.navigate', { url: `${BASE}/${hash}` });
  await wait(1200);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ---- 图谱视图（v2 起完整图谱住在 #/graph，首页让给 PM 定位） ----
await goto('#/graph');
await wait(600);

const graph = await evaluate(`
  const svg = document.querySelector('.graph-svg');
  const rect = svg.getBoundingClientRect();
  const nodes = [...document.querySelectorAll('.node')];
  const positions = nodes.map((n) => {
    const box = n.getBoundingClientRect();
    return { id: n.dataset.nodeId, x: box.x, y: box.y, w: box.width, h: box.height };
  });
  const xs = positions.map((p) => p.x);
  const ys = positions.map((p) => p.y);
  return {
    svg: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    count: nodes.length,
    spanX: [Math.min(...xs), Math.max(...xs) + positions[0].w],
    spanY: [Math.min(...ys), Math.max(...ys) + positions[0].h],
    edges: document.querySelectorAll('.edge').length,
    legendItems: document.querySelectorAll('.legend li').length,
  };
`);

check(`图谱渲染出全部 ${EXPECT.nodes} 个节点`, graph.count === EXPECT.nodes, `实际 ${graph.count}`);
check('前置边与相关边都画了出来', graph.edges === EXPECT.edges, `实际 ${graph.edges}`);
check(`全部 ${EXPECT.domains} 个领域都有图例`, graph.legendItems === EXPECT.domains, `实际 ${graph.legendItems}`);

const graphCenterX = (graph.spanX[0] + graph.spanX[1]) / 2;
const svgCenterX = graph.svg.x + graph.svg.w / 2;
const offset = Math.abs(graphCenterX - svgCenterX);
check(
  '图在画布中水平居中',
  offset < 40,
  `图中心 ${graphCenterX.toFixed(0)} vs 画布中心 ${svgCenterX.toFixed(0)}，偏 ${offset.toFixed(0)}px`,
);

const graphCenterY = (graph.spanY[0] + graph.spanY[1]) / 2;
const svgCenterY = graph.svg.y + graph.svg.h / 2;
check(
  '图在画布中垂直居中',
  Math.abs(graphCenterY - svgCenterY) < 40,
  `图中心 ${graphCenterY.toFixed(0)} vs 画布中心 ${svgCenterY.toFixed(0)}`,
);

check(
  '图完整落在画布内',
  graph.spanX[0] >= graph.svg.x - 2 && graph.spanX[1] <= graph.svg.x + graph.svg.w + 2,
  `x 范围 ${graph.spanX.map((v) => v.toFixed(0)).join('~')}，画布 ${graph.svg.x.toFixed(0)}~${(graph.svg.x + graph.svg.w).toFixed(0)}`,
);

// ---- 聚焦模式 ----
await goto(`#/n/${focusTarget}`);
await wait(900);

const focus = await evaluate(`
  const panel = document.querySelector('.panel');
  const dimmed = document.querySelectorAll('.node.is-dimmed').length;
  const selected = document.querySelectorAll('.node.is-selected').length;
  const list = [...document.querySelectorAll('.focus-list li')];
  return {
    panelOpen: Boolean(panel),
    l1: document.querySelector('.l1')?.textContent ?? '',
    l2Visible: Boolean(document.querySelector('.layer-l2')),
    l3Visible: Boolean(document.querySelector('.layer-l3')),
    headline: document.querySelector('.focus-headline')?.textContent?.trim() ?? '',
    dimmed,
    selected,
    steps: list.map((li) => li.querySelector('.focus-title')?.textContent ?? ''),
    badgeCount: document.querySelectorAll('.focus-badge').length,
  };
`);

check('点开节点后卡片出现', focus.panelOpen);
check('默认只露 L1，L2/L3 都没展开', !focus.l2Visible && !focus.l3Visible);
check('L1 是一句话', focus.l1.length > 10 && focus.l1.length <= 100, `${focus.l1.length} 字`);
check(
  `聚焦模式算出 ${FOCUS_SIZE} 个节点`,
  focus.headline.includes(`${FOCUS_SIZE} 个节点`),
  focus.headline,
);
check(
  '依赖子图外的节点被淡化',
  focus.dimmed === EXPECT.nodes - FOCUS_SIZE,
  `淡化了 ${focus.dimmed} 个（${EXPECT.nodes}-${FOCUS_SIZE}=${EXPECT.nodes - FOCUS_SIZE}）`,
);
check('目标节点被选中', focus.selected === 1);
check('目标节点在列表里带「目标」标记', focus.badgeCount === 1);
// 顺序检查卡的是**性质**而不是某几个具体节点：把面板上渲染出来的标题映射回 id，
// 再逐条核对「每个节点的前置都排在它前面」。写死「A 在 B 前面」的检查
// 换个聚焦目标就失效，而性质检查对任何节点、任何内容规模都成立。
const titleToId = new Map(graphData.nodes.map((node) => [node.title, node.id]));
const prereqsById = new Map(graphData.nodes.map((node) => [node.id, node.prerequisites]));
const renderedIds = focus.steps.map((title) => titleToId.get(title));
const positionOf = new Map(renderedIds.map((id, index) => [id, index]));

const orderViolations = [];
for (const id of renderedIds) {
  for (const prereq of prereqsById.get(id) ?? []) {
    if (positionOf.has(prereq) && positionOf.get(prereq) > positionOf.get(id)) {
      orderViolations.push(`${prereq} 排在了 ${id} 后面`);
    }
  }
}

check(
  '聚焦列表覆盖整个依赖子图',
  renderedIds.length === FOCUS_SIZE && renderedIds.every(Boolean),
  `列表 ${renderedIds.length} 项 / 子图 ${FOCUS_SIZE} 个`,
);
check(
  '依赖顺序：每个节点的前置都排在它前面',
  orderViolations.length === 0,
  orderViolations.slice(0, 3).join(' | ') || focus.steps.join(' → '),
);

// ---- 三层卡片展开（不跳页） ----
const expand = await evaluate(`
  const tabs = [...document.querySelectorAll('.layer-tab')];
  tabs[0].click();
  tabs[1].click();
  const before = location.hash;
  return { before };
`);
await wait(400);

const expanded = await evaluate(`
  const l2 = document.querySelector('.layer-l2');
  const l3 = document.querySelector('.layer-l3');
  return {
    hash: location.hash,
    l2: l2?.textContent?.length ?? 0,
    l3: l3?.textContent?.length ?? 0,
    hasCode: Boolean(l3?.querySelector('.md-code')),
    hasTable: Boolean(l2?.querySelector('.md-table') || l3?.querySelector('.md-table')),
    sourceLinks: document.querySelectorAll('.sources a').length,
    panelStillOpen: Boolean(document.querySelector('.panel')),
  };
`);

check('展开 L2/L3 不跳页（hash 未变）', expanded.hash === expand.before, `${expand.before} -> ${expanded.hash}`);
check('L2 正文渲染出来了', expanded.l2 > 100, `${expanded.l2} 字`);
check('L3 正文渲染出来了', expanded.l3 > 200, `${expanded.l3} 字`);
check('L3 里的代码块渲染成 <pre>', expanded.hasCode);
check('L3 里的论文链接渲染成 <a>', expanded.sourceLinks >= 2, `${expanded.sourceLinks} 条`);
check('卡片仍然开着', expanded.panelStillOpen);

// ---- 搜索 ----
const searchResult = await evaluate(`
  const input = document.querySelector('.search-input');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(SEARCH_QUERY)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
  return true;
`);
await wait(400);

const searched = await evaluate(`
  const options = [...document.querySelectorAll('.search-results [role="option"]')];
  return {
    count: options.length,
    first: options[0]?.querySelector('.hit-title')?.textContent ?? '',
    active: document.querySelector('.search-results .is-active .hit-title')?.textContent ?? '',
  };
`);
check(
  '搜索有结果',
  searched.count > 0 && searched.first.includes(SEARCH_QUERY),
  `搜「${SEARCH_QUERY}」得 ${searched.count} 条，首条「${searched.first}」`,
);
check('搜索首条高亮（键盘可选中）', searched.active === searched.first, `高亮「${searched.active}」`);
check('搜索确实执行了', searchResult === true);

const afterEnter = await evaluate(`
  const input = document.querySelector('.search-input');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return true;
`);
await wait(500);
const jumped = await evaluate(`return { hash: location.hash, title: document.querySelector('#panel-title')?.textContent ?? '' };`);
check('回车跳到命中的节点', jumped.hash.includes('/n/'), `${jumped.hash} / ${jumped.title}`);
check('搜索回车没有报错', afterEnter === true);

// ---- 路径视图 ----
await goto('#/paths');
await wait(700);

const paths = await evaluate(`
  const steps = [...document.querySelectorAll('.step')];
  return {
    tabs: document.querySelectorAll('.path-tabs button').length,
    steps: steps.length,
    firstTitle: steps[0]?.querySelector('.step-title')?.textContent ?? '',
    firstSummary: steps[0]?.querySelector('.step-summary')?.textContent ?? '',
    hasProgress: Boolean(document.querySelector('.path-progress-bar')),
  };
`);
check(`${EXPECT.paths} 条学习路径`, paths.tabs === EXPECT.paths, `实际 ${paths.tabs}`);
check('路径渲染成线性步骤', paths.steps >= 2, `${paths.steps} 步`);
check('每步显示标题与 L1 一句话', paths.firstTitle.length > 0 && paths.firstSummary.length > 5);
check('有完成进度条', paths.hasProgress);

await evaluate(`document.querySelector('.step-check input').click(); return true;`);
await wait(300);
const toggled = await evaluate(`
  const box = document.querySelector('.step-check input');
  const activePath = document.querySelector('.path-tabs button.is-active')?.textContent ?? '';
  return {
    checked: box.checked,
    activePath,
    stored: localStorage.getItem('akg:progress') ?? '',
  };
`);
// 存进去的 key 必须是**当前选中路径**的 id，而不是某条写死的路径。
// 用标题反查 id，这样换默认路径、加新路径都不会让这条检查失真。
const activePathId = pathsData.paths.find((path) => path.title === toggled.activePath)?.id;
check(
  '勾选步骤写进本地存储',
  toggled.checked && Boolean(activePathId) && toggled.stored.includes(activePathId),
  `${toggled.activePath}（${activePathId ?? '未知路径'}）-> ${toggled.stored}`,
);

// ---- 从路径跳回图谱 ----
await evaluate(`document.querySelector('.step-title').click(); return true;`);
await wait(700);
const backToGraph = await evaluate(`
  return { hash: location.hash, panel: Boolean(document.querySelector('.panel')), title: document.querySelector('#panel-title')?.textContent ?? '' };
`);
check('点路径步骤跳到图谱对应节点', backToGraph.panel && backToGraph.hash.includes('/n/'), `${backToGraph.hash} / ${backToGraph.title}`);

// ---- 主题 ----
// React 的 state 更新是异步的，每点一次都要等一次渲染，否则读到的是上一帧的值
await evaluate(`localStorage.setItem('akg:theme', 'system'); return true;`);
await send('Page.reload');
await wait(1500);

const themes = await evaluate(`return [document.documentElement.dataset.theme];`);
for (let i = 0; i < 3; i++) {
  await evaluate(`document.querySelector('.theme-toggle').click(); return true;`);
  await wait(250);
  themes.push(await evaluate(`return document.documentElement.dataset.theme;`));
}
const storedMode = await evaluate(`return localStorage.getItem('akg:theme');`);

check(
  '主题三态循环：跟随系统 → 亮 → 暗 → 跟随系统',
  themes[1] === 'light' && themes[2] === 'dark' && themes[3] === themes[0],
  themes.join(' → '),
);
check('主题选择被记住', storedMode === 'system', `localStorage = ${storedMode}`);

// 主题只在挂载时读一次 localStorage，所以要真刷新页面才生效
await evaluate(`localStorage.setItem('akg:theme', 'dark'); return true;`);
await send('Page.reload');
await wait(1500);
await goto(`#/n/${focusTarget}`);
await wait(700);

await evaluate(`document.querySelectorAll('.layer-tab').forEach((tab) => tab.click()); return true;`);
await wait(400);
const dark = await evaluate(`
  const node = document.querySelector('.node-dot');
  const style = getComputedStyle(node);
  const body = getComputedStyle(document.body);
  return {
    theme: document.documentElement.dataset.theme,
    nodeFill: style.fill,
    bodyBg: body.backgroundColor,
    bodyColor: body.color,
    l3Length: document.querySelector('.layer-l3')?.textContent?.length ?? 0,
    codeBlocks: document.querySelectorAll('.layer-l3 .md-code').length,
  };
`);
check('暗色主题生效', dark.theme === 'dark');
check('暗色下节点有填充色', dark.nodeFill !== 'none' && dark.nodeFill !== '', dark.nodeFill);
check('暗色下正文与背景不同色', dark.bodyBg !== dark.bodyColor, `bg ${dark.bodyBg} / text ${dark.bodyColor}`);
check('暗色下三层卡片仍可用', dark.l3Length > 200 && dark.codeBlocks > 0, `L3 ${dark.l3Length} 字，${dark.codeBlocks} 个代码块`);

// ---- 窄屏降级 ----
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await goto(`#/n/${focusTarget}`);
await wait(900);

const mobile = await evaluate(`
  const list = document.querySelector('.graph-mobile');
  const svg = document.querySelector('.graph-desktop');
  return {
    listShown: list ? getComputedStyle(list).display !== 'none' : false,
    svgHidden: svg ? getComputedStyle(svg).display === 'none' : false,
    // 聚焦模式开着时，列表跟图谱保持一致，只显示依赖子图
    focusedItems: document.querySelectorAll('.node-list .list-title').length,
    headline: document.querySelector('.focus-headline')?.textContent?.trim() ?? '',
    panelOpen: Boolean(document.querySelector('.panel')),
    l1: document.querySelector('.l1')?.textContent?.length ?? 0,
  };
`);
check('窄屏换成列表降级', mobile.listShown && mobile.svgHidden);
check(
  '窄屏列表跟随聚焦模式，只列依赖子图',
  mobile.focusedItems === FOCUS_SIZE && mobile.headline.includes(`${FOCUS_SIZE} 个节点`),
  `列表 ${mobile.focusedItems} 项 / ${mobile.headline}`,
);
check('窄屏下三层卡片仍可用', mobile.panelOpen && mobile.l1 > 10);

await evaluate(`document.querySelector('.focus-toggle input').click(); return true;`);
await wait(400);
const unfocused = await evaluate(`
  return {
    items: document.querySelectorAll('.node-list .list-title').length,
    groups: document.querySelectorAll('.node-group').length,
  };
`);
check(
  `关掉聚焦模式后列表恢复全部 ${EXPECT.nodes} 个节点`,
  unfocused.items === EXPECT.nodes && unfocused.groups === EXPECT.domains,
  `${unfocused.items} 项 / ${unfocused.groups} 组`,
);

await send('Emulation.clearDeviceMetricsOverride');

// ---- v2：PM 首页 ----
await goto('#/');
await wait(700);

const home = await evaluate(`
  const entries = [...document.querySelectorAll('.home-entry')];
  return {
    heroTitle: document.querySelector('.hero-title')?.textContent ?? '',
    heroLead: document.querySelector('.hero-lead')?.textContent ?? '',
    entryTitles: entries.map((entry) => entry.querySelector('.home-entry-title')?.textContent ?? ''),
    secondary: [...document.querySelectorAll('.home-secondary-links button')].map(
      (button) => button.textContent ?? '',
    ),
    focusable: (() => {
      const entry = document.querySelector('.home-entry');
      if (!entry) return false;
      entry.focus();
      return document.activeElement === entry;
    })(),
  };
`);

check('PM 首页渲染：定位语 + 三大入口', home.heroTitle.length > 0 && home.entryTitles.length === 3, `${home.heroTitle} / ${home.entryTitles.join('、')}`);
check(
  '三大入口是必修地图 / 面试冲刺 / 案例库',
  ['必修地图', '面试冲刺', '案例库'].every((title) => home.entryTitles.includes(title)),
  home.entryTitles.join('、'),
);
check('hero 文案讲人话（有完整的定位说明）', home.heroLead.length > 20, `${home.heroLead.length} 字`);
check(
  'v1 收进次级导航：完整图谱与学习路径可达',
  home.secondary.join(' ').includes('图谱') && home.secondary.join(' ').includes('路径'),
  home.secondary.join(' / '),
);
check('首页入口可被键盘聚焦', home.focusable);

await evaluate(`document.querySelector('.home-entry').click(); return true;`);
await wait(500);
const homeJump = await evaluate(`return location.hash;`);
check('点「必修地图」进入必修地图', homeJump === '#/map', homeJump);

// ---- v2：必修地图 ----
await wait(300);
const pmMap = await evaluate(`
  const domains = [...document.querySelectorAll('.pm-domain')];
  return {
    domainTitles: domains.map((domain) => domain.querySelector('h3')?.textContent ?? ''),
    counts: domains.map((domain) => domain.querySelector('.pm-domain-count')?.textContent ?? ''),
    nodes: document.querySelectorAll('.pm-domain .pm-node').length,
    progress: document.querySelector('.pm-progress-text')?.textContent ?? '',
    advancedOpen: Boolean(document.querySelector('.pm-advanced-body')),
    advancedLabel: document.querySelector('.pm-advanced-toggle')?.textContent ?? '',
  };
`);

check(
  `必修地图按 ${EXPECT.pmDomains} 大能力域分组`,
  pmMap.domainTitles.length === EXPECT.pmDomains && JSON.stringify(pmMap.domainTitles) === JSON.stringify(pmDomainLabels),
  pmMap.domainTitles.join('、'),
);
check(
  `必修地图列出全部 ${EXPECT.pmCore} 个 core 节点`,
  pmMap.nodes === EXPECT.pmCore,
  `实际 ${pmMap.nodes}`,
);
check(
  '每域进度从产物现算（初始 0 / n）',
  pmMap.counts.every((count, index) => count === `0 / ${pmDomainsSorted[index].core_nodes.length}`),
  pmMap.counts.join('、'),
);
check('必修总进度文案正确', pmMap.progress.includes(`${EXPECT.pmCore} 个`), pmMap.progress);
check('「进阶」折叠区默认收起', !pmMap.advancedOpen && pmMap.advancedLabel.includes('进阶'), pmMap.advancedLabel);

const firstCoreNodeId = pmDomainsSorted[0].core_nodes[0];
await evaluate(`document.querySelector('.pm-node-check input').click(); return true;`);
await wait(300);
const learned = await evaluate(`
  return {
    checked: document.querySelector('.pm-node-check input').checked,
    count: document.querySelector('.pm-domain-count')?.textContent ?? '',
    progress: document.querySelector('.pm-progress-text')?.textContent ?? '',
    stored: localStorage.getItem('akg:learned') ?? '',
  };
`);
check(
  '勾选必修节点写进本地存储，进度跟着走',
  learned.checked && learned.stored.includes(firstCoreNodeId) && learned.count === `1 / ${pmDomainsSorted[0].core_nodes.length}` && learned.progress.startsWith('1 /'),
  `${learned.count} / 总进度「${learned.progress}」/ ${learned.stored}`,
);

await evaluate(`document.querySelector('.pm-advanced-toggle').click(); return true;`);
await wait(300);
const advanced = await evaluate(`
  return {
    open: Boolean(document.querySelector('.pm-advanced-body')),
    useful: document.querySelectorAll('.pm-advanced-body .pm-advanced-group li').length,
  };
`);
check(
  `「进阶」展开后列出全部 ${EXPECT.pmUseful} 个 useful 节点`,
  advanced.open && advanced.useful === EXPECT.pmUseful,
  `实际 ${advanced.useful}`,
);

await evaluate(`document.querySelector('.pm-node-main').click(); return true;`);
await wait(700);
const mapToGraph = await evaluate(`
  return {
    hash: location.hash,
    panel: Boolean(document.querySelector('.panel')),
    title: document.querySelector('#panel-title')?.textContent ?? '',
  };
`);
check(
  '点必修节点进图谱 + 三层卡片（复用 v1 交互）',
  mapToGraph.hash === `#/n/${firstCoreNodeId}` && mapToGraph.panel,
  `${mapToGraph.hash} / ${mapToGraph.title}`,
);

// ---- v2：案例库 ----
await goto('#/cases');
await wait(700);

const caseList = await evaluate(`
  return {
    cards: document.querySelectorAll('.case-card').length,
    domainFilters: document.querySelectorAll('.case-filter-group')[0]?.querySelectorAll('button').length ?? 0,
    industryFilters: document.querySelectorAll('.case-filter-group')[1]?.querySelectorAll('button').length ?? 0,
  };
`);

check(`案例库列出全部 ${EXPECT.cases} 个案例`, caseList.cards === EXPECT.cases, `实际 ${caseList.cards}`);
check(
  '能力域筛选 = 全部 + 六域',
  caseList.domainFilters === EXPECT.pmDomains + 1,
  `实际 ${caseList.domainFilters}`,
);
check(
  '行业筛选项从数据现算',
  caseList.industryFilters === new Set(casesData.cases.map((item) => item.industry)).size + 1,
  `实际 ${caseList.industryFilters}`,
);

// 选一个有案例的能力域做筛选，期望数量从数据算
const filterDomain = pmDomainsSorted.find((domain) =>
  casesData.cases.some((item) => item.domains.includes(domain.id)),
);
const filteredCount = casesData.cases.filter((item) => item.domains.includes(filterDomain.id)).length;
await evaluate(`
  const buttons = [...document.querySelectorAll('.case-filter-group')[0].querySelectorAll('button')];
  buttons.find((button) => button.textContent === ${JSON.stringify(filterDomain.label)}).click();
  return true;
`);
await wait(300);
const filtered = await evaluate(`return document.querySelectorAll('.case-card').length;`);
check(
  `按能力域筛选（${filterDomain.label}）`,
  filtered === filteredCount,
  `实际 ${filtered} / 期望 ${filteredCount}`,
);

await evaluate(`
  const buttons = [...document.querySelectorAll('.case-filter-group')[0].querySelectorAll('button')];
  buttons.find((button) => button.textContent === '全部').click();
  return true;
`);
await wait(300);

// 案例详情：用产物里的第一个案例（列表按 id 排序渲染）
const firstCase = casesSorted[0];
await evaluate(`document.querySelector('.case-card').click(); return true;`);
await wait(700);

const caseDetail = await evaluate(`
  return {
    hash: location.hash,
    headings: [...document.querySelectorAll('.case-section h3')].map((heading) => heading.textContent),
    sectionsWithBody: [...document.querySelectorAll('.case-section')].filter(
      (section) => section.querySelector('.md') !== null,
    ).length,
    nodes: document.querySelectorAll('.case-nodes li').length,
    industry: document.querySelector('.case-detail-meta')?.textContent ?? '',
  };
`);

check('案例详情路由正确', caseDetail.hash === `#/c/${firstCase.id}`, caseDetail.hash);
check(
  '案例详情按五节渲染：场景背景 / 决策点 / 决策过程 / 结果与教训 / 面试怎么讲',
  JSON.stringify(caseDetail.headings) ===
    JSON.stringify(['场景背景', '决策点', '决策过程', '结果与教训', '面试怎么讲']),
  caseDetail.headings.join('、'),
);
check('五节都有正文', caseDetail.sectionsWithBody === 5, `${caseDetail.sectionsWithBody} / 5`);
check(
  `关联知识节点全部列出（${firstCase.nodes.length} 个）`,
  caseDetail.nodes === firstCase.nodes.filter((id) => byId.has(id)).length,
  `实际 ${caseDetail.nodes}`,
);

// 案例 → 节点：点第一个关联节点跳进图谱
const firstCaseNode = firstCase.nodes.find((id) => byId.has(id));
await evaluate(`document.querySelector('.case-nodes button').click(); return true;`);
await wait(700);
const caseToNode = await evaluate(`
  return {
    hash: location.hash,
    panel: Boolean(document.querySelector('.panel')),
    title: document.querySelector('#panel-title')?.textContent ?? '',
    relatedCases: [...document.querySelectorAll('.panel-cases button')].map((button) => button.textContent),
  };
`);
check(
  '案例 → 节点：点关联节点跳进图谱',
  caseToNode.hash === `#/n/${firstCaseNode}` && caseToNode.panel,
  `${caseToNode.hash} / ${caseToNode.title}`,
);
check(
  '节点 → 案例：三层卡片带「相关案例」区',
  caseToNode.relatedCases.some((title) => title === firstCase.title),
  caseToNode.relatedCases.join('、'),
);

// 节点 → 案例：从卡片点回案例详情
await evaluate(`
  const button = [...document.querySelectorAll('.panel-cases button')].find(
    (candidate) => candidate.textContent === ${JSON.stringify(firstCase.title)},
  );
  button.click();
  return true;
`);
await wait(700);
const nodeToCase = await evaluate(`return location.hash;`);
check('节点 → 案例：点「相关案例」回到案例详情', nodeToCase === `#/c/${firstCase.id}`, nodeToCase);

// 已读标记
await evaluate(`document.querySelector('.case-read-toggle input').click(); return true;`);
await wait(300);
const caseRead = await evaluate(`
  return {
    checked: document.querySelector('.case-read-toggle input').checked,
    stored: localStorage.getItem('akg:cases-read') ?? '',
    label: document.querySelector('.case-read-toggle span')?.textContent ?? '',
  };
`);
check(
  '案例已读标记写进本地存储',
  caseRead.checked && caseRead.stored.includes(firstCase.id) && caseRead.label.includes('已读'),
  `${caseRead.label} / ${caseRead.stored}`,
);

await goto('#/cases');
await wait(500);
const readBadge = await evaluate(`
  const first = document.querySelector('.case-card');
  return {
    badge: first?.querySelector('.case-card-read')?.textContent ?? '',
    title: first?.querySelector('.case-card-title')?.textContent ?? '',
  };
`);
check(
  '案例列表显示已读标记',
  readBadge.badge === '已读' && readBadge.title === firstCase.title,
  `「${readBadge.title}」${readBadge.badge}`,
);

// ---- v2：面试准备 ----
await goto('#/interview');
await wait(700);

// 期望的分组顺序：schema 枚举序，组内保持产物的 id 序
const expectedGroups = (() => {
  const byCategory = new Map();
  for (const question of interviewSorted) {
    const list = byCategory.get(question.category) ?? [];
    list.push(question);
    byCategory.set(question.category, list);
  }
  const rank = new Map(CATEGORY_ORDER.map((category, index) => [category, index]));
  return [...byCategory.keys()]
    .sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99))
    .map((category) => ({ category, questions: byCategory.get(category) }));
})();

const interviewList = await evaluate(`
  const groups = [...document.querySelectorAll('.q-group')];
  return {
    groupTitles: groups.map((group) => group.querySelector('h3')?.textContent ?? ''),
    groupProgress: groups.map((group) => group.querySelector('.q-group-progress')?.textContent ?? ''),
    items: document.querySelectorAll('.q-item').length,
    freqBadges: [...document.querySelectorAll('.q-freq')].map((badge) => badge.textContent),
    sprintButton: document.querySelector('.interview-sprint button')?.textContent ?? '',
  };
`);

check(
  `面试题按 ${expectedGroups.length} 个分组列出（schema 枚举序）`,
  JSON.stringify(interviewList.groupTitles) === JSON.stringify(expectedGroups.map((group) => group.category)),
  interviewList.groupTitles.join('、'),
);
check(
  `全部 ${EXPECT.questions} 道题都在`,
  interviewList.items === EXPECT.questions,
  `实际 ${interviewList.items}`,
);
check(
  '每道题带出现频率标记',
  interviewList.freqBadges.length === EXPECT.questions &&
    interviewList.freqBadges.every((badge) => ['高频', '常见', '偶见'].includes(badge)),
  `高频 ${interviewList.freqBadges.filter((badge) => badge === '高频').length} 道`,
);
check(
  '各分组进度从产物现算（初始 0 / n）',
  JSON.stringify(interviewList.groupProgress) ===
    JSON.stringify(expectedGroups.map((group) => `0 / ${group.questions.length}`)),
  interviewList.groupProgress.join('、'),
);

// 冲刺路径入口：有冲刺路径就深链它，没有就进路径列表（期望从 paths.json 现算）
const sprintPath =
  pathsData.paths.find(
    (path) => /冲刺/.test(path.title) || /sprint/.test(path.id) || /冲刺/.test(path.id),
  ) ?? null;
const expectedSprintHash = sprintPath
  ? `#/p/${sprintPath.id}`
  : pathsData.paths[0]
    ? `#/p/${pathsData.paths[0].id}`
    : '#/paths';
await evaluate(`document.querySelector('.interview-sprint button').click(); return true;`);
await wait(500);
const sprintJump = await evaluate(`return location.hash;`);
check('「面试冲刺」路径入口与题库联动', sprintJump === expectedSprintHash, `${sprintJump}（期望 ${expectedSprintHash}）`);

// 题目详情：第一组的第一个问题（分组按枚举序、组内按产物 id 序渲染）
const firstQuestion = expectedGroups[0].questions[0];
await goto('#/interview');
await wait(500);
await evaluate(`document.querySelector('.q-item-main').click(); return true;`);
await wait(700);

const questionDetail = await evaluate(`
  return {
    hash: location.hash,
    heading: document.querySelector('.question-detail-head h2')?.textContent ?? '',
    sections: [...document.querySelectorAll('.question-section h3')].map((heading) => heading.textContent),
    sectionsWithBody: [...document.querySelectorAll('.question-section')].filter(
      (section) => section.querySelector('.md') !== null,
    ).length,
    reviewTitles: [...document.querySelectorAll('.question-review-list .review-title')].map(
      (title) => title.textContent,
    ),
    freq: document.querySelector('.question-detail-meta .q-freq')?.textContent ?? '',
  };
`);

check('题目详情路由正确', questionDetail.hash === `#/q/${firstQuestion.id}`, questionDetail.hash);
check('题目原文完整展示', questionDetail.heading === firstQuestion.question, questionDetail.heading);
check('频率标记在详情页仍在', questionDetail.freq === firstQuestion.frequency, questionDetail.freq);
check(
  '题目详情三节渲染：好答案要点 / 常见错误答案 / 追问',
  JSON.stringify(questionDetail.sections) ===
    JSON.stringify(['好答案的要点', '常见的错误答案', '面试官会怎么追问']),
  questionDetail.sections.join('、'),
);
check('三节都有正文', questionDetail.sectionsWithBody === 3, `${questionDetail.sectionsWithBody} / 3`);
check(
  `复习节点一个不少（${firstQuestion.nodes.length} 个）`,
  questionDetail.reviewTitles.length === questionNodesOf(firstQuestion),
  `实际 ${questionDetail.reviewTitles.length}`,
);

// 复习节点的依赖顺序：性质检查——每个节点的前置（在列表内的）都排在它前面
const reviewTitleToId = new Map(graphData.nodes.map((node) => [node.title, node.id]));
const reviewIds = questionDetail.reviewTitles.map((title) => reviewTitleToId.get(title));
const reviewPosition = new Map(reviewIds.map((id, index) => [id, index]));
const reviewViolations = [];
for (const id of reviewIds) {
  for (const prereq of prereqsById.get(id) ?? []) {
    if (reviewPosition.has(prereq) && reviewPosition.get(prereq) > reviewPosition.get(id)) {
      reviewViolations.push(`${prereq} 排在了 ${id} 后面`);
    }
  }
}
check(
  '复习节点按依赖顺序排列（前置在前）',
  reviewIds.every(Boolean) && reviewViolations.length === 0,
  reviewViolations.slice(0, 3).join(' | ') || reviewIds.map((id) => byId.get(id)?.title).join(' → '),
);

// 面试题 → 复习节点跳图谱。点的是**渲染出来的第一个**复习节点——
// 列表按依赖序排（最基础的在前），不一定是 frontmatter nodes 的第一项，
// 所以期望值从 DOM 渲染的标题反查回来，而不是从 JSON 里取 nodes[0]。
const firstRenderedReviewId = reviewTitleToId.get(questionDetail.reviewTitles[0]);
await evaluate(`document.querySelector('.question-review-list button').click(); return true;`);
await wait(700);
const reviewJump = await evaluate(`
  return { hash: location.hash, panel: Boolean(document.querySelector('.panel')) };
`);
check(
  '面试题 → 复习节点跳进图谱',
  reviewJump.hash === `#/n/${firstRenderedReviewId}` && reviewJump.panel,
  reviewJump.hash,
);

// 已掌握勾选 + 分组进度联动
await goto(`#/q/${firstQuestion.id}`);
await wait(500);
await evaluate(`document.querySelector('.q-mastered-toggle input').click(); return true;`);
await wait(300);
const masteredState = await evaluate(`
  return {
    checked: document.querySelector('.q-mastered-toggle input').checked,
    stored: localStorage.getItem('akg:mastered') ?? '',
  };
`);
check(
  '「已掌握」勾选写进本地存储',
  masteredState.checked && masteredState.stored.includes(firstQuestion.id),
  masteredState.stored,
);

await goto('#/interview');
await wait(500);
const masteredProgress = await evaluate(`
  return {
    groupProgress: [...document.querySelectorAll('.q-group-progress')].map((node) => node.textContent),
    badges: document.querySelectorAll('.q-mastered-badge').length,
  };
`);
check(
  '勾选后分组进度变为 1 / n',
  masteredProgress.groupProgress[0] === `1 / ${expectedGroups[0].questions.length}` &&
    masteredProgress.badges === 1,
  `${masteredProgress.groupProgress[0]}，标记 ${masteredProgress.badges} 个`,
);

// ---- v2：搜索扩展（案例标题与面试题问题） ----
await goto('#/cases');
await wait(500);

const caseQuery = firstCase.title.slice(0, 3);
await evaluate(`
  const input = document.querySelector('.search-input');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(caseQuery)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
  return true;
`);
await wait(400);
const caseHits = await evaluate(`
  return [...document.querySelectorAll('.search-results [role="option"]')].map((option) => ({
    title: option.querySelector('.hit-title')?.textContent ?? '',
    kind: option.querySelector('.hit-kind')?.textContent ?? '',
  }));
`);
check(
  '搜索能搜到案例标题',
  caseHits.some((hit) => hit.kind === '案例' && hit.title === firstCase.title),
  `搜「${caseQuery}」：${caseHits.map((hit) => `${hit.kind}·${hit.title.slice(0, 12)}`).join('、')}`,
);

await evaluate(`
  const option = [...document.querySelectorAll('.search-results [role="option"]')].find(
    (candidate) => candidate.querySelector('.hit-kind')?.textContent === '案例',
  );
  option.click();
  return true;
`);
await wait(500);
const searchCaseJump = await evaluate(`return location.hash;`);
check('搜索命中案例后进入案例详情', searchCaseJump === `#/c/${firstCase.id}`, searchCaseJump);

const questionQuery = firstQuestion.question.slice(1, 5);
await evaluate(`
  const input = document.querySelector('.search-input');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(questionQuery)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
  return true;
`);
await wait(400);
const questionHits = await evaluate(`
  return [...document.querySelectorAll('.search-results [role="option"]')].map((option) => ({
    title: option.querySelector('.hit-title')?.textContent ?? '',
    kind: option.querySelector('.hit-kind')?.textContent ?? '',
  }));
`);
check(
  '搜索能搜到面试题',
  questionHits.some((hit) => hit.kind === '面试题' && hit.title === firstQuestion.question),
  `搜「${questionQuery}」得 ${questionHits.length} 条`,
);

await evaluate(`
  const option = [...document.querySelectorAll('.search-results [role="option"]')].find(
    (candidate) => candidate.querySelector('.hit-kind')?.textContent === '面试题',
  );
  option.click();
  return true;
`);
await wait(500);
const searchQuestionJump = await evaluate(`return location.hash;`);
check('搜索命中面试题后进入题目详情', searchQuestionJump === `#/q/${firstQuestion.id}`, searchQuestionJump);

// ---- v2：新视图的暗色主题与窄屏 ----
// 到这里主题仍是暗色（v1 检查段设过 akg:theme=dark）
const darkPm = await evaluate(`
  return {
    theme: document.documentElement.dataset.theme,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
  };
`);
check('暗色主题对新视图同样生效', darkPm.theme === 'dark' && darkPm.bodyBg !== darkPm.bodyColor, darkPm.theme);

await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await goto('#/map');
await wait(700);
const mobileMap = await evaluate(`
  return {
    domains: document.querySelectorAll('.pm-domain').length,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    heroVisible: Boolean(document.querySelector('.pm-head h2')),
  };
`);
check(
  '窄屏下必修地图可用且无横向溢出',
  mobileMap.domains === EXPECT.pmDomains && mobileMap.overflow <= 1 && mobileMap.heroVisible,
  `${mobileMap.domains} 域 / 横向溢出 ${mobileMap.overflow}px`,
);

await goto('#/cases');
await wait(500);
const mobileCases = await evaluate(`
  return {
    cards: document.querySelectorAll('.case-card').length,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  };
`);
check(
  '窄屏下案例库可用且无横向溢出',
  mobileCases.cards === EXPECT.cases && mobileCases.overflow <= 1,
  `${mobileCases.cards} 个案例 / 横向溢出 ${mobileCases.overflow}px`,
);

await send('Emulation.clearDeviceMetricsOverride');

// ---- 控制台干净 ----
await wait(400);
check('浏览器控制台没有错误或警告', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | ') || '干净');

const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`);
socket.close();
process.exit(failed.length === 0 ? 0 : 1);
