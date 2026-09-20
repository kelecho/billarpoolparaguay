import type { Tournament } from './domain';

/** G: llave de ganadores, P: llave de perdedores, F: fase final, T: partido por el tercer puesto. La eliminación directa solo usa T. */
export type Bracket = 'G' | 'P' | 'F' | 'T' | 'L';
export type Format = 'single' | 'double' | 'league';
export type Match = { id: string; round: number; index: number; bracket?: Bracket; scoreA?: number; scoreB?: number; table?: string; time?: string; date?: string };
export type Fixture = { draw?: 'random' | 'ranking' | 'manual'; seeds: (string | null)[]; matches: Match[] };
/** `place`: puesto de quien pierde el partido y queda eliminado; en la llave de ganadores nadie queda eliminado. */
/** De qué partido sale un jugador que todavía no está definido. */
export type Feed = { from: string; as: 'winner' | 'loser' };
export type ResolvedMatch = Match & {
  playerA: string | null; playerB: string | null; ready: boolean; complete: boolean; winner: string | null; loser: string | null; bye: boolean; place?: number; feedA?: Feed; feedB?: Feed;
  /** Puesto de quien gana: solo en el partido por el tercer puesto. */
  winnerPlace?: number;
  /** Define al campeón: la final y, si la hay, su revancha. */
  decisive?: boolean;
  /** Es la revancha de la gran final, que solo se juega si pierde el invicto. */
  rematch?: boolean;
  /** La revancha no hizo falta: el invicto ganó la gran final. */
  unneeded?: boolean;
};
type Shape = Pick<Tournament, 'format' | 'qualifiers' | 'thirdPlace' | 'finalRematch' | 'leagueRounds'>;
type Bracketed = Shape & Pick<Tournament, 'fixture'>;
type Source = { seed: number } | { winner: string } | { loser: string };
type Slot = { id: string; round: number; index: number; bracket?: Bracket; a: Source; b: Source; place?: number; winnerPlace?: number; decisive?: boolean; rematchOf?: string };
export const MAX_ENTRANTS = 128;
export const MAX_LEAGUE_ENTRANTS = 32;
export const entrantLimit = (format?: Format) => format === 'league' ? MAX_LEAGUE_ENTRANTS : MAX_ENTRANTS;
export const QUALIFIER_OPTIONS = [2, 4, 8, 16, 32];

/** Rotación circular: cada pareja se enfrenta una vez por vuelta, sin repetir jugador en una jornada. */
function leagueLayout(size: number, legs = 1): Slot[] {
  const wheel = Array.from({ length: size }, (_, i) => i);
  const first: Slot[] = [];
  for (let round = 0; round < size - 1; round++) {
    for (let index = 0; index < size / 2; index++) {
      const pair = [wheel[index], wheel[size - 1 - index]];
      if ((round + index) % 2) pair.reverse();
      first.push({ id: `L${round + 1}-${index + 1}`, round, index, bracket: 'L', a: { seed: pair[0] }, b: { seed: pair[1] } });
    }
    wheel.splice(1, 0, wheel.pop()!);
  }
  return legs === 2 ? [...first, ...first.map(s => ({ ...s, id: `L${s.round + size}-${s.index + 1}`, round: s.round + size - 1, a: s.b, b: s.a }))] : first;
}

/**
 * De dónde sale cada jugador de cada partido. El cuadro no se guarda: se deduce del tamaño y del formato,
 * así un respaldo no puede traer cruces inventados.
 *
 * Doble eliminación: quien pierde en ganadores cae a perdedores, y quien pierde ahí queda eliminado. Se juega hasta que
 * quedan `qualifiers` jugadores —la mitad invictos, la mitad con una derrota— y ellos definen el torneo por eliminación
 * directa. Con dos clasificados esa fase es la gran final a partido único.
 */
function layout(size: number, shape: Shape): Slot[] {
  if (shape.format === 'league') return leagueLayout(size, shape.leagueRounds);
  const slots = mainLayout(size, shape);
  const final = slots.at(-1)!;
  final.decisive = true;
  // Tercer puesto: los dos que pierden las semifinales juegan entre sí en vez de compartir el puesto.
  if (shape.thirdPlace) {
    const semifinals = slots.filter(slot => slot.bracket === final.bracket && slot.round === final.round - 1);
    for (const semifinal of semifinals) delete semifinal.place;
    slots.push({ id: 'T1-1', round: 0, index: 0, bracket: 'T', a: { loser: semifinals[0].id }, b: { loser: semifinals[1].id }, place: 4, winnerPlace: 3 });
  }
  // Revancha: si el invicto pierde la gran final recién tiene su primera derrota, y los mismos dos juegan otra vez.
  if (shape.finalRematch) slots.splice(slots.indexOf(final) + 1, 0, { id: 'F2-1', round: 1, index: 0, bracket: 'F', a: final.a, b: final.b, place: 2, decisive: true, rematchOf: final.id });
  return slots;
}

