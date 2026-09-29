import { Fragment, useMemo, type ReactNode } from 'react';

import { parseBlocks, type Block, type ListItem } from '../lib/markdown';

/**
 * L2/L3 正文的渲染。块级解析在 lib/markdown.ts（那边能跑测试），
 * 这里只负责把解析结果变成 React 元素。
 *
 * 刻意不渲染原始 HTML：内容来自仓库、是可信任的，但渲染器不留注入口子，
 * 将来内容源变复杂了也不用回头补一道消毒。
 */
export function Markdown({ source }: { source: string }) {
  const blocks = useMemo(() => parseBlocks(source), [source]);
  return (
    <div className="md">
      {blocks.map((block, index) => (
        <Fragment key={index}>{renderBlock(block)}</Fragment>
      ))}
    </div>
  );
}

function renderBlock(block: Block): ReactNode {
  switch (block.kind) {
    case 'code':
      return (
        <pre className="md-code">
          <code className={block.lang ? `language-${block.lang}` : undefined}>{block.code}</code>
        </pre>
      );

    case 'table':
      return (
        <div className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                {block.header.map((cell, index) => (
                  <th key={index}>{renderInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'list':
      return renderList(block.items);

    case 'para':
      return <p className="md-p">{renderInline(block.text)}</p>;
  }
}

function renderList(items: ListItem[]): ReactNode {
  if (items.length === 0) return null;
  const ordered = items[0].ordered;
  const Tag = ordered ? 'ol' : 'ul';

  return (
    <Tag className="md-list">
      {items.map((item, index) => (
        <li key={index}>
          {renderInline(item.text)}
          {item.children.length > 0 && renderList(item.children)}
        </li>
      ))}
    </Tag>
  );
}

const INLINE_RE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\n]+\*)/g;

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;

  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > cursor) out.push(text.slice(cursor, match.index));
    const token = match[0];
    const key = `t${match.index}`;

    if (token.startsWith('`')) {
      out.push(
        <code key={key} className="md-inline-code">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      if (link) {
        out.push(
          <a key={key} href={link[2]} target="_blank" rel="noreferrer noopener">
            {link[1]}
          </a>,
        );
      } else {
        out.push(token);
      }
    } else {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}
