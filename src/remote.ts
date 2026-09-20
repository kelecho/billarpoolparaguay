import { validateState, type Action, type Player, type State, type Tournament } from './domain';
import { isPhotoRef, validBanner, validPlayerPhoto } from './playerPhoto';
import type { Role, User } from './roles';

/** `tag` identifica la versión guardada en el servidor; con ella se pregunta si hubo cambios sin bajar todo. */
export type Snapshot = { state: State; version: number; savedAt: string; tag: string };
export type AuditEntry = { at: string; type: string; summary: string; reason: string | null; actor: string | null };
export type AccountInput = { email: string; name: string; role: Role; active?: boolean; password?: string };

/** La compilación `--mode remote` lee y escribe en el servidor; la normal guarda en el navegador. */
export const REMOTE = import.meta.env.MODE === 'remote';
export const CACHE_KEY = 'pool-paraguay-remote-v1';

/** El servidor rechazó el cambio porque había una versión más nueva; trae los datos actuales. */
export class ConflictError extends Error {
  constructor(message: string, readonly snapshot: Snapshot) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'same-origin', ...init, headers: init?.body ? { 'content-type': 'application/json' } : undefined });
  } catch {
    throw new Error('No hay conexión con el servidor. Revisá tu internet y volvé a intentar.');
  }
  const data = await response.json().catch(() => null) as (T & { error?: string; state?: unknown; version?: number; tag?: string }) | null;
  if (response.status === 409 && data?.state) throw new ConflictError(data.error ?? 'Los datos cambiaron.', snapshot(data));
  if (!response.ok || !data) throw new Error(data?.error ?? 'El servidor no respondió como se esperaba.');
  return data;
}

function snapshot(data: { state?: unknown; version?: number; tag?: string }): Snapshot {
  const value = { state: validateState(data.state), version: Number(data.version), savedAt: new Date().toISOString(), tag: String(data.tag ?? '') };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch { /* la copia sin conexión es opcional */ }
  return value;
}

export function cachedSnapshot(): Snapshot | null {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    return value ? { state: validateState(value.state), version: Number(value.version), savedAt: String(value.savedAt), tag: String(value.tag ?? '') } : null;
  } catch {
    return null;
  }
}

/** `current` es lo que la página ya tiene: si el servidor confirma que sigue vigente, se devuelve tal cual, sin volver a validar ni guardar. */
export async function fetchSnapshot(current: Snapshot | null) {
  const data = await request<{ state?: unknown; version: number; user: User | null }>(`/api/state${current?.tag ? `?tag=${encodeURIComponent(current.tag)}` : ''}`);
  return { ...(data.state || !current ? snapshot(data) : current), user: data.user };
}

/** Pocas tareas a la vez: un respaldo con cientos de fotos no satura la conexión ni el servidor. */
async function pooled<T, R>(items: T[], task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await task(items[i]); }
  }));
  return results;
}

/** El servidor guarda referencias: cada imagen nueva se sube en su propia petición antes de guardar la ficha o el torneo. */
async function upload(image: string | undefined, kind: 'photo' | 'banner') {
  if (!image || isPhotoRef(image)) return image;
  return (await request<{ photo: string }>('/api/photos', { method: 'POST', body: JSON.stringify({ photo: image, kind }) })).photo;
}
const uploadedPlayer = async (player: Player): Promise<Player> => player.photo ? { ...player, photo: await upload(player.photo, 'photo') } : player;
const uploadedTournament = async (tournament: Tournament): Promise<Tournament> => tournament.banner ? { ...tournament, banner: await upload(tournament.banner, 'banner') } : tournament;

async function embed(ref: string | undefined, valid: (image: unknown) => image is string, owner: string) {
  if (!isPhotoRef(ref)) return ref;
  const failed = new Error(`No se pudo descargar la imagen de ${owner}. Revisá tu conexión y volvé a exportar.`);
  const response = await fetch(ref).catch(() => { throw failed; });
  if (!response.ok) throw failed;
  const blob = await response.blob();
  const image = await new Promise<unknown>(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  if (!valid(image)) throw failed;
  return image;
}

/** Los respaldos llevan las fotos y los banners adentro para poder restaurarse en cualquier servidor. */
export const exportState = async (state: State): Promise<State> => ({
  ...state,
  players: await pooled(state.players, async p => p.photo ? { ...p, photo: await embed(p.photo, validPlayerPhoto, p.name) } : p),
  tournaments: await pooled(state.tournaments, async t => t.banner ? { ...t, banner: await embed(t.banner, validBanner, t.name) } : t),
});

export const sendAction = async (action: Action, version: number) => {
  if (action.type === 'player.save') action = { ...action, player: await uploadedPlayer(action.player) };
  if (action.type === 'tournament.save') action = { ...action, tournament: await uploadedTournament(action.tournament) };
  if (action.type === 'tournament.banner') action = { ...action, banner: await upload(action.banner, 'banner') };
  return snapshot(await request('/api/actions', { method: 'POST', body: JSON.stringify({ action, version }) }));
};

export const replaceState = async (state: State, version: number) =>
  snapshot(await request('/api/state', { method: 'PUT', body: JSON.stringify({ state: { ...state, players: await pooled(state.players, uploadedPlayer), tournaments: await pooled(state.tournaments, uploadedTournament) }, version }) }));

export const login = (email: string, password: string) => request<{ user: User }>('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
/** Con `all` el servidor cierra también las sesiones de la cuenta abiertas en otros dispositivos. */
export const logout = (all = false) => request<{ user: null }>('/api/logout', { method: 'POST', body: JSON.stringify({ all }) });
export const fetchAudit = async () => (await request<{ entries: AuditEntry[] }>('/api/audit')).entries;

export const changePassword = (current: string, next: string) => request<{ changed: boolean }>('/api/password', { method: 'POST', body: JSON.stringify({ current, next }) });
export const fetchUsers = async () => (await request<{ users: User[] }>('/api/users')).users;
export const createUser = (account: AccountInput) => request<{ user: User }>('/api/users', { method: 'POST', body: JSON.stringify(account) });
export const updateUser = (id: string, changes: Partial<AccountInput>) => request<{ user: User }>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
export const deleteUser = (id: string) => request<{ deleted: boolean }>(`/api/users/${id}`, { method: 'DELETE', body: '{}' });
