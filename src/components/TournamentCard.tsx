import { ArrowUpRight, ChevronRight, MapPin, Trophy } from 'lucide-react';
import { dateLabel, hasRoster, isLive, localDate, type State, type Tournament } from '../domain';
import { pageHref, type Page } from '../useHashRoute';

type Props = { tournament: Tournament; state: State; page: Page; canEdit: boolean; onEdit: () => void; onResults: () => void };

const month = (date: string) => new Intl.DateTimeFormat('es-PY', { month: 'short' }).format(new Date(`${date}T12:00:00`)).replace('.', '');

export default function TournamentCard({ tournament: t, state, page, canEdit, onEdit, onResults }: Props) {
  const finished = t.results.length > 0;
  const winner = t.results.filter(r => r.place === 1).map(r => state.players.find(p => p.id === r.playerId)?.name).filter(Boolean).join(' · ');
  return (
    <article className={`tournament-card${t.banner ? ' tournament-card-banner' : ''}`}>
      {t.banner && <img className="card-banner" src={t.banner} alt="" loading="lazy" />}
      <div className="tournament-top">
        <span className="tag">{t.format === 'league' && 'Liga · '}{t.discipline}{t.category ? ` · ${t.category}` : t.open ? ' · Abierto' : ''}</span>
        <span className={`status ${finished ? 'finished' : ''}`}>{finished ? 'Finalizado' : isLive(t) ? 'En juego' : t.fixture ? 'Fixture armado' : hasRoster(t) ? 'Inscripciones' : t.date < localDate() ? 'Sin resultados' : 'Próximo'}</span>
      </div>
      <div className="tournament-title">
        <div className="date-stamp"><strong>{t.date.slice(8)}</strong><span>{month(t.date)}</span></div>
        <div><h3>{t.name}</h3><p>{dateLabel(t.date)}</p></div>
      </div>
      <p><MapPin size={15} />{t.venue}</p>
      {finished ? (
        <>
          <div className="winner"><Trophy size={17} /><span>{winner || 'Resultados publicados'}</span><small>{t.results.length} jugadores</small></div>
          <a className="text-button" href={pageHref(page, { torneo: t.id })}>Ver resultados <ChevronRight size={16} /></a>
        </>
      ) : (
        <div className="card-actions">
          <a className="text-button" href={pageHref(page, { torneo: t.id })}>{canEdit ? 'Administrar torneo' : 'Ver torneo'} <ChevronRight size={16} /></a>
          {canEdit && !hasRoster(t) && <button className="text-button" onClick={onEdit}>Editar torneo</button>}
          {canEdit && !hasRoster(t) && <button className="text-button" disabled={t.date > localDate()} onClick={onResults}>Cargar resultados <ArrowUpRight size={16} /></button>}
        </div>
      )}
    </article>
  );
}
