import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from '../build/index.js';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 把 test/fixtures/<name> 复制到一个临时目录，并把真实的 schema/ 一并带过去。
 * 这样 fixture 只描述「内容长什么样」，不用把 schema 抄一份、也就不会漂移。
 */
export function withFixtureRepo(name, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'akg-test-'));
  try {
    cpSync(join(REPO_ROOT, 'schema'), join(dir, 'schema'), { recursive: true });
    cpSync(join(REPO_ROOT, 'test/fixtures', name), dir, { recursive: true });
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 跑一次构建；通过返回 null，失败返回问题列表（其它异常照常抛出）。 */
export function collectProblems(rootDir) {
  try {
    build({ rootDir, generatedAt: '2026-01-01T00:00:00Z' });
    return null;
  } catch (error) {
    if (error.name === 'BuildFailure') return error.problems;
    throw error;
  }
}

/** 从问题列表里挑出「某个文件 + 某个字段」的那一条。 */
export function findProblem(problems, fileSuffix, field) {
  return problems.find(
    (item) => item.file.endsWith(fileSuffix) && (field === undefined || item.field === field),
  );
}

/**
 * 跑一段代码并返回它抛出的错误（没抛就断言失败）。
 * assert.throws 不返回错误对象，而我们几乎每个用例都要检查 message 和 line。
 */
export function capture(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('期望这段代码抛出错误，但它正常返回了');
}

/** 把某条问题的可读文本拼起来，方便断言「错误信息说清楚了什么」。 */
export function describe(problem) {
  if (!problem) return '';
  return [problem.file, problem.field, problem.message, problem.hint].filter(Boolean).join(' | ');
}
