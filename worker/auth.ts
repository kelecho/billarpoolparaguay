import { MIN_PASSWORD_LENGTH, ROLE_LABELS, ROLES, type Role, type User } from '../src/roles.ts';
import { body, hex, HttpError, json, MAX_ACCOUNT_BYTES } from './http.ts';
import { hashPassword, verifyPassword } from './passwords.ts';

type AuthEnv = { DB: D1Database };
type UserRow = { id: string; email: string; name: string; role: Role; active: number; must_change: number; password_hash: string };

// El prefijo `__Host-` obliga al navegador a aceptarla solo con Secure, Path=/ y sin Domain.
const SESSION_COOKIE = '__Host-pool_session';
const SESSION_SECONDS = 60 * 60 * 12;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_FAILURES = 5;
/** Tope entre todas las direcciones: frena un ataque repartido y acota las escrituras que puede provocar. */
const LOGIN_MAX_FAILURES_GLOBAL = 100;
const USER_COLUMNS = 'id, email, name, role, active, must_change';

const publicUser = (row: Omit<UserRow, 'password_hash'>): User => ({ id: row.id, email: row.email, name: row.name, role: row.role, active: Boolean(row.active), mustChangePassword: Boolean(row.must_change) });
const sessionCookie = (value: string, maxAge: number) => `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
const sessionToken = (request: Request) => request.headers.get('cookie')?.split(/;\s*/).find(c => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
/** La base guarda solo el resumen del token: quien la lea no puede armar cookies. */
const sessionId = async (token: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
const now = () => Math.floor(Date.now() / 1000);

const record = (db: D1Database, actor: User, type: string, summary: string) =>
  db.prepare('INSERT INTO audit (at, type, summary, actor) VALUES (?, ?, ?, ?)').bind(new Date().toISOString(), type, summary, actor.email);

export async function currentUser(request: Request, env: AuthEnv): Promise<User | null> {
  const token = sessionToken(request);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await env.DB.prepare(`SELECT u.id, u.email, u.name, u.role, u.active, u.must_change FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ? AND u.active = 1`)
    .bind(await sessionId(token), now()).first<UserRow>();
  return row && publicUser(row);
}

/** Con una contraseña puesta por otra persona solo se puede cambiarla o salir; `pendingPassword` marca esas dos rutas. */
export async function requireUser(request: Request, env: AuthEnv, role?: 'superadmin', pendingPassword = false): Promise<User> {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, 'Iniciá sesión para hacer cambios.');
  if (user.mustChangePassword && !pendingPassword) throw new HttpError(403, 'Elegí tu propia contraseña antes de continuar.');
  if (role && user.role !== role) throw new HttpError(403, 'Esta acción es solo para el superadministrador.');
  return user;
}

/** Una conexión IPv6 recibe un /64 entero: se cuenta el prefijo para que rotar direcciones no esquive el límite. */
function clientKey(request: Request) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  if (!ip.includes(':')) return ip;
  const [head, tail] = ip.split('::').map(part => part ? part.split(':') : []);
  const groups = tail ? [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill('0'), ...tail] : head;
  return `${groups.slice(0, 4).map(g => parseInt(g, 16).toString(16)).join(':')}::/64`;
}

/** Un correo desconocido cuesta lo mismo que una contraseña errada: el tiempo no revela qué cuentas existen. */
let decoy: Promise<string> | undefined;

export async function login(request: Request, env: AuthEnv) {
  const ip = clientKey(request);
  await env.DB.prepare('DELETE FROM login_attempts WHERE at < ?').bind(now() - LOGIN_WINDOW_SECONDS).run();
  // El intento se anota antes de comprobar la contraseña, en la misma sentencia que cuenta: pedidos en paralelo no pasan el límite.
  const attempt = await env.DB.prepare('INSERT INTO login_attempts (ip, at) SELECT ?, ? WHERE (SELECT COUNT(*) FROM login_attempts WHERE ip = ?) < ? AND (SELECT COUNT(*) FROM login_attempts) < ? RETURNING rowid AS id')
    .bind(ip, now(), ip, LOGIN_MAX_FAILURES, LOGIN_MAX_FAILURES_GLOBAL).first<{ id: number }>();
  if (!attempt) throw new HttpError(429, 'Demasiados intentos. Esperá 15 minutos y volvé a probar.');

  const { email, password } = await body(request, MAX_ACCOUNT_BYTES);
  const row = typeof email === 'string' ? await env.DB.prepare(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = ?`).bind(email.trim().toLowerCase()).first<UserRow>() : null;
  const valid = await verifyPassword(typeof password === 'string' ? password : '', row?.password_hash ?? await (decoy ??= hashPassword(crypto.randomUUID())));
  if (!row || !valid || !row.active) throw new HttpError(401, 'El correo o la contraseña no son correctos.');

  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_attempts WHERE rowid = ?').bind(attempt.id),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now()),
    env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').bind(await sessionId(token), row.id, now() + SESSION_SECONDS),
  ]);
  return json({ user: publicUser(row) }, 200, { 'set-cookie': sessionCookie(token, SESSION_SECONDS) });
}

/** Cerrar sesión la invalida en el servidor; con `all` cierra también las de los otros dispositivos de la cuenta. */
export async function logout(request: Request, env: AuthEnv) {
  const { all } = await body(request, MAX_ACCOUNT_BYTES);
  const token = sessionToken(request);
  if (all === true) await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind((await requireUser(request, env, undefined, true)).id).run();
  else if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sessionId(token)).run();
  return json({ user: null }, 200, { 'set-cookie': sessionCookie('', 0) });
}

function checkPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH || value.length > 200) throw new HttpError(422, `La contraseña necesita entre ${MIN_PASSWORD_LENGTH} y 200 caracteres.`);
  return value;
}

/** Valida solo los campos presentes, para servir tanto al alta como a la edición. */
function accountFields(input: Record<string, unknown>) {
  const fields: { email?: string; name?: string; role?: Role; active?: number } = {};
  if (input.email !== undefined) {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422, 'Revisá el correo de la cuenta.');
    fields.email = email;
  }
  if (input.name !== undefined) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 150) throw new HttpError(422, 'Indicá el nombre de la persona.');
    fields.name = name;
  }
  if (input.role !== undefined) {
    if (!ROLES.includes(input.role as Role)) throw new HttpError(422, 'Elegí un rol válido.');
    fields.role = input.role as Role;
  }
  if (input.active !== undefined) {
    if (typeof input.active !== 'boolean') throw new HttpError(422, 'Indicá si la cuenta está activa.');
    fields.active = Number(input.active);
  }
  return fields;
}

async function emailTaken(db: D1Database, email: string, exceptId = '') {
  return Boolean(await db.prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?').bind(email, exceptId).first());
}

export async function listUsers(env: AuthEnv) {
  const { results } = await env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users ORDER BY role, name COLLATE NOCASE`).all<UserRow>();
  return json({ users: results.map(publicUser) });
}

export async function createUser(request: Request, env: AuthEnv, actor: User) {
  const input = await body(request, MAX_ACCOUNT_BYTES);
  const { email, name, role } = accountFields({ email: '', name: '', role: '', ...input });
  const password = checkPassword(input.password);
  if (await emailTaken(env.DB, email!)) throw new HttpError(422, 'Ya existe una cuenta con ese correo.');
  const user: User = { id: crypto.randomUUID(), email: email!, name: name!, role: role!, active: true, mustChangePassword: true };
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, email, name, role, password_hash, active, must_change, created_at) VALUES (?, ?, ?, ?, ?, 1, 1, ?)').bind(user.id, user.email, user.name, user.role, await hashPassword(password), new Date().toISOString()),
    record(env.DB, actor, 'user.create', `Creó la cuenta de ${user.name} (${ROLE_LABELS[user.role]})`),
  ]);
  return json({ user }, 201);
}

/**
 * Nadie cambia su propio rol ni se desactiva: así siempre queda al menos un superadministrador activo.
 * Cambiar la contraseña, el rol o desactivar la cuenta cierra sus sesiones abiertas.
 */
export async function updateUser(request: Request, env: AuthEnv, actor: User, id: string) {
  const input = await body(request, MAX_ACCOUNT_BYTES);
  const current = await env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).bind(id).first<UserRow>();
  if (!current) throw new HttpError(404, 'La cuenta no existe.');
  const fields = accountFields(input);
  const password = input.password === undefined ? undefined : checkPassword(input.password);
  if (id === actor.id && (fields.role !== undefined && fields.role !== current.role || fields.active === 0 || password)) throw new HttpError(422, 'No podés cambiar tu propio rol ni desactivarte. Tu contraseña se cambia desde «Mi cuenta».');
  if (fields.email && await emailTaken(env.DB, fields.email, id)) throw new HttpError(422, 'Ya existe una cuenta con ese correo.');

  const next = { ...current, ...fields, must_change: password ? 1 : current.must_change };
  const changes = [
    next.role !== current.role && `rol ${ROLE_LABELS[next.role]}`, next.active !== current.active && (next.active ? 'reactivada' : 'desactivada'),
    password && 'contraseña nueva', (next.email !== current.email || next.name !== current.name) && 'datos',
  ].filter(Boolean);
  const closeSessions = password || next.role !== current.role || !next.active;
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET email = ?, name = ?, role = ?, active = ? WHERE id = ?').bind(next.email, next.name, next.role, next.active, id),
    ...(password ? [env.DB.prepare('UPDATE users SET password_hash = ?, must_change = 1 WHERE id = ?').bind(await hashPassword(password), id)] : []),
    ...(closeSessions ? [env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id)] : []),
    record(env.DB, actor, 'user.update', `Actualizó la cuenta de ${next.name}: ${changes.join(', ') || 'sin cambios'}`),
  ]);
  return json({ user: publicUser(next) });
}

export async function deleteUser(env: AuthEnv, actor: User, id: string) {
  if (id === actor.id) throw new HttpError(422, 'No podés eliminar tu propia cuenta.');
  const current = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(id).first<{ name: string }>();
  if (!current) throw new HttpError(404, 'La cuenta no existe.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
    record(env.DB, actor, 'user.delete', `Eliminó la cuenta de ${current.name}`),
  ]);
  return json({ deleted: true });
}

/** Cada persona cambia su contraseña con la actual; las sesiones de sus otros dispositivos se cierran. */
export async function changeOwnPassword(request: Request, env: AuthEnv, actor: User) {
  const input = await body(request, MAX_ACCOUNT_BYTES);
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(actor.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(typeof input.current === 'string' ? input.current : '', row.password_hash))) throw new HttpError(422, 'La contraseña actual no es correcta.');
  const password = checkPassword(input.next);
  if (password === input.current) throw new HttpError(422, 'Elegí una contraseña distinta de la actual.');
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ?, must_change = 0 WHERE id = ?').bind(await hashPassword(password), actor.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').bind(actor.id, await sessionId(sessionToken(request)!)),
    record(env.DB, actor, 'user.password', 'Cambió su contraseña'),
  ]);
  return json({ changed: true });
}
