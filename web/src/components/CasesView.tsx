import { useMemo, useState } from 'react';

import type { GraphIndex } from '../lib/deps';
import { domainHue } from '../lib/domains';
import { Markdown } from './Markdown';
import type { CaseItem, CasesJson, PmDomainMeta } from '../types';

interface CasesViewProps {
  cases: CasesJson;
  pmDomains: PmDomainMeta[];
  index: GraphIndex;
  activeCaseId: string | null;
  /** 已读案例 id（localStorage） */
  readCases: string[];
  onToggleRead: (caseId: string) => void;
  onOpenCase: (caseId: string) => void;
  onBackToList: () => void;
  onOpenNode: (nodeId: string) => void;
}

const FILTER_ALL = 'all';

/** 与产物小节键一一对应的展示顺序与标题 */
const SECTIONS: Array<{ key: keyof CaseItem['sections']; title: string }> = [
  { key: 'background', title: '场景背景' },
  { key: 'decision_points', title: '决策点' },
  { key: 'process', title: '决策过程' },
  { key: 'outcome', title: '结果与教训' },
  { key: 'interview_pitch', title: '面试怎么讲' },
];

/**
 * 案例库：列表按能力域 / 行业筛选，详情分五节渲染。
 *
 * 案例的价值在「决策怎么做的」，所以详情里的关联知识节点全部可点——
 * 读到「这里用到了检索增强」，点一下就能跳进图谱把这块知识补上。
 */
export function CasesView({
  cases,
  pmDomains,
  index,
  activeCaseId,
  readCases,
  onToggleRead,
  onOpenCase,
  onBackToList,
  onOpenNode,
}: CasesViewProps) {
  const active = useMemo(
    () => cases.cases.find((item) => item.id === activeCaseId) ?? null,
    [cases.cases, activeCaseId],
  );

  if (active) {
    return (
      <CaseDetail
        item={active}
        pmDomains={pmDomains}
        index={index}
        isRead={readCases.includes(active.id)}
        onToggleRead={onToggleRead}
        onBackToList={onBackToList}
        onOpenNode={onOpenNode}
      />
    );
  }

  return (
    <CaseList
      cases={cases}
      pmDomains={pmDomains}
      readCases={readCases}
      onOpenCase={onOpenCase}
    />
  );
}

