import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { search, type SearchHit, type SearchItem } from '../lib/search';

interface SearchBoxProps {
  items: SearchItem[];
  onSelect: (item: SearchItem) => void;
}

const KIND_LABEL: Record<SearchItem['kind'], string> = {
  node: '知识点',
  case: '案例',
  question: '面试题',
};

/**
 * 搜索：知识点、案例、面试题三处模糊匹配，键盘可选中。
 *
 * 用 combobox + listbox 的标准键盘契约：上下键移动、回车选中、Esc 关闭。
 * 高亮项用 aria-activedescendant 指出去，焦点始终留在输入框里——
 * 这样用户输入到一半按方向键不会丢焦点。
 */
export function SearchBox({ items, onSelect }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => search(items, query), [items, query]);

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

  const choose = (hit: SearchHit) => {
    onSelect(hit);
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
        choose(hit);
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
        placeholder="搜知识点、案例、面试题…"
        value={query}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && hits[activeIndex] ? `${listId}-${activeIndex}` : undefined}
        aria-label="搜索知识点、案例与面试题"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {showList && (
        <ul className="search-results" id={listId} role="listbox" aria-label="搜索结果">
          {hits.length === 0 && <li className="search-empty">没有匹配的知识点、案例或面试题。</li>}
          {hits.map((hit, position) => (
            <li key={`${hit.kind}:${hit.id}`} role="presentation">
              <button
                type="button"
                id={`${listId}-${position}`}
                role="option"
                aria-selected={position === activeIndex}
                className={position === activeIndex ? 'is-active' : ''}
                onPointerEnter={() => setActiveIndex(position)}
                onClick={() => choose(hit)}
              >
                <span className="hit-kind">{KIND_LABEL[hit.kind]}</span>
                <span className="hit-title">{hit.title}</span>
                <span className="hit-domain">{hit.subtitle}</span>
                {hit.kind === 'node' && <span className="hit-summary">{hit.body}</span>}
                <span className="hit-why">{hit.matched}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
