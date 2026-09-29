import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { joinLines, parseBlocks } from '../src/lib/markdown.ts';
import type { ContentJson } from '../src/types.ts';

const content: ContentJson = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'public', 'content.json'), 'utf8'),
);

describe('块级解析', () => {
  it('围栏代码块整段保留，语言标注不丢', () => {
    const blocks = parseBlocks('前言\n\n```python\nx = 1\nprint(x)\n```\n\n后记');
    assert.deepEqual(
      blocks.map((block) => block.kind),
      ['para', 'code', 'para'],
    );
    const code = blocks[1];
    assert.equal(code.kind === 'code' && code.lang, 'python');
    assert.equal(code.kind === 'code' && code.code, 'x = 1\nprint(x)');
  });

  it('代码块里的 ## 不会被当成标题切开', () => {
    const blocks = parseBlocks('```python\n# 注释\n## 也是注释\n```');
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].kind, 'code');
  });

  it('表格丢掉 |---|---| 对齐行，保留表头与数据', () => {
    const blocks = parseBlocks('| 关注点 | 说明 |\n|---|---|\n| 规模 | 几千条 |');
    assert.equal(blocks.length, 1);
    const table = blocks[0];
    assert.ok(table.kind === 'table');
    assert.deepEqual(table.header, ['关注点', '说明']);
    assert.deepEqual(table.rows, [['规模', '几千条']]);
  });

  it('嵌套列表：有序列表挂在无序项下面', () => {
    const blocks = parseBlocks('- 计算分三步：\n  1. 先点积\n  2. 再 softmax\n- 另一项');
    assert.equal(blocks.length, 1);
    const list = blocks[0];
    assert.ok(list.kind === 'list');
    assert.equal(list.items.length, 2);
    assert.equal(list.items[0].children.length, 2);
    assert.equal(list.items[0].children[0].ordered, true);
    assert.equal(list.items[0].children[0].text, '先点积');
  });

  it('列表项之间的空行不会把列表切断', () => {
    const blocks = parseBlocks('- 一\n\n- 二\n\n正文');
    assert.deepEqual(
      blocks.map((block) => block.kind),
      ['list', 'para'],
    );
    const list = blocks[0];
    assert.ok(list.kind === 'list');
    assert.equal(list.items.length, 2);
  });

  it('行首的 ** 不会被误认成列表项', () => {
    const blocks = parseBlocks('**关键机制**');
    assert.equal(blocks[0].kind, 'para');
    assert.equal(blocks[0].kind === 'para' && blocks[0].text, '**关键机制**');
  });

  it('硬折行的段落拼回一行：中文不留空格，英文补空格', () => {
    assert.equal(joinLines('这是前半句', '这是后半句'), '这是前半句这是后半句');
    assert.equal(joinLines('hello', 'world'), 'hello world');
    assert.equal(joinLines('', '起始'), '起始');
  });
});

describe('真实内容：每个节点的 L2/L3 都能解析出块', () => {
  const ids = Object.keys(content.nodes);

  it('23 个节点的正文都解析出了内容', () => {
    assert.equal(ids.length, 23);
    for (const id of ids) {
      const entry = content.nodes[id];
      assert.ok(parseBlocks(entry.l2).length > 0, `${id} 的 L2 解析不出块`);
      assert.ok(parseBlocks(entry.l3).length > 0, `${id} 的 L3 解析不出块`);
    }
  });

  it('正文里没有残留的 frontmatter 分隔符', () => {
    for (const id of ids) {
      const entry = content.nodes[id];
      assert.doesNotMatch(entry.l2, /^---$/m, `${id} 的 L2 混进了 frontmatter`);
      assert.doesNotMatch(entry.l3, /^---$/m, `${id} 的 L3 混进了 frontmatter`);
    }
  });

  it('带代码块的节点，代码块被完整解析出来', () => {
    const withCode = ids.filter((id) =>
      parseBlocks(content.nodes[id].l3).some((block) => block.kind === 'code'),
    );
    assert.ok(withCode.length >= 15, `只有 ${withCode.length} 个节点解析出了代码块`);

    for (const id of withCode) {
      for (const block of parseBlocks(content.nodes[id].l3)) {
        if (block.kind !== 'code') continue;
        assert.ok(block.code.trim().length > 0, `${id} 有一个空的代码块`);
        assert.doesNotMatch(block.code, /^```/m, `${id} 的代码块里残留了围栏`);
      }
    }
  });

  it('带表格的节点，表格解析出了表头和数据行', () => {
    const withTable = ids.filter((id) =>
      parseBlocks(content.nodes[id].l3).some((block) => block.kind === 'table'),
    );
    assert.ok(withTable.length >= 8, `只有 ${withTable.length} 个节点解析出了表格`);

    for (const id of withTable) {
      for (const block of parseBlocks(content.nodes[id].l3)) {
        if (block.kind !== 'table') continue;
        assert.ok(block.header.length >= 2, `${id} 的表头只有 ${block.header.length} 列`);
        assert.ok(block.rows.length >= 1, `${id} 的表格没有数据行`);
        for (const row of block.rows) {
          assert.equal(row.length, block.header.length, `${id} 的表格行列数对不上`);
        }
      }
    }
  });

  it('每个节点都解析出了嵌套结构（列表或表格），说明没有整段塌成纯文本', () => {
    for (const id of ids) {
      const blocks = parseBlocks(content.nodes[id].l3);
      const hasStructure = blocks.some((block) => block.kind === 'list' || block.kind === 'table');
      assert.ok(hasStructure, `${id} 的 L3 里没有任何结构化内容`);
    }
  });
});
