import type { ThemeMode } from '../lib/theme';

const LABELS: Record<ThemeMode, { icon: string; text: string }> = {
  system: { icon: '◐', text: '跟随系统' },
  light: { icon: '☀', text: '亮色' },
  dark: { icon: '☾', text: '暗色' },
};

/** 三态循环：跟随系统 → 亮色 → 暗色 → 跟随系统。 */
export function ThemeToggle({ mode, onCycle }: { mode: ThemeMode; onCycle: () => void }) {
  const label = LABELS[mode];

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onCycle}
      title={`主题：${label.text}（点击切换）`}
      aria-label={`主题：${label.text}，点击切换`}
    >
      <span aria-hidden="true">{label.icon}</span>
      <span className="theme-text">{label.text}</span>
    </button>
  );
}
