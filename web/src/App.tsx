import { useCallback, useEffect, useMemo, useState } from 'react';

import { CasesView } from './components/CasesView';
import { GraphView, type Point } from './components/GraphView';
import { HomeView } from './components/HomeView';
import { InterviewView } from './components/InterviewView';
import { NodeListFallback } from './components/NodeListFallback';
import { NodePanel } from './components/NodePanel';
import { PathView } from './components/PathView';
import { PmMapView } from './components/PmMapView';
import { SearchBox } from './components/SearchBox';
import { ThemeToggle } from './components/ThemeToggle';
import { buildIndex } from './lib/deps';
import { loadSiteData } from './lib/data';
import { domainCssVars, domainHue } from './lib/domains';
import { computeLayout } from './lib/layout';
import { buildCasesByNode } from './lib/pm';
import { useHashRoute } from './lib/route';
import { buildSearchItems } from './lib/search';
import {
  CASES_READ_KEY,
  LEARNED_KEY,
  MASTERED_KEY,
  loadIdList,
  loadProgress,
  saveIdList,
  saveProgress,
  toggleIdInList,
  toggleStep,
  type Progress,
} from './lib/storage';
import { useTheme } from './lib/theme';
import type { SiteData } from './types';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: SiteData }
  | { status: 'error'; message: string };

