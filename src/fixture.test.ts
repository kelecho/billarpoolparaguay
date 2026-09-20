import { describe, expect, it } from 'vitest';
import { applyAction, createState, localDate, standings, validateState, type State } from './domain';
import { buildFixture, drawPlayers, fixturePlacements, resolveFixture } from './fixture';

function setup(count = 4, future = false): State {
  let state = createState(false);
  state.players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Jugador ${i}`, city: 'Asunción', club: '', category: 'Tercera', initialPoints: 0 }));
  state.players.push({ id: 'other', name: 'Otra categoría', city: 'Luque', club: '', category: 'Primera', initialPoints: 100 });
  state = applyAction(state, { type: 'tournament.save', tournament: { id: 'cup', name: 'Copa Tercera', date: localDate(future ? 1 : -1), venue: 'Club local', discipline: 'Bola 9', category: 'Tercera', raceTo: 3, results: [] } });
  return applyAction(state, { type: 'registration.save', tournamentId: 'cup', playerIds: state.players.filter(p => p.category === 'Tercera').map(p => p.id) });
}
function generate(state: State): State {
  return applyAction(state, { type: 'fixture.generate', tournamentId: 'cup', playerIds: state.tournaments[0].registered!, draw: 'ranking' });
}
function finish(state: State): State {
  for (let i = 0; i < state.players.length; i++) {
    const ready = resolveFixture(state.tournaments[0]).find(m => m.ready && !m.complete);
    if (!ready) return state;
    state = applyAction(state, { type: 'match.score', tournamentId: 'cup', matchId: ready.id, scoreA: 3, scoreB: 1 });
  }
  throw new Error('El fixture no terminó');
}

describe('Inscripciones y sorteo inicial', () => {
  it('limita inscripciones a jugadores distintos de la categoría', () => {
    const state = setup();
    for (const playerIds of [['p0', 'p0'], ['p0', 'missing'], ['p0', 'other']]) {
      expect(() => applyAction(state, { type: 'registration.save', tournamentId: 'cup', playerIds })).toThrow();
    }
    expect(() => applyAction(state, { type: 'player.remove', playerId: 'p0' })).toThrow(/inscripto/);
    expect(() => applyAction(state, { type: 'player.save', player: { ...state.players[0], category: 'Primera' } })).toThrow(/traspaso/);
    expect(() => applyAction(state, { type: 'tournament.save', tournament: { ...state.tournaments[0], category: 'Primera' } })).toThrow(/inscriptos/);
  });
  it('requiere entre 2 y 128 participantes y todos los inscriptos en el sorteo', () => {
    expect(() => buildFixture(['a'])).toThrow();
    expect(() => buildFixture(Array.from({ length: 129 }, (_, i) => String(i)))).toThrow();
    const state = setup();
    for (const playerIds of [['p0', 'p1'], ['p0', 'p1', 'p2', 'other'], ['p0', 'p1', 'p1', 'p3']]) {
      expect(() => applyAction(state, { type: 'fixture.generate', tournamentId: 'cup', playerIds })).toThrow();
    }
  });
  it('guarda el sorteo, admite volver a sortear antes de jugar y protege el cuadro iniciado', () => {
    const source = setup(5);
    const order = drawPlayers(source.tournaments[0].registered!);
    expect(new Set(order)).toEqual(new Set(source.tournaments[0].registered));
    expect(source.tournaments[0].registered).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
    let state = applyAction(source, { type: 'fixture.generate', tournamentId: 'cup', playerIds: order, draw: 'random' });
    expect(validateState(JSON.parse(JSON.stringify(state))).tournaments[0].fixture).toEqual(state.tournaments[0].fixture);
    const reverse = [...order].reverse();
    state = applyAction(state, { type: 'fixture.generate', tournamentId: 'cup', playerIds: reverse, draw: 'random' });
    expect(state.tournaments[0].fixture?.seeds).toEqual(buildFixture(reverse).seeds);
    expect(() => applyAction(state, { type: 'registration.save', tournamentId: 'cup', playerIds: [] })).toThrow(/fixture/);
    const match = resolveFixture(state.tournaments[0]).find(m => m.ready && !m.bye)!;
    state = applyAction(state, { type: 'match.score', tournamentId: 'cup', matchId: match.id, scoreA: 3, scoreB: 0 });
    expect(() => applyAction(state, { type: 'fixture.generate', tournamentId: 'cup', playerIds: order })).toThrow(/cerrado/);
    expect(() => applyAction(state, { type: 'fixture.reset', tournamentId: 'cup' })).toThrow(/disputados/);
    expect(() => applyAction(state, { type: 'tournament.remove', tournamentId: 'cup' })).toThrow(/partidos/);
  });
  it('permite quitar el fixture sin resultados y editar las inscripciones', () => {
    let state = generate(setup());
    state = applyAction(state, { type: 'fixture.reset', tournamentId: 'cup' });
    state = applyAction(state, { type: 'registration.save', tournamentId: 'cup', playerIds: ['p0', 'p1'] });
    expect(generate(state).tournaments[0].fixture?.matches).toHaveLength(1);
  });
});

describe('Fixture y resultados', () => {
  it.each([2, 3, 4, 5, 7, 8, 9, 16, 31, 32, 64, 127, 128])('completa un cuadro de %i jugadores sin pérdidas ni duplicados', count => {
    const drawn = generate(setup(count));
    const initial = resolveFixture(drawn.tournaments[0]);
    expect(initial.filter(m => m.bye)).toHaveLength(2 ** Math.ceil(Math.log2(count)) - count);
    const complete = finish(drawn);
    expect(resolveFixture(complete.tournaments[0]).filter(m => m.scoreA !== undefined)).toHaveLength(count - 1);
    expect(standings(complete, undefined, 'Tercera').every(p => p.points === 0)).toBe(true);
    const placements = fixturePlacements(complete.tournaments[0]);
    expect(placements).toHaveLength(count);
    expect(new Set(placements.map(p => p.playerId)).size).toBe(count);
    const published = applyAction(complete, { type: 'fixture.publish', tournamentId: 'cup' });
    expect(published.tournaments[0].results.filter(r => r.place === 1)).toHaveLength(1);
    expect(standings(published, undefined, 'Tercera')[0]).toMatchObject({ rank: 1, points: 300, category: 'Tercera' });
    expect(standings(published, undefined, 'Primera')[0].points).toBe(100);
    expect(validateState(JSON.parse(JSON.stringify(published))).tournaments[0].fixture).toEqual(published.tournaments[0].fixture);
  });
  it('rechaza marcadores incompletos, empates, pases libres y partidos por definir', () => {
    const state = generate(setup(3));
    const matches = resolveFixture(state.tournaments[0]);
    const ready = matches.find(m => m.ready && !m.bye)!;
    for (const [scoreA, scoreB] of [[0, 0], [3, 3], [-1, 3], [1.5, 3], [3, 4]]) {
      expect(() => applyAction(state, { type: 'match.score', tournamentId: 'cup', matchId: ready.id, scoreA, scoreB })).toThrow();
    }
    for (const match of matches.filter(m => m.bye || !m.ready)) {
      expect(() => applyAction(state, { type: 'match.score', tournamentId: 'cup', matchId: match.id, scoreA: 3, scoreB: 0 })).toThrow();
    }
    expect(() => applyAction(state, { type: 'fixture.publish', tournamentId: 'cup' })).toThrow(/Completá/);
    expect(() => applyAction(state, { type: 'results.publish', tournamentId: 'cup', placements: [{ playerId: 'other', place: 1 }] })).toThrow(/fixture/);
  });
  it('permite programar antes de la fecha pero impide jugar y cambia solo la programación', () => {
    let state = generate(setup(2, true));
    state = applyAction(state, { type: 'match.schedule', tournamentId: 'cup', matchId: '1-1', table: ' 2 ', time: '19:30' });
    expect(state.tournaments[0].fixture?.matches[0]).toMatchObject({ table: '2', time: '19:30' });
    expect(() => applyAction(state, { type: 'match.schedule', tournamentId: 'cup', matchId: '1-1', table: '', time: '25:00' })).toThrow();
    expect(() => applyAction(state, { type: 'match.score', tournamentId: 'cup', matchId: '1-1', scoreA: 3, scoreB: 0 })).toThrow(/fecha/);
    expect(() => applyAction(state, { type: 'tournament.save', tournament: { ...state.tournaments[0], raceTo: 5 } })).toThrow(/fixture/);
  });
  it('protege resultados posteriores, permite corregir de atrás hacia adelante y no duplica puntos', () => {
    let state = finish(generate(setup()));
    expect(() => applyAction(state, { type: 'match.score', tournamentId: 'cup', matchId: '1-1', scoreA: 0, scoreB: 3 })).toThrow(/posteriores/);
    expect(() => applyAction(state, { type: 'match.clear', tournamentId: 'cup', matchId: '1-1' })).toThrow(/posteriores/);
    state = applyAction(state, { type: 'match.score', tournamentId: 'cup', matchId: '1-1', scoreA: 3, scoreB: 2 });
    state = applyAction(state, { type: 'fixture.publish', tournamentId: 'cup' });
    expect(state.tournaments[0].results.filter(r => r.place === 3)).toHaveLength(2);
    expect(() => applyAction(state, { type: 'fixture.publish', tournamentId: 'cup' })).toThrow(/Reabrí/);
    expect(() => applyAction(state, { type: 'match.clear', tournamentId: 'cup', matchId: '2-1' })).toThrow(/Reabrí/);
    state = applyAction(state, { type: 'results.reopen', tournamentId: 'cup', reason: 'Corregir el ganador' });
    expect(standings(state, undefined, 'Tercera').every(p => p.points === 0)).toBe(true);
    state = applyAction(state, { type: 'match.clear', tournamentId: 'cup', matchId: '2-1' });
    state = applyAction(state, { type: 'match.score', tournamentId: 'cup', matchId: '1-1', scoreA: 0, scoreB: 3 });
    expect(resolveFixture(state.tournaments[0]).at(-1)?.playerA).toBe('p3');
    state = applyAction(finish(state), { type: 'fixture.publish', tournamentId: 'cup' });
    expect(standings(state, undefined, 'Tercera')[0]).toMatchObject({ id: 'p3', points: 300 });
  });
  it('rechaza respaldos con cuadros o clasificaciones adulterados', () => {
    const corruptions = [
      (s: State) => { s.tournaments[0].fixture!.seeds[0] = 'other'; },
      (s: State) => { s.tournaments[0].fixture!.matches[0].id = 'inventado'; },
      (s: State) => { s.tournaments[0].fixture!.matches.pop(); },
      (s: State) => { Object.assign(s.tournaments[0].fixture!.matches.at(-1)!, { scoreA: 3, scoreB: 0 }); },
    ];
    for (const corrupt of corruptions) {
      const state = generate(setup()); corrupt(state);
      expect(() => validateState(state)).toThrow();
    }
    const state = applyAction(finish(generate(setup())), { type: 'fixture.publish', tournamentId: 'cup' });
    state.tournaments[0].results[0].place = 3;
    expect(() => validateState(state)).toThrow();
  });
});

describe('Categorías fijas', () => {
  it('numera cada ranking desde uno y conserva categoría aunque se supere el mínimo anterior', () => {
    let state = setup(3);
    state.players[0].initialPoints = 990;
    state = applyAction(finish(generate(state)), { type: 'fixture.publish', tournamentId: 'cup' });
    const table = standings(state, undefined, 'Tercera');
    expect(table.map(p => p.rank)).toEqual([1, 2, 3]);
    expect(table[0]).toMatchObject({ points: 1290, category: 'Tercera' });
    expect(standings(state, undefined, 'Primera')[0]).toMatchObject({ rank: 1, categoryRank: 1 });
    expect(standings(state, 'Bola 9', 'Tercera').map(p => p.rank)).toEqual([1, 2, 3]);
  });
  it('conserva categorías antiguas al migrar y al cambiar mínimos o nombres', () => {
    const old = createState();
    for (const player of old.players) delete player.category;
    let state = validateState(old);
    const categories = state.players.map(p => p.category);
    state = applyAction(state, { type: 'rules.save', rules: { ...state.rules, categories: state.rules.categories.map((c, i) => ({ ...c, min: i === 0 ? 999999 : c.min })) } });
    expect(state.players.map(p => p.category)).toEqual(categories);
    let active = generate(setup());
    active = applyAction(active, { type: 'rules.save', rules: { ...active.rules, categories: active.rules.categories.map(c => c.name === 'Tercera' ? { ...c, name: 'Tercera nacional' } : c) } });
    expect(active.tournaments[0].category).toBe('Tercera nacional');
    expect(active.players[0].category).toBe('Tercera nacional');
    expect(standings(active, undefined, 'Tercera nacional')).toHaveLength(4);
  });
});
