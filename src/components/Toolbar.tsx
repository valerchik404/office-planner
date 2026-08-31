import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { FurnitureType, Tool } from '../types';
import { FURNITURE_CATEGORIES, metaOf } from '../furniture';

interface Item {
  id: Tool;
  icon: string;
  name: string;
  hint?: string;
  size?: string;
}

const OPENING_ITEMS: Item[] = [
  { id: 'window', icon: '🪟', name: 'Окно', hint: 'Стекло с подоконником — сюда светит солнце' },
  { id: 'door', icon: '🚪', name: 'Дверь', hint: 'Проём от пола, высота 2.1 м' },
  { id: 'passage', icon: '⬜', name: 'Проём', hint: 'Открытый проход во всю высоту стены' },
];

const FURNITURE_GROUPS: { title: string; items: Item[] }[] = FURNITURE_CATEGORIES.map((c) => ({
  title: c.name,
  items: c.types.map((t) => {
    const m = metaOf(t as FurnitureType);
    return {
      id: t as Tool,
      icon: m.icon,
      name: m.name,
      hint: m.hint,
      size: `${m.w} × ${m.d} м`,
    };
  }),
}));

const OPENING_IDS = OPENING_ITEMS.map((i) => i.id);
const FURNITURE_IDS = FURNITURE_GROUPS.flatMap((g) => g.items.map((i) => i.id));

export default function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const readOnly = useStore((s) => s.readOnly);
  const [open, setOpen] = useState<'openings' | 'furniture' | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!railRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (id: Tool) => {
    setTool(id);
    setOpen(null);
  };

  const disabled = (id: Tool) => readOnly && id !== 'select';
  const activeOpening = OPENING_IDS.includes(tool);
  const activeFurniture = FURNITURE_IDS.includes(tool);

  const simple = (id: Tool, icon: string, label: string) => (
    <button
      className={tool === id ? 'tool active' : 'tool'}
      onClick={() => { pick(id); }}
      disabled={disabled(id)}
      title={disabled(id) ? 'Недоступно в режиме просмотра' : label}
    >
      <span className="tool-icon">{icon}</span>
      <span className="tool-label">{label}</span>
    </button>
  );

  const groupButton = (
    key: 'openings' | 'furniture', icon: string, label: string, active: boolean,
  ) => (
    <button
      className={`tool tool-group${active ? ' active' : ''}${open === key ? ' open' : ''}`}
      onClick={() => setOpen(open === key ? null : key)}
      disabled={readOnly}
      title={readOnly ? 'Недоступно в режиме просмотра' : label}
    >
      <span className="tool-icon">{icon}</span>
      <span className="tool-label">
        {active
          ? (key === 'furniture' ? metaOf(tool as FurnitureType).name : OPENING_ITEMS.find((i) => i.id === tool)?.name)
          : label}
      </span>
      <span className="tool-caret">›</span>
    </button>
  );

  const itemButton = (it: Item) => (
    <button
      key={it.id}
      className={`palette-item${tool === it.id ? ' active' : ''}`}
      onClick={() => pick(it.id)}
    >
      <span className="palette-icon">{it.icon}</span>
      <span className="palette-text">
        <span className="palette-name">{it.name}</span>
        {(it.hint || it.size) && (
          <span className="palette-hint">{[it.size, it.hint].filter(Boolean).join(' · ')}</span>
        )}
      </span>
    </button>
  );

  return (
    <div className="toolbar-wrap" ref={railRef}>
      <aside className="toolbar">
        {simple('select', '🖱️', 'Выбор')}
        {simple('wall', '🧱', 'Стена')}
        {groupButton('openings', '🪟', 'Проёмы', activeOpening)}
        {groupButton('furniture', '🪑', 'Мебель', activeFurniture)}
        {simple('note', '📝', 'Надпись')}
      </aside>

      {open === 'openings' && (
        <div className="palette">
          <h4>Проёмы в стене</h4>
          <div className="palette-list">{OPENING_ITEMS.map(itemButton)}</div>
          <p className="palette-note">Ставится кликом по стене.</p>
        </div>
      )}

      {open === 'furniture' && (
        <div className="palette">
          <h4>Мебель и оборудование</h4>
          {FURNITURE_GROUPS.map((g) => (
            <div key={g.title} className="palette-group">
              <div className="palette-group-title">{g.title}</div>
              <div className="palette-list">{g.items.map(itemButton)}</div>
            </div>
          ))}
          <p className="palette-note">Размеры каждого предмета меняются справа после установки.</p>
        </div>
      )}
    </div>
  );
}
