import { Trophy } from 'lucide-react';
import { number, type RankedPlayer } from '../domain';
import { pageHref } from '../useHashRoute';

/** Los tres primeros del ranking general, con el líder al centro como en un podio. */
export default function Podium({ players }: { players: RankedPlayer[] }) {
  if (players.length < 3) return null;
  return (
    <ol className="podium" aria-label="Podio del ranking general">
      {players.slice(0, 3).map(p => (
        <li key={p.id} className={`podium-step podium-${p.rank}`}>
          <a href={pageHref('Ranking', { jugador: p.id })}>
            <span className="podium-rank">{p.rank === 1 && <Trophy size={18} />}{p.rank}.º</span>
            <strong>{p.name}</strong>
            <small>{p.city}{p.club && ` · ${p.club}`}</small>
            <span className="podium-points">{number(p.points)}<small> pts</small></span>
            <span className="podium-meta">{p.wins} {p.wins === 1 ? 'victoria' : 'victorias'} · {p.played} {p.played === 1 ? 'torneo' : 'torneos'}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}
