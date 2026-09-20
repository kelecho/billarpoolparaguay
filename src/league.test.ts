import { describe, expect, it } from 'vitest';
import { applyAction, createState, isMatchDay, standings, validateState, type Action, type State } from './domain';
import { buildFixture, fixtureOutcome, fixturePlacements, leagueStandings, resolveFixture } from './fixture';

function setup(count = 3, leagueRounds: 1 | 2 = 1): State {
  let state = createState(false);
  state.players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Jugador ${i}`, city: 'Asunción', club: '', initialPoints: 0, category: 'Tercera' }));
  state = applyAction(state, { type: 'tournament.save', tournament: { id: 'league', name: 'Liga local', date: '2025-01-01', venue: 'Club', discipline: 'Bola 9', category: 'Tercera', format: 'league', leagueRounds, raceTo: 3, results: [] } });
  state = applyAction(state, { type: 'registration.save', tournamentId: 'league', playerIds: state.players.map(p => p.id) });
  return applyAction(state, { type: 'fixture.generate', tournamentId: 'league', playerIds: state.players.map(p => p.id) });
}
const act = (state: State, action: Action) => applyAction(state, action, '2025-06-01');

function finish(state: State): State {
  for (const m of resolveFixture(state.tournaments[0]).filter(m => !m.bye)) {
    const aWins = m.playerA! < m.playerB!;
    state = act(state, { type: 'match.score', tournamentId: 'league', matchId: m.id, scoreA: aWins ? 3 : 1, scoreB: aWins ? 1 : 3 });
  }
  return state;
}

describe('Liga todos contra todos', () => {
  it('en todos los tamaños permitidos enfrenta cada pareja una vez por vuelta y asigna un encuentro por jornada', () => {
    for (const leagueRounds of [1, 2] as const) for (let n = 2; n <= 32; n++) {
      const players = Array.from({ length: n }, (_, i) => `p${i}`);
      const t = { format: 'league' as const, leagueRounds, fixture: buildFixture(players, { format: 'league', leagueRounds }) };
      const matches = resolveFixture(t);
      const played = matches.filter(m => !m.bye);
      expect(played).toHaveLength(n * (n - 1) / 2 * leagueRounds);
      const pairs = new Map<string, number>();
      for (const m of played) {
        expect(m.ready).toBe(true);
        expect(m.playerA).not.toBe(m.playerB);
        const key = [m.playerA, m.playerB].sort().join(':');
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
      expect(pairs.size).toBe(n * (n - 1) / 2);
      expect([...pairs.values()].every(v => v === leagueRounds)).toBe(true);
      for (const round of new Set(matches.map(m => m.round))) {
        const ids = matches.filter(m => m.round === round).flatMap(m => [m.playerA, m.playerB]).filter(Boolean);
        expect(ids).toHaveLength(n);
        expect(new Set(ids).size).toBe(n);
      }
      if (leagueRounds === 2) {
        const halfway = matches.length / 2;
        matches.slice(halfway).forEach((m, i) => expect([m.playerA, m.playerB]).toEqual([matches[i].playerB, matches[i].playerA]));
      }
      expect(leagueStandings(matches).every(p => p.played === 0 && p.points === 0)).toBe(true);
      expect(fixtureOutcome(matches)).toEqual({ complete: false, champion: null });
    }
  });

  it('ordena por puntos, diferencia y partidas ganadas; una igualdad total comparte puesto', () => {
    const initial = setup();
    const playCycle = (scores: number[]) => {
      let state = initial;
      const winners: Record<string, string> = { 'p0:p1': 'p0', 'p1:p2': 'p1', 'p0:p2': 'p2' };
      const losses: Record<string, number> = { 'p0:p1': scores[0], 'p1:p2': scores[1], 'p0:p2': scores[2] };
      for (const m of resolveFixture(state.tournaments[0]).filter(m => !m.bye)) {
        const pair = [m.playerA, m.playerB].sort().join(':');
        const aWins = winners[pair] === m.playerA;
        state = act(state, { type: 'match.score', tournamentId: 'league', matchId: m.id, scoreA: aWins ? 3 : losses[pair], scoreB: aWins ? losses[pair] : 3 });
      }
      return state;
    };
    const decided = playCycle([0, 1, 2]);
    expect(leagueStandings(resolveFixture(decided.tournaments[0])).map(p => [p.playerId, p.points, p.difference, p.racksFor, p.place])).toEqual([['p0', 3, 2, 5, 1], ['p2', 3, -1, 4, 2], ['p1', 3, -1, 3, 3]]);
    const tied = playCycle([1, 1, 1]);
    expect(fixtureOutcome(resolveFixture(tied.tournaments[0]))).toEqual({ complete: true, champion: null });
    expect(fixturePlacements(tied.tournaments[0]).map(p => p.place)).toEqual([1, 1, 1]);
    const published = act(tied, { type: 'fixture.publish', tournamentId: 'league' });
    expect(published.tournaments[0].results.every(r => r.place === 1 && r.points === 300)).toBe(true);
  });

  it('permite corregir cualquier jornada, publica solo al terminar y no duplica puntos al reabrir', () => {
    let state = setup(5, 2);
    expect(() => act(state, { type: 'fixture.publish', tournamentId: 'league' })).toThrow(/Completá/);
    state = finish(state);
    const table = leagueStandings(resolveFixture(state.tournaments[0]));
    expect(table.map(p => p.played)).toEqual([8, 8, 8, 8, 8]);
    expect(table[0]).toMatchObject({ playerId: 'p0', wins: 8, points: 24 });
    expect(standings(state)[0].points).toBe(0);
    const match = resolveFixture(state.tournaments[0]).find(m => !m.bye)!;
    state = act(state, { type: 'match.clear', tournamentId: 'league', matchId: match.id });
    expect(fixtureOutcome(resolveFixture(state.tournaments[0])).complete).toBe(false);
    state = act(state, { type: 'match.score', tournamentId: 'league', matchId: match.id, scoreA: 0, scoreB: 3 });
    state = act(state, { type: 'fixture.publish', tournamentId: 'league' });
    const points = standings(state).map(p => p.points);
    expect(() => act(state, { type: 'match.clear', tournamentId: 'league', matchId: match.id })).toThrow(/Reabrí/);
    expect(() => act(state, { type: 'fixture.publish', tournamentId: 'league' })).toThrow(/Reabrí/);
    state = act(state, { type: 'results.reopen', tournamentId: 'league', reason: 'Corregir clasificación' });
    expect(standings(state).every(p => p.points === 0)).toBe(true);
    state = act(state, { type: 'fixture.publish', tournamentId: 'league' });
    expect(standings(state).map(p => p.points)).toEqual(points);
    expect(validateState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('programa encuentros en varias fechas y bloquea resultados futuros', () => {
    let state = setup(2);
    const schedule = (date: string): Action => ({ type: 'match.schedule', tournamentId: 'league', matchId: 'L1-1', table: ' 2 ', time: '19:30', date });
    for (const date of ['2024-12-31', '2025-02-30', 'no-fecha']) expect(() => act(state, schedule(date))).toThrow(/fecha/);
    state = act(state, schedule('2025-06-02'));
    expect(state.tournaments[0].fixture?.matches[0]).toMatchObject({ date: '2025-06-02', table: '2', time: '19:30' });
    expect(() => act(state, { type: 'match.score', tournamentId: 'league', matchId: 'L1-1', scoreA: 3, scoreB: 0 })).toThrow(/fecha del partido/);
    state = act(state, schedule('2025-06-01'));
    state = finish(state);
    expect(() => act(state, schedule('2025-06-02'))).toThrow(/disputado/);
    expect(isMatchDay(state.tournaments[0], '2025-06-01', '2025-05-31')).toBe(true);
  });

  it('rechaza cuadros alterados, cambios de formato y opciones de eliminación en respaldos', () => {
    const state = setup(5);
    const t = state.tournaments[0];
    for (const change of [{ format: 'single' as const }, { leagueRounds: 2 as const }]) expect(() => act(state, { type: 'tournament.save', tournament: { ...t, ...change } })).toThrow(/formato/);
    for (const change of [{ qualifiers: 2 }, { thirdPlace: true }, { finalRematch: true }, { leagueRounds: 3 }]) expect(() => validateState({ ...state, tournaments: [{ ...t, ...change }] })).toThrow();
    const altered = structuredClone(state);
    altered.tournaments[0].fixture!.matches[0].round = 5;
    expect(() => validateState(altered)).toThrow(/fixture/);
    expect(() => buildFixture(Array.from({ length: 33 }, (_, i) => String(i)), { format: 'league' })).toThrow(/32/);
    expect(() => act(state, { type: 'registration.save', tournamentId: 'league', playerIds: [] })).toThrow(/fixture/);
  });
});
