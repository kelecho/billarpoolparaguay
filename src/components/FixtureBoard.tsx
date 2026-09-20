import { useId, useState, type FormEvent } from 'react';
import { Check, Clock, Trophy } from 'lucide-react';
import { localDate, type Action, type State, type Tournament } from '../domain';
import { fixtureSections, resolveFixture, type Feed, type ResolvedMatch } from '../fixture';
import Avatar from './Avatar';
import Field from './Field';
import ConfirmButton from './ConfirmButton';

type Submit = (action: Action) => Promise<boolean>;

function MatchCard({ match: m, tournament: t, state, editable, busy, final, submit }: { match: ResolvedMatch; tournament: Tournament; state: State; editable: boolean; busy: boolean; final: boolean; submit: Submit }) {
  const [editing, setEditing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  // Quien todavía no está definido se nombra por el partido del que sale: así se sigue el rumbo aunque venga de otra llave.
  const name = (id: string | null, feed?: Feed) => id ? state.players.find(p => p.id === id)?.name ?? 'Jugador' : feed ? `${feed.as === 'winner' ? 'Ganador' : 'Perdedor'} de ${feed.from}` : m.bye ? 'Pase libre' : 'Por definir';
  const save = async (e: FormEvent<HTMLFormElement>, schedule = false) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const action: Action = schedule
      ? { type: 'match.schedule', tournamentId: t.id, matchId: m.id, table: String(data.get('table')), time: String(data.get('time')) }
      : { type: 'match.score', tournamentId: t.id, matchId: m.id, scoreA: Number(data.get('scoreA')), scoreB: Number(data.get('scoreB')) };
    if (await submit(action)) { setEditing(false); setScheduling(false); }
  };
  const target = t.raceTo ?? 5;
  const playable = m.ready && !m.complete;
  // El contador de bolitas del salón: una por partida ganada. Con carreras largas alcanza con el número.
  const beads = (score?: number) => target <= 10 && (m.complete || playable) && !m.bye
    ? <span className="match-beads" aria-hidden="true">{Array.from({ length: target }, (_, i) => <i key={i} className={i < (score ?? 0) ? 'on' : undefined} />)}</span>
    : null;
  return (
    <article className={`fixture-match${m.complete ? ' match-complete' : ''}${m.bye ? ' match-bye' : ''}${playable ? ' match-playable' : ''}${final ? ' match-final' : ''}`} aria-label={`Partido ${m.id}`}>
      <div className="match-heading"><span>Partido {m.id}</span>{m.bye ? <span>Pase libre</span> : m.complete ? <span className="match-status match-status-done"><Check size={13} aria-label="Finalizado" /></span> : <span className={`match-status${playable ? ' match-status-live' : ''}`}>{m.ready ? 'Por jugar' : 'En espera'}</span>}</div>
      {[{ id: m.playerA, score: m.scoreA, feed: m.feedA }, { id: m.playerB, score: m.scoreB, feed: m.feedB }].map((p, i) => {
        const player = state.players.find(x => x.id === p.id);
        const won = Boolean(p.id) && p.id === m.winner;
        return (
          <div className={`match-player${won ? ' match-winner' : ''}${m.complete && !won ? ' match-loser' : ''}`} key={i}>
            {player ? <Avatar name={player.name} tone={i + 1} photo={player.photo} /> : <span className="avatar match-empty" aria-hidden="true" />}
            <span className={`match-name${p.id ? '' : ' match-pending'}`}>{name(p.id, p.feed)}{beads(p.score)}</span>
            <b className="match-score">{p.score ?? (won ? '✓' : '—')}</b>
          </div>
        );
      })}
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
  const sections = fixtureSections(matches);
  const tabs = useId();
  // Se abre en la llave que tiene partidos por jugar; con el torneo definido, en la final.
  const [open, setOpen] = useState(() => (final?.complete ? sections.at(-1) : sections.find(s => s.rounds.some(r => r.matches.some(m => m.ready && !m.complete))) ?? sections[0])?.bracket);
  const shown = sections.find(s => s.bracket === open) ?? sections[0];
  const count = (list: ResolvedMatch[]) => `${list.filter(m => m.complete && !m.bye).length}/${list.filter(m => !m.bye).length}`;
  return <>
    {final?.complete && final.winner && <div className="fixture-champion"><Trophy size={26} /><span><small>Ganador del torneo</small><strong>{state.players.find(p => p.id === final.winner)?.name}</strong></span></div>}
    {sections.length > 1 && <div className="fixture-tabs" role="tablist" aria-label="Llaves del torneo">
      {sections.map(section => {
        const all = section.rounds.flatMap(r => r.matches);
        const waiting = all.filter(m => m.ready && !m.complete).length;
        return (
          <button key={section.bracket} type="button" role="tab" id={`${tabs}-${section.bracket}`} aria-selected={section === shown} aria-controls={`${tabs}-panel`} className={`fixture-tab fixture-tab-${section.bracket}`} onClick={() => setOpen(section.bracket)}>
            <strong>{section.title?.startsWith('Llave de ') ? <><span className="fixture-tab-long">Llave de </span>{section.title.slice(9)}</> : section.title}</strong>
            <span>{count(all)}<span className="fixture-tab-unit"> partidos</span>{waiting > 0 && <em><i> · </i>{waiting} por jugar</em>}</span>
          </button>
        );
      })}
    </div>}
    {shown && <div id={`${tabs}-panel`} role={sections.length > 1 ? 'tabpanel' : undefined} aria-labelledby={sections.length > 1 ? `${tabs}-${shown.bracket}` : undefined}>
      <div className={`fixture-board fixture-board-${shown.bracket ?? 'S'}`} role="region" aria-label={shown.title ?? 'Fixture del torneo'} tabIndex={0}>
        {shown.rounds.map((round, i) => {
          // Dos partidos se juntan en uno de la ronda siguiente, o uno sigue derecho: cada caso lleva su conector.
          const next = shown.rounds[i + 1]?.matches.length;
          const link = next === round.matches.length ? ' round-straight' : next !== undefined && next * 2 === round.matches.length ? ' round-merge' : '';
          const previous = shown.rounds[i - 1]?.matches.length;
          const fed = previous !== undefined && (previous === round.matches.length || previous === round.matches.length * 2) ? ' round-fed' : '';
          return <section className={`fixture-round${link}${fed}`} key={i}><h4>{round.label}<span>{count(round.matches)}</span></h4><div className="fixture-round-matches">{round.matches.map(m => <div className={`fixture-cell${m.complete ? ' cell-done' : ''}`} key={`${m.id}-${m.playerA}-${m.playerB}`}><MatchCard match={m} tournament={tournament} state={state} editable={canEdit && !tournament.results.length} busy={busy} final={m.id === final?.id} submit={submit} /></div>)}</div></section>;
        })}
      </div>
    </div>}
  </>;
}
