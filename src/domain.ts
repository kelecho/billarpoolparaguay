import { MAX_ENTRANTS, validateFixture, type Fixture } from './fixture.ts';
import { applyTournamentAction, type TournamentAction } from './tournamentActions.ts';
import { isPhotoRef, validPlayerPhoto } from './playerPhoto.ts';

export const DISCIPLINES = ['Bola 8', 'Bola 9', 'Bola 10'] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export type Player = { id: string; name: string; city: string; club: string; initialPoints: number; photo?: string; category?: string };
export type Result = { playerId: string; place: number; points: number };
export type Tournament = { id: string; name: string; date: string; venue: string; discipline: Discipline; results: Result[]; category?: string; registered?: string[]; raceTo?: number; fixture?: Fixture };
export type Rules = { categories: { name: string; min: number }[]; points: number[]; participation: number };
export type State = { version: 1; demo: boolean; players: Player[]; tournaments: Tournament[]; rules: Rules };
export type Entry = Result & { tournament: Tournament };
export type RankedPlayer = Player & {
  points: number;
  category: string;
  rank: number;
  previousRank: number;
  categoryRank: number;
  played: number;
  wins: number;
  podiums: number;
  bestPlace: number | null;
  entries: Entry[];
};
export type Action =
  | TournamentAction
  | { type: 'player.save'; player: Player }
  | { type: 'player.remove'; playerId: string }
  | { type: 'tournament.save'; tournament: Tournament }
  | { type: 'tournament.remove'; tournamentId: string }
  | { type: 'results.publish'; tournamentId: string; placements: Pick<Result, 'playerId' | 'place'>[] }
  | { type: 'results.reopen'; tournamentId: string; reason: string }
  | { type: 'rules.save'; rules: Rules };

export const DEFAULT_RULES: Rules = {
  categories: [{ name: 'Primera', min: 2000 }, { name: 'Segunda', min: 1000 }, { name: 'Tercera', min: 400 }, { name: 'Principiante', min: 0 }],
  points: [300, 200, 150, 100, 60, 60, 60, 60],
  participation: 30,
};

export const number = (n: number) => n.toLocaleString('es-PY');

export const categoryFor = (points: number, rules: Rules) =>
  [...rules.categories].sort((a, b) => b.min - a.min).find(c => points >= c.min)?.name || rules.categories.at(-1)!.name;

export const dateLabel = (date: string, short = false) =>
  new Intl.DateTimeFormat('es-PY', { day: 'numeric', month: short ? 'short' : 'long', ...(short ? {} : { year: 'numeric' }) }).format(new Date(`${date}T12:00:00`));

export function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fecha de hoy en una zona horaria dada; el servidor no comparte la hora local de los jugadores. */
export const dateIn = (timeZone: string, now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);

/** Sin publicar y con fecha de hoy o de ayer: hay inscripciones, sorteo o marcadores por aparecer, y vale la pena actualizar seguido. */
export const isMatchDay = (t: Tournament, today = localDate(), since = localDate(-1)) => !t.results.length && t.date <= today && t.date >= since;
/** Además ya tiene fixture: se están jugando los partidos. */
export const isLive = (t: Tournament, today?: string, since?: string) => Boolean(t.fixture) && isMatchDay(t, today, since);

const byDate = (a: Tournament, b: Tournament) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

/** Los registros antiguos conservan su categoría al migrar; los puntos ya no causan ascensos. */
export function playerCategory(player: Player, state: State): string {
  return player.category ?? categoryFor(player.initialPoints + state.tournaments.reduce((sum, t) => sum + (t.results.find(r => r.playerId === player.id)?.points ?? 0), 0), state.rules);
}

