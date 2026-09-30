import { useEffect, useId, useMemo, useRef, useState } from 'react';

import type { GraphIndex } from '../lib/deps';
import type { DomainMeta } from '../types';

interface SearchBoxProps {
  index: GraphIndex;
  domains: DomainMeta[];
  onOpenNode: (id: string) => void;
}

interface Hit {
  id: string;
  title: string;
  summary: string;
  domain: string;
  /** 命中的字段，用来告诉用户「为什么它被搜出来」 */
  matched: string;
  score: number;
}

const MAX_HITS = 8;

/**
 * 搜索：标题、标签、L1 内容三处模糊匹配，键盘可选中。
 *
 * 用 combobox + listbox 的标准键盘契约：上下键移动、回车选中、Esc 关闭。
 * 高亮项用 aria-activedescendant 指出去，焦点始终留在输入框里——
 * 这样用户输入到一半按方向键不会丢焦点。
 */
export function SearchBox({ index, domains, onOpenNode }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  const domainLabel = useMemo(
    () => new Map(domains.map((domain) => [domain.id, domain.label])),
    [domains],
  );

  const hits = useMemo(() => search(index, query), [index, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // 点到外面就收起结果列表，但不清空输入——用户多半还想接着搜
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const choose = (id: string) => {
    onOpenNode(id);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (hits.length === 0) return;
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (current + step + hits.length) % hits.length);
      return;
    }
    if (event.key === 'Enter') {
      const hit = hits[activeIndex];
      if (hit) {
        event.preventDefault();
        choose(hit.id);
      }
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
  };

  const showList = open && query.trim() !== '';

  return (
    <div className="search" ref={boxRef}>
      <input
        type="search"
        className="search-input"
        placeholder="搜知识点、标签，或一句话…"
        value={query}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && hits[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        aria-label="搜索知识点"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {showList && (
        <ul className="search-results" id={listId} role="listbox" aria-label="搜索结果">
          {hits.length === 0 && <li className="search-empty">没有匹配的知识点。</li>}
          {hits.map((hit, position) => (
            <li key={hit.id} role="presentation">
              <button
                type="button"
                id={`${listId}-${position}`}
                role="option"
                aria-selected={position === activeIndex}
                className={position === activeIndex ? 'is-active' : ''}
                onPointerEnter={() => setActiveIndex(position)}
                onClick={() => choose(hit.id)}
              >
                <span className="hit-title">{hit.title}</span>
                <span className="hit-domain">{domainLabel.get(hit.domain) ?? hit.domain}</span>
                <span className="hit-summary">{hit.summary}</span>
                <span className="hit-why">{hit.matched}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 打分规则刻意做得简单可解释：标题命中权重最高，其次标签，最后 L1 正文。
 * 中文没有词边界，所以直接按子串匹配，并把「从开头命中」额外加分。
 */
function search(index: GraphIndex, rawQuery: string): Hit[] {
  const query = rawQuery.trim().toLowerCase();
  if (query === '') return [];

  const hits: Hit[] = [];

  for (const node of index.nodes) {
    let score = 0;
    let matched = '';

    const title = node.title.toLowerCase();
    if (title.includes(query)) {
      score = 100 + (title.startsWith(query) ? 40 : 0);
      matched = '标题命中';
    }

    if (score < 100) {
      const tag = node.tags.find((item) => item.toLowerCase().includes(query));
      if (tag) {
        score = Math.max(score, 60);
        matched = `标签：${tag}`;
      }
    }

    if (score === 0 && node.summary.toLowerCase().includes(query)) {
      score = 30;
      matched = '一句话命中';
    }

    if (score === 0) {
      const domain = node.domain.toLowerCase();
      if (domain.includes(query)) {
        score = 10;
        matched = '领域命中';
      }
    }

    if (score > 0) {
      hits.push({ id: node.id, title: node.title, summary: node.summary, domain: node.domain, matched, score });
    }
  }

  return hits
    .sort((a, b) => (b.score - a.score) || a.title.localeCompare(b.title, 'zh-Hans-CN'))
    .slice(0, MAX_HITS);
}
