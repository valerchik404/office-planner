import { useStore } from '../store';
import type { Tool } from '../types';

const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: 'select', icon: '🖱️', label: 'Выбор' },
  { id: 'wall', icon: '🧱', label: 'Стена' },
  { id: 'window', icon: '🪟', label: 'Окно' },
  { id: 'door', icon: '🚪', label: 'Дверь' },
  { id: 'passage', icon: '⬜', label: 'Проём' },
  { id: 'desk', icon: '🖥️', label: 'Стол' },
  { id: 'chair', icon: '🪑', label: 'Стул' },
  { id: 'note', icon: '📝', label: 'Надпись' },
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