function mainLayout(size: number, { format, qualifiers = 2 }: Shape): Slot[] {
  const knockout = (bracket: Bracket | undefined, rounds: number, first: (index: number) => [Source, Source], place?: (round: number) => number) => {
    const slots: Slot[] = [];
    const id = (round: number, index: number) => `${bracket ?? ''}${round + 1}-${index + 1}`;
    for (let round = 0; round < rounds; round++) {
      for (let index = 0; index < 2 ** (rounds - round - 1); index++) {
        const [a, b] = round ? [{ winner: id(round - 1, index * 2) }, { winner: id(round - 1, index * 2 + 1) }] : first(index);
        slots.push({ id: id(round, index), round, index, ...(bracket ? { bracket } : {}), a, b, ...(place ? { place: place(round) } : {}) });
      }
    }
    return slots;
  };
  const seeds = (index: number): [Source, Source] => [{ seed: index * 2 }, { seed: index * 2 + 1 }];
  const total = Math.log2(size);
  if (format !== 'double') return knockout(undefined, total, seeds, round => 2 ** (total - round - 1) + 1);

  // Ganadores: se juega hasta que quedan `qualifiers / 2` invictos.
  const winnersRounds = Math.log2(2 * size / qualifiers);
  const winners = knockout('G', total, seeds).filter(slot => slot.round < winnersRounds);

  // Perdedores: primero se cruzan los caídos de la ronda 1; después cada ronda de ganadores aporta sus caídos contra los
  // sobrevivientes, y entre un aporte y el siguiente los sobrevivientes se cruzan entre sí.
  const losers: Slot[] = [];
  const lastDrop: number[] = [];
  let round = 0;
  const add = (count: number, sources: (index: number) => [Source, Source]) => {
    for (let index = 0; index < count; index++) { const [a, b] = sources(index); losers.push({ id: `P${round + 1}-${index + 1}`, round, index, bracket: 'P', a, b }); }
    round++;
  };
  add(size / 4, i => [{ loser: `G1-${i * 2 + 1}` }, { loser: `G1-${i * 2 + 2}` }]);
  for (let drop = 2; drop <= winnersRounds; drop++) {
    const count = size / 2 ** drop;
    // Los caídos entran en orden inverso ronda por medio, para demorar la revancha entre quienes ya se enfrentaron.
    const from = (i: number) => drop % 2 ? i : count - 1 - i;
    const survivors = round;
    add(count, i => [{ winner: `P${survivors}-${i + 1}` }, { loser: `G${drop}-${from(i) + 1}` }]);
    if (drop === winnersRounds) for (let i = 0; i < count; i++) lastDrop[i] = from(i);
    else { const previous = round; add(count / 2, i => [{ winner: `P${previous}-${i * 2 + 1}` }, { winner: `P${previous}-${i * 2 + 2}` }]); }
  }
  // Quien cae en una ronda de perdedores queda detrás de los clasificados y de los que caen en rondas posteriores.
  const perRound = Array.from({ length: round }, (_, r) => losers.filter(slot => slot.round === r).length);
  for (const slot of losers) slot.place = qualifiers + perRound.slice(slot.round + 1).reduce((sum, n) => sum + n, 0) + 1;

  // Fase final: cada invicto enfrenta a un clasificado de perdedores de la otra mitad del cuadro, no al que acaba de vencer.
  const half = qualifiers / 2;
  const rival = (i: number) => lastDrop.indexOf(half > 1 ? (i + half / 2) % half : i);
  const finals = knockout('F', Math.log2(qualifiers), i => [{ winner: `G${winnersRounds}-${i + 1}` }, { winner: `P${round}-${rival(i) + 1}` }], r => qualifiers / 2 ** (r + 1) + 1);
  return [...winners, ...losers, ...finals];
}

const bracketSize = (entrants: number) => 2 ** Math.ceil(Math.log2(entrants));

