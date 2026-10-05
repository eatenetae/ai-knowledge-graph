/**
 * PM 体系（v2）的跨文件校验。
 *
 * 三块东西在这一层交汇：
 *   1. schema/pm-domains.json —— 六大能力域登记表，案例的 domains 引用它；
 *   2. 节点 frontmatter 的 pm 标注（core / useful）—— 与登记表双向一致；
 *   3. 案例（content/cases/）与面试题（content/interview/）—— 必须挂到真实存在的节点。
 *
 * 「知识是骨架、案例和面试题是血肉」是冻结决策：不挂靠的内容不允许存在，
 * 所以这里所有检查都是硬错误，不是提示。
 */

import { basename } from 'node:path';

import { problem, suggestSimilar } from './problems.js';

const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * 登记表自身的结构检查：id 合法且唯一、每个域能对上号、验收区间在。
 * 登记表错会导致下面的交叉检查全乱，所以先把它自身钉死。
 */
export function checkPmRegistry(registry) {
  const problems = [];
  const file = 'schema/pm-domains.json';

  const domains = registry.domains ?? [];
  if (!Array.isArray(domains)) {
    return [
      problem({
        file,
        field: 'domains',
        message: 'domains 应该是一个数组（能力域列表），见 docs/pm-competency.md',
      }),
    ];
  }

  const bounds = registry.core_count_bounds;
  if (
    !Array.isArray(bounds) ||
    bounds.length !== 2 ||
    !Number.isInteger(bounds[0]) ||
    !Number.isInteger(bounds[1]) ||
    bounds[0] < 0 ||
    bounds[0] > bounds[1]
  ) {
    problems.push(
      problem({
        file,
        field: 'core_count_bounds',
        message: 'core 节点总数的验收区间必须是 [最小值, 最大值] 两个非负整数，且最小 ≤ 最大',
        hint: '例如 [25, 35]；core 是「面试前必须掌握」，宁缺毋滥',
      }),
    );
  }

  const seenIds = new Map();
  domains.forEach((domain, index) => {
    const field = `domains[${index}]`;
    if (!domain || typeof domain !== 'object') {
      problems.push(problem({ file, field, message: '能力域必须是对象' }));
      return;
    }
    if (typeof domain.id !== 'string' || !KEBAB_RE.test(domain.id)) {
      problems.push(
        problem({ file, field: `${field}.id`, message: `能力域 id 必须是小写 kebab-case，收到 ${JSON.stringify(domain.id)}` }),
      );
    } else if (seenIds.has(domain.id)) {
      problems.push(
        problem({
          file,
          field: `${field}.id`,
          message: `能力域 id \`${domain.id}\` 重复了，${seenIds.get(domain.id)} 已经用过`,
        }),
      );
    } else {
      seenIds.set(domain.id, field);
    }
    if (typeof domain.label !== 'string' || domain.label.length < 2) {
      problems.push(problem({ file, field: `${field}.label`, message: '能力域需要一个至少 2 个字符的展示名' }));
    }
    if (!Array.isArray(domain.core_nodes)) {
      problems.push(
        problem({ file, field: `${field}.core_nodes`, message: 'core_nodes 应该是该域必修节点的 id 数组' }),
      );
    }
  });

  return problems;
}

/**
 * 节点 pm 标注与登记表的交叉检查：双向一致、每域有必修、总数在区间、必修可回溯。
 *
 * @param {object} spec.registry  schema/pm-domains.json 的内容
 * @param {object[]} spec.nodes   buildGraph 产出的节点（含 data.pm）
 * @returns {{problems: object[]}}
 */