/** Filtra la categoría antes de numerar posiciones y calcular movimientos. */
export function standings(state: State, discipline?: Discipline, category?: string): RankedPlayer[] {
  const roster = state.players.filter(p => !category || playerCategory(p, state) === category);
  const rosterIds = new Set(roster.map(p => p.id));
  const tournaments = state.tournaments.filter(t => t.results.some(r => rosterIds.has(r.playerId)) && (!discipline || t.discipline === discipline));
  const latest = [...tournaments].sort(byDate).at(-1);
  const players = roster.map(player => {
    const entries = tournaments
      .flatMap(t => t.results.filter(r => r.playerId === player.id).map(r => ({ ...r, tournament: t })))
      .sort((a, b) => byDate(a.tournament, b.tournament));
    const points = (discipline ? 0 : player.initialPoints) + entries.reduce((sum, r) => sum + r.points, 0);
    return {
      ...player, points, category: playerCategory(player, state), played: entries.length,
      wins: entries.filter(r => r.place === 1).length,
      podiums: entries.filter(r => r.place <= 3).length,
      bestPlace: entries.length ? Math.min(...entries.map(r => r.place)) : null, entries,
    };
  }).filter(p => !discipline || p.played);
  const previous = players.map(p => {
    const last = p.entries.find(e => e.tournament.id === latest?.id);
    return { id: p.id, name: p.name, points: p.points - (last?.points ?? 0), wins: p.wins - (last?.place === 1 ? 1 : 0) };
  });
  const sort = (a: { points: number; wins: number; name: string }, b: { points: number; wins: number; name: string }) =>
    b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name, 'es');
  previous.sort(sort);
  const ordered = players.sort(sort);
  const counts = new Map<string, number>();
  return ordered.map((p, i) => {
    const categoryRank = (counts.get(p.category) ?? 0) + 1;
    counts.set(p.category, categoryRank);
    return { ...p, rank: i + 1, categoryRank, previousRank: previous.findIndex(old => old.id === p.id) + 1 };
  });
}

/** Puntaje acumulado del jugador después de cada torneo, empezando por sus puntos iniciales. */
export function pointsHistory(player: RankedPlayer): number[] {
  let points = player.points - player.entries.reduce((sum, e) => sum + e.points, 0);
  return [points, ...player.entries.map(e => (points += e.points))];
}

export function validateState(input: unknown): State {
  const fail = (): never => { throw new Error('Los datos no son válidos. Revisá nombres, fechas, puntos y posiciones.'); };
  if (!input || typeof input !== 'object') return fail();
  const value = input as State;
  const str = (s: unknown) => typeof s === 'string' && s.trim().length > 0 && s.length <= 150;
  const num = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 1000000;
  if (value.version !== 1 || typeof value.demo !== 'boolean' || !Array.isArray(value.players) || !Array.isArray(value.tournaments) || !value.rules) return fail();
  if (value.players.length > 5000 || value.tournaments.length > 5000) return fail();

  const { rules } = value;
  if (!Array.isArray(rules.categories) || rules.categories.length !== 4 || !rules.categories.every(c => c && str(c.name) && num(c.min))) return fail();
  if (new Set(rules.categories.map(c => c.min)).size !== 4 || !rules.categories.some(c => c.min === 0) || new Set(rules.categories.map(c => c.name)).size !== 4) return fail();
  if (!Array.isArray(rules.points) || rules.points.length !== 8 || !rules.points.every(num) || !num(rules.participation)) return fail();

  if (!value.players.every(p => p && str(p.id) && str(p.name) && str(p.city) && typeof p.club === 'string' && p.club.length <= 150 && num(p.initialPoints))) return fail();
  if (!value.players.every(p => p.photo === undefined || validPlayerPhoto(p.photo) || isPhotoRef(p.photo))) throw new Error('La foto del jugador no es válida. Volvé a cargarla desde su ficha.');
  if (value.players.some(p => p.category !== undefined && !rules.categories.some(c => c.name === p.category))) return fail();
  const ids = new Set(value.players.map(p => p.id));
  if (ids.size !== value.players.length || new Set(value.tournaments.map(t => t?.id)).size !== value.tournaments.length) return fail();

  for (const t of value.tournaments) {
    if (!t || !str(t.id) || !str(t.name) || !str(t.venue) || !DISCIPLINES.includes(t.discipline) || !Array.isArray(t.results)) return fail();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !Number.isFinite(Date.parse(t.date)) || new Date(`${t.date}T12:00:00Z`).toISOString().slice(0, 10) !== t.date) return fail();
    if (!t.results.every(r => r && ids.has(r.playerId) && Number.isInteger(r.place) && r.place > 0 && r.place <= 512 && num(r.points))) return fail();
    if (new Set(t.results.map(r => r.playerId)).size !== t.results.length || (!t.fixture && new Set(t.results.map(r => r.place)).size !== t.results.length)) return fail();
    if (t.category !== undefined && !rules.categories.some(c => c.name === t.category)) return fail();
    if (t.raceTo !== undefined && (!Number.isInteger(t.raceTo) || t.raceTo < 1 || t.raceTo > 30)) return fail();
    if (t.registered !== undefined && (!Array.isArray(t.registered) || t.registered.length > MAX_ENTRANTS || new Set(t.registered).size !== t.registered.length || t.registered.some(id => !ids.has(id)))) return fail();
    if ((t.fixture || t.registered?.length) && !t.category) return fail();
    if (t.registered?.some(id => playerCategory(value.players.find(p => p.id === id)!, value) !== t.category)) return fail();
    if (t.category && t.results.some(r => !t.registered?.includes(r.playerId))) return fail();
    if (t.fixture !== undefined && (!t.fixture || typeof t.fixture !== 'object')) return fail();
    validateFixture(t);
  }
  return { ...value, players: value.players.map(p => p.category ? p : { ...p, category: playerCategory(p, value) }) };
}

