import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { buildIndex } from '../src/lib/deps.ts';
import { computeLayout } from '../src/lib/layout.ts';
import type { GraphJson } from '../src/types.ts';

const graph: GraphJson = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'public', 'graph.json'), 'utf8'),
);
const index = buildIndex(graph);
const layout = computeLayout(graph, index);

describe('布局稳定性', () => {
  it('同一份数据反复布局，坐标完全一致（刷新不会散架）', () => {
    const again = computeLayout(graph, index);
    assert.deepEqual([...again.nodes], [...layout.nodes]);
  });

  it('节点的相对顺序不受遍历顺序影响：反转输入仍然得到同一张图', () => {
    const reversed: GraphJson = {
      ...graph,
      nodes: [...graph.nodes].reverse(),
      edges: [...graph.edges].reverse(),
      domains: [...graph.domains].reverse(),
    };
    const other = computeLayout(reversed, buildIndex(reversed));

    for (const [id, node] of layout.nodes) {
      const counterpart = other.nodes.get(id);
      assert.ok(counterpart, `${id} 在反转输入后消失了`);
      assert.equal(counterpart.layer, node.layer, `${id} 的层号变了`);
      assert.equal(counterpart.x, node.x, `${id} 的横坐标变了`);
    }
  });

  it('每个节点都被摆到了位置上', () => {
    assert.equal(layout.nodes.size, graph.nodes.length);
  });
});

describe('分层：依赖方向永远从上往下', () => {
  it('每条前置边的 source 都比 target 靠上（层号更小）', () => {
    for (const edge of graph.edges) {
      if (edge.type !== 'prerequisite') continue;
      const source = layout.nodes.get(edge.source)!;
      const target = layout.nodes.get(edge.target)!;
      assert.ok(
        source.layer < target.layer,
        `${edge.source}(层 ${source.layer}) 应当排在 ${edge.target}(层 ${target.layer}) 上面`,
      );
    }
  });

  it('没有前置的节点落在第 0 层', () => {
    for (const node of graph.nodes) {
      if (node.prerequisites.length === 0) {
        assert.equal(layout.nodes.get(node.id)!.layer, 0, `${node.id} 应当在最上层`);
      }
    }
  });

  it('同一层的节点横坐标互不重叠', () => {
    for (const layer of layout.layers) {
      const xs = layer.map((id) => layout.nodes.get(id)!.x);
      assert.equal(new Set(xs).size, xs.length, '同一层出现了重叠的横坐标');
    }
  });
});

describe('视觉权重：越基础的节点画得越大', () => {
  it('半径落在设定的上下界之内', () => {
    for (const node of layout.nodes.values()) {
      assert.ok(node.radius >= 15 && node.radius <= 30, `${node.id} 半径越界：${node.radius}`);
    }
  });

  it('被依赖最多的节点，半径不小于被依赖最少的节点', () => {
    const sorted = [...index.transitiveDependents].sort((a, b) => b[1] - a[1]);
    const most = layout.nodes.get(sorted[0][0])!;
    const least = layout.nodes.get(sorted[sorted.length - 1][0])!;
    assert.ok(most.radius > least.radius, '最基础的节点应当明显更大');
  });

  it('传递依赖数相同的节点，半径也相同', () => {
    const byCount = new Map<number, number[]>();
    for (const [id, count] of index.transitiveDependents) {
      const list = byCount.get(count);
      if (list) list.push(layout.nodes.get(id)!.radius);
      else byCount.set(count, [layout.nodes.get(id)!.radius]);
    }
    for (const [count, radii] of byCount) {
      assert.equal(new Set(radii).size, 1, `传递依赖数为 ${count} 的节点半径不一致`);
    }
  });
});
