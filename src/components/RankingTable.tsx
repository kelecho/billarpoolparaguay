import { ArrowDown, ArrowUp, Users } from 'lucide-react';
import { number, type RankedPlayer, type State } from '../domain';
import { pageHref } from '../useHashRoute';
import Avatar from './Avatar';

function Movement({ player }: { player: RankedPlayer }) {
  const delta = player.previousRank - player.rank;
  if (!delta) return <span className="movement" aria-label="Sin cambios">—</span>;
  return (
    <span className={`movement ${delta > 0 ? 'up' : 'down'}`} aria-label={`${delta > 0 ? 'Subió' : 'Bajó'} ${Math.abs(delta)} puestos`}>
      {delta > 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}{Math.abs(delta)}
    </span>
  );
}

type Props = { players: RankedPlayer[]; total: number; leaderPoints: number; state: State; emptyHint: string };

export default function RankingTable({ players, total, leaderPoints, state, emptyHint }: Props) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Puesto</th><th scope="col">Jugador</th><th scope="col">Categoría</th><th scope="col">Torneos</th><th scope="col">Puntos</th>
            <th scope="col"><span className="sr-only">Movimiento</span></th>
          </tr>
        </thead>
        <tbody>
          {players.map(p => (
            <tr key={p.id} className={p.rank === 1 ? 'leader-row' : undefined}>
              <td><span className={`rank rank-${p.rank}`}>{String(p.rank).padStart(2, '0')}</span></td>
              <td>
                <a className="player-link" href={pageHref('Ranking', { jugador: p.id })}>
                  <Avatar name={p.name} tone={p.rank} />
                  <span><strong>{p.name}</strong><small>{p.city}<span className="player-club"> · {p.club || 'Independiente'}</span></small></span>
                </a>
              </td>
              <td><span className={`category category-${state.rules.categories.findIndex(c => c.name === p.category)}`}>{p.category}</span></td>
              <td className="muted">{p.played}</td>
              <td className="score">
                <span>{number(p.points)}<small> pts</small></span>
                <span className="score-track" aria-hidden="true"><i style={{ width: `${Math.max(2, p.points / Math.max(1, leaderPoints) * 100)}%` }} /></span>
              </td>
              <td><Movement player={p} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!players.length && (
        <div className="empty">
          <Users size={30} />
          <h3>{total ? 'No encontramos jugadores' : 'El primer puesto está disponible'}</h3>
          <p>{emptyHint}</p>
        </div>
      )}
      <div className="table-footer"><span>{players.length} de {total} jugadores</span><span>Desempate: victorias y nombre</span></div>
    </div>
  );
}