const same = (a: string, b: string) => a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es');

/** `today` permite al servidor decidir la fecha con la zona horaria del Paraguay. */
export function applyAction(state: State, action: Action, today = localDate()): State {
  state = validateState(state);
  let next: State;
  switch (action.type) {
    case 'player.save': {
      const current = state.players.find(p => p.id === action.player.id);
      const player = { ...action.player, category: action.player.category ?? current?.category ?? [...state.rules.categories].sort((a, b) => a.min - b.min)[0].name };
      if (current && player.category !== current.category && state.tournaments.some(t => t.registered?.includes(player.id) || t.results.some(r => r.playerId === player.id))) throw new Error('El jugador ya tiene participación. El traspaso de categoría se definirá más adelante.');
      if (state.players.some(p => p.id !== player.id && same(p.name, player.name) && same(p.city, player.city))) throw new Error('Ya existe un jugador con ese nombre y ciudad.');
      next = { ...state, players: state.players.some(p => p.id === player.id) ? state.players.map(p => p.id === player.id ? player : p) : [...state.players, player] };
      break;
    }
    case 'player.remove': {
      if (!state.players.some(p => p.id === action.playerId)) throw new Error('El jugador no existe.');
      if (state.tournaments.some(t => t.results.some(r => r.playerId === action.playerId))) throw new Error('Este jugador tiene resultados publicados. Reabrí esos torneos antes de eliminarlo.');
      if (state.tournaments.some(t => t.registered?.includes(action.playerId))) throw new Error('Quitá al jugador de los torneos en los que está inscripto antes de eliminarlo.');
      next = { ...state, players: state.players.filter(p => p.id !== action.playerId) };
      break;
    }
    case 'tournament.save': {
      const current = state.tournaments.find(t => t.id === action.tournament.id);
      if (current?.results.length) throw new Error('Reabrí el torneo antes de editarlo.');
      if (!current && !action.tournament.category) throw new Error('Elegí la categoría del torneo.');
      if (current?.registered?.length && action.tournament.category !== current.category) throw new Error('Quitá los inscriptos antes de cambiar la categoría del torneo.');
      if (current?.fixture && ((action.tournament.raceTo ?? 5) !== (current.raceTo ?? 5) || action.tournament.discipline !== current.discipline || action.tournament.date !== current.date)) throw new Error('No se puede cambiar la fecha, disciplina o partidas para ganar con el fixture armado.');
      const tournament = { ...action.tournament, registered: current?.registered ?? [], fixture: current?.fixture, results: current?.results || [] };
      next = { ...state, tournaments: current ? state.tournaments.map(t => t.id === tournament.id ? tournament : t) : [...state.tournaments, tournament] };
      break;
    }
    case 'tournament.remove': {
      const current = state.tournaments.find(t => t.id === action.tournamentId);
      if (!current) throw new Error('El torneo no existe.');
      if (current.results.length) throw new Error('Reabrí el torneo antes de eliminarlo.');
      if (current.fixture?.matches.some(m => m.scoreA !== undefined)) throw new Error('Quitá los resultados de los partidos antes de eliminar el torneo.');
      next = { ...state, tournaments: state.tournaments.filter(t => t.id !== action.tournamentId) };
      break;
    }
    case 'results.publish': {
      const tournament = state.tournaments.find(t => t.id === action.tournamentId);
      if (!tournament || tournament.results.length) throw new Error('El torneo ya tiene resultados o no existe.');
      if (tournament.category || tournament.fixture) throw new Error('Publicá los resultados desde el fixture del torneo.');
      if (!Array.isArray(action.placements) || !action.placements.length) throw new Error('Agregá al menos un jugador.');
      if (tournament.date > today) throw new Error('Podrás publicar resultados a partir de la fecha del torneo.');
      const results = action.placements.map(r => ({ playerId: r.playerId, place: r.place, points: state.rules.points[r.place - 1] ?? state.rules.participation }));
      if (!results.some(r => r.place === 1)) throw new Error('Indicá quién obtuvo el primer puesto.');
      next = { ...state, tournaments: state.tournaments.map(t => t.id === tournament.id ? { ...t, results } : t) };
      break;
    }
    case 'results.reopen': {
      if (!action.reason || action.reason.trim().length < 5 || action.reason.length > 500) throw new Error('Indicá el motivo de la corrección (entre 5 y 500 caracteres).');
      if (!state.tournaments.some(t => t.id === action.tournamentId && t.results.length)) throw new Error('Este torneo no tiene resultados publicados.');
      next = { ...state, tournaments: state.tournaments.map(t => t.id === action.tournamentId ? { ...t, results: [] } : t) };
      break;
    }
    case 'rules.save': {
      // Conserva las asociaciones cuando se renombra una categoría.
      const renamed = (name: string | undefined) => name === undefined ? undefined : action.rules.categories[state.rules.categories.findIndex(c => c.name === name)]?.name ?? name;
      next = { ...state, rules: action.rules, players: state.players.map(p => ({ ...p, category: renamed(p.category) })), tournaments: state.tournaments.map(t => ({ ...t, category: renamed(t.category) })) };
      break;
    }
    case 'registration.save': case 'fixture.generate': case 'fixture.reset':
    case 'match.score': case 'match.clear': case 'match.schedule': case 'fixture.publish':
      next = applyTournamentAction(state, action, today);
      break;
    default:
      throw new Error('Acción no reconocida.');
  }
  return validateState(next);
}

