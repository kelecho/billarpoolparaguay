import { applyAction, dateIn, describeAction, validateState, type Action, type State } from '../src/domain.ts';
import { isPhotoRef, PHOTO_PATH, validPlayerPhoto } from '../src/playerPhoto.ts';
import { head, load, save } from './store.ts';

export interface Env {
  DB: D1Database;
  /** Fotos de los jugadores; cada archivo se llama como el SHA-256 de su contenido. */
  PHOTOS: R2Bucket;
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
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

const encoder = new TextEncoder();
const photoKey = (ref: string) => ref.slice(PHOTO_PATH.length);
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

/** Las fichas del servidor solo llevan referencias; una foto nueva tiene que estar subida antes de guardarse. */
async function checkPhotos(env: Env, next: State, previous?: State) {
  if (next.players.some(p => p.photo && !isPhotoRef(p.photo))) throw new HttpError(422, 'Subí la foto con /api/photos y guardá la referencia que devuelve.');
  if (!previous) return;
  const known = new Set(previous.players.map(p => p.photo));
  for (const player of next.players) {
    if (player.photo && !known.has(player.photo) && !(await env.PHOTOS.head(photoKey(player.photo)))) throw new HttpError(422, 'La foto del jugador no está subida. Volvé a cargarla desde su ficha.');
  }
}

/** Borra de R2 las fotos que ninguna ficha usa ya. Si falla, solo queda un archivo huérfano. */
async function dropUnusedPhotos(env: Env, next: State, previous: State) {
  const used = new Set(next.players.map(p => p.photo));
  const unused = [...new Set(previous.players.flatMap(p => p.photo && !used.has(p.photo) ? [photoKey(p.photo)] : []))];
  try {
    for (let i = 0; i < unused.length; i += 1000) await env.PHOTOS.delete(unused.slice(i, i + 1000));
  } catch (e) { console.error(e); }
}

async function uploadPhoto(request: Request, env: Env) {
  const { photo } = await body(request);
  if (!validPlayerPhoto(photo)) throw new HttpError(422, 'La foto del jugador no es válida. Volvé a cargarla desde su ficha.');
  const bytes = Uint8Array.from(atob(photo.slice(photo.indexOf(',') + 1)), c => c.charCodeAt(0));
  const key = `${hex(await crypto.subtle.digest('SHA-256', bytes))}.jpg`;
  await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
  return json({ photo: PHOTO_PATH + key }, 201);
}

/** El nombre depende del contenido: la misma dirección siempre devuelve la misma imagen y se puede cachear para siempre. */
async function servePhoto(env: Env, path: string) {
  const object = isPhotoRef(path) ? await env.PHOTOS.get(photoKey(path)) : null;
  if (!object) throw new HttpError(404, 'No encontrado.');
  return new Response(object.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
}

const conflict = async (env: Env) => json({ error: 'Otra persona guardó cambios mientras editabas. Actualizamos los datos: revisalos y volvé a intentar.', ...(await load(env.DB)) }, 409);

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

  if (path === '/api/state' && method === 'GET') {
    // Quien ya tiene la versión vigente recibe solo la confirmación: ahorra datos móviles y lecturas de D1.
    const tag = new URL(request.url).searchParams.get('tag');
    const current = tag ? await head(env.DB) : null;
    return json({ ...(current?.tag === tag ? current : await load(env.DB)), admin: await isAdmin(request, env) });
  }
  if (path.startsWith(PHOTO_PATH) && method === 'GET') return servePhoto(env, path);
  if (path === '/api/photos' && method === 'POST') {
    await requireAdmin(request, env);
    return uploadPhoto(request, env);
  }
  if (path === '/api/login' && method === 'POST') return login(request, env);
  if (path === '/api/logout' && method === 'POST') return json({ admin: false }, 200, { 'set-cookie': sessionCookie('', 0) });

  if (path === '/api/actions' && method === 'POST') {
    await requireAdmin(request, env);
    const { action, version } = await body(request) as { action?: Action; version?: number };
    if (!action || typeof action !== 'object' || typeof version !== 'number') throw new HttpError(400, 'Falta la acción o la versión.');
    const current = await load(env.DB);
    if (current.version !== version) return conflict(env);
    let next: State;
    try {
      next = applyAction(current.state, action, dateIn(TIME_ZONE));
    } catch (e) {
      throw new HttpError(422, e instanceof Error ? e.message : 'No se pudo aplicar el cambio.');
    }
    const audit = { type: action.type, summary: describeAction(current.state, action), reason: action.type === 'results.reopen' ? action.reason.trim() : undefined };
    await checkPhotos(env, next, current.state);
    const tag = await save(env.DB, next, current.state, version, audit);
    if (!tag) return conflict(env);
    await dropUnusedPhotos(env, next, current.state);
    return json({ state: next, version: version + 1, tag });
  }

  if (path === '/api/state' && method === 'PUT') {
    await requireAdmin(request, env);
    const { state, version } = await body(request) as { state?: unknown; version?: number };
    if (typeof version !== 'number') throw new HttpError(400, 'Falta la versión.');
    const current = await load(env.DB);
    if (current.version !== version) return conflict(env);
    let next: State;
    try {
      next = { ...validateState(state), demo: false };
    } catch (e) {
      throw new HttpError(422, e instanceof Error ? e.message : 'Los datos no son válidos.');
    }
    const audit = { type: 'state.replace', summary: `Reemplazó todos los datos por ${next.players.length} jugadores y ${next.tournaments.length} torneos` };
    await checkPhotos(env, next);
    const tag = await save(env.DB, next, null, version, audit);
    if (!tag) return conflict(env);
    await dropUnusedPhotos(env, next, current.state);
    return json({ state: next, version: version + 1, tag });
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
