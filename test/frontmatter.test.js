import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FrontmatterError,
  parseFrontmatter,
  parseSections,
} from '../build/lib/frontmatter.js';

import { capture } from './helpers.js';

describe('frontmatter 解析', () => {
  it('解析标量、行内列表、块状列表与对象列表', () => {
    const { data, body } = parseFrontmatter(`---
id: demo
title: "带 引号 的标题"
prerequisites:
  - alpha
  - beta
related: [gamma, delta]
tags: []
sources:
  - title: 一篇论文
    url: https://arxiv.org/abs/1706.03762
updated_at: 2026-09-29
---
正文第一行
`);

    assert.equal(data.id, 'demo');
    assert.equal(data.title, '带 引号 的标题');
    assert.deepEqual(data.prerequisites, ['alpha', 'beta']);
    assert.deepEqual(data.related, ['gamma', 'delta']);
    assert.deepEqual(data.tags, []);
    assert.deepEqual(data.sources, [
      { title: '一篇论文', url: 'https://arxiv.org/abs/1706.03762' },
    ]);
    assert.equal(body.trim(), '正文第一行');
  });

  it('日期保持字符串，不被悄悄转成 Date 对象', () => {
    const { data } = parseFrontmatter('---\nupdated_at: 2026-09-29\n---\n');
    assert.equal(typeof data.updated_at, 'string');
    assert.equal(data.updated_at, '2026-09-29');
  });

  it('URL 里的 # 不会被当成注释吃掉', () => {
    const { data } = parseFrontmatter(
      '---\nurl: https://example.com/page#section\n---\n',
    );
    assert.equal(data.url, 'https://example.com/page#section');
  });

  it('缺收尾的 --- 时，报错带行号且说明怎么改', () => {
    const error = capture(() => parseFrontmatter('---\nid: demo\n'));
    assert.ok(error instanceof FrontmatterError);
    assert.match(error.message, /收尾/);
    assert.equal(error.line, 1);
  });

  it('用 Tab 缩进时，明确提示改用空格', () => {
    const error = capture(() => parseFrontmatter('---\nid: demo\ntags:\n\t- a\n---\n'));
    assert.ok(error instanceof FrontmatterError);
    assert.match(error.message, /Tab/);
    assert.equal(error.line, 4);
  });

  it('字段后面空着时，提示可以写成 []', () => {
    const error = capture(() =>
      parseFrontmatter('---\nid: demo\ntags:\nrelated:\n  - x\n---\n'),
    );
    assert.ok(error instanceof FrontmatterError);
    assert.match(error.message, /tags: \[\]/);
  });

  it('文件不以 --- 开头时，给出写法提示而不是堆栈', () => {
    const error = capture(() => parseFrontmatter('# 标题\n\n正文\n'));
    assert.ok(error instanceof FrontmatterError);
    assert.match(error.message, /第一行写 `---`/);
  });
});

describe('正文小节解析', () => {
  it('取出 `## 直觉` 与 `## 细节`', () => {
    const sections = parseSections(`
## 直觉

为什么重要。

## 细节

关键机制。
`);
    assert.equal(sections['直觉'], '为什么重要。');
    assert.equal(sections['细节'], '关键机制。');
  });

  it('不会把代码块里的 ### 当成小节', () => {
    const sections = parseSections('## 细节\n\n```python\n### 这是注释\nx = 1\n```\n');
    assert.match(sections['细节'], /### 这是注释/);
    assert.equal(sections['### 这是注释'], undefined);
  });
});
