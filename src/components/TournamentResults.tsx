import { MapPin, Share2 } from 'lucide-react';
import { dateLabel, number, type State, type Tournament } from '../domain';
import { pageHref } from '../useHashRoute';

type Props = { tournament: Tournament; state: State; canEdit: boolean; onReopen: () => void; onShare: () => void };

export default function TournamentResults({ tournament, state, canEdit, onReopen, onShare }: Props) {
  const name = (id: string) => state.players.find(p => p.id === id)?.name ?? 'Jugador eliminado';
  return (
    <div className="form-stack">
      <p className="muted">{dateLabel(tournament.date)} · {tournament.discipline}<br /><MapPin size={13} /> {tournament.venue}</p>
      {tournament.results.length ? (
        <ol className="result-list">
          {[...tournament.results].sort((a, b) => a.place - b.place).map(r => (
            <li key={r.playerId} className={r.place <= 3 ? `place-${r.place}` : undefined}>
              <strong>{r.place}.º</strong>
              <a href={pageHref('Torneos', { jugador: r.playerId })}>{name(r.playerId)}</a>
              <b>+{number(r.points)}</b>
            </li>
          ))}
        </ol>
      ) : <p className="muted">Este torneo todavía no tiene resultados publicados.</p>}
      <div className="modal-actions">
        <button className="button" onClick={onShare}><Share2 size={16} />Compartir</button>
        {canEdit && tournament.results.length > 0 && <button className="button" onClick={onReopen}>Corregir resultados</button>}
      </div>
    </div>
  );
}
