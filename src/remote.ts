import { validateState, type Action, type Player, type State } from './domain';
import { isPhotoRef, validPlayerPhoto } from './playerPhoto';

/** `tag` identifica la versión guardada en el servidor; con ella se pregunta si hubo cambios sin bajar todo. */
export type Snapshot = { state: State; version: number; savedAt: string; tag: string };
export type AuditEntry = { at: string; type: string; summary: string; reason: string | null };

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

export async function fetchSnapshot() {
  const cached = cachedSnapshot();
  const data = await request<{ state?: unknown; version: number; admin: boolean }>(`/api/state${cached?.tag ? `?tag=${encodeURIComponent(cached.tag)}` : ''}`);
  // Sin `state` el servidor confirma que la copia guardada sigue vigente.
  return { ...snapshot(data.state || !cached ? data : { ...data, state: cached.state }), admin: data.admin };
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

/** El servidor guarda referencias: cada foto nueva se sube en su propia petición antes de guardar la ficha. */
async function uploaded(player: Player): Promise<Player> {
  if (!player.photo || isPhotoRef(player.photo)) return player;
  const { photo } = await request<{ photo: string }>('/api/photos', { method: 'POST', body: JSON.stringify({ photo: player.photo }) });
  return { ...player, photo };
}

async function embedded(player: Player): Promise<Player> {
  if (!isPhotoRef(player.photo)) return player;
  const failed = new Error(`No se pudo descargar la foto de ${player.name}. Revisá tu conexión y volvé a exportar.`);
  const response = await fetch(player.photo).catch(() => { throw failed; });
  if (!response.ok) throw failed;
  const blob = await response.blob();
  const photo = await new Promise<unknown>(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  if (!validPlayerPhoto(photo)) throw failed;
  return { ...player, photo };
}

/** Los respaldos llevan las fotos adentro para poder restaurarse en cualquier servidor. */
export const exportState = async (state: State): Promise<State> => ({ ...state, players: await pooled(state.players, embedded) });

export const sendAction = async (action: Action, version: number) => {
  if (action.type === 'player.save') action = { ...action, player: await uploaded(action.player) };
  return snapshot(await request('/api/actions', { method: 'POST', body: JSON.stringify({ action, version }) }));
};

export const replaceState = async (state: State, version: number) =>
  snapshot(await request('/api/state', { method: 'PUT', body: JSON.stringify({ state: { ...state, players: await pooled(state.players, uploaded) }, version }) }));

export const login = (password: string) => request<{ admin: boolean }>('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
/** Con `all` el servidor cierra también las sesiones abiertas en otros dispositivos. */
export const logout = (all = false) => request<{ admin: boolean }>('/api/logout', { method: 'POST', body: JSON.stringify({ all }) });
export const fetchAudit = async () => (await request<{ entries: AuditEntry[] }>('/api/audit')).entries;
