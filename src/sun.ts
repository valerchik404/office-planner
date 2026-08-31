import SunCalc from 'suncalc';

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

export function fmtTime(d: Date | undefined): string {
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** Собирает Date из ISO-даты (yyyy-mm-dd) и минут от полуночи (локальное время браузера). */
export function makeDate(dateISO: string, minutes: number): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, Math.floor(minutes / 60), minutes % 60);
}
