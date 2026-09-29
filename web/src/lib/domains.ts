/**
 * 领域配色。
 *
 * 只给每个领域定一个**色相**，明度和饱和度交给 CSS 变量按主题决定——
 * 这样「亮色下够深、暗色下够亮」是样式表的事，不用在 JS 里写两套色值，
 * 也不会出现暗色模式下某个领域糊成一片的情况。
 *
 * 色相之间的间隔是刻意拉开的：相邻领域（比如 retrieval 和 rag）差 20° 以上，
 * 图上挨着也能分清。
 */
const HUES: Record<string, number> = {
  foundations: 212,
  'neural-networks': 268,
  transformer: 292,
  'llm-training': 330,
  prompting: 28,
  retrieval: 176,
  rag: 152,
  agents: 196,
  finetuning: 246,
  evaluation: 52,
  deployment: 96,
  safety: 8,
};

const FALLBACK_HUE = 210;

export function domainHue(domainId: string): number {
  return HUES[domainId] ?? FALLBACK_HUE;
}

/** 挂在 SVG 根节点上，供 `.node-dot` 之类的规则取用 */
export function domainCssVars(domainIds: Iterable<string>): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const id of domainIds) {
    vars[`--hue-${id}`] = String(domainHue(id));
  }
  return vars;
}

export function nodeColor(domainId: string): string {
  return `hsl(${domainHue(domainId)} var(--domain-sat) var(--domain-light))`;
}
