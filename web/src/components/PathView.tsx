import { useMemo } from 'react';

import type { GraphIndex } from '../lib/deps';
import type { LearningPath, PathsJson } from '../types';

interface PathViewProps {
  paths: PathsJson;
  index: GraphIndex;
  activePathId: string | null;
  progress: Record<string, string[]>;
  onSelectPath: (pathId: string) => void;
  onToggleStep: (pathId: string, nodeId: string) => void;
  onOpenNode: (nodeId: string) => void;
}

/**
 * 路径视图：图谱给全局方向感，路径给线性行动力。
 *
 * 每一步都带序号、标题和 L1 一句话——用户不用点进去就知道这一步要学什么，
 * 这样「今天学哪一步」是个可以在一屏内做完的决定。
 */
export function PathView({
  paths,
  index,
  activePathId,
  progress,
  onSelectPath,
  onToggleStep,
  onOpenNode,
}: PathViewProps) {
  const active = useMemo(
    () => paths.paths.find((path) => path.id === activePathId) ?? paths.paths[0] ?? null,
    [paths.paths, activePathId],
  );

  if (!active) {
    return <p className="empty">还没有任何学习路径。</p>;
  }

  return (
    <div className="paths">
      <nav className="path-tabs" aria-label="学习路径">
        {paths.paths.map((path) => (
          <button
            key={path.id}
            type="button"
            className={path.id === active.id ? 'is-active' : ''}
            aria-current={path.id === active.id}
            onClick={() => onSelectPath(path.id)}
          >
            {path.title}
          </button>
        ))}
      </nav>

      <PathDetail
        path={active}
        index={index}
        done={progress[active.id] ?? []}
        onToggleStep={onToggleStep}
        onOpenNode={onOpenNode}
      />
    </div>
  );
}

function PathDetail({
  path,
  index,
  done,
  onToggleStep,
  onOpenNode,
}: {
  path: LearningPath;
  index: GraphIndex;
  done: string[];
  onToggleStep: (pathId: string, nodeId: string) => void;
  onOpenNode: (nodeId: string) => void;
}) {
  const doneSet = new Set(done);
  // 只统计仍然存在的节点，内容改过之后进度不会算出一个超过 100% 的比例
  const validSteps = path.steps.filter((step) => index.byId.has(step.id));
  const finished = validSteps.filter((step) => doneSet.has(step.id)).length;
  const percent = validSteps.length === 0 ? 0 : Math.round((finished / validSteps.length) * 100);

  return (
    <section className="path-detail" aria-label={path.title}>
      <header className="path-head">
        <h2>{path.title}</h2>
        <p className="path-summary">{path.summary}</p>
        <p className="path-audience">写给：{path.audience}</p>

        <div className="path-progress">
          <div
            className="path-progress-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={validSteps.length}
            aria-valuenow={finished}
            aria-label="已完成步骤"
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <span className="path-progress-text">
            {finished} / {validSteps.length} 步
          </span>
        </div>
      </header>

      <ol className="steps">
        {path.steps.map((step, position) => {
          const node = index.byId.get(step.id);
          const isDone = doneSet.has(step.id);

          return (
            <li key={step.id} className={`step ${isDone ? 'is-done' : ''}`}>
              {/* 序号本身就是勾选框：点一下标记完成，不额外占一行 */}
              <label className="step-check">
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => onToggleStep(path.id, step.id)}
                  aria-label={`标记第 ${position + 1} 步「${step.title ?? step.id}」${isDone ? '未完成' : '已完成'}`}
                />
                <span className="step-index" aria-hidden="true">
                  {isDone ? '✓' : position + 1}
                </span>
              </label>

              <div className="step-body">
                <button type="button" className="step-title" onClick={() => onOpenNode(step.id)}>
                  {step.title ?? step.id}
                  <span className="step-jump" aria-hidden="true">
                    在图谱中查看 →
                  </span>
                </button>
                {node && <p className="step-summary">{node.summary}</p>}
                {step.note && <p className="step-note">💡 {step.note}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