export function checkPmAnnotations({ registry, nodes }) {
  const problems = [];
  const file = 'schema/pm-domains.json';
  const bounds = Array.isArray(registry.core_count_bounds) ? registry.core_count_bounds : null;

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const coreNodes = nodes.filter((node) => node.data.pm === 'core');

  // 域 → core_nodes；以及 core 节点 → 所属域（反向索引）
  const domainOf = new Map();
  (registry.domains ?? []).forEach((domain, domainIndex) => {
    const field = `domains[${domainIndex}]`;

    for (const [index, id] of (domain.core_nodes ?? []).entries()) {
      if (typeof id !== 'string') continue; // 结构问题已在 checkPmRegistry 报过

      if (!byId.has(id)) {
        const suggestion = suggestSimilar(id, [...byId.keys()].sort());
        problems.push(
          problem({
            file,
            field: `${field}.core_nodes[${index}]`,
            message: `能力域「${domain.label}」的必修节点 \`${id}\` 不存在`,
            hint: suggestion ? `你是不是想写 \`${suggestion}\`？` : undefined,
          }),
        );
        continue;
      }

      if (byId.get(id).data.pm !== 'core') {
        problems.push(
          problem({
            file: byId.get(id).file,
            field: 'pm',
            message: `登记表把 \`${id}\` 列为「${domain.label}」的必修节点，但它的 frontmatter 没有标 pm: core`,
            hint: '两边要对上：要么节点补 pm: core，要么把它从 core_nodes 里拿掉',
          }),
        );
      }

      const claimed = domainOf.get(id);
      if (claimed) {
        problems.push(
          problem({
            file,
            field: `${field}.core_nodes[${index}]`,
            message: `节点 \`${id}\` 同时登记在「${claimed}」和「${domain.label}」两个能力域里`,
            hint: '每个必修节点只归一个域，必修地图才能不重不漏',
          }),
        );
      } else {
        domainOf.set(id, domain.label);
      }
    }

    if (Array.isArray(domain.core_nodes) && domain.core_nodes.length === 0) {
      problems.push(
        problem({
          file,
          field: `${field}.core_nodes`,
          message: `能力域「${domain.label}」没有任何必修节点`,
          hint: 'core 集合必须覆盖全部六大能力域，见 docs/pm-competency.md',
        }),
      );
    }
  });

  // 标了 core 的节点必须登记进恰好一个域（重复登记上面已报，这里报「没登记」）
  for (const node of coreNodes) {
    if (!domainOf.has(node.id)) {
      problems.push(
        problem({
          file: node.file,
          field: 'pm',
          message: `节点 \`${node.id}\` 标了 pm: core，但没有登记进 schema/pm-domains.json 的任何能力域`,
          hint: '必修地图按能力域分组，漏登记的 core 节点用户看不到',
        }),
      );
    }
  }

  if (bounds) {
    if (coreNodes.length < bounds[0]) {
      problems.push(
        problem({
          file,
          field: 'core_count_bounds',
          message: `core 节点只有 ${coreNodes.length} 个，低于验收下限 ${bounds[0]}`,
          hint: 'core 是「面试前必须掌握」——要么补齐必修内容，要么 conscious 地调低区间',
        }),
      );
    }
    if (coreNodes.length > bounds[1]) {
      problems.push(
        problem({
          file,
          field: 'core_count_bounds',
          message: `core 节点有 ${coreNodes.length} 个，超过验收上限 ${bounds[1]}`,
          hint: '宁缺毋滥：把「不知道也不致命」的降级成 useful，或 conscious 地调高区间',
        }),
      );
    }
  }

  for (const node of coreNodes) {
    if (!reachesRoot(node, byId)) {
      problems.push(
        problem({
          file: node.file,
          field: 'pm',
          message: `必修节点 \`${node.id}\` 沿前置依赖回溯不到任何基础节点（无前置的节点）`,
          hint: '必修内容的学习链必须有头：给它补一条通往基础节点的前置链',
        }),
      );
    }
  }

  return { problems };
}

/** 从 node 出发沿 prerequisites 反向走，闭包里（含自身）存在无前置的节点即可回溯。 */
function reachesRoot(node, byId) {
  const visited = new Set();
  const queue = [node];
  while (queue.length > 0) {
    const current = queue.pop();
    if (visited.has(current.id)) continue;
    visited.add(current.id);
    if ((current.data.prerequisites ?? []).length === 0) return true;
    for (const id of current.data.prerequisites ?? []) {
      const next = byId.get(id);
      if (next && !visited.has(next.id)) queue.push(next);
    }
  }
  return false;
}

