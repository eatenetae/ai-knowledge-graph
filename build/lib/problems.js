/**
 * 构建问题的统一表示与渲染。
 *
 * 一条问题至少要回答三件事：**哪个文件**、**哪个字段**、**为什么错**。
 * 构建失败时打印的就是这些东西，而不是 Node 的堆栈。
 */

export class BuildFailure extends Error {
  constructor(problems) {
    super(`构建失败，共 ${problems.length} 个问题`);
    this.name = 'BuildFailure';
    this.problems = problems;
  }
}

/**
 * @param {object} spec
 * @param {string} spec.file    仓库相对路径，例如 content/llm/transformer.md
 * @param {string} [spec.field] 出错的字段路径，例如 prerequisites[0]
 * @param {string} spec.message 为什么错
 * @param {string} [spec.hint]  怎么改
 */
export function problem({ file, field, message, hint }) {
  return { file, field, message, hint };
}

/** 先按文件、再按字段排序，保证多次构建的输出稳定可比。 */
export function sortProblems(problems) {
  return [...problems].sort((a, b) => {
    const byFile = a.file.localeCompare(b.file);
    if (byFile !== 0) return byFile;
    return (a.field ?? '').localeCompare(b.field ?? '');
  });
}

export function renderProblems(problems) {
  const sorted = sortProblems(problems);
  const lines = [`✗ 构建失败，共 ${sorted.length} 个问题：`, ''];

  sorted.forEach((item, index) => {
    lines.push(`  ${index + 1}) ${item.file}`);
    const where = item.field ? `字段 \`${item.field}\`：` : '';
    lines.push(`     ${where}${item.message}`);
    if (item.hint) lines.push(`     ↳ ${item.hint}`);
    lines.push('');
  });

  return lines.join('\n').trimEnd();
}

/**
 * 「你是不是想写 X？」—— 悬空依赖里最常见的错就是拼错或写成复数，
 * 给一个候选能省掉一轮猜谜。
 *
 * 阈值刻意收得紧：一个错的建议比没有建议更让人困惑。
 * `ghost-node` 和 `root-node` 的距离是 3，不该被当成笔误；
 * `alpa` 和 `alpha` 只差一次相邻字符交换，必须能认出来。
 */
export function suggestSimilar(input, candidates) {
  const limit = Math.max(1, Math.floor(Math.min(...candidates.map((c) => c.length), input.length) / 4));

  let best = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = editDistance(input, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  if (best === null || bestDistance > limit) return undefined;
  return best;
}

/**
 * Damerau-Levenshtein（最优字符串对齐版）。
 * 相比普通编辑距离，它把「相邻两个字符写反了」算作一次编辑——
 * 这恰好是手打 kebab-case id 时最常犯的错（`alpa` / `alpha`）。
 */
function editDistance(a, b) {
  if (a === b) return 0;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = Array.from({ length: rows }, (_, i) => {
    const row = new Array(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[rows - 1][cols - 1];
}
