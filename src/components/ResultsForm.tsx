import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { Action, State, Tournament } from '../domain';
import Field from './Field';

const MAX_PLACES = 512;

export default function ResultsForm({ tournament, state, submit }: { tournament: Tournament; state: State; submit: (action: Action) => void }) {
  const [rows, setRows] = useState([{ playerId: '', place: 1 }]);
  const players = [...state.players].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const update = (index: number, change: Partial<(typeof rows)[number]>) => setRows(rows.map((r, i) => i === index ? { ...r, ...change } : r));
  const points = (place: number) => state.rules.points[place - 1] ?? state.rules.participation;

  return (
    <form className="form-stack" onSubmit={e => { e.preventDefault(); submit({ type: 'results.publish', tournamentId: tournament.id, placements: rows }); }}>
      <p className="muted">Los puntos se sumarán al ranking al publicar los resultados.</p>
      {rows.map((row, index) => (
        <div className="result-row" key={index}>
          <Field label="Puesto">
            <input aria-label={`Puesto ${index + 1}`} type="number" min="1" max={MAX_PLACES} required value={row.place} onChange={e => update(index, { place: Number(e.target.value) })} />
          </Field>
          <Field label={`Jugador · +${points(row.place)} pts`}>
            <select aria-label={`Jugador ${index + 1}`} value={row.playerId} required onChange={e => update(index, { playerId: e.target.value })}>
              <option value="">Seleccionar jugador</option>
              {players.map(p => <option value={p.id} key={p.id} disabled={rows.some((r, i) => i !== index && r.playerId === p.id)}>{p.name}</option>)}
            </select>
          </Field>
          <button type="button" className="icon-button" disabled={rows.length === 1} aria-label={`Quitar puesto ${index + 1}`} onClick={() => setRows(rows.filter((_, i) => i !== index))}><X size={18} /></button>
        </div>
      ))}
      <button type="button" className="button" disabled={rows.length >= Math.min(players.length, MAX_PLACES)} onClick={() => setRows([...rows, { playerId: '', place: Math.min(MAX_PLACES, Math.max(...rows.map(r => r.place)) + 1) }])}>
        <Plus size={16} />Agregar puesto
      </button>
      <button className="button primary" type="submit" disabled={!players.length}>Publicar resultados</button>
    </form>
  );
}