/**
 * 案例的跨文件检查：挂靠节点存在、能力域已登记、id 唯一、文件名一致。
 *
 * @param {object[]} cases    loadCases 产出的案例
 * @param {Map} byId          节点 id → 节点
 * @param {object} registry   schema/pm-domains.json 的内容
 * @returns {{problems: object[]}}
 */
export function checkCases(cases, byId, registry) {
  const problems = [];
  const knownNodeIds = [...byId.keys()].sort();
  const knownDomainIds = (registry.domains ?? [])
    .filter((domain) => typeof domain?.id === 'string')
    .map((domain) => domain.id);
  const seenIds = new Map();

  for (const item of cases) {
    checkIdAndFileName({ item, seenIds, kind: '案例', problems });

    for (const [index, id] of (item.data.nodes ?? []).entries()) {
      checkNodeReference({
        file: item.file,
        field: `nodes[${index}]`,
        target: id,
        label: '案例挂靠的知识节点',
        knownNodeIds,
        byId,
        problems,
      });
    }

    for (const [index, id] of (item.data.domains ?? []).entries()) {
      if (typeof id !== 'string') continue; // 类型问题交给 schema
      if (!knownDomainIds.includes(id)) {
        const suggestion = suggestSimilar(id, knownDomainIds);
        problems.push(
          problem({
            file: item.file,
            field: `domains[${index}]`,
            message: `案例引用的 PM 能力域 \`${id}\` 没有登记`,
            hint: suggestion
              ? `你是不是想写 \`${suggestion}\`？`
              : `已登记的能力域：${knownDomainIds.join('、')}`,
          }),
        );
      }
    }
  }

  return { problems };
}

/**
 * 面试题的跨文件检查：复习节点存在、id 唯一、文件名一致。
 *
 * @param {object[]} questions loadInterview 产出的题目
 * @param {Map} byId           节点 id → 节点
 * @returns {{problems: object[]}}
 */
export function checkInterview(questions, byId) {
  const problems = [];
  const knownNodeIds = [...byId.keys()].sort();
  const seenIds = new Map();

  for (const item of questions) {
    checkIdAndFileName({ item, seenIds, kind: '面试题', problems });

    for (const [index, id] of (item.data.nodes ?? []).entries()) {
      checkNodeReference({
        file: item.file,
        field: `nodes[${index}]`,
        target: id,
        label: '复习节点',
        knownNodeIds,
        byId,
        problems,
      });
    }
  }

  return { problems };
}

/** id 在同类内容里唯一，且文件名就是 id——和节点的约定一致。 */
function checkIdAndFileName({ item, seenIds, kind, problems }) {
  if (item.id === null) return; // id 字段本身的问题已经由 schema 校验报过

  if (seenIds.has(item.id)) {
    problems.push(
      problem({
        file: item.file,
        field: 'id',
        message: `${kind} id \`${item.id}\` 重复了，${seenIds.get(item.id)} 已经用过`,
      }),
    );
  } else {
    seenIds.set(item.id, item.file);
  }

  if (basename(item.file) !== `${item.id}.md`) {
    problems.push(
      problem({
        file: item.file,
        field: 'id',
        message: `文件名与 id 对不上：id 是 \`${item.id}\`，文件名应该是 \`${item.id}.md\``,
      }),
    );
  }
}

function checkNodeReference({ file, field, target, label, knownNodeIds, byId, problems }) {
  if (typeof target !== 'string') return; // 类型问题交给 schema
  if (byId.has(target)) return;

  const suggestion = suggestSimilar(target, knownNodeIds);
  problems.push(
    problem({
      file,
      field,
      message: `悬空引用：${label} \`${target}\` 不存在`,
      hint: suggestion
        ? `你是不是想写 \`${suggestion}\`？`
        : `现有节点：${knownNodeIds.join('、')}`,
    }),
  );
}
