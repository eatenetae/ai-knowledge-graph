import { useCallback, useEffect, useState } from 'react';

/**
 * 极简 hash 路由。
 *
 * 存在的理由很实际：路径视图里点一步要「跳转到图谱视图对应节点」，
 * 而且用户会想把某个知识点的链接直接发给同事。hash 不需要服务端配合，
 * 静态托管（包括 file:// 之外的任意子路径）都能用。
 *
 * v2 起 `#/` 是面向 AI PM 的首页，完整图谱收进次级导航：
 *
 *   #/                PM 首页
 *   #/map             PM 必修地图（六大能力域）
 *   #/cases           案例库列表
 *   #/c/<case-id>     案例详情
 *   #/interview       面试题库（按分组）
 *   #/q/<question-id> 面试题详情
 *   #/graph           完整图谱
 *   #/n/<node-id>     图谱视图 + 打开该节点的卡片
 *   #/paths           路径视图
 *   #/p/<path-id>     路径视图 + 选中该路径
 */
export type Route =
  | { view: 'home' }
  | { view: 'graph'; nodeId: string | null }
  | { view: 'paths'; pathId: string | null }
  | { view: 'map' }
  | { view: 'cases'; caseId: string | null }
  | { view: 'interview'; questionId: string | null };

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [head, value] = clean.split('/');

  if (head === 'paths') return { view: 'paths', pathId: null };
  if (head === 'p' && value) return { view: 'paths', pathId: decodeURIComponent(value) };
  if (head === 'n' && value) return { view: 'graph', nodeId: decodeURIComponent(value) };
  if (head === 'graph') return { view: 'graph', nodeId: null };
  if (head === 'map') return { view: 'map' };
  if (head === 'cases') return { view: 'cases', caseId: null };
  if (head === 'c' && value) return { view: 'cases', caseId: decodeURIComponent(value) };
  if (head === 'interview') return { view: 'interview', questionId: null };
  if (head === 'q' && value) {
    return { view: 'interview', questionId: decodeURIComponent(value) };
  }
  // v1 的 `#/` 是图谱视图。v2 把首页让给 PM 定位，老链接 `#/n/<id>` 原样可用，
  // 只有裸 `#/` 落到首页——这是再定位的本意，不是丢功能：图谱在次级导航第一位。
  return { view: 'home' };
}

export function routeToHash(route: Route): string {
  switch (route.view) {
    case 'paths':
      return route.pathId ? `#/p/${encodeURIComponent(route.pathId)}` : '#/paths';
    case 'graph':
      return route.nodeId ? `#/n/${encodeURIComponent(route.nodeId)}` : '#/graph';
    case 'map':
      return '#/map';
    case 'cases':
      return route.caseId ? `#/c/${encodeURIComponent(route.caseId)}` : '#/cases';
    case 'interview':
      return route.questionId ? `#/q/${encodeURIComponent(route.questionId)}` : '#/interview';
    case 'home':
      return '#/';
  }
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
