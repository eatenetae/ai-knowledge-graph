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
