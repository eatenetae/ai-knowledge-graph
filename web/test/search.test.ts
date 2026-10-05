import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { buildSearchItems, search } from '../src/lib/search.ts';
import type { CasesJson, GraphJson, InterviewJson } from '../src/types.ts';

/**
 * v2 的搜索要把案例标题和面试题也搜出来。断言全部从产物 JSON 现算，
 * 不写死具体条目——内容增长不影响这些性质。
 */

const graph: GraphJson = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'public', 'graph.json'), 'utf8'),
);
const cases: CasesJson = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'public', 'cases.json'), 'utf8'),
);
const interview: InterviewJson = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'public', 'interview.json'), 'utf8'),
);

const items = buildSearchItems(graph, cases, interview);

describe('搜索索引：三类条目都在', () => {
  it('条目数 = 节点 + 案例 + 题目', () => {
    assert.equal(
      items.length,
      graph.nodes.length + cases.cases.length + interview.questions.length,
    );
  });

  it('每类条目都出现', () => {
    const kinds = new Set(items.map((item) => item.kind));
    assert.deepEqual([...kinds].sort(), ['case', 'node', 'question']);
  });

  it('id 在同类内唯一（跨类用 kind 区分）', () => {
    const seen = new Set<string>();
    for (const item of items) {
      const key = `${item.kind}:${item.id}`;
      assert.ok(!seen.has(key), `重复的搜索条目：${key}`);
      seen.add(key);
    }
  });
});

describe('搜索：v2 扩展覆盖案例与面试题', () => {
  it('每个案例标题都能被自己的标题前缀搜到', () => {
    for (const item of cases.cases) {
      const hits = search(items, item.title.slice(0, 3));
      const hit = hits.find((candidate) => candidate.kind === 'case' && candidate.id === item.id);
      assert.ok(hit, `搜「${item.title.slice(0, 3)}」应该命中案例「${item.title}」`);
      assert.ok(hit.score >= 100, '标题命中应得标题档的分数');
    }
  });

  it('每道面试题都能被问题原文的片段搜到', () => {
    for (const question of interview.questions) {
      const fragment = question.question.slice(1, 5);
      // maxHits 给足到不截断：这道题验证「能被搜到」，不验证「排进前八」——
      // 片段若是高频词（如「 AI 」），扩容后的题库里同片段命中会超过默认
      // 截断数，目标题被挤出窗口不代表搜不到。
      const hits = search(items, fragment, items.length);
      const hit = hits.find((candidate) => candidate.kind === 'question' && candidate.id === question.id);
      assert.ok(hit, `搜「${fragment}」应该命中题目「${question.question}」`);
    }
  });

  it('案例的行业也参与匹配', () => {
    for (const industry of new Set(cases.cases.map((item) => item.industry))) {
      const hits = search(items, industry);
      assert.ok(
        hits.some((hit) => hit.kind === 'case'),
        `搜行业「${industry}」应该命中至少一个案例`,
      );
    }
  });
});

describe('搜索：v1 行为零回归', () => {
  it('节点标题命中仍是最高分档，且从开头命中加成不变', () => {
    const node = graph.nodes[0];
    const exact = search(items, node.title.toLowerCase());
    const hit = exact.find((candidate) => candidate.kind === 'node' && candidate.id === node.id);
    assert.ok(hit, `搜「${node.title}」应命中该节点`);
    assert.equal(hit.score, 140);

    const partial = search(items, node.title.slice(1, 4).toLowerCase());
    const partialHit = partial.find(
      (candidate) => candidate.kind === 'node' && candidate.id === node.id,
    );
    if (partialHit && !node.title.toLowerCase().startsWith(node.title.slice(1, 4).toLowerCase())) {
      assert.equal(partialHit.score, 100, '非开头命中不加成');
    }
  });

  it('空查询返回空结果', () => {
    assert.deepEqual(search(items, ''), []);
    assert.deepEqual(search(items, '   '), []);
  });

  it('领域 id 仍然能搜到节点（v1 的领域命中）', () => {
    const domainId = graph.domains[0].id;
    const inDomain = graph.nodes.filter((node) => node.domain === domainId);
    if (inDomain.length > 0) {
      const hits = search(items, domainId);
      const nodeHits = hits.filter((hit) => hit.kind === 'node');
      assert.ok(nodeHits.length > 0, `搜领域 id「${domainId}」应命中节点`);
      assert.ok(nodeHits.every((hit) => hit.score === 10), '领域命中的分数档不变');
    }
  });
});
