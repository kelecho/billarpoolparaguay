import { hasRoster, type State, type Tournament } from './domain';
import { buildFixture, fixturePlacements, hasScoredDescendant, entrantLimit, resolveFixture, validMatchDate } from './fixture.ts';

export type TournamentAction =
  | { type: 'registration.save'; tournamentId: string; playerIds: string[] }
  | { type: 'fixture.generate'; tournamentId: string; playerIds: string[]; draw?: 'random' | 'ranking' | 'manual' }
  | { type: 'fixture.reset'; tournamentId: string }
  | { type: 'match.score'; tournamentId: string; matchId: string; scoreA: number; scoreB: number }
  | { type: 'match.clear'; tournamentId: string; matchId: string }
  | { type: 'match.schedule'; tournamentId: string; matchId: string; table: string; time: string; date?: string }
  | { type: 'fixture.publish'; tournamentId: string };

export function applyTournamentAction(state: State, action: TournamentAction, today: string): State {
  const current = state.tournaments.find(t => t.id === action.tournamentId);
  if (!current) throw new Error('El torneo no existe.');
  if (current.results.length) throw new Error('Reabrí el torneo antes de modificarlo.');
  if (!hasRoster(current)) throw new Error('Elegí la categoría del torneo, o marcalo como abierto, antes de inscribir jugadores.');
  let tournament: Tournament = { ...current };
  switch (action.type) {
    case 'registration.save': {
      if (current.fixture) throw new Error('Quitá el fixture antes de cambiar los inscriptos.');
      if (!Array.isArray(action.playerIds) || action.playerIds.length > entrantLimit(current.format) || new Set(action.playerIds).size !== action.playerIds.length) throw new Error(`Inscribí hasta ${entrantLimit(current.format)} jugadores distintos.`);
      if (current.category && action.playerIds.some(id => !state.players.some(p => p.id === id && p.category === current.category))) throw new Error('Solo podés inscribir jugadores de la categoría del torneo.');
      tournament.registered = [...action.playerIds];
      break;
    }
    case 'fixture.generate': {
      if (current.fixture?.matches.some(m => m.scoreA !== undefined)) throw new Error('El sorteo está cerrado porque ya hay partidos disputados.');
      const registered = current.registered ?? [];
      if (!Array.isArray(action.playerIds) || action.playerIds.length !== registered.length || action.playerIds.some(id => !registered.includes(id))) throw new Error('El fixture debe incluir a todos los inscriptos.');
      tournament.fixture = { ...buildFixture(action.playerIds, current), draw: action.draw ?? 'manual' };
      break;
    }
    case 'fixture.reset':
      if (current.fixture?.matches.some(m => m.scoreA !== undefined)) throw new Error('El fixture ya tiene partidos disputados. Quitá sus resultados desde la última ronda antes de cambiar los cruces.');
      delete tournament.fixture;
      break;
    case 'match.score':
    case 'match.clear':
    case 'match.schedule': {
      const fixture = current.fixture;
      const match = resolveFixture(current).find(m => m.id === action.matchId);
      if (!fixture || !match) throw new Error('El partido no existe.');
      if (action.type === 'match.schedule') {
        if (typeof action.table !== 'string' || action.table.length > 50 || typeof action.time !== 'string' || (action.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(action.time))) throw new Error('Revisá la mesa y la hora del partido.');
        if (action.date !== undefined && action.date !== '' && (current.format !== 'league' || !validMatchDate(action.date) || action.date < current.date)) throw new Error('La fecha del partido debe ser válida y no anterior al inicio de la liga.');
        if (match.scoreA !== undefined && action.date && action.date > today) throw new Error('Un partido disputado no puede programarse para una fecha futura.');
        tournament.fixture = { ...fixture, matches: fixture.matches.map(m => m.id === match.id ? { ...m, table: action.table.trim(), time: action.time, date: action.date || undefined } : m) };
        break;
      }
      if (action.type === 'match.score') {
        if (current.date > today) throw new Error('Podrás registrar partidos a partir de la fecha del torneo.');
        if (match.date && match.date > today) throw new Error('Podrás registrar el resultado a partir de la fecha del partido.');
        if (!match.ready || match.bye) throw new Error('Esperá a que estén definidos los dos jugadores del partido.');
        const target = current.raceTo ?? 5;
        if (![action.scoreA, action.scoreB].every(n => Number.isInteger(n) && n >= 0) || Math.max(action.scoreA, action.scoreB) !== target || Math.min(action.scoreA, action.scoreB) >= target) throw new Error(`El ganador debe llegar a ${target} partidas y el otro jugador debe tener menos.`);
        const winner = action.scoreA > action.scoreB ? match.playerA : match.playerB;
        if (winner !== match.winner && hasScoredDescendant(current, match.id)) throw new Error('Primero quitá los resultados de las rondas posteriores que dependen de este partido.');
        tournament.fixture = { ...fixture, matches: fixture.matches.map(m => m.id === match.id ? { ...m, scoreA: action.scoreA, scoreB: action.scoreB } : m) };
      } else {
        if (hasScoredDescendant(current, match.id)) throw new Error('Primero quitá los resultados de las rondas posteriores que dependen de este partido.');
        tournament.fixture = { ...fixture, matches: fixture.matches.map(m => { if (m.id !== match.id) return m; const { scoreA: _a, scoreB: _b, ...rest } = m; return rest; }) };
      }
      break;
    }
    case 'fixture.publish':
      if (current.date > today) throw new Error('Podrás publicar resultados a partir de la fecha del torneo.');
      tournament.results = fixturePlacements(current).map(p => ({ ...p, points: state.rules.points[p.place - 1] ?? state.rules.participation }));
      break;
  }
  return { ...state, tournaments: state.tournaments.map(t => t.id === current.id ? tournament : t) };
}