/** Descripción breve de una acción para el registro de auditoría. */
export function describeAction(state: State, action: Action): string {
  const tournament = (id: string) => state.tournaments.find(t => t.id === id)?.name ?? id;
  switch (action.type) {
    case 'player.save': return `${state.players.some(p => p.id === action.player.id) ? 'Editó' : 'Agregó'} al jugador ${action.player.name}`;
    case 'player.remove': return `Eliminó al jugador ${state.players.find(p => p.id === action.playerId)?.name ?? action.playerId}`;
    case 'tournament.save': return `${state.tournaments.some(t => t.id === action.tournament.id) ? 'Editó' : 'Creó'} el torneo ${action.tournament.name}`;
    case 'tournament.remove': return `Eliminó el torneo ${tournament(action.tournamentId)}`;
    case 'results.publish': return `Publicó ${action.placements?.length ?? 0} resultados de ${tournament(action.tournamentId)}`;
    case 'results.reopen': return `Reabrió ${tournament(action.tournamentId)}`;
    case 'rules.save': return 'Cambió las reglas de categorías y puntuación';
    case 'registration.save': return `Actualizó los inscriptos de ${tournament(action.tournamentId)}`;
    case 'fixture.generate': return `Generó el fixture de ${tournament(action.tournamentId)}`;
    case 'fixture.reset': return `Quitó el fixture de ${tournament(action.tournamentId)}`;
    case 'match.score': return `Registró el partido ${action.matchId} de ${tournament(action.tournamentId)}`;
    case 'match.clear': return `Quitó el resultado del partido ${action.matchId} de ${tournament(action.tournamentId)}`;
    case 'match.schedule': return `Programó el partido ${action.matchId} de ${tournament(action.tournamentId)}`;
    case 'fixture.publish': return `Publicó los resultados del fixture de ${tournament(action.tournamentId)}`;
  }
}

