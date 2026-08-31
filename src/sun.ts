import SunCalc from 'suncalc';
import tzlookup from 'tz-lookup';

export interface SunInfo {
  /** Единичный вектор ИЗ сцены К солнцу в мировых координатах 3D (y — вверх). */
  dir: [number, number, number];
  altitude: number; // рад, высота над горизонтом
  azimuth: number; // рад, от юга к западу (как в SunCalc)
}

/**
 * Направление на солнце в координатах сцены.
 * northAngle: 0 = север «вверх» на плане (−z в 3D), градусы по часовой стрелке.
 */
export function sunDirection(date: Date, lat: number, lng: number, northAngle: number): SunInfo {
  const p = SunCalc.getPosition(date, lat, lng);
  const a = (northAngle * Math.PI) / 180;
  // север и восток в 3D (план x→x, y→z)
  const north = [Math.sin(a), -Math.cos(a)]; // (x, z)
  const east = [Math.cos(a), Math.sin(a)];
  const south = [-north[0], -north[1]];
  const west = [-east[0], -east[1]];
  const hx = south[0] * Math.cos(p.azimuth) + west[0] * Math.sin(p.azimuth);
  const hz = south[1] * Math.cos(p.azimuth) + west[1] * Math.sin(p.azimuth);
  const dir: [number, number, number] = [
    hx * Math.cos(p.altitude),
    Math.sin(p.altitude),
    hz * Math.cos(p.altitude),
  ];
  return { dir, altitude: p.altitude, azimuth: p.azimuth };
}

export function sunTimes(date: Date, lat: number, lng: number) {
  return SunCalc.getTimes(date, lat, lng);
}

export function fmtTime(d: Date | undefined, tz?: string): string {
  if (!d || isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  } catch {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
}

/** Часовой пояс точки на карте (IANA), с фолбэком на пояс устройства. */
export function cityTimezone(lat: number, lng: number): string {
  try {
    return tzlookup(lat, lng);
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}

function tzOffsetMs(tz: string, at: Date): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(at)) p[part.type] = part.value;
  const asUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour === '24' ? '0' : p.hour), Number(p.minute), Number(p.second),
  );
  return asUTC - at.getTime();
}

/** Собирает Date так, чтобы часы/минуты означали МЕСТНОЕ время выбранного города. */
export function makeDate(dateISO: string, minutes: number, lat?: number, lng?: number): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  if (lat === undefined || lng === undefined) {
    return new Date(y, (m || 1) - 1, d || 1, Math.floor(minutes / 60), minutes % 60);
  }
  const tz = cityTimezone(lat, lng);
  const guess = new Date(Date.UTC(y, (m || 1) - 1, d || 1, Math.floor(minutes / 60), minutes % 60));
  const off1 = tzOffsetMs(tz, guess);
  const res = new Date(guess.getTime() - off1);
  const off2 = tzOffsetMs(tz, res);
  return off2 === off1 ? res : new Date(guess.getTime() - off2);
}
