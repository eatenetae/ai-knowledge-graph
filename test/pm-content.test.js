import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { build, writeOutputs } from '../build/index.js';
import { REPO_ROOT, collectProblems, describe as text, findProblem, withFixtureRepo } from './helpers.js';

describe('PM 体系：干净输入（pm-ok fixture）', () => {
  it('构建通过且不产生提示；pm 标注进 graph.json，能力域带 core_nodes', () => {
    withFixtureRepo('pm-ok', (rootDir) => {
      const result = build({ rootDir, generatedAt: '2026-01-01T00:00:00Z' });

      assert.deepEqual(result.warnings, []);

      const pmOf = new Map(result.graph.nodes.map((node) => [node.id, node.pm]));
      assert.equal(pmOf.get('base-node'), 'core');
      assert.equal(pmOf.get('mid-node'), 'core');
      assert.equal(pmOf.get('next-node'), 'useful');
      assert.equal(pmOf.get('extra-node'), null, '无标记节点应当是 null');

      assert.equal(result.graph.stats.pm_core_count, 2);
      assert.equal(result.graph.stats.pm_useful_count, 1);

      assert.deepEqual(
        result.graph.pm_domains.map((domain) => `${domain.id}:${domain.core_nodes.join('+')}`),
        ['domain-one:base-node', 'domain-two:mid-node'],
      );
    });
  });

  it('写出的 cases.json / interview.json 结构符合约定', () => {
    withFixtureRepo('pm-ok', (rootDir) => {
      const result = build({ rootDir, generatedAt: '2026-01-01T00:00:00Z' });
      writeOutputs(rootDir, result);

      const casesPath = join(rootDir, 'web/public/cases.json');
      const interviewPath = join(rootDir, 'web/public/interview.json');
      assert.ok(existsSync(casesPath), '应当写出 cases.json');
      assert.ok(existsSync(interviewPath), '应当写出 interview.json');

      const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
      assert.equal(cases.version, 1);
      assert.equal(cases.case_count, 1);
      const entry = cases.cases[0];
      assert.equal(entry.id, 'full-case');
      for (const field of ['title', 'industry', 'domains', 'nodes', 'tags', 'updated_at']) {
        assert.ok(field in entry, `案例缺少 ${field}`);
      }
      assert.deepEqual(
        Object.keys(entry.sections).sort(),
        ['background', 'decision_points', 'interview_pitch', 'outcome', 'process'],
      );
      for (const body of Object.values(entry.sections)) {
        assert.ok(body.length > 0, '小节正文不应当为空');
        assert.doesNotMatch(body, /^##\s/m, '小节标题本身不属于正文');
      }

      const interview = JSON.parse(readFileSync(interviewPath, 'utf8'));
      assert.equal(interview.version, 1);
      assert.equal(interview.question_count, 1);
      const question = interview.questions[0];
      assert.equal(question.id, 'full-question');
      for (const field of ['question', 'category', 'frequency', 'nodes', 'updated_at']) {
        assert.ok(field in question, `面试题缺少 ${field}`);
      }
      assert.deepEqual(
        Object.keys(question.sections).sort(),
        ['follow_ups', 'good_answer', 'wrong_answers'],
      );
    });
  });

  it('同样的内容产出同样的字节（cases / interview 也稳定）', () => {
    withFixtureRepo('pm-ok', (rootDir) => {
      const first = build({ rootDir, generatedAt: '2026-01-01T00:00:00Z' });
      const second = build({ rootDir, generatedAt: '2026-01-01T00:00:00Z' });
      assert.equal(JSON.stringify(first.cases), JSON.stringify(second.cases));
      assert.equal(JSON.stringify(first.interview), JSON.stringify(second.interview));
    });
  });
});

describe('PM 体系：损坏的 fixture（pm-broken）', () => {
  it('构建失败，一次性报出全部问题', () => {
    withFixtureRepo('pm-broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      assert.ok(problems, '损坏的 fixture 必须让构建失败');
      assert.ok(problems.length >= 20, `期望报出多个问题，实际 ${problems.length} 条`);
    });
  });

  it('每条问题都指明了文件、字段和原因，且不含堆栈或英文断言', () => {
    withFixtureRepo('pm-broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      for (const item of problems) {
        assert.ok(item.file, `问题缺少文件路径：${JSON.stringify(item)}`);
        assert.ok(item.message, `问题缺少原因：${JSON.stringify(item)}`);
        assert.doesNotMatch(text(item), /at Object\.|at Module\.|Error:|\bundefined\b/);
        assert.doesNotMatch(item.message, /must be|invalid type|required property/i);
      }
    });
  });

  it('pm 枚举只认 core / useful', () => {
    withFixtureRepo('pm-broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      const badPm = findProblem(problems, 'bad-pm.md', 'pm');
      assert.ok(badPm, text(problems[0]));
      assert.match(badPm.message, /pm 标注只能是 core/);
      assert.match(badPm.message, /收到 "very-important"/);
    });
  });

  it('core 节点与登记表双向一致：缺登记、重复登记、登记了但没标注都会被拦', () => {
    withFixtureRepo('pm-broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      assert.match(
        findProblem(problems, 'core-but-unregistered.md', 'pm').message,
        /没有登记进 schema\/pm-domains\.json 的任何能力域/,
      );
      assert.match(
        findProblem(problems, 'schema/pm-domains.json', 'domains[1].core_nodes[0]').message,
        /同时登记在「测试域一」和「测试域二」/,
      );
      assert.match(
        findProblem(problems, 'fine-node.md', 'pm').message,
        /列为「测试域一」的必修节点，但它的 frontmatter 没有标 pm: core/,
      );
    });
  });

  it('能力域必须有必修节点；core 总数有验收区间', () => {
    withFixtureRepo('pm-broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      assert.match(
        findProblem(problems, 'schema/pm-domains.json', 'domains[2].core_nodes').message,
        /「空域」没有任何必修节点/,
      );
      assert.match(
        findProblem(problems, 'schema/pm-domains.json', 'core_count_bounds').message,
        /core 节点有 3 个，超过验收上限 2/,
      );
    });
  });

  it('登记表里的必修节点必须真实存在', () => {
    withFixtureRepo('pm-broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      const ghost = findProblem(problems, 'schema/pm-domains.json', 'domains[0].core_nodes[2]');
      assert.match(ghost.message, /必修节点 `ghost-node` 不存在/);
    });
  });

  it('必修节点沿前置边必须能回溯到基础节点', () => {
    withFixtureRepo('pm-broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      assert.match(
        findProblem(problems, 'hanging-core.md', 'pm').message,
        /沿前置依赖回溯不到任何基础节点/,
      );
    });
  });

  it('案例：悬空挂靠、未登记能力域、缺小节、id 重复、文件名不一致都会被拦', () => {
    withFixtureRepo('pm-broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      const dangling = findProblem(problems, 'dangling-case.md', 'nodes[2]');
      assert.match(dangling.message, /悬空引用：案例挂靠的知识节点 `ghost-case-node` 不存在/);

      const domain = findProblem(problems, 'dangling-case.md', 'domains[1]');
      assert.match(domain.message, /PM 能力域 `not-registered` 没有登记/);
      assert.match(domain.hint, /domain-one/);

      assert.match(
        findProblem(problems, 'broken-case-sections.md', '## 决策过程').message,
        /缺少 `## 决策过程` 小节/,
      );
      assert.match(
        findProblem(problems, 'broken-case-sections.md', '## 面试怎么讲').message,
        /缺少 `## 面试怎么讲` 小节/,
      );

      const duplicate = findProblem(problems, 'dup-case.md', 'id');
      assert.match(duplicate.message, /案例 id `dup-case` 重复了/);
      assert.match(duplicate.message, /dup-case-again\.md 已经用过/);

      assert.match(
        findProblem(problems, 'dup-case-again.md', 'id').message,
        /文件名与 id 对不上/,
      );
    });
  });

  it('面试题：枚举、悬空复习节点、缺追问、id 重复都会被拦', () => {
    withFixtureRepo('pm-broken', (rootDir) => {
      const problems = collectProblems(rootDir);

      const category = findProblem(problems, 'bad-enums.md', 'category');
      assert.match(category.message, /面试题分组只能是这八类之一/);
      assert.match(category.hint, /能力边界/);
      assert.match(
        findProblem(problems, 'bad-enums.md', 'frequency').message,
        /出现频率只能是 高频 \/ 常见 \/ 偶见/,
      );

      assert.match(
        findProblem(problems, 'dangling-review.md', 'nodes[0]').message,
        /悬空引用：复习节点 `ghost-review-node` 不存在/,
      );
      assert.match(
        findProblem(problems, 'missing-follow-up.md', '## 追问').message,
        /缺少 `## 追问` 小节/,
      );

      const duplicate = findProblem(problems, 'dup-question.md', 'id');
      assert.match(duplicate.message, /面试题 id `dup-question` 重复了/);
      assert.match(duplicate.message, /dup-question-again\.md 已经用过/);
    });
  });
});

