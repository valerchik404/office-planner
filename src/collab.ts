import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getDatabase, ref, onValue, set, get, remove, onDisconnect, type Database,
} from 'firebase/database';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { create } from 'zustand';
import { firebaseConfig } from './firebase-config';
import { useStore } from './store';
import { saveProjectRef } from './projects';
import type { Furniture, GeoLocation, Opening, PlanLabel, Underlay, Wall } from './types';

export const collabAvailable = Boolean(firebaseConfig);

export type Role = 'editor' | 'viewer';

interface CollabUI {
  roomId: string | null;
  role: Role | null;
  token: string | null;
  peers: number;
  projectName: string;
  error: string;
}

export const useCollab = create<CollabUI>(() => ({
  roomId: null, role: null, token: null, peers: 0, projectName: '', error: '',
}));

interface PlanPayload {
  by: string;
  rev: number;
  data: {
    walls?: Wall[]; openings?: Opening[]; furniture?: Furniture[];
    labels?: PlanLabel[]; location?: GeoLocation;
  };
}

interface UnderlayPayload {
  by: string;
  rev: number;
  data: Underlay;
}

let appInstance: FirebaseApp | null = null;
let myUid = '';
/** id вкладки — для подавления «эха» своих же записей (uid у вкладок одного браузера общий). */
const sessionId = Math.random().toString(36).slice(2, 10);
let unsubs: (() => void)[] = [];
let planTimer: ReturnType<typeof setTimeout> | null = null;
let underlayTimer: ReturnType<typeof setTimeout> | null = null;
let applyingRemote = false;

function db(): Database {
  if (!appInstance) appInstance = initializeApp(firebaseConfig!);
  return getDatabase(appInstance);
}

