import { describe, expect, it } from 'vitest';
import { applyAction, createState, localDate, standings, validateState, type State } from './domain';
import { buildFixture, drawPlayers, fixturePlacements, fixtureSections, hasScoredDescendant, QUALIFIER_OPTIONS, resolveFixture, type Fixture } from './fixture';

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
  // La doble eliminación juega casi el doble de partidos que inscriptos.
  for (let i = 0; i < state.players.length * 2; i++) {
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

describe('Doble eliminación con fase final', () => {
  type Shape = { format: 'double'; qualifiers: number };
  /** Juega todo el cuadro eligiendo al ganador con `pick` y devuelve quién perdió contra quién, en orden. */
  function play(entrants: number, qualifiers: number, pick: (a: string, b: string) => string = a => a) {
    const shape: Shape = { format: 'double', qualifiers };
    const fixture: Fixture = buildFixture(Array.from({ length: entrants }, (_, i) => `p${i}`), shape);
    const tournament = { ...shape, fixture };
    const defeats: { id: string; bracket?: string; winner: string; loser: string }[] = [];
    for (let guard = 0; guard < 600; guard++) {
      const match = resolveFixture(tournament).find(m => m.ready && !m.complete);
      if (!match) return { tournament, defeats };
      const winner = pick(match.playerA!, match.playerB!);
      fixture.matches = fixture.matches.map(m => m.id === match.id ? { ...m, scoreA: winner === match.playerA ? 3 : 1, scoreB: winner === match.playerA ? 1 : 3 } : m);
      defeats.push({ id: match.id, bracket: match.bracket, winner, loser: winner === match.playerA ? match.playerB! : match.playerA! });
    }
    throw new Error('El cuadro no terminó');
  }
  const bracketSize = (n: number) => 2 ** Math.ceil(Math.log2(n));
  const cases = Array.from({ length: 62 }, (_, i) => i + 3).flatMap(n => QUALIFIER_OPTIONS.filter(q => q <= bracketSize(n) / 2).map(q => [n, q] as const));

  it('con cualquier cantidad de inscriptos nadie queda afuera con una sola derrota antes de la fase final', () => {
    for (const [entrants, qualifiers] of cases) {
      // Gana siempre quien tiene el número más alto, así los pases libres y las cabezas de serie no ordenan el resultado.
      const { tournament, defeats } = play(entrants, qualifiers, (a, b) => Number(a.slice(1)) > Number(b.slice(1)) ? a : b);
      const label = `${entrants} inscriptos, ${qualifiers} clasificados`;
      const matches = resolveFixture(tournament);
      expect(matches.every(m => m.complete), label).toBe(true);
      // Cada jugador real juega hasta perder dos veces, o una sola ya en la fase final; el campeón puede tener una derrota.
      const losses = new Map<string, string[]>();
      for (const d of defeats) losses.set(d.loser, [...(losses.get(d.loser) ?? []), d.bracket!]);
      const champion = matches.at(-1)!.winner!;
      for (let i = 0; i < entrants; i++) {
        const mine = losses.get(`p${i}`) ?? [];
        if (`p${i}` === champion) expect(mine.filter(b => b !== 'G'), label).toEqual([]);
        else expect([['G', 'P'], ['G', 'F'], ['F']], `${label}, p${i}: ${mine}`).toContainEqual(mine);
      }
      // A la fase final llegan la mitad invictos y la mitad con una derrota.
      const finalists = matches.filter(m => m.bracket === 'F' && m.round === 0).flatMap(m => [m.playerA!, m.playerB!]);
      expect(finalists, label).toHaveLength(qualifiers);
      expect(finalists.filter(id => defeats.some(d => d.loser === id && d.bracket === 'G')), label).toHaveLength(qualifiers / 2);
      // Todos quedan clasificados una sola vez.
      const placements = fixturePlacements(tournament);
      expect(placements.map(p => p.playerId).sort(), label).toEqual(Array.from({ length: entrants }, (_, i) => `p${i}`).sort());
      expect(placements.filter(p => p.place <= 2).map(p => p.place), label).toEqual([1, 2]);
      expect(Math.max(...placements.map(p => p.place)), label).toBeLessThanOrEqual(bracketSize(entrants));
    }
  });

  it('nadie enfrenta en el primer cruce de la fase final al rival que acaba de mandar a perdedores', () => {
    for (const [entrants, qualifiers] of cases.filter(([, q]) => q >= 4)) {
      const { tournament, defeats } = play(entrants, qualifiers);
      for (const m of resolveFixture(tournament).filter(m => m.bracket === 'F' && m.round === 0)) {
        const lastWin = defeats.filter(d => d.bracket === 'G' && d.winner === m.playerA).at(-1)!;
        expect(lastWin.loser, `${entrants} inscriptos, ${qualifiers} clasificados, partido ${m.id}`).not.toBe(m.playerB);
      }
    }
  });

  it('con dos clasificados es una doble eliminación completa con gran final a partido único', () => {
    const { tournament, defeats } = play(8, 2);
    const matches = resolveFixture(tournament);
    expect(matches.filter(m => !m.bye)).toHaveLength(14);
    expect(fixtureSections(matches).map(s => [s.title, s.rounds.length])).toEqual([['Llave de ganadores', 3], ['Llave de perdedores', 4], ['Gran final', 1]]);
    expect(matches.at(-1)).toMatchObject({ id: 'F1-1', playerA: defeats.filter(d => d.bracket === 'G').at(-1)!.winner, playerB: defeats.filter(d => d.bracket === 'P').at(-1)!.winner });
    expect(fixturePlacements(tournament).map(p => p.place).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 5, 7, 7]);
  });

  it('con 16 inscriptos y 8 clasificados reparte los puestos de perdedores y de la fase final', () => {
    const { tournament } = play(16, 8);
    const matches = resolveFixture(tournament);
    expect(fixtureSections(matches).map(s => [s.title, s.rounds.map(r => r.label)])).toEqual([
      ['Llave de ganadores', ['Ronda 1', 'Ronda 2']], ['Llave de perdedores', ['Ronda 1', 'Ronda 2']], ['Fase final', ['Cuartos de final', 'Semifinales', 'Final']],
    ]);
    expect(fixturePlacements(tournament).map(p => p.place).sort((a, b) => a - b)).toEqual([1, 2, 3, 3, 5, 5, 5, 5, 9, 9, 9, 9, 13, 13, 13, 13]);
  });

  it('propaga los pases libres por la llave de perdedores sin pedir resultados imposibles', () => {
    const { tournament } = play(5, 2);
    const matches = resolveFixture(tournament);
    expect(matches.filter(m => m.bye).map(m => m.id)).toEqual(['G1-1', 'G1-3', 'G1-4', 'P1-1', 'P1-2', 'P2-2']);
    expect(matches.filter(m => !m.bye)).toHaveLength(8);
    expect(fixturePlacements(tournament).map(p => p.place).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('exige al menos tres inscriptos y una fase final que entre en el cuadro', () => {
    expect(() => buildFixture(['a', 'b'], { format: 'double', qualifiers: 2 })).toThrow(/al menos 3/);
    expect(() => buildFixture(['a', 'b', 'c', 'd', 'e'], { format: 'double', qualifiers: 8 })).toThrow(/hasta 4 jugadores/);
    expect(() => buildFixture(['a', 'b', 'c', 'd', 'e'], { format: 'double', qualifiers: 3 })).toThrow(/cuántos jugadores clasifican/);
    expect(buildFixture(['a', 'b', 'c', 'd', 'e']).matches.every(m => m.bracket === undefined)).toBe(true);
  });

  it('se administra de punta a punta: formato fijo con fixture, correcciones de atrás hacia adelante y puntos por puesto', () => {
    let state = setup(6);
    const edit = (changes: object) => applyAction(state, { type: 'tournament.save', tournament: { ...state.tournaments[0], ...changes } });
    state = edit({ format: 'double', qualifiers: 8 });
    expect(() => generate(state)).toThrow(/hasta 4 jugadores/);
    state = generate(edit({ qualifiers: 4 }));
    expect(state.tournaments[0]).toMatchObject({ format: 'double', qualifiers: 4 });
    expect(() => edit({ qualifiers: 2 })).toThrow(/formato/);
    expect(() => edit({ format: 'single' })).toThrow(/formato/);
    expect(edit({ name: 'Copa renombrada' }).tournaments[0]).toMatchObject({ name: 'Copa renombrada', format: 'double', qualifiers: 4 });

    const first = resolveFixture(state.tournaments[0]).find(m => m.ready && !m.complete)!;
    state = finish(state);
    // Cambiar el ganador de un partido de ganadores afecta a las dos llaves: primero hay que quitar lo que depende de él.
    expect(hasScoredDescendant(state.tournaments[0], first.id)).toBe(true);
    expect(() => applyAction(state, { type: 'match.score', tournamentId: 'cup', matchId: first.id, scoreA: 1, scoreB: 3 })).toThrow(/rondas posteriores/);
    expect(() => applyAction(state, { type: 'match.clear', tournamentId: 'cup', matchId: first.id })).toThrow(/rondas posteriores/);
    expect(hasScoredDescendant(state.tournaments[0], 'F2-1')).toBe(false);

    state = applyAction(state, { type: 'fixture.publish', tournamentId: 'cup' });
    const results = [...state.tournaments[0].results].sort((a, b) => a.place - b.place);
    expect(results.map(r => r.place)).toEqual([1, 2, 3, 3, 5, 5]);
    expect(results.map(r => r.points)).toEqual([300, 200, 150, 150, 60, 60]);
    expect(standings(state, undefined, 'Tercera')[0].points).toBe(300);
    expect(() => validateState({ ...state, tournaments: [{ ...state.tournaments[0], qualifiers: 2 }] })).toThrow();
    expect(() => validateState({ ...state, tournaments: [{ ...state.tournaments[0], format: undefined, qualifiers: undefined }] })).toThrow();
    const swapped = state.tournaments[0].fixture!.matches.map(m => m.id === 'P1-1' ? { ...m, bracket: 'G' as const } : m);
    expect(() => validateState({ ...state, tournaments: [{ ...state.tournaments[0], fixture: { ...state.tournaments[0].fixture!, matches: swapped } }] })).toThrow();
  });
});
