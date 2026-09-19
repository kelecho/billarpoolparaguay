import { useState, type ReactNode } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { DISCIPLINES, type Discipline, type State, type Tournament } from '../domain';

type Props = { state: State; canEdit: boolean; onCreate: () => void; renderTournament: (t: Tournament) => ReactNode };

export default function TournamentsPage({ state, canEdit, onCreate, renderTournament }: Props) {
  const [discipline, setDiscipline] = useState<Discipline | 'Todas'>('Todas');
  const shown = state.tournaments.filter(t => discipline === 'Todas' || t.discipline === discipline);
  const pending = shown.filter(t => !t.results.length).sort((a, b) => a.date.localeCompare(b.date));
  const finished = shown.filter(t => t.results.length).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section>
      <div className="section-heading">
        <div>
          <span className="eyebrow">CALENDARIO Y RESULTADOS</span>
          <h1><em>Torneos</em><span className="heading-period" aria-hidden="true">.</span></h1>
        </div>
        {canEdit && <button className="button primary" onClick={onCreate}><Plus size={17} />Crear torneo</button>}
      </div>
      <p className="page-description">{canEdit ? 'Organizá los encuentros y registrá cada resultado.' : 'La agenda de encuentros y los resultados de cada torneo.'}</p>
      <div className="filters">
        <div className="category-tabs" role="group" aria-label="Filtrar disciplina">
          {(['Todas', ...DISCIPLINES] as const).map(d => <button key={d} aria-pressed={discipline === d} className={discipline === d ? 'selected' : ''} onClick={() => setDiscipline(d)}>{d}</button>)}
        </div>
      </div>
      {pending.length > 0 && <><h2 className="group-title">Agenda</h2><div className="tournament-grid">{pending.map(renderTournament)}</div></>}
      {finished.length > 0 && <><h2 className="group-title">Resultados</h2><div className="tournament-grid">{finished.map(renderTournament)}</div></>}
      {!shown.length && (
        <div className="empty">
          <CalendarDays size={30} />
          <h3>{state.tournaments.length ? `Sin torneos de ${discipline}` : 'La próxima partida empieza acá'}</h3>
          <p>{canEdit ? 'Creá un torneo para registrar sus resultados.' : 'Pronto vas a ver acá los próximos encuentros.'}</p>
        </div>
      )}
    </section>
  );
}
