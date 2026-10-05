import type { CasesJson, DomainMeta, GraphJson, InterviewJson } from '../types';

/**
 * 全站搜索：v2 起不只搜知识点，也搜案例标题和面试题。
 *
 * 三类东西统一成同一种「可搜条目」，打分规则保持简单可解释：
 * 标题命中权重最高，其次标签，最后正文（L1 / 行业 / 分组）。
 * 中文没有词边界，所以直接按子串匹配，并把「从开头命中」额外加分。
 */
export type SearchKind = 'node' | 'case' | 'question';

/** 正文命中的提示语：三类条目的「正文」含义不一样，分开说才不打哑谜 */
const BODY_MATCH_LABEL: Record<SearchKind, string> = {
  node: '一句话命中',
  case: '行业或能力域命中',
  question: '分组命中',
};

export interface SearchItem {
  kind: SearchKind;
  /** node / case / question 的 id，选中后由调用方决定跳到哪个视图 */
  id: string;
  /** 主标题（面试题用问题原文） */
  title: string;
  /** 副标题：领域 / 行业 / 分组等信息 */
  subtitle: string;
  /** 次要匹配文本（L1 一句话 / 标签 / 频率） */
  body: string;
  tags: string[];
  /** 知识点的领域 id（v1 行为：领域名也能搜到节点） */
  domain?: string;
}

export interface SearchHit extends SearchItem {
  /** 命中的字段，用来告诉用户「为什么它被搜出来」 */
  matched: string;
  score: number;
}

export function buildSearchItems(
  graph: GraphJson,
  cases: CasesJson,
  interview: InterviewJson,
): SearchItem[] {
  const domainLabel = new Map<string, string>(
    graph.domains.map((domain: DomainMeta) => [domain.id, domain.label]),
  );
  const pmDomainLabel = new Map<string, string>(
    graph.pm_domains.map((domain) => [domain.id, domain.label]),
  );

  const items: SearchItem[] = [];

  for (const node of graph.nodes) {
    items.push({
      kind: 'node',
      id: node.id,
      title: node.title,
      subtitle: domainLabel.get(node.domain) ?? node.domain,
      body: node.summary,
      tags: node.tags,
      domain: node.domain,
    });
  }

  for (const item of cases.cases) {
    items.push({
      kind: 'case',
      id: item.id,
      title: item.title,
      subtitle: `案例 · ${item.industry}`,
      // 行业和能力域也参与匹配：用户想找「电商」或「评测」相关的案例
      body: [item.industry, ...item.domains.map((id) => pmDomainLabel.get(id) ?? id)].join(' '),
      tags: item.tags,
    });
  }

  for (const item of interview.questions) {
    items.push({
      kind: 'question',
      id: item.id,
      title: item.question,
      subtitle: `面试题 · ${item.category} · ${item.frequency}`,
      body: item.category,
      tags: [],
    });
  }

  return items;
}

/**
 * 打分规则刻意做得简单可解释：标题命中权重最高，其次标签，最后正文。
 * 并列时按标题排序，保证同样的输入永远得到同样的顺序。
 */
export function search(items: SearchItem[], rawQuery: string, maxHits = 8): SearchHit[] {
  const query = rawQuery.trim().toLowerCase();
  if (query === '') return [];

  const hits: SearchHit[] = [];

  for (const item of items) {
    let score = 0;
    let matched = '';

    const title = item.title.toLowerCase();
    if (title.includes(query)) {
      score = 100 + (title.startsWith(query) ? 40 : 0);
      matched = '标题命中';
    }

    if (score < 100) {
      const tag = item.tags.find((tag) => tag.toLowerCase().includes(query));
      if (tag) {
        score = Math.max(score, 60);
        matched = `标签：${tag}`;
      }
    }

    if (score === 0 && item.body.toLowerCase().includes(query)) {
      score = 30;
      matched = BODY_MATCH_LABEL[item.kind];
    }

    if (score === 0 && item.domain && item.domain.toLowerCase().includes(query)) {
      score = 10;
      matched = '领域命中';
    }

    if (score > 0) {
      hits.push({ ...item, matched, score });
    }
  }

  return hits
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'zh-Hans-CN'))
    .slice(0, maxHits);
}
