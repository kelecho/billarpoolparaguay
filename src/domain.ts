export type Player = { id: string; name: string; city: string; club: string; initialPoints: number };
export type Result = { playerId: string; place: number; points: number };
export type Tournament = { id: string; name: string; date: string; venue: string; discipline: 'Bola 8' | 'Bola 9' | 'Bola 10'; results: Result[] };
export type Rules = { categories: { name: string; min: number }[]; points: number[]; participation: number };
export type State = { version: 1; demo: boolean; players: Player[]; tournaments: Tournament[]; rules: Rules };
export type RankedPlayer = Player & { points: number; category: string; rank: number; previousRank: number; played: number; wins: number; entries: (Result & { tournament: Tournament })[] };
export type Action =
  | { type: 'player.save'; player: Player }
  | { type: 'tournament.save'; tournament: Tournament }
  | { type: 'results.publish'; tournamentId: string; placements: Pick<Result, 'playerId' | 'place'>[] }
  | { type: 'results.reopen'; tournamentId: string; reason: string }
  | { type: 'rules.save'; rules: Rules };

export const DEFAULT_RULES: Rules = {
  categories: [{ name: 'Primera', min: 2000 }, { name: 'Segunda', min: 1000 }, { name: 'Tercera', min: 400 }, { name: 'Principiante', min: 0 }],
  points: [300, 200, 150, 100, 60, 60, 60, 60], participation: 30,
};
export const number = (n: number) => n.toLocaleString('es-PY');
export const categoryFor = (points: number, rules: Rules) => [...rules.categories].sort((a, b) => b.min - a.min).find(c => points >= c.min)?.name || rules.categories.at(-1)!.name;
export const dateLabel = (date: string, short = false) => new Intl.DateTimeFormat('es-PY', { day: 'numeric', month: short ? 'short' : 'long', ...(short ? {} : { year: 'numeric' }) }).format(new Date(`${date}T12:00:00`));
export function localDate(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function standings(state: State): RankedPlayer[] {
  const latest = [...state.tournaments].filter(t => t.results.length).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
  const players = state.players.map(player => {
    const entries = state.tournaments.flatMap(t => t.results.filter(r => r.playerId === player.id).map(r => ({ ...r, tournament: t }))).sort((a, b) => a.tournament.date.localeCompare(b.tournament.date) || a.tournament.id.localeCompare(b.tournament.id));
    const points = player.initialPoints + entries.reduce((sum, r) => sum + r.points, 0);
    return { ...player, points, category: categoryFor(points, state.rules), played: entries.length, wins: entries.filter(r => r.place === 1).length, entries };
  });
  const previous = players.map(p => ({ ...p, points: p.points - (p.entries.find(e => e.tournament.id === latest?.id)?.points || 0), wins: p.wins - (p.entries.some(e => e.tournament.id === latest?.id && e.place === 1) ? 1 : 0) }));
  const sort = (a: { points: number; wins: number; name: string }, b: { points: number; wins: number; name: string }) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name, 'es');
  previous.sort(sort);
  return players.sort(sort).map((p, i) => ({ ...p, rank: i + 1, previousRank: previous.findIndex(old => old.id === p.id) + 1 }));
}

export function validateState(input: unknown): State {
  const fail = (): never => { throw new Error('Los datos no son válidos. Revisá nombres, fechas, puntos y posiciones.'); };
  if (!input || typeof input !== 'object') return fail();
  const value = input as State;
  const str = (s: unknown) => typeof s === 'string' && s.trim().length > 0 && s.length <= 150;
  const num = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 1000000;
  if (value.version !== 1 || typeof value.demo !== 'boolean' || !Array.isArray(value.players) || !Array.isArray(value.tournaments) || !value.rules || value.players.length > 5000 || value.tournaments.length > 5000) return fail();
  const { rules } = value;
  if (!Array.isArray(rules.categories) || rules.categories.length !== 4 || !rules.categories.every(c => c && str(c.name) && num(c.min)) || new Set(rules.categories.map(c => c.min)).size !== 4 || !rules.categories.some(c => c.min === 0)) return fail();
  if (new Set(rules.categories.map(c => c.name)).size !== 4 || !Array.isArray(rules.points) || rules.points.length !== 8 || !rules.points.every(num) || !num(rules.participation)) return fail();
  if (!value.players.every(p => p && str(p.id) && str(p.name) && str(p.city) && typeof p.club === 'string' && p.club.length <= 150 && num(p.initialPoints))) return fail();
  const ids = new Set(value.players.map(p => p.id));
  if (ids.size !== value.players.length || new Set(value.tournaments.map(t => t?.id)).size !== value.tournaments.length) return fail();
  for (const t of value.tournaments) {
    if (!t || !str(t.id) || !str(t.name) || !str(t.venue) || !['Bola 8', 'Bola 9', 'Bola 10'].includes(t.discipline) || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !Number.isFinite(Date.parse(t.date)) || new Date(`${t.date}T12:00:00Z`).toISOString().slice(0, 10) !== t.date || !Array.isArray(t.results)) return fail();
    if (!t.results.every(r => r && ids.has(r.playerId) && Number.isInteger(r.place) && r.place > 0 && r.place <= 512 && num(r.points)) || new Set(t.results.map(r => r.playerId)).size !== t.results.length || new Set(t.results.map(r => r.place)).size !== t.results.length) return fail();
  }
  return value;
}

