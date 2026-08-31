import type { Furniture, FurnitureType } from './types';

export interface FurnitureMeta {
  name: string;
  icon: string;
  w: number; // ширина по умолчанию, м
  d: number; // глубина по умолчанию, м
  fill: string;
  stroke: string;
}

export const FURNITURE_META: Record<FurnitureType, FurnitureMeta> = {
  desk: { name: 'Стол', icon: '🖥️', w: 1.4, d: 0.7, fill: '#c9a36e', stroke: '#8a6d43' },
  meeting: { name: 'Перег. стол', icon: '🤝', w: 2.2, d: 1.1, fill: '#c9a36e', stroke: '#8a6d43' },
  chair: { name: 'Стул', icon: '🪑', w: 0.45, d: 0.45, fill: '#7d9b77', stroke: '#55704f' },
  sofa: { name: 'Диван', icon: '🛋️', w: 1.8, d: 0.85, fill: '#9b7d92', stroke: '#6e5468' },
  cabinet: { name: 'Шкаф', icon: '🗄️', w: 0.9, d: 0.45, fill: '#9a9aa4', stroke: '#6b6b75' },
  plant: { name: 'Растение', icon: '🪴', w: 0.5, d: 0.5, fill: '#4e7d4e', stroke: '#365936' },
  box: { name: 'Блок', icon: '📦', w: 1.0, d: 1.0, fill: '#b3b3a8', stroke: '#84847a' },
};

export const FURNITURE_TYPES = Object.keys(FURNITURE_META) as FurnitureType[];

export function metaOf(type: FurnitureType): FurnitureMeta {
  return FURNITURE_META[type] ?? FURNITURE_META.box;
}

/** Фактический размер предмета: свой, если задан, иначе по типу. */
export function fpOf(f: Furniture): { w: number; d: number } {
  const m = metaOf(f.type);
  return { w: f.w ?? m.w, d: f.d ?? m.d };
}
