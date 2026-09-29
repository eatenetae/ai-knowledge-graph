import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { buildIndex, dependencySubgraph, sortByDependency } from '../src/lib/deps.ts';
import type { GraphJson } from '../src/types.ts';

/**
 * 聚焦模式的正确性是这个任务里最容易出错、后果也最严重的一块：
 * 算少了会漏掉必学的前置，算错了顺序会把学习路径带偏。
 * 所以这里不满足于抽查两个节点，而是**对全部节点**跟暴力实现逐一比对。
 *
 * 断言一律从 graph.json 现算，不写死节点数、也不写死某个具体节点 id——
 * 内容会持续增长（阶段 1 是 23 个节点，内容填充后是 54 个），
 * 把规模当成不变量的测试，内容一长就会假报警。
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
  it('全部节点的依赖子图都与暴力实现一致', () => {
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

  it('多层递归不会漏：子图对「前置」是封闭的', () => {
    // 封闭性就是「递归上溯不漏」的定义：子图里任何一个节点的前置，也必须还在子图里。
    // 逐层断言某个具体的链要写死 id，而封闭性对每个节点都成立，也不依赖内容规模。
    for (const node of graph.nodes) {
      const { ids } = dependencySubgraph(index, node.id);
      for (const id of ids) {
        for (const prereq of index.prereqsOf.get(id) ?? []) {
          assert.ok(
            ids.has(prereq),
            `${node.id} 的子图里有 ${id}，却漏掉了它的前置 ${prereq}`,
          );
        }
      }
    }
  });

  it('图里确实存在够深的依赖链，上面的封闭性检查不是空转', () => {
    const deepest = Math.max(...graph.nodes.map((node) => dependencySubgraph(index, node.id).ordered.length));
    assert.ok(deepest >= 3, `最深的依赖子图只有 ${deepest} 个节点，递归深度不足以验证多层上溯`);
  });

  it('目标节点永远排在子图最后', () => {
    for (const node of graph.nodes) {
      const { ordered } = dependencySubgraph(index, node.id);
      assert.equal(ordered[ordered.length - 1], node.id, `${node.id} 没有排在子图最后`);
    }
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

  it('排序不受输入顺序影响：把子图倒过来喂进去，结果一模一样', () => {
    for (const node of graph.nodes) {
      const { ordered } = dependencySubgraph(index, node.id);
      if (ordered.length < 2) continue;
      assert.deepEqual(
        sortByDependency(index, new Set([...ordered].reverse())),
        ordered,
        `${node.id} 的子集排序受输入顺序影响`,
      );
    }
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

  it('被依赖程度：图里既有枢纽节点也有边缘节点', () => {
    const counts = [...index.transitiveDependents.values()];
    assert.ok(
      Math.max(...counts) > Math.min(...counts),
      '所有节点的传递依赖数都一样，节点大小就失去区分度了',
    );
  });

  it('传递依赖数的语义：没有后继一定是 0，有后继一定大于 0', () => {
    // 这条是「节点半径 = 被依赖程度」的依据，所以两个方向都要卡死。
    // 不写死某个具体节点：谁是叶子取决于内容，内容一长就会有节点长出后继
    // （阶段 1 的 rlhf 是叶子，内容填充后 alignment-problem 把它当成了前置）。
    for (const node of index.nodes) {
      const direct = (index.dependentsOf.get(node.id) ?? []).length;
      const transitive = index.transitiveDependents.get(node.id)!;

      if (direct === 0) {
        assert.equal(transitive, 0, `${node.id} 没有任何后继，传递依赖数应当是 0`);
      } else {
        assert.ok(transitive > 0, `${node.id} 有 ${direct} 个直接后继，传递依赖数不该是 0`);
      }
    }
  });

  it('传递依赖数等于沿后继方向独立算出来的闭包大小', () => {
    const forwardClosure = (start: string): Set<string> => {
      const seen = new Set<string>();
      const stack = [...(index.dependentsOf.get(start) ?? [])];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const next of index.dependentsOf.get(id) ?? []) stack.push(next);
      }
      return seen;
    };

    for (const node of graph.nodes) {
      assert.equal(
        index.transitiveDependents.get(node.id),
        forwardClosure(node.id).size,
        `${node.id} 的传递依赖数算错了`,
      );
    }
  });
});
