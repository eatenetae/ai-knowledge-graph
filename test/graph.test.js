import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildGraph, checkPaths } from '../build/lib/graph.js';

/** 造一个形状和 load-content 输出一致的节点，只关心图相关的字段。 */
function node(id, { prerequisites = [], related = [], file } = {}) {
  return {
    file: file ?? `content/test/${id}.md`,
    id,
    data: { id, prerequisites, related },
    sections: {},
  };
}

const messages = (problems) => problems.map((p) => `${p.file} ${p.field}: ${p.message}`).join('\n');
const find = (problems, needle) => problems.find((p) => messages([p]).includes(needle));

describe('悬空依赖检测', () => {
  it('前置依赖指向不存在的节点时报错，并给出最接近的候选', () => {
    const { problems } = buildGraph([node('alpha'), node('beta', { prerequisites: ['alpa'] })]);

    const found = find(problems, '悬空依赖');
    assert.ok(found, messages(problems));
    assert.equal(found.field, 'prerequisites[0]');
    assert.match(found.message, /悬空依赖：前置依赖 `alpa` 不存在/);
    assert.match(found.hint, /你是不是想写 `alpha`？/);
  });

  it('related 指向不存在的节点时同样报错', () => {
    const { problems } = buildGraph([node('alpha'), node('beta', { related: ['ghost'] })]);

    const found = find(problems, '悬空依赖');
    assert.equal(found.field, 'related[0]');
    assert.match(found.hint, /现有节点：alpha、beta/);
  });

  it('把自己列为前置依赖时报「指向了自己」，而不是绕成环', () => {
    const { problems } = buildGraph([node('alpha', { prerequisites: ['alpha'] })]);

    const found = find(problems, '指向了自己');
    assert.ok(found, messages(problems));
    assert.match(found.hint, /不能依赖自身/);
    // 自环不应该再被当成一个「环」重复报一次
    assert.equal(problems.filter((p) => /循环依赖/.test(p.message)).length, 0);
  });
});

describe('循环依赖检测', () => {
  it('打印出环的完整路径', () => {
    const { problems } = buildGraph([
      node('alpha', { prerequisites: ['gamma'] }),
      node('beta', { prerequisites: ['alpha'] }),
      node('gamma', { prerequisites: ['beta'] }),
    ]);

    const found = find(problems, '循环依赖');
    assert.ok(found, messages(problems));
    assert.match(found.message, /alpha → gamma → beta → alpha/);
    assert.match(found.hint, /这 3 个节点互为前置/);
  });

  it('同一个环从不同节点起头只报一次', () => {
    const { problems } = buildGraph([
      node('a', { prerequisites: ['c'] }),
      node('b', { prerequisites: ['a'] }),
      node('c', { prerequisites: ['b'] }),
    ]);

    assert.equal(problems.filter((p) => /循环依赖/.test(p.message)).length, 1);
  });

  it('两个互不相干的环都会报出来', () => {
    const { problems } = buildGraph([
      node('a', { prerequisites: ['b'] }),
      node('b', { prerequisites: ['a'] }),
      node('x', { prerequisites: ['y'] }),
      node('y', { prerequisites: ['x'] }),
    ]);

    assert.equal(problems.filter((p) => /循环依赖/.test(p.message)).length, 2);
  });

  it('related 边不参与环检测（弱关联允许互相引用）', () => {
    const { problems } = buildGraph([
      node('a', { related: ['b'] }),
      node('b', { related: ['a'] }),
    ]);
    assert.equal(problems.length, 0, messages(problems));
  });
});

describe('孤立节点检测', () => {
  it('没有任何入边出边的节点会被报出来', () => {
    const { problems } = buildGraph([
      node('alpha', { prerequisites: ['beta'] }),
      node('beta'),
      node('lonely'),
    ]);

    const found = find(problems, '孤立节点');
    assert.ok(found, messages(problems));
    assert.equal(found.file, 'content/test/lonely.md');
    assert.match(found.hint, /补一条 prerequisites/);
  });

  it('无前置但被别人依赖的节点不算孤立', () => {
    const { problems } = buildGraph([node('alpha'), node('beta', { prerequisites: ['alpha'] })]);
    assert.equal(problems.length, 0, messages(problems));
  });

  it('只有 related 边的节点也不算孤立', () => {
    const { problems } = buildGraph([node('alpha', { related: ['beta'] }), node('beta')]);
    assert.equal(problems.length, 0, messages(problems));
  });
});

describe('重复 id 与文件名', () => {
  it('重复 id 会指出是谁先用掉的', () => {
    const { problems } = buildGraph([
      node('alpha', { file: 'content/a/alpha.md' }),
      node('alpha', { file: 'content/b/alpha.md' }),
    ]);

    const found = find(problems, '重复了');
    assert.equal(found.file, 'content/b/alpha.md');
    assert.match(found.message, /id `alpha` 重复了，content\/a\/alpha.md 已经用过/);
  });

  it('文件名与 id 不一致时报错并给出正确的文件名', () => {
    const { problems } = buildGraph([node('alpha', { file: 'content/a/not-alpha.md' })]);

    const found = find(problems, '文件名与 id 对不上');
    assert.match(found.message, /文件名应该是 `alpha.md`/);
    assert.match(found.hint, /把文件重命名为 alpha.md/);
  });
});

describe('边的生成', () => {
  it('前置边的方向是「前置 -> 后继」', () => {
    const { edges } = buildGraph([node('base'), node('next', { prerequisites: ['base'] })]);
    assert.deepEqual(edges, [{ source: 'base', target: 'next', type: 'prerequisite' }]);
  });

  it('互相声明的 related 只保留一条无向边', () => {
    const { edges } = buildGraph([
      node('a', { related: ['b'] }),
      node('b', { related: ['a'] }),
    ]);
    assert.deepEqual(edges, [{ source: 'a', target: 'b', type: 'related' }]);
  });
});

describe('路径检查', () => {
  const nodes = new Map([
    ['base', node('base')],
    ['next', node('next', { prerequisites: ['base'] })],
  ]);

  it('引用不存在的节点时报悬空', () => {
    const { problems } = checkPaths(
      [{ file: 'content/paths/p.md', id: 'p', data: { steps: [{ id: 'ghost' }] } }],
      nodes,
    );
    assert.match(problems[0].message, /悬空依赖：路径引用了不存在的节点 `ghost`/);
  });

  it('同一个节点出现两次时报重复', () => {
    const { problems } = checkPaths(
      [
        {
          file: 'content/paths/p.md',
          id: 'p',
          data: { steps: [{ id: 'base' }, { id: 'base' }] },
        },
      ],
      nodes,
    );
    assert.match(problems[0].message, /节点 `base` 在这条路径里出现了两次/);
  });

  it('前置依赖没排在前面时，只给提示、不算失败', () => {
    const { problems, warnings } = checkPaths(
      [
        {
          file: 'content/paths/p.md',
          id: 'p',
          data: { steps: [{ id: 'next' }, { id: 'base' }] },
        },
      ],
      nodes,
    );

    assert.equal(problems.length, 0);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0].message, /第 1 步 `next` 的前置依赖 `base` 没有出现在它前面/);
  });

  it('前置依赖闭环的路径不产生任何提示', () => {
    const { problems, warnings } = checkPaths(
      [
        {
          file: 'content/paths/p.md',
          id: 'p',
          data: { steps: [{ id: 'base' }, { id: 'next' }] },
        },
      ],
      nodes,
    );
    assert.deepEqual([problems.length, warnings.length], [0, 0]);
  });
});
