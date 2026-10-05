import { useMemo } from 'react';

import { sortByDependency, type GraphIndex } from '../lib/deps';
import { domainHue } from '../lib/domains';
import { findSprintPath, orderCategories } from '../lib/pm';
import { Markdown } from './Markdown';
import type { InterviewJson, InterviewQuestion, PathsJson } from '../types';

interface InterviewViewProps {
  interview: InterviewJson;
  paths: PathsJson;
  index: GraphIndex;
  activeQuestionId: string | null;
  /** 已掌握的题目 id（localStorage） */
  mastered: string[];
  onToggleMastered: (questionId: string) => void;
  onOpenQuestion: (questionId: string) => void;
  onBackToList: () => void;
  onOpenNode: (nodeId: string) => void;
  onOpenPath: (pathId: string) => void;
}

/** 与产物小节键一一对应的展示顺序与标题 */
const SECTIONS: Array<{ key: keyof InterviewQuestion['sections']; title: string }> = [
  { key: 'good_answer', title: '好答案的要点' },
  { key: 'wrong_answers', title: '常见的错误答案' },
  { key: 'follow_ups', title: '面试官会怎么追问' },
];

/**
 * 面试准备视图：按分组列题，答完勾「已掌握」。
 *
 * 每道题带「复习这些节点」——按依赖顺序排好，前置在前，
 * 答不上来就顺着这个顺序回图谱补课，补完再回来过题。
 */
export function InterviewView({
  interview,
  paths,
  index,
  activeQuestionId,
  mastered,
  onToggleMastered,
  onOpenQuestion,
  onBackToList,
  onOpenNode,
  onOpenPath,
}: InterviewViewProps) {
  const active = useMemo(
    () => interview.questions.find((item) => item.id === activeQuestionId) ?? null,
    [interview.questions, activeQuestionId],
  );

  if (active) {
    return (
      <QuestionDetail
        item={active}
        index={index}
        isMastered={mastered.includes(active.id)}
        onToggleMastered={onToggleMastered}
        onBackToList={onBackToList}
        onOpenNode={onOpenNode}
      />
    );
  }

  return (
    <QuestionList
      interview={interview}
      paths={paths}
      mastered={mastered}
      onOpenQuestion={onOpenQuestion}
      onOpenPath={onOpenPath}
    />
  );
}

