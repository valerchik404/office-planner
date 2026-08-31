import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Furniture, Pt, Wall } from '../types';
import { openingSpan, projectOnWall, snap, wallAngle, wallLen } from '../geometry';

const FOOTPRINT: Record<Furniture['type'], { w: number; d: number }> = {
  desk: { w: 1.4, d: 0.7 },
  chair: { w: 0.45, d: 0.45 },
};

const OPENING_DEFAULTS = {
  window: { width: 1.5, sillHeight: 0.8, height: 1.6 },
  door: { width: 0.9, sillHeight: 0, height: 2.1 },
  passage: { width: 1.2, sillHeight: 0, height: 3 },
} as const;

type Drag =
  | { kind: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { kind: 'furniture'; id: string; dx: number; dy: number }
  | { kind: 'endpoint'; wallId: string; end: 'a' | 'b' }
  | { kind: 'opening'; id: string; wallId: string };

export default function Editor2D() {
  const walls = useStore((s) => s.walls);
  const openings = useStore((s) => s.openings);
  const furniture = useStore((s) => s.furniture);
  const underlay = useStore((s) => s.underlay);
  const northAngle = useStore((s) => s.location.northAngle);
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ cx: 6, cy: 4, scale: 55 });
  const [chainStart, setChainStart] = useState<Pt | null>(null);
  const [hoverPt, setHoverPt] = useState<Pt | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Колесо мыши: масштаб к курсору (нативный слушатель, чтобы preventDefault работал)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const v = viewRef.current;
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;
      const wx = v.cx + mx / v.scale;
      const wy = v.cy + my / v.scale;
      const k = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const scale = Math.max(8, Math.min(400, v.scale * k));
      setView({ scale, cx: wx - mx / scale, cy: wy - my / scale });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const capture = (pointerId: number) => {
    try {
      svgRef.current!.setPointerCapture(pointerId);
    } catch { /* синтетические события и экзотические устройства */ }
  };

  const s2w = (clientX: number, clientY: number): Pt => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: view.cx + (clientX - rect.left - rect.width / 2) / view.scale,
      y: view.cy + (clientY - rect.top - rect.height / 2) / view.scale,
    };
  };

  const snapPoint = (p: Pt, forChain: boolean): Pt => {
    for (const w of walls) {
      for (const end of [w.a, w.b]) {
        if (Math.hypot(p.x - end.x, p.y - end.y) < 0.3) return { ...end };
      }
    }
    let x = snap(p.x, 0.1);
    let y = snap(p.y, 0.1);
    if (forChain && chainStart) {
      if (Math.abs(x - chainStart.x) < 0.15) x = chainStart.x;
      if (Math.abs(y - chainStart.y) < 0.15) y = chainStart.y;
    }
    return { x, y };
  };

  const hitTest = (p: Pt): { kind: 'furniture' | 'opening' | 'wall'; id: string } | null => {
    for (let i = furniture.length - 1; i >= 0; i--) {
      const f = furniture[i];
      const fp = FOOTPRINT[f.type];
      const a = (-f.rotation * Math.PI) / 180;
      const lx = (p.x - f.x) * Math.cos(a) - (p.y - f.y) * Math.sin(a);
      const ly = (p.x - f.x) * Math.sin(a) + (p.y - f.y) * Math.cos(a);
      if (Math.abs(lx) <= fp.w / 2 + 0.05 && Math.abs(ly) <= fp.d / 2 + 0.05)
        return { kind: 'furniture', id: f.id };
    }
    for (const o of openings) {
      const w = walls.find((x) => x.id === o.wallId);
      if (!w) continue;
      const pr = projectOnWall(w, p);
      const span = openingSpan(w, o);
      if (pr.dist <= w.thickness / 2 + 0.1 && pr.t >= span.start && pr.t <= span.end)
        return { kind: 'opening', id: o.id };
    }
    for (const w of walls) {
      const pr = projectOnWall(w, p);
      if (pr.dist <= w.thickness / 2 + 0.12) return { kind: 'wall', id: w.id };
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const st = useStore.getState();
    const p = s2w(e.clientX, e.clientY);
    if (e.button === 1 || e.button === 2) {
      dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: view.cx, cy: view.cy };
      capture(e.pointerId);
      if (e.button === 2 && chainStart) setChainStart(null);
      return;
    }
    if (e.button !== 0) return;
    capture(e.pointerId);

    if (st.readOnly) {
      // режим просмотра: только выбор для инспектора и панорама
      const hit = hitTest(p);
      st.setSelection(hit ? { kind: hit.kind, id: hit.id } : null);
      if (!hit) dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: view.cx, cy: view.cy };
      return;
    }

    if (tool === 'wall') {
      const sp = snapPoint(p, true);
      if (!chainStart) {
        setChainStart(sp);
      } else {
        if (Math.hypot(sp.x - chainStart.x, sp.y - chainStart.y) > 0.05) {
          st.addWall({ a: chainStart, b: sp, thickness: 0.2, height: 3 });
          setChainStart(sp);
        }
      }
      return;
    }
    if (tool === 'window' || tool === 'door' || tool === 'passage') {
      let best: { w: Wall; t: number; dist: number } | null = null;
      for (const w of walls) {
        const pr = projectOnWall(w, p);
        if (pr.dist < 0.6 && (!best || pr.dist < best.dist)) best = { w, t: pr.t, dist: pr.dist };
      }
      if (best) {
        const d = OPENING_DEFAULTS[tool];
        const L = wallLen(best.w);
        const width = Math.min(d.width, L * 0.9);
        const center = Math.max(width / 2, Math.min(L - width / 2, best.t));
        const height = tool === 'passage' ? best.w.height : d.height;
        const id = st.addOpening({ wallId: best.w.id, type: tool, center, width, sillHeight: d.sillHeight, height });
        st.setSelection({ kind: 'opening', id });
      }
      return;
    }
    if (tool === 'desk' || tool === 'chair') {
      const sp = { x: snap(p.x, 0.05), y: snap(p.y, 0.05) };
      const id = st.addFurniture({ type: tool, x: sp.x, y: sp.y, rotation: 0 });
      st.setSelection({ kind: 'furniture', id });
      return;
    }
    // select
    const hit = hitTest(p);
    if (!hit) {
      st.setSelection(null);
      dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: view.cx, cy: view.cy };
      return;
    }
    st.setSelection({ kind: hit.kind, id: hit.id });
    if (hit.kind === 'furniture') {
      const f = furniture.find((x) => x.id === hit.id)!;
      dragRef.current = { kind: 'furniture', id: f.id, dx: f.x - p.x, dy: f.y - p.y };
    } else if (hit.kind === 'opening') {
      const o = openings.find((x) => x.id === hit.id)!;
      dragRef.current = { kind: 'opening', id: o.id, wallId: o.wallId };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = useStore.getState();
    const p = s2w(e.clientX, e.clientY);
    setHoverPt(snapPoint(p, true));
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'pan') {
      setView((v) => ({
        ...v,
        cx: drag.cx - (e.clientX - drag.sx) / v.scale,
        cy: drag.cy - (e.clientY - drag.sy) / v.scale,
      }));
    } else if (drag.kind === 'furniture') {
      st.updateFurniture(drag.id, {
        x: snap(p.x + drag.dx, 0.05),
        y: snap(p.y + drag.dy, 0.05),
      });
    } else if (drag.kind === 'endpoint') {
      const sp = snapPoint(p, false);
      st.updateWall(drag.wallId, { [drag.end]: sp } as Partial<Wall>);
    } else if (drag.kind === 'opening') {
      const w = st.walls.find((x) => x.id === drag.wallId);
      const o = st.openings.find((x) => x.id === drag.id);
      if (w && o) {
        const pr = projectOnWall(w, p);
        const L = wallLen(w);
        const c = Math.max(o.width / 2, Math.min(L - o.width / 2, snap(pr.t, 0.05)));
        st.updateOpening(o.id, { center: c });
      }
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  // Клавиатура
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const st = useStore.getState();
      if (e.key === 'Escape') {
        setChainStart(null);
        st.setSelection(null);
      } else if (st.readOnly) {
        return;
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        st.deleteSelected();
      } else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        const sel = st.selection;
        if (sel?.kind === 'furniture') {
          const f = st.furniture.find((x) => x.id === sel.id);
          if (f) st.updateFurniture(f.id, { rotation: (f.rotation + (e.shiftKey ? -15 : 15) + 360) % 360 });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Видимая область и сетка
  const grid = useMemo(() => {
    const x0 = view.cx - size.w / 2 / view.scale;
    const x1 = view.cx + size.w / 2 / view.scale;
    const y0 = view.cy - size.h / 2 / view.scale;
    const y1 = view.cy + size.h / 2 / view.scale;
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++)
      lines.push({ x1: x, y1: y0, x2: x, y2: y1, major: x % 5 === 0 });
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++)
      lines.push({ x1: x0, y1: y, x2: x1, y2: y, major: y % 5 === 0 });
    return lines;
  }, [view, size]);

  const px = (n: number) => n / view.scale; // n пикселей в мировых единицах

  const readOnly = useStore((s) => s.readOnly);
  const selectedWall =
    selection?.kind === 'wall' && !readOnly ? walls.find((w) => w.id === selection.id) : null;

  return (
    <div ref={wrapRef} className="editor2d">
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => setChainStart(null)}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: 'none', display: 'block', background: '#f4f4ee' }}
      >
        <g transform={`translate(${size.w / 2 - view.cx * view.scale}, ${size.h / 2 - view.cy * view.scale}) scale(${view.scale})`}>
          {/* сетка */}
          {grid.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke={l.major ? '#d3d3c9' : '#e4e4dc'} strokeWidth={px(1)} />
          ))}

          {/* подложка */}
          {underlay.dataUrl && (
            <image
              href={underlay.dataUrl}
              x={underlay.x} y={underlay.y}
              width={underlay.widthM} height={underlay.widthM / underlay.aspect}
              opacity={underlay.opacity}
              preserveAspectRatio="none"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* стены */}
          {walls.map((w) => {
            const L = wallLen(w);
            const ang = (wallAngle(w) * 180) / Math.PI;
            const sel = selection?.kind === 'wall' && selection.id === w.id;
            return (
              <g key={w.id} transform={`translate(${w.a.x},${w.a.y}) rotate(${ang})`}>
                <rect x={-w.thickness / 2} y={-w.thickness / 2}
                  width={L + w.thickness} height={w.thickness}
                  fill={sel ? '#e07a3f' : '#43434b'} />
              </g>
            );
          })}

          {/* проёмы */}
          {openings.map((o) => {
            const w = walls.find((x) => x.id === o.wallId);
            if (!w) return null;
            const ang = (wallAngle(w) * 180) / Math.PI;
            const span = openingSpan(w, o);
            const sel = selection?.kind === 'opening' && selection.id === o.id;
            const fill = o.type === 'window' ? '#5db4ec' : o.type === 'door' ? '#c98d4b' : '#f4f4ee';
            return (
              <g key={o.id} transform={`translate(${w.a.x},${w.a.y}) rotate(${ang})`}>
                <rect x={span.start} y={-w.thickness / 2}
                  width={span.end - span.start} height={w.thickness}
                  fill={fill}
                  stroke={sel ? '#e07a3f' : o.type === 'passage' ? '#9a9a90' : 'none'}
                  strokeWidth={px(sel ? 2.5 : 1.5)}
                  strokeDasharray={o.type === 'passage' && !sel ? `${px(5)} ${px(4)}` : undefined}
                />
                {o.type === 'window' && (
                  <line x1={span.start} y1={0} x2={span.end} y2={0} stroke="#ffffff" strokeWidth={px(1.5)} />
                )}
              </g>
            );
          })}

          {/* мебель */}
          {furniture.map((f) => {
            const fp = FOOTPRINT[f.type];
            const sel = selection?.kind === 'furniture' && selection.id === f.id;
            return (
              <g key={f.id} transform={`translate(${f.x},${f.y}) rotate(${f.rotation})`}>
                {f.type === 'desk' ? (
                  <>
                    <rect x={-fp.w / 2} y={-fp.d / 2} width={fp.w} height={fp.d} rx={0.03}
                      fill="#c9a36e" stroke={sel ? '#e07a3f' : '#8a6d43'} strokeWidth={px(sel ? 2.5 : 1.2)} />
                    <line x1={-fp.w / 2 + 0.1} y1={fp.d / 2 - 0.08} x2={fp.w / 2 - 0.1} y2={fp.d / 2 - 0.08}
                      stroke="#8a6d43" strokeWidth={px(1)} />
                  </>
                ) : (
                  <>
                    <rect x={-fp.w / 2} y={-fp.d / 2} width={fp.w} height={fp.d} rx={0.08}
                      fill="#7d9b77" stroke={sel ? '#e07a3f' : '#55704f'} strokeWidth={px(sel ? 2.5 : 1.2)} />
                    <rect x={-fp.w / 2} y={fp.d / 2 - 0.07} width={fp.w} height={0.09} rx={0.04}
                      fill="#55704f" />
                  </>
                )}
              </g>
            );
          })}

          {/* предпросмотр рисуемой стены */}
          {tool === 'wall' && chainStart && hoverPt && (
            <>
              <line x1={chainStart.x} y1={chainStart.y} x2={hoverPt.x} y2={hoverPt.y}
                stroke="#e07a3f" strokeWidth={0.2} opacity={0.6} />
              <text x={(chainStart.x + hoverPt.x) / 2} y={(chainStart.y + hoverPt.y) / 2 - px(8)}
                fontSize={px(12)} fill="#c05a20" textAnchor="middle">
                {Math.hypot(hoverPt.x - chainStart.x, hoverPt.y - chainStart.y).toFixed(2)} м
              </text>
            </>
          )}
          {tool === 'wall' && hoverPt && (
            <circle cx={hoverPt.x} cy={hoverPt.y} r={px(4)} fill="#e07a3f" />
          )}

          {/* ручки концов выбранной стены */}
          {selectedWall &&
            (['a', 'b'] as const).map((end) => (
              <circle
                key={end}
                cx={selectedWall[end].x} cy={selectedWall[end].y} r={px(6)}
                fill="#fff" stroke="#e07a3f" strokeWidth={px(2)}
                style={{ cursor: 'move' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  capture(e.pointerId);
                  dragRef.current = { kind: 'endpoint', wallId: selectedWall.id, end };
                }}
              />
            ))}
        </g>
      </svg>

      {/* компас */}
      <div className="compass" title="Направление на север">
        <svg width="44" height="44" viewBox="-22 -22 44 44">
          <circle r="20" fill="rgba(255,255,255,0.85)" stroke="#bbb" />
          <g transform={`rotate(${northAngle})`}>
            <path d="M 0 -16 L 5 4 L 0 0 L -5 4 Z" fill="#d33" />
            <text y="-8" fontSize="9" textAnchor="middle" fill="#fff" fontWeight="bold">С</text>
          </g>
        </svg>
      </div>

      <div className="editor-hint">
        {readOnly
          ? 'Режим просмотра — менять план может только редактор'
          : null}
        {!readOnly && (tool === 'wall'
          ? chainStart
            ? 'Клик — следующая точка · двойной клик / Esc — закончить'
            : 'Клик — начать стену'
          : tool === 'select'
            ? 'Клик — выбрать · перетаскивание — двигать · R — повернуть · Del — удалить'
            : tool === 'desk' || tool === 'chair'
              ? 'Клик — поставить'
              : 'Клик по стене — добавить проём')}
        {hoverPt && `  |  x: ${hoverPt.x.toFixed(2)}  y: ${hoverPt.y.toFixed(2)}`}
      </div>
    </div>
  );
}
