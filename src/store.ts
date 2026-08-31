import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  Furniture, GeoLocation, Opening, PlanLabel, Selection, Tool, Underlay, ViewMode, Wall,
} from './types';
import { uid } from './geometry';

export interface ProjectData {
  walls: Wall[];
  openings: Opening[];
  furniture: Furniture[];
  labels?: PlanLabel[];
  underlay: Underlay;
  location: GeoLocation;
  sun: { dateISO: string; minutes: number };
}

interface AppState extends ProjectData {
  tool: Tool;
  viewMode: ViewMode;
  selection: Selection | null;
  multiSelect: string[]; // групповое выделение мебели
  readOnly: boolean;
  showDims: boolean;
  showSun: boolean;
  showRoof: boolean;

  toggleDims: () => void;
  toggleSun: () => void;
  toggleRoof: () => void;
  setMultiSelect: (ids: string[]) => void;
  setReadOnly: (v: boolean) => void;
  setTool: (t: Tool) => void;
  setViewMode: (m: ViewMode) => void;
  setSelection: (s: Selection | null) => void;

  addWall: (w: Omit<Wall, 'id'>) => string;
  updateWall: (id: string, patch: Partial<Wall>) => void;
  deleteWall: (id: string) => void;

  addOpening: (o: Omit<Opening, 'id'>) => string;
  updateOpening: (id: string, patch: Partial<Opening>) => void;
  deleteOpening: (id: string) => void;

  addFurniture: (f: Omit<Furniture, 'id'>) => string;
  updateFurniture: (id: string, patch: Partial<Furniture>) => void;
  deleteFurniture: (id: string) => void;

  addLabel: (l: Omit<PlanLabel, 'id'>) => string;
  updateLabel: (id: string, patch: Partial<PlanLabel>) => void;
  deleteLabel: (id: string) => void;

  setUnderlay: (patch: Partial<Underlay>) => void;
  setLocation: (patch: Partial<GeoLocation>) => void;
  setSun: (patch: Partial<{ dateISO: string; minutes: number }>) => void;

