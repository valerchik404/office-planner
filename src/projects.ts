import type { ProjectData } from './store';

/** Локальный список проектов пользователя (какие комнаты он создавал/открывал). */
export interface ProjectRef {
  id: string;
  name: string;
  token?: string; // есть токен — есть право редактирования
  lastOpened: number;
}

const KEY = 'office-planner-projects';
const DRAFT_KEY = 'office-planner-draft-backup';

export function listProjects(): ProjectRef[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as ProjectRef[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveProjectRef(p: ProjectRef): void {
  const prev = listProjects().find((x) => x.id === p.id);
  const merged: ProjectRef = { ...prev, ...p, token: p.token ?? prev?.token };
  const list = [merged, ...listProjects().filter((x) => x.id !== p.id)].slice(0, 50);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* нет места — не страшно */ }
}

export function removeProjectRef(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(listProjects().filter((x) => x.id !== id)));
  } catch { /* ignore */ }
}

/** Резервная копия локального черновика перед входом в облачный проект. */
export function backupDraft(json: string): void {
  try {
    localStorage.setItem(DRAFT_KEY, json);
  } catch { /* ignore */ }
}

export function readDraftBackup(): ProjectData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as ProjectData;
    return Array.isArray(data.walls) ? data : null;
  } catch {
    return null;
  }
}