/** Distribuye las cabezas de serie; los pases libres corresponden a las primeras. */
export function buildFixture(players: string[], shape: Shape = {}): Fixture {
  const limit = entrantLimit(shape.format);
  if (players.length < 2 || players.length > limit || new Set(players).size !== players.length) throw new Error(`Inscribí entre 2 y ${limit} jugadores distintos.`);
  if (shape.format === 'league') {
    if (shape.qualifiers !== undefined || shape.thirdPlace || shape.finalRematch || (shape.leagueRounds !== undefined && ![1, 2].includes(shape.leagueRounds))) throw new Error('Revisá las opciones de la liga: una vuelta o ida y vuelta, sin eliminatorias.');
    const seeds: (string | null)[] = [...players];
    if (seeds.length % 2) seeds.push(null);
    return { seeds, matches: layout(seeds.length, shape).map(({ id, round, index, bracket }) => ({ id, round, index, bracket })) };
  }
  const size = bracketSize(players.length);
  if (shape.format === 'double') {
    const qualifiers = shape.qualifiers ?? 2;
    if (players.length < 3) throw new Error('La doble eliminación necesita al menos 3 inscriptos.');
    if (!QUALIFIER_OPTIONS.includes(qualifiers)) throw new Error('Elegí cuántos jugadores clasifican a la fase final.');
    if (qualifiers > size / 2) throw new Error(`Con ${players.length} inscriptos pueden clasificar a la fase final hasta ${size / 2} jugadores. Cambialo desde «Editar torneo».`);
  }
  const knockout = shape.format === 'double' ? shape.qualifiers ?? 2 : size;
  if (shape.finalRematch && (shape.format !== 'double' || knockout !== 2)) throw new Error('La revancha de la final es para la doble eliminación con gran final, sin fase final de eliminación directa.');
  if (shape.thirdPlace && knockout < 4) throw new Error(shape.format === 'double' ? 'Con gran final el tercer puesto ya queda definido en la llave de perdedores.' : 'El partido por el tercer puesto necesita al menos 3 inscriptos.');
  let order = [1, 2];
  while (order.length < size) order = order.flatMap(seed => [seed, order.length * 2 + 1 - seed]);
  const seeds = order.map(seed => players[seed - 1] ?? null);
  return { seeds, matches: layout(size, shape).map(({ id, round, index, bracket }) => ({ id, round, index, ...(bracket ? { bracket } : {}) })) };
}

/** Los participantes de cada ronda se derivan de los resultados, nunca del navegador. */
export function resolveFixture(tournament: Bracketed): ResolvedMatch[] {
  const fixture = tournament.fixture;
  if (!fixture) return [];
  const stored = new Map(fixture.matches.map(m => [m.id, m]));
  const resolved = new Map<string, ResolvedMatch & { vacant: boolean }>();
  // `vacant`: de ahí no va a venir nadie, pase lo que pase. Un pase libre no deja perdedor, y un cruce sin jugadores no deja ganador.
  const from = (source: Source) => {
    if ('seed' in source) { const player = fixture.seeds[source.seed] ?? null; return { player, settled: true, vacant: !player, feed: undefined }; }
    const match = resolved.get('winner' in source ? source.winner : source.loser);
    const vacant = Boolean(match && ('winner' in source ? match.vacant : match.bye));
    // Solo se dice de dónde viene quien falta y efectivamente va a llegar: un lugar vacío es un pase libre, no una espera.
    const player = (match && ('winner' in source ? match.winner : match.loser)) ?? null;
    const feed: Feed | undefined = vacant || player ? undefined : 'winner' in source ? { from: source.winner, as: 'winner' } : { from: source.loser, as: 'loser' };
    return { player, settled: vacant || Boolean(match?.complete), vacant, feed };
  };
  for (const slot of layout(fixture.seeds.length, tournament)) {
    const match = stored.get(slot.id);
    if (!match) continue;
    const [a, b] = [from(slot.a), from(slot.b)];
    // La revancha espera a la gran final: se juega solo si la ganó quien venía de perdedores (el lado B).
    const first = slot.rematchOf ? resolved.get(slot.rematchOf) : undefined;
    const unneeded = Boolean(first?.complete && first.winner === first.playerA);
    const ready = a.settled && b.settled && (!slot.rematchOf || Boolean(first?.complete && !unneeded));
    // Un lugar vacío es un pase libre, y se sabe desde el sorteo aunque el rival todavía no esté definido.
    const bye = a.vacant || b.vacant;
    const scored = ready && !bye && match.scoreA !== undefined && match.scoreB !== undefined;
    const winner = bye ? ready ? a.player ?? b.player : null : scored ? (match.scoreA! > match.scoreB! ? a.player : b.player) : null;
    // Con revancha, quien pierde la gran final viniendo invicto todavía no está eliminado.
    const rematched = slot.decisive && !slot.rematchOf && tournament.finalRematch;
    const loser = scored ? winner === a.player ? b.player : a.player : null;
    const place = rematched && loser === a.player ? undefined : slot.place;
    resolved.set(slot.id, { ...match, vacant: a.vacant && b.vacant, playerA: a.player, playerB: b.player, ready, bye, complete: ready && bye || scored || unneeded, winner, loser, ...(place ? { place } : {}), ...(slot.winnerPlace ? { winnerPlace: slot.winnerPlace } : {}), ...(slot.decisive ? { decisive: true } : {}), ...(slot.rematchOf ? { rematch: true } : {}), ...(unneeded ? { unneeded: true } : {}), ...(a.feed ? { feedA: a.feed } : {}), ...(b.feed ? { feedB: b.feed } : {}) });
  }
  return [...resolved.values()].map(({ vacant: _vacant, ...match }) => match);
}

