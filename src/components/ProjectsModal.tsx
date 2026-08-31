import { useState } from 'react';
import { createProject, joinRoom, leaveRoom, useCollab } from '../collab';
import { backupDraft, listProjects, readDraftBackup, removeProjectRef } from '../projects';
import { exportProject, useStore } from '../store';

export default function ProjectsModal({ onClose }: { onClose: () => void }) {
  const roomId = useCollab((s) => s.roomId);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [, force] = useState(0);
  const projects = listProjects();
  const draft = readDraftBackup();

  const onCreate = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setErr('');
    try {
      if (!roomId) backupDraft(exportProject());
      await createProject(n);
      onClose();
    } catch {
      setErr('Не получилось создать проект — проверьте интернет');
    } finally {
      setBusy(false);
    }
  };

  const onOpen = async (id: string, token?: string) => {
    setBusy(true);
    setErr('');
    try {
      if (!roomId) backupDraft(exportProject());
      await joinRoom(id, token);
      onClose();
    } catch {
      setErr('Не получилось открыть проект');
    } finally {
      setBusy(false);
    }
  };

  const onBackToDraft = () => {
    leaveRoom();
    if (draft) useStore.getState().loadProject(draft);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 'min(520px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h3>Проекты</h3>
        <p className="muted">
          Проект хранится в облаке: работайте один или пригласите друзей ссылкой —
          для просмотра или для совместного редактирования.
        </p>

        <div className="search-row">
          <input
            className="search-input"
            placeholder="Название нового проекта, например: Офис на Тверской"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onCreate()}
          />
          <button onClick={onCreate} disabled={busy || !name.trim()}>
            {busy ? '…' : '＋ Создать'}
          </button>
        </div>
        <p className="muted">Текущий план станет отправной точкой нового проекта.</p>
        {err && <p className="search-error">{err}</p>}

        {projects.length > 0 && (
          <ul className="project-list">
            {projects.map((p) => (
              <li key={p.id} className={p.id === roomId ? 'current' : ''}>
                <button className="project-open" disabled={busy} onClick={() => onOpen(p.id, p.token)}>
                  <span className="project-name">{p.name || p.id}</span>
                  <span className="muted">
                    {p.token ? 'редактор' : 'просмотр'}
                    {p.id === roomId ? ' · открыт сейчас' : ''}
                  </span>
                </button>
                <button
                  title="Убрать из списка (проект в облаке останется)"
                  onClick={() => { removeProjectRef(p.id); force((x) => x + 1); }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {roomId && draft && (
          <button onClick={onBackToDraft}>← Вернуться к локальному черновику</button>
        )}

        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
