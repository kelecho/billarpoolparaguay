import { useState, type FormEvent } from 'react';
import { Check, Clock, Trophy } from 'lucide-react';
import { localDate, type Action, type State, type Tournament } from '../domain';
import { fixtureSections, resolveFixture, type ResolvedMatch } from '../fixture';
import Field from './Field';
import ConfirmButton from './ConfirmButton';

type Submit = (action: Action) => Promise<boolean>;

function MatchCard({ match: m, tournament: t, state, editable, busy, submit }: { match: ResolvedMatch; tournament: Tournament; state: State; editable: boolean; busy: boolean; submit: Submit }) {
  const [editing, setEditing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const name = (id: string | null) => id ? state.players.find(p => p.id === id)?.name ?? 'Jugador' : m.ready ? 'Pase libre' : 'Por definir';
  const save = async (e: FormEvent<HTMLFormElement>, schedule = false) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const action: Action = schedule
      ? { type: 'match.schedule', tournamentId: t.id, matchId: m.id, table: String(data.get('table')), time: String(data.get('time')) }
      : { type: 'match.score', tournamentId: t.id, matchId: m.id, scoreA: Number(data.get('scoreA')), scoreB: Number(data.get('scoreB')) };
    if (await submit(action)) { setEditing(false); setScheduling(false); }
  };
  return (
    <article className={`fixture-match ${m.complete ? 'match-complete' : ''}`} aria-label={`Partido ${m.id}`}>
      <div className="match-heading"><span>Partido {m.id}</span>{m.bye ? <span>Pase libre</span> : m.complete ? <Check size={14} aria-label="Finalizado" /> : <span>{m.ready ? 'Por jugar' : 'En espera'}</span>}</div>
      {[{ id: m.playerA, score: m.scoreA }, { id: m.playerB, score: m.scoreB }].map((p, i) => (
        <div className={`match-player ${p.id && p.id === m.winner ? 'match-winner' : ''}`} key={i}><span>{name(p.id)}</span><b>{p.score ?? (p.id && p.id === m.winner ? '✓' : '—')}</b></div>
      ))}
      {(m.table || m.time) && <p className="match-schedule"><Clock size={12} />{[m.table && `Mesa ${m.table}`, m.time && `${m.time} h`].filter(Boolean).join(' · ')}</p>}
      {editable && !m.bye && <div className="match-actions">
        {m.ready && <button className="text-button" disabled={busy || t.date > localDate()} onClick={() => setEditing(!editing)}>{m.complete ? 'Editar resultado' : 'Cargar resultado'}</button>}
        <button className="text-button" disabled={busy} onClick={() => setScheduling(!scheduling)}>Mesa y horario</button>
      </div>}
      {editable && editing && <form className="match-form" onSubmit={e => void save(e)}>
        <p className="small">Primero en llegar a {t.raceTo ?? 5} partidas.</p>
        <div className="form-grid"><Field label={name(m.playerA)}><input aria-label={`Partidas de ${name(m.playerA)}`} name="scoreA" type="number" min="0" max={t.raceTo ?? 5} required defaultValue={m.scoreA ?? 0} /></Field><Field label={name(m.playerB)}><input aria-label={`Partidas de ${name(m.playerB)}`} name="scoreB" type="number" min="0" max={t.raceTo ?? 5} required defaultValue={m.scoreB ?? 0} /></Field></div>
        <button className="button primary" disabled={busy}>Guardar resultado</button>
        {m.complete && <ConfirmButton confirmLabel="Confirmar: quitar resultado" disabled={busy} onConfirm={() => { void submit({ type: 'match.clear', tournamentId: t.id, matchId: m.id }).then(ok => { if (ok) setEditing(false); }); }}>Quitar resultado</ConfirmButton>}
      </form>}
      {editable && scheduling && <form className="match-form" onSubmit={e => void save(e, true)}>
        <Field label="Mesa"><input name="table" maxLength={50} defaultValue={m.table} placeholder="Ej.: 1" /></Field>
        <Field label="Hora del partido"><input type="time" name="time" defaultValue={m.time} /></Field>
        <button className="button" disabled={busy}>Guardar programación</button>
      </form>}
    </article>
  );
}

export default function FixtureBoard({ tournament, state, canEdit, busy, submit }: { tournament: Tournament; state: State; canEdit: boolean; busy: boolean; submit: Submit }) {
  const matches = resolveFixture(tournament);
  const final = matches.at(-1);
  return <>
    {final?.complete && final.winner && <div className="fixture-champion"><Trophy size={24} /><span><small>Ganador del torneo</small><strong>{state.players.find(p => p.id === final.winner)?.name}</strong></span></div>}
    {fixtureSections(matches).map(section => <section className="fixture-section" key={section.title ?? 'cuadro'}>
      {section.title && <h4 className="fixture-section-title">{section.title}</h4>}
      <div className="fixture-board" role="region" aria-label={section.title ?? 'Fixture del torneo'} tabIndex={0}>
        {section.rounds.map((round, i) => <section className="fixture-round" key={i}><h4>{round.label}</h4><div className="fixture-round-matches">{round.matches.map(m => <MatchCard key={`${m.id}-${m.playerA}-${m.playerB}`} match={m} tournament={tournament} state={state} editable={canEdit && !tournament.results.length} busy={busy} submit={submit} />)}</div></section>)}
      </div>
    </section>)}
  </>;
}
