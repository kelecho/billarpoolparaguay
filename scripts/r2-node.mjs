import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Implementa la parte de la API de R2 que usa el Worker: en una carpeta, o en memoria para las pruebas. */
export function createR2(dir) {
  const memory = new Map();
  if (dir) mkdirSync(dir, { recursive: true });
  const read = key => dir ? (existsSync(join(dir, key)) ? readFileSync(join(dir, key)) : null) : memory.get(key) ?? null;
  return {
    put: async (key, value) => { dir ? writeFileSync(join(dir, key), value) : memory.set(key, value); },
    get: async key => { const body = read(key); return body && { body }; },
    head: async key => read(key) && {},
    delete: async keys => { for (const key of [keys].flat()) dir ? rmSync(join(dir, key), { force: true }) : memory.delete(key); },
  };
}
