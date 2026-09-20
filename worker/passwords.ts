/** Es el máximo de iteraciones de PBKDF2 que admite el runtime de Workers. Cada resumen guarda las suyas para poder subirlas. */
const ITERATIONS = 100_000;
const FORMAT = 'pbkdf2-sha256';

const toHex = (bytes: Uint8Array) => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], pair => parseInt(pair, 16));

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

/** Devuelve `pbkdf2-sha256$iteraciones$sal$resumen`, con una sal nueva por contraseña. */
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return [FORMAT, ITERATIONS, toHex(salt), toHex(await derive(password, salt, ITERATIONS))].join('$');
}

export async function verifyPassword(password: string, stored: string) {
  const [format, iterations, salt, expected] = stored.split('$');
  if (format !== FORMAT || !(Number(iterations) > 0) || !salt || !expected) return false;
  const [actual, wanted] = [await derive(password, fromHex(salt), Number(iterations)), fromHex(expected)];
  // Recorre todos los bytes aunque ya difieran, para que el tiempo no revele cuánto coincidió.
  let diff = actual.length ^ wanted.length;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ (wanted[i] ?? 0);
  return diff === 0;
}
