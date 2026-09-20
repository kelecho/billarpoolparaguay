import { applyAction, dateIn, describeAction, validateState, type Action, type State } from '../src/domain.ts';
import { isPhotoRef, PHOTO_PATH, validPlayerPhoto } from '../src/playerPhoto.ts';
import { head, load, save } from './store.ts';

export interface Env {
  DB: D1Database;
  /** Fotos de los jugadores; cada archivo se llama como el SHA-256 de su contenido. */
  PHOTOS: R2Bucket;
  ASSETS: Fetcher;
  /** Secreto de al menos 12 caracteres: `wrangler secret put ADMIN_PASSWORD`. En local, `.dev.vars`. */
  ADMIN_PASSWORD?: string;
}

const TIME_ZONE = 'America/Asuncion';
// El prefijo `__Host-` obliga al navegador a aceptarla solo con Secure, Path=/ y sin Domain.
const SESSION_COOKIE = '__Host-pool_admin';
const SESSION_SECONDS = 60 * 60 * 12;
const MIN_PASSWORD_LENGTH = 12;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_FAILURES = 5;
/** Tope entre todas las direcciones: frena un ataque repartido y acota las escrituras que puede provocar. */
const LOGIN_MAX_FAILURES_GLOBAL = 100;
const MAX_STATE_BYTES = 10 * 1024 * 1024;
const MAX_ACTION_BYTES = 256 * 1024;
const MAX_PHOTO_BYTES = 100 * 1024;
const MAX_LOGIN_BYTES = 1024;
const API_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const raw = (text: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(text, { status, headers: { 'content-type': 'application/json; charset=utf-8', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'", ...API_HEADERS, ...headers } });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => raw(JSON.stringify(body), status, headers);

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

function password(env: Env) {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH) throw new HttpError(503, `El acceso de administrador todavía no está configurado: ADMIN_PASSWORD necesita al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  return env.ADMIN_PASSWORD;
}

const sessionToken = (request: Request) => request.headers.get('cookie')?.split(/;\s*/).find(c => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);

/** La base guarda el resumen del token con la contraseña: no sirve para armar cookies y cambiar la contraseña cierra todas las sesiones. */
const sessionId = async (token: string, secret: string) => hex(await sha256(`${token}.${secret}`));

async function isAdmin(request: Request, env: Env) {
  const token = sessionToken(request);
  if (!token || !/^[0-9a-f]{64}$/.test(token) || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH) return false;
  return Boolean(await env.DB.prepare('SELECT 1 FROM sessions WHERE id = ? AND expires_at > ?').bind(await sessionId(token, env.ADMIN_PASSWORD), Math.floor(Date.now() / 1000)).first());
}

async function requireAdmin(request: Request, env: Env) {
  if (!(await isAdmin(request, env))) throw new HttpError(401, 'Iniciá sesión como administrador para hacer cambios.');
}

const sessionCookie = (value: string, maxAge: number) => `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

/** Lee por partes y corta al pasar el tope: un cuerpo enorme no llega a ocupar la memoria del Worker. */
async function body(request: Request, limit: number): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'Se esperaba JSON.');
  const tooLarge = new HttpError(413, 'El contenido supera el tamaño permitido.');
  if (Number(request.headers.get('content-length') ?? 0) > limit) throw tooLarge;
  const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();
  for (let size = 0; reader;) {
    const { done, value } = await reader.read();
    if (done) break;
    if ((size += value.byteLength) > limit) { await reader.cancel(); throw tooLarge; }
    chunks.push(value);
  }
  try {
    const value = JSON.parse(await new Blob(chunks).text());
    if (value && typeof value === 'object') return value;
  } catch { /* cae en el error de abajo */ }
  throw new HttpError(400, 'El contenido no es JSON válido.');
}

/** Último ranking armado por este proceso. La versión se comprueba en cada pedido, así que nunca sirve datos viejos. */
const snapshots = new WeakMap<D1Database, { tag: string; text: string }>();

/**
 * Quien ya tiene la versión vigente recibe solo la confirmación: ahorra datos móviles y lecturas de D1.
 * Repetir la consulta pública tampoco recorre las tablas: cuesta una fila leída mientras nadie guarde.
 */
async function publicState(request: Request, env: Env) {
  const admin = await isAdmin(request, env);
  const current = await head(env.DB);
  if (new URL(request.url).searchParams.get('tag') === current.tag) return json({ ...current, admin });
  let snapshot = snapshots.get(env.DB);
  if (snapshot?.tag !== current.tag) {
    const loaded = await load(env.DB);
    snapshots.set(env.DB, snapshot = { tag: loaded.tag, text: JSON.stringify(loaded) });
  }
  return raw(`${snapshot.text.slice(0, -1)},"admin":${admin}}`);
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
  const { photo } = await body(request, MAX_PHOTO_BYTES);
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
  return new Response(object.body, { headers: { 'content-type': 'image/jpeg', ...API_HEADERS, 'cache-control': 'public, max-age=31536000, immutable' } });
}

const conflict = async (env: Env) => json({ error: 'Otra persona guardó cambios mientras editabas. Actualizamos los datos: revisalos y volvé a intentar.', ...(await load(env.DB)) }, 409);

/** Una conexión IPv6 recibe un /64 entero: se cuenta el prefijo para que rotar direcciones no esquive el límite. */
function clientKey(request: Request) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  if (!ip.includes(':')) return ip;
  const [head, tail] = ip.split('::').map(part => part ? part.split(':') : []);
  const groups = tail ? [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail] : head;
  return `${groups.slice(0, 4).map(g => parseInt(g, 16).toString(16)).join(':')}::/64`;
}

async function login(request: Request, env: Env) {
  const secret = password(env);
  const ip = clientKey(request);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('DELETE FROM login_attempts WHERE at < ?').bind(now - LOGIN_WINDOW_SECONDS).run();
  // El intento se anota antes de comprobar la contraseña, en la misma sentencia que cuenta: pedidos en paralelo no pasan el límite.
  const attempt = await env.DB.prepare('INSERT INTO login_attempts (ip, at) SELECT ?, ? WHERE (SELECT COUNT(*) FROM login_attempts WHERE ip = ?) < ? AND (SELECT COUNT(*) FROM login_attempts) < ? RETURNING rowid AS id')
    .bind(ip, now, ip, LOGIN_MAX_FAILURES, LOGIN_MAX_FAILURES_GLOBAL).first<{ id: number }>();
  if (!attempt) throw new HttpError(429, 'Demasiados intentos. Esperá 15 minutos y volvé a probar.');

  const { password: typed } = await body(request, MAX_LOGIN_BYTES);
  if (typeof typed !== 'string' || !(await safeEqual(typed, secret))) throw new HttpError(401, 'La contraseña no es correcta.');
  const token = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_attempts WHERE rowid = ?').bind(attempt.id),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('INSERT INTO sessions (id, expires_at) VALUES (?, ?)').bind(await sessionId(token, secret), now + SESSION_SECONDS),
  ]);
  return json({ admin: true }, 200, { 'set-cookie': sessionCookie(token, SESSION_SECONDS) });
}

