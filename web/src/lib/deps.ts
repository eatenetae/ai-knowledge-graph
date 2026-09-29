import type { GraphJson, GraphNode } from '../types';

/**
 * 图谱的索引与依赖运算。
 *
 * 边方向务必记牢：`source -> target` 是「先学 source，才能学 target」。
 * 所以「学 X 之前要懂什么」= 沿 prerequisite 边从 X **反向**走，
 * 而「X 是哪些节点的前置」= 沿 prerequisite 边**正向**走。
 */
export interface GraphIndex {
  nodes: GraphNode[];
  byId: Map<string, GraphNode>;
  /** 节点 -> 它的前置（学它之前要先懂的） */
  prereqsOf: Map<string, string[]>;
  /** 节点 -> 直接依赖它的节点（先懂它才能学的） */
  dependentsOf: Map<string, string[]>;
  /** 节点 -> 传递依赖它的节点个数。越大越基础，图上画得越显眼 */
  transitiveDependents: Map<string, number>;
  /** 全局拓扑序：任何一个节点都排在它的后继之前 */
  topoOrder: string[];
  /** 节点在全局拓扑序里的位置，用于稳定的并列排序 */
  rankOf: Map<string, number>;
  /**
   * 稳定的并列比较：先比领域序，再比 id。
   *
   * 关键是它**只依赖内容本身**，不依赖数组下标——否则同样的图，
   * 只要 graph.json 里节点的排列顺序变一下，布局就会整体挪位。
   */
  compareNodes: (a: string, b: string) => number;
}

export function buildIndex(graph: GraphJson): GraphIndex {
  const nodes = graph.nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const domainOrder = new Map(graph.domains.map((domain) => [domain.id, domain.order]));
  const orderOf = (id: string) => domainOrder.get(byId.get(id)?.domain ?? '') ?? Number.MAX_SAFE_INTEGER;
  const compareNodes = (a: string, b: string) => {
    const byDomain = orderOf(a) - orderOf(b);
    return byDomain !== 0 ? byDomain : a.localeCompare(b);
  };

  const prereqsOf = new Map<string, string[]>();
  const dependentsOf = new Map<string, string[]>();
  for (const node of nodes) {
    dependentsOf.set(node.id, []);
  }
  for (const node of nodes) {
    // 悬空引用由构建期拦下，这里再过滤一次是为了前端拿到坏数据时也不崩
    const prereqs = node.prerequisites.filter((id) => byId.has(id) && id !== node.id);
    prereqsOf.set(node.id, prereqs);
    for (const prereq of prereqs) {
      dependentsOf.get(prereq)!.push(node.id);
    }
  }
  // 同一层的并列顺序会影响布局，先排好，后面就不用再关心顺序从哪来
  for (const list of dependentsOf.values()) list.sort();
  for (const list of prereqsOf.values()) list.sort();

  const topoOrder = topologicalOrder(nodes, prereqsOf, dependentsOf, compareNodes);
  const rankOf = new Map(topoOrder.map((id, index) => [id, index]));

  const transitiveDependents = new Map<string, number>();
  for (const node of nodes) {
    transitiveDependents.set(node.id, reachableFrom(node.id, dependentsOf).size);
  }

  return {
    nodes,
    byId,
    prereqsOf,
    dependentsOf,
    transitiveDependents,
    topoOrder,
    rankOf,
    compareNodes,
  };
}

/**
 * Kahn 拓扑排序。并列时按 compareNodes（领域序 -> id）取，
 * 保证同一张图永远得到同样的顺序，跟数组怎么排无关。
 */