function CaseList({
  cases,
  pmDomains,
  readCases,
  onOpenCase,
}: {
  cases: CasesJson;
  pmDomains: PmDomainMeta[];
  readCases: string[];
  onOpenCase: (caseId: string) => void;
}) {
  const [domainFilter, setDomainFilter] = useState<string>(FILTER_ALL);
  const [industryFilter, setIndustryFilter] = useState<string>(FILTER_ALL);

  const pmDomainLabel = useMemo(
    () => new Map(pmDomains.map((domain) => [domain.id, domain.label])),
    [pmDomains],
  );

  // 行业筛选项从数据里来：有几个行业就给几个按钮，内容长了不用改前端
  const industries = useMemo(
    () => [...new Set(cases.cases.map((item) => item.industry))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    [cases.cases],
  );

  const filtered = cases.cases.filter(
    (item) =>
      (domainFilter === FILTER_ALL || item.domains.includes(domainFilter)) &&
      (industryFilter === FILTER_ALL || item.industry === industryFilter),
  );

  return (
    <div className="cases">
      <header className="cases-head">
        <h2>案例库</h2>
        <p className="cases-lead">
          每个案例都是一次真实的产品决策复盘：当时的取舍、用到的知识、结果与教训。
          数字要么有出处、要么标明是虚构但典型的场景。
        </p>
      </header>

      <div className="case-filters">
        <div className="case-filter-group" role="group" aria-label="按能力域筛选">
          <span className="case-filter-label">能力域</span>
          <button
            type="button"
            className={domainFilter === FILTER_ALL ? 'is-active' : ''}
            aria-pressed={domainFilter === FILTER_ALL}
            onClick={() => setDomainFilter(FILTER_ALL)}
          >
            全部
          </button>
          {pmDomains.map((domain) => (
            <button
              key={domain.id}
              type="button"
              className={domainFilter === domain.id ? 'is-active' : ''}
              aria-pressed={domainFilter === domain.id}
              onClick={() => setDomainFilter(domain.id)}
            >
              {domain.label}
            </button>
          ))}
        </div>

        <div className="case-filter-group" role="group" aria-label="按行业筛选">
          <span className="case-filter-label">行业</span>
          <button
            type="button"
            className={industryFilter === FILTER_ALL ? 'is-active' : ''}
            aria-pressed={industryFilter === FILTER_ALL}
            onClick={() => setIndustryFilter(FILTER_ALL)}
          >
            全部
          </button>
          {industries.map((industry) => (
            <button
              key={industry}
              type="button"
              className={industryFilter === industry ? 'is-active' : ''}
              aria-pressed={industryFilter === industry}
              onClick={() => setIndustryFilter(industry)}
            >
              {industry}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="empty">这个筛选组合下还没有案例。</p>
      ) : (
        <ul className="case-list">
          {filtered.map((item) => (
            <li key={item.id}>
              <button type="button" className="case-card" onClick={() => onOpenCase(item.id)}>
                <span className="case-card-title">{item.title}</span>
                <span className="case-card-meta">
                  {item.industry}
                  {item.domains.length > 0 && (
                    <>
                      {' · '}
                      {item.domains.map((id) => pmDomainLabel.get(id) ?? id).join(' / ')}
                    </>
                  )}
                </span>
                {readCases.includes(item.id) ? (
                  <span className="case-card-read">已读</span>
                ) : (
                  <span className="case-card-unread" aria-label="未读">
                    未读
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CaseDetail({
  item,
  pmDomains,
  index,
  isRead,
  onToggleRead,
  onBackToList,
  onOpenNode,
}: {
  item: CaseItem;
  pmDomains: PmDomainMeta[];
  index: GraphIndex;
  isRead: boolean;
  onToggleRead: (caseId: string) => void;
  onBackToList: () => void;
  onOpenNode: (nodeId: string) => void;
}) {
  const pmDomainLabel = new Map(pmDomains.map((domain) => [domain.id, domain.label]));
  const relatedNodes = item.nodes
    .map((id) => index.byId.get(id))
    .filter((node): node is NonNullable<typeof node> => Boolean(node));

  return (
    <article className="case-detail">
      <button type="button" className="back-link" onClick={onBackToList}>
        ← 返回案例库
      </button>

      <header className="case-detail-head">
        <h2>{item.title}</h2>
        <p className="case-detail-meta">
          {item.industry}
          {item.domains.length > 0 && (
            <>
              {' · '}
              {item.domains.map((id) => pmDomainLabel.get(id) ?? id).join(' / ')}
            </>
          )}
          {' · '}
          更新于 {item.updated_at}
        </p>
        <label className="case-read-toggle">
          <input
            type="checkbox"
            checked={isRead}
            onChange={() => onToggleRead(item.id)}
            aria-label={`把案例「${item.title}」标记为${isRead ? '未读' : '已读'}`}
          />
          <span>{isRead ? '✓ 已读' : '标为已读'}</span>
        </label>
      </header>

      {SECTIONS.map((section) => (
        <section key={section.key} className="case-section" aria-label={section.title}>
          <h3>{section.title}</h3>
          {item.sections[section.key].trim() !== '' ? (
            <Markdown source={item.sections[section.key]} />
          ) : (
            <p className="empty">这一节还没有内容。</p>
          )}
        </section>
      ))}

      <section className="case-nodes" aria-label="关联知识节点">
        <h3>这个案例用到的知识</h3>
        <ul>
          {relatedNodes.map((node) => (
            <li key={node.id} style={{ '--hue': domainHue(node.domain) } as React.CSSProperties}>
              <button type="button" onClick={() => onOpenNode(node.id)}>
                <span className="case-node-title">{node.title}</span>
                <span className="case-node-summary">{node.summary}</span>
                <span className="case-node-go" aria-hidden="true">
                  在图谱中查看 →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {item.sources.length > 0 && (
        <section className="case-sources" aria-label="资料来源">
          <h3>资料来源</h3>
          <ul>
            {item.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer noopener">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
