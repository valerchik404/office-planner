import type { Furniture, FurnitureType } from './types';

export interface FurnitureMeta {
  name: string;
  icon: string;
  w: number; // ширина по умолчанию, м
  d: number; // глубина по умолчанию, м
  h: number; // высота в 3D, м
  fill: string;
  stroke: string;
  hint?: string;
}

export const FURNITURE_META: Record<FurnitureType, FurnitureMeta> = {
  desk: {
    name: 'Рабочий стол', icon: '🖥️', w: 1.4, d: 0.7, h: 0.75,
    fill: '#c9a36e', stroke: '#8a6d43', hint: 'Обычное рабочее место',
  },
  meeting: {
    name: 'Переговорный', icon: '🤝', w: 2.4, d: 1.2, h: 0.75,
    fill: '#c9a36e', stroke: '#8a6d43', hint: 'Большой стол для встреч',
  },
  reception: {
    name: 'Стойка', icon: '🛎️', w: 1.8, d: 0.7, h: 1.1,
    fill: '#bfa07d', stroke: '#8a6d43', hint: 'Ресепшн, барная стойка',
  },
  chair: {
    name: 'Стул', icon: '🪑', w: 0.45, d: 0.45, h: 0.9,
    fill: '#7d9b77', stroke: '#55704f',
  },
  armchair: {
    name: 'Кресло', icon: '💺', w: 0.75, d: 0.75, h: 0.85,
    fill: '#7d9b77', stroke: '#55704f', hint: 'Мягкое кресло',
  },
  sofa: {
    name: 'Диван', icon: '🛋️', w: 1.8, d: 0.85, h: 0.8,
    fill: '#9b7d92', stroke: '#6e5468',
  },
  cabinet: {
    name: 'Шкаф', icon: '🗄️', w: 0.9, d: 0.45, h: 1.9,
    fill: '#9a9aa4', stroke: '#6b6b75', hint: 'Высокий, до 1.9 м',
  },
  drawer: {
    name: 'Тумба', icon: '🗃️', w: 0.45, d: 0.55, h: 0.6,
    fill: '#9a9aa4', stroke: '#6b6b75', hint: 'Низкая тумба под стол',
  },
  plant: {
    name: 'Растение', icon: '🪴', w: 0.5, d: 0.5, h: 1.1,
    fill: '#4e7d4e', stroke: '#365936',
  },
  lamp: {
    name: 'Лампа', icon: '💡', w: 0.4, d: 0.4, h: 2.7,
    fill: '#ffe6a3', stroke: '#c9a227', hint: 'Светильник: яркость и оттенок настраиваются',
  },
  box: {
    name: 'Блок', icon: '📦', w: 1.0, d: 1.0, h: 0.75,
    fill: '#b3b3a8', stroke: '#84847a',
    hint: 'Любой прямоугольный объект: колонна, стеллаж, техника, короб',
  },
};

export interface FurnitureCategory {
  id: string;
  name: string;
  icon: string;
  types: FurnitureType[];
}

/** Группы для меню: одна кнопка в панели — попап с вариантами. */
export const FURNITURE_CATEGORIES: FurnitureCategory[] = [
  { id: 'tables', name: 'Столы', icon: '🖥️', types: ['desk', 'meeting', 'reception'] },
  { id: 'seats', name: 'Сиденья', icon: '🪑', types: ['chair', 'armchair', 'sofa'] },
  { id: 'storage', name: 'Хранение', icon: '🗄️', types: ['cabinet', 'drawer'] },
  { id: 'other', name: 'Прочее', icon: '🪴', types: ['plant', 'lamp', 'box'] },
];

export const FURNITURE_TYPES = Object.keys(FURNITURE_META) as FurnitureType[];

export function metaOf(type: FurnitureType): FurnitureMeta {
  return FURNITURE_META[type] ?? FURNITURE_META.box;
}

/** Фактический размер предмета: свой, если задан, иначе по типу. */
export function fpOf(f: Furniture): { w: number; d: number } {
  const m = metaOf(f.type);
  return { w: f.w ?? m.w, d: f.d ?? m.d };
}

/** Рабочие места — для них считаются часы солнца. */
export function isSeat(type: FurnitureType): boolean {
  return type === 'desk' || type === 'meeting' || type === 'reception';
}

export const LAMP_DEFAULTS = { lumens: 3000, temp: 4000, mount: 2.7 };

export function lampParams(f: Furniture): { lumens: number; temp: number; mount: number } {
  return {
    lumens: f.lumens ?? LAMP_DEFAULTS.lumens,
    temp: f.temp ?? LAMP_DEFAULTS.temp,
    mount: f.mount ?? LAMP_DEFAULTS.mount,
  };
}

/** Цвет света по цветовой температуре (приближение Tanner Helland). */
export function kelvinToHex(kelvin: number): string {
  const t = Math.max(1000, Math.min(12000, kelvin)) / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
  }
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.52 * Math.log(t - 10) - 305.04;
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
