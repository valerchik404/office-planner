import { useState } from 'react';
import { leaveRoom, roomLinks, useCollab } from '../collab';

function CopyRow({ label, url, hint }: { label: string; url: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* поле рядом — можно выделить вручную */ }
  };
  return (
    <div className="copy-block">
      <div className="copy-label">
        <b>{label}</b>
        <span className="muted"> — {hint}</span>
      </div>
      <div className="search-row">
        <input className="search-input" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button onClick={copy}>{copied ? '✅' : 'Копировать'}</button>
      </div>
    </div>
  );
}

export default function RoomModal({ onClose }: { onClose: () => void }) {
  const { projectName, peers, role, error } = useCollab();
  const links = roomLinks();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 'min(560px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <h3>{projectName || 'Проект'}</h3>
        <p className="muted">
          Сейчас в проекте: {peers || 1} {peers === 1 ? 'человек' : 'чел.'} · ваша роль:{' '}
          {role === 'editor' ? 'редактор' : 'просмотр'}
        </p>
        {error && <p className="search-error">{error}</p>}

        <CopyRow
          label="Ссылка для просмотра"
          url={links.view}
          hint="откроют план и солнце, менять ничего не смогут"
        />
        {links.edit && (
          <CopyRow
            label="Ссылка для редактирования"
            url={links.edit}
            hint="полноценный соавтор, изменения видны всем сразу"
          />
        )}
        {role === 'editor' && (
          <p className="muted">
            Изменения сохраняются в облаке автоматически. Дата и время солнца у каждого свои —
            они не синхронизируются.
          </p>
        )}

        <div className="btn-row" style={{ justifyContent: 'space-between' }}>
          <button className="danger" onClick={() => { leaveRoom(); onClose(); }}>
            Выйти из проекта
          </button>
          <button onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
