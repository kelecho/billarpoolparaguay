import { describe, expect, it } from 'vitest';
import { applyAction, createState, dateIn, isLive, isMatchDay, localDate, pointsHistory, standings, validateState, type State, type Tournament } from './domain';

function fixture(): State {
  const state = createState(false);
  state.players = [
    { id: 'ana', name: 'Ana Vera', city: 'Asunción', club: '', initialPoints: 950 },
    { id: 'luis', name: 'Luis López', city: 'Luque', club: '', initialPoints: 1100 },
  ];
  state.tournaments = [{ id: 'cup', name: 'Copa local', venue: 'Club Central', date: localDate(-1), discipline: 'Bola 9', results: [] }];
  return state;
}

describe('Ranking y resultados', () => {
  it('valida datos de demostración y un registro vacío', () => {
    expect(validateState(createState()).players).toHaveLength(12);
    expect(validateState(createState(false)).players).toHaveLength(0);
  });
  it('publica puntos sin cambiar la categoría y calcula el movimiento de posición', () => {
    const original = fixture();
    const next = applyAction(original, { type: 'results.publish', tournamentId: 'cup', placements: [{ playerId: 'ana', place: 1 }, { playerId: 'luis', place: 9 }] });
    const ranking = standings(next);
    expect(ranking[0]).toMatchObject({ id: 'ana', points: 1250, rank: 1, previousRank: 2, category: 'Tercera', played: 1, wins: 1 });
    expect(ranking[1].points).toBe(1130);
    expect(original.tournaments[0].results).toEqual([]);
  });
  it('impide sumar un torneo dos veces y editarlo mientras está publicado', () => {
    const next = applyAction(fixture(), { type: 'results.publish', tournamentId: 'cup', placements: [{ playerId: 'ana', place: 1 }] });
    expect(() => applyAction(next, { type: 'results.publish', tournamentId: 'cup', placements: [{ playerId: 'ana', place: 1 }] })).toThrow();
    expect(() => applyAction(next, { type: 'tournament.save', tournament: { ...next.tournaments[0], name: 'Otro' } })).toThrow();
  });
  it.each([
    [{ playerId: 'ana', place: 1 }, { playerId: 'ana', place: 2 }],
    [{ playerId: 'ana', place: 1 }, { playerId: 'luis', place: 1 }],
    [{ playerId: 'missing', place: 1 }],
    [{ playerId: 'ana', place: 2 }],
    [{ playerId: 'ana', place: 1 }, { playerId: 'luis', place: 1.5 }],
    [],
  ])('rechaza posiciones inválidas (%j)', (...placements) => {
    expect(() => applyAction(fixture(), { type: 'results.publish', tournamentId: 'cup', placements })).toThrow();
  });
  it('impide publicar resultados futuros', () => {
    const state = fixture();
    state.tournaments[0].date = localDate(1);
    expect(() => applyAction(state, { type: 'results.publish', tournamentId: 'cup', placements: [{ playerId: 'ana', place: 1 }] })).toThrow(/fecha/);
  });
  it('retira los puntos al reabrir y permite publicar una corrección', () => {
    const state = applyAction(fixture(), { type: 'results.publish', tournamentId: 'cup', placements: [{ playerId: 'ana', place: 1 }] });
    const reopened = applyAction(state, { type: 'results.reopen', tournamentId: 'cup', reason: 'Corregir posición' });
    expect(standings(reopened)[0].id).toBe('luis');
    expect(standings(reopened).find(p => p.id === 'ana')?.points).toBe(950);
    expect(() => applyAction(state, { type: 'results.reopen', tournamentId: 'cup', reason: 'x' })).toThrow();
    expect(applyAction(reopened, { type: 'results.publish', tournamentId: 'cup', placements: [{ playerId: 'luis', place: 1 }] }).tournaments[0].results[0].playerId).toBe('luis');
  });
  it('preserva puntos históricos al cambiar reglas', () => {
    const state = applyAction(fixture(), { type: 'results.publish', tournamentId: 'cup', placements: [{ playerId: 'ana', place: 1 }] });
    const next = applyAction(state, { type: 'rules.save', rules: { ...state.rules, points: [500, 200, 150, 100, 60, 60, 60, 60] } });
    expect(standings(next)[0].points).toBe(1250);
  });
  it('desempata por victorias y luego por nombre', () => {
    const state = fixture();
    state.players[0].initialPoints = 800;
    const next = applyAction(state, { type: 'results.publish', tournamentId: 'cup', placements: [{ playerId: 'ana', place: 1 }] });
    expect(standings(next)[0].id).toBe('ana');
    state.players[0].initialPoints = 1100;
    expect(standings(state)[0].id).toBe('ana');
  });
});

