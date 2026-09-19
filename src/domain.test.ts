import { describe, expect, it } from 'vitest';
import { applyAction, createState, localDate, standings, validateState, type State } from './domain';

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
  it('publica puntos, actualiza categoría y calcula el movimiento de posición', () => {
    const original = fixture();
    const next = applyAction(original, { type: 'results.publish', tournamentId: 'cup', placements: [{ playerId: 'ana', place: 1 }, { playerId: 'luis', place: 9 }] });
    const ranking = standings(next);
    expect(ranking[0]).toMatchObject({ id: 'ana', points: 1250, rank: 1, previousRank: 2, category: 'Segunda', played: 1, wins: 1 });
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
