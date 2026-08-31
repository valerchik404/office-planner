import { useEffect, useState } from 'react';
import { useStore } from './store';
import { buildShareUrl, clearPlanFromUrl, readSharedPlan } from './share';
import { collabAvailable, joinRoom, parseRoomHash, useCollab } from './collab';
import { listProjects } from './projects';
import ProjectsModal from './components/ProjectsModal';
import RoomModal from './components/RoomModal';
import { initHistory } from './history';
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
  const [showProjects, setShowProjects] = useState(false);
  const [showRoom, setShowRoom] = useState(false);
  const roomId = useCollab((s) => s.roomId);
  const peers = useCollab((s) => s.peers);
  const projectName = useCollab((s) => s.projectName);
  const collabError = useCollab((s) => s.error);
  const readOnly = useStore((s) => s.readOnly);
  const showDims = useStore((s) => s.showDims);

  useEffect(() => {
    initHistory();
  }, []);

  // Открытие комнаты или плана, переданных ссылкой (при загрузке и при смене хэша)
  useEffect(() => {
    const handle = () => {
      const room = parseRoomHash();
      if (room && collabAvailable) {
        const known = listProjects().find((p) => p.id === room.roomId);
        void joinRoom(room.roomId, room.token ?? known?.token);
        return;
      }
      const shared = readSharedPlan();
      if (!shared) return;
      clearPlanFromUrl();
      setSharedPlan(shared);
    };
    handle();
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
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
        <button
          className={showDims ? 'active' : ''}
          onClick={() => useStore.getState().toggleDims()}
          title="Показывать длины всех стен"
        >
          📏 Размеры
        </button>
        {readOnly && <span className="readonly-chip">👁 просмотр</span>}
        <span className="header-spacer" />
        {collabAvailable && (
          <button onClick={() => setShowProjects(true)}>📁 Проекты</button>
        )}
        {roomId && (
          <button onClick={() => setShowRoom(true)} title={collabError || projectName}>
            👥 {peers || 1} · {projectName || 'проект'}
          </button>
        )}
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
      {showProjects && <ProjectsModal onClose={() => setShowProjects(false)} />}
      {showRoom && roomId && <RoomModal onClose={() => setShowRoom(false)} />}

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
