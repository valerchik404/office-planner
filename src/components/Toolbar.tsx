import { useStore } from '../store';
import type { Tool } from '../types';
import { FURNITURE_META, FURNITURE_TYPES } from '../furniture';

const BASE_TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: 'select', icon: '🖱️', label: 'Выбор' },
  { id: 'wall', icon: '🧱', label: 'Стена' },
  { id: 'window', icon: '🪟', label: 'Окно' },
  { id: 'door', icon: '🚪', label: 'Дверь' },
  { id: 'passage', icon: '⬜', label: 'Проём' },
  { id: 'note', icon: '📝', label: 'Надпись' },
];

const TOOLS: { id: Tool; icon: string; label: string }[] = [
  ...BASE_TOOLS,
  ...FURNITURE_TYPES.map((t) => ({ id: t as Tool, icon: FURNITURE_META[t].icon, label: FURNITURE_META[t].name })),
];

export default function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const readOnly = useStore((s) => s.readOnly);
  return (
    <aside className="toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={tool === t.id ? 'tool active' : 'tool'}
          onClick={() => setTool(t.id)}
          disabled={readOnly && t.id !== 'select'}
          title={readOnly && t.id !== 'select' ? 'Недоступно в режиме просмотра' : t.label}
        >
          <span className="tool-icon">{t.icon}</span>
          <span className="tool-label">{t.label}</span>
        </button>
      ))}
    </aside>
  );
}
