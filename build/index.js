#!/usr/bin/env node
/**
 * 构建入口：content/**\/*.md  ->  web/public/ 下的五个产物 JSON
 * （graph / paths / content / cases / interview）
 *
 * 用法：
 *   node build/index.js            校验并写出产物
 *   node build/index.js --check    只校验，不写文件（CI / pre-commit 用）
 *   node build/index.js --quiet    只输出结论
 *
 * 退出码：0 通过；1 校验失败（错误信息见 stdout）；2 用法或环境错误。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkDomainRegistry,
  loadCases,
  loadInterview,
  loadNodes,
  loadPaths,
  readJson,
} from './lib/load-content.js';
import { buildGraph, checkPaths } from './lib/graph.js';
import { checkCases, checkInterview, checkPmAnnotations, checkPmRegistry } from './lib/pm.js';
import { BuildFailure, renderProblems, sortProblems } from './lib/problems.js';
import {
  toCasesJson,
  toContentJson,
  toGraphJson,
  toInterviewJson,
  toPathsJson,
} from './lib/serialize.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '..');

const OUTPUTS = {
  graph: 'web/public/graph.json',
  paths: 'web/public/paths.json',
  content: 'web/public/content.json',
  cases: 'web/public/cases.json',
  interview: 'web/public/interview.json',
};

export function build({ rootDir = DEFAULT_ROOT, generatedAt = nowStamp() } = {}) {
  const nodeSchema = readJson(join(rootDir, 'schema/node.schema.json'));
  const pathSchema = readJson(join(rootDir, 'schema/path.schema.json'));
  const caseSchema = readJson(join(rootDir, 'schema/case.schema.json'));
  const questionSchema = readJson(join(rootDir, 'schema/interview-question.schema.json'));
  const domainsFile = readJson(join(rootDir, 'schema/domains.json'));
  const pmDomainsFile = readJson(join(rootDir, 'schema/pm-domains.json'));

  const problems = checkDomainRegistry(domainsFile, nodeSchema);
  problems.push(...checkPmRegistry(pmDomainsFile));

  const loadedNodes = loadNodes(rootDir, nodeSchema);
  problems.push(...loadedNodes.problems);

  const loadedPaths = loadPaths(rootDir, pathSchema);
  problems.push(...loadedPaths.problems);

  const loadedCases = loadCases(rootDir, caseSchema);
  problems.push(...loadedCases.problems);

  const loadedInterview = loadInterview(rootDir, questionSchema);
  problems.push(...loadedInterview.problems);

  const graph = buildGraph(loadedNodes.nodes);
  problems.push(...graph.problems);

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const pathChecks = checkPaths(loadedPaths.paths, byId);
  problems.push(...pathChecks.problems);

  const pmChecks = checkPmAnnotations({ registry: pmDomainsFile, nodes: graph.nodes });
  problems.push(...pmChecks.problems);

  const caseChecks = checkCases(loadedCases.cases, byId, pmDomainsFile);
  problems.push(...caseChecks.problems);

  const interviewChecks = checkInterview(loadedInterview.questions, byId);
  problems.push(...interviewChecks.problems);

  const warnings = sortProblems([...graph.warnings, ...pathChecks.warnings]);

  if (problems.length > 0) {
    throw new BuildFailure(sortProblems(problems));
  }

  return {
    graph: toGraphJson({
      nodes: graph.nodes,
      edges: graph.edges,
      domains: domainsFile.domains,
      pmDomains: pmDomainsFile.domains,
      generatedAt,
    }),
    paths: toPathsJson({ paths: loadedPaths.paths, byId, generatedAt }),
    content: toContentJson({ nodes: graph.nodes, generatedAt }),
    cases: toCasesJson({ cases: loadedCases.cases, generatedAt }),
    interview: toInterviewJson({ questions: loadedInterview.questions, generatedAt }),
    warnings,
  };
}

export function writeOutputs(rootDir, artifacts) {
  for (const [name, relativePath] of Object.entries(OUTPUTS)) {
    const target = join(rootDir, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(artifacts[name], null, 2)}\n`);
  }
}

function nowStamp() {
  // SOURCE_DATE_EPOCH 让 CI 能产出可复现的构建结果
  const epoch = process.env.SOURCE_DATE_EPOCH;
  const date = epoch ? new Date(Number(epoch) * 1000) : new Date();
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function main(argv) {
  const checkOnly = argv.includes('--check');
  const quiet = argv.includes('--quiet');
  const rootIndex = argv.indexOf('--root');
  const rootDir = rootIndex === -1 ? DEFAULT_ROOT : resolve(argv[rootIndex + 1]);

  let result;
  try {
    result = build({ rootDir });
  } catch (error) {
    if (error instanceof BuildFailure) {
      process.stderr.write(`${renderProblems(error.problems)}\n`);
      process.stderr.write('\n提示：README 的「新增一个节点」一节写了每个字段的写法。\n');
      return 1;
    }
    process.stderr.write(`✗ 构建出错：${error.message}\n`);
    return 2;
  }

  if (result.warnings.length > 0 && !quiet) {
    process.stdout.write(`⚠ ${result.warnings.length} 条提示（不影响构建）：\n\n`);
    for (const warning of result.warnings) {
      process.stdout.write(`  · ${warning.file} ${warning.field ?? ''}\n`);
      process.stdout.write(`    ${warning.message}\n`);
    }
    process.stdout.write('\n');
  }

  if (!checkOnly) {
    writeOutputs(rootDir, result);
  }

  if (!quiet) {
    const { stats } = result.graph;
    process.stdout.write('✓ 内容校验通过\n\n');
    process.stdout.write(
      `  节点 ${stats.node_count} 个 · 边 ${stats.edge_count} 条` +
        `（前置 ${stats.prerequisite_edge_count} / 相关 ${stats.related_edge_count}）` +
        ` · 领域 ${stats.domain_count} 个 · 路径 ${result.paths.paths.length} 条\n`,
    );
    process.stdout.write(
      `  PM 标注：core ${stats.pm_core_count} 个（覆盖 ${result.graph.pm_domains.length} 个能力域）` +
        ` · useful ${stats.pm_useful_count} 个\n`,
    );
    process.stdout.write(
      `  案例 ${result.cases.case_count} 个 · 面试题 ${result.interview.question_count} 道\n`,
    );
    if (checkOnly) {
      process.stdout.write('  --check：只校验，未写出文件\n');
    } else {
      for (const relativePath of Object.values(OUTPUTS)) {
        process.stdout.write(`  已写出 ${relativePath}\n`);
      }
    }
  }

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
