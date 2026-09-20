import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error: adaptador en JavaScript, sin tipos
import { createD1 } from '../scripts/d1-node.mjs';
// @ts-expect-error: adaptador en JavaScript, sin tipos
import { createR2 } from '../scripts/r2-node.mjs';
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

async function login() {
  const response = await call('POST', '/api/login', { password: 'clave-de-prueba' });
  cookie = response.headers.get('set-cookie')!.split(';')[0];
  return response;
}

const player = { id: 'ana', name: 'Ana Vera', city: 'Asunción', club: '', initialPoints: 900 };

beforeEach(() => {
  cookie = '';
  env = { DB: createD1(), PHOTOS: createR2(), ADMIN_PASSWORD: 'clave-de-prueba', ASSETS: { fetch: async () => new Response('app') } } as unknown as Env;
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

  it('no acepta una sesión tras cambiar la contraseña ni una cookie inventada', async () => {
    const response = await login();
    expect(response.headers.get('set-cookie')).toMatch(/^__Host-pool_admin=[0-9a-f]{64};/);
    env.ADMIN_PASSWORD = 'otra-clave-distinta';
    expect((await call('GET', '/api/state')).data.admin).toBe(false);
    cookie = `__Host-pool_admin=${'a'.repeat(64)}`;
    expect((await call('GET', '/api/state')).data.admin).toBe(false);
  });

  it('cerrar sesión la invalida en el servidor, también en otros dispositivos', async () => {
    await login();
    const phone = cookie;
    await login();
    const laptop = cookie;
    expect((await call('POST', '/api/logout', { all: false })).status).toBe(200);
    expect((await call('GET', '/api/state')).data.admin).toBe(false);
    cookie = phone;
    expect((await call('GET', '/api/state')).data.admin).toBe(true);
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
    expect((await call('GET', '/api/state')).data.admin).toBe(false);
  });

  it('exige una contraseña de administrador larga', async () => {
    env.ADMIN_PASSWORD = 'corta-123';
    expect((await call('POST', '/api/login', { password: 'corta-123' })).status).toBe(503);
  });

  it('limita los intentos por red IPv6, en paralelo y entre todas las direcciones', async () => {
    const attempt = (ip: string, password = 'incorrecta') => call('POST', '/api/login', { password }, { 'cf-connecting-ip': ip });
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
    expect((await call('POST', '/api/login', { password: big })).status).toBe(413);
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
    expect((await call('GET', '/api/state')).data).toMatchObject({ version: 1, admin: true, state: { players: [{ id: 'ana' }] } });
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
    expect(current.data).toEqual({ version: 1, tag: saved.data.tag, admin: true });
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