export function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [route, navigate] = useHashRoute();
  const [focusOn, setFocusOn] = useState(true);
  const [overrides, setOverrides] = useState<Map<string, Point>>(() => new Map());
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [learned, setLearned] = useState<string[]>(() => loadIdList(LEARNED_KEY));
  const [readCases, setReadCases] = useState<string[]>(() => loadIdList(CASES_READ_KEY));
  const [mastered, setMastered] = useState<string[]>(() => loadIdList(MASTERED_KEY));
  const theme = useTheme();

  useEffect(() => {
    let cancelled = false;
    loadSiteData()
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = state.status === 'ready' ? state.data : null;

  const index = useMemo(() => (ready ? buildIndex(ready.graph) : null), [ready]);
  const layout = useMemo(
    () => (ready && index ? computeLayout(ready.graph, index) : null),
    [ready, index],
  );
  const searchItems = useMemo(
    () => (ready ? buildSearchItems(ready.graph, ready.cases, ready.interview) : []),
    [ready],
  );
  const casesByNode = useMemo(() => (ready ? buildCasesByNode(ready.cases) : null), [ready]);

  const selectedId = route.view === 'graph' ? route.nodeId : null;
  const selectedNode = selectedId && index ? index.byId.get(selectedId) ?? null : null;

  /** 聚焦模式下要保留的节点：沿 prerequisite 边反向走出来的整棵依赖子树 */
  const focusIds = useMemo(() => {
    if (!index || !selectedNode || !focusOn) return null;
    const ids = new Set<string>([selectedNode.id]);
    const stack = [selectedNode.id];
    while (stack.length > 0) {
      const id = stack.pop()!;
      for (const prereq of index.prereqsOf.get(id) ?? []) {
        if (ids.has(prereq)) continue;
        ids.add(prereq);
        stack.push(prereq);
      }
    }
    return ids;
  }, [focusOn, index, selectedNode]);

  const openNode = useCallback((id: string) => navigate({ view: 'graph', nodeId: id }), [navigate]);
  const closePanel = useCallback(() => navigate({ view: 'graph', nodeId: null }), [navigate]);
  const openCase = useCallback(
    (id: string) => navigate({ view: 'cases', caseId: id }),
    [navigate],
  );
  const openQuestion = useCallback(
    (id: string) => navigate({ view: 'interview', questionId: id }),
    [navigate],
  );

  const onSearchSelect = useCallback(
    (item: { kind: 'node' | 'case' | 'question'; id: string }) => {
      if (item.kind === 'node') openNode(item.id);
      else if (item.kind === 'case') openCase(item.id);
      else openQuestion(item.id);
    },
    [openNode, openCase, openQuestion],
  );

  const onMoveNode = useCallback((id: string, point: Point) => {
    setOverrides((current) => new Map(current).set(id, point));
  }, []);

  const onToggleStep = useCallback((pathId: string, nodeId: string) => {
    setProgress((current) => {
      const next = toggleStep(current, pathId, nodeId);
      saveProgress(next);
      return next;
    });
  }, []);

  // 三个勾选清单共用一套「切换 + 落盘」，与路径进度的写法保持一致
  const onToggleLearned = useCallback((nodeId: string) => {
    setLearned((current) => {
      const next = toggleIdInList(current, nodeId);
      saveIdList(LEARNED_KEY, next);
      return next;
    });
  }, []);

  const onToggleRead = useCallback((caseId: string) => {
    setReadCases((current) => {
      const next = toggleIdInList(current, caseId);
      saveIdList(CASES_READ_KEY, next);
      return next;
    });
  }, []);

  const onToggleMastered = useCallback((questionId: string) => {
    setMastered((current) => {
      const next = toggleIdInList(current, questionId);
      saveIdList(MASTERED_KEY, next);
      return next;
    });
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="shell">
        <p className="status">正在加载图谱数据…</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="shell">
        <div className="status status-error" role="alert">
          <h1>图谱没能加载</h1>
          <pre>{state.message}</pre>
        </div>
      </div>
    );
  }

  const { graph, paths, content, cases, interview } = state.data;
  const view = route.view;
  const cssVars = domainCssVars(graph.domains.map((domain) => domain.id)) as React.CSSProperties;

  return (
    <div className="shell" style={cssVars}>
      <header className="topbar">
        <div className="brand">
          <h1>AI 知识图谱</h1>
          <p>
            {graph.stats.node_count} 个知识点 · {graph.stats.domain_count} 个领域 ·{' '}
            {paths.paths.length} 条学习路径
          </p>
        </div>

        <SearchBox items={searchItems} onSelect={onSearchSelect} />

        <div className="topbar-actions">
          {/* v2：PM 视图是主入口，完整图谱与路径收进次级导航 */}
          <nav className="view-tabs" aria-label="主要视图">
            <NavTab active={view === 'home'} onClick={() => navigate({ view: 'home' })}>
              首页
            </NavTab>
            <NavTab active={view === 'map'} onClick={() => navigate({ view: 'map' })}>
              必修地图
            </NavTab>
            <NavTab active={view === 'cases'} onClick={() => navigate({ view: 'cases', caseId: null })}>
              案例库
            </NavTab>
            <NavTab
              active={view === 'interview'}
              onClick={() => navigate({ view: 'interview', questionId: null })}
            >
              面试准备
            </NavTab>
          </nav>
          <nav className="view-tabs view-tabs-secondary" aria-label="完整视图">
            <NavTab active={view === 'graph'} onClick={() => navigate({ view: 'graph', nodeId: selectedId })}>
              图谱
            </NavTab>
            <NavTab
              active={view === 'paths'}
              onClick={() => navigate({ view: 'paths', pathId: route.view === 'paths' ? route.pathId : null })}
            >
              路径
            </NavTab>
          </nav>
          <ThemeToggle mode={theme.mode} onCycle={theme.cycle} />
        </div>
      </header>

      <main className="stage">
        {view === 'graph' ? (
          <>
            <div className="graph-pane">
              <div className="graph-desktop">
                <GraphView
                  graph={graph}
                  layout={layout!}
                  selectedId={selectedId}
                  focusIds={focusIds}
                  overrides={overrides}
                  onMoveNode={onMoveNode}
                  onSelect={openNode}
                  onBackgroundClick={closePanel}
                />
              </div>
              <div className="graph-mobile">
                <NodeListFallback
                  index={index!}
                  domains={graph.domains}
                  selectedId={selectedId}
                  focusIds={focusIds}
                  onSelect={openNode}
                />
              </div>

              {overrides.size > 0 && (
                <button type="button" className="reset-layout" onClick={() => setOverrides(new Map())}>
                  恢复自动布局
                </button>
              )}

              <Legend domains={graph.domains} />
            </div>
          </>
        ) : view === 'paths' ? (
          <PathView
            paths={paths}
            index={index!}
            activePathId={route.pathId}
            progress={progress}
            onSelectPath={(pathId) => navigate({ view: 'paths', pathId })}
            onToggleStep={onToggleStep}
            onOpenNode={openNode}
          />
        ) : view === 'map' ? (
          <PmMapView
            graph={graph}
            index={index!}
            learned={learned}
            onToggleLearned={onToggleLearned}
            onOpenNode={openNode}
          />
        ) : view === 'cases' ? (
          <CasesView
            cases={cases}
            pmDomains={graph.pm_domains}
            index={index!}
            activeCaseId={route.caseId}
            readCases={readCases}
            onToggleRead={onToggleRead}
            onOpenCase={openCase}
            onBackToList={() => navigate({ view: 'cases', caseId: null })}
            onOpenNode={openNode}
          />
        ) : view === 'interview' ? (
          <InterviewView
            interview={interview}
            paths={paths}
            index={index!}
            activeQuestionId={route.questionId}
            mastered={mastered}
            onToggleMastered={onToggleMastered}
            onOpenQuestion={openQuestion}
            onBackToList={() => navigate({ view: 'interview', questionId: null })}
            onOpenNode={openNode}
            onOpenPath={(pathId) => navigate({ view: 'paths', pathId })}
          />
        ) : (
          <HomeView
            graph={graph}
            cases={cases}
            interview={interview}
            onOpenMap={() => navigate({ view: 'map' })}
            onOpenInterview={() => navigate({ view: 'interview', questionId: null })}
            onOpenCases={() => navigate({ view: 'cases', caseId: null })}
            onOpenGraph={() => navigate({ view: 'graph', nodeId: null })}
            onOpenPaths={() => navigate({ view: 'paths', pathId: null })}
          />
        )}

        {selectedNode && (
          <NodePanel
            key={selectedNode.id}
            node={selectedNode}
            content={content.nodes[selectedNode.id]}
            index={index!}
            domains={graph.domains}
            relatedCases={casesByNode?.get(selectedNode.id) ?? []}
            focusOn={focusOn}
            onToggleFocus={setFocusOn}
            onSelect={openNode}
            onOpenCase={openCase}
            onClose={closePanel}
          />
        )}
      </main>
    </div>
  );
}

function NavTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={active ? 'is-active' : ''} aria-current={active} onClick={onClick}>
      {children}
    </button>
  );
}

function Legend({ domains }: { domains: SiteData['graph']['domains'] }) {
  return (
    <ul className="legend" aria-label="领域图例">
      {domains.map((domain) => (
        <li key={domain.id}>
          <span
            className="legend-dot"
            style={{ '--hue': domainHue(domain.id) } as React.CSSProperties}
            aria-hidden="true"
          />
          {domain.label}
          <span className="legend-count">{domain.node_count}</span>
        </li>
      ))}
    </ul>
  );
}
