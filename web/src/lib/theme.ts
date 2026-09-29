import { useCallback, useEffect, useState } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'akg:theme';

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // 隐私模式下 localStorage 会抛异常，退回默认值即可
  }
  return 'system';
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * 亮暗主题：默认跟随系统，手动切换后记住选择。
 * 真正的落点是 `<html data-theme>`，CSS 变量据此切换，React 树不用重渲染颜色。
 */
export function useTheme(): {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  cycle: () => void;
  setMode: (mode: ThemeMode) => void;
} {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [systemValue, setSystemValue] = useState<ResolvedTheme>(systemTheme);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemValue(query.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme = mode === 'system' ? systemValue : mode;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    // 让浏览器原生控件（滚动条、表单）也跟着走
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 存不下就算了，本次会话内仍然生效
    }
  }, []);

  // 三态循环：跟随系统 -> 亮 -> 暗 -> 跟随系统
  const cycle = useCallback(() => {
    setMode(mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system');
  }, [mode, setMode]);

  return { mode, resolved, cycle, setMode };
}
