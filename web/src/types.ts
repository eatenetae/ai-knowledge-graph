/**
 * 构建产物的类型。
 *
 * 这些结构由 `node build/index.js` 冻结产出，见 web/README.md。
 * 前端只消费，不参与生成——字段有任何变化都应当先改构建脚本和它的 schema。
 */

export interface SourceLink {
  title: string;
  url: string;
}

export interface GraphNode {
  id: string;
  title: string;
  domain: string;
  /** v2：PM 相关性标注（core = AI PM 面试前必须掌握 / useful = 相关但非必须 / null = 无标记） */
  pm: 'core' | 'useful' | null;
  /** L1：一句话，零术语 */
  summary: string;
  tags: string[];
  /** 「学它之前需要先懂什么」 */
  prerequisites: string[];
  related: string[];
  sources: SourceLink[];
  updated_at: string;
  file: string;
}

/** v2：PM 六大能力域，必修地图的分组依据（schema/pm-domains.json） */
export interface PmDomainMeta {
  id: string;
  label: string;
  order: number;
  summary: string;
  core_nodes: string[];
}

/**
 * 边方向：`source -> target` 表示「先学 source，才能学 target」。
 * 所以某节点的依赖子图要沿 prerequisite 边从它**反向**遍历。
 */
export interface GraphEdge {
  source: string;
  target: string;
  type: 'prerequisite' | 'related';
}

export interface DomainMeta {
  id: string;
  label: string;
  order: number;
  node_count: number;
}

export interface GraphStats {
  node_count: number;
  edge_count: number;
  prerequisite_edge_count: number;
  related_edge_count: number;
  domain_count: number;
  pm_core_count: number;
  pm_useful_count: number;
}

export interface GraphJson {
  version: number;
  generated_at: string;
  edge_semantics: string;
  domains: DomainMeta[];
  pm_domains: PmDomainMeta[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
}

export interface PathStep {
  id: string;
  note: string | null;
  title: string | null;
  domain: string | null;
}

export interface LearningPath {
  id: string;
  title: string;
  summary: string;
  audience: string;
  updated_at: string;
  steps: PathStep[];
  file: string;
}

export interface PathsJson {
  version: number;
  generated_at: string;
  paths: LearningPath[];
}

/** L2/L3 正文，按节点 id 索引 */
export interface ContentEntry {
  id: string;
  /** L2：`## 直觉` 小节的 Markdown 原文 */
  l2: string;
  /** L3：`## 细节` 小节的 Markdown 原文 */
  l3: string;
}

export interface ContentJson {
  version: number;
  generated_at: string;
  node_count: number;
  nodes: Record<string, ContentEntry>;
}

/** v2：案例正文五节（`## 场景背景` 等五节的 Markdown 原文，键名由构建期映射） */
export interface CaseSections {
  background: string;
  decision_points: string;
  process: string;
  outcome: string;
  interview_pitch: string;
}

export interface CaseItem {
  id: string;
  title: string;
  /** 行业 / 产品场景，如「电商客服」 */
  industry: string;
  /** 所属 PM 能力域（pm-domains.json 的 id） */
  domains: string[];
  /** 挂靠的知识节点 id（≥3，构建期保证不悬空） */
  nodes: string[];
  tags: string[];
  sources: SourceLink[];
  updated_at: string;
  sections: CaseSections;
  file: string;
}

export interface CasesJson {
  version: number;
  generated_at: string;
  case_count: number;
  cases: CaseItem[];
}

/** v2：面试题正文三节 */
export interface QuestionSections {
  good_answer: string;
  wrong_answers: string;
  follow_ups: string;
}

export interface InterviewQuestion {
  id: string;
  /** 问题原文 */
  question: string;
  /** 八类分组之一（schema 枚举） */
  category: string;
  frequency: '高频' | '常见' | '偶见';
  /** 复习节点 id（≥1，构建期保证不悬空） */
  nodes: string[];
  updated_at: string;
  sections: QuestionSections;
  file: string;
}

export interface InterviewJson {
  version: number;
  generated_at: string;
  question_count: number;
  questions: InterviewQuestion[];
}

export interface SiteData {
  graph: GraphJson;
  paths: PathsJson;
  content: ContentJson;
  cases: CasesJson;
  interview: InterviewJson;
}
