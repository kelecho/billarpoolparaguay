import { DEFAULT_RULES, validateState, type State, type Tournament } from '../src/domain.ts';

type Row = Record<string, string | number | null>;
type Rows = Record<(typeof TABLES)[number]['name'], Row[]>;

/** Primero las tablas referidas: se inserta en este orden y se borra en el inverso. */
const TABLES = [
  { name: 'players', key: ['id'], columns: ['name', 'city', 'club', 'initial_points', 'category', 'photo'], order: 'rowid' },
  { name: 'tournaments', key: ['id'], columns: ['name', 'date', 'venue', 'discipline', 'category', 'race_to', 'draw'], order: 'rowid' },
  { name: 'registrations', key: ['tournament_id', 'player_id'], columns: ['position', 'seed'], order: 'tournament_id, position' },
  { name: 'matches', key: ['tournament_id', 'id'], columns: ['round', 'idx', 'score_a', 'score_b', 'table_name', 'time'], order: 'tournament_id, round, idx' },
  { name: 'results', key: ['tournament_id', 'player_id'], columns: ['position', 'place', 'points'], order: 'tournament_id, position' },
] as const;

const GUARD = 'EXISTS (SELECT 1 FROM ranking WHERE id = 1 AND version = ?)';
/** D1 admite hasta 2 MB por parámetro; los caracteres acentuados ocupan más de un byte. */
const MAX_CHUNK_LENGTH = 500_000;

export const tagOf = (version: number, updatedAt: string) => `${version}-${updatedAt}`;

function flatten(state: State): Rows {
  const each = <T>(rows: (t: Tournament) => T[]) => state.tournaments.flatMap(rows);
  return {
    players: state.players.map(p => ({ id: p.id, name: p.name, city: p.city, club: p.club, initial_points: p.initialPoints, category: p.category ?? null, photo: p.photo ?? null })),
    tournaments: state.tournaments.map(t => ({ id: t.id, name: t.name, date: t.date, venue: t.venue, discipline: t.discipline, category: t.category ?? null, race_to: t.raceTo ?? null, draw: t.fixture?.draw ?? null })),
    registrations: each(t => (t.registered ?? []).map((player_id, position) => ({ tournament_id: t.id, player_id, position, seed: t.fixture ? t.fixture.seeds.indexOf(player_id) : null }))),
    matches: each(t => (t.fixture?.matches ?? []).map(m => ({ tournament_id: t.id, id: m.id, round: m.round, idx: m.index, score_a: m.scoreA ?? null, score_b: m.scoreB ?? null, table_name: m.table ?? null, time: m.time ?? null }))),
    results: each(t => t.results.map((r, position) => ({ tournament_id: t.id, player_id: r.playerId, position, place: r.place, points: r.points }))),
  };
}

/** Parte las filas en textos JSON que entran en un parámetro de D1. */
function chunks(items: unknown[]): string[] {
  const result: string[] = [];
  let current: string[] = [], length = 0;
  for (const item of items.map(i => JSON.stringify(i))) {
    if (current.length && length + item.length > MAX_CHUNK_LENGTH) { result.push(`[${current}]`); current = []; length = 0; }
    current.push(item);
    length += item.length + 1;
  }
  if (current.length) result.push(`[${current}]`);
  return result;
}

const present = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null));

function group<T extends { tournament_id: string }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) groups.set(row.tournament_id, [...(groups.get(row.tournament_id) ?? []), row]);
  return groups;
}

/** Versión y etiqueta vigentes con una sola fila leída, para responder «sin cambios» sin armar el ranking. */
export async function head(db: D1Database) {
  const row = await db.prepare('SELECT version, updated_at FROM ranking WHERE id = 1').first<{ version: number; updated_at: string }>();
  return { version: row!.version, tag: tagOf(row!.version, row!.updated_at) };
}

