import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { DISCIPLINES, localDate, type Action, type Discipline, type Tournament, type State } from '../domain';
import ConfirmButton from './ConfirmButton';
import Field from './Field';

export default function TournamentForm({ tournament, state, submit }: { tournament?: Tournament; state: State; submit: (action: Action) => void }) {
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    submit({
      type: 'tournament.save',
      tournament: {
        id: tournament?.id ?? crypto.randomUUID(),
        name: String(data.get('name')).trim(),
        date: String(data.get('date') ?? tournament?.date),
        venue: String(data.get('venue')).trim(),
        discipline: (data.get('discipline') ?? tournament?.discipline) as Discipline,
        category: String(data.get('category') ?? tournament?.category ?? '') || undefined,
        raceTo: Number(data.get('raceTo') ?? tournament?.raceTo ?? 5),
        results: [],
      },
    });
  }
  return (
    <form onSubmit={save} className="form-stack">
      <Field label="Nombre del torneo"><input name="name" defaultValue={tournament?.name} required maxLength={150} autoFocus /></Field>
      <div className="form-grid">
        <Field label="Fecha"><input name="date" type="date" disabled={Boolean(tournament?.fixture)} defaultValue={tournament?.date ?? localDate()} required /></Field>
        <Field label="Disciplina">
          <select name="discipline" disabled={Boolean(tournament?.fixture)} defaultValue={tournament?.discipline ?? 'Bola 9'}>{DISCIPLINES.map(d => <option key={d}>{d}</option>)}</select>
        </Field>
      </div>
      <div className="form-grid">
        <Field label="Categoría del torneo"><select name="category" defaultValue={tournament?.category ?? ''} required={!tournament} disabled={Boolean(tournament?.registered?.length)}><option value="">Elegir categoría</option>{state.rules.categories.map(c => <option key={c.name}>{c.name}</option>)}</select></Field>
        <Field label="Partidas para ganar"><input name="raceTo" type="number" min="1" max="30" defaultValue={tournament?.raceTo ?? 5} required disabled={Boolean(tournament?.fixture)} /></Field>
      </div>
      <p className="muted small">Eliminación directa, con sorteo inicial, pases libres y fixture hasta la final.</p>
      <Field label="Sede y ciudad"><input name="venue" defaultValue={tournament?.venue} required maxLength={150} /></Field>
      <button className="button primary" type="submit">Guardar torneo</button>
      {tournament && <ConfirmButton confirmLabel="Confirmar: eliminar torneo" onConfirm={() => submit({ type: 'tournament.remove', tournamentId: tournament.id })}><Trash2 size={15} />Eliminar torneo</ConfirmButton>}
    </form>
  );
}
