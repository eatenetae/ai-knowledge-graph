/**
 * 本地存储的小封装。
 *
 * 路径进度只存在浏览器里——首版不引入账户，这是有意为之：
 * 「标记已完成」是个人的事，不值得为它拉一套登录。
 */

const PROGRESS_KEY = 'akg:progress';

export type Progress = Record<string, string[]>;

function read(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Progress = {};
    for (const [pathId, steps] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(steps)) {
        out[pathId] = steps.filter((step): step is string => typeof step === 'string');
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function loadProgress(): Progress {
  return read();
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // 存不下不影响本次会话，静默降级
  }
}

export function toggleStep(progress: Progress, pathId: string, nodeId: string): Progress {
  const current = new Set(progress[pathId] ?? []);
  if (current.has(nodeId)) current.delete(nodeId);
  else current.add(nodeId);
  return { ...progress, [pathId]: [...current].sort() };
}

/**
 * v2 的三个勾选清单：必修地图的「已掌握」节点、案例的「已读」、面试题的「已掌握」。
 * 三者形态相同（一串 id），只是 key 不同——所以共用一套读写切换。
 * 与路径进度同样只存浏览器本地，理由同上。
 */
export const LEARNED_KEY = 'akg:learned';
export const CASES_READ_KEY = 'akg:cases-read';
export const MASTERED_KEY = 'akg:mastered';

function readIdList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export function loadIdList(key: string): string[] {
  return readIdList(key);
}

export function saveIdList(key: string, ids: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify([...ids].sort()));
  } catch {
    // 存不下不影响本次会话，静默降级
  }
}

export function toggleIdInList(list: string[], id: string): string[] {
  const current = new Set(list);
  if (current.has(id)) current.delete(id);
  else current.add(id);
  return [...current].sort();
}
