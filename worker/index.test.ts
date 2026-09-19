import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error: adaptador en JavaScript, sin tipos
import { createD1 } from '../scripts/d1-node.mjs';
import { createState } from '../src/domain.ts';
import worker, { type Env } from './index.ts';

const ORIGIN = 'https://pool.example';
let env: Env;
let cookie = '';

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const response = await worker.fetch(new Request(ORIGIN + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
  return { status: response.status, headers: response.headers, data: await response.json() as any };
}

async function login() {
  const response = await call('POST', '/api/login', { password: 'clave-de-prueba' });
  cookie = response.headers.get('set-cookie')!.split(';')[0];
  return response;
}

const player = { id: 'ana', name: 'Ana Vera', city: 'Asunción', club: '', initialPoints: 900 };

beforeEach(() => {
  cookie = '';
  env = { DB: createD1(), ADMIN_PASSWORD: 'clave-de-prueba', ASSETS: { fetch: async () => new Response('app') } } as unknown as Env;
});

describe('API del ranking compartido', () => {
  it('publica el ranking sin sesión y rechaza escrituras anónimas', async () => {
    const state = await call('GET', '/api/state');
    expect(state.data).toMatchObject({ version: 0, admin: false, state: { players: [] } });
    expect((await call('POST', '/api/actions', { action: { type: 'player.save', player }, version: 0 })).status).toBe(401);
    expect((await call('GET', '/api/audit')).status).toBe(401);
  });

  it('inicia sesión con cookie protegida y bloquea tras cinco intentos fallidos', async () => {
    const ok = await login();
    expect(ok.headers.get('set-cookie')).toMatch(/HttpOnly; Secure; SameSite=Strict/);
    expect((await call('GET', '/api/state')).data.admin).toBe(true);
    cookie = '';
    for (let i = 0; i < 5; i++) expect((await call('POST', '/api/login', { password: 'incorrecta' })).status).toBe(401);
    expect((await call('POST', '/api/login', { password: 'clave-de-prueba' })).status).toBe(429);
  });

  it('no acepta una cookie firmada con otra contraseña ni inventada', async () => {
    await login();
    env.ADMIN_PASSWORD = 'otra-clave-distinta';
    expect((await call('GET', '/api/state')).data.admin).toBe(false);
    cookie = 'pool_admin=99999999999.abcdef';
    expect((await call('GET', '/api/state')).data.admin).toBe(false);
  });

  it('aplica acciones con las reglas del dominio, versiona y audita', async () => {
    await login();
    const saved = await call('POST', '/api/actions', { action: { type: 'player.save', player }, version: 0 });
    expect(saved).toMatchObject({ status: 200, data: { version: 1 } });
    const stale = await call('POST', '/api/actions', { action: { type: 'player.save', player: { ...player, id: 'luis', name: 'Luis López' } }, version: 0 });
    expect(stale).toMatchObject({ status: 409, data: { version: 1 } });
    const duplicate = await call('POST', '/api/actions', { action: { type: 'player.save', player: { ...player, id: 'otra' } }, version: 1 });
    expect(duplicate.status).toBe(422);
    expect(duplicate.data.error).toMatch(/Ya existe/);
    expect((await call('GET', '/api/state')).data.state.players).toHaveLength(1);
    expect((await call('GET', '/api/audit')).data.entries).toMatchObject([{ type: 'player.save', summary: 'Agregó al jugador Ana Vera' }]);
  });

  it('guarda el motivo de una corrección en la auditoría', async () => {
    await login();
    await call('PUT', '/api/state', { state: createState(), version: 0 });
    const reopened = await call('POST', '/api/actions', { action: { type: 'results.reopen', tournamentId: 't3', reason: 'Puesto mal cargado' }, version: 1 });
    expect(reopened.status).toBe(200);
    expect((await call('GET', '/api/audit')).data.entries[0]).toMatchObject({ type: 'results.reopen', reason: 'Puesto mal cargado' });
  });

  it('restaura un respaldo validado y nunca lo publica como demostración', async () => {
    await login();
    expect((await call('PUT', '/api/state', { state: { version: 1 }, version: 0 })).status).toBe(422);
    const restored = await call('PUT', '/api/state', { state: createState(), version: 0 });
    expect(restored.data.state).toMatchObject({ demo: false });
    expect(restored.data.state.players).toHaveLength(12);
  });

  it('rechaza escrituras desde otro origen y deja el resto al sitio estático', async () => {
    await login();
    expect((await call('POST', '/api/actions', { action: { type: 'player.save', player }, version: 0 }, { origin: 'https://otro.example' })).status).toBe(403);
    const page = await worker.fetch(new Request(`${ORIGIN}/torneos`), env);
    expect(await page.text()).toBe('app');
  });
});
