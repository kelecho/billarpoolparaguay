import CategoryBadge from '../components/CategoryBadge';
import DisciplineIcon from '../components/DisciplineIcon';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, Plus, Search } from 'lucide-react';
import Hero from '../components/Hero';
import Podium from '../components/Podium';
import RankingTable from '../components/RankingTable';
import { DISCIPLINES, dateLabel, localDate, number, standings, type Discipline, type State, type Tournament } from '../domain';
import { pageHref } from '../useHashRoute';

type Props = { state: State; canEdit: boolean; onAddPlayer: () => void; renderTournament: (t: Tournament) => ReactNode };

export default function RankingPage({ state, canEdit, onAddPlayer, renderTournament }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(state.rules.categories[0].name);
  const selectedCategory = category === 'Todas' || state.rules.categories.some(c => c.name === category) ? category : state.rules.categories[0].name;
  const [discipline, setDiscipline] = useState<Discipline | 'General'>('General');

  const table = useMemo(() => standings(state, discipline === 'General' ? undefined : discipline, selectedCategory === 'Todas' ? undefined : selectedCategory), [state, discipline, selectedCategory]);
  const needle = query.toLocaleLowerCase('es');
  const filtered = table.filter(p => `${p.name} ${p.city} ${p.club}`.toLocaleLowerCase('es').includes(needle));

  const completed = state.tournaments.filter(t => t.results.length);
  const latest = [...completed].sort((a, b) => b.date.localeCompare(a.date))[0];
  const upcoming = state.tournaments.filter(t => !t.results.length && t.date >= localDate()).sort((a, b) => a.date.localeCompare(b.date));
  const cities = new Set(state.players.map(p => p.city));
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <>
      <Hero />
      <section className="scoreboard" aria-label="Resumen">
        <div className="scoreboard-label"><span className="live-dot" />ASÍ ESTÁ<br /><strong>NUESTRO JUEGO</strong></div>
        <div><strong>{number(state.players.length)}</strong><span>Jugadores</span></div>
        <div><strong>{number(completed.length)}</strong><span>Torneos disputados</span></div>
        <div><strong>{pad(state.rules.categories.length)}</strong><span>Categorías</span></div>
        <div><strong>{pad(cities.size)}</strong><span>Ciudades en la mesa</span></div>
      </section>

      <section className="ranking-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">CADA PUESTO SE GANA EN LA MESA</span>
            <h2 id="ranking-title">El <em>ranking</em><span className="heading-period" aria-hidden="true">.</span></h2>
          </div>
          {canEdit && <button className="button primary" onClick={onAddPlayer}><Plus size={17} />Agregar jugador</button>}
        </div>
        <div className="ranking-caption">
          <span>{selectedCategory === 'Todas' ? 'Clasificación general de la comunidad.' : `Ranking de ${selectedCategory} · puestos dentro de la categoría.`}</span>
          <span>{latest ? `Último torneo: ${latest.name} · ${dateLabel(latest.date, true)}` : 'Listos para la primera partida'}</span>
        </div>
        <div className="filters">
          <div className="filter-groups">
            <div className="category-tabs discipline-tabs" role="group" aria-label="Ranking por disciplina">
              {(['General', ...DISCIPLINES] as const).map(d => <button key={d} aria-pressed={discipline === d} className={discipline === d ? 'selected' : ''} onClick={() => setDiscipline(d)}><DisciplineIcon discipline={d} /><span>{d}</span></button>)}
            </div>
            <div className="category-tabs rank-category-tabs" role="group" aria-label="Filtrar categoría">
              {['Todas', ...state.rules.categories.map(c => c.name)].map(c => <button key={c} aria-pressed={selectedCategory === c} className={selectedCategory === c ? 'selected' : ''} onClick={() => setCategory(c)}>{c !== 'Todas' && <CategoryBadge category={c} rules={state.rules} iconOnly />}{c}</button>)}
            </div>
          </div>
          <label className="search"><Search size={17} /><input aria-label="Buscar jugadores" placeholder="Buscar jugador o ciudad…" value={query} onChange={e => setQuery(e.target.value)} /></label>
        </div>
        <Podium players={table} label={selectedCategory === 'Todas' ? 'Podio del ranking general' : `Podio de ${selectedCategory}`} />
        {discipline !== 'General' && <p className="filter-note">Puntos ganados solo en torneos de {discipline}, sin puntos iniciales.</p>}
        <RankingTable
          players={filtered}
          total={table.length}
          leaderPoints={table[0]?.points ?? 1}
          state={state}
          emptyHint={!state.players.length ? (canEdit ? 'Agregá un jugador para comenzar el ranking.' : 'Pronto vas a ver acá a los primeros jugadores.') : !table.length ? discipline === 'General' ? 'Todavía no hay jugadores en esta categoría.' : `Todavía no se jugaron torneos de ${discipline} en esta categoría.` : 'Probá otro nombre, ciudad o categoría.'}
        />
      </section>

      <section>
        <div className="section-heading">
          <div>
            <span className="eyebrow">AGENDA DE TORNEOS</span>
            <h2>La próxima <em>mesa</em><span className="heading-period" aria-hidden="true">.</span></h2>
          </div>
          <a className="text-button" href={pageHref('Torneos')}>Ver todos <ArrowUpRight size={16} /></a>
        </div>
        <div className="tournament-grid">{upcoming.slice(0, 2).map(renderTournament)}</div>
        {!upcoming.length && <p className="empty">Todavía no hay torneos próximos.{canEdit && ' Creá uno desde Torneos.'}</p>}
      </section>
    </>
  );
}
