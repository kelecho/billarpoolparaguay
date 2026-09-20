import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error: adaptador en JavaScript, sin tipos
import { createD1 } from '../scripts/d1-node.mjs';
// @ts-expect-error: adaptador en JavaScript, sin tipos
import { createR2 } from '../scripts/r2-node.mjs';
// @ts-expect-error: comando en JavaScript, sin tipos
import { saveUser } from '../scripts/create-user.mjs';
import { applyAction, createState, type Action } from '../src/domain.ts';
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

const ADMIN = { email: 'admin@pool.test', name: 'Ada Admin', role: 'superadmin', password: 'clave-de-prueba' };
const SUPERVISOR = { email: 'supervisor@pool.test', name: 'Susana Supervisora', role: 'supervisor', password: 'clave-de-supervisora' };

async function login(account = ADMIN) {
  const response = await call('POST', '/api/login', { email: account.email, password: account.password });
  cookie = response.headers.get('set-cookie')!.split(';')[0];
  return response;
}

const player = { id: 'ana', name: 'Ana Vera', city: 'Asunción', club: '', initialPoints: 900 };

beforeEach(async () => {
  cookie = '';
  env = { DB: createD1(), PHOTOS: createR2(), ASSETS: { fetch: async () => new Response('app') } } as unknown as Env;
  await saveUser(env.DB, ADMIN);
});

