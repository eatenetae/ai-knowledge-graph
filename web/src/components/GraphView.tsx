import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { GraphEdge, GraphJson } from '../types';
import type { Layout } from '../lib/layout';
import { X_GAP } from '../lib/layout';
import { domainCssVars, domainHue } from '../lib/domains';

export interface Point {
  x: number;
  y: number;
}

interface GraphViewProps {
  graph: GraphJson;
  layout: Layout;
  selectedId: string | null;
  /** 聚焦模式下要保留的节点集合；null 表示不做淡化 */
  focusIds: Set<string> | null;
  /** 用户拖动过的节点位置，覆盖布局算出来的坐标 */
  overrides: Map<string, Point>;
  onMoveNode: (id: string, point: Point) => void;
  onSelect: (id: string) => void;
  /** 点空白处（没有拖动）时收起卡片 */
  onBackgroundClick: () => void;
}

interface Viewport {
  x: number;
  y: number;
  k: number;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.6;
const FIT_PADDING = 72;
/** 超过这个像素的位移才算拖拽，否则当点击——不然轻轻一抖就选不中节点 */
const DRAG_THRESHOLD = 4;

export function GraphView({
  graph,
  layout,
  selectedId,
  focusIds,
  overrides,
  onMoveNode,
  onSelect,
  onBackgroundClick,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 960, height: 640 });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, k: 1 });
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // 指针状态全放在 ref 里：拖拽过程中每帧都会读，走 state 会引入不必要的重渲染
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<
    | { mode: 'pan'; startViewport: Viewport; start: Point; moved: boolean }
    | { mode: 'node'; id: string; start: Point; origin: Point; moved: boolean }
    | { mode: 'pinch'; distance: number; midpoint: Point; startViewport: Viewport }
    | null
  >(null);

  const positionOf = useCallback(
    (id: string): Point => {
      const override = overrides.get(id);
      if (override) return override;
      const node = layout.nodes.get(id);
      return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
    },
    [layout, overrides],
  );

  const nodes = useMemo(
    () => graph.nodes.filter((node) => layout.nodes.has(node.id)),
    [graph.nodes, layout],
  );

  /** 当前该被框进视野的节点：聚焦时只看依赖子图，否则看全图 */
  const visibleIds = useMemo(() => {
    if (!focusIds) return nodes.map((node) => node.id);
    return nodes.map((node) => node.id).filter((id) => focusIds.has(id));
  }, [nodes, focusIds]);

  const fitTo = useCallback(
    (ids: string[], animated: boolean) => {
      if (ids.length === 0) return;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const id of ids) {
        const point = positionOf(id);
        const radius = layout.nodes.get(id)?.radius ?? 16;
        minX = Math.min(minX, point.x - radius);
        minY = Math.min(minY, point.y - radius);
        maxX = Math.max(maxX, point.x + radius);
        maxY = Math.max(maxY, point.y + radius);
      }

      const boxWidth = Math.max(1, maxX - minX);
      const boxHeight = Math.max(1, maxY - minY);
      const available = {
        width: Math.max(1, size.width - FIT_PADDING * 2),
        height: Math.max(1, size.height - FIT_PADDING * 2),
      };

      const k = clamp(
        Math.min(available.width / boxWidth, available.height / boxHeight),
        MIN_SCALE,
        MAX_SCALE,
      );
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      setViewport({
        k,
        x: size.width / 2 - k * centerX,
        y: size.height / 2 - k * centerY,
      });
      if (animated) {
        // 由 CSS transition 负责过渡，这里只要保证 transform 是干净的
      }
    },
    [layout, positionOf, size.height, size.width],
  );

  // 容器尺寸跟随窗口变化，否则移动端横竖屏切换后视野会错位
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.width > 0 && box.height > 0) {
        setSize({ width: box.width, height: box.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 首次拿到尺寸、以及切换聚焦目标时，自动把该看的东西框进视野
  const focusedKey = focusIds ? [...focusIds].sort().join(',') : '*';
  const fittedRef = useRef('');
  useEffect(() => {
    const key = `${focusedKey}|${size.width}x${size.height}`;
    if (fittedRef.current === key) return;
    fittedRef.current = key;
    fitTo(visibleIds, false);
  }, [fitTo, focusedKey, size.height, size.width, visibleIds]);

  const zoomAt = useCallback((factor: number, origin: Point) => {
    setViewport((current) => {
      const k = clamp(current.k * factor, MIN_SCALE, MAX_SCALE);
      const ratio = k / current.k;
      return {
        k,
        x: origin.x - (origin.x - current.x) * ratio,
        y: origin.y - (origin.y - current.y) * ratio,
      };
    });
  }, []);

  // React 的 onWheel 是被动监听，preventDefault 会被忽略——必须自己挂原生监听
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0016);
      zoomAt(factor, { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const localPoint = (event: React.PointerEvent): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handleBackgroundPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const point = localPoint(event);
    pointers.current.set(event.pointerId, point);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        mode: 'pinch',
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        startViewport: viewport,
      };
      return;
    }

    svgRef.current?.setPointerCapture(event.pointerId);
    gesture.current = { mode: 'pan', startViewport: viewport, start: point, moved: false };
  };

  const handleNodePointerDown = (event: React.PointerEvent<SVGGElement>, id: string) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.stopPropagation();
    const point = localPoint(event);
    pointers.current.set(event.pointerId, point);
    svgRef.current?.setPointerCapture(event.pointerId);
    setDraggingId(id);
    gesture.current = { mode: 'node', id, start: point, origin: positionOf(id), moved: false };
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active) return;

    const point = localPoint(event);
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, point);

    if (active.mode === 'pinch') {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (active.distance === 0) return;
      const k = clamp(
        (active.startViewport.k * distance) / active.distance,
        MIN_SCALE,
        MAX_SCALE,
      );
      const ratio = k / active.startViewport.k;
      setViewport({
        k,
        x: midpoint.x - (active.midpoint.x - active.startViewport.x) * ratio,
        y: midpoint.y - (active.midpoint.y - active.startViewport.y) * ratio,
      });
      return;
    }

    const dx = point.x - active.start.x;
    const dy = point.y - active.start.y;
    if (!active.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) active.moved = true;

    if (active.mode === 'pan') {
      if (!active.moved) return;
      setViewport({
        k: active.startViewport.k,
        x: active.startViewport.x + dx,
        y: active.startViewport.y + dy,
      });
      return;
    }

    // 节点拖拽：屏幕位移换算回布局坐标，缩放多少就除以多少
    onMoveNode(active.id, {
      x: active.origin.x + dx / viewport.k,
      y: active.origin.y + dy / viewport.k,
    });
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    pointers.current.delete(event.pointerId);
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }

    if (active?.mode === 'node') {
      // 位移很小说明用户只是想选中，不是想挪动
      if (!active.moved) onSelect(active.id);
      setDraggingId(null);
    } else if (active?.mode === 'pan' && !active.moved) {
      // 在空白处点一下（而不是拖）＝ 收起卡片
      onBackgroundClick();
    }
    if (pointers.current.size === 0) gesture.current = null;
  };

  /**
   * 键盘在图里「走」：按方向键跳到该方向上最近的节点。
   * 这是「全部交互可用键盘完成」里最容易漏掉的一环——只有 Tab 的话，
   * 60 个节点要按 60 次才能到目标。
   */
  const handleNodeKeyDown = (event: React.KeyboardEvent<SVGGElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(id);
      return;
    }
    const directions: Record<string, Point> = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();

    const from = positionOf(id);
    let best: { id: string; score: number } | null = null;

    for (const candidate of nodes) {
      if (candidate.id === id) continue;
      const point = positionOf(candidate.id);
      const dx = point.x - from.x;
      const dy = point.y - from.y;
      const forward = dx * direction.x + dy * direction.y;
      if (forward <= 0) continue; // 只往按下的方向找
      const lateral = Math.abs(dx * direction.y - dy * direction.x);
      const score = forward + lateral * 2.5; // 偏离方向越多越不优先
      if (!best || score < best.score) best = { id: candidate.id, score };
    }

    if (best) focusNodeElement(best.id);
  };

  const edgeElements = useMemo(
    () => graph.edges.filter((edge) => layout.nodes.has(edge.source) && layout.nodes.has(edge.target)),
    [graph.edges, layout],
  );

  const isDimmed = (id: string) => focusIds !== null && !focusIds.has(id);

  /**
   * 标签在屏幕上保持恒定大小，不跟着缩放一起变小。
   *
   * 整张图适配窗口时缩放系数只有 0.5 上下，标签要是跟着缩就成了 6px 的糊字——
   * 那正是「看不清、干脆不看」的开始。所以字号在布局坐标里写成「目标像素 / k」，
   * 渲染到屏幕上正好回到目标像素；放大时让它缓慢变大一点，免得贴在巨大的圆下面显小。
   *
   * 能显示几个字按**屏幕上的实际间距**算：缩得越小每个槽位越窄，留的字就越少，
   * 标签之间永远不会叠在一起。
   */
  const screenLabelSize = Math.min(18, Math.max(12, 12 * Math.sqrt(viewport.k)));
  const labelSize = screenLabelSize / viewport.k;
  const labelOffset = (radius: number) => radius + (screenLabelSize + 6) / viewport.k;
  const labelChars = Math.min(
    11,
    Math.max(3, Math.floor((X_GAP * viewport.k) / (screenLabelSize * 1.08))),
  );

  const edgeOpacity = (edge: GraphEdge) => {
    if (focusIds === null) return edge.type === 'related' ? 0.35 : 0.6;
    const inside = focusIds.has(edge.source) && focusIds.has(edge.target);
    return inside ? (edge.type === 'related' ? 0.5 : 0.9) : 0.07;
  };

  const cssVars = useMemo(
    () => domainCssVars(graph.domains.map((domain) => domain.id)) as React.CSSProperties,
    [graph.domains],
  );

  return (
    <div className="graph" ref={containerRef}>
      <svg
        ref={svgRef}
        className="graph-svg"
        style={cssVars}
        role="application"
        aria-label={`知识图谱，共 ${nodes.length} 个节点`}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <defs>
          <marker
            id="akg-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="arrow-head" />
          </marker>
        </defs>

        <g
          className="graph-layer"
          transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.k})`}
        >
          <g className="edges">
            {edgeElements.map((edge) => {
              const from = positionOf(edge.source);
              const to = positionOf(edge.target);
              const fromRadius = layout.nodes.get(edge.source)?.radius ?? 16;
              const toRadius = layout.nodes.get(edge.target)?.radius ?? 16;
              const geometry = segment(from, to, fromRadius, toRadius + 8);
              if (!geometry) return null;

              return (
                <line
                  key={`${edge.type}-${edge.source}-${edge.target}`}
                  className={`edge edge-${edge.type}`}
                  x1={geometry.x1}
                  y1={geometry.y1}
                  x2={geometry.x2}
                  y2={geometry.y2}
                  markerEnd={edge.type === 'prerequisite' ? 'url(#akg-arrow)' : undefined}
                  style={{ opacity: edgeOpacity(edge) }}
                />
              );
            })}
          </g>

          <g className="nodes">
            {nodes.map((node) => {
              const point = positionOf(node.id);
              const layoutNode = layout.nodes.get(node.id)!;
              const dimmed = isDimmed(node.id);
              const selected = node.id === selectedId;

              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  className={[
                    'node',
                    dimmed ? 'is-dimmed' : '',
                    selected ? 'is-selected' : '',
                    draggingId === node.id ? 'is-dragging' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  transform={`translate(${point.x} ${point.y})`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${node.title}。${node.summary}`}
                  aria-pressed={selected}
                  style={{ '--hue': domainHue(node.domain) } as React.CSSProperties}
                  onPointerDown={(event) => handleNodePointerDown(event, node.id)}
                  onKeyDown={(event) => handleNodeKeyDown(event, node.id)}
                >
                  <circle className="node-halo" r={layoutNode.radius + 7 / viewport.k} />
                  <circle className="node-dot" r={layoutNode.radius} />
                  <text
                    className="node-label"
                    y={labelOffset(layoutNode.radius)}
                    textAnchor="middle"
                    style={{
                      fontSize: `${labelSize}px`,
                      strokeWidth: `${3.5 / viewport.k}px`,
                    }}
                  >
                    {truncate(node.title, labelChars)}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      <div className="graph-controls">
        <button type="button" onClick={() => zoomAt(1.25, { x: size.width / 2, y: size.height / 2 })} aria-label="放大">
          ＋
        </button>
        <button type="button" onClick={() => zoomAt(0.8, { x: size.width / 2, y: size.height / 2 })} aria-label="缩小">
          －
        </button>
        <button type="button" onClick={() => fitTo(visibleIds, true)} aria-label="适应窗口">
          ⤢
        </button>
      </div>

      <p className="graph-hint">
        滚轮缩放 · 拖拽空白平移 · 拖拽节点可挪位置 · 方向键在节点间移动
      </p>
    </div>
  );
}

/** 把两个圆之间的连线裁到圆周上，箭头才不会插进圆里 */
function segment(from: Point, to: Point, fromRadius: number, toRadius: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return null;
  const ux = dx / distance;
  const uy = dy / distance;
  return {
    x1: from.x + ux * (fromRadius + 2),
    y1: from.y + uy * (fromRadius + 2),
    x2: to.x - ux * toRadius,
    y2: to.y - uy * toRadius,
  };
}

function truncate(title: string, max = 11): string {
  return title.length > max ? `${title.slice(0, max)}…` : title;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function focusNodeElement(id: string): void {
  const element = document.querySelector<SVGGElement>(`[data-node-id="${CSS.escape(id)}"]`);
  element?.focus();
}