function QuestionList({
  interview,
  paths,
  mastered,
  onOpenQuestion,
  onOpenPath,
}: {
  interview: InterviewJson;
  paths: PathsJson;
  mastered: string[];
  onOpenQuestion: (questionId: string) => void;
  onOpenPath: (pathId: string) => void;
}) {
  const masteredSet = useMemo(() => new Set(mastered), [mastered]);

  const groups = useMemo(() => {
    const byCategory = new Map<string, InterviewQuestion[]>();
    for (const question of interview.questions) {
      const list = byCategory.get(question.category);
      if (list) list.push(question);
      else byCategory.set(question.category, [question]);
    }
    return orderCategories(byCategory.keys()).map((category) => ({
      category,
      questions: byCategory.get(category)!,
    }));
  }, [interview.questions]);

  const sprint = findSprintPath(paths.paths);
  const highFrequency = interview.questions.filter((item) => item.frequency === '高频').length;

  return (
    <div className="interview">
      <header className="interview-head">
        <h2>面试准备</h2>
        <p className="interview-lead">
          按真实面试的分组过题：先看「好答案的要点」自查，答得上来就勾掉。
          高频题 {highFrequency} 道，值得先过完。
        </p>

        <div className="interview-sprint">
          {sprint ? (
            <button type="button" onClick={() => onOpenPath(sprint.id)}>
              走「{sprint.title}」学习路径
              <span>只走必修知识点，按面试优先级排好</span>
            </button>
          ) : (
            <button type="button" onClick={() => onOpenPath(paths.paths[0]?.id ?? '')}>
              看学习路径
              <span>系统补课再去过题</span>
            </button>
          )}
        </div>
      </header>

      {groups.map((group) => {
        const done = group.questions.filter((item) => masteredSet.has(item.id)).length;
        return (
          <section key={group.category} className="q-group" aria-labelledby={`q-group-${group.category}`}>
            <header className="q-group-head">
              <h3 id={`q-group-${group.category}`}>{group.category}</h3>
              <span
                className="q-group-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={group.questions.length}
                aria-valuenow={done}
                aria-label={`${group.category} 已掌握`}
              >
                {done} / {group.questions.length}
              </span>
            </header>
            <ul className="q-list">
              {group.questions.map((question) => {
                const isMastered = masteredSet.has(question.id);
                return (
                  <li key={question.id} className={`q-item ${isMastered ? 'is-mastered' : ''}`}>
                    <button
                      type="button"
                      className="q-item-main"
                      onClick={() => onOpenQuestion(question.id)}
                    >
                      <span className={`q-freq is-${frequencyKey(question.frequency)}`}>
                        {question.frequency}
                      </span>
                      <span className="q-text">{question.question}</span>
                    </button>
                    {isMastered && <span className="q-mastered-badge" aria-label="已掌握">✓</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function QuestionDetail({
  item,
  index,
  isMastered,
  onToggleMastered,
  onBackToList,
  onOpenNode,
}: {
  item: InterviewQuestion;
  index: GraphIndex;
  isMastered: boolean;
  onToggleMastered: (questionId: string) => void;
  onBackToList: () => void;
  onOpenNode: (nodeId: string) => void;
}) {
  // 复习节点按依赖顺序排：前置在前，照着从上往下复习就是正确顺序
  const reviewNodes = useMemo(() => {
    const ids = new Set(item.nodes);
    return sortByDependency(index, ids)
      .map((id) => index.byId.get(id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
  }, [index, item.nodes]);

  return (
    <article className="question-detail">
      <button type="button" className="back-link" onClick={onBackToList}>
        ← 返回题库
      </button>

      <header className="question-detail-head">
        <div className="question-detail-meta">
          <span className={`q-freq is-${frequencyKey(item.frequency)}`}>{item.frequency}</span>
          <span className="question-detail-category">{item.category}</span>
        </div>
        <h2>{item.question}</h2>
        <label className="q-mastered-toggle">
          <input
            type="checkbox"
            checked={isMastered}
            onChange={() => onToggleMastered(item.id)}
            aria-label={`把这道题标记为${isMastered ? '未掌握' : '已掌握'}`}
          />
          <span>{isMastered ? '✓ 已掌握' : '答上来了，标为已掌握'}</span>
        </label>
      </header>

      {SECTIONS.map((section) => (
        <section key={section.key} className="question-section" aria-label={section.title}>
          <h3>{section.title}</h3>
          {item.sections[section.key].trim() !== '' ? (
            <Markdown source={item.sections[section.key]} />
          ) : (
            <p className="empty">这一节还没有内容。</p>
          )}
        </section>
      ))}

      <section className="question-review" aria-label="复习这些节点">
        <h3>复习这些节点</h3>
        <p className="question-review-note">按依赖顺序排好——从上往下看，就是补课的顺序。</p>
        <ol className="question-review-list">
          {reviewNodes.map((node, position) => (
            <li key={node.id} style={{ '--hue': domainHue(node.domain) } as React.CSSProperties}>
              <button type="button" onClick={() => onOpenNode(node.id)}>
                <span className="review-index" aria-hidden="true">
                  {position + 1}
                </span>
                <span className="review-main">
                  <span className="review-title">{node.title}</span>
                  <span className="review-summary">{node.summary}</span>
                </span>
                <span className="review-go" aria-hidden="true">
                  在图谱中查看 →
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}

/** frequency 是中文枚举，转成可用的 class 名 */
function frequencyKey(frequency: InterviewQuestion['frequency']): string {
  if (frequency === '高频') return 'high';
  if (frequency === '常见') return 'common';
  return 'occasional';
}
