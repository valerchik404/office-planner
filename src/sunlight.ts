import { makeDate, sunDirection } from './sun';
import { openingSpan, wallLen } from './geometry';
import type { Furniture, GeoLocation, Opening, Pt, Wall } from './types';

/** Часы прямого солнца за день для каждого рабочего места (стола).
 *  Луч от точки стола к солнцу: каждая пересечённая стена должна
 *  пропустить его через проём на нужной высоте, иначе — тень.
 *  Выше стены — тоже блок (считаем, что там потолок). */

const SEAT_HEIGHT = 0.75; // столешница, м
const STEP_MIN = 15;

interface RayHit {
  dist: number; // м вдоль луча
  t: number; // м вдоль стены от точки a
}

function raySegment(p: Pt, dir: Pt, a: Pt, b: Pt): RayHit | null {
  const rx = dir.x, ry = dir.y;
  const sx = b.x - a.x, sy = b.y - a.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const qx = a.x - p.x, qy = a.y - p.y;
  const dist = (qx * sy - qy * sx) / denom;
  const u = (qx * ry - qy * rx) / denom;
  if (dist <= 0.01 || u < 0 || u > 1) return null;
  return { dist, t: u * Math.hypot(sx, sy) };
}

function rayPasses(
  p: Pt, h0: number, dir2: Pt, slope: number,
  walls: Wall[], openingsByWall: Map<string, Opening[]>,
): boolean {
  for (const w of walls) {
    const hit = raySegment(p, dir2, w.a, w.b);
    if (!hit) continue;
    const hAt = h0 + slope * hit.dist;
    if (hAt < 0) return false;
    const ops = openingsByWall.get(w.id);
    let passes = false;
    if (ops && hAt <= w.height) {
      for (const o of ops) {
        const span = openingSpan(w, o);
        if (hit.t < span.start || hit.t > span.end) continue;
        const y0 = o.type === 'window' ? o.sillHeight : 0;
        const y1 = Math.min(y0 + o.height, w.height);
        if (hAt >= y0 && hAt <= y1) {
          passes = true;
          break;
        }
      }
    }
    if (!passes) return false;
  }
  return true;
}

export function computeSunHours(
  seats: Furniture[], walls: Wall[], openings: Opening[],
  location: GeoLocation, dateISO: string,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const s of seats) result.set(s.id, 0);
  if (seats.length === 0) return result;

  const validWalls = walls.filter((w) => wallLen(w) > 0.05);
  const openingsByWall = new Map<string, Opening[]>();
  for (const o of openings) {
    const list = openingsByWall.get(o.wallId);
    if (list) list.push(o);
    else openingsByWall.set(o.wallId, [o]);
  }

  for (let min = 0; min < 1440; min += STEP_MIN) {
    const date = makeDate(dateISO, min, location.lat, location.lng);
    const sun = sunDirection(date, location.lat, location.lng, location.northAngle);
    if (sun.altitude <= 0.02) continue;
    const hLen = Math.hypot(sun.dir[0], sun.dir[2]);
    if (hLen < 1e-6) continue; // солнце в зените — на план не спроецировать
    const dir2: Pt = { x: sun.dir[0] / hLen, y: sun.dir[2] / hLen };
    const slope = sun.dir[1] / hLen; // подъём на метр хода по плану

    for (const seat of seats) {
      if (rayPasses({ x: seat.x, y: seat.y }, SEAT_HEIGHT, dir2, slope, validWalls, openingsByWall)) {
        result.set(seat.id, (result.get(seat.id) ?? 0) + STEP_MIN / 60);
      }
    }
  }
  return result;
}

export function sunHoursColor(hours: number): string {
  if (hours <= 0.1) return '#b9c6ce';
  if (hours < 1.5) return '#e9e3a6';
  if (hours < 3.5) return '#ffd76e';
  if (hours < 6) return '#ffb254';
  return '#ff8f42';
}

export interface SunGrid {
  x0: number;
  y0: number;
  cell: number;
  cols: number;
  rows: number;
  /** часы прямого солнца в ячейке; -1 — точка вне помещения */
  hours: Float32Array;
  max: number;
}

