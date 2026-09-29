/**
 * frontmatter 解析器。
 *
 * 这里刻意只实现本项目内容模型用到的一小撮 YAML 子集，换来两件事：
 *   1. 零依赖 —— 全新克隆 `node build/index.js` 直接能跑，不需要 npm install；
 *   2. 报错可读 —— 每个解析错误都带行号和「应该怎么写」，而不是丢一个 YAML 堆栈。
 *
 * 支持的写法（够用即止）：
 *
 *   key: 字符串            # 标量，一律按字符串处理（不会把 2026-09-29 变成日期对象）
 *   key: "带 空格 的字符串"
 *   key: []                # 空列表
 *   key: [a, b, c]         # 行内列表
 *   key:                   # 块状列表
 *     - a
 *     - b
 *   key:                   # 块状对象列表
 *     - title: 标题
 *       url: https://...
 *
 * 明确不支持：多行字符串（| / >）、锚点与别名（& / *）、嵌套两层以上的块状结构、
 * 行尾注释（`#` 只有独占一行时才是注释，这样 URL 里的 # 不会被吃掉）。
 */

export class FrontmatterError extends Error {
  constructor(message, line) {
    super(message);
    this.name = 'FrontmatterError';
    this.line = line;
  }
}

const KEY_RE = /^([A-Za-z_][A-Za-z0-9_-]*):(?:[ \t]+(.*))?$/;

/**
 * 把源文件切成 frontmatter 数据与正文。
 * @returns {{data: Record<string, unknown>, body: string, bodyStartLine: number}}
 */
export function parseFrontmatter(source) {
  const text = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const rawLines = text.split('\n');

  // 跳过开头的空行，定位 `---`
  let start = 0;
  while (start < rawLines.length && rawLines[start].trim() === '') start++;

  if (rawLines[start] === undefined || rawLines[start].trim() !== '---') {
    throw new FrontmatterError(
      '文件必须以 frontmatter 开头：第一行写 `---`，接着是字段，再用一行 `---` 收尾',
      1,
    );
  }

  let end = -1;
  for (let i = start + 1; i < rawLines.length; i++) {
    if (rawLines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) {
    throw new FrontmatterError(
      'frontmatter 没有收尾：字段写完后需要单独一行 `---`',
      start + 1,
    );
  }

  const entries = [];
  for (let i = start + 1; i < end; i++) {
    const raw = rawLines[i];
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue;
    if (raw.includes('\t')) {
      throw new FrontmatterError(
        '缩进必须用空格，不能用 Tab（本项目统一 2 个空格）',
        i + 1,
      );
    }
    const indent = raw.length - raw.trimStart().length;
    entries.push({ indent, text: raw.trim(), line: i + 1 });
  }

  const { value, next } = parseMapping(entries, 0, 0);
  if (next < entries.length) {
    throw new FrontmatterError(
      `这一行的缩进对不上，解析器无法归位：${entries[next].text}`,
      entries[next].line,
    );
  }

  return {
    data: value,
    body: rawLines.slice(end + 1).join('\n'),
    bodyStartLine: end + 2,
  };
}

function parseMapping(entries, index, indent) {
  const out = {};
  let i = index;

  while (i < entries.length) {
    const entry = entries[i];
    if (entry.indent < indent) break;
    if (entry.indent > indent) {
      throw new FrontmatterError(
        `这一行的缩进比上一行多了 ${entry.indent - indent} 个空格，但它上面没有可以归属的字段`,
        entry.line,
      );
    }
    if (entry.text.startsWith('- ')) break; // 交给调用方的列表解析

    const match = KEY_RE.exec(entry.text);
    if (!match) {
      throw new FrontmatterError(
        `这一行不是合法的 \`字段: 值\`：${entry.text}`,
        entry.line,
      );
    }

    const key = match[1];
    const inline = match[2] === undefined ? '' : match[2].trim();

    if (inline !== '') {
      out[key] = parseScalar(inline, entry.line);
      i++;
      continue;
    }

    // `key:` 后面没写东西 —— 看下一行的缩进决定是块状列表还是块状对象
    const next = entries[i + 1];
    if (next && next.indent > indent && next.text.startsWith('- ')) {
      const seq = parseSequence(entries, i + 1, next.indent);
      out[key] = seq.value;
      i = seq.next;
    } else if (next && next.indent > indent) {
      const map = parseMapping(entries, i + 1, next.indent);
      out[key] = map.value;
      i = map.next;
    } else {
      throw new FrontmatterError(
        `字段 \`${key}\` 后面没有值。如果是有意留空，请写成 \`${key}: []\``,
        entry.line,
      );
    }
  }

  return { value: out, next: i };
}

function parseSequence(entries, index, indent) {
  const out = [];
  let i = index;

  while (i < entries.length) {
    const entry = entries[i];
    if (entry.indent < indent) break;
    if (entry.indent > indent) {
      throw new FrontmatterError(
        `列表项的缩进不一致（这一项比上一项多了 ${entry.indent - indent} 个空格）`,
        entry.line,
      );
    }
    if (!entry.text.startsWith('- ')) break;

    const rest = entry.text.slice(2).trim();
    if (KEY_RE.test(rest)) {
      // `- title: xxx` —— 把 `- ` 当作 2 个额外缩进，剩下的按对象解析，
      // 这样后面的 `  url: xxx` 续行会自然被吃掉。
      const rewritten = entries.slice();
      rewritten[i] = { indent: indent + 2, text: rest, line: entry.line };
      const map = parseMapping(rewritten, i, indent + 2);
      out.push(map.value);
      i = map.next;
    } else {
      out.push(parseScalar(rest, entry.line));
      i++;
    }
  }

  return { value: out, next: i };
}

function parseScalar(text, line) {
  if (text.startsWith('[')) {
    if (!text.endsWith(']')) {
      throw new FrontmatterError(
        `行内列表缺少收尾的 \`]\`：${text}`,
        line,
      );
    }
    const inner = text.slice(1, -1).trim();
    if (inner === '') return [];
    return splitFlow(inner, line).map((part) => parseScalar(part, line));
  }

  if (text.startsWith('"') || text.startsWith("'")) {
    const quote = text[0];
    if (text.length < 2 || !text.endsWith(quote)) {
      throw new FrontmatterError(`字符串的引号没有闭合：${text}`, line);
    }
    const inner = text.slice(1, -1);
    return quote === '"'
      ? inner.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
      : inner.replace(/''/g, "'");
  }

  // 标量一律保持字符串。这样 `updated_at: 2026-09-29` 不会被解析成 Date 对象，
  // 类型错误也会老实地在 schema 校验阶段报出来，而不是在这里被悄悄吞掉。
  return text;
}

function splitFlow(inner, line) {
  const parts = [];
  let current = '';
  let quote = null;

  for (const ch of inner) {
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ',') {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (quote) {
    throw new FrontmatterError('行内列表里的引号没有闭合', line);
  }
  parts.push(current.trim());

  return parts.filter((part) => part !== '');
}

/**
 * 从正文里取出 `## 直觉` 与 `## 细节` 两节。
 * @returns {Record<string, string>} 小节标题 -> 正文（去掉首尾空行）
 */
export function parseSections(body) {
  const sections = {};
  let current = null;
  const buffer = [];

  const flush = () => {
    if (current !== null) sections[current] = buffer.join('\n').trim();
  };

  for (const line of body.split('\n')) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      buffer.length = 0;
      current = match[1];
      continue;
    }
    if (current !== null) buffer.push(line);
  }
  flush();

  return sections;
}