export async function load(db: D1Database): Promise<{ state: State; version: number; tag: string }> {
  const [ranking, ...tables] = await db.batch([
    db.prepare('SELECT version, rules, updated_at FROM ranking WHERE id = 1'),
    ...TABLES.map(t => db.prepare(`SELECT * FROM ${t.name} ORDER BY ${t.order}`)),
  ]);
  const { version, rules, updated_at } = ranking.results[0] as { version: number; rules: string; updated_at: string };
  const [players, tournaments, ...children] = tables.map(t => t.results as any[]);
  const [registrations, matches, results] = children.map(group);
  const state = {
    version: 1, demo: false,
    rules: rules ? JSON.parse(rules) : structuredClone(DEFAULT_RULES),
    players: players.map(p => present({ id: p.id, name: p.name, city: p.city, club: p.club, initialPoints: p.initial_points, category: p.category, photo: p.photo })),
    tournaments: tournaments.map(t => {
      const entrants = registrations.get(t.id) ?? [];
      const played = matches.get(t.id);
      const seeds: (string | null)[] = Array(2 ** Math.ceil(Math.log2(Math.max(entrants.length, 1)))).fill(null);
      for (const entrant of entrants) if (entrant.seed !== null) seeds[entrant.seed] = entrant.player_id;
      return present({
        id: t.id, name: t.name, date: t.date, venue: t.venue, discipline: t.discipline, category: t.category, raceTo: t.race_to,
        registered: entrants.map(e => e.player_id),
        fixture: played ? present({ draw: t.draw, seeds, matches: played.map(m => present({ id: m.id, round: m.round, index: m.idx, scoreA: m.score_a, scoreB: m.score_b, table: m.table_name, time: m.time })) }) : null,
        results: (results.get(t.id) ?? []).map(r => ({ playerId: r.player_id, place: r.place, points: r.points })),
      });
    }),
  };
  return { state: validateState(state), version, tag: tagOf(version, updated_at) };
}

/**
 * Escribe solo las filas que cambiaron entre `previous` y `state`; sin `previous` reemplaza todo el registro.
 * Cada sentencia lleva muchas filas en un parámetro JSON, así la cantidad de consultas no crece con los datos.
 * Todas comprueban `version` y el batch es una transacción: si otra persona guardó antes, no se escribe nada.
 */
export async function save(db: D1Database, state: State, previous: State | null, version: number, audit: { type: string; summary: string; reason?: string; actor: string }) {
  const now = new Date().toISOString();
  const next = flatten(state);
  const before = previous && flatten(previous);
  const removals: D1PreparedStatement[] = [];
  const upserts: D1PreparedStatement[] = [];
  for (const table of TABLES) {
    const id = (row: Row) => JSON.stringify(table.key.map(k => row[k]));
    const old = new Map((before?.[table.name] ?? []).map(row => [id(row), JSON.stringify(row)]));
    const kept = new Set(next[table.name].map(id));
    const changed = next[table.name].filter(row => old.get(id(row)) !== JSON.stringify(row));
    const columns = [...table.key, ...table.columns];
    for (const chunk of chunks(changed)) {
      upserts.push(db.prepare(`INSERT INTO ${table.name} (${columns.join(', ')}) SELECT ${columns.map(c => `value->>'${c}'`).join(', ')} FROM json_each(?) WHERE ${GUARD} ON CONFLICT (${table.key.join(', ')}) DO UPDATE SET ${table.columns.map(c => `${c} = excluded.${c}`).join(', ')}`).bind(chunk, version));
    }
    if (!before) removals.unshift(db.prepare(`DELETE FROM ${table.name} WHERE ${GUARD}`).bind(version));
    else {
      const gone = [...old.keys()].filter(key => !kept.has(key)).map(key => JSON.parse(key));
      removals.unshift(...chunks(gone).map(chunk => db.prepare(`DELETE FROM ${table.name} WHERE (${table.key.join(', ')}) IN (SELECT ${table.key.map((_, i) => `value->>${i}`).join(', ')} FROM json_each(?)) AND ${GUARD}`).bind(chunk, version)));
    }
  }
  const changes = [...removals, ...upserts];
  const written = await db.batch([...changes,
    db.prepare('UPDATE ranking SET version = version + 1, rules = ?, updated_at = ? WHERE id = 1 AND version = ?').bind(JSON.stringify(state.rules), now, version),
    db.prepare('INSERT INTO audit (at, type, summary, reason, actor) SELECT ?, ?, ?, ?, ? WHERE changes() = 1').bind(now, audit.type, audit.summary, audit.reason ?? null, audit.actor),
  ]);
  return written[changes.length].meta.changes ? tagOf(version + 1, now) : null;
}