/** Cerrar sesión la invalida en el servidor; con `all` cierra también las de otros dispositivos. */
async function logout(request: Request, env: Env) {
  const { all } = await body(request, MAX_LOGIN_BYTES);
  const token = sessionToken(request);
  if (all === true) {
    await requireAdmin(request, env);
    await env.DB.prepare('DELETE FROM sessions').run();
  } else if (token && env.ADMIN_PASSWORD) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sessionId(token, env.ADMIN_PASSWORD)).run();
  }
  return json({ admin: false }, 200, { 'set-cookie': sessionCookie('', 0) });
}

async function api(request: Request, env: Env, path: string): Promise<Response> {
  const { method } = request;
  if (method !== 'GET') {
    // SameSite=Strict ya bloquea el envío de la cookie entre sitios; el origen es la segunda barrera.
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'Origen no permitido.');
  }

  if (path === '/api/state' && method === 'GET') return publicState(request, env);
  if (path.startsWith(PHOTO_PATH) && method === 'GET') return servePhoto(env, path);
  if (path === '/api/photos' && method === 'POST') {
    await requireAdmin(request, env);
    return uploadPhoto(request, env);
  }
  if (path === '/api/login' && method === 'POST') return login(request, env);
  if (path === '/api/logout' && method === 'POST') return logout(request, env);

  if (path === '/api/actions' && method === 'POST') {
    await requireAdmin(request, env);
    const { action, version } = await body(request, MAX_ACTION_BYTES) as { action?: Action; version?: number };
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
    const { state, version } = await body(request, MAX_STATE_BYTES) as { state?: unknown; version?: number };
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
