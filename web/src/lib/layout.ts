import type { GraphJson } from '../types';
import type { GraphIndex } from './deps';

/**
 * 图谱布局。
 *
 * 刻意**不用力导向**：力导向每次跑出来的位置都不一样，刷新一下整张图就散架，
 * 用户刚建立起来的空间记忆立刻作废。这里用的是确定性的分层布局：
 *
 *   1. 按最长路径分层 —— 没有前置的节点在第 0 层，越依赖别人的层号越大；
 *   2. 层内用重心法（barycenter）排几轮，把连线交叉压下去；
 *   3. 全程没有任何随机数，同一份 graph.json 永远得到同一张图。
 *
 * 副产品是：越基础的节点越靠上，依赖方向天然从上往下，读图不用看箭头也能懂。
 */

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  /** 圆的半径：被依赖得越多，画得越大 */
  radius: number;
  layer: number;
  /** 层内序号，用于画标签时的错位 */
  slot: number;
}

export interface Layout {
  nodes: Map<string, LayoutNode>;
  /** 每层的节点 id，按层内顺序 */
  layers: string[][];
  /** 内容包围盒，用于初始适配视图 */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  width: number;
  height: number;
}

/** 层内横向间距（布局坐标）。渲染层要拿它算标签能放几个字，所以导出。 */
export const X_GAP = 176;
/** 层间纵向间距 */
export const Y_GAP = 148;
const MIN_RADIUS = 15;
const MAX_RADIUS = 30;

export function computeLayout(graph: GraphJson, index: GraphIndex): Layout {
  const ids = graph.nodes.map((node) => node.id);
  const layersOf = assignLayers(index);
  const layerCount = Math.max(1, ...ids.map((id) => layersOf.get(id)! + 1));

  const layers: string[][] = Array.from({ length: layerCount }, () => []);
  for (const id of ids) {
    layers[layersOf.get(id)!].push(id);
  }
  // 初始顺序按内容定（领域序 -> id），跟节点在数组里怎么排无关
  for (const layer of layers) {
    layer.sort(index.compareNodes);
  }

  reduceCrossings(layers, index);

  const radiusOf = computeRadii(index);

  const nodes = new Map<string, LayoutNode>();
  layers.forEach((layer, layerIndex) => {
    const offset = (layer.length - 1) / 2;
    layer.forEach((id, slot) => {
      nodes.set(id, {
        id,
        x: (slot - offset) * X_GAP,
        y: layerIndex * Y_GAP,
        radius: radiusOf.get(id) ?? MIN_RADIUS,
        layer: layerIndex,
        slot,
      });
    });
  });

  return finalize(nodes, layers);
}

/**
 * 最长路径分层：layer(n) = 0（没有前置），否则 1 + max(layer(前置))。
 * 用记忆化 DFS，构建期已经保证无环，这里的 visited 只是防坏数据。
 */
function assignLayers(index: GraphIndex): Map<string, number> {
  const layers = new Map<string, number>();
  const visiting = new Set<string>();

  const visit = (id: string): number => {
    const known = layers.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // 坏数据兜底：遇到环就当成根

    visiting.add(id);
    let layer = 0;
    for (const prereq of index.prereqsOf.get(id) ?? []) {
      layer = Math.max(layer, visit(prereq) + 1);
    }
    visiting.delete(id);
    layers.set(id, layer);
    return layer;
  };

  for (const node of index.nodes) visit(node.id);
  return layers;
}

/**
 * 重心法压交叉：向下扫一遍（按前置的平均位置排），再向上扫一遍（按后继的平均位置排）。
 * 扫固定轮数而不是「扫到不动」——固定轮数同样是确定性的，但耗时可控。
 */
function reduceCrossings(layers: string[][], index: GraphIndex): void {
  const positionOf = () => {
    const position = new Map<string, number>();
    for (const layer of layers) {
      layer.forEach((id, slot) => position.set(id, slot));
    }
    return position;
  };

  const SWEEPS = 4;
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    const downward = sweep % 2 === 0;
    const position = positionOf();
    const order = downward
      ? [...layers.keys()].slice(1)
      : [...layers.keys()].slice(0, -1).reverse();

    for (const layerIndex of order) {
      const neighbours = downward ? index.prereqsOf : index.dependentsOf;
      const layer = layers[layerIndex];

      const barycenter = new Map<string, number>();
      layer.forEach((id, slot) => {
        const related = neighbours.get(id) ?? [];
        if (related.length === 0) {
          barycenter.set(id, slot); // 没有邻居的节点留在原地，别被甩到边角
          return;
        }
        let sum = 0;
        for (const other of related) sum += position.get(other) ?? slot;
        barycenter.set(id, sum / related.length);
      });

      // 排序键里带上原 slot，保证并列时顺序不变（稳定排序 + 确定性）
      const original = new Map(layer.map((id, slot) => [id, slot]));
      layer.sort((a, b) => {
        const diff = barycenter.get(a)! - barycenter.get(b)!;
        if (Math.abs(diff) > 1e-9) return diff;
        return original.get(a)! - original.get(b)!;
      });
    }
  }
}

/**
 * 半径反映「被依赖程度」：传递依赖它的节点越多，说明越基础，画得越大。
 * 用平方根压缩一下，免得一两个枢纽节点把其他节点衬成点。
 */
function computeRadii(index: GraphIndex): Map<string, number> {
  const counts = [...index.transitiveDependents.values()];
  const max = Math.max(1, ...counts);

  const radii = new Map<string, number>();
  for (const [id, count] of index.transitiveDependents) {
    const ratio = Math.sqrt(count / max);
    radii.set(id, MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * ratio);
  }
  return radii;
}

function finalize(nodes: Map<string, LayoutNode>, layers: string[][]): Layout {
  const values = [...nodes.values()];
  const minX = Math.min(0, ...values.map((node) => node.x - node.radius));
  const maxX = Math.max(0, ...values.map((node) => node.x + node.radius));
  const minY = Math.min(0, ...values.map((node) => node.y - node.radius));
  const maxY = Math.max(0, ...values.map((node) => node.y + node.radius));

  return {
    nodes,
    layers,
    bounds: { minX, minY, maxX, maxY },
    width: maxX - minX,
    height: maxY - minY,
  };
}
