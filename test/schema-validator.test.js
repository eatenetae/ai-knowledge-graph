import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { validateAgainstSchema } from '../build/lib/schema-validator.js';
import { REPO_ROOT } from './helpers.js';

const nodeSchema = JSON.parse(
  readFileSync(join(REPO_ROOT, 'schema/node.schema.json'), 'utf8'),
);

function validNode(overrides = {}) {
  return {
    id: 'demo-node',
    title: '示例节点',
    domain: 'foundations',
    summary: '这是一句足够长的、不含术语的说明文字。',
    prerequisites: [],
    related: [],
    tags: ['测试'],
    sources: [],
    updated_at: '2026-09-29',
    ...overrides,
  };
}

const messagesOf = (problems) => problems.map((p) => `${p.path}: ${p.message}`).join('\n');

describe('Schema 校验：通过', () => {
  it('合法节点没有任何问题', () => {
    assert.deepEqual(validateAgainstSchema(validNode(), nodeSchema), []);
  });
});

describe('Schema 校验：失败时的信息可读性', () => {
  it('缺少必填字段时，指出字段名', () => {
    const data = validNode();
    delete data.domain;
    const problems = validateAgainstSchema(data, nodeSchema);

    assert.equal(problems.length, 1);
    assert.equal(problems[0].path, 'domain');
    assert.match(problems[0].message, /缺少必填字段 `domain`/);
  });

  it('类型不对时，用中文说明期望类型和实际类型', () => {
    const problems = validateAgainstSchema(validNode({ tags: '不是数组' }), nodeSchema);

    assert.equal(problems.length, 1);
    assert.equal(problems[0].path, 'tags');
    assert.match(problems[0].message, /类型应为数组，实际是字符串/);
  });

  it('枚举值不对时，列出全部可选值', () => {
    const problems = validateAgainstSchema(validNode({ domain: 'foundation' }), nodeSchema);

    assert.equal(problems.length, 1);
    assert.equal(problems[0].path, 'domain');
    assert.match(problems[0].message, /收到 "foundation"/);
    assert.match(problems[0].hint, /可选值：foundations、neural-networks/);
  });

  it('格式不对时，用 schema 里的 x-error 而不是正则原文', () => {
    const problems = validateAgainstSchema(
      validNode({ id: 'Not_Kebab_Case' }),
      nodeSchema,
    );

    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /kebab-case/);
    assert.match(problems[0].message, /收到 "Not_Kebab_Case"/);
    // 不能把原始正则丢给用户
    assert.doesNotMatch(problems[0].message, /\^\[a-z0-9\]/);
  });

  it('日期格式不对时，说明期望的格式', () => {
    const problems = validateAgainstSchema(
      validNode({ updated_at: '2026/09/29' }),
      nodeSchema,
    );
    assert.match(problems[0].message, /YYYY-MM-DD/);
  });

  it('日历上不存在的日期也会被拦下', () => {
    const problems = validateAgainstSchema(
      validNode({ updated_at: '2026-02-30' }),
      nodeSchema,
    );
    assert.equal(problems.length, 1);
    assert.equal(problems[0].path, 'updated_at');
  });

  it('数组里有重复项时，指出和哪一项撞了', () => {
    const problems = validateAgainstSchema(
      validNode({ tags: ['重复', '重复'] }),
      nodeSchema,
    );
    assert.equal(problems[0].path, 'tags[1]');
    assert.match(problems[0].message, /重复项 "重复"，和 tags\[0\] 一模一样/);
  });

  it('出现 schema 之外的字段时，列出允许的字段', () => {
    const problems = validateAgainstSchema(validNode({ author: '某人' }), nodeSchema);

    assert.equal(problems.length, 1);
    assert.equal(problems[0].path, 'author');
    assert.match(problems[0].message, /schema 里没有 `author` 这个字段/);
    assert.match(problems[0].hint, /允许的字段：id、title、domain/);
  });

  it('嵌套对象里的错误会带上完整路径', () => {
    const problems = validateAgainstSchema(
      validNode({ sources: [{ title: '缺链接' }] }),
      nodeSchema,
    );

    assert.equal(problems.length, 1);
    assert.equal(problems[0].path, 'sources[0].url');
    assert.match(problems[0].message, /缺少必填字段 `url`/);
  });

  it('多处出错时一次全报出来，而不是只报第一个', () => {
    const problems = validateAgainstSchema(
      validNode({ domain: 'nope', id: 'Bad_Id', updated_at: '昨天' }),
      nodeSchema,
    );
    assert.deepEqual(
      problems.map((p) => p.path).sort(),
      ['domain', 'id', 'updated_at'],
    );
  });

  it('所有报错都是人话：没有堆栈、没有英文断言句', () => {
    const problems = validateAgainstSchema(
      validNode({ domain: 'nope', tags: 'x', id: 'Bad' }),
      nodeSchema,
    );
    const text = messagesOf(problems);

    assert.doesNotMatch(text, /at Object\.|at Module\.|Error:/);
    assert.doesNotMatch(text, /must be|should be|invalid type/i);
    for (const item of problems) {
      assert.ok(item.message.length > 0);
      assert.ok(item.path.length > 0);
    }
  });
});