export function applyAction(state: State, action: Action): State {
  let next: State;
  switch (action.type) {
    case 'player.save': {
      const player = action.player;
      if (state.players.some(p => p.id !== player.id && p.name.trim().toLocaleLowerCase('es') === player.name.trim().toLocaleLowerCase('es') && p.city.trim().toLocaleLowerCase('es') === player.city.trim().toLocaleLowerCase('es'))) throw new Error('Ya existe un jugador con ese nombre y ciudad.');
      next = { ...state, players: state.players.some(p => p.id === player.id) ? state.players.map(p => p.id === player.id ? player : p) : [...state.players, player] };
      break;
    }
    case 'tournament.save': {
      const current = state.tournaments.find(t => t.id === action.tournament.id);
      if (current?.results.length) throw new Error('Reabrí el torneo antes de editarlo.');
      const tournament = { ...action.tournament, results: current?.results || [] };
      next = { ...state, tournaments: current ? state.tournaments.map(t => t.id === tournament.id ? tournament : t) : [...state.tournaments, tournament] };
      break;
    }
    case 'results.publish': {
      const tournament = state.tournaments.find(t => t.id === action.tournamentId);
      if (!tournament || tournament.results.length) throw new Error('El torneo ya tiene resultados o no existe.');
      if (!Array.isArray(action.placements) || !action.placements.length) throw new Error('Agregá al menos un jugador.');
      if (tournament.date > localDate()) throw new Error('Podrás publicar resultados a partir de la fecha del torneo.');
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
    case 'rules.save': next = { ...state, rules: action.rules }; break;
    default: throw new Error('Acción no reconocida.');
  }
  return validateState(next);
}

export function createState(demo = true): State {
  const state: State = { version: 1, demo, rules: structuredClone(DEFAULT_RULES), players: [], tournaments: [] };
  if (!demo) return state;
  const data: [string, string, string, number][] = [
    ['Diego Benítez', 'Asunción', 'Club Central', 2450], ['Matías Villalba', 'Ciudad del Este', 'Club Alto Paraná', 2180],
    ['Rodrigo González', 'Encarnación', 'Pool del Sur', 2060], ['Fernando López', 'Asunción', 'Club Central', 1880],
    ['Alejandro Vera', 'San Lorenzo', 'La Tronera', 1550], ['Carlos Acosta', 'Luque', 'Club Luque', 1320],
    ['Santiago Rojas', 'Asunción', 'Club Central', 1150], ['Miguel Duarte', 'Fernando de la Mora', 'La Tronera', 980],
    ['Lucía Ramírez', 'Encarnación', 'Pool del Sur', 720], ['José Martínez', 'Luque', 'Club Luque', 540],
    ['Camila Fernández', 'Asunción', 'Club Central', 280], ['Pablo Giménez', 'San Lorenzo', 'La Tronera', 120],
  ];
  state.players = data.map(([name, city, club, initialPoints], i) => ({ id: `p${i + 1}`, name, city, club, initialPoints }));
  state.tournaments = [
    { id: 't1', name: 'Abierto de Asunción', date: localDate(7), venue: 'Club Central · Asunción', discipline: 'Bola 9', results: [] },
    { id: 't2', name: 'Copa Alto Paraná', date: localDate(14), venue: 'Club Alto Paraná · Ciudad del Este', discipline: 'Bola 8', results: [] },
    { id: 't3', name: 'Encuentro del Sur', date: localDate(-7), venue: 'Pool del Sur · Encarnación', discipline: 'Bola 10', results: [
      { playerId: 'p1', place: 1, points: 300 }, { playerId: 'p3', place: 2, points: 200 }, { playerId: 'p2', place: 3, points: 150 }, { playerId: 'p5', place: 4, points: 100 },
    ] },
  ];
  return state;
}
