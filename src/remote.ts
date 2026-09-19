import { validateState, type Action, type State } from './domain';

export type Snapshot = { state: State; version: number; savedAt: string };
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
  const data = await response.json().catch(() => null) as (T & { error?: string; state?: unknown; version?: number }) | null;
  if (response.status === 409 && data?.state) throw new ConflictError(data.error ?? 'Los datos cambiaron.', snapshot(data));
  if (!response.ok || !data) throw new Error(data?.error ?? 'El servidor no respondió como se esperaba.');
  return data;
}

function snapshot(data: { state?: unknown; version?: number }): Snapshot {
  const value = { state: validateState(data.state), version: Number(data.version), savedAt: new Date().toISOString() };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch { /* la copia sin conexión es opcional */ }
  return value;
}

export function cachedSnapshot(): Snapshot | null {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    return value ? { state: validateState(value.state), version: Number(value.version), savedAt: String(value.savedAt) } : null;
  } catch {
    return null;
  }
}

export async function fetchSnapshot() {
  const data = await request<{ state: unknown; version: number; admin: boolean }>('/api/state');
  return { ...snapshot(data), admin: data.admin };
}

export const sendAction = async (action: Action, version: number) =>
  snapshot(await request('/api/actions', { method: 'POST', body: JSON.stringify({ action, version }) }));

export const replaceState = async (state: State, version: number) =>
  snapshot(await request('/api/state', { method: 'PUT', body: JSON.stringify({ state, version }) }));

export const login = (password: string) => request<{ admin: boolean }>('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
export const logout = () => request<{ admin: boolean }>('/api/logout', { method: 'POST', body: '{}' });
export const fetchAudit = async () => (await request<{ entries: AuditEntry[] }>('/api/audit')).entries;
