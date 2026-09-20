import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * Implementa sobre SQLite la parte de la API de D1 que usa el Worker, para correrlo y probarlo con Node.
 * `workerd` (wrangler dev) exige glibc 2.32 o posterior y no arranca en sistemas más viejos.
 */
export function createD1(path = ':memory:', migrations = new URL('../migrations/', import.meta.url)) {
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)');
  for (const name of readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(name)) continue;
    db.exec(readFileSync(new URL(name, migrations), 'utf8'));
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
  }
  const statement = (sql, params = []) => ({
    sql,
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...params).changes) } }),
    execute: () => /^\s*SELECT\b/i.test(sql)
      ? { results: db.prepare(sql).all(...params), meta: { changes: 0 } }
      : { results: [], meta: { changes: Number(db.prepare(sql).run(...params).changes) } },
  });
  return {
    prepare: sql => statement(sql),
    batch: async statements => {
      db.exec('BEGIN');
      try {
        const results = statements.map(s => s.execute());
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
