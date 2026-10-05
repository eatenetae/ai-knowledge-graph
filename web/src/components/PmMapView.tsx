import { useMemo, useState } from 'react';

import type { GraphIndex } from '../lib/deps';
import { domainHue } from '../lib/domains';
import type { DomainMeta, GraphJson, GraphNode } from '../types';

interface PmMapViewProps {
  graph: GraphJson;
  index: GraphIndex;
  /** 已掌握的节点 id（localStorage） */
  learned: string[];
  onToggleLearned: (nodeId: string) => void;
  onOpenNode: (nodeId: string) => void;
}

/**
 * PM 必修地图：六大能力域分组展示 `pm: core` 节点。
 *
 * 这是「面试前必须掌握」的清单——每域一节，节点只露标题 + L1 一句话，
 * 点标题进图谱看三层讲解（复用 v1 交互，这里不重做）。`pm: useful`
 * 节点是选修，收进「进阶」折叠区，不挤占主线。
 */
export function PmMapView({ graph, index, learned, onToggleLearned, onOpenNode }: PmMapViewProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const learnedSet = useMemo(() => new Set(learned), [learned]);

  const pmDomains = useMemo(
    () => [...graph.pm_domains].sort((a, b) => a.order - b.order),
    [graph.pm_domains],
  );

  const coreTotal = pmDomains.reduce((sum, domain) => sum + domain.core_nodes.length, 0);
  const coreLearned = pmDomains.reduce(
    (sum, domain) => sum + domain.core_nodes.filter((id) => learnedSet.has(id)).length,
    0,
  );

  // useful 节点不属于任何一个能力域（pm_domains 只登记 core），按知识领域分组展示
  const usefulByDomain = useMemo(() => groupByDomain(index, graph.domains, 'useful'), [index, graph.domains]);

  return (
    <div className="pm-map">
      <header className="pm-head">
        <h2>必修地图</h2>
        <p className="pm-lead">
          六大能力域是 AI 产品经理的地基。每读完一个知识点，勾掉它——
          全部勾完，面试需要的知识版图就齐了。
        </p>
        <div
          className="pm-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={coreTotal}
          aria-valuenow={coreLearned}
          aria-label="必修进度"
        >
          <div className="pm-progress-bar">
            <span style={{ width: `${coreTotal === 0 ? 0 : (coreLearned / coreTotal) * 100}%` }} />
          </div>
          <span className="pm-progress-text">
            {coreLearned} / {coreTotal} 个必修知识点
          </span>
        </div>
      </header>

      {pmDomains.map((domain) => (
        <PmDomainSection
          key={domain.id}
          domain={domain}
          index={index}
          learnedSet={learnedSet}
          onToggleLearned={onToggleLearned}
          onOpenNode={onOpenNode}
        />
      ))}

      <section className="pm-advanced">
        <button
          type="button"
          className="pm-advanced-toggle"
          aria-expanded={showAdvanced}
          aria-controls="pm-advanced-body"
          onClick={() => setShowAdvanced((open) => !open)}
        >
          进阶：还有 {usefulByDomain.reduce((sum, group) => sum + group.nodes.length, 0)} 个知识点值得看
          <span className="chevron" aria-hidden="true">
            {showAdvanced ? '▾' : '▸'}
          </span>
        </button>
        {showAdvanced && (
          <div id="pm-advanced-body" className="pm-advanced-body">
            <p className="pm-advanced-note">
              这些不在「面试前必须掌握」的清单里，但做深了迟早用得上。
            </p>
            {usefulByDomain.map((group) => (
              <div key={group.id} className="pm-advanced-group">
                <h4>{group.label}</h4>
                <ul>
                  {group.nodes.map((node) => (
                    <li key={node.id}>
                      <button type="button" onClick={() => onOpenNode(node.id)}>
                        <span className="pm-node-title">{node.title}</span>
                        <span className="pm-node-summary">{node.summary}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PmDomainSection({
  domain,
  index,
  learnedSet,
  onToggleLearned,
  onOpenNode,
}: {
  domain: GraphJson['pm_domains'][number];
  index: GraphIndex;
  learnedSet: Set<string>;
  onToggleLearned: (nodeId: string) => void;
  onOpenNode: (nodeId: string) => void;
}) {
  const nodes = domain.core_nodes
    .map((id) => index.byId.get(id))
    .filter((node): node is GraphNode => Boolean(node));
  const done = nodes.filter((node) => learnedSet.has(node.id)).length;

  return (
    <section
      className="pm-domain"
      style={{ '--hue': domainHue(domain.id) } as React.CSSProperties}
      aria-labelledby={`pm-domain-${domain.id}`}
    >
      <header className="pm-domain-head">
        <h3 id={`pm-domain-${domain.id}`}>{domain.label}</h3>
        <span className="pm-domain-count">
          {done} / {nodes.length}
        </span>
      </header>
      <p className="pm-domain-summary">{domain.summary}</p>

      <ul className="pm-nodes">
        {nodes.map((node) => {
          const isLearned = learnedSet.has(node.id);
          return (
            <li key={node.id} className={`pm-node ${isLearned ? 'is-learned' : ''}`}>
              <label className="pm-node-check">
                <input
                  type="checkbox"
                  checked={isLearned}
                  onChange={() => onToggleLearned(node.id)}
                  aria-label={`标记「${node.title}」${isLearned ? '未掌握' : '已掌握'}`}
                />
                <span className="pm-node-mark" aria-hidden="true">
                  {isLearned ? '✓' : ''}
                </span>
              </label>
              <button type="button" className="pm-node-main" onClick={() => onOpenNode(node.id)}>
                <span className="pm-node-title">{node.title}</span>
                <span className="pm-node-summary">{node.summary}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface DomainGroup {
  id: string;
  label: string;
  nodes: GraphNode[];
}

function groupByDomain(
  index: GraphIndex,
  domains: DomainMeta[],
  pm: 'core' | 'useful',
): DomainGroup[] {
  const byDomain = new Map<string, GraphNode[]>();
  for (const node of index.nodes) {
    if (node.pm !== pm) continue;
    const list = byDomain.get(node.domain);
    if (list) list.push(node);
    else byDomain.set(node.domain, [node]);
  }

  return domains
    .filter((domain) => byDomain.has(domain.id))
    .sort((a, b) => a.order - b.order)
    .map((domain) => ({ id: domain.id, label: domain.label, nodes: byDomain.get(domain.id)! }));
}
