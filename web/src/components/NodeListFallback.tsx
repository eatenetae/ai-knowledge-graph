import { useMemo } from 'react';

import type { GraphIndex } from '../lib/deps';
import type { DomainMeta } from '../types';

interface NodeListFallbackProps {
  index: GraphIndex;
  domains: DomainMeta[];
  selectedId: string | null;
  focusIds: Set<string> | null;
  onSelect: (id: string) => void;
}

/**
 * 窄屏降级：把图谱换成分组列表。
 *
 * 手机上把 23 个节点挤进一张可缩放的小图，收益是负的——点不准、看不清、
 * 还占满一屏。列表保留了同样的信息（标题 + L1 + 领域），三层卡片照常打开，
 * 交互一个不少。
 */
export function NodeListFallback({
  index,
  domains,
  selectedId,
  focusIds,
  onSelect,
}: NodeListFallbackProps) {
  const groups = useMemo(() => {
    const order = new Map(domains.map((domain, position) => [domain.id, position]));
    const buckets = new Map<string, typeof index.nodes>();

    for (const node of index.nodes) {
      if (focusIds && !focusIds.has(node.id)) continue;
      const bucket = buckets.get(node.domain);
      if (bucket) bucket.push(node);
      else buckets.set(node.domain, [node]);
    }

    return [...buckets.entries()].sort(
      (a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999),
    );
  }, [domains, focusIds, index.nodes]);

  if (groups.length === 0) {
    return <p className="empty">没有可显示的节点。</p>;
  }

  return (
    <div className="node-list">
      {groups.map(([domainId, nodes]) => (
        <section key={domainId} className="node-group">
          <h3>{domains.find((domain) => domain.id === domainId)?.label ?? domainId}</h3>
          <ul>
            {nodes.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  className={node.id === selectedId ? 'is-selected' : ''}
                  aria-current={node.id === selectedId}
                  onClick={() => onSelect(node.id)}
                >
                  <span className="list-title">{node.title}</span>
                  <span className="list-summary">{node.summary}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