/** Точка считается «внутри», если со всех четырёх сторон есть стена. */
function enclosed(p: Pt, walls: Wall[]): boolean {
  let px = false, nx = false, py = false, ny = false;
  for (const w of walls) {
    const ax = w.a.x, ay = w.a.y, bx = w.b.x, by = w.b.y;
    if ((ay - p.y) * (by - p.y) < 0) {
      const t = (p.y - ay) / (by - ay);
      const x = ax + (bx - ax) * t;
      if (x > p.x) px = true;
      else nx = true;
    }
    if ((ax - p.x) * (bx - p.x) < 0) {
      const t = (p.x - ax) / (bx - ax);
      const y = ay + (by - ay) * t;
      if (y > p.y) py = true;
      else ny = true;
    }
    if (px && nx && py && ny) return true;
  }
  return false;
}

/** Карта прямого солнца по всей площади плана на высоте стола. */
export function computeSunGrid(
  walls: Wall[],
  openings: Opening[],
  location: GeoLocation,
  dateISO: string,
  maxCells = 3600,
): SunGrid | null {
  const validWalls = walls.filter((w) => wallLen(w) > 0.05);
  if (validWalls.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of validWalls) {
    minX = Math.min(minX, w.a.x, w.b.x);
    maxX = Math.max(maxX, w.a.x, w.b.x);
    minY = Math.min(minY, w.a.y, w.b.y);
    maxY = Math.max(maxY, w.a.y, w.b.y);
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  // размер ячейки подбираем так, чтобы расчёт оставался быстрым
  const cell = Math.max(0.35, Math.sqrt((width * height) / maxCells));
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));

  const openingsByWall = new Map<string, Opening[]>();
  for (const o of openings) {
    const list = openingsByWall.get(o.wallId);
    if (list) list.push(o);
    else openingsByWall.set(o.wallId, [o]);
  }

  const hours = new Float32Array(cols * rows);
  const inside = new Uint8Array(cols * rows);
  const pts: Pt[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = { x: minX + (c + 0.5) * cell, y: minY + (r + 0.5) * cell };
      const idx = r * cols + c;
      pts.push(p);
      inside[idx] = enclosed(p, validWalls) ? 1 : 0;
      if (!inside[idx]) hours[idx] = -1;
    }
  }

  let max = 0;
  for (let min = 0; min < 1440; min += STEP_MIN) {
    const date = makeDate(dateISO, min, location.lat, location.lng);
    const sun = sunDirection(date, location.lat, location.lng, location.northAngle);
    if (sun.altitude <= 0.02) continue;
    const hLen = Math.hypot(sun.dir[0], sun.dir[2]);
    if (hLen < 1e-6) continue;
    const dir2: Pt = { x: sun.dir[0] / hLen, y: sun.dir[2] / hLen };
    const slope = sun.dir[1] / hLen;
    for (let i = 0; i < pts.length; i++) {
      if (!inside[i]) continue;
      if (rayPasses(pts[i], SEAT_HEIGHT, dir2, slope, validWalls, openingsByWall)) {
        hours[i] += STEP_MIN / 60;
        if (hours[i] > max) max = hours[i];
      }
    }
  }
  return { x0: minX, y0: minY, cell, cols, rows, hours, max };
}

/** Цвет ячейки карты: от прохладного синего (тень) к оранжевому (много солнца). */
export function heatColor(h: number, max: number): [number, number, number, number] {
  if (h < 0) return [0, 0, 0, 0];
  const stops: [number, number, number, number][] = [
    [64, 104, 150, 90],
    [126, 176, 196, 105],
    [236, 214, 132, 130],
    [240, 168, 74, 160],
    [226, 96, 52, 185],
  ];
  const t = max <= 0.01 ? 0 : Math.max(0, Math.min(1, h / max));
  const f = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  const k = f - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
    Math.round(a[3] + (b[3] - a[3]) * k),
  ];
}
