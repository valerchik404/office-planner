import { useRef } from 'react';
import { exportProject, useStore } from '../store';
import type { ProjectData } from '../store';
import { saveFile } from '../download';

function NumField({
  label, value, step = 0.1, min, max, onChange,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="num-field">
      <span>{label}</span>
      <input
        type="number"
        value={Number(value.toFixed(3))}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
      />
    </label>
  );
}

const KIND_NAMES = {
  window: 'Окно', door: 'Дверь', passage: 'Проём', desk: 'Стол', chair: 'Стул',
} as const;

export default function Inspector({ onOpenLocation }: { onOpenLocation: () => void }) {
  const selection = useStore((s) => s.selection);
  const walls = useStore((s) => s.walls);
  const openings = useStore((s) => s.openings);
  const furniture = useStore((s) => s.furniture);
  const underlay = useStore((s) => s.underlay);
  const location = useStore((s) => s.location);
  const st = useStore;
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const readOnly = useStore((s) => s.readOnly);
  const wall = selection?.kind === 'wall' ? walls.find((w) => w.id === selection.id) : null;
  const opening = selection?.kind === 'opening' ? openings.find((o) => o.id === selection.id) : null;
  const furn = selection?.kind === 'furniture' ? furniture.find((f) => f.id === selection.id) : null;

  const onUnderlayFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        st.getState().setUnderlay({
          dataUrl,
          aspect: img.naturalWidth / Math.max(1, img.naturalHeight),
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const onExport = () => {
    void saveFile('office-plan.json', exportProject());
  };

  const onImport = (file: File) => {
    file.text().then((txt) => {
      try {
        const data = JSON.parse(txt) as ProjectData;
        if (!Array.isArray(data.walls)) throw new Error('bad format');
        st.getState().loadProject(data);
      } catch {
        alert('Не удалось прочитать файл проекта');
      }
    });
  };

  if (readOnly) {
    return (
      <aside className="inspector">
        <section>
          <h3>Режим просмотра</h3>
          <p className="muted">
            Вы смотрите проект по ссылке для просмотра. Менять план может только редактор —
            попросите у автора ссылку для редактирования.
          </p>
          <p className="muted">Солнце, дату и время крутить можно — это не влияет на общий план.</p>
        </section>
        <section>
          <h3>Проект</h3>
          <button onClick={onExport}>Экспорт JSON</button>
        </section>
      </aside>
    );
  }

  return (
    <aside className="inspector">
      <section>
        <h3>Объект</h3>
        {!selection && <p className="muted">Ничего не выбрано. Кликните по объекту на плане.</p>}
        {wall && (
          <>
            <p className="obj-title">Стена</p>
            <NumField label="Толщина, м" value={wall.thickness} step={0.05} min={0.05} max={1}
              onChange={(v) => st.getState().updateWall(wall.id, { thickness: v })} />
            <NumField label="Высота, м" value={wall.height} step={0.1} min={1} max={6}
              onChange={(v) => st.getState().updateWall(wall.id, { height: v })} />
            <button className="danger" onClick={() => st.getState().deleteWall(wall.id)}>Удалить</button>
          </>
        )}
        {opening && (
          <>
            <p className="obj-title">{KIND_NAMES[opening.type]}</p>
            <NumField label="Ширина, м" value={opening.width} step={0.1} min={0.3} max={10}
              onChange={(v) => st.getState().updateOpening(opening.id, { width: v })} />
            <NumField label="Высота, м" value={opening.height} step={0.1} min={0.3} max={6}
              onChange={(v) => st.getState().updateOpening(opening.id, { height: v })} />
            {opening.type === 'window' && (
              <NumField label="Подоконник, м" value={opening.sillHeight} step={0.1} min={0} max={3}
                onChange={(v) => st.getState().updateOpening(opening.id, { sillHeight: v })} />
            )}
            <NumField label="Позиция, м" value={opening.center} step={0.1}
              onChange={(v) => st.getState().updateOpening(opening.id, { center: v })} />
            <button className="danger" onClick={() => st.getState().deleteOpening(opening.id)}>Удалить</button>
          </>
        )}
        {furn && (
          <>
            <p className="obj-title">{KIND_NAMES[furn.type]}</p>
            <NumField label="Поворот, °" value={furn.rotation} step={15} min={-360} max={360}
              onChange={(v) => st.getState().updateFurniture(furn.id, { rotation: ((v % 360) + 360) % 360 })} />
            <p className="muted">R — повернуть, Del — удалить, мышью — двигать</p>
            <button className="danger" onClick={() => st.getState().deleteFurniture(furn.id)}>Удалить</button>
          </>
        )}
      </section>

      <section>
        <h3>Подложка</h3>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && onUnderlayFile(e.target.files[0])}
        />
        <button onClick={() => fileRef.current?.click()}>
          {underlay.dataUrl ? 'Заменить картинку' : 'Загрузить план-картинку'}
        </button>
        {underlay.dataUrl && (
          <>
            <label className="num-field">
              <span>Прозрачность</span>
              <input type="range" min={0.05} max={1} step={0.05} value={underlay.opacity}
                onChange={(e) => st.getState().setUnderlay({ opacity: Number(e.target.value) })} />
            </label>
            <NumField label="Ширина, м" value={underlay.widthM} step={0.5} min={1} max={200}
              onChange={(v) => st.getState().setUnderlay({ widthM: v })} />
            <NumField label="Сдвиг X, м" value={underlay.x} step={0.5}
              onChange={(v) => st.getState().setUnderlay({ x: v })} />
            <NumField label="Сдвиг Y, м" value={underlay.y} step={0.5}
              onChange={(v) => st.getState().setUnderlay({ y: v })} />
            <button className="danger" onClick={() => st.getState().setUnderlay({ dataUrl: null })}>
              Убрать подложку
            </button>
          </>
        )}
      </section>

      <section>
        <h3>Локация</h3>
        <p className="muted">
          {location.label ? `${location.label} · ` : ''}
          {location.lat.toFixed(3)}, {location.lng.toFixed(3)}
        </p>
        <NumField label="Север, ° (по час.)" value={location.northAngle} step={5} min={-360} max={360}
          onChange={(v) => st.getState().setLocation({ northAngle: v })} />
        <button onClick={onOpenLocation}>Выбрать на карте…</button>
      </section>

      <section>
        <h3>Проект</h3>
        <div className="btn-row">
          <button onClick={onExport}>Экспорт JSON</button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
          />
          <button onClick={() => importRef.current?.click()}>Импорт</button>
        </div>
        <button
          className="danger"
          onClick={() => {
            if (confirm('Очистить весь план? Действие нельзя отменить.')) st.getState().clearProject();
          }}
        >
          Очистить план
        </button>
      </section>
    </aside>
  );
}
