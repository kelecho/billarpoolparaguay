import { applyAction, dateIn, describeAction, validateState, type Action, type State } from '../src/domain.ts';
import { isPhotoRef, PHOTO_PATH, validBanner, validPlayerPhoto } from '../src/playerPhoto.ts';
import { canApply } from '../src/roles.ts';
import { changeOwnPassword, createUser, currentUser, deleteUser, listUsers, login, logout, requireUser, updateUser } from './auth.ts';
import { API_HEADERS, body, hex, HttpError, json, MAX_ACTION_BYTES, MAX_BANNER_BYTES, MAX_STATE_BYTES, raw } from './http.ts';
import { head, load, save } from './store.ts';

export interface Env {
  DB: D1Database;
  /** Fotos de los jugadores; cada archivo se llama como el SHA-256 de su contenido. */
  PHOTOS: R2Bucket;
  ASSETS: Fetcher;
}

const TIME_ZONE = 'America/Asuncion';
const photoKey = (ref: string) => ref.slice(PHOTO_PATH.length);

/** Último ranking armado por este proceso. La versión se comprueba en cada pedido, así que nunca sirve datos viejos. */
const snapshots = new WeakMap<D1Database, { tag: string; text: string }>();

/**
 * Quien ya tiene la versión vigente recibe solo la confirmación: ahorra datos móviles y lecturas de D1.
 * Repetir la consulta pública tampoco recorre las tablas: cuesta una fila leída mientras nadie guarde.
 */
async function publicState(request: Request, env: Env) {
  const user = await currentUser(request, env);
  const current = await head(env.DB);
  if (new URL(request.url).searchParams.get('tag') === current.tag) return json({ ...current, user });
  let snapshot = snapshots.get(env.DB);
  if (snapshot?.tag !== current.tag) {
    const loaded = await load(env.DB);
    snapshots.set(env.DB, snapshot = { tag: loaded.tag, text: JSON.stringify(loaded) });
  }
  return raw(`${snapshot.text.slice(0, -1)},"user":${JSON.stringify(user)}}`);
}

/** Imágenes que usa el registro: fotos de jugadores y banners de torneos. */
const images = (state: State) => [...state.players.map(p => p.photo), ...state.tournaments.map(t => t.banner)].filter((image): image is string => Boolean(image));

/** El servidor solo guarda referencias; una imagen nueva tiene que estar subida antes de guardarse. */
async function checkPhotos(env: Env, next: State, previous?: State) {
  if (images(next).some(image => !isPhotoRef(image))) throw new HttpError(422, 'Subí la imagen con /api/photos y guardá la referencia que devuelve.');
  if (!previous) return;
  const known = new Set(images(previous));
  for (const image of images(next)) {
    if (!known.has(image) && !(await env.PHOTOS.head(photoKey(image)))) throw new HttpError(422, 'La imagen no está subida. Volvé a cargarla.');
  }
}

/** Borra de R2 las imágenes que ya nadie usa. Si falla, solo queda un archivo huérfano. */
async function dropUnusedPhotos(env: Env, next: State, previous: State) {
  const used = new Set(images(next));
  const unused = [...new Set(images(previous).filter(image => !used.has(image)).map(photoKey))];
  try {
    for (let i = 0; i < unused.length; i += 1000) await env.PHOTOS.delete(unused.slice(i, i + 1000));
  } catch (e) { console.error(e); }
}

async function uploadPhoto(request: Request, env: Env) {
  // El cuerpo admite el tamaño de un banner; cada tipo de imagen tiene después su propio tope.
  const { photo, kind } = await body(request, MAX_BANNER_BYTES);
  const valid = kind === 'banner' ? validBanner : validPlayerPhoto;
  if (!valid(photo)) throw new HttpError(422, kind === 'banner' ? 'El banner no es válido. Volvé a cargarlo.' : 'La foto del jugador no es válida. Volvé a cargarla desde su ficha.');
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
    await requireUser(request, env);
    return uploadPhoto(request, env);
  }
  if (path === '/api/password' && method === 'POST') return changeOwnPassword(request, env, await requireUser(request, env, undefined, true));
  if (path === '/api/users' && method === 'GET') { await requireUser(request, env, 'superadmin'); return listUsers(env); }
  if (path === '/api/users' && method === 'POST') return createUser(request, env, await requireUser(request, env, 'superadmin'));
  const userId = path.match(/^\/api\/users\/([0-9a-f-]{36})$/)?.[1];
  if (userId && method === 'PATCH') return updateUser(request, env, await requireUser(request, env, 'superadmin'), userId);
  if (userId && method === 'DELETE') return deleteUser(env, await requireUser(request, env, 'superadmin'), userId);
  if (path === '/api/login' && method === 'POST') return login(request, env);
  if (path === '/api/logout' && method === 'POST') return logout(request, env);

  if (path === '/api/actions' && method === 'POST') {
    const user = await requireUser(request, env);
    const { action, version } = await body(request, MAX_ACTION_BYTES) as { action?: Action; version?: number };
    if (!action || typeof action !== 'object' || typeof version !== 'number') throw new HttpError(400, 'Falta la acción o la versión.');
    if (!canApply(user.role, action.type)) throw new HttpError(403, 'Esta acción es solo para el superadministrador.');
    const current = await load(env.DB);
    if (current.version !== version) return conflict(env);
    let next: State;
    try {
      next = applyAction(current.state, action, dateIn(TIME_ZONE));
    } catch (e) {
      throw new HttpError(422, e instanceof Error ? e.message : 'No se pudo aplicar el cambio.');
    }
    const audit = { type: action.type, summary: describeAction(current.state, action), reason: action.type === 'results.reopen' ? action.reason.trim() : undefined, actor: user.email };
    await checkPhotos(env, next, current.state);
    const tag = await save(env.DB, next, current.state, version, audit);
    if (!tag) return conflict(env);
    await dropUnusedPhotos(env, next, current.state);
    return json({ state: next, version: version + 1, tag });
  }

  if (path === '/api/state' && method === 'PUT') {
    const user = await requireUser(request, env, 'superadmin');
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
    const audit = { type: 'state.replace', summary: `Reemplazó todos los datos por ${next.players.length} jugadores y ${next.tournaments.length} torneos`, actor: user.email };
    await checkPhotos(env, next);
    const tag = await save(env.DB, next, null, version, audit);
    if (!tag) return conflict(env);
    await dropUnusedPhotos(env, next, current.state);
    return json({ state: next, version: version + 1, tag });
  }

  if (path === '/api/audit' && method === 'GET') {
    await requireUser(request, env, 'superadmin');
    const { results } = await env.DB.prepare('SELECT at, type, summary, reason, actor FROM audit ORDER BY id DESC LIMIT 100').all();
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
