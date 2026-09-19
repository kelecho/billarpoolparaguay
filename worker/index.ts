import { applyAction, createState, dateIn, describeAction, validateState, type Action, type State } from '../src/domain';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Secreto: `wrangler secret put ADMIN_PASSWORD`. En local, `.dev.vars`. */
  ADMIN_PASSWORD?: string;
}

const TIME_ZONE = 'America/Asuncion';
const SESSION_COOKIE = 'pool_admin';
const SESSION_SECONDS = 60 * 60 * 12;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_FAILURES = 5;
const MAX_BODY_BYTES = 10 * 1024 * 1024;

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

const encoder = new TextEncoder();
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = (text: string) => crypto.subtle.digest('SHA-256', encoder.encode(text));

/** Compara resúmenes de largo fijo para no filtrar por tiempo el largo ni el contenido. */
async function safeEqual(a: string, b: string) {
  const [left, right] = (await Promise.all([sha256(a), sha256(b)])).map(d => new Uint8Array(d));
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

/** La clave de sesión deriva de la contraseña: cambiarla cierra todas las sesiones. */
async function sign(password: string, payload: string) {
  const key = await crypto.subtle.importKey('raw', await sha256(`pool-paraguay-session:${password}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

function password(env: Env) {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 8) throw new HttpError(503, 'El acceso de administrador todavía no está configurado.');
  return env.ADMIN_PASSWORD;
}

async function isAdmin(request: Request, env: Env) {
  if (!env.ADMIN_PASSWORD) return false;
  const token = request.headers.get('cookie')?.split(/;\s*/).find(c => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  const [expires, signature] = token?.split('.') ?? [];
  if (!expires || !signature || !(Number(expires) > Date.now() / 1000)) return false;
  return safeEqual(signature, await sign(env.ADMIN_PASSWORD, expires));
}

async function requireAdmin(request: Request, env: Env) {
  if (!(await isAdmin(request, env))) throw new HttpError(401, 'Iniciá sesión como administrador para hacer cambios.');
}

const sessionCookie = (value: string, maxAge: number) => `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'Se esperaba JSON.');
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'El contenido supera el límite de 10 MB.');
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object') return value;
  } catch { /* cae en el error de abajo */ }
  throw new HttpError(400, 'El contenido no es JSON válido.');
}

async function load(env: Env): Promise<{ state: State; version: number }> {
  const row = await env.DB.prepare('SELECT version, state FROM ranking WHERE id = 1').first<{ version: number; state: string }>();
  return row ? { state: validateState(JSON.parse(row.state)), version: row.version } : { state: createState(false), version: 0 };
}

/** Guarda solo si nadie escribió desde `version`; así dos administradores no se pisan cambios. */
async function save(env: Env, state: State, version: number, audit: { type: string; summary: string; reason?: string }) {
  const now = new Date().toISOString();
  const write = version === 0
    ? env.DB.prepare('INSERT OR IGNORE INTO ranking (id, version, state, updated_at) VALUES (1, 1, ?, ?)').bind(JSON.stringify(state), now)
    : env.DB.prepare('UPDATE ranking SET version = version + 1, state = ?, updated_at = ? WHERE id = 1 AND version = ?').bind(JSON.stringify(state), now, version);
  const result = await write.run();
  if (!result.meta.changes) return false;
  await env.DB.prepare('INSERT INTO audit (at, type, summary, reason) VALUES (?, ?, ?, ?)').bind(now, audit.type, audit.summary, audit.reason ?? null).run();
  return true;
}

const conflict = async (env: Env) => json({ error: 'Otra persona guardó cambios mientras editabas. Actualizamos los datos: revisalos y volvé a intentar.', ...(await load(env)) }, 409);

async function login(request: Request, env: Env) {
  const secret = password(env);
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('DELETE FROM login_attempts WHERE at < ?').bind(now - LOGIN_WINDOW_SECONDS).run();
  const failures = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ?').bind(ip).first<{ n: number }>();
  if ((failures?.n ?? 0) >= LOGIN_MAX_FAILURES) throw new HttpError(429, 'Demasiados intentos. Esperá 15 minutos y volvé a probar.');

  const { password: attempt } = await body(request);
  if (typeof attempt !== 'string' || !(await safeEqual(attempt, secret))) {
    await env.DB.prepare('INSERT INTO login_attempts (ip, at) VALUES (?, ?)').bind(ip, now).run();
    throw new HttpError(401, 'La contraseña no es correcta.');
  }
  const expires = String(now + SESSION_SECONDS);
  return json({ admin: true }, 200, { 'set-cookie': sessionCookie(`${expires}.${await sign(secret, expires)}`, SESSION_SECONDS) });
}

async function api(request: Request, env: Env, path: string): Promise<Response> {
  const { method } = request;
  if (method !== 'GET') {
    // SameSite=Strict ya bloquea el envío de la cookie entre sitios; el origen es la segunda barrera.
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'Origen no permitido.');
  }

  if (path === '/api/state' && method === 'GET') return json({ ...(await load(env)), admin: await isAdmin(request, env) });
  if (path === '/api/login' && method === 'POST') return login(request, env);
  if (path === '/api/logout' && method === 'POST') return json({ admin: false }, 200, { 'set-cookie': sessionCookie('', 0) });

  if (path === '/api/actions' && method === 'POST') {
    await requireAdmin(request, env);
    const { action, version } = await body(request) as { action?: Action; version?: number };
    if (!action || typeof action !== 'object' || typeof version !== 'number') throw new HttpError(400, 'Falta la acción o la versión.');
    const current = await load(env);
    if (current.version !== version) return conflict(env);
    let next: State;
    try {
      next = applyAction(current.state, action, dateIn(TIME_ZONE));
    } catch (e) {
      throw new HttpError(422, e instanceof Error ? e.message : 'No se pudo aplicar el cambio.');
    }
    const audit = { type: action.type, summary: describeAction(current.state, action), reason: action.type === 'results.reopen' ? action.reason.trim() : undefined };
    if (!(await save(env, next, version, audit))) return conflict(env);
    return json({ state: next, version: version + 1 });
  }

  if (path === '/api/state' && method === 'PUT') {
    await requireAdmin(request, env);
    const { state, version } = await body(request) as { state?: unknown; version?: number };
    if (typeof version !== 'number') throw new HttpError(400, 'Falta la versión.');
    let next: State;
    try {
      next = { ...validateState(state), demo: false };
    } catch (e) {
      throw new HttpError(422, e instanceof Error ? e.message : 'Los datos no son válidos.');
    }
    const audit = { type: 'state.replace', summary: `Reemplazó todos los datos por ${next.players.length} jugadores y ${next.tournaments.length} torneos` };
    if (!(await save(env, next, version, audit))) return conflict(env);
    return json({ state: next, version: version + 1 });
  }

  if (path === '/api/audit' && method === 'GET') {
    await requireAdmin(request, env);
    const { results } = await env.DB.prepare('SELECT at, type, summary, reason FROM audit ORDER BY id DESC LIMIT 100').all();
    return json({ entries: results });
  }

  throw new HttpError(404, 'No encontrado.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, pathname);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Error interno. Probá de nuevo en unos minutos.' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
