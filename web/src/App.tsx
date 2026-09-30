import { useCallback, useEffect, useMemo, useState } from 'react';

import { GraphView, type Point } from './components/GraphView';
import { NodeListFallback } from './components/NodeListFallback';
import { NodePanel } from './components/NodePanel';
import { PathView } from './components/PathView';
import { SearchBox } from './components/SearchBox';
import { ThemeToggle } from './components/ThemeToggle';
import { buildIndex } from './lib/deps';
import { loadSiteData } from './lib/data';
import { domainCssVars, domainHue } from './lib/domains';
import { computeLayout } from './lib/layout';
import { useHashRoute } from './lib/route';
import { loadProgress, saveProgress, toggleStep, type Progress } from './lib/storage';
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

  const { graph, paths, content } = state.data;
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

        <SearchBox index={index!} domains={graph.domains} onOpenNode={openNode} />

        <div className="topbar-actions">
          <nav className="view-tabs" aria-label="视图">
            <button
              type="button"
              className={view === 'graph' ? 'is-active' : ''}
              aria-current={view === 'graph'}
              onClick={() => navigate({ view: 'graph', nodeId: selectedId })}
            >
              图谱
            </button>
            <button
              type="button"
              className={view === 'paths' ? 'is-active' : ''}
              aria-current={view === 'paths'}
              onClick={() => navigate({ view: 'paths', pathId: route.view === 'paths' ? route.pathId : null })}
            >
              路径
            </button>
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
        ) : (
          <PathView
            paths={paths}
            index={index!}
            activePathId={route.view === 'paths' ? route.pathId : null}
            progress={progress}
            onSelectPath={(pathId) => navigate({ view: 'paths', pathId })}
            onToggleStep={onToggleStep}
            onOpenNode={openNode}
          />
        )}

        {selectedNode && (
          <NodePanel
            key={selectedNode.id}
            node={selectedNode}
            content={content.nodes[selectedNode.id]}
            index={index!}
            domains={graph.domains}
            focusOn={focusOn}
            onToggleFocus={setFocusOn}
            onSelect={openNode}
            onClose={closePanel}
          />
        )}
      </main>
    </div>
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
