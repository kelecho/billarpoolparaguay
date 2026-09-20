import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Search, X } from 'lucide-react';
import type { Action, State, Tournament } from '../domain';
import { entrantLimit } from '../fixture';
import Avatar from './Avatar';

type Props = { tournament: Tournament; state: State; busy: boolean; onCreatePlayer: () => void; submit: (action: Action) => Promise<boolean> };

export default function TournamentRegistration({ tournament: t, state, busy, submit, onCreatePlayer }: Props) {
  const [query, setQuery] = useState('');
  const registered = t.registered ?? [];
  const limit = entrantLimit(t.format);
  const eligible = state.players.filter(p => p.category === t.category && !registered.includes(p.id) && `${p.name} ${p.city} ${p.club}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const save = (playerIds: string[]) => void submit({ type: 'registration.save', tournamentId: t.id, playerIds });
  const move = (index: number, delta: number) => {
    const order = [...registered];
    [order[index], order[index + delta]] = [order[index + delta], order[index]];
    save(order);
  };
  return (
    <section className="registration-panel">
      <div><h3>Inscripciones · {registered.length}/{limit}</h3><p className="muted small">Solo jugadores de {t.category}. Podés elegir jugadores existentes o crear su ficha y luego inscribirlos.</p></div>
      <div className="registration-columns">
        <div>
          <div className="fixture-title"><h4>Jugadores disponibles</h4><button className="text-button" disabled={busy} onClick={onCreatePlayer}><Plus size={15} />Crear jugador</button></div>
          <label className="search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar jugador…" aria-label="Buscar jugador para inscribir" /></label>
          <ul className="registration-list">
            {eligible.map(p => <li key={p.id}><Avatar name={p.name} photo={p.photo} /><span><strong>{p.name}</strong><small>{p.city}</small></span><button className="icon-button" disabled={busy || registered.length >= limit} aria-label={`Inscribir a ${p.name}`} onClick={() => save([...registered, p.id])}><Plus size={17} /></button></li>)}
          </ul>
          {!eligible.length && <p className="muted small">No hay más jugadores disponibles con este filtro.</p>}
        </div>
        <div>
          <h4>Inscriptos</h4>
          <p className="muted small">El orden solo se usa si elegís el armado manual.</p>
          <ol className="registration-list">
            {registered.map((id, index) => {
              const player = state.players.find(p => p.id === id)!;
              return <li key={id}><b className="seed-number">{index + 1}</b><span><strong>{player.name}</strong><small>{player.city}</small></span><div className="registration-controls">
                <button className="icon-button" disabled={busy || index === 0} aria-label={`Subir a ${player.name}`} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
                <button className="icon-button" disabled={busy || index === registered.length - 1} aria-label={`Bajar a ${player.name}`} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
                <button className="icon-button" disabled={busy} aria-label={`Quitar inscripción de ${player.name}`} onClick={() => save(registered.filter(p => p !== id))}><X size={15} /></button>
              </div></li>;
            })}
          </ol>
          {!registered.length && <p className="muted small">Inscribí al menos dos jugadores para realizar el sorteo.</p>}
        </div>
      </div>
    </section>
  );
}