/**
 * El campeón queda definido cuando se resuelven la final y su revancha, aunque falte el partido por el tercer puesto;
 * el torneo recién está completo, y se puede publicar, cuando no queda ningún partido por jugar.
 */
export function fixtureOutcome(matches: ResolvedMatch[]): { complete: boolean; champion: string | null } {
  if (matches.some(m => m.bracket === 'L')) {
    const complete = matches.every(m => m.complete);
    const leaders = leagueStandings(matches).filter(p => p.place === 1);
    return { complete, champion: complete && leaders.length === 1 ? leaders[0].playerId : null };
  }
  const decisive = matches.filter(m => m.decisive);
  const decided = decisive.length > 0 && decisive.every(m => m.complete);
  return { complete: matches.length > 0 && matches.every(m => m.complete), champion: decided ? decisive.filter(m => m.winner).at(-1)?.winner ?? null : null };
}

export function fixturePlacements(tournament: Bracketed): { playerId: string; place: number }[] {
  const matches = resolveFixture(tournament);
  const { complete, champion } = fixtureOutcome(matches);
  if (tournament.format === 'league' && complete) return leagueStandings(matches).map(({ playerId, place }) => ({ playerId, place }));
  if (!complete || !champion) throw new Error('Completá todos los partidos antes de publicar los resultados.');
  return [
    { playerId: champion, place: 1 },
    ...matches.filter(m => m.winner && m.winnerPlace).map(m => ({ playerId: m.winner!, place: m.winnerPlace! })),
    ...matches.filter(m => m.loser && m.place).map(m => ({ playerId: m.loser!, place: m.place! })),
  ];
}

export type LeagueStanding = { playerId: string; place: number; played: number; wins: number; losses: number; racksFor: number; racksAgainst: number; difference: number; points: number };

/** Los descansos no puntúan. Una igualdad en todos los criterios comparte puesto, sin desempates arbitrarios. */
export function leagueStandings(matches: ResolvedMatch[]): LeagueStanding[] {
  const rows = new Map<string, LeagueStanding>();
  for (const m of matches.filter(m => m.bracket === 'L')) {
    for (const id of [m.playerA, m.playerB]) if (id && !rows.has(id)) rows.set(id, { playerId: id, place: 0, played: 0, wins: 0, losses: 0, racksFor: 0, racksAgainst: 0, difference: 0, points: 0 });
    if (!m.complete || m.bye || !m.playerA || !m.playerB) continue;
    for (const [id, scored, conceded] of [[m.playerA, m.scoreA!, m.scoreB!], [m.playerB, m.scoreB!, m.scoreA!]] as const) {
      const row = rows.get(id)!;
      row.played++;
      row.wins += Number(m.winner === id);
      row.losses += Number(m.winner !== id);
      row.racksFor += scored;
      row.racksAgainst += conceded;
      row.difference = row.racksFor - row.racksAgainst;
      row.points = row.wins * 3;
    }
  }
  const compare = (a: LeagueStanding, b: LeagueStanding) => b.points - a.points || b.difference - a.difference || b.racksFor - a.racksFor;
  const sorted = [...rows.values()].sort(compare);
  sorted.forEach((row, i) => { row.place = i && compare(sorted[i - 1], row) === 0 ? sorted[i - 1].place : i + 1; });
  return sorted;
}