export function createState(demo = true): State {
  const state: State = { version: 1, demo, rules: structuredClone(DEFAULT_RULES), players: [], tournaments: [] };
  if (!demo) return state;
  const data: [string, string, string, number][] = [
    ['Diego Benítez', 'Asunción', 'Club Central', 2150], ['Matías Villalba', 'Ciudad del Este', 'Club Alto Paraná', 2010],
    ['Rodrigo González', 'Encarnación', 'Pool del Sur', 1900], ['Fernando López', 'Asunción', 'Club Central', 1780],
    ['Alejandro Vera', 'San Lorenzo', 'La Tronera', 1350], ['Carlos Acosta', 'Luque', 'Club Luque', 1220],
    ['Santiago Rojas', 'Asunción', 'Club Central', 1090], ['Miguel Duarte', 'Fernando de la Mora', 'La Tronera', 920],
    ['Lucía Ramírez', 'Encarnación', 'Pool del Sur', 510], ['José Martínez', 'Luque', 'Club Luque', 480],
    ['Camila Fernández', 'Asunción', 'Club Central', 220], ['Pablo Giménez', 'San Lorenzo', 'La Tronera', 90],
  ];
  state.players = data.map(([name, city, club, initialPoints], i) => ({ id: `p${i + 1}`, name, city, club, initialPoints }));
  const results = (order: number[]) => order.map((n, i) => ({ playerId: `p${n}`, place: i + 1, points: DEFAULT_RULES.points[i] ?? DEFAULT_RULES.participation }));
  state.tournaments = [
    { id: 't1', name: 'Abierto de Asunción', date: localDate(7), venue: 'Club Central · Asunción', discipline: 'Bola 9', results: [] },
    { id: 't2', name: 'Copa Alto Paraná', date: localDate(14), venue: 'Club Alto Paraná · Ciudad del Este', discipline: 'Bola 8', results: [] },
    { id: 't3', name: 'Encuentro del Sur', date: localDate(-7), venue: 'Pool del Sur · Encarnación', discipline: 'Bola 10', results: results([2, 4, 1, 9, 3, 6, 10, 12]) },
    { id: 't4', name: 'Clásico de Luque', date: localDate(-28), venue: 'Club Luque · Luque', discipline: 'Bola 8', results: results([1, 3, 6, 2, 7, 10, 5, 8]) },
    { id: 't5', name: 'Apertura La Tronera', date: localDate(-56), venue: 'La Tronera · San Lorenzo', discipline: 'Bola 9', results: results([3, 1, 5, 8, 2, 4, 12, 7]) },
  ];
  return validateState(state);
}
