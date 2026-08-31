import { useEffect, useState } from 'react';
import { useStore } from './store';
import { buildShareUrl, clearPlanFromUrl, readSharedPlan } from './share';
import Toolbar from './components/Toolbar';
import Editor2D from './components/Editor2D';
import View3D from './components/View3D';
import SunControls from './components/SunControls';
import Inspector from './components/Inspector';
import LocationModal from './components/LocationModal';
import type { ViewMode } from './types';

const MODES: { id: ViewMode; label: string }[] = [
  { id: '2d', label: '2D' },
  { id: 'split', label: '2D + 3D' },
  { id: '3d', label: '3D' },
];

export default function App() {
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const [showLocation, setShowLocation] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sharedPlan, setSharedPlan] = useState<ReturnType<typeof readSharedPlan>>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // Открытие плана, переданного ссылкой
  useEffect(() => {
    const shared = readSharedPlan();
    if (!shared) return;
    clearPlanFromUrl();
    setSharedPlan(shared);
  }, []);

  const onShare = async () => {
    const url = buildShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setShareUrl(url); // буфер недоступен — покажем ссылку для ручного копирования
    }
  };

  return (
    <div className="app">
      <header className="header">
        <span className="logo">☀️ Солнце в офисе</span>
        <div className="mode-btns">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={viewMode === m.id ? 'active' : ''}
              onClick={() => setViewMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="header-spacer" />
        <button onClick={onShare}>{copied ? '✅ Ссылка скопирована' : '🔗 Поделиться'}</button>
        <button onClick={() => setShowLocation(true)}>📍 Локация</button>
      </header>

      <div className="main">
        <Toolbar />
        <div className={`views views-${viewMode}`}>
          {viewMode !== '3d' && <Editor2D />}
          {viewMode !== '2d' && <View3D />}
        </div>
        <Inspector onOpenLocation={() => setShowLocation(true)} />
      </div>

      <SunControls />

      {showLocation && <LocationModal onClose={() => setShowLocation(false)} />}

      {sharedPlan && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 'min(440px, 94vw)' }}>
            <h3>Планировка из ссылки</h3>
            <p className="muted">
              Вам передали планировку. Открыть её? Текущий план в этом браузере будет заменён
              (если он вам нужен — сначала сделайте «Экспорт JSON»).
            </p>
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button onClick={() => setSharedPlan(null)}>Оставить мой план</button>
              <button
                className="active"
                onClick={() => {
                  useStore.getState().loadProject(sharedPlan);
                  setSharedPlan(null);
                }}
              >
                Открыть
              </button>
            </div>
          </div>
        </div>
      )}

      {shareUrl && (
        <div className="modal-overlay" onClick={() => setShareUrl(null)}>
          <div className="modal" style={{ width: 'min(560px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
            <h3>Ссылка на планировку</h3>
            <input
              className="search-input"
              readOnly
              value={shareUrl}
              onFocus={(e) => e.target.select()}
              autoFocus
            />
            <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
              <button onClick={() => setShareUrl(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
