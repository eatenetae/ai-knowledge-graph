/**
 * 由节点集合构建依赖图，并做跨文件的完整性检查：
 * 重复 id、文件名与 id 不一致、悬空依赖、自引用、循环依赖、孤立节点。
 *
 * 边的方向：`source -> target` 表示「先学 source，才能学 target」。
 *   - prerequisite 边：由节点的 prerequisites 生成，方向是 前置 -> 后继
 *   - related 边：弱关联，无方向，同一对节点只保留一条
 */

import { basename } from 'node:path';

import { problem, suggestSimilar } from './problems.js';

const EDGE_PREREQUISITE = 'prerequisite';
const EDGE_RELATED = 'related';

/**
 * @returns {{nodes: object[], edges: object[], problems: object[], warnings: object[]}}
 */
export function buildGraph(nodes) {
  const problems = [];
  const warnings = [];

  const byId = new Map();
  for (const node of nodes) {
    if (node.id === null) continue; // id 字段本身的问题已经由 schema 校验报过
    if (byId.has(node.id)) {
      problems.push(
        problem({
          file: node.file,
          field: 'id',
          message: `id \`${node.id}\` 重复了，${byId.get(node.id).file} 已经用过`,
          hint: 'id 是图节点 key，必须全局唯一；改掉其中一个的文件名和 id',
        }),
      );
      continue;
    }
    byId.set(node.id, node);
  }

  // 文件名必须就是 id，否则「一个知识点 = 一个文件」的约定会慢慢烂掉
  for (const node of nodes) {
    if (node.id === null) continue;
    const expected = `${node.id}.md`;
    if (basename(node.file) !== expected) {
      problems.push(
        problem({
          file: node.file,
          field: 'id',
          message: `文件名与 id 对不上：id 是 \`${node.id}\`，文件名应该是 \`${expected}\``,
          hint: `把文件重命名为 ${expected}`,
        }),
      );
    }
  }

  const knownIds = [...byId.keys()].sort();

  for (const node of nodes) {
    if (node.id === null || byId.get(node.id) !== node) continue;
    const { prerequisites = [], related = [] } = node.data;

    for (const [index, target] of prerequisites.entries()) {
      checkReference({
        node,
        target,
        field: `prerequisites[${index}]`,
        label: '前置依赖',
        knownIds,
        problems,
      });
    }
    for (const [index, target] of related.entries()) {
      checkReference({
        node,
        target,
        field: `related[${index}]`,
        label: '相关节点',
        knownIds,
        problems,
      });
    }
  }

  const edges = [];
  const seenEdges = new Set();

  for (const node of byId.values()) {
    for (const target of node.data.prerequisites ?? []) {
      if (!byId.has(target) || target === node.id) continue;
      pushEdge(edges, seenEdges, target, node.id, EDGE_PREREQUISITE);
    }
    for (const target of node.data.related ?? []) {
      if (!byId.has(target) || target === node.id) continue;
      // related 是对称的：A 写了 B、B 也写了 A，只留一条
      const [source, dest] = [node.id, target].sort();
      pushEdge(edges, seenEdges, source, dest, EDGE_RELATED);
    }
  }

  edges.sort((a, b) => {
    const byType = a.type.localeCompare(b.type);
    if (byType !== 0) return byType;
    const bySource = a.source.localeCompare(b.source);
    return bySource !== 0 ? bySource : a.target.localeCompare(b.target);
  });

  for (const cycle of findPrerequisiteCycles(byId)) {
    problems.push(describeCycle(cycle, byId));
  }

  for (const node of findIsolatedNodes(byId, edges)) {
    problems.push(
      problem({
        file: node.file,
        field: 'prerequisites',
        message: '孤立节点：既没有任何前置依赖，也没有任何节点依赖它',
        hint: '给它补一条 prerequisites（挂到已有节点下），或在别的节点里把它列为前置',
      }),
    );
  }

  return { nodes: [...byId.values()], edges, problems, warnings };
}

function checkReference({ node, target, field, label, knownIds, problems }) {
  if (typeof target !== 'string') return; // 类型问题交给 schema
  if (target === node.id) {
    problems.push(
      problem({
        file: node.file,
        field,
        message: `${label}指向了自己（\`${target}\`）`,
        hint: '节点不能依赖自身，删掉这一项',
      }),
    );
    return;
  }
  if (knownIds.includes(target)) return;

  const suggestion = suggestSimilar(target, knownIds);
  problems.push(
    problem({
      file: node.file,
      field,
      message: `悬空依赖：${label} \`${target}\` 不存在`,
      hint: suggestion
        ? `你是不是想写 \`${suggestion}\`？`
        : `现有节点：${knownIds.join('、')}`,
    }),
  );
}