function topologicalOrder(
  nodes: GraphNode[],
  prereqsOf: Map<string, string[]>,
  dependentsOf: Map<string, string[]>,
  compareNodes: (a: string, b: string) => number,
): string[] {
  const indegree = new Map<string, number>();
  for (const node of nodes) {
    indegree.set(node.id, prereqsOf.get(node.id)!.length);
  }

  const ready = nodes
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id)
    .sort(compareNodes);

  const result: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    result.push(id);
    for (const dependent of dependentsOf.get(id)!) {
      const left = indegree.get(dependent)! - 1;
      indegree.set(dependent, left);
      if (left === 0) {
        // 插到合适的位置而不是 push，等价于用一个有序集合取最小值
        const position = ready.findIndex((candidate) => compareNodes(candidate, dependent) > 0);
        if (position === -1) ready.push(dependent);
        else ready.splice(position, 0, dependent);
      }
    }
  }

  // 构建期已经保证无环；真拿到环数据时把剩下的按稳定序补上，不要卡死
  if (result.length < nodes.length) {
    const seen = new Set(result);
    for (const id of nodes.map((node) => node.id).sort(compareNodes)) {
      if (!seen.has(id)) result.push(id);
    }
  }

  return result;
}

/** 沿邻接表走一遍，返回能到达的全部节点（不含起点本身）。 */
function reachableFrom(start: string, adjacency: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...(adjacency.get(start) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of adjacency.get(id) ?? []) {
      if (!seen.has(next)) stack.push(next);
    }
  }
  return seen;
}

export interface DependencySubgraph {
  /** 含目标节点自身，按依赖顺序排列（前置在前） */
  ordered: string[];
  /** 快速查表用 */
  ids: Set<string>;
  /** 目标节点本身 */
  targetId: string;
}

/**
 * 聚焦模式的核心：算出「学会 targetId 需要看的全部节点」。
 *
 * 沿 prerequisite 边反向递归上溯，再把子图按拓扑序排好——
 * 这样面板列出来的就是一个可以直接照着学的顺序，而不是一堆散点。
 */
export function dependencySubgraph(index: GraphIndex, targetId: string): DependencySubgraph {
  if (!index.byId.has(targetId)) {
    return { ordered: [], ids: new Set(), targetId };
  }

  const ids = new Set<string>([targetId]);
  const stack = [targetId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const prereq of index.prereqsOf.get(id) ?? []) {
      if (ids.has(prereq)) continue;
      ids.add(prereq);
      stack.push(prereq);
    }
  }

  return { ordered: sortByDependency(index, ids), ids, targetId };
}

/**
 * 把一组节点按依赖顺序排好：前置一定排在后继前面。
 * 并列时用全局拓扑序的 rank 兜底，保证顺序稳定。
 */
export function sortByDependency(index: GraphIndex, ids: Set<string>): string[] {
  const indegree = new Map<string, number>();
  const within = new Map<string, string[]>();

  for (const id of ids) {
    const prereqs = (index.prereqsOf.get(id) ?? []).filter((prereq) => ids.has(prereq));
    indegree.set(id, prereqs.length);
    for (const prereq of prereqs) {
      const list = within.get(prereq);
      if (list) list.push(id);
      else within.set(prereq, [id]);
    }
  }

  const rankOf = (id: string) => index.rankOf.get(id) ?? Number.MAX_SAFE_INTEGER;
  const ready = [...ids].filter((id) => indegree.get(id) === 0).sort((a, b) => rankOf(a) - rankOf(b));

  const ordered: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    ordered.push(id);
    for (const dependent of within.get(id) ?? []) {
      const left = indegree.get(dependent)! - 1;
      indegree.set(dependent, left);
      if (left === 0) {
        const position = ready.findIndex((candidate) => rankOf(candidate) > rankOf(dependent));
        if (position === -1) ready.push(dependent);
        else ready.splice(position, 0, dependent);
      }
    }
  }

  // 理论上不会发生（构建期无环），兜底避免静默丢节点
  if (ordered.length < ids.size) {
    const seen = new Set(ordered);
    for (const id of [...ids].sort((a, b) => rankOf(a) - rankOf(b))) {
      if (!seen.has(id)) ordered.push(id);
    }
  }

  return ordered;
}

/** 某节点的完整前置依赖集合（不含自身），用于「这个节点有多基础」的度量。 */
export function prerequisiteClosure(index: GraphIndex, targetId: string): Set<string> {
  const { ids } = dependencySubgraph(index, targetId);
  ids.delete(targetId);
  return ids;
}