describe('Disciplinas, historial y bajas', () => {
  it('arma el ranking de una disciplina solo con los puntos de sus torneos', () => {
    const state = createState();
    const bola10 = standings(state, 'Bola 10');
    expect(bola10).toHaveLength(8);
    expect(bola10[0]).toMatchObject({ id: 'p2', points: 300, rank: 1, category: 'Primera' });
    expect(standings(state, 'Bola 8').some(p => p.id === 'p4')).toBe(false);
    expect(standings(state).find(p => p.id === 'p2')).toMatchObject({ rank: 2, previousRank: 3, podiums: 1, bestPlace: 1 });
  });
  it('reconstruye la evolución de puntos desde los puntos iniciales', () => {
    const diego = standings(createState()).find(p => p.id === 'p1')!;
    expect(pointsHistory(diego)).toEqual([2150, 2350, 2650, 2800]);
  });
  it('elimina jugadores y torneos solo cuando no tienen resultados', () => {
    const state = createState();
    expect(applyAction(state, { type: 'player.remove', playerId: 'p11' }).players).toHaveLength(11);
    expect(() => applyAction(state, { type: 'player.remove', playerId: 'p1' })).toThrow(/resultados publicados/);
    expect(applyAction(state, { type: 'tournament.remove', tournamentId: 't1' }).tournaments).toHaveLength(4);
    expect(() => applyAction(state, { type: 'tournament.remove', tournamentId: 't3' })).toThrow(/Reabrí/);
  });
  it('usa la fecha indicada por el servidor al publicar', () => {
    const state = fixture();
    state.tournaments[0].date = '2026-09-19';
    const placements = [{ playerId: 'ana', place: 1 }];
    expect(() => applyAction(state, { type: 'results.publish', tournamentId: 'cup', placements }, '2026-09-18')).toThrow(/fecha/);
    expect(applyAction(state, { type: 'results.publish', tournamentId: 'cup', placements }, '2026-09-19').tournaments[0].results).toHaveLength(1);
    expect(dateIn('America/Asuncion', new Date('2026-09-20T02:30:00Z'))).toBe('2026-09-19');
  });
});

describe('Validación de datos', () => {
  it('rechaza fechas inexistentes', () => {
    const state = fixture(); state.tournaments[0].date = '2026-02-30';
    expect(() => validateState(state)).toThrow();
  });
  it('rechaza referencias a jugadores ausentes y puntos negativos', () => {
    const state = fixture(); state.tournaments[0].results = [{ playerId: 'missing', place: 1, points: 300 }];
    expect(() => validateState(state)).toThrow();
    state.tournaments[0].results = [{ playerId: 'ana', place: 1, points: -1 }];
    expect(() => validateState(state)).toThrow();
  });
  it('rechaza jugadores duplicados por nombre y ciudad', () => {
    const state = fixture();
    expect(() => applyAction(state, { type: 'player.save', player: { ...state.players[0], id: 'other', name: ' ANA VERA ' } })).toThrow(/Ya existe/);
  });
  it('requiere un mínimo de cero y categorías distintas', () => {
    const state = fixture(); state.rules.categories[3].min = 1;
    expect(() => validateState(state)).toThrow();
    state.rules.categories[3].min = 0; state.rules.categories[3].name = 'Primera';
    expect(() => validateState(state)).toThrow();
  });
});

