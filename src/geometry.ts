import type { Opening, Pt, Wall } from './types';

export function wallLen(w: Wall): number {
  return Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
}

export function wallAngle(w: Wall): number {
  return Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
}

export function pointAlong(w: Wall, t: number): Pt {
  const L = wallLen(w) || 1;
  return {
    x: w.a.x + ((w.b.x - w.a.x) * t) / L,
    y: w.a.y + ((w.b.y - w.a.y) * t) / L,
  };
}

/** Проекция точки на стену: расстояние до линии и позиция вдоль (м). */
export function projectOnWall(w: Wall, p: Pt): { dist: number; t: number } {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const L2 = dx * dx + dy * dy;
  if (L2 === 0) return { dist: Math.hypot(p.x - w.a.x, p.y - w.a.y), t: 0 };
  let u = ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / L2;
  u = Math.max(0, Math.min(1, u));
  const px = w.a.x + u * dx;
  const py = w.a.y + u * dy;
  return { dist: Math.hypot(p.x - px, p.y - py), t: u * Math.sqrt(L2) };
}

export interface WallBox {
  off: number; // начало по длине стены, м
  len: number;
  y0: number; // низ, м
  y1: number; // верх, м
}

/** Разбивает стену на боксы с учётом проёмов (для 3D). */
export function wallBoxes(w: Wall, openings: Opening[]): WallBox[] {
  const L = wallLen(w);
  const ops = openings
    .filter((o) => o.wallId === w.id)
    .map((o) => ({
      ...o,
      start: Math.max(0, Math.min(L, o.center - o.width / 2)),
      end: Math.max(0, Math.min(L, o.center + o.width / 2)),
    }))
    .filter((o) => o.end - o.start > 0.01)
    .sort((a, b) => a.start - b.start);

  const boxes: WallBox[] = [];
  let cur = 0;
  for (const o of ops) {
    if (o.start > cur) boxes.push({ off: cur, len: o.start - cur, y0: 0, y1: w.height });
    const y0 = o.type === 'window' ? o.sillHeight : 0;
    const y1 = Math.min(y0 + o.height, w.height);
    const s = Math.max(cur, o.start);
    const e = Math.max(s, o.end);
    if (e - s > 0.01) {
      if (y0 > 0.01) boxes.push({ off: s, len: e - s, y0: 0, y1: y0 });
      if (y1 < w.height - 0.01) boxes.push({ off: s, len: e - s, y0: y1, y1: w.height });
    }
    cur = Math.max(cur, o.end);
  }
  if (cur < L - 0.005) boxes.push({ off: cur, len: L - cur, y0: 0, y1: w.height });
  return boxes;
}

/** Интервал проёма вдоль стены с обрезкой по длине. */
export function openingSpan(w: Wall, o: Opening): { start: number; end: number } {
  const L = wallLen(w);
  return {
    start: Math.max(0, Math.min(L, o.center - o.width / 2)),
    end: Math.max(0, Math.min(L, o.center + o.width / 2)),
  };
}

export function wallsBBox(walls: Wall[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (walls.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return { minX, minY, maxX, maxY };
}

export function snap(v: number, step: number): number {
  return Math.round(v / step) * step;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}
