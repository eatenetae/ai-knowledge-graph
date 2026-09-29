import { useEffect, useMemo, useRef, useState } from 'react';

import type { ContentEntry, DomainMeta, GraphNode } from '../types';
import type { GraphIndex } from '../lib/deps';
import { dependencySubgraph } from '../lib/deps';
import { domainHue } from '../lib/domains';
import { Markdown } from './Markdown';

interface NodePanelProps {
  node: GraphNode;
  content: ContentEntry | undefined;
  index: GraphIndex;
  domains: DomainMeta[];
  focusOn: boolean;
  onToggleFocus: (next: boolean) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/**
 * 三层卡片。
 *
 * 这是全站最重要的一个组件：默认只露 L1 一句话，用户主动点才展开下一层。
 * 展开是**面板内**的状态切换，不跳页、不刷新——一旦跳页，刚建立起来的
 * 阅读节奏就断了，这正是「新手劝退」最容易发生的地方。
 */
export function NodePanel({
  node,
  content,
  index,
  domains,
  focusOn,
  onToggleFocus,
  onSelect,
  onClose,
}: NodePanelProps) {
  const [showL2, setShowL2] = useState(false);
  const [showL3, setShowL3] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // 面板一打开就把焦点移进来，键盘用户不用再 Tab 一路找过来
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const domainLabel = useMemo(
    () => domains.find((domain) => domain.id === node.domain)?.label ?? node.domain,
    [domains, node.domain],
  );

  const focus = useMemo(() => dependencySubgraph(index, node.id), [index, node.id]);

  const directPrereqs = index.prereqsOf.get(node.id) ?? [];
  const directDependents = index.dependentsOf.get(node.id) ?? [];

  return (
    <aside className="panel" aria-labelledby="panel-title">
      <header className="panel-head">
        <div className="panel-heading">
          <span className="panel-domain" style={{ '--hue': domainHue(node.domain) } as React.CSSProperties}>
            {domainLabel}
          </span>
          <h2 id="panel-title" ref={titleRef} tabIndex={-1}>
            {node.title}
          </h2>
        </div>
        <button type="button" className="panel-close" onClick={onClose} aria-label="关闭卡片">
          ✕
        </button>
      </header>

      {/* L1：默认就能看到的唯一一层 */}
      <p className="l1">{node.summary}</p>

      <div className="layer-tabs" role="group" aria-label="展开更多讲解">
        <button
          type="button"
          className={`layer-tab ${showL2 ? 'is-open' : ''}`}
          aria-expanded={showL2}
          aria-controls="layer-l2"
          onClick={() => setShowL2((open) => !open)}
        >
          为什么重要
          <span className="chevron" aria-hidden="true">
            {showL2 ? '▾' : '▸'}
          </span>
        </button>
        <button
          type="button"
          className={`layer-tab ${showL3 ? 'is-open' : ''}`}
          aria-expanded={showL3}
          aria-controls="layer-l3"
          onClick={() => setShowL3((open) => !open)}
        >
          深入细节
          <span className="chevron" aria-hidden="true">
            {showL3 ? '▾' : '▸'}
          </span>
        </button>
      </div>

      {showL2 && (
        <section className="layer layer-l2" id="layer-l2" aria-label="L2 直觉层">
          {content?.l2 ? (
            <Markdown source={content.l2} />
          ) : (
            <p className="empty">这一层还没有内容。</p>
          )}
        </section>
      )}

      {showL3 && (
        <section className="layer layer-l3" id="layer-l3" aria-label="L3 细节层">
          {content?.l3 ? <Markdown source={content.l3} /> : <p className="empty">这一层还没有内容。</p>}

          {node.sources.length > 0 && (
            <div className="sources">
              <h3>原始资料</h3>
              <ul>
                {node.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer noopener">
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="focus" aria-label="聚焦模式">
        <label className="focus-toggle">
          <input
            type="checkbox"
            checked={focusOn}
            onChange={(event) => onToggleFocus(event.target.checked)}
          />
          <span>聚焦模式</span>
        </label>

        {focusOn && (
          <>
            <p className="focus-headline">
              {focus.ordered.length <= 1 ? (
                <>
                  它没有前置依赖，<strong>可以直接开始</strong>。
                </>
              ) : (
                <>
                  学会「{node.title}」，你现在只需要看这 <strong>{focus.ordered.length}</strong> 个节点。
                </>
              )}
            </p>

            <ol className="focus-list">
              {focus.ordered.map((id, position) => {
                const item = index.byId.get(id);
                if (!item) return null;
                const isTarget = id === node.id;
                return (
                  <li key={id} className={isTarget ? 'is-target' : ''}>
                    <button type="button" onClick={() => onSelect(id)} aria-current={isTarget}>
                      <span className="focus-index">{position + 1}</span>
                      <span className="focus-text">
                        <span className="focus-title">{item.title}</span>
                        <span className="focus-summary">{item.summary}</span>
                      </span>
                      {isTarget && <span className="focus-badge">目标</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        {!focusOn && (
          <div className="relations">
            <RelationList label="直接前置" ids={directPrereqs} index={index} onSelect={onSelect} />
            <RelationList label="学了它能学" ids={directDependents} index={index} onSelect={onSelect} />
          </div>
        )}
      </section>

      <footer className="panel-foot">
        {node.tags.length > 0 && (
          <ul className="tags">
            {node.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
        <p className="meta">
          更新于 {node.updated_at} · <code>{node.file}</code>
        </p>
      </footer>
    </aside>
  );
}

function RelationList({
  label,
  ids,
  index,
  onSelect,
}: {
  label: string;
  ids: string[];
  index: GraphIndex;
  onSelect: (id: string) => void;
}) {
  if (ids.length === 0) return null;
  return (
    <div className="relation">
      <h3>{label}</h3>
      <ul>
        {ids.map((id) => {
          const node = index.byId.get(id);
          if (!node) return null;
          return (
            <li key={id}>
              <button type="button" onClick={() => onSelect(id)}>
                {node.title}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
