import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { DISCIPLINES, localDate, type Action, type Discipline, type Tournament } from '../domain';
import ConfirmButton from './ConfirmButton';
import Field from './Field';

export default function TournamentForm({ tournament, submit }: { tournament?: Tournament; submit: (action: Action) => void }) {
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    submit({
      type: 'tournament.save',
      tournament: {
        id: tournament?.id ?? crypto.randomUUID(),
        name: String(data.get('name')).trim(),
        date: String(data.get('date')),
        venue: String(data.get('venue')).trim(),
        discipline: data.get('discipline') as Discipline,
        results: [],
      },
    });
  }
  return (
    <form onSubmit={save} className="form-stack">
      <Field label="Nombre del torneo"><input name="name" defaultValue={tournament?.name} required maxLength={150} autoFocus /></Field>
      <div className="form-grid">
        <Field label="Fecha"><input name="date" type="date" defaultValue={tournament?.date ?? localDate()} required /></Field>
        <Field label="Disciplina">
          <select name="discipline" defaultValue={tournament?.discipline ?? 'Bola 9'}>{DISCIPLINES.map(d => <option key={d}>{d}</option>)}</select>
        </Field>
      </div>
      <Field label="Sede y ciudad"><input name="venue" defaultValue={tournament?.venue} required maxLength={150} /></Field>
      <button className="button primary" type="submit">Guardar torneo</button>
      {tournament && <ConfirmButton confirmLabel="Confirmar: eliminar torneo" onConfirm={() => submit({ type: 'tournament.remove', tournamentId: tournament.id })}><Trash2 size={15} />Eliminar torneo</ConfirmButton>}
    </form>
  );
}
