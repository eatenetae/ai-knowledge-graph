import { useCallback, useEffect, useState } from 'react';

/**
 * 极简 hash 路由。
 *
 * 存在的理由很实际：路径视图里点一步要「跳转到图谱视图对应节点」，
 * 而且用户会想把某个知识点的链接直接发给同事。hash 不需要服务端配合，
 * 静态托管（包括 file:// 之外的任意子路径）都能用。
 *
 *   #/n/<node-id>    图谱视图 + 打开该节点的卡片
 *   #/p/<path-id>    路径视图 + 选中该路径
 *   #/paths          路径视图
 *   #/               图谱视图
 */
export type Route =
  | { view: 'graph'; nodeId: string | null }
  | { view: 'paths'; pathId: string | null };

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [head, value] = clean.split('/');

  if (head === 'paths') return { view: 'paths', pathId: null };
  if (head === 'p' && value) return { view: 'paths', pathId: decodeURIComponent(value) };
  if (head === 'n' && value) return { view: 'graph', nodeId: decodeURIComponent(value) };
  return { view: 'graph', nodeId: null };
}

export function routeToHash(route: Route): string {
  if (route.view === 'paths') {
    return route.pathId ? `#/p/${encodeURIComponent(route.pathId)}` : '#/paths';
  }
  return route.nodeId ? `#/n/${encodeURIComponent(route.nodeId)}` : '#/';
}

export function useHashRoute(): [Route, (next: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    const hash = routeToHash(next);
    if (window.location.hash === hash) {
      setRoute(next); // hash 没变时不会触发 hashchange，手动同步一次
      return;
    }
    window.location.hash = hash;
  }, []);

  return [route, navigate];
}
