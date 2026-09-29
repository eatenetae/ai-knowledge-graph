import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { buildIndex, dependencySubgraph, sortByDependency } from '../src/lib/deps.ts';
import type { GraphJson } from '../src/types.ts';

/**
 * 聚焦模式的正确性是这个任务里最容易出错、后果也最严重的一块：
 * 算少了会漏掉必学的前置，算错了顺序会把学习路径带偏。
 * 所以这里不满足于抽查两个节点，而是**对全部 23 个节点**跟暴力实现逐一比对。
 */

const graph: GraphJson = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'public', 'graph.json'), 'utf8'),
);
const index = buildIndex(graph);

/** 朴素实现：反复展开前置集合直到不再增长。用来给依赖子图当参照。 */
function bruteForceClosure(targetId: string): Set<string> {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const closure = new Set<string>();
  const stack = [targetId];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (closure.has(id)) continue;
    closure.add(id);
    for (const prereq of byId.get(id)?.prerequisites ?? []) stack.push(prereq);
  }
  return closure;
}

describe('依赖子图：沿 prerequisite 边反向遍历', () => {
  it('全部 23 个节点的依赖子图都与暴力实现一致', () => {
    for (const node of graph.nodes) {
      const actual = dependencySubgraph(index, node.id).ids;
      const expected = bruteForceClosure(node.id);
      assert.deepEqual(
        [...actual].sort(),
        [...expected].sort(),
        `节点 ${node.id} 的依赖子图不对`,
      );
    }
  });

  it('依赖子图一定包含目标节点自身', () => {
    for (const node of graph.nodes) {
      assert.ok(dependencySubgraph(index, node.id).ids.has(node.id), `${node.id} 没包含自己`);
    }
  });

  it('多层递归不会漏：transformer 要一路追到 embedding 之前的基础概念', () => {
    const { ordered } = dependencySubgraph(index, 'transformer');
    assert.ok(ordered.includes('attention'), '漏了直接前置 attention');
    assert.ok(ordered.includes('embedding'), '漏了二级前置 embedding');
    assert.ok(ordered.includes('neural-network'), '漏了三级前置 neural-network');
    assert.equal(ordered[ordered.length - 1], 'transformer', '目标节点应当排在最后');
  });

  it('没有任何前置的基础节点，子图就是它自己', () => {
    const { ordered } = dependencySubgraph(index, 'what-is-machine-learning');
    assert.deepEqual(ordered, ['what-is-machine-learning']);
  });

  it('不存在的节点不会让页面崩，返回空子图', () => {
    const { ordered, ids } = dependencySubgraph(index, 'no-such-node');
    assert.deepEqual(ordered, []);
    assert.equal(ids.size, 0);
  });
});

describe('依赖顺序：前置一定排在后继前面', () => {
  it('每个节点的依赖子图都满足「前置在前」', () => {
    for (const node of graph.nodes) {
      const { ordered } = dependencySubgraph(index, node.id);
      const position = new Map(ordered.map((id, slot) => [id, slot]));

      for (const id of ordered) {
        for (const prereq of index.prereqsOf.get(id) ?? []) {
          if (!position.has(prereq)) continue; // 不在子图里的前置无需约束
          assert.ok(
            position.get(prereq)! < position.get(id)!,
            `${node.id} 的子图里 ${prereq} 排在了 ${id} 后面`,
          );
        }
      }
    }
  });

  it('依赖顺序是稳定的：同样输入跑两次结果一致', () => {
    for (const node of graph.nodes) {
      const first = dependencySubgraph(index, node.id).ordered;
      const second = dependencySubgraph(index, node.id).ordered;
      assert.deepEqual(first, second, `${node.id} 的顺序不稳定`);
    }
  });

  it('子图里不会出现重复节点', () => {
    for (const node of graph.nodes) {
      const { ordered } = dependencySubgraph(index, node.id);
      assert.equal(new Set(ordered).size, ordered.length, `${node.id} 的子图有重复`);
    }
  });

  it('任意节点子集的排序都满足前置在前（含乱序输入）', () => {
    const ids = new Set(['transformer', 'attention', 'embedding', 'tokenization']);
    const ordered = sortByDependency(index, ids);
    assert.equal(ordered[ordered.length - 1], 'transformer');
    assert.ok(ordered.indexOf('attention') < ordered.indexOf('transformer'));
    assert.ok(ordered.indexOf('embedding') < ordered.indexOf('attention'));
  });
});

describe('全图索引', () => {
  it('拓扑序覆盖全部节点且无重复', () => {
    assert.equal(index.topoOrder.length, graph.nodes.length);
    assert.equal(new Set(index.topoOrder).size, graph.nodes.length);
  });

  it('拓扑序里每条前置边都是「先 source 后 target」', () => {
    const position = new Map(index.topoOrder.map((id, slot) => [id, slot]));
    for (const edge of graph.edges) {
      if (edge.type !== 'prerequisite') continue;
      assert.ok(
        position.get(edge.source)! < position.get(edge.target)!,
        `边 ${edge.source} -> ${edge.target} 的先后顺序反了`,
      );
    }
  });

  it('被依赖程度：越基础的节点，传递依赖它的节点越多', () => {
    const foundation = index.transitiveDependents.get('what-is-machine-learning')!;
    const leaf = index.transitiveDependents.get('rlhf')!;
    assert.ok(foundation > leaf, '基础概念的传递依赖数应当更大');
    assert.equal(leaf, 0, '没有后继的节点传递依赖数应当是 0');
  });
});
