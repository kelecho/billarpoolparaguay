import { useState } from 'react';
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import type { Action, State, Tournament } from '../domain';
import { fixtureOutcome, leagueStandings, resolveFixture } from '../fixture';
import { MatchCard } from './FixtureBoard';
import Field from './Field';

export default function LeagueBoard({ tournament, state, canEdit, busy, submit }: { tournament: Tournament; state: State; canEdit: boolean; busy: boolean; submit: (action: Action) => Promise<boolean> }) {
  const matches = resolveFixture(tournament);
  const rows = leagueStandings(matches);
  const complete = fixtureOutcome(matches).complete;
  const rounds = (matches.at(-1)?.round ?? 0) + 1;
  const [selected, setSelected] = useState(() => matches.find(m => !m.complete)?.round ?? 0);
  const round = Math.min(selected, rounds - 1);
  const shown = matches.filter(m => m.round === round);
  const name = (id: string) => state.players.find(p => p.id === id)?.name ?? 'Jugador';
  const leaders = rows.filter(p => p.place === 1);
  const started = rows.some(p => p.played);
  return <section className="league-board form-stack" aria-label="Liga todos contra todos">
    {complete && <div className="fixture-champion"><Trophy size={26} /><span><small>{leaders.length === 1 ? 'Ganador de la liga' : 'Primer puesto compartido'}</small><strong>{leaders.map(p => name(p.playerId)).join(' · ')}</strong></span></div>}
    <div className="league-heading"><h3>Tabla de posiciones</h3><span>{complete ? 'Todos los partidos disputados' : 'Clasificación provisional'}</span></div>
    <p className="muted small">Victoria: 3 puntos · Derrota: 0. Desempate: diferencia de partidas y partidas ganadas. Si la igualdad continúa, comparten puesto y puntos del ranking. Los descansos no suman.</p>
    <div className="table-wrap league-table" role="region" aria-label="Tabla de la liga, desplazable" tabIndex={0}>
      <table aria-label="Clasificación de la liga">
        <thead><tr><th scope="col">Pos.</th><th scope="col">Jugador</th>{[['PJ', 'Partidos jugados'], ['PG', 'Partidos ganados'], ['PP', 'Partidos perdidos'], ['PF', 'Partidas a favor'], ['PC', 'Partidas en contra'], ['DIF', 'Diferencia de partidas'], ['PTS', 'Puntos de liga']].map(([label, title]) => <th scope="col" key={label}><abbr title={title}>{label}</abbr></th>)}</tr></thead>
        <tbody>{rows.map(p => <tr key={p.playerId} className={started && p.place === 1 ? 'leader-row' : undefined}><td>{started ? p.place : '—'}</td><th scope="row">{name(p.playerId)}</th><td>{p.played}</td><td>{p.wins}</td><td>{p.losses}</td><td>{p.racksFor}</td><td>{p.racksAgainst}</td><td>{p.difference > 0 ? '+' : ''}{p.difference}</td><td><strong>{p.points}</strong></td></tr>)}</tbody>
      </table>
    </div>
    <p className="muted small">Estos puntos ordenan la liga. Los puntos del ranking general se asignan según el puesto final al publicar el torneo.</p>
    <div className="league-round-controls">
      <button className="icon-button" aria-label="Jornada anterior" disabled={round === 0} onClick={() => setSelected(round - 1)}><ChevronLeft /></button>
      <Field label="Jornada"><select value={round} onChange={e => setSelected(Number(e.target.value))}>{Array.from({ length: rounds }, (_, i) => <option key={i} value={i}>Jornada {i + 1} de {rounds}{tournament.leagueRounds === 2 ? i < rounds / 2 ? ' · Ida' : ' · Vuelta' : ''}</option>)}</select></Field>
      <button className="icon-button" aria-label="Jornada siguiente" disabled={round === rounds - 1} onClick={() => setSelected(round + 1)}><ChevronRight /></button>
    </div>
    <div className="league-matches" role="region" aria-label={`Partidos de la jornada ${round + 1}`}>
      {shown.filter(m => !m.bye).map(m => <MatchCard key={`${m.id}-${m.playerA}-${m.playerB}`} match={m} tournament={tournament} state={state} editable={canEdit && !tournament.results.length} busy={busy} final={false} submit={submit} />)}
    </div>
    {shown.filter(m => m.bye).map(m => <p className="league-rest" key={m.id}>Descansa: <strong>{name((m.playerA ?? m.playerB)!)}</strong></p>)}
  </section>;
}
