/**
 * L2/L3 正文的块级解析。
 *
 * 和渲染分开放在 .ts 里，是为了让它能被测试直接 import——
 * 渲染器要用 JSX，而 JSX 没法在 node --test 里裸跑。
 *
 * 为什么不装 marked / markdown-it：内容文件用到的语法就下面这几种，
 * 自己写换来产物体积小，以及**不渲染原始 HTML**（渲染器不给自己留注入口子）。
 *
 * 覆盖：段落、围栏代码块、有序/无序列表（含嵌套）、表格。
 * 行内语法（粗体、斜体、行内代码、链接）在渲染层处理，见 components/Markdown.tsx。
 */

export type Block =
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'list'; items: ListItem[] }
  | { kind: 'para'; text: string };

export interface ListItem {
  ordered: boolean;
  text: string;
  children: ListItem[];
}

interface RawItem {
  ordered: boolean;
  indent: number;
  text: string;
}

const LIST_RE = /^(\s*)(?:([-*])|(\d+)\.)\s+(.*)$/;
const FENCE_RE = /^```(\w*)\s*$/;

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    const fence = FENCE_RE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // 收尾的 ```
      blocks.push({ kind: 'code', lang: fence[1], code: body.join('\n') });
      continue;
    }

    if (line.trimStart().startsWith('|')) {
      const raw: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        raw.push(lines[i]);
        i++;
      }
      const cells = raw.map(splitRow).filter((row) => row.length > 0);
      // 第二行是 |---|---| 这样的对齐行，不是数据
      const withoutRule = cells.filter(
        (row, index) => !(index === 1 && row.every((cell) => /^:?-{2,}:?$/.test(cell))),
      );
      const [header = [], ...rows] = withoutRule;
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    if (LIST_RE.test(line)) {
      const raw: RawItem[] = [];
      while (i < lines.length) {
        const current = lines[i];

        if (current.trim() === '') {
          // 空行后面还接着列表项就继续，否则这一块到此为止
          if (lines[i + 1] && LIST_RE.test(lines[i + 1])) {
            i++;
            continue;
          }
          break;
        }

        const item = LIST_RE.exec(current);
        if (item) {
          raw.push({
            ordered: item[3] !== undefined,
            indent: item[1].length,
            text: item[4].trim(),
          });
          i++;
          continue;
        }

        // 续行：缩进比当前项更深的普通文本，接在上一项后面
        const indent = current.length - current.trimStart().length;
        const previous = raw[raw.length - 1];
        if (previous && indent > previous.indent) {
          previous.text = joinLines(previous.text, current.trim());
          i++;
          continue;
        }
        break;
      }
      blocks.push({ kind: 'list', items: buildTree(raw) });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length) {
      const current = lines[i];
      if (
        current.trim() === '' ||
        LIST_RE.test(current) ||
        FENCE_RE.test(current) ||
        current.trimStart().startsWith('|')
      ) {
        break;
      }
      paragraph.push(current.trim());
      i++;
    }
    blocks.push({ kind: 'para', text: paragraph.reduce(joinLines, '') });
  }

  return blocks;
}

/** 中文之间不留空格，英文单词之间补一个——硬折行的段落拼回来才不会粘连。 */
export function joinLines(left: string, right: string): string {
  if (left === '') return right;
  const needsSpace = /[A-Za-z0-9)]$/.test(left) && /^[A-Za-z0-9(]/.test(right);
  return needsSpace ? `${left} ${right}` : `${left}${right}`;
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

export function buildTree(raw: RawItem[]): ListItem[] {
  const root: ListItem[] = [];
  const stack: { indent: number; item: ListItem }[] = [];

  for (const entry of raw) {
    const item: ListItem = { ordered: entry.ordered, text: entry.text, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].indent >= entry.indent) {
      stack.pop();
    }
    if (stack.length === 0) root.push(item);
    else stack[stack.length - 1].item.children.push(item);
    stack.push({ indent: entry.indent, item });
  }

  return root;
}
