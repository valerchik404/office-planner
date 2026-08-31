import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { Pt, Wall } from '../types';
import { openingSpan, projectOnWall, snap, wallAngle, wallLen } from '../geometry';
import { redo, undo } from '../history';
import { FURNITURE_TYPES, fpOf, isSeat, kelvinToHex, lampParams, metaOf } from '../furniture';
import { computeSunHours, sunHoursColor } from '../sunlight';
import type { FurnitureType } from '../types';

const OPENING_DEFAULTS = {
  window: { width: 1.5, sillHeight: 0.8, height: 1.6 },
  door: { width: 0.9, sillHeight: 0, height: 2.1 },
  passage: { width: 1.2, sillHeight: 0, height: 3 },
} as const;

type Drag =
  | { kind: 'pan'; sx: number; sy: number; cx: number; cy: number }
  | { kind: 'furniture'; id: string; dx: number; dy: number }
  | { kind: 'group'; items: { id: string; dx: number; dy: number }[] }
  | { kind: 'label'; id: string; dx: number; dy: number }
  | { kind: 'endpoint'; wallId: string; end: 'a' | 'b' }
  | { kind: 'opening'; id: string; wallId: string }
  | { kind: 'marquee' };

export default function Editor2D() {
  const walls = useStore((s) => s.walls);
  const openings = useStore((s) => s.openings);
  const furniture = useStore((s) => s.furniture);
  const labels = useStore((s) => s.labels) ?? [];
  const underlay = useStore((s) => s.underlay);
  const location = useStore((s) => s.location);
  const dateISO = useStore((s) => s.sun.dateISO);
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);
  const multiSelect = useStore((s) => s.multiSelect);
  const readOnly = useStore((s) => s.readOnly);
  const showDims = useStore((s) => s.showDims);
  const showSun = useStore((s) => s.showSun);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ cx: 6, cy: 4, scale: 55 });
  const [chainStart, setChainStart] = useState<Pt | null>(null);
  const [hoverPt, setHoverPt] = useState<Pt | null>(null);
  const [lenInput, setLenInput] = useState('');
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const sunHours = useMemo(() => {
    if (!showSun) return null;
    const seats = furniture.filter((f) => isSeat(f.type));
    return computeSunHours(seats, walls, openings, location, dateISO);
  }, [showSun, furniture, walls, openings, location, dateISO]);

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

  // Колесо мыши: масштаб к курсору
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

  // смена инструмента сбрасывает начатую стену и набор длины
  useEffect(() => {
    setChainStart(null);
    setLenInput('');
  }, [tool]);

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

  const hitTest = (p: Pt): { kind: 'furniture' | 'opening' | 'wall' | 'label'; id: string } | null => {
    for (let i = labels.length - 1; i >= 0; i--) {
      const l = labels[i];
      const w = Math.max(0.4, l.text.length * l.size * 0.62);
      const h = l.size * 1.4;
      const a = (-l.rotation * Math.PI) / 180;
      const lx = (p.x - l.x) * Math.cos(a) - (p.y - l.y) * Math.sin(a);
      const ly = (p.x - l.x) * Math.sin(a) + (p.y - l.y) * Math.cos(a);
      if (Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2) return { kind: 'label', id: l.id };
    }
    for (let i = furniture.length - 1; i >= 0; i--) {
      const f = furniture[i];
      const fp = fpOf(f);
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

  /** Прилипание мебели к ближайшей стене: спинкой к стене, вплотную. */
  const wallSnap = (p: Pt, depth: number): { x: number; y: number; rotation: number } | null => {
    let best: { w: Wall; pr: { dist: number; t: number } } | null = null;
    for (const w of walls) {
      const pr = projectOnWall(w, p);
      const reach = w.thickness / 2 + depth / 2 + 0.22;
      if (pr.dist < reach && (!best || pr.dist < best.pr.dist)) best = { w, pr };
    }
    if (!best) return null;
    const w = best.w;
    const L = wallLen(w);
    if (L < 0.05) return null;
    const dx = (w.b.x - w.a.x) / L;
    const dy = (w.b.y - w.a.y) / L;
    const cross = dx * (p.y - w.a.y) - dy * (p.x - w.a.x);
    const side = cross >= 0 ? 1 : -1;
    const nx = -dy * side;
    const ny = dx * side;
    const off = w.thickness / 2 + depth / 2 + 0.01;
    const base = {
      x: w.a.x + dx * best.pr.t,
      y: w.a.y + dy * best.pr.t,
    };
    const angleDeg = (wallAngle(w) * 180) / Math.PI;
    return {
      x: base.x + nx * off,
      y: base.y + ny * off,
      rotation: ((side > 0 ? angleDeg + 180 : angleDeg) + 360) % 360,
    };
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
      const hit = hitTest(p);
      st.setSelection(hit ? { kind: hit.kind, id: hit.id } : null);
      if (!hit) dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: view.cx, cy: view.cy };
      return;
    }

    if (tool === 'wall') {
      const sp = snapPoint(p, true);
      setLenInput('');
      if (!chainStart) {
        setChainStart(sp);
      } else if (Math.hypot(sp.x - chainStart.x, sp.y - chainStart.y) > 0.05) {
        st.addWall({ a: chainStart, b: sp, thickness: 0.2, height: 3 });
        setChainStart(sp);
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
    if ((FURNITURE_TYPES as string[]).includes(tool)) {
      const sp = { x: snap(p.x, 0.05), y: snap(p.y, 0.05) };
      const id = st.addFurniture({ type: tool as FurnitureType, x: sp.x, y: sp.y, rotation: 0 });
      st.setSelection({ kind: 'furniture', id });
      return;
    }
    if (tool === 'note') {
      const sp = { x: snap(p.x, 0.05), y: snap(p.y, 0.05) };
      const id = st.addLabel({ text: 'Надпись', x: sp.x, y: sp.y, rotation: 0, size: 0.4 });
      st.setTool('select');
      st.setSelection({ kind: 'label', id });
      return;
    }

    // select
    const hit = hitTest(p);
    if (!hit) {
      st.setSelection(null);
      dragRef.current = { kind: 'marquee' };
      setMarquee({ a: p, b: p });
      return;
    }
    if (hit.kind === 'furniture' && multiSelect.includes(hit.id)) {
      // тащим всю группу
      dragRef.current = {
        kind: 'group',
        items: multiSelect
          .map((id) => furniture.find((f) => f.id === id))
          .filter((f): f is NonNullable<typeof f> => Boolean(f))
          .map((f) => ({ id: f.id, dx: f.x - p.x, dy: f.y - p.y })),
      };
      return;
    }
    st.setSelection({ kind: hit.kind, id: hit.id });
    if (hit.kind === 'furniture') {
      const f = furniture.find((x) => x.id === hit.id)!;
      dragRef.current = { kind: 'furniture', id: f.id, dx: f.x - p.x, dy: f.y - p.y };
    } else if (hit.kind === 'label') {
      const l = labels.find((x) => x.id === hit.id)!;
      dragRef.current = { kind: 'label', id: l.id, dx: l.x - p.x, dy: l.y - p.y };
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
    } else if (drag.kind === 'marquee') {
      setMarquee((m) => (m ? { a: m.a, b: p } : null));
    } else if (drag.kind === 'furniture') {
      const f = st.furniture.find((x) => x.id === drag.id);
      if (!f) return;
      const raw = { x: p.x + drag.dx, y: p.y + drag.dy };
      const snapped = f.type === 'lamp' ? null : wallSnap(raw, fpOf(f).d);
      if (snapped) {
        st.updateFurniture(drag.id, snapped);
      } else {
        st.updateFurniture(drag.id, { x: snap(raw.x, 0.05), y: snap(raw.y, 0.05) });
      }
    } else if (drag.kind === 'group') {
      for (const it of drag.items) {
        st.updateFurniture(it.id, { x: snap(p.x + it.dx, 0.05), y: snap(p.y + it.dy, 0.05) });
      }
    } else if (drag.kind === 'label') {
      st.updateLabel(drag.id, { x: snap(p.x + drag.dx, 0.05), y: snap(p.y + drag.dy, 0.05) });
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
    const drag = dragRef.current;
    if (drag?.kind === 'marquee' && marquee) {
      const x0 = Math.min(marquee.a.x, marquee.b.x);
      const x1 = Math.max(marquee.a.x, marquee.b.x);
      const y0 = Math.min(marquee.a.y, marquee.b.y);
      const y1 = Math.max(marquee.a.y, marquee.b.y);
      if (x1 - x0 > 0.1 || y1 - y0 > 0.1) {
        const ids = furniture
          .filter((f) => f.x >= x0 && f.x <= x1 && f.y >= y0 && f.y <= y1)
          .map((f) => f.id);
        if (ids.length > 0) useStore.getState().setMultiSelect(ids);
      }
      setMarquee(null);
    }
    dragRef.current = null;
  };

  // Точная длина стены с клавиатуры: направление мышью, число + Enter
  const commitTypedLength = (): boolean => {
    const L = parseFloat(lenInput.replace(',', '.'));
    if (!chainStart || !hoverPt || !Number.isFinite(L) || L < 0.02) return false;
    const dx = hoverPt.x - chainStart.x;
    const dy = hoverPt.y - chainStart.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.001) return false;
    const b = { x: chainStart.x + (dx / d) * L, y: chainStart.y + (dy / d) * L };
    useStore.getState().addWall({ a: chainStart, b, thickness: 0.2, height: 3 });
    setChainStart(b);
    setLenInput('');
    return true;
  };

  // Клавиатура
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const st = useStore.getState();

      if (e.key === 'Escape') {
        if (lenInput) setLenInput('');
        else {
          setChainStart(null);
          st.setSelection(null);
        }
        return;
      }
      if (st.readOnly) return;

      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' || k === 'я') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
          return;
        }
        if (k === 'y' || k === 'н') {
          e.preventDefault();
          redo();
          return;
        }
        if (k === 'd' || k === 'в') {
          e.preventDefault();
          if (st.multiSelect.length > 0) {
            const ids: string[] = [];
            for (const id of st.multiSelect) {
              const f = st.furniture.find((x) => x.id === id);
              if (f) {
                ids.push(st.addFurniture({
                  type: f.type, x: f.x + 0.4, y: f.y + 0.4, rotation: f.rotation, w: f.w, d: f.d,
                }));
              }
            }
            st.setMultiSelect(ids);
            return;
          }
          const sel = st.selection;
          if (sel?.kind === 'furniture') {
            const f = st.furniture.find((x) => x.id === sel.id);
            if (f) {
              const id = st.addFurniture({ type: f.type, x: f.x + 0.4, y: f.y + 0.4, rotation: f.rotation, w: f.w, d: f.d });
              st.setSelection({ kind: 'furniture', id });
            }
          } else if (sel?.kind === 'label') {
            const l = (st.labels ?? []).find((x) => x.id === sel.id);
            if (l) {
              const id = st.addLabel({ text: l.text, x: l.x + 0.4, y: l.y + 0.4, rotation: l.rotation, size: l.size });
              st.setSelection({ kind: 'label', id });
            }
          }
          return;
        }
        return;
      }

      if (tool === 'wall' && chainStart) {
        if (/^[0-9]$/.test(e.key) || e.key === '.' || e.key === ',') {
          setLenInput((v) => (v + (e.key === ',' ? '.' : e.key)).slice(0, 8));
          return;
        }
        if (e.key === 'Backspace' && lenInput) {
          e.preventDefault();
          setLenInput((v) => v.slice(0, -1));
          return;
        }
        if (e.key === 'Enter') {
          commitTypedLength();
          return;
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        st.deleteSelected();
      } else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        const delta = e.shiftKey ? -15 : 15;
        if (st.multiSelect.length > 0) {
          for (const id of st.multiSelect) {
            const f = st.furniture.find((x) => x.id === id);
            if (f) st.updateFurniture(id, { rotation: (f.rotation + delta + 360) % 360 });
          }
          return;
        }
        const sel = st.selection;
        if (sel?.kind === 'furniture') {
          const f = st.furniture.find((x) => x.id === sel.id);
          if (f) st.updateFurniture(f.id, { rotation: (f.rotation + delta + 360) % 360 });
        } else if (sel?.kind === 'label') {
          const l = (st.labels ?? []).find((x) => x.id === sel.id);
          if (l) st.updateLabel(l.id, { rotation: (l.rotation + delta + 360) % 360 });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, chainStart, hoverPt, lenInput]);

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

  const px = (n: number) => n / view.scale;

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
          {grid.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke={l.major ? '#d3d3c9' : '#e4e4dc'} strokeWidth={px(1)} />
          ))}

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
            const fp = fpOf(f);
            const meta = metaOf(f.type);
            const sel = selection?.kind === 'furniture' && selection.id === f.id;
            const inGroup = multiSelect.includes(f.id);
            const hours = sunHours?.get(f.id);
            const fill = hours !== undefined ? sunHoursColor(hours) : meta.fill;
            const stroke = sel || inGroup ? '#e07a3f' : meta.stroke;
            const sw = px(sel || inGroup ? 2.5 : 1.2);
            return (
              <g key={f.id} transform={`translate(${f.x},${f.y}) rotate(${f.rotation})`}>
                {f.type === 'lamp' ? (
                  <>
                    <circle r={fp.w / 2} fill={kelvinToHex(lampParams(f).temp)}
                      stroke={stroke} strokeWidth={sw} opacity={lampParams(f).lumens > 0 ? 1 : 0.35} />
                    {[0, 45, 90, 135].map((a) => (
                      <line key={a}
                        x1={Math.cos((a * Math.PI) / 180) * fp.w * 0.62}
                        y1={Math.sin((a * Math.PI) / 180) * fp.w * 0.62}
                        x2={-Math.cos((a * Math.PI) / 180) * fp.w * 0.62}
                        y2={-Math.sin((a * Math.PI) / 180) * fp.w * 0.62}
                        stroke={meta.stroke} strokeWidth={px(1)} opacity={0.7} />
                    ))}
                  </>
                ) : f.type === 'plant' ? (
                  <>
                    <circle r={fp.w / 2} fill={fill} stroke={stroke} strokeWidth={sw} />
                    <circle r={fp.w / 4} fill="none" stroke={meta.stroke} strokeWidth={px(1)} />
                  </>
                ) : (
                  <rect x={-fp.w / 2} y={-fp.d / 2} width={fp.w} height={fp.d}
                    rx={f.type === 'chair' || f.type === 'sofa' ? 0.08 : 0.03}
                    fill={fill} stroke={stroke} strokeWidth={sw}
                    strokeDasharray={f.type === 'box' ? `${px(5)} ${px(4)}` : undefined} />
                )}
                {(f.type === 'desk' || f.type === 'meeting') && (
                  <line x1={-fp.w / 2 + 0.1} y1={fp.d / 2 - 0.08} x2={fp.w / 2 - 0.1} y2={fp.d / 2 - 0.08}
                    stroke={meta.stroke} strokeWidth={px(1)} />
                )}
                {(f.type === 'chair' || f.type === 'sofa') && (
                  <rect x={-fp.w / 2} y={fp.d / 2 - 0.08} width={fp.w} height={0.1} rx={0.04}
                    fill={meta.stroke} />
                )}
                {f.type === 'sofa' && (
                  <>
                    <rect x={-fp.w / 2} y={-fp.d / 2} width={0.12} height={fp.d} fill={meta.stroke} opacity={0.6} />
                    <rect x={fp.w / 2 - 0.12} y={-fp.d / 2} width={0.12} height={fp.d} fill={meta.stroke} opacity={0.6} />
                  </>
                )}
                {f.type === 'cabinet' && (
                  <line x1={-fp.w / 2} y1={-fp.d / 2} x2={fp.w / 2} y2={fp.d / 2}
                    stroke={meta.stroke} strokeWidth={px(1)} />
                )}
              </g>
            );
          })}

          {/* часы солнца на столах */}
          {sunHours &&
            furniture
              .filter((f) => sunHours.has(f.id))
              .map((f) => (
                <text key={`sun-${f.id}`} x={f.x} y={f.y}
                  fontSize={px(12)} fontWeight={700} fill="#3a3428"
                  textAnchor="middle" dominantBaseline="middle"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>
                  {(sunHours.get(f.id) ?? 0).toFixed(1)} ч
                </text>
              ))}

          {/* надписи */}
          {labels.map((l) => {
            const sel = selection?.kind === 'label' && selection.id === l.id;
            return (
              <g key={l.id} transform={`translate(${l.x},${l.y}) rotate(${l.rotation})`}>
                <text
                  fontSize={l.size}
                  fill={sel ? '#c05a20' : '#4d4d57'}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontWeight={600}
                  style={{ userSelect: 'none' }}
                >
                  {l.text}
                </text>
                {sel && (
                  <rect
                    x={-Math.max(0.4, l.text.length * l.size * 0.62) / 2}
                    y={(-l.size * 1.4) / 2}
                    width={Math.max(0.4, l.text.length * l.size * 0.62)}
                    height={l.size * 1.4}
                    fill="none"
                    stroke="#e07a3f"
                    strokeWidth={px(1.5)}
                    strokeDasharray={`${px(4)} ${px(3)}`}
                  />
                )}
              </g>
            );
          })}

          {/* размеры стен */}
          {walls.map((w) => {
            const show = showDims || (selection?.kind === 'wall' && selection.id === w.id);
            if (!show) return null;
            const L = wallLen(w);
            if (L < 0.05) return null;
            let deg = (wallAngle(w) * 180) / Math.PI;
            const nx = -(w.b.y - w.a.y) / L;
            const ny = (w.b.x - w.a.x) / L;
            if (deg > 90 || deg < -90) deg += 180;
            const off = w.thickness / 2 + px(12);
            const mx = (w.a.x + w.b.x) / 2 + nx * off;
            const my = (w.a.y + w.b.y) / 2 + ny * off;
            return (
              <text key={`dim-${w.id}`}
                transform={`translate(${mx},${my}) rotate(${deg})`}
                fontSize={px(11)} fill="#7a7a72" textAnchor="middle" dominantBaseline="middle"
                style={{ userSelect: 'none' }}>
                {L.toFixed(2)} м
              </text>
            );
          })}

          {/* предпросмотр рисуемой стены */}
          {tool === 'wall' && chainStart && hoverPt && (
            <>
              <line x1={chainStart.x} y1={chainStart.y} x2={hoverPt.x} y2={hoverPt.y}
                stroke="#e07a3f" strokeWidth={0.2} opacity={0.6} />
              <text x={(chainStart.x + hoverPt.x) / 2} y={(chainStart.y + hoverPt.y) / 2 - px(8)}
                fontSize={px(12)} fill="#c05a20" fontWeight={lenInput ? 700 : 400} textAnchor="middle">
                {lenInput
                  ? `${lenInput}▏м — Enter`
                  : `${Math.hypot(hoverPt.x - chainStart.x, hoverPt.y - chainStart.y).toFixed(2)} м`}
              </text>
            </>
          )}
          {tool === 'wall' && hoverPt && (
            <circle cx={hoverPt.x} cy={hoverPt.y} r={px(4)} fill="#e07a3f" />
          )}

          {/* рамка выделения */}
          {marquee && (
            <rect
              x={Math.min(marquee.a.x, marquee.b.x)}
              y={Math.min(marquee.a.y, marquee.b.y)}
              width={Math.abs(marquee.b.x - marquee.a.x)}
              height={Math.abs(marquee.b.y - marquee.a.y)}
              fill="rgba(224, 122, 63, 0.08)"
              stroke="#e07a3f"
              strokeWidth={px(1.5)}
              strokeDasharray={`${px(5)} ${px(4)}`}
            />
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

      <div className="compass" title="Направление на север">
        <svg width="44" height="44" viewBox="-22 -22 44 44">
          <circle r="20" fill="rgba(255,255,255,0.85)" stroke="#bbb" />
          <g transform={`rotate(${location.northAngle})`}>
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
            ? 'Клик — точка · наберите длину (напр. 4.25) и Enter · Esc — закончить'
            : 'Клик — начать стену'
          : tool === 'select'
            ? multiSelect.length > 0
              ? `Выбрано: ${multiSelect.length} · тащите группу · R — повернуть · Ctrl+D — дублировать · Del — удалить`
              : 'Клик — выбрать · рамка — группа · R — повернуть · Del — удалить'
            : tool === 'note'
              ? 'Клик — поставить надпись (текст меняется справа)'
              : (FURNITURE_TYPES as string[]).includes(tool)
                ? 'Клик — поставить · рядом со стеной — прилипнет к ней'
                : 'Клик по стене — добавить проём')}
        {hoverPt && `  |  x: ${hoverPt.x.toFixed(2)}  y: ${hoverPt.y.toFixed(2)}`}
      </div>
    </div>
  );
}
