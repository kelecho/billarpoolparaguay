// Crea una cuenta o recupera su acceso: si el correo ya existe, le pone la contraseña nueva, la reactiva y cierra sus sesiones.
// Es la única forma de crear al primer superadministrador y de volver a entrar si olvida su contraseña.
// Uso: npm run user -- correo@ejemplo.com "Nombre Apellido" [--role supervisor] [--local]
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { hashPassword } from '../worker/passwords.ts';

const MIN_PASSWORD_LENGTH = 12;

/** Inserta o actualiza con la API de D1; la usan este comando en modo local y el servidor de desarrollo. */
export async function saveUser(db, { email, name, role, password }) {
  await db.batch([
    db.prepare('INSERT INTO users (id, email, name, role, password_hash, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?) ON CONFLICT (email) DO UPDATE SET name = excluded.name, role = excluded.role, password_hash = excluded.password_hash, active = 1, must_change = 0')
      .bind(crypto.randomUUID(), email, name, role, await hashPassword(password), new Date().toISOString()),
    db.prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)').bind(email),
  ]);
}

/** Sin terminal (entrada redirigida) se lee todo de una vez, recién al preguntar: dos preguntas seguidas perderían líneas. */
let piped;

async function ask(question, hidden) {
  if (!process.stdin.isTTY) {
    piped ??= (await new Response(process.stdin).text()).split('\n');
    process.stdout.write(`${question}\n`);
    return piped.shift() ?? '';
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Muestra la pregunta pero no lo que se escribe.
  if (hidden) rl._writeToOutput = text => { if (text.includes(question)) process.stdout.write(question); };
  return new Promise(resolve => rl.question(question, answer => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer); }));
}

if (import.meta.filename === process.argv[1]) {
  const args = process.argv.slice(2);
  const flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const role = flag('--role') ?? 'superadmin';
  const local = args.includes('--local') && Boolean(args.splice(args.indexOf('--local'), 1));
  const [email, name] = [args[0]?.trim().toLowerCase(), args[1]?.trim()];
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || !['superadmin', 'supervisor'].includes(role)) {
    console.error('Uso: npm run user -- correo@ejemplo.com "Nombre Apellido" [--role supervisor] [--local]');
    process.exit(1);
  }
  const password = await ask(`Contraseña para ${email} (mínimo ${MIN_PASSWORD_LENGTH} caracteres): `, true);
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) { console.error(`La contraseña necesita entre ${MIN_PASSWORD_LENGTH} y 200 caracteres.`); process.exit(1); }
  if (await ask('Repetila: ', true) !== password) { console.error('Las contraseñas no coinciden.'); process.exit(1); }

  if (local) {
    const { createD1 } = await import('./d1-node.mjs');
    await saveUser(createD1(process.env.DB_PATH ?? '.data/local.sqlite'), { email, name, role, password });
  } else {
    // Wrangler recibe SQL literal: el correo ya está validado, el rol es uno de dos y el resumen es hexadecimal.
    const text = value => `'${value.replaceAll("'", "''")}'`;
    const sql = `INSERT INTO users (id, email, name, role, password_hash, active, created_at) VALUES (${text(crypto.randomUUID())}, ${text(email)}, ${text(name)}, ${text(role)}, ${text(await hashPassword(password))}, 1, ${text(new Date().toISOString())}) ON CONFLICT (email) DO UPDATE SET name = excluded.name, role = excluded.role, password_hash = excluded.password_hash, active = 1, must_change = 0; DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ${text(email)});`;
    try {
      execFileSync('npx', ['wrangler', 'd1', 'execute', 'pool-paraguay', '--remote', '--yes', '--command', sql], { stdio: ['ignore', 'ignore', 'inherit'] });
    } catch {
      console.error('No se pudo guardar la cuenta. Revisá que estés usando Node 22 (nvm use), que wrangler tenga sesión (npx wrangler login) y que las migraciones estén aplicadas (npm run deploy).');
      process.exit(1);
    }
  }
  console.log(`Listo: ${email} puede entrar como ${role === 'superadmin' ? 'superadministrador' : 'supervisor'}${local ? ' en el servidor local' : ''}.`);
}
