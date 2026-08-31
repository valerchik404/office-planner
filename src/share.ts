import LZString from 'lz-string';
import { useStore } from './store';
import type { ProjectData } from './store';

/** Ссылка с планом внутри: сжатый JSON в hash-части адреса.
 *  Картинка-подложка не включается — она может весить мегабайты. */
export function buildShareUrl(): string {
  const s = useStore.getState();
  const data: ProjectData = {
    walls: s.walls,
    openings: s.openings,
    furniture: s.furniture,
    labels: s.labels ?? [],
    underlay: { ...s.underlay, dataUrl: null },
    location: s.location,
    sun: s.sun,
  };
  const packed = LZString.compressToEncodedURIComponent(JSON.stringify(data));
  return `${location.origin}${location.pathname}${location.search}#plan=${packed}`;
}

export function readSharedPlan(): ProjectData | null {
  const m = location.hash.match(/plan=([^&]+)/);
  if (!m) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(m[1]);
    if (!json) return null;
    const data = JSON.parse(json) as ProjectData;
    if (!Array.isArray(data.walls) || !Array.isArray(data.furniture)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearPlanFromUrl(): void {
  history.replaceState(null, '', location.pathname + location.search);
}
