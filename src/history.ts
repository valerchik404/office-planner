import { useStore } from './store';
import type { Furniture, Opening, PlanLabel, Underlay, Wall } from './types';

/** Отмена/повтор: снимки данных плана. Быстрые серии правок (перетаскивание)
 *  схлопываются в один шаг по окну 500 мс. */
interface Snap {
  walls: Wall[];
  openings: Opening[];
  furniture: Furniture[];
  labels: PlanLabel[];
  underlay: Underlay;
}

const LIMIT = 80;
let past: Snap[] = [];
let future: Snap[] = [];
let current: Snap | null = null;
let lastPush = 0;
let applying = false;
let inited = false;

function take(): Snap {
  const s = useStore.getState();
  return {
    walls: s.walls,
    openings: s.openings,
    furniture: s.furniture,
    labels: s.labels ?? [],
    underlay: s.underlay,
  };
}

function changed(a: Snap, b: Snap): boolean {
  return (
    a.walls !== b.walls || a.openings !== b.openings || a.furniture !== b.furniture ||
    a.labels !== b.labels || a.underlay !== b.underlay
  );
}

export function initHistory(): void {
  if (inited) return;
  inited = true;
  current = take();
  useStore.subscribe(() => {
    if (applying || !current) return;
    const next = take();
    if (!changed(next, current)) return;
    const now = Date.now();
    if (now - lastPush > 500) {
      past.push(current);
      if (past.length > LIMIT) past.shift();
      future = [];
      lastPush = now;
    }
    current = next;
  });
}

function apply(snap: Snap): void {
  applying = true;
  useStore.setState({ ...snap, selection: null, multiSelect: [] });
  applying = false;
  current = snap;
  lastPush = 0;
}

export function undo(): void {
  if (past.length === 0 || !current) return;
  future.push(current);
  apply(past.pop()!);
}

export function redo(): void {
  if (future.length === 0 || !current) return;
  past.push(current);
  apply(future.pop()!);
}
