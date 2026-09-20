import CategoryBadge from '../components/CategoryBadge';
import { useState } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import Avatar from '../components/Avatar';
import { number, type RankedPlayer, type State } from '../domain';
import { pageHref } from '../useHashRoute';

type Props = { state: State; ranking: RankedPlayer[]; canEdit: boolean; onAddPlayer: () => void };

export default function PlayersPage({ state, ranking, canEdit, onAddPlayer }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const cities = [...new Set(state.players.map(p => p.city))].sort((a, b) => a.localeCompare(b, 'es'));
  const needle = query.toLocaleLowerCase('es');
  const players = ranking
    .filter(p => (!category || p.category === category) && (!city || p.city === city) && `${p.name} ${p.city} ${p.club}`.toLocaleLowerCase('es').includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return (
    <section className="ranking-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">LOS NOMBRES DE NUESTRO JUEGO</span>
          <h1><em>Jugadores</em><span className="heading-period" aria-hidden="true">.</span></h1>
        </div>
        {canEdit && <button className="button primary" onClick={onAddPlayer}><Plus size={17} />Agregar jugador</button>}
      </div>
      <p className="page-description">Encontrá jugadores por nombre, club o ciudad.</p>
      <div className="filters">
        <label className="search"><Search size={17} /><input aria-label="Buscar jugadores" placeholder="Buscar jugador o club…" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <select className="city-filter" aria-label="Filtrar por ciudad" value={city} onChange={e => setCity(e.target.value)}>
          <option value="">Todas las ciudades</option>
          {cities.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="category-tabs" role="group" aria-label="Categoría de jugadores">{['', ...state.rules.categories.map(c => c.name)].map(c => <button key={c} aria-pressed={category === c} className={category === c ? 'selected' : ''} onClick={() => setCategory(c)}>{c || 'Todas'}</button>)}</div>
      <ul className="player-grid">
        {players.map(p => (
          <li key={p.id}>
            <a className="player-card" href={pageHref('Jugadores', { jugador: p.id })}>
              <Avatar name={p.name} tone={p.rank} photo={p.photo} />
              <span className="player-card-name"><strong>{p.name}</strong><small>{p.city} · {p.club || 'Independiente'}</small></span>
              <span className="player-card-rank" aria-label={`Puesto ${p.categoryRank} en ${p.category}`}>#{p.categoryRank}</span>
              <CategoryBadge category={p.category} rules={state.rules} />
              <span className="player-card-points">{number(p.points)} pts</span>
            </a>
          </li>
        ))}
      </ul>
      {!players.length && (
        <div className="empty">
          <Users size={30} />
          <h3>{state.players.length ? 'No encontramos jugadores' : 'Todavía no hay jugadores'}</h3>
          <p>{state.players.length ? 'Probá otro nombre, club o ciudad.' : canEdit ? 'Agregá el primero para comenzar el ranking.' : 'Pronto vas a verlos acá.'}</p>
        </div>
      )}
    </section>
  );
}
