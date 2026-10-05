import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { buildIndex, sortByDependency } from '../src/lib/deps.ts';
import {
  CATEGORY_ORDER,
  buildCasesByNode,
  findSprintPath,
  orderCategories,
} from '../src/lib/pm.ts';
import type { CasesJson, GraphJson, PathsJson } from '../src/types.ts';

/**
 * PM 视图的几个关键计算：分组顺序、冲刺路径识别、节点 → 案例反向索引、
 * 复习节点的依赖序。断言从产物 JSON 现算，不写死内容规模。
 */

const graph: GraphJson = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'public', 'graph.json'), 'utf8'),
);
const paths: PathsJson = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'public', 'paths.json'), 'utf8'),
);
const cases: CasesJson = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'public', 'cases.json'), 'utf8'),
);

describe('面试题分组顺序', () => {
  it('与 schema 枚举一致', () => {
    assert.equal(CATEGORY_ORDER.length, 8);
    assert.equal(CATEGORY_ORDER[0], '能力边界');
    assert.equal(CATEGORY_ORDER[7], '项目与协作');
  });

  it('已知分组按枚举序排', () => {
    assert.deepEqual(
      orderCategories(['评测', '能力边界', '项目与协作', 'Agent']),
      ['能力边界', 'Agent', '评测', '项目与协作'],
    );
  });

  it('未知分组排在最后且不丢', () => {
    const out = orderCategories(['未知组', '评测']);
    assert.equal(out.length, 2);
    assert.equal(out[0], '评测');
    assert.equal(out[1], '未知组');
  });
});

describe('冲刺路径识别', () => {
  it('标题带「冲刺」的路径能被找到', () => {
    const fake = [
      { ...paths.paths[0], id: 'some-other-path', title: '普通路径' },
      { ...paths.paths[0], id: 'pm-interview-sprint', title: 'AI PM 面试冲刺' },
    ];
    const found = findSprintPath(fake);
    assert.equal(found?.id, 'pm-interview-sprint');
  });

  it('id 带 sprint 的路径也能被找到', () => {
    const fake = [{ ...paths.paths[0], id: 'interview-sprint', title: '随便叫什么' }];
    assert.equal(findSprintPath(fake)?.id, 'interview-sprint');
  });

  it('没有冲刺路径时返回 null（题库退回路径列表入口）', () => {
    // 用合成列表验证行为，不对真实仓库断言「没有冲刺路径」——
    // 冲刺线是 v2 内容批次（MY-92）的交付物，真实数据里出现它是预期。
    const fake = [
      { ...paths.paths[0], id: 'some-other-path', title: '普通路径' },
      { ...paths.paths[0], id: 'pm-systematic-course', title: 'AI PM 系统课' },
    ];
    assert.equal(findSprintPath(fake), null);
  });
});

describe('节点 → 案例的反向索引', () => {
  const byNode = buildCasesByNode(cases);

  it('每个案例的每个挂靠节点都能反查到它', () => {
    for (const item of cases.cases) {
      for (const nodeId of item.nodes) {
        const list = byNode.get(nodeId) ?? [];
        assert.ok(
          list.some((candidate) => candidate.id === item.id),
          `节点 ${nodeId} 应能反查到案例 ${item.id}`,
        );
      }
    }
  });

  it('没被任何案例挂靠的节点查到空', () => {
    const referenced = new Set(cases.cases.flatMap((item) => item.nodes));
    const unreferenced = graph.nodes.find((node) => !referenced.has(node.id));
    if (unreferenced) {
      assert.deepEqual(byNode.get(unreferenced.id) ?? [], []);
    }
  });

  it('索引覆盖的节点数等于被挂靠节点的去重数', () => {
    const referenced = new Set(cases.cases.flatMap((item) => item.nodes));
    assert.equal(byNode.size, referenced.size);
  });
});

describe('复习节点的依赖顺序', () => {
  const index = buildIndex(graph);

  it('每道题的复习节点排完序后，前置都在后继前面', () => {
    for (const question of JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'public', 'interview.json'), 'utf8'),
    ).questions) {
      const ordered = sortByDependency(index, new Set(question.nodes));
      assert.equal(ordered.length, question.nodes.length, '一个节点都不能少');
      const positionOf = new Map(ordered.map((id, position) => [id, position]));
      for (const id of ordered) {
        for (const prereq of index.prereqsOf.get(id) ?? []) {
          if (positionOf.has(prereq)) {
            assert.ok(
              positionOf.get(prereq)! < positionOf.get(id)!,
              `${question.id}：前置 ${prereq} 应排在 ${id} 前面`,
            );
          }
        }
      }
    }
  });
});