export const validMatchDate = (date: unknown): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;

export const roundLabel = (round: number, rounds: number) => {
  const remaining = rounds - round;
  return remaining === 1 ? 'Final' : remaining === 2 ? 'Semifinales' : remaining === 3 ? 'Cuartos de final' : remaining === 4 ? 'Octavos de final' : `Ronda ${round + 1}`;
};

/** Agrupa el cuadro para dibujarlo: una sección en eliminación directa; ganadores, perdedores y fase final en doble eliminación. El tercer puesto se dibuja aparte. */
export function fixtureSections(matches: ResolvedMatch[]) {
  const finals = matches.filter(m => m.bracket === 'F');
  const grandFinal = finals.filter(m => !m.rematch).length === 1;
  const titles = { G: 'Llave de ganadores', P: 'Llave de perdedores', F: grandFinal ? 'Gran final' : 'Fase final' };
  return ([undefined, 'G', 'P', 'F'] as const).map(bracket => matches.filter(m => m.bracket === bracket)).filter(group => group.length).map(group => {
    const bracket = group[0].bracket as 'G' | 'P' | 'F' | undefined;
    const rounds = group.at(-1)!.round + 1;
    const label = (round: number) => bracket === 'G' || bracket === 'P' ? `Ronda ${round + 1}` : bracket === 'F' && grandFinal ? round ? 'Revancha' : 'Final' : roundLabel(round, rounds);
    return { bracket, title: bracket && titles[bracket], rounds: Array.from({ length: rounds }, (_, round) => ({ label: label(round), matches: group.filter(m => m.round === round) })) };
  });
}

/** Hay algún resultado cargado en un partido que depende, por ganador o por perdedor, de este. */
export function hasScoredDescendant(tournament: Bracketed, matchId: string): boolean {
  const fixture = tournament.fixture;
  if (!fixture) return false;
  const slots = layout(fixture.seeds.length, tournament);
  const scored = new Set(fixture.matches.filter(m => m.scoreA !== undefined).map(m => m.id));
  const reached = new Set([matchId]);
  // El cuadro está ordenado: todo partido aparece después de los que lo alimentan.
  for (const slot of slots) {
    if ((slot.rematchOf && reached.has(slot.rematchOf)) || [slot.a, slot.b].some(source => !('seed' in source) && reached.has('winner' in source ? source.winner : source.loser))) reached.add(slot.id);
  }
  reached.delete(matchId);
  return [...reached].some(id => scored.has(id));
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
  const size = tournament.format === 'league' ? registered.length + registered.length % 2 : bracketSize(registered.length);
  if (registered.length < 2 || seeds.length !== size || seeds.some(id => id !== null && typeof id !== 'string') || new Set(players).size !== players.length || players.length !== registered.length || players.some(id => !registered.includes(id))) return fail();
  let expected: Match[];
  try { expected = buildFixture(registered, tournament).matches; } catch { return fail(); }
  if (fixture.matches.length !== expected.length) return fail();
  for (let i = 0; i < expected.length; i++) {
    const m = fixture.matches[i], e = expected[i];
    if (!m || m.id !== e.id || m.round !== e.round || m.index !== e.index || m.bracket !== e.bracket) return fail();
    if (m.table !== undefined && (typeof m.table !== 'string' || m.table.length > 50)) return fail();
    if (m.date !== undefined && (tournament.format !== 'league' || !validMatchDate(m.date) || m.date < tournament.date)) return fail();
    if (m.time !== undefined && (typeof m.time !== 'string' || (m.time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time)))) return fail();
    if (m.scoreA === undefined && m.scoreB === undefined) continue;
    const target = tournament.raceTo ?? 5;
    if (!Number.isInteger(m.scoreA) || !Number.isInteger(m.scoreB) || m.scoreA! < 0 || m.scoreB! < 0 || Math.max(m.scoreA!, m.scoreB!) !== target || Math.min(m.scoreA!, m.scoreB!) >= target) return fail();
  }
  const matches = resolveFixture(tournament);
  if (matches.some(m => m.scoreA !== undefined && (!m.ready || m.bye))) return fail();
  // En la primera ronda no se admiten cruces vacíos; en la llave de perdedores sí pueden darse, por los pases libres.
  if (matches.some(m => m.round === 0 && (m.bracket === undefined || m.bracket === 'G') && !m.playerA && !m.playerB)) return fail();
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
