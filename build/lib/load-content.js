/**
 * 扫描 content/ 目录，把 Markdown 变成结构化数据。
 * 这一层只负责「读进来 + 按 schema 校验」，跨文件的图检查在 graph.js 与 pm.js。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { FrontmatterError, parseFrontmatter, parseSections } from './frontmatter.js';
import { validateAgainstSchema } from './schema-validator.js';
import { problem } from './problems.js';

export const REQUIRED_SECTIONS = ['直觉', '细节'];

export const CASE_REQUIRED_SECTIONS = [
  '场景背景',
  '决策点',
  '决策过程',
  '结果与教训',
  '面试怎么讲',
];

export const INTERVIEW_REQUIRED_SECTIONS = ['好答案的要点', '常见的错误答案', '追问'];

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/** 递归列出目录下的所有 .md 文件，返回仓库相对路径（统一用 / 分隔）。 */
export function listMarkdownFiles(rootDir, subDir) {
  const absolute = join(rootDir, subDir);
  let entries;
  try {
    entries = readdirSync(absolute);
  } catch {
    return [];
  }

  const found = [];
  for (const entry of entries.sort()) {
    if (entry.startsWith('.')) continue;
    const child = join(absolute, entry);
    if (statSync(child).isDirectory()) {
      found.push(...listMarkdownFiles(rootDir, join(subDir, entry)));
    } else if (entry.endsWith('.md')) {
      found.push(relative(rootDir, child).split(sep).join('/'));
    }
  }
  return found;
}

/** 节点之外的其它内容类型各自占一个子目录，loadNodes 要跳过它们 */
const NON_NODE_DIRS = ['content/paths/', 'content/cases/', 'content/interview/'];

/**
 * 加载 content/ 下的全部节点。
 * @returns {{nodes: object[], problems: object[]}}
 */
export function loadNodes(rootDir, nodeSchema) {
  const nodes = [];
  const problems = [];

  for (const file of listMarkdownFiles(rootDir, 'content')) {
    if (NON_NODE_DIRS.some((dir) => file.startsWith(dir))) continue;

    let parsed;
    try {
      parsed = parseFrontmatter(readFileSync(join(rootDir, file), 'utf8'));
    } catch (error) {
      if (error instanceof FrontmatterError) {
        problems.push(
          problem({
            file,
            field: `第 ${error.line} 行`,
            message: error.message,
          }),
        );
        continue;
      }
      throw error;
    }

    for (const issue of validateAgainstSchema(parsed.data, nodeSchema)) {
      problems.push(
        problem({ file, field: issue.path, message: issue.message, hint: issue.hint }),
      );
    }

    const sections = parseSections(parsed.body);
    for (const name of REQUIRED_SECTIONS) {
      if (!sections[name]) {
        problems.push(
          problem({
            file,
            field: `## ${name}`,
            message: `正文缺少 \`## ${name}\` 小节，或该小节是空的`,
            hint:
              name === '直觉'
                ? 'L2：为什么重要、解决什么问题、一个类比'
                : 'L3：关键机制、代表论文、可运行代码',
          }),
        );
      }
    }

    nodes.push({
      file,
      id: typeof parsed.data.id === 'string' ? parsed.data.id : null,
      data: parsed.data,
      sections,
    });
  }

  return { nodes, problems };
}

/**
 * 加载 content/paths/ 下的全部学习路径。
 * @returns {{paths: object[], problems: object[]}}
 */
export function loadPaths(rootDir, pathSchema) {
  const paths = [];
  const problems = [];

  for (const file of listMarkdownFiles(rootDir, 'content/paths')) {
    let parsed;
    try {
      parsed = parseFrontmatter(readFileSync(join(rootDir, file), 'utf8'));
    } catch (error) {
      if (error instanceof FrontmatterError) {
        problems.push(problem({ file, field: `第 ${error.line} 行`, message: error.message }));
        continue;
      }
      throw error;
    }

    for (const issue of validateAgainstSchema(parsed.data, pathSchema)) {
      problems.push(
        problem({ file, field: issue.path, message: issue.message, hint: issue.hint }),
      );
    }

    paths.push({
      file,
      id: typeof parsed.data.id === 'string' ? parsed.data.id : null,
      data: parsed.data,
      sections: parseSections(parsed.body),
    });
  }

  return { paths, problems };
}

/**
 * 案例与面试题共用的加载骨架：扫描子目录、解析 frontmatter、按 schema 校验、
 * 检查必填小节。跨文件的引用检查在 pm.js。
 */
function loadCollection(rootDir, subDir, schema, requiredSections) {
  const items = [];
  const problems = [];

  for (const file of listMarkdownFiles(rootDir, subDir)) {
    let parsed;
    try {
      parsed = parseFrontmatter(readFileSync(join(rootDir, file), 'utf8'));
    } catch (error) {
      if (error instanceof FrontmatterError) {
        problems.push(problem({ file, field: `第 ${error.line} 行`, message: error.message }));
        continue;
      }
      throw error;
    }

    for (const issue of validateAgainstSchema(parsed.data, schema)) {
      problems.push(
        problem({ file, field: issue.path, message: issue.message, hint: issue.hint }),
      );
    }

    const sections = parseSections(parsed.body);
    for (const name of requiredSections) {
      if (!sections[name]) {
        problems.push(
          problem({
            file,
            field: `## ${name}`,
            message: `正文缺少 \`## ${name}\` 小节，或该小节是空的`,
          }),
        );
      }
    }

    items.push({
      file,
      id: typeof parsed.data.id === 'string' ? parsed.data.id : null,
      data: parsed.data,
      sections,
    });
  }

  return { items, problems };
}

/**
 * 加载 content/cases/ 下的全部案例。
 * @returns {{cases: object[], problems: object[]}}
 */
export function loadCases(rootDir, caseSchema) {
  const { items, problems } = loadCollection(rootDir, 'content/cases', caseSchema, CASE_REQUIRED_SECTIONS);
  return { cases: items, problems };
}

/**
 * 加载 content/interview/ 下的全部面试题。
 * @returns {{questions: object[], problems: object[]}}
 */
export function loadInterview(rootDir, questionSchema) {
  const { items, problems } = loadCollection(
    rootDir,
    'content/interview',
    questionSchema,
    INTERVIEW_REQUIRED_SECTIONS,
  );
  return { questions: items, problems };
}

/**
 * 领域登记表必须和 node.schema.json 里的 enum 完全一致，
 * 否则前端配色/分组会缺项，而这类漂移在内容文件里看不出来。
 */
export function checkDomainRegistry(domainsFile, nodeSchema) {
  const problems = [];
  const registered = domainsFile.domains ?? [];
  const ids = registered.map((entry) => entry.id);
  const allowed = nodeSchema.properties.domain.enum;

  for (const id of allowed) {
    if (!ids.includes(id)) {
      problems.push(
        problem({
          file: 'schema/domains.json',
          field: 'domains',
          message: `领域 \`${id}\` 在 node.schema.json 里允许，但这里没有登记`,
          hint: `补一条 { "id": "${id}", "label": "…", "order": N }`,
        }),
      );
    }
  }
  for (const id of ids) {
    if (!allowed.includes(id)) {
      problems.push(
        problem({
          file: 'schema/domains.json',
          field: 'domains',
          message: `领域 \`${id}\` 没有在 node.schema.json 的 domain enum 里登记`,
          hint: `可选值：${allowed.join('、')}`,
        }),
      );
    }
  }

  return problems;
}
