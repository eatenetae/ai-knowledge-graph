import type { CasesJson, GraphJson, InterviewJson } from '../types';

interface HomeViewProps {
  graph: GraphJson;
  cases: CasesJson;
  interview: InterviewJson;
  onOpenMap: () => void;
  onOpenInterview: () => void;
  onOpenCases: () => void;
  onOpenGraph: () => void;
  onOpenPaths: () => void;
}

interface Entry {
  key: string;
  title: string;
  lead: string;
  detail: string;
  stat: string;
  onClick: () => void;
}

/**
 * v2 首页：面向 AI 产品经理的定位页。
 *
 * 三个入口对应成员提的三个需求——理清要学什么（必修地图）、
 * 面试前冲刺（题库）、看具体案例（案例库）。完整图谱和全部路径
 * 收进页尾的次级导航，v1 功能一个不删。
 */
export function HomeView({
  graph,
  cases,
  interview,
  onOpenMap,
  onOpenInterview,
  onOpenCases,
  onOpenGraph,
  onOpenPaths,
}: HomeViewProps) {
  const entries: Entry[] = [
    {
      key: 'map',
      title: '必修地图',
      lead: 'AI 产品经理要懂的知识，按六大能力域排好',
      detail: '每个知识点只有一句话门槛，读完一句话就算过了这一关。',
      stat: `${graph.stats.pm_core_count} 个必修知识点 · ${graph.pm_domains.length} 大能力域`,
      onClick: onOpenMap,
    },
    {
      key: 'interview',
      title: '面试冲刺',
      lead: '高频题先过，每道题告诉你好答案长什么样',
      detail: '答不上来就顺着「复习这些节点」回去补，补完再回来。',
      stat: `${interview.question_count} 道题 · 高频题优先`,
      onClick: onOpenInterview,
    },
    {
      key: 'cases',
      title: '案例库',
      lead: '真实的产品决策复盘：当时怎么权衡、结果如何',
      detail: '读案例是把知识变成判断力的最快方式，面试讲项目也靠它。',
      stat: `${cases.case_count} 个案例 · 覆盖 ${new Set(cases.cases.flatMap((item) => item.domains)).size} 个能力域`,
      onClick: onOpenCases,
    },
  ];

  return (
    <div className="home">
      <section className="hero">
        <p className="hero-eyebrow">写给 AI 产品经理的学习与面试准备站</p>
        <h2 className="hero-title">把 AI 搞懂，再去做 AI 产品</h2>
        <p className="hero-lead">
          不写代码也能学：每个知识点先给你一句话的人话版本，
          想深入再看直觉和细节。学完去题库检验，去案例库看真实决策。
        </p>
      </section>

      <nav className="home-entries" aria-label="三大入口">
        {entries.map((entry) => (
          <button type="button" key={entry.key} className="home-entry" onClick={entry.onClick}>
            <span className="home-entry-title">{entry.title}</span>
            <span className="home-entry-lead">{entry.lead}</span>
            <span className="home-entry-detail">{entry.detail}</span>
            <span className="home-entry-stat">{entry.stat}</span>
            <span className="home-entry-go" aria-hidden="true">
              进入 →
            </span>
          </button>
        ))}
      </nav>

      <section className="home-secondary">
        <h3>想看全貌的时候</h3>
        <div className="home-secondary-links">
          <button type="button" onClick={onOpenGraph}>
            完整知识图谱
            <span>{graph.stats.node_count} 个知识点连成一张依赖图，看清先学什么后学什么</span>
          </button>
          <button type="button" onClick={onOpenPaths}>
            学习路径
            <span>按角色排好的线性路线，想系统学就顺着走</span>
          </button>
        </div>
        <p className="home-hint">顶栏的搜索框能同时搜知识点、案例和面试题。</p>
      </section>
    </div>
  );
}
