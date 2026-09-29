/**
 * 用 Chrome DevTools Protocol 跑一遍真实浏览器冒烟测试。
 *
 * 单元测试能覆盖依赖运算和布局，但覆盖不了「页面在浏览器里到底能不能跑起来」——
 * React 渲染、SVG 交互、主题切换、localStorage 这些都要真跑一次才算数。
 *
 * 用法：node tools/cdp-check.mjs <baseUrl>
 */

const BASE = process.argv[2] ?? 'http://127.0.0.1:8733';
const DEBUG_PORT = process.env.CDP_PORT ?? '9222';

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

// ---- 图谱视图 ----
await goto('#/');
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

check('图谱渲染出 23 个节点', graph.count === 23, `实际 ${graph.count}`);
check('前置边与相关边都画了出来', graph.edges === 35, `实际 ${graph.edges}`);
check('12 个领域都有图例', graph.legendItems === 12, `实际 ${graph.legendItems}`);

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
await goto('#/n/transformer');
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
check('聚焦模式算出 6 个节点', /6\s*个节点/.test(focus.headline), focus.headline);
check('依赖子图外的节点被淡化', focus.dimmed === 17, `淡化了 ${focus.dimmed} 个（23-6=17）`);
check('目标节点被选中', focus.selected === 1);
check('目标节点在列表里带「目标」标记', focus.badgeCount === 1);
check(
  '依赖顺序：attention 排在 transformer 前，embedding 排在 attention 前',
  focus.steps.indexOf('注意力机制') < focus.steps.indexOf('Transformer') &&
    focus.steps.indexOf('词嵌入') < focus.steps.indexOf('注意力机制'),
  focus.steps.join(' → '),
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
  setter.call(input, '注意力');
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
check('搜索有结果', searched.count > 0, `${searched.count} 条，首条「${searched.first}」`);
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
check('4 条学习路径', paths.tabs === 4, `实际 ${paths.tabs}`);
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
check(
  '勾选步骤写进本地存储',
  toggled.checked && toggled.stored.includes(toggled.activePath === '构建 AI 智能体' ? 'build-ai-agent' : 'llm-app-developer'),
  `${toggled.activePath} -> ${toggled.stored}`,
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
await goto('#/n/attention');
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
await goto('#/n/rag');
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
  mobile.focusedItems === 12 && /12\s*个节点/.test(mobile.headline),
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
  '关掉聚焦模式后列表恢复全部 23 个节点',
  unfocused.items === 23 && unfocused.groups === 12,
  `${unfocused.items} 项 / ${unfocused.groups} 组`,
);

await send('Emulation.clearDeviceMetricsOverride');

// ---- 控制台干净 ----
await wait(400);
check('浏览器控制台没有错误或警告', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | ') || '干净');

const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`);
socket.close();
process.exit(failed.length === 0 ? 0 : 1);
