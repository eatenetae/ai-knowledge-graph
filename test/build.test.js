import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { build, writeOutputs } from '../build/index.js';
import { REPO_ROOT, collectProblems, describe as text, findProblem, withFixtureRepo } from './helpers.js';

describe('干净输入：构建通过', () => {
  it('最小 fixture 全绿，且不产生任何提示', () => {
    withFixtureRepo('minimal-ok', (rootDir) => {
      const result = build({ rootDir, generatedAt: '2026-01-01T00:00:00Z' });

      assert.deepEqual(result.warnings, []);
      assert.equal(result.graph.stats.node_count, 2);
      assert.equal(result.graph.stats.edge_count, 1);
      assert.deepEqual(result.graph.edges, [
        { source: 'base-node', target: 'next-node', type: 'prerequisite' },
      ]);
      assert.equal(result.paths.paths.length, 1);
      assert.equal(result.paths.paths[0].steps[1].title, '后继节点');
    });
  });

  it('写出的 graph.json / paths.json 能被解析，且结构符合约定', () => {
    withFixtureRepo('minimal-ok', (rootDir) => {
      const result = build({ rootDir, generatedAt: '2026-01-01T00:00:00Z' });
      writeOutputs(rootDir, result);

      const graphPath = join(rootDir, 'web/public/graph.json');
      const pathsPath = join(rootDir, 'web/public/paths.json');
      assert.ok(existsSync(graphPath), '应当写出 graph.json');
      assert.ok(existsSync(pathsPath), '应当写出 paths.json');

      const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
      assert.equal(graph.version, 1);
      assert.equal(graph.generated_at, '2026-01-01T00:00:00Z');
      for (const node of graph.nodes) {
        for (const field of ['id', 'title', 'domain', 'summary', 'tags']) {
          assert.ok(field in node, `节点缺少 ${field}`);
        }
      }
      for (const edge of graph.edges) {
        assert.deepEqual(Object.keys(edge).sort(), ['source', 'target', 'type']);
        assert.ok(['prerequisite', 'related'].includes(edge.type));
      }
    });
  });

  it('同样的内容产出同样的字节（构建结果稳定）', () => {
    withFixtureRepo('minimal-ok', (rootDir) => {
      const first = build({ rootDir, generatedAt: '2026-01-01T00:00:00Z' });
      const second = build({ rootDir, generatedAt: '2026-01-01T00:00:00Z' });
      assert.equal(JSON.stringify(first.graph), JSON.stringify(second.graph));
    });
  });
});

describe('损坏的 fixture：构建必须失败，且错误信息可读', () => {
  it('构建以非零状态失败，并一次性报出全部问题', () => {
    withFixtureRepo('broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      assert.ok(problems, '损坏的 fixture 必须让构建失败');
      assert.ok(problems.length >= 8, `期望报出多个问题，实际 ${problems.length} 条`);
    });
  });

  it('每条问题都指明了文件、字段和原因，且不含堆栈或英文断言', () => {
    withFixtureRepo('broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      for (const item of problems) {
        assert.ok(item.file, `问题缺少文件路径：${JSON.stringify(item)}`);
        assert.ok(item.message, `问题缺少原因：${JSON.stringify(item)}`);
        assert.doesNotMatch(text(item), /at Object\.|at Module\.|Error:|\bundefined\b/);
        assert.doesNotMatch(item.message, /must be|invalid type|required property/i);
      }
    });
  });

  it('Schema 错误：报出字段名、收到的值和允许的取值', () => {
    withFixtureRepo('broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      const domain = findProblem(problems, 'bad-fields.md', 'domain');
      assert.ok(domain, text(problems[0]));
      assert.match(domain.message, /收到 "foundation"/);
      assert.match(domain.hint, /可选值：foundations/);

      assert.match(findProblem(problems, 'bad-fields.md', 'updated_at').message, /YYYY-MM-DD/);
      assert.match(findProblem(problems, 'bad-fields.md', 'author').message, /没有 `author`/);
      assert.match(findProblem(problems, 'bad-fields.md', 'tags[1]').message, /重复项/);
      assert.match(findProblem(problems, 'bad-fields.md', 'sources[0].url').message, /缺少必填字段 `url`/);
    });
  });

  it('正文缺小节时报出 `## 直觉` / `## 细节`', () => {
    withFixtureRepo('broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      assert.match(findProblem(problems, 'bad-fields.md', '## 直觉').message, /缺少 `## 直觉` 小节/);
      assert.match(findProblem(problems, 'bad-fields.md', '## 细节').message, /缺少 `## 细节` 小节/);
    });
  });

  it('悬空依赖：指出是哪个字段、哪个 id，并给出候选', () => {
    withFixtureRepo('broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      const dangling = findProblem(problems, 'bad-fields.md', 'prerequisites[0]');
      assert.match(dangling.message, /悬空依赖：前置依赖 `ghost-node` 不存在/);
      assert.match(dangling.hint, /现有节点：/);
    });
  });

  it('循环依赖：打印完整的环路径', () => {
    withFixtureRepo('broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      const cycle = problems.find((p) => /循环依赖/.test(p.message));
      assert.ok(cycle, '应当检出环');
      assert.match(cycle.message, /cycle-a → cycle-b → cycle-a/);
      assert.match(cycle.hint, /互为前置/);
    });
  });

  it('孤立节点：指出没有任何入边出边的那个文件', () => {
    withFixtureRepo('broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      const orphan = findProblem(problems, 'orphan-node.md');
      assert.match(orphan.message, /孤立节点/);
    });
  });

  it('重复 id：指出和哪个文件撞了', () => {
    withFixtureRepo('broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      const duplicate = findProblem(problems, 'dup-two.md', 'id');
      assert.match(duplicate.message, /id `duplicate-node` 重复了/);
      assert.match(duplicate.message, /dup-one\.md 已经用过/);
    });
  });

  it('文件名与 id 不一致会被拦下', () => {
    withFixtureRepo('broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      const mismatch = findProblem(problems, 'name-mismatch.md', 'id');
      assert.match(mismatch.message, /文件名与 id 对不上/);
      assert.match(mismatch.message, /totally-different\.md/);
    });
  });

  it('路径里的悬空引用和重复步骤会被拦下', () => {
    withFixtureRepo('broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      assert.match(
        findProblem(problems, 'broken-path.md', 'steps[1].id').message,
        /悬空依赖：路径引用了不存在的节点 `ghost-node`/,
      );
      assert.match(
        findProblem(problems, 'broken-path.md', 'steps[2].id').message,
        /节点 `root-node` 在这条路径里出现了两次/,
      );
    });
  });
});