describe('API del ranking compartido', () => {
  it('publica el ranking sin sesión y rechaza escrituras anónimas', async () => {
    const state = await call('GET', '/api/state');
    expect(state.data).toMatchObject({ version: 0, user: null, state: { players: [] } });
    expect((await call('POST', '/api/actions', { action: { type: 'player.save', player }, version: 0 })).status).toBe(401);
    expect((await call('GET', '/api/audit')).status).toBe(401);
  });

  it('inicia sesión con cookie protegida y bloquea tras cinco intentos fallidos', async () => {
    const ok = await login();
    expect(ok.headers.get('set-cookie')).toMatch(/HttpOnly; Secure; SameSite=Strict/);
    expect(ok.data.user).toEqual({ id: expect.any(String), email: ADMIN.email, name: ADMIN.name, role: 'superadmin', active: true, mustChangePassword: false });
    expect((await call('GET', '/api/state')).data.user).toEqual(ok.data.user);
    cookie = '';
    for (let i = 0; i < 5; i++) expect((await call('POST', '/api/login', { email: ADMIN.email, password: 'incorrecta' })).status).toBe(401);
    expect((await call('POST', '/api/login', { email: ADMIN.email, password: ADMIN.password })).status).toBe(429);
  });

  it('no distingue un correo desconocido de una contraseña errada ni acepta una cookie inventada', async () => {
    const unknown = await call('POST', '/api/login', { email: 'nadie@pool.test', password: ADMIN.password });
    const wrong = await call('POST', '/api/login', { email: ADMIN.email, password: 'incorrecta-123' });
    expect([unknown.status, unknown.data]).toEqual([wrong.status, wrong.data]);
    expect(unknown.status).toBe(401);
    expect((await call('POST', '/api/login', { email: ` ${ADMIN.email.toUpperCase()} `, password: ADMIN.password })).status).toBe(200);
    const response = await login();
    expect(response.headers.get('set-cookie')).toMatch(/^__Host-pool_session=[0-9a-f]{64};/);
    cookie = `__Host-pool_session=${'a'.repeat(64)}`;
    expect((await call('GET', '/api/state')).data.user).toBeNull();
  });

  it('cerrar sesión la invalida en el servidor, también en otros dispositivos', async () => {
    await login();
    const phone = cookie;
    await login();
    const laptop = cookie;
    expect((await call('POST', '/api/logout', { all: false })).status).toBe(200);
    expect((await call('GET', '/api/state')).data.user).toBeNull();
    cookie = phone;
    expect((await call('GET', '/api/state')).data.user).toMatchObject({ email: ADMIN.email });
    expect((await call('POST', '/api/logout', { all: true })).status).toBe(200);
    for (cookie of [phone, laptop]) expect((await call('POST', '/api/actions', { action: { type: 'player.save', player }, version: 0 })).status).toBe(401);
    cookie = '';
    expect((await call('POST', '/api/logout', { all: true })).status).toBe(401);
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>();
    expect(row!.n).toBe(0);
  });

  it('la sesión vence y no guarda el token en la base', async () => {
    await login();
    const stored = await env.DB.prepare('SELECT id FROM sessions').first<{ id: string }>();
    expect(cookie).not.toContain(stored!.id);
    await env.DB.prepare('UPDATE sessions SET expires_at = ?').bind(Math.floor(Date.now() / 1000) - 1).run();
    expect((await call('GET', '/api/state')).data.user).toBeNull();
  });

  it('limita los intentos por red IPv6, en paralelo y entre todas las direcciones', async () => {
    const attempt = (ip: string, password = 'incorrecta') => call('POST', '/api/login', { email: ADMIN.email, password }, { 'cf-connecting-ip': ip });
    const parallel = await Promise.all(Array.from({ length: 12 }, (_, i) => attempt(`2001:db8:1:2::${i + 1}`)));
    expect(parallel.filter(r => r.status === 401)).toHaveLength(5);
    expect((await attempt('2001:db8:1:2:ffff::9', 'clave-de-prueba')).status).toBe(429);
    expect((await attempt('2001:db8:1:3::1', 'clave-de-prueba')).status).toBe(200);
    expect((await attempt('2001:db8:1:3::1', 'clave-de-prueba')).status).toBe(200);
    for (let i = 0; i < 95; i++) await attempt(`10.0.${i}.1`);
    expect((await attempt('10.9.9.9', 'clave-de-prueba')).status).toBe(429);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts').first<{ n: number }>())!.n).toBe(100);
  });

  it('corta los cuerpos demasiado grandes sin leerlos enteros', async () => {
    const big = 'x'.repeat(5000);
    expect((await call('POST', '/api/login', { email: ADMIN.email, password: big })).status).toBe(413);
    const streamed = await worker.fetch(new Request(`${ORIGIN}/api/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, duplex: 'half',
      body: new ReadableStream({ pull(controller) { controller.enqueue(new TextEncoder().encode(big)); } }),
    } as RequestInit), env);
    expect(streamed.status).toBe(413);
    await login();
    expect((await call('POST', '/api/actions', { action: { type: 'player.save', player: { ...player, club: 'x'.repeat(300_000) } }, version: 0 })).status).toBe(413);
  });

  it('responde con cabeceras de seguridad y no vuelve a recorrer las tablas si nadie guardó', async () => {
    const first = await call('GET', '/api/state');
    expect(first.headers.get('x-content-type-options')).toBe('nosniff');
    expect(first.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(first.headers.get('cache-control')).toBe('no-store');
    let reads = 0;
    const { batch } = env.DB;
    env.DB.batch = (async (list: any[]) => { reads++; return batch(list); }) as typeof env.DB.batch;
    for (let i = 0; i < 5; i++) expect((await call('GET', '/api/state')).data).toEqual(first.data);
    expect(reads).toBe(0);
    env.DB.batch = batch;
    await login();
    await call('POST', '/api/actions', { action: { type: 'player.save', player }, version: 0 });
    expect((await call('GET', '/api/state')).data).toMatchObject({ version: 1, user: { role: 'superadmin' }, state: { players: [{ id: 'ana' }] } });
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
    expect((await call('GET', '/api/audit')).data.entries).toMatchObject([{ type: 'player.save', summary: 'Agregó al jugador Ana Vera', actor: ADMIN.email }]);
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

describe('Cuentas y roles', () => {
  const account = { email: 'Nueva@Pool.Test ', name: ' Nora Nueva ', role: 'supervisor', password: 'clave-de-nora-123' };

  it('el supervisor carga datos pero no toca reglas, respaldos, cuentas ni auditoría', async () => {
    await saveUser(env.DB, SUPERVISOR);
    await login(SUPERVISOR);
    expect((await call('GET', '/api/state')).data.user).toMatchObject({ role: 'supervisor', name: SUPERVISOR.name });
    expect((await call('POST', '/api/actions', { action: { type: 'player.save', player }, version: 0 })).status).toBe(200);
    const rules = createState(false).rules;
    expect((await call('POST', '/api/actions', { action: { type: 'rules.save', rules }, version: 1 })).status).toBe(403);
    expect((await call('PUT', '/api/state', { state: createState(false), version: 1 })).status).toBe(403);
    expect((await call('GET', '/api/audit')).status).toBe(403);
    expect((await call('GET', '/api/users')).status).toBe(403);
    expect((await call('POST', '/api/users', account)).status).toBe(403);
    await login();
    expect((await call('POST', '/api/actions', { action: { type: 'rules.save', rules }, version: 1 })).status).toBe(200);
    expect((await call('GET', '/api/audit')).data.entries.map((e: { actor: string }) => e.actor)).toEqual([ADMIN.email, SUPERVISOR.email]);
  });

  it('el superadministrador crea, edita, desactiva y elimina cuentas, y todo queda auditado', async () => {
    expect((await call('GET', '/api/users')).status).toBe(401);
    await login();
    const created = await call('POST', '/api/users', account);
    expect(created).toMatchObject({ status: 201, data: { user: { email: 'nueva@pool.test', name: 'Nora Nueva', role: 'supervisor', active: true } } });
    expect((await call('POST', '/api/users', { ...account, name: 'Otra' })).status).toBe(422);
    expect((await call('POST', '/api/users', { ...account, email: 'corta@pool.test', password: 'corta' })).status).toBe(422);
    expect((await call('POST', '/api/users', { ...account, email: 'rol@pool.test', role: 'dueño' })).status).toBe(422);
    expect((await call('POST', '/api/users', { ...account, email: 'sin-arroba' })).status).toBe(422);
    const stored = await env.DB.prepare('SELECT password_hash FROM users WHERE email = ?').bind('nueva@pool.test').first<{ password_hash: string }>();
    expect(stored!.password_hash).toMatch(/^pbkdf2-sha256\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(JSON.stringify((await call('GET', '/api/users')).data)).not.toContain('pbkdf2');

    const id = created.data.user.id;
    const admin = cookie;
    const nora = { ...account, email: 'nueva@pool.test', password: 'clave-propia-de-nora' };
    await login({ ...nora, password: account.password });
    expect((await call('POST', '/api/password', { current: account.password, next: nora.password })).status).toBe(200);
    const noraSession = cookie;
    cookie = admin;
    expect((await call('PATCH', `/api/users/${id}`, { role: 'superadmin' })).data.user.role).toBe('superadmin');
    cookie = noraSession;
    expect((await call('GET', '/api/state')).data.user).toBeNull();
    cookie = admin;
    expect((await call('PATCH', `/api/users/${id}`, { active: false })).status).toBe(200);
    cookie = '';
    expect((await call('POST', '/api/login', { email: nora.email, password: nora.password })).status).toBe(401);
    cookie = admin;
    expect((await call('PATCH', `/api/users/${id}`, { active: true, password: 'otra-clave-de-nora' })).status).toBe(200);
    expect((await login({ ...nora, password: 'otra-clave-de-nora' })).status).toBe(200);
    cookie = admin;
    expect((await call('DELETE', `/api/users/${id}`, {})).status).toBe(200);
    expect((await call('GET', '/api/users')).data.users).toHaveLength(1);
    expect((await call('GET', '/api/audit')).data.entries.map((e: { type: string }) => e.type)).toEqual(['user.delete', 'user.update', 'user.update', 'user.update', 'user.password', 'user.create']);
  });

  it('nadie se quita a sí mismo el acceso: siempre queda un superadministrador', async () => {
    const me = (await login()).data.user.id;
    expect((await call('PATCH', `/api/users/${me}`, { role: 'supervisor' })).status).toBe(422);
    expect((await call('PATCH', `/api/users/${me}`, { active: false })).status).toBe(422);
    expect((await call('PATCH', `/api/users/${me}`, { password: 'sin-la-clave-actual' })).status).toBe(422);
    expect((await call('DELETE', `/api/users/${me}`, {})).status).toBe(422);
    expect((await call('PATCH', `/api/users/${me}`, { name: 'Ada Lovelace' })).data.user).toMatchObject({ name: 'Ada Lovelace', role: 'superadmin' });
  });

  it('cada persona cambia su contraseña con la actual y se cierran sus otras sesiones', async () => {
    await login();
    const other = cookie;
    await login();
    expect((await call('POST', '/api/password', { current: 'no-es-la-actual', next: 'clave-nueva-larga' })).status).toBe(422);
    expect((await call('POST', '/api/password', { current: ADMIN.password, next: 'corta' })).status).toBe(422);
    expect((await call('POST', '/api/password', { current: ADMIN.password, next: 'clave-nueva-larga' })).status).toBe(200);
    expect((await call('GET', '/api/state')).data.user).toMatchObject({ email: ADMIN.email });
    cookie = other;
    expect((await call('GET', '/api/state')).data.user).toBeNull();
    cookie = '';
    expect((await call('POST', '/api/login', { email: ADMIN.email, password: ADMIN.password })).status).toBe(401);
    expect((await login({ ...ADMIN, password: 'clave-nueva-larga' })).status).toBe(200);
  });

  it('con la contraseña inicial solo se puede elegir una propia o salir', async () => {
    await login();
    await call('POST', '/api/users', account);
    const nora = { ...account, email: 'nueva@pool.test' };
    expect((await login(nora)).data.user).toMatchObject({ mustChangePassword: true });
    expect((await call('GET', '/api/state')).data.user).toMatchObject({ mustChangePassword: true });
    const blocked = await call('POST', '/api/actions', { action: { type: 'player.save', player }, version: 0 });
    expect(blocked).toMatchObject({ status: 403, data: { error: 'Elegí tu propia contraseña antes de continuar.' } });
    expect((await call('POST', '/api/photos', { photo: 'x' })).status).toBe(403);
    expect((await call('POST', '/api/password', { current: nora.password, next: nora.password })).status).toBe(422);
    expect((await call('POST', '/api/password', { current: nora.password, next: 'clave-propia-de-nora' })).status).toBe(200);
    expect((await call('GET', '/api/state')).data.user).toMatchObject({ mustChangePassword: false });
    expect((await call('POST', '/api/actions', { action: { type: 'player.save', player }, version: 0 })).status).toBe(200);

    // Si el superadministrador le repone la clave, vuelve a tener que elegir una propia.
    const noraId = (await call('GET', '/api/state')).data.user.id;
    await login();
    expect((await call('PATCH', `/api/users/${noraId}`, { password: 'clave-repuesta-123' })).data.user).toMatchObject({ mustChangePassword: true });
    expect((await login({ ...nora, password: 'clave-repuesta-123' })).data.user.mustChangePassword).toBe(true);
    expect((await call('POST', '/api/logout', { all: true })).status).toBe(200);
  });

  it('el comando de recuperación repone la contraseña y cierra las sesiones abiertas', async () => {
    await login();
    await saveUser(env.DB, { ...ADMIN, password: 'clave-recuperada-1' });
    expect((await call('GET', '/api/state')).data.user).toBeNull();
    expect((await login({ ...ADMIN, password: 'clave-recuperada-1' })).status).toBe(200);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>())!.n).toBe(1);
  });
});

describe('Fotos compartidas', () => {
  async function photoFixture() {
    const { readFileSync } = await import('node:fs');
    return `data:image/jpeg;base64,${readFileSync(new URL('../tests/fixtures/player.jpg', import.meta.url)).toString('base64')}`;
  }
  const upload = async (photo: string) => (await call('POST', '/api/photos', { photo })).data.photo as string;
  const stored = async (ref: string) => (await worker.fetch(new Request(ORIGIN + ref), env)).status === 200;

  it('guarda la foto en R2, deja la referencia en la ficha y la publica con caché permanente', async () => {
    const photo = await photoFixture();
    expect((await call('POST', '/api/photos', { photo })).status).toBe(401);
    await login();
    const ref = await upload(photo);
    expect(ref).toMatch(/^\/api\/photos\/[0-9a-f]{64}\.jpg$/);
    expect(await upload(photo)).toBe(ref);
    expect((await call('POST', '/api/actions', { action: { type: 'player.save', player: { ...player, photo: ref } }, version: 0 })).status).toBe(200);
    cookie = '';
    expect((await call('GET', '/api/state')).data.state.players[0].photo).toBe(ref);
    const served = await worker.fetch(new Request(ORIGIN + ref), env);
    expect(served.headers.get('content-type')).toBe('image/jpeg');
    expect(served.headers.get('cache-control')).toContain('immutable');
    expect(`data:image/jpeg;base64,${Buffer.from(await served.arrayBuffer()).toString('base64')}`).toBe(photo);
    expect((await call('GET', `/api/photos/${'0'.repeat(64)}.jpg`)).status).toBe(404);
  });

  it('rechaza fotos inválidas, incrustadas o sin subir', async () => {
    await login();
    const photo = await photoFixture();
    expect((await call('POST', '/api/photos', { photo: 'data:image/svg+xml;base64,PHN2Zy8+' })).status).toBe(422);
    const save = (value: string) => call('POST', '/api/actions', { action: { type: 'player.save', player: { ...player, photo: value } }, version: 0 });
    expect((await save(photo)).status).toBe(422);
    expect((await save(`/api/photos/${'a'.repeat(64)}.jpg`)).status).toBe(422);
    expect((await save('https://otro.example/foto.jpg')).status).toBe(422);
    expect((await call('PUT', '/api/state', { state: { ...createState(false), players: [{ ...player, photo }] }, version: 0 })).status).toBe(422);
  });

  it('borra de R2 las fotos que quedan sin ficha y conserva la foto ante un conflicto', async () => {
    await login();
    const ref = await upload(await photoFixture());
    await call('POST', '/api/actions', { action: { type: 'player.save', player: { ...player, photo: ref } }, version: 0 });
    expect((await call('POST', '/api/actions', { action: { type: 'player.save', player }, version: 0 })).status).toBe(409);
    expect(await stored(ref)).toBe(true);
    expect((await call('POST', '/api/actions', { action: { type: 'player.save', player }, version: 1 })).status).toBe(200);
    expect((await call('GET', '/api/state')).data.state.players[0].photo).toBeUndefined();
    expect(await stored(ref)).toBe(false);
    const again = await upload(await photoFixture());
    await call('POST', '/api/actions', { action: { type: 'player.save', player: { ...player, photo: again } }, version: 2 });
    expect((await call('PUT', '/api/state', { state: createState(false), version: 3 })).status).toBe(200);
    expect(await stored(again)).toBe(false);
  });

  it('guarda el banner del torneo en R2, lo valida por su tipo y lo borra cuando se quita', async () => {
    const { readFileSync } = await import('node:fs');
    const banner = `data:image/jpeg;base64,${readFileSync(new URL('../tests/fixtures/banner.jpg', import.meta.url)).toString('base64')}`;
    expect(banner.length).toBeGreaterThan(64 * 1024);
    await login();
    // Pesa más que una foto de ficha: solo entra declarado como banner.
    expect((await call('POST', '/api/photos', { photo: banner })).status).toBe(422);
    expect((await call('POST', '/api/photos', { photo: `${banner}${'A'.repeat(400 * 1024)}`, kind: 'banner' })).status).toBe(413);
    const ref = (await call('POST', '/api/photos', { photo: banner, kind: 'banner' })).data.photo as string;
    expect(ref).toMatch(/^\/api\/photos\/[0-9a-f]{64}\.jpg$/);

    const tournament = { id: 'copa', name: 'Copa con banner', date: '2025-03-01', venue: 'Club', discipline: 'Bola 8', category: 'Tercera', results: [] };
    expect((await call('POST', '/api/actions', { action: { type: 'tournament.save', tournament: { ...tournament, banner } }, version: 0 })).status).toBe(422);
    expect((await call('POST', '/api/actions', { action: { type: 'tournament.save', tournament: { ...tournament, banner: `/api/photos/${'b'.repeat(64)}.jpg` } }, version: 0 })).status).toBe(422);
    expect((await call('POST', '/api/actions', { action: { type: 'tournament.save', tournament: { ...tournament, banner: ref } }, version: 0 })).status).toBe(200);
    cookie = '';
    expect((await call('GET', '/api/state')).data.state.tournaments[0].banner).toBe(ref);
    expect(await stored(ref)).toBe(true);

    await login();
    const removed = await call('POST', '/api/actions', { action: { type: 'tournament.banner', tournamentId: 'copa' }, version: 1 });
    expect(removed.status).toBe(200);
    expect(removed.data.state.tournaments[0].banner).toBeUndefined();
    expect((await call('GET', '/api/state')).data.state.tournaments[0].banner).toBeUndefined();
    expect(await stored(ref)).toBe(false);
    expect((await call('GET', '/api/audit')).data.entries[0]).toMatchObject({ type: 'tournament.banner', summary: 'Quitó el banner de Copa con banner' });
  });

  it('guarda los datos de un solo administrador ante escrituras simultáneas', async () => {
    await login();
    const photo = await upload(await photoFixture());
    const responses = await Promise.all([
      call('POST', '/api/actions', { action: { type: 'player.save', player: { ...player, photo } }, version: 0 }),
      call('POST', '/api/actions', { action: { type: 'player.save', player: { ...player, name: 'Ana Nueva' } }, version: 0 }),
    ]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const winner = responses.find(r => r.status === 200)!;
    expect((await call('GET', '/api/state')).data.state).toEqual(winner.data.state);
    expect((await call('GET', '/api/audit')).data.entries).toHaveLength(1);
  });
});

describe('Tablas por entidad', () => {
  /** Torneo con fixture a medio jugar: pases libres, mesa, hora y un resultado. */
  function played() {
    let state = createState();
    const send = (action: Action) => { state = applyAction(state, action, '2030-01-01'); };
    const entrants = state.players.filter(p => p.category === 'Primera').map(p => p.id).slice(0, 3);
    send({ type: 'tournament.save', tournament: { id: 'copa', name: 'Copa de Primera', date: '2025-03-01', venue: 'Club Central', discipline: 'Bola 9', category: 'Primera', raceTo: 3, results: [] } });
    send({ type: 'registration.save', tournamentId: 'copa', playerIds: entrants });
    send({ type: 'fixture.generate', tournamentId: 'copa', playerIds: [...entrants].reverse(), draw: 'ranking' });
    send({ type: 'match.schedule', tournamentId: 'copa', matchId: '1-2', table: 'Mesa 4', time: '18:30' });
    send({ type: 'match.score', tournamentId: 'copa', matchId: '1-2', scoreA: 3, scoreB: 1 });
    return { ...state, demo: false };
  }

  it('devuelve el mismo registro que recibió y solo escribe las filas que cambian', async () => {
    await login();
    const state = played();
    expect((await call('PUT', '/api/state', { state, version: 0 })).status).toBe(200);
    expect((await call('GET', '/api/state')).data.state).toEqual({ ...state, tournaments: state.tournaments.map(t => ({ registered: [], ...t })) });
    const count = async (table: string) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
    expect(await Promise.all(['players', 'tournaments', 'registrations', 'matches', 'results'].map(count))).toEqual([12, 6, 3, 3, 24]);

    const statements: string[] = [];
    const batch = env.DB.batch.bind(env.DB);
    env.DB.batch = (async (list: any[]) => { statements.push(...list.map(s => s.sql)); return batch(list); }) as typeof env.DB.batch;
    const cleared = await call('POST', '/api/actions', { action: { type: 'match.clear', tournamentId: 'copa', matchId: '1-2' }, version: 1 });
    expect(cleared.status).toBe(200);
    expect(statements.filter(sql => /^(INSERT INTO|DELETE FROM) (?!audit)/.test(sql))).toEqual([expect.stringMatching(/^INSERT INTO matches /)]);
    expect((await call('GET', '/api/state')).data.state).toEqual(cleared.data.state);
    expect((await call('POST', '/api/actions', { action: { type: 'fixture.reset', tournamentId: 'copa' }, version: 2 })).status).toBe(200);
    expect((await call('POST', '/api/actions', { action: { type: 'registration.save', tournamentId: 'copa', playerIds: [] }, version: 3 })).status).toBe(200);
    expect((await call('POST', '/api/actions', { action: { type: 'tournament.remove', tournamentId: 'copa' }, version: 4 })).status).toBe(200);
    expect(await Promise.all(['tournaments', 'registrations', 'matches'].map(count))).toEqual([5, 0, 0]);
  });

  it('guarda y devuelve en orden un torneo de doble eliminación', async () => {
    await login();
    let state = createState(false);
    const send = (action: Action) => { state = applyAction(state, action, '2030-01-01'); };
    const entrants = Array.from({ length: 6 }, (_, i) => `j${i}`);
    for (const id of entrants) send({ type: 'player.save', player: { id, name: `Jugador ${id}`, city: 'Asunción', club: '', initialPoints: 0, category: 'Tercera' } });
    send({ type: 'tournament.save', tournament: { id: 'doble', name: 'Copa doble', date: '2025-03-01', venue: 'Club', discipline: 'Bola 8', category: 'Tercera', raceTo: 2, format: 'double', qualifiers: 4, results: [] } });
    send({ type: 'registration.save', tournamentId: 'doble', playerIds: entrants });
    send({ type: 'fixture.generate', tournamentId: 'doble', playerIds: entrants, draw: 'ranking' });
    send({ type: 'match.score', tournamentId: 'doble', matchId: 'G1-2', scoreA: 2, scoreB: 0 });
    expect((await call('PUT', '/api/state', { state, version: 0 })).status).toBe(200);
    const stored = (await call('GET', '/api/state')).data.state.tournaments.find((t: { id: string }) => t.id === 'doble');
    expect(stored).toEqual(state.tournaments.find(t => t.id === 'doble'));
    expect(stored.fixture.matches.map((m: { id: string }) => m.id)).toEqual(['G1-1', 'G1-2', 'G1-3', 'G1-4', 'G2-1', 'G2-2', 'P1-1', 'P1-2', 'P2-1', 'P2-2', 'F1-1', 'F1-2', 'F2-1']);
    const scored = await call('POST', '/api/actions', { action: { type: 'match.score', tournamentId: 'doble', matchId: 'G1-4', scoreA: 0, scoreB: 2 }, version: 1 });
    expect(scored.status).toBe(200);
    expect((await call('GET', '/api/state')).data.state).toEqual(scored.data.state);
  });

  it('guarda las opciones de la definición y devuelve en orden el tercer puesto y la revancha', async () => {
    await login();
    let state = createState(false);
    const send = (action: Action) => { state = applyAction(state, action, '2030-01-01'); };
    const entrants = Array.from({ length: 5 }, (_, i) => `j${i}`);
    for (const id of entrants) send({ type: 'player.save', player: { id, name: `Jugador ${id}`, city: 'Asunción', club: '', initialPoints: 0, category: 'Tercera' } });
    const base = { date: '2025-03-01', venue: 'Club', discipline: 'Bola 8' as const, category: 'Tercera', raceTo: 2, results: [] };
    send({ type: 'tournament.save', tournament: { ...base, id: 'tercero', name: 'Con tercer puesto', thirdPlace: true } });
    send({ type: 'tournament.save', tournament: { ...base, id: 'revancha', name: 'Con revancha', format: 'double', qualifiers: 2, finalRematch: true } });
    for (const tournamentId of ['tercero', 'revancha']) {
      send({ type: 'registration.save', tournamentId, playerIds: entrants });
      send({ type: 'fixture.generate', tournamentId, playerIds: entrants, draw: 'ranking' });
    }
    expect((await call('PUT', '/api/state', { state, version: 0 })).status).toBe(200);
    const stored = (await call('GET', '/api/state')).data.state;
    expect(stored.tournaments).toEqual(state.tournaments);
    expect(stored.tournaments[0]).toMatchObject({ thirdPlace: true });
    expect(stored.tournaments[0].fixture.matches.at(-1)).toMatchObject({ id: 'T1-1', bracket: 'T' });
    expect(stored.tournaments[1]).toMatchObject({ finalRematch: true });
    expect(stored.tournaments[1].fixture.matches.slice(-2).map((m: { id: string }) => m.id)).toEqual(['F1-1', 'F2-1']);
  });

  it('restaura un respaldo grande con pocas consultas', async () => {
    await login();
    const state = createState(false);
    state.players = Array.from({ length: 600 }, (_, i) => ({ id: `j${i}`, name: `Jugador ${i}`, city: 'Asunción', club: 'Club Central', initialPoints: i, category: 'Tercera' }));
    const registered = state.players.slice(0, 128).map(p => p.id);
    let full = applyAction(state, { type: 'tournament.save', tournament: { id: 'gran', name: 'Gran Abierto', date: '2025-03-01', venue: 'Club', discipline: 'Bola 8', category: 'Tercera', results: [] } });
    full = applyAction(full, { type: 'registration.save', tournamentId: 'gran', playerIds: registered });
    full = applyAction(full, { type: 'fixture.generate', tournamentId: 'gran', playerIds: registered, draw: 'random' });
    let queries = 0;
    const { batch } = env.DB;
    env.DB.batch = (async (list: any[]) => { queries += list.length; return batch(list); }) as typeof env.DB.batch;
    expect((await call('PUT', '/api/state', { state: full, version: 0 })).status).toBe(200);
    expect(queries).toBeLessThan(25);
    env.DB.batch = batch;
    expect((await call('GET', '/api/state')).data.state).toEqual(full);
  });

  it('confirma sin enviar datos cuando el visitante ya tiene la versión vigente', async () => {
    await login();
    const saved = await call('POST', '/api/actions', { action: { type: 'player.save', player }, version: 0 });
    const current = await call('GET', `/api/state?tag=${encodeURIComponent(saved.data.tag)}`);
    expect(current.data).toEqual({ version: 1, tag: saved.data.tag, user: expect.objectContaining({ email: ADMIN.email }) });
    const stale = await call('GET', '/api/state?tag=0-');
    expect(stale.data).toMatchObject({ version: 1, tag: saved.data.tag, state: { players: [{ id: 'ana' }] } });
  });

  it('migra el documento de la versión anterior a las tablas', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(`${tmpdir()}/pool-paraguay-`);
    try {
      const legacy = played();
      const old = new DatabaseSync(`${dir}/db.sqlite`);
      old.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
      old.exec("CREATE TABLE _migrations (name TEXT PRIMARY KEY); INSERT INTO _migrations VALUES ('0001_init.sql')");
      old.prepare('INSERT INTO ranking (id, version, state, updated_at) VALUES (1, 7, ?, ?)').run(JSON.stringify(legacy), '2026-09-19T22:46:40.029Z');
      old.close();
      env.DB = createD1(`${dir}/db.sqlite`);
      const migrated = await call('GET', '/api/state');
      expect(migrated.data).toMatchObject({ version: 7, tag: '7-2026-09-19T22:46:40.029Z' });
      expect(migrated.data.state).toEqual({ ...legacy, tournaments: legacy.tournaments.map(t => ({ registered: [], ...t })) });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('Torneos por categoría compartidos', () => {
  it('administra inscriptos, sorteo, resultados y publicación con permisos y versiones', async () => {
    await login();
    let version = 0;
    const send = async (action: unknown) => {
      const response = await call('POST', '/api/actions', { action, version });
      expect(response.status).toBe(200);
      version = response.data.version;
      return response.data.state;
    };
    for (const [id, name] of [['uno', 'Ana'], ['dos', 'Luis']]) {
      await send({ type: 'player.save', player: { id, name, city: 'Asunción', club: '', initialPoints: 0, category: 'Tercera' } });
    }
    await send({ type: 'tournament.save', tournament: { id: 'cup', name: 'Copa compartida', date: '2025-01-01', venue: 'Club', discipline: 'Bola 8', category: 'Tercera', raceTo: 2, results: [] } });
    await send({ type: 'registration.save', tournamentId: 'cup', playerIds: ['uno', 'dos'] });
    const draw = { type: 'fixture.generate', tournamentId: 'cup', playerIds: ['dos', 'uno'], draw: 'random' };
    const drawn = await send(draw);
    expect((await call('POST', '/api/actions', { action: draw, version: version - 1 })).status).toBe(409);
    const session = cookie;
    cookie = '';
    expect((await call('GET', '/api/state')).data.state.tournaments[0].fixture).toEqual(drawn.tournaments[0].fixture);
    expect((await call('POST', '/api/actions', { action: draw, version })).status).toBe(401);
    cookie = session;
    const invalidScore = { type: 'match.score', tournamentId: 'cup', matchId: '1-1', scoreA: 2, scoreB: 2 };
    expect((await call('POST', '/api/actions', { action: invalidScore, version })).status).toBe(422);
    await send({ ...invalidScore, scoreB: 1 });
    const published = await send({ type: 'fixture.publish', tournamentId: 'cup' });
    expect(published.tournaments[0].results).toEqual([{ playerId: 'dos', place: 1, points: 300 }, { playerId: 'uno', place: 2, points: 200 }]);
    expect(published.players.every((p: { category: string }) => p.category === 'Tercera')).toBe(true);
    expect((await call('GET', '/api/audit')).data.entries.some((e: { type: string }) => e.type === 'fixture.generate')).toBe(true);
    expect((await call('POST', '/api/actions', { action: { type: 'fixture.publish', tournamentId: 'cup' }, version })).status).toBe(422);
  });
});
