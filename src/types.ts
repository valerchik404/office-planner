export interface Pt {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  a: Pt;
  b: Pt;
  thickness: number; // м
  height: number; // м
}

export type OpeningType = 'window' | 'door' | 'passage';

export interface Opening {
  id: string;
  wallId: string;
  type: OpeningType;
  center: number; // м вдоль стены от точки a
  width: number; // м
  sillHeight: number; // м, подоконник (для окон)
  height: number; // м, высота проёма
}

export type FurnitureType = 'desk' | 'chair';

export interface Furniture {
  id: string;
  type: FurnitureType;
  x: number;
  y: number;
  rotation: number; // градусы, по часовой на плане
}

export interface PlanLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  rotation: number; // градусы
  size: number; // высота букв, м
}

export interface Underlay {
  dataUrl: string | null;
  widthM: number; // ширина картинки в метрах
  aspect: number; // width / height картинки
  opacity: number;
  x: number; // мировые координаты левого верхнего угла
  y: number;
}

export interface GeoLocation {
  lat: number;
  lng: number;
  northAngle: number; // градусы: 0 = север «вверх» на плане, по часовой
  label?: string; // человекочитаемое название места
}

export type Tool = 'select' | 'wall' | 'window' | 'door' | 'passage' | 'desk' | 'chair' | 'note';
export type ViewMode = '2d' | '3d' | 'split';

export interface Selection {
  kind: 'wall' | 'opening' | 'furniture' | 'label';
  id: string;
}
