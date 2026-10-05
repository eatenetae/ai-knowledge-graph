import type { CaseItem, CasesJson, LearningPath } from '../types';

/**
 * PM 视图共用的几个小计算。放在 lib 里是因为它们有「对不对」可言：
 * 分组顺序、冲刺路径的识别、节点 → 案例的反向索引，都值得单测钉住。
 */

/** 面试题的分组顺序：与 schema/interview-question.schema.json 的枚举一致 */
export const CATEGORY_ORDER = [
  '能力边界',
  '幻觉与质量',
  'RAG 与知识库',
  'Agent',
  '成本与延迟',
  '评测',
  '数据与安全',
  '项目与协作',
] as const;

/** 分组按 schema 枚举顺序排；万一出现枚举外的分组（不该发生），按首次出现排在最后 */
export function orderCategories(categories: Iterable<string>): string[] {
  const rank = new Map<string, number>(CATEGORY_ORDER.map((category, index) => [category, index]));
  const out = [...categories];
  return out.sort((a, b) => {
    const ra = rank.get(a) ?? CATEGORY_ORDER.length;
    const rb = rank.get(b) ?? CATEGORY_ORDER.length;
    return ra !== rb ? ra - rb : a.localeCompare(b, 'zh-Hans-CN');
  });
}

/**
 * 找「AI PM 面试冲刺」学习路径。路径内容在另一个任务（MY-92）里产出，
 * id 没有冻结，所以按标题/ id 里的关键词识别，找到就直接深链，
 * 找不到就退回路径列表——两种情况题库都不缺入口。
 */
export function findSprintPath(paths: LearningPath[]): LearningPath | null {
  const isSprint = (path: LearningPath) =>
    /冲刺/.test(path.title) || /sprint/.test(path.id) || /冲刺/.test(path.id);
  return paths.find(isSprint) ?? null;
}

/**
 * 节点 → 案例的反向索引：三层卡片里「相关案例」区的数据源。
 * 案例挂靠节点（cases.nodes），这里把边反过来，让「节点 → 案例」也一步可达。
 */
export function buildCasesByNode(cases: CasesJson): Map<string, CaseItem[]> {
  const byNode = new Map<string, CaseItem[]>();
  for (const item of cases.cases) {
    for (const nodeId of item.nodes) {
      const list = byNode.get(nodeId);
      if (list) list.push(item);
      else byNode.set(nodeId, [item]);
    }
  }
  return byNode;
}