  deleteSelected: () => void;
  loadProject: (data: ProjectData) => void;
  clearProject: () => void;
}

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function demoProject(): ProjectData {
  const T = 0.2, H = 3;
  const w = (ax: number, ay: number, bx: number, by: number): Wall => ({
    id: uid(), a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness: T, height: H,
  });
  const walls = [
    w(0, 0, 12, 0),   // верхняя
    w(12, 0, 12, 8),  // правая
    w(12, 8, 0, 8),   // нижняя (при северном угле 0 — южная сторона)
    w(0, 8, 0, 0),    // левая
    w(8, 0, 8, 4),    // перегородка
  ];
  const [top, right, bottom, , inner] = walls;
  const op = (wallId: string, type: Opening['type'], center: number, width: number, sill: number, height: number): Opening => ({
    id: uid(), wallId, type, center, width, sillHeight: sill, height,
  });
  const openings = [
    op(bottom.id, 'window', 2.5, 2, 0.8, 1.6),
    op(bottom.id, 'window', 6, 2, 0.8, 1.6),
    op(bottom.id, 'window', 9.5, 2, 0.8, 1.6),
    op(right.id, 'window', 4, 1.6, 0.8, 1.6),
    op(top.id, 'door', 2, 1, 0, 2.1),
    op(inner.id, 'passage', 3, 1.2, 0, H),
  ];
  const fu = (type: Furniture['type'], x: number, y: number, rotation: number): Furniture => ({
    id: uid(), type, x, y, rotation,
  });
  const furniture = [
    fu('desk', 2.5, 6.4, 0), fu('chair', 2.5, 5.6, 0),
    fu('desk', 6, 6.4, 0), fu('chair', 6, 5.6, 0),
    fu('desk', 9.5, 6.4, 0), fu('chair', 9.5, 5.6, 0),
    fu('desk', 10.6, 4, 90), fu('chair', 9.8, 4, 90),
    fu('desk', 3, 2, 180), fu('chair', 3, 2.8, 180),
  ];
  const labels: PlanLabel[] = [
    { id: uid(), text: 'Переговорная', x: 10, y: 1.2, rotation: 0, size: 0.4 },
    { id: uid(), text: 'Опенспейс', x: 4, y: 4.5, rotation: 0, size: 0.5 },
  ];
  return {
    walls,
    openings,
    furniture,
    labels,
    underlay: { dataUrl: null, widthM: 12, aspect: 1.5, opacity: 0.4, x: 0, y: 0 },
    location: { lat: 55.751, lng: 37.618, northAngle: 0, label: 'Москва' },
    sun: { dateISO: todayISO(), minutes: 14 * 60 },
  };
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...demoProject(),
      tool: 'select',
      viewMode: 'split',
      selection: null,
      multiSelect: [],
      readOnly: false,
      showDims: false,
      showSun: false,
      showRoof: true,

      toggleDims: () => set((s) => ({ showDims: !s.showDims })),
      toggleSun: () => set((s) => ({ showSun: !s.showSun })),
      toggleRoof: () => set((s) => ({ showRoof: !s.showRoof })),
      setMultiSelect: (multiSelect) => set({ multiSelect, selection: null }),
      setReadOnly: (readOnly) => set({ readOnly, tool: 'select' }),
      setTool: (tool) => set({ tool, selection: null, multiSelect: [] }),
      setViewMode: (viewMode) => set({ viewMode }),
      setSelection: (selection) => set({ selection, multiSelect: [] }),

      addWall: (w) => {
        const id = uid();
        set((s) => ({ walls: [...s.walls, { ...w, id }] }));
        return id;
      },
      updateWall: (id, patch) =>
        set((s) => ({ walls: s.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),
      deleteWall: (id) =>
        set((s) => ({
          walls: s.walls.filter((w) => w.id !== id),
          openings: s.openings.filter((o) => o.wallId !== id),
          selection: null,
        })),

      addOpening: (o) => {
        const id = uid();
        set((s) => ({ openings: [...s.openings, { ...o, id }] }));
        return id;
      },
      updateOpening: (id, patch) =>
        set((s) => ({ openings: s.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
      deleteOpening: (id) =>
        set((s) => ({ openings: s.openings.filter((o) => o.id !== id), selection: null })),

      addFurniture: (f) => {
        const id = uid();
        set((s) => ({ furniture: [...s.furniture, { ...f, id }] }));
        return id;
      },
      updateFurniture: (id, patch) =>
        set((s) => ({ furniture: s.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      deleteFurniture: (id) =>
        set((s) => ({ furniture: s.furniture.filter((f) => f.id !== id), selection: null })),

      addLabel: (l) => {
        const id = uid();
        set((s) => ({ labels: [...(s.labels ?? []), { ...l, id }] }));
        return id;
      },
      updateLabel: (id, patch) =>
        set((s) => ({ labels: (s.labels ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
      deleteLabel: (id) =>
        set((s) => ({ labels: (s.labels ?? []).filter((l) => l.id !== id), selection: null })),

      setUnderlay: (patch) => set((s) => ({ underlay: { ...s.underlay, ...patch } })),
      setLocation: (patch) => set((s) => ({ location: { ...s.location, ...patch } })),
      setSun: (patch) => set((s) => ({ sun: { ...s.sun, ...patch } })),

      deleteSelected: () => {
        const multi = get().multiSelect;
        if (multi.length > 0) {
          set((s) => ({
            furniture: s.furniture.filter((f) => !multi.includes(f.id)),
            multiSelect: [],
          }));
          return;
        }
        const sel = get().selection;
        if (!sel) return;
        if (sel.kind === 'wall') get().deleteWall(sel.id);
        else if (sel.kind === 'opening') get().deleteOpening(sel.id);
        else if (sel.kind === 'label') get().deleteLabel(sel.id);
        else get().deleteFurniture(sel.id);
      },

      loadProject: (data) => set({ ...data, labels: data.labels ?? [], selection: null }),
      clearProject: () =>
        set({
          walls: [], openings: [], furniture: [], labels: [],
          underlay: { dataUrl: null, widthM: 12, aspect: 1.5, opacity: 0.4, x: 0, y: 0 },
          selection: null,
        }),
    }),
    {
      name: 'office-planner',
      // localStorage может бросать исключение (приватный режим, превью) — глушим
      storage: createJSONStorage(() => ({
        getItem: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
        setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* нет места или доступа */ } },
        removeItem: (k) => { try { localStorage.removeItem(k); } catch { /* нет доступа */ } },
      })),
      partialize: (s) => ({
        walls: s.walls,
        openings: s.openings,
        furniture: s.furniture,
        labels: s.labels ?? [],
        underlay: s.underlay,
        location: s.location,
        sun: s.sun,
      }),
    },
  ),
);

export function exportProject(): string {
  const s = useStore.getState();
  const data: ProjectData = {
    walls: s.walls, openings: s.openings, furniture: s.furniture, labels: s.labels ?? [],
    underlay: s.underlay, location: s.location, sun: s.sun,
  };
  return JSON.stringify(data, null, 2);
}