describe('Fotos de jugadores', () => {
  it('conserva la foto al guardar, clasificar y restaurar un respaldo', async () => {
    const { readFileSync } = await import('node:fs');
    const photo = `data:image/jpeg;base64,${readFileSync(new URL('../tests/fixtures/player.jpg', import.meta.url)).toString('base64')}`;
    const state = fixture();
    const next = applyAction(state, { type: 'player.save', player: { ...state.players[0], photo } });
    expect(validateState(JSON.parse(JSON.stringify(next))).players[0].photo).toBe(photo);
    expect(standings(next).find(p => p.id === 'ana')?.photo).toBe(photo);
    const { photo: _removed, ...player } = next.players[0];
    expect(applyAction(next, { type: 'player.save', player }).players[0].photo).toBeUndefined();
  });
  it.each([null, 42, '', 'https://example.com/photo.jpg', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/jpeg;base64,YmFk', `data:image/jpeg;base64,${'A'.repeat(64 * 1024)}`])('rechaza fotos inválidas o demasiado grandes (caso %#)', photo => {
    const state = fixture();
    expect(() => validateState({ ...state, players: [{ ...state.players[0], photo }] })).toThrow(/foto/);
  });
});

describe('torneos en juego', () => {
  const base: Tournament = { id: 't', name: 'Copa', date: '2026-03-10', venue: 'Club', discipline: 'Bola 8', results: [], fixture: { seeds: ['a', 'b'], matches: [{ id: '1-1', round: 0, index: 0 }] } };
  const live = (t: Tournament) => isLive(t, '2026-03-10', '2026-03-09');

  it('cuenta como en juego un torneo con fixture, sin publicar, de hoy o de ayer', () => {
    expect(live(base)).toBe(true);
    expect(live({ ...base, date: '2026-03-09' })).toBe(true);
  });

  it('no actualiza seguido por torneos futuros, viejos, sin fixture o ya publicados', () => {
    expect(live({ ...base, date: '2026-03-11' })).toBe(false);
    expect(live({ ...base, date: '2026-03-08' })).toBe(false);
    expect(live({ ...base, fixture: undefined })).toBe(false);
    expect(isMatchDay({ ...base, fixture: undefined }, '2026-03-10', '2026-03-09')).toBe(true);
    expect(isMatchDay({ ...base, date: '2026-03-08' }, '2026-03-10', '2026-03-09')).toBe(false);
    expect(live({ ...base, results: [{ playerId: 'a', place: 1, points: 300 }] })).toBe(false);
  });
});

describe('banner del torneo', () => {
  const banner = 'data:image/jpeg;base64,/9j/2wBDAAEBAf/Z';
  const ref = `/api/photos/${'c'.repeat(64)}.jpg`;

  it('se carga al crear o editar el torneo y se conserva al editar otros datos', () => {
    let state = createState();
    const upcoming = state.tournaments.find(t => !t.results.length)!;
    state = applyAction(state, { type: 'tournament.save', tournament: { ...upcoming, category: 'Primera', banner } });
    expect(state.tournaments.find(t => t.id === upcoming.id)!.banner).toBe(banner);
    state = applyAction(state, { type: 'tournament.save', tournament: { ...state.tournaments.find(t => t.id === upcoming.id)!, name: 'Otro nombre' } });
    expect(state.tournaments.find(t => t.id === upcoming.id)).toMatchObject({ name: 'Otro nombre', banner });
  });

  it('se cambia o se quita también con los resultados publicados, y solo admite JPEG o una referencia', () => {
    let state = createState();
    const finished = state.tournaments.find(t => t.results.length)!;
    expect(() => applyAction(state, { type: 'tournament.save', tournament: { ...finished, banner } })).toThrow(/Reabrí/);
    state = applyAction(state, { type: 'tournament.banner', tournamentId: finished.id, banner: ref });
    expect(state.tournaments.find(t => t.id === finished.id)).toMatchObject({ banner: ref, results: finished.results });
    state = applyAction(state, { type: 'tournament.banner', tournamentId: finished.id });
    expect('banner' in state.tournaments.find(t => t.id === finished.id)!).toBe(false);
    expect(() => applyAction(state, { type: 'tournament.banner', tournamentId: finished.id, banner: 'https://otro.example/afiche.jpg' })).toThrow(/banner/);
    expect(() => applyAction(state, { type: 'tournament.banner', tournamentId: finished.id, banner: 'data:image/svg+xml;base64,PHN2Zy8+' })).toThrow(/banner/);
    expect(() => applyAction(state, { type: 'tournament.banner', tournamentId: 'no-existe', banner: ref })).toThrow(/no existe/);
  });
});
