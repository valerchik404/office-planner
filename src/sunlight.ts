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
