export const DEFAULT_RULES = {
  categories: [{ name: 'Primera', min: 2000 }, { name: 'Segunda', min: 1000 }, { name: 'Tercera', min: 400 }, { name: 'Principiante', min: 0 }],
  points: [300, 200, 150, 100, 60, 60, 60, 60],
  participation: 30,
};

export function categoryFor(points, rules) {
  return [...rules.categories].sort((a, b) => b.min - a.min).find(c => points >= c.min)?.name || 'Principiante';
}

export function standings(state) {
  return state.players.map(player => {
    const entries = state.tournaments.flatMap(t => (t.results || []).filter(r => r.playerId === player.id).map(r => ({ ...r, tournament: t })));
    const points = player.initialPoints + entries.reduce((sum, r) => sum + r.points, 0);
    return { ...player, points, category: categoryFor(points, state.rules), played: entries.length, wins: entries.filter(r => r.place === 1).length, entries };
  }).sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name, 'es')).map((p, i) => ({ ...p, rank: i + 1 }));
}

export function publishResults(state, tournamentId, placements) {
  const tournament = state.tournaments.find(t => t.id === tournamentId);
  if (!tournament || tournament.results?.length) throw new Error('Este torneo ya tiene resultados o no existe.');
  if (!placements.length) throw new Error('Agregá al menos un jugador.');
  const ids = new Set();
  const places = new Set();
  for (const r of placements) {
    if (!state.players.some(p => p.id === r.playerId)) throw new Error('Seleccioná un jugador registrado.');
    if (ids.has(r.playerId)) throw new Error('Un jugador no puede aparecer dos veces.');
    if (!Number.isInteger(r.place) || r.place < 1 || r.place > 512 || places.has(r.place)) throw new Error('Usá posiciones distintas entre 1 y 512.');
    ids.add(r.playerId); places.add(r.place);
  }
  return { ...state, tournaments: state.tournaments.map(t => t.id !== tournamentId ? t : { ...t, results: placements.map(r => ({ ...r, points: state.rules.points[r.place - 1] ?? state.rules.participation })) }) };
}

export function validateState(value) {
  const fail = () => { throw new Error('El archivo no es un respaldo válido de Pool Paraguay.'); };
  const str = s => typeof s === 'string' && s.length > 0 && s.length <= 200;
  const num = n => Number.isSafeInteger(n) && n >= 0 && n <= 10000000;
  if (!value || value.version !== 1 || typeof value.demo !== 'boolean' || !Array.isArray(value.players) || !Array.isArray(value.tournaments) || !value.rules) fail();
  const { rules } = value;
  if (!Array.isArray(rules.categories) || rules.categories.length !== 4 || !rules.categories.every(c => str(c.name) && num(c.min)) || new Set(rules.categories.map(c => c.min)).size !== 4 || !rules.categories.some(c => c.min === 0)) fail();
  if (new Set(rules.categories.map(c => c.name)).size !== 4 || !Array.isArray(rules.points) || rules.points.length !== 8 || !rules.points.every(num) || !num(rules.participation)) fail();
  if (!value.players.every(p => str(p.id) && str(p.name) && str(p.city) && typeof p.club === 'string' && p.club.length <= 200 && num(p.initialPoints))) fail();
  const ids = new Set(value.players.map(p => p.id));
  if (ids.size !== value.players.length || new Set(value.tournaments.map(t => t.id)).size !== value.tournaments.length) fail();
  for (const t of value.tournaments) {
    if (!str(t.id) || !str(t.name) || !str(t.venue) || !['Bola 8', 'Bola 9', 'Bola 10'].includes(t.discipline) || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !Number.isFinite(Date.parse(t.date)) || !Array.isArray(t.results)) fail();
    if (!t.results.every(r => ids.has(r.playerId) && Number.isInteger(r.place) && r.place > 0 && r.place <= 512 && num(r.points)) || new Set(t.results.map(r => r.playerId)).size !== t.results.length || new Set(t.results.map(r => r.place)).size !== t.results.length) fail();
  }
  return value;
}

export function createState(demo = true) {
  const state = { version: 1, demo, rules: structuredClone(DEFAULT_RULES), players: [], tournaments: [] };
  if (!demo) return state;
  const data = [
    ['Diego Benítez', 'Asunción', 'Club Central', 2450], ['Matías Villalba', 'Ciudad del Este', 'Club Alto Paraná', 2180],
    ['Rodrigo González', 'Encarnación', 'Pool del Sur', 1960], ['Fernando López', 'Asunción', 'Club Central', 1780],
    ['Alejandro Vera', 'San Lorenzo', 'La Tronera', 1550], ['Carlos Acosta', 'Luque', 'Club Luque', 1320],
    ['Santiago Rojas', 'Asunción', 'Club Central', 1150], ['Miguel Duarte', 'Fernando de la Mora', 'La Tronera', 980],
    ['Lucía Ramírez', 'Encarnación', 'Pool del Sur', 720], ['José Martínez', 'Luque', 'Club Luque', 540],
    ['Camila Fernández', 'Asunción', 'Club Central', 280], ['Pablo Giménez', 'San Lorenzo', 'La Tronera', 120],
  ];
  state.players = data.map(([name, city, club, initialPoints], i) => ({ id: `p${i + 1}`, name, city, club, initialPoints }));
  const date = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  state.tournaments = [
    { id: 't1', name: 'Abierto de Asunción', date: date(7), venue: 'Club Central · Asunción', discipline: 'Bola 9', results: [] },
    { id: 't2', name: 'Copa Alto Paraná', date: date(14), venue: 'Club Alto Paraná · Ciudad del Este', discipline: 'Bola 8', results: [] },
    { id: 't3', name: 'Encuentro del Sur', date: date(-7), venue: 'Pool del Sur · Encarnación', discipline: 'Bola 10', results: [
      { playerId: 'p1', place: 1, points: 300 }, { playerId: 'p3', place: 2, points: 200 }, { playerId: 'p2', place: 3, points: 150 }, { playerId: 'p5', place: 4, points: 100 },
    ] },
  ];
  return state;
}