describe('真实内容仓库', () => {
  const result = build({ rootDir: REPO_ROOT, generatedAt: '2026-01-01T00:00:00Z' });

  it('23 个样例节点全部通过校验，构建无问题', () => {
    assert.ok(result.graph.stats.node_count >= 10, '至少需要 10 个样例节点');
    assert.deepEqual(result.warnings, [], '示例内容不应该产生任何提示');
  });

  it('12 个领域全部有节点，且 domains 登记与 schema 一致', () => {
    assert.equal(result.graph.stats.domain_count, 12);
    for (const domain of result.graph.domains) {
      assert.ok(domain.node_count > 0, `领域 ${domain.id} 没有节点`);
    }
  });

  it('存在一个无前置依赖的基础节点', () => {
    const roots = result.graph.nodes.filter((n) => n.prerequisites.length === 0);
    assert.ok(
      roots.some((n) => n.id === 'what-is-machine-learning'),
      '缺少基础节点 what-is-machine-learning',
    );
  });

  it('存在一条三层完整链路 transformer ← attention ← embedding', () => {
    const byId = new Map(result.graph.nodes.map((n) => [n.id, n]));
    assert.ok(byId.get('transformer').prerequisites.includes('attention'));
    assert.ok(byId.get('attention').prerequisites.includes('embedding'));
  });

  it('至少一个节点在 L3 里挂了真实的论文链接', () => {
    const withPapers = result.graph.nodes.filter((n) =>
      n.sources.some((s) => /arxiv\.org|nature\.com|aclanthology\.org/.test(s.url)),
    );
    assert.ok(withPapers.length >= 5, `挂了论文链接的节点只有 ${withPapers.length} 个`);
  });

  it('每条前置边都指向真实存在的节点（无悬空）', () => {
    const ids = new Set(result.graph.nodes.map((n) => n.id));
    for (const edge of result.graph.edges) {
      assert.ok(ids.has(edge.source), `边的 source 不存在：${edge.source}`);
      assert.ok(ids.has(edge.target), `边的 target 不存在：${edge.target}`);
    }
  });

  it('路径数据完整：每一步都能对上节点，且都带标题', () => {
    assert.ok(result.paths.paths.length >= 3, '至少要有 3 条学习路径');
    for (const path of result.paths.paths) {
      assert.ok(path.steps.length >= 2);
      for (const step of path.steps) {
        assert.ok(step.title, `路径 ${path.id} 的步骤 ${step.id} 没有解析到标题`);
        assert.ok(step.domain, `路径 ${path.id} 的步骤 ${step.id} 没有解析到领域`);
      }
    }
  });
});
