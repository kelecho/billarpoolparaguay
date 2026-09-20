import type { Tournament } from './domain';

export type Match = { id: string; round: number; index: number; scoreA?: number; scoreB?: number; table?: string; time?: string };
export type Fixture = { draw?: 'random' | 'ranking' | 'manual'; seeds: (string | null)[]; matches: Match[] };
export type ResolvedMatch = Match & { playerA: string | null; playerB: string | null; ready: boolean; complete: boolean; winner: string | null; loser: string | null; bye: boolean };
export const MAX_ENTRANTS = 128;

/** Distribuye las cabezas de serie; los pases libres corresponden a las primeras. */
export function buildFixture(players: string[]): Fixture {
  if (players.length < 2 || players.length > MAX_ENTRANTS || new Set(players).size !== players.length) throw new Error(`Inscribí entre 2 y ${MAX_ENTRANTS} jugadores distintos.`);
  const size = 2 ** Math.ceil(Math.log2(players.length));
  let order = [1, 2];
  while (order.length < size) order = order.flatMap(seed => [seed, order.length * 2 + 1 - seed]);
  const seeds = order.map(seed => players[seed - 1] ?? null);
  const matches: Match[] = [];
  for (let round = 0, count = size / 2; count >= 1; round++, count /= 2) {
    for (let index = 0; index < count; index++) matches.push({ id: `${round + 1}-${index + 1}`, round, index });
  }
  return { seeds, matches };
}

/** Los participantes de cada ronda se derivan de los resultados, nunca del navegador. */
export function resolveFixture(tournament: Pick<Tournament, 'fixture'>): ResolvedMatch[] {
  const fixture = tournament.fixture;
  if (!fixture) return [];
  const resolved = new Map<string, ResolvedMatch>();
  for (const match of fixture.matches) {
    const beforeA = resolved.get(`${match.round}-${match.index * 2 + 1}`);
    const beforeB = resolved.get(`${match.round}-${match.index * 2 + 2}`);
    const ready = match.round === 0 || Boolean(beforeA?.complete && beforeB?.complete);
    const playerA = match.round === 0 ? fixture.seeds[match.index * 2] : beforeA?.winner ?? null;
    const playerB = match.round === 0 ? fixture.seeds[match.index * 2 + 1] : beforeB?.winner ?? null;
    const bye = ready && (!playerA || !playerB);
    const scored = ready && !bye && match.scoreA !== undefined && match.scoreB !== undefined;
    const winner = bye ? playerA ?? playerB : scored ? (match.scoreA! > match.scoreB! ? playerA : playerB) : null;
    resolved.set(match.id, { ...match, playerA, playerB, ready, bye, complete: bye || scored, winner, loser: scored ? winner === playerA ? playerB : playerA : null });
  }
  return [...resolved.values()];
}

export function fixturePlacements(tournament: Pick<Tournament, 'fixture'>): { playerId: string; place: number }[] {
  const matches = resolveFixture(tournament);
  const final = matches.at(-1);
  if (!final?.complete || !final.winner) throw new Error('Completá todos los partidos antes de publicar los resultados.');
  const rounds = final.round + 1;
  return [{ playerId: final.winner, place: 1 }, ...matches.filter(m => m.loser).map(m => ({ playerId: m.loser!, place: 2 ** (rounds - m.round - 1) + 1 }))];
}

export const roundLabel = (round: number, rounds: number) => {
  const remaining = rounds - round;
  return remaining === 1 ? 'Final' : remaining === 2 ? 'Semifinales' : remaining === 3 ? 'Cuartos de final' : remaining === 4 ? 'Octavos de final' : `Ronda ${round + 1}`;
};

export function hasScoredDescendant(fixture: Fixture, match: Match): boolean {
  return fixture.matches.some(m => m.round > match.round && m.index === Math.floor(match.index / 2 ** (m.round - match.round)) && m.scoreA !== undefined);
}

export function validateFixture(tournament: Tournament) {
  const fixture = tournament.fixture;
  if (!fixture) return;
  const fail = (): never => { throw new Error('El fixture no es válido. Revisá inscriptos, cruces y resultados.'); };
  if (!Array.isArray(fixture.seeds) || !Array.isArray(fixture.matches)) return fail();
  if (fixture.draw !== undefined && !['random', 'ranking', 'manual'].includes(fixture.draw)) return fail();
  const seeds = fixture.seeds;
  const players = seeds.filter((id): id is string => typeof id === 'string');
  const registered = tournament.registered ?? [];
  const size = 2 ** Math.ceil(Math.log2(registered.length));
  if (registered.length < 2 || seeds.length !== size || seeds.some(id => id !== null && typeof id !== 'string') || new Set(players).size !== players.length || players.length !== registered.length || players.some(id => !registered.includes(id))) return fail();
  const expected = buildFixture(registered).matches;
  if (fixture.matches.length !== expected.length) return fail();
  for (let i = 0; i < expected.length; i++) {
    const m = fixture.matches[i], e = expected[i];
    if (!m || m.id !== e.id || m.round !== e.round || m.index !== e.index) return fail();
    if (m.table !== undefined && (typeof m.table !== 'string' || m.table.length > 50)) return fail();
    if (m.time !== undefined && (typeof m.time !== 'string' || (m.time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time)))) return fail();
    if (m.scoreA === undefined && m.scoreB === undefined) continue;
    const target = tournament.raceTo ?? 5;
    if (!Number.isInteger(m.scoreA) || !Number.isInteger(m.scoreB) || m.scoreA! < 0 || m.scoreB! < 0 || Math.max(m.scoreA!, m.scoreB!) !== target || Math.min(m.scoreA!, m.scoreB!) >= target) return fail();
  }
  const matches = resolveFixture(tournament);
  if (matches.some(m => m.scoreA !== undefined && (!m.ready || m.bye))) return fail();
  // No se admiten ramas vacías que darían pases libres en rondas posteriores.
  if (matches.some(m => m.round === 0 && !m.playerA && !m.playerB)) return fail();
  if (tournament.results.length) {
    const placements = fixturePlacements(tournament);
    if (placements.length !== tournament.results.length || placements.some(p => !tournament.results.some(r => r.playerId === p.playerId && r.place === p.place))) return fail();
  }
}

/** Fisher–Yates con enteros uniformes, sin sesgo por módulo. */
export function drawPlayers(players: string[]): string[] {
  const order = [...players];
  for (let i = order.length - 1; i > 0; i--) {
    const bound = i + 1;
    const limit = Math.floor(2 ** 32 / bound) * bound;
    let random: number;
    do { random = crypto.getRandomValues(new Uint32Array(1))[0]; } while (random >= limit);
    const j = random % bound;
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
