import { Pencil, Share2 } from 'lucide-react';
import { dateLabel, number, type RankedPlayer, type Rules } from '../domain';
import { pageHref } from '../useHashRoute';
import Avatar from './Avatar';
import PointsChart from './PointsChart';
import CategoryBadge from './CategoryBadge';

type Props = { player: RankedPlayer; rules: Rules; canEdit: boolean; onEdit: () => void; onShare: () => void };

export default function PlayerProfile({ player, rules, canEdit, onEdit, onShare }: Props) {
  return (
    <div className="form-stack">
      <div className="profile-heading">
        <Avatar name={player.name} tone={player.rank} photo={player.photo} />
        <div>
          <h3>{player.name}</h3>
          <p className="muted">{player.city} · {player.club || 'Sin club'}</p>
        </div>
      </div>
      <div className="profile-category"><CategoryBadge category={player.category} rules={rules} large /><p>La categoría se mantiene al sumar puntos. Los ascensos se definirán más adelante.</p></div>
      <div className="profile-stats">
        <div><strong>#{player.categoryRank}</strong><span>En {player.category}</span></div>
        <div><strong>{number(player.points)}</strong><span>Puntos</span></div>
        <div><strong>{player.wins}</strong><span>Victorias</span></div>
        <div><strong>{player.podiums}</strong><span>Podios</span></div>
      </div>
      <PointsChart player={player} />
      <h3>Historial de torneos</h3>
      {player.entries.length ? (
        <ol className="result-list">
          {[...player.entries].reverse().map(r => (
            <li key={r.tournament.id}>
              <strong>{r.place}.º</strong>
              <a href={pageHref('Torneos', { torneo: r.tournament.id })}>{r.tournament.name}<small>{dateLabel(r.tournament.date, true)} · {r.tournament.discipline}</small></a>
              <b>+{number(r.points)}</b>
            </li>
          ))}
        </ol>
      ) : <p className="muted">Todavía no tiene resultados registrados.</p>}
      <div className="modal-actions">
        <button className="button" onClick={onShare}><Share2 size={16} />Compartir perfil</button>
        {canEdit && <button className="button" onClick={onEdit}><Pencil size={16} />Editar jugador</button>}
      </div>
    </div>
  );
}