function pushEdge(edges, seen, source, target, type) {
  const key = `${type}|${source}|${target}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push({ source, target, type });
}

/**
 * 用三色标记的 DFS 找出所有前置依赖环。
 * 每当遇到一条指向「当前递归栈上节点」的边，就切出环的完整路径。
 */
function findPrerequisiteCycles(byId) {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const color = new Map([...byId.keys()].map((id) => [id, WHITE]));
  const stack = [];
  const cycles = new Map();

  const visit = (id) => {
    color.set(id, GRAY);
    stack.push(id);

    for (const next of byId.get(id).data.prerequisites ?? []) {
      if (!byId.has(next) || next === id) continue;
      const state = color.get(next);
      if (state === GRAY) {
        const cycle = stack.slice(stack.indexOf(next));
        cycles.set(canonicalCycleKey(cycle), cycle);
      } else if (state === WHITE) {
        visit(next);
      }
    }

    stack.pop();
    color.set(id, BLACK);
  };

  for (const id of byId.keys()) {
    if (color.get(id) === WHITE) visit(id);
  }

  return [...cycles.values()];
}

/** 同一个环从不同节点起头会被发现多次，转成同一个 key 去重。 */
function canonicalCycleKey(cycle) {
  let pivot = 0;
  for (let i = 1; i < cycle.length; i++) {
    if (cycle[i] < cycle[pivot]) pivot = i;
  }
  return [...cycle.slice(pivot), ...cycle.slice(0, pivot)].join(' -> ');
}

function describeCycle(cycle, byId) {
  const first = byId.get(cycle[0]);
  const path = [...cycle, cycle[0]].join(' → ');
  return problem({
    file: first.file,
    field: 'prerequisites',
    message: `循环依赖：${path}`,
    hint: `这 ${cycle.length} 个节点互为前置，学习顺序无法确定；断开其中任意一条边即可`,
  });
}

/** 孤立 = 既没有入边也没有出边。没有任何边指向的节点，用户永远走不到它。 */
function findIsolatedNodes(byId, edges) {
  const touched = new Set();
  for (const edge of edges) {
    touched.add(edge.source);
    touched.add(edge.target);
  }
  return [...byId.values()]
    .filter((node) => !touched.has(node.id))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 路径检查：步骤引用的节点必须存在、不能重复；
 * 如果某一步的前置依赖没有出现在它前面，只给提示（路径可以有取舍，不必闭环）。
 */
export function checkPaths(paths, byId) {
  const problems = [];
  const warnings = [];
  const seenIds = new Map();

  for (const path of paths) {
    if (path.id !== null) {
      if (seenIds.has(path.id)) {
        problems.push(
          problem({
            file: path.file,
            field: 'id',
            message: `路径 id \`${path.id}\` 重复了，${seenIds.get(path.id)} 已经用过`,
          }),
        );
      } else {
        seenIds.set(path.id, path.file);
      }
      if (basename(path.file) !== `${path.id}.md`) {
        problems.push(
          problem({
            file: path.file,
            field: 'id',
            message: `文件名与 id 对不上：文件名应该是 \`${path.id}.md\``,
          }),
        );
      }
    }

    const steps = path.data.steps ?? [];
    const seenSteps = new Set();
    const visited = [];

    steps.forEach((step, index) => {
      const id = step?.id;
      if (typeof id !== 'string') return;

      if (!byId.has(id)) {
        const suggestion = suggestSimilar(id, [...byId.keys()].sort());
        problems.push(
          problem({
            file: path.file,
            field: `steps[${index}].id`,
            message: `悬空依赖：路径引用了不存在的节点 \`${id}\``,
            hint: suggestion ? `你是不是想写 \`${suggestion}\`？` : undefined,
          }),
        );
        return;
      }

      if (seenSteps.has(id)) {
        problems.push(
          problem({
            file: path.file,
            field: `steps[${index}].id`,
            message: `节点 \`${id}\` 在这条路径里出现了两次`,
            hint: '路径是线性导航，同一个节点只应出现一次',
          }),
        );
        return;
      }
      seenSteps.add(id);

      const missing = (byId.get(id).data.prerequisites ?? []).filter(
        (prerequisite) => !visited.includes(prerequisite),
      );
      if (missing.length > 0) {
        warnings.push(
          problem({
            file: path.file,
            field: `steps[${index}].id`,
            message: `第 ${index + 1} 步 \`${id}\` 的前置依赖 ${missing
              .map((item) => `\`${item}\``)
              .join('、')} 没有出现在它前面`,
            hint: '如果这是有意跳过（读者可自行补课），忽略即可',
          }),
        );
      }

      visited.push(id);
    });
  }

  return { problems, warnings };
}