describe('真实内容仓库（PM 标注与样例内容）', () => {
  const result = build({ rootDir: REPO_ROOT, generatedAt: '2026-01-01T00:00:00Z' });

  it('六大能力域全部登记且都有必修节点；core 总数在 25-35 区间', () => {
    assert.equal(result.graph.pm_domains.length, 6, '六大能力域一个不能少');
    for (const domain of result.graph.pm_domains) {
      assert.ok(domain.core_nodes.length >= 1, `能力域 ${domain.id} 没有必修节点`);
      assert.ok(domain.label && domain.summary, `能力域 ${domain.id} 缺少展示名或一句话说明`);
    }
    assert.ok(
      result.graph.stats.pm_core_count >= 25 && result.graph.stats.pm_core_count <= 35,
      `core 节点数 ${result.graph.stats.pm_core_count} 不在 25-35 区间`,
    );
  });

  it('每个 core 节点恰好归一个能力域，且都能沿前置边回溯到基础节点', () => {
    const byId = new Map(result.graph.nodes.map((node) => [node.id, node]));

    const claims = new Map();
    for (const domain of result.graph.pm_domains) {
      for (const id of domain.core_nodes) {
        assert.ok(byId.has(id), `能力域 ${domain.id} 的必修节点 ${id} 不存在`);
        assert.equal(byId.get(id).pm, 'core', `${id} 在 ${domain.id} 里但没标 core`);
        const claimed = claims.get(id);
        assert.equal(claimed, undefined, `节点 ${id} 同时归 ${claimed} 和 ${domain.id}`);
        claims.set(id, domain.id);
      }
    }

    for (const node of result.graph.nodes.filter((n) => n.pm === 'core')) {
      assert.ok(claims.has(node.id), `core 节点 ${node.id} 没有登记进任何能力域`);
    }

    // 独立于构建内部校验再算一遍：每个 core 节点沿 prerequisites 走到某个无前置节点
    for (const node of result.graph.nodes.filter((n) => n.pm === 'core')) {
      const visited = new Set();
      const queue = [node.id];
      let reachesRoot = (byId.get(node.id).prerequisites ?? []).length === 0;
      while (queue.length > 0 && !reachesRoot) {
        const current = queue.pop();
        if (visited.has(current)) continue;
        visited.add(current);
        for (const prerequisite of byId.get(current).prerequisites ?? []) {
          if (!byId.has(prerequisite)) continue;
          if ((byId.get(prerequisite).prerequisites ?? []).length === 0) {
            reachesRoot = true;
            break;
          }
          queue.push(prerequisite);
        }
      }
      assert.ok(reachesRoot, `core 节点 ${node.id} 回溯不到基础节点`);
    }
  });

  it('样例案例 ≥2 个，挂靠 ≥3 个真实节点，五节正文齐全', () => {
    assert.ok(result.cases.case_count >= 2, `样例案例只有 ${result.cases.case_count} 个`);
    const nodeIds = new Set(result.graph.nodes.map((node) => node.id));
    const registeredDomains = new Set(result.graph.pm_domains.map((domain) => domain.id));

    for (const item of result.cases.cases) {
      assert.ok(item.nodes.length >= 3, `案例 ${item.id} 挂靠的节点少于 3 个`);
      for (const id of item.nodes) {
        assert.ok(nodeIds.has(id), `案例 ${item.id} 挂靠了不存在的节点 ${id}`);
      }
      assert.ok(item.domains.length >= 1, `案例 ${item.id} 没有能力域`);
      for (const domain of item.domains) {
        assert.ok(registeredDomains.has(domain), `案例 ${item.id} 引用了未登记的能力域 ${domain}`);
      }
      for (const [key, body] of Object.entries(item.sections)) {
        assert.ok(body.length >= 50, `案例 ${item.id} 的 ${key} 太短，可能没解析到`);
      }
    }
  });

  it('样例面试题 ≥3 道，分组合法，复习节点真实存在', () => {
    assert.ok(result.interview.question_count >= 3, `样例面试题只有 ${result.interview.question_count} 道`);
    const nodeIds = new Set(result.graph.nodes.map((node) => node.id));
    const categories = new Set([
      '能力边界',
      '幻觉与质量',
      'RAG 与知识库',
      'Agent',
      '成本与延迟',
      '评测',
      '数据与安全',
      '项目与协作',
    ]);

    for (const question of result.interview.questions) {
      assert.ok(categories.has(question.category), `题目 ${question.id} 的分组 ${question.category} 不在八类里`);
      assert.ok(['高频', '常见', '偶见'].includes(question.frequency), `题目 ${question.id} 的频率不合法`);
      assert.ok(question.nodes.length >= 1, `题目 ${question.id} 没有挂靠复习节点`);
      for (const id of question.nodes) {
        assert.ok(nodeIds.has(id), `题目 ${question.id} 挂靠了不存在的节点 ${id}`);
      }
      for (const [key, body] of Object.entries(question.sections)) {
        assert.ok(body.length >= 20, `题目 ${question.id} 的 ${key} 太短`);
      }
    }
  });

  it('graph.json 的节点带 pm 三态标记（core / useful / null）', () => {
    const marks = new Set(result.graph.nodes.map((node) => node.pm));
    assert.ok(marks.has('core'), '应当有 core 节点');
    assert.ok(marks.has('useful'), '应当有 useful 节点');
    assert.ok(marks.has(null), '应当有无标记节点');
    for (const node of result.graph.nodes) {
      assert.ok(
        node.pm === null || node.pm === 'core' || node.pm === 'useful',
        `节点 ${node.id} 的 pm 值不合法：${node.pm}`,
      );
    }
  });
});
