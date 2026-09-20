import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { DISCIPLINES, localDate, type Action, type Discipline, type Tournament, type State } from '../domain';
import { QUALIFIER_OPTIONS, type Format } from '../fixture';
import BannerField from './BannerField';
import ConfirmButton from './ConfirmButton';
import Field from './Field';

export default function TournamentForm({ tournament, state, submit }: { tournament?: Tournament; state: State; submit: (action: Action) => void }) {
  const [format, setFormat] = useState<Format>(tournament?.format ?? 'single');
  const locked = Boolean(tournament?.fixture);
  const [qualifiers, setQualifiers] = useState(tournament?.qualifiers ?? 2);
  // Con gran final (doble eliminación y 2 clasificados) la opción es la revancha; donde hay semifinales, el tercer puesto.
  const grandFinal = format === 'double' && qualifiers === 2;
  const [banner, setBanner] = useState(tournament?.banner);
  const [processing, setProcessing] = useState(false);
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (processing) return;
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
        ...(banner ? { banner } : {}),
        ...(format === 'double' ? { format, qualifiers } : {}),
        ...(grandFinal ? (data.get('finalRematch') ?? (locked && tournament?.finalRematch) ? { finalRematch: true } : {}) : (data.get('thirdPlace') ?? (locked && tournament?.thirdPlace) ? { thirdPlace: true } : {})),
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
      <div className="form-grid">
        <Field label="Formato"><select value={format} disabled={locked} onChange={e => setFormat(e.target.value as Format)}><option value="single">Eliminación directa</option><option value="double">Doble eliminación</option></select></Field>
        {format === 'double' && <Field label="Clasifican a la fase final"><select name="qualifiers" disabled={locked} value={qualifiers} onChange={e => setQualifiers(Number(e.target.value))}>{QUALIFIER_OPTIONS.map(n => <option key={n} value={n}>{n === 2 ? '2 · solo la gran final' : `${n} jugadores`}</option>)}</select></Field>}
      </div>
      <p className="muted small">{format === 'double'
        ? 'Quien pierde en la llave de ganadores sigue en la de perdedores; la segunda derrota elimina. La mitad de los clasificados llega invicta y la otra mitad con una derrota, y la fase final se juega por eliminación directa a partido único.'
        : 'Eliminación directa, con sorteo inicial, pases libres y fixture hasta la final.'}</p>
      {grandFinal
        ? <label className="check" key="rematch"><input name="finalRematch" type="checkbox" disabled={locked} defaultChecked={tournament?.finalRematch} /><span>Revancha en la gran final: si pierde el invicto, juegan un partido más</span></label>
        : <label className="check" key="third"><input name="thirdPlace" type="checkbox" disabled={locked} defaultChecked={tournament?.thirdPlace} /><span>Partido por el tercer puesto entre quienes pierden las semifinales</span></label>}
      <Field label="Sede y ciudad"><input name="venue" defaultValue={tournament?.venue} required maxLength={150} /></Field>
      <BannerField banner={banner} onChange={setBanner} onBusy={setProcessing} />
      <button className="button primary" type="submit">Guardar torneo</button>
      {tournament && <ConfirmButton confirmLabel="Confirmar: eliminar torneo" onConfirm={() => submit({ type: 'tournament.remove', tournamentId: tournament.id })}><Trash2 size={15} />Eliminar torneo</ConfirmButton>}
    </form>
  );
}