async function ensureAuth(): Promise<string> {
  const auth = getAuth(appInstance ?? (appInstance = initializeApp(firebaseConfig!)));
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

/** RTDB не принимает undefined — прогоняем через JSON. */
function clean<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function randId(n: number): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

function pushPlan(): void {
  const { roomId, role } = useCollab.getState();
  if (!roomId || role !== 'editor') return;
  const s = useStore.getState();
  set(ref(db(), `rooms/${roomId}/plan`), {
    by: sessionId,
    rev: Date.now(),
    data: clean({
      walls: s.walls, openings: s.openings, furniture: s.furniture,
      labels: s.labels ?? [], location: s.location,
    }),
  }).catch(() => { /* нет прав или сети — молча */ });
}

function pushUnderlay(): void {
  const { roomId, role } = useCollab.getState();
  if (!roomId || role !== 'editor') return;
  set(ref(db(), `rooms/${roomId}/underlay`), {
    by: sessionId,
    rev: Date.now(),
    data: clean(useStore.getState().underlay),
  }).catch(() => { /* ignore */ });
}

function applyPlan(p: PlanPayload): void {
  if (!p || !p.data) return;
  applyingRemote = true;
  useStore.setState({
    walls: p.data.walls ?? [],
    openings: p.data.openings ?? [],
    furniture: p.data.furniture ?? [],
    labels: p.data.labels ?? [],
    location: p.data.location ?? useStore.getState().location,
  });
  applyingRemote = false;
}

function applyUnderlay(p: UnderlayPayload): void {
  if (!p || !p.data) return;
  applyingRemote = true;
  useStore.setState({ underlay: { ...useStore.getState().underlay, ...p.data } });
  applyingRemote = false;
}

export function leaveRoom(clearHash = true): void {
  for (const u of unsubs) {
    try { u(); } catch { /* ignore */ }
  }
  unsubs = [];
  if (planTimer) clearTimeout(planTimer);
  if (underlayTimer) clearTimeout(underlayTimer);
  planTimer = underlayTimer = null;
  useStore.getState().setReadOnly(false);
  useCollab.setState({ roomId: null, role: null, token: null, peers: 0, projectName: '', error: '' });
  if (clearHash && location.hash.includes('room=')) {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

export async function joinRoom(roomId: string, token?: string): Promise<void> {
  if (!collabAvailable) return;
  const cur = useCollab.getState();
  if (cur.roomId === roomId && cur.role) return;
  leaveRoom(false);
  useCollab.setState({ roomId, role: null, token: token ?? null, error: '' });

  try {
    myUid = await ensureAuth();
  } catch {
    useCollab.setState({ roomId: null, error: 'Не удалось подключиться к облаку — попробуйте позже' });
    return;
  }
  const d = db();

  let role: Role = 'viewer';
  if (token) {
    try {
      await set(ref(d, `rooms/${roomId}/editors/${myUid}`), token);
      role = 'editor';
    } catch {
      useCollab.setState({ error: 'Ссылка редактирования не подошла — открыто в режиме просмотра' });
    }
  }

  // стартовое состояние: если в комнате уже есть план — берём его
  try {
    const planSnap = await get(ref(d, `rooms/${roomId}/plan`));
    if (planSnap.exists()) applyPlan(planSnap.val() as PlanPayload);
    else if (role === 'editor') pushPlan0(roomId);
    const underlaySnap = await get(ref(d, `rooms/${roomId}/underlay`));
    if (underlaySnap.exists()) applyUnderlay(underlaySnap.val() as UnderlayPayload);
    else if (role === 'editor') pushUnderlay0(roomId);
  } catch {
    useCollab.setState({ roomId: null, error: 'Комната недоступна' });
    return;
  }

  useStore.getState().setReadOnly(role !== 'editor');
  useCollab.setState({ roomId, role, token: role === 'editor' ? token ?? null : null });

  // подписки на удалённые изменения
  const u1 = onValue(ref(d, `rooms/${roomId}/plan`), (s) => {
    const v = s.val() as PlanPayload | null;
    if (v && v.by !== sessionId) applyPlan(v);
  });
  const u2 = onValue(ref(d, `rooms/${roomId}/underlay`), (s) => {
    const v = s.val() as UnderlayPayload | null;
    if (v && v.by !== sessionId) applyUnderlay(v);
  });
  const u3 = onValue(ref(d, `rooms/${roomId}/meta`), (s) => {
    const name = (s.val()?.name as string) || '';
    useCollab.setState({ projectName: name });
    if (name) saveProjectRef({ id: roomId, name, token: role === 'editor' ? token : undefined, lastOpened: Date.now() });
  });

  // присутствие (по вкладкам, чтобы «2 человека» честно считало окна)
  const meRef = ref(d, `rooms/${roomId}/presence/${sessionId}`);
  set(meRef, Date.now()).catch((e) => console.warn('presence write failed', e));
  onDisconnect(meRef).remove().catch((e) => console.warn('presence onDisconnect failed', e));
  const u4 = onValue(ref(d, `rooms/${roomId}/presence`), (s) => {
    useCollab.setState({ peers: s.exists() ? Object.keys(s.val() as object).length : 0 });
  });

  // локальные изменения → в облако (с защитой от эха)
  const u5 = useStore.subscribe((s, prev) => {
    if (applyingRemote || useCollab.getState().role !== 'editor') return;
    if (s.walls !== prev.walls || s.openings !== prev.openings || s.furniture !== prev.furniture || s.labels !== prev.labels || s.location !== prev.location) {
      if (planTimer) clearTimeout(planTimer);
      planTimer = setTimeout(pushPlan, 350);
    }
    if (s.underlay !== prev.underlay) {
      if (underlayTimer) clearTimeout(underlayTimer);
      underlayTimer = setTimeout(pushUnderlay, 600);
    }
  });

  unsubs = [u1, u2, u3, u4, u5, () => { remove(meRef).catch(() => { /* ignore */ }); }];

  // держим комнату в адресе, чтобы перезагрузка возвращала в проект
  const k = role === 'editor' && token ? `&k=${token}` : '';
  history.replaceState(null, '', `${location.pathname}${location.search}#room=${roomId}${k}`);
}

// начальная заливка при создании/пустой комнате (роль ещё не в сторе)
function pushPlan0(roomId: string): void {
  const s = useStore.getState();
  set(ref(db(), `rooms/${roomId}/plan`), {
    by: sessionId,
    rev: Date.now(),
    data: clean({
      walls: s.walls, openings: s.openings, furniture: s.furniture,
      labels: s.labels ?? [], location: s.location,
    }),
  }).catch(() => { /* ignore */ });
}

function pushUnderlay0(roomId: string): void {
  set(ref(db(), `rooms/${roomId}/underlay`), {
    by: sessionId,
    rev: Date.now(),
    data: clean(useStore.getState().underlay),
  }).catch(() => { /* ignore */ });
}

/** Создаёт облачный проект из текущего плана и входит в него редактором. */
export async function createProject(name: string): Promise<void> {
  if (!collabAvailable) throw new Error('collab off');
  myUid = await ensureAuth();
  const id = randId(12);
  const token = randId(20);
  const d = db();
  await set(ref(d, `rooms/${id}/secret`), token);
  await set(ref(d, `rooms/${id}/editors/${myUid}`), token);
  await set(ref(d, `rooms/${id}/meta`), { name, created: Date.now() });
  saveProjectRef({ id, name, token, lastOpened: Date.now() });
  await joinRoom(id, token);
}

export function roomLinks(): { view: string; edit: string | null } {
  const { roomId, token } = useCollab.getState();
  const base = `${location.origin}${location.pathname}${location.search}#room=${roomId}`;
  return { view: base, edit: token ? `${base}&k=${token}` : null };
}

/** Разбор #room=...&k=... из адреса. */
export function parseRoomHash(): { roomId: string; token?: string } | null {
  const m = location.hash.match(/room=([a-z0-9]+)/);
  if (!m) return null;
  const k = location.hash.match(/k=([a-z0-9]+)/);
  return { roomId: m[1], token: k?.[1] };
}
