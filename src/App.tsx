import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, CalendarDays, Check, ChevronRight, Download, Flag, MapPin, Plus, Search, Settings2, Trophy, Upload, Users, X } from 'lucide-react';
import PoolEmblem from './PoolEmblem';
import FloralParallax from './FloralParallax';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { applyAction, createState, dateLabel, localDate, number, standings, validateState, type Action, type Player, type RankedPlayer, type Rules, type State, type Tournament } from './domain';
import { downloadJSON, loadState, saveState, STORAGE_KEY } from './storage';

type Page = 'Ranking' | 'Jugadores' | 'Torneos' | 'Configuración';
type Modal = { kind: 'player'; player?: Player } | { kind: 'tournament'; tournament?: Tournament } | { kind: 'results'; tournament: Tournament } | { kind: 'profile'; player: RankedPlayer } | { kind: 'reopen'; tournament: Tournament } | { kind: 'replace'; state: State } | null;
const initials = (name: string) => name.split(' ').slice(0, 2).map(n => n[0]).join('');
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'No se pudo guardar el cambio.';

function ModalFrame({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { previous?.focus(); };
  }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}><div className="modal-head"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></div>{children}</dialog>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function PlayerForm({ player, submit }: { player?: Player; submit: (action: Action) => void }) {
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    submit({ type: 'player.save', player: { id: player?.id ?? crypto.randomUUID(), name: String(data.get('name')).trim(), city: String(data.get('city')).trim(), club: String(data.get('club')).trim(), initialPoints: Number(data.get('initialPoints')) } });
  }
  return <form onSubmit={save} className="form-stack"><Field label="Nombre y apellido"><input name="name" defaultValue={player?.name} required maxLength={150} autoFocus /></Field><div className="form-grid"><Field label="Ciudad"><input name="city" defaultValue={player?.city} required maxLength={150} /></Field><Field label="Club (opcional)"><input name="club" defaultValue={player?.club} maxLength={150} /></Field></div><Field label="Puntos iniciales"><input name="initialPoints" type="number" min="0" max="1000000" step="1" defaultValue={player?.initialPoints ?? 0} required /></Field><p className="muted small">Los puntos de los torneos se suman automáticamente a este valor.</p><button className="button primary" type="submit">Guardar jugador</button></form>;
}

function TournamentForm({ tournament, submit }: { tournament?: Tournament; submit: (action: Action) => void }) {
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    submit({ type: 'tournament.save', tournament: { id: tournament?.id ?? crypto.randomUUID(), name: String(data.get('name')).trim(), date: String(data.get('date')), venue: String(data.get('venue')).trim(), discipline: data.get('discipline') as Tournament['discipline'], results: [] } });
  }
  return <form onSubmit={save} className="form-stack"><Field label="Nombre del torneo"><input name="name" defaultValue={tournament?.name} required maxLength={150} autoFocus /></Field><div className="form-grid"><Field label="Fecha"><input name="date" type="date" defaultValue={tournament?.date ?? localDate()} required /></Field><Field label="Disciplina"><select name="discipline" defaultValue={tournament?.discipline ?? 'Bola 9'}>{['Bola 8', 'Bola 9', 'Bola 10'].map(d => <option key={d}>{d}</option>)}</select></Field></div><Field label="Sede y ciudad"><input name="venue" defaultValue={tournament?.venue} required maxLength={150} /></Field><button className="button primary" type="submit">Guardar torneo</button></form>;
}

function ResultsForm({ tournament, state, submit }: { tournament: Tournament; state: State; submit: (action: Action) => void }) {
  const [rows, setRows] = useState([{ playerId: '', place: 1 }]);
  return <form className="form-stack" onSubmit={e => { e.preventDefault(); submit({ type: 'results.publish', tournamentId: tournament.id, placements: rows }); }}><p className="muted">Los puntos se sumarán al ranking al publicar los resultados.</p>{rows.map((row, index) => <div className="result-row" key={index}><Field label="Puesto"><input aria-label={`Puesto ${index + 1}`} type="number" min="1" max="512" required value={row.place} onChange={e => setRows(rows.map((r, i) => i === index ? { ...r, place: Number(e.target.value) } : r))} /></Field><Field label="Jugador"><select aria-label={`Jugador ${index + 1}`} value={row.playerId} required onChange={e => setRows(rows.map((r, i) => i === index ? { ...r, playerId: e.target.value } : r))}><option value="">Seleccionar jugador</option>{[...state.players].sort((a, b) => a.name.localeCompare(b.name, 'es')).map(p => <option value={p.id} key={p.id} disabled={rows.some((r, i) => i !== index && r.playerId === p.id)}>{p.name}</option>)}</select></Field><button type="button" className="icon-button" disabled={rows.length === 1} aria-label={`Quitar puesto ${index + 1}`} onClick={() => setRows(rows.filter((_, i) => i !== index))}><X size={18} /></button></div>)}<button type="button" className="button" disabled={rows.length >= Math.min(state.players.length, 512)} onClick={() => setRows([...rows, { playerId: '', place: Math.min(512, Math.max(...rows.map(r => r.place)) + 1) }])}><Plus size={16} />Agregar puesto</button><button className="button primary" type="submit" disabled={!state.players.length}>Publicar resultados</button></form>;
}

function RulesForm({ rules, onSave }: { rules: Rules; onSave: (rules: Rules) => void }) {
  const [draft, setDraft] = useState(() => structuredClone(rules));
  useEffect(() => setDraft(structuredClone(rules)), [rules]);
  return <form className="panel settings-panel" onSubmit={e => { e.preventDefault(); onSave(draft); }}><h2>Categorías y puntuación</h2><p className="muted">Los cambios de puntuación se aplican a los próximos resultados publicados. Los resultados anteriores conservan sus puntos.</p><h3>Puntos mínimos por categoría</h3>{draft.categories.map((c, index) => <div className="form-grid" key={index}><Field label={`Categoría ${index + 1}`}><input value={c.name} required maxLength={150} onChange={e => setDraft({ ...draft, categories: draft.categories.map((v, i) => i === index ? { ...v, name: e.target.value } : v) })} /></Field><Field label="Puntos mínimos"><input type="number" min="0" max="1000000" required value={c.min} onChange={e => setDraft({ ...draft, categories: draft.categories.map((v, i) => i === index ? { ...v, min: Number(e.target.value) } : v) })} /></Field></div>)}<p className="muted small">Una categoría debe comenzar en 0. Los nombres y mínimos deben ser distintos.</p><h3>Puntos por puesto</h3><div className="points-grid">{draft.points.map((p, index) => <Field key={index} label={`${index + 1}.º puesto`}><input type="number" min="0" max="1000000" required value={p} onChange={e => setDraft({ ...draft, points: draft.points.map((v, i) => i === index ? Number(e.target.value) : v) })} /></Field>)}</div><Field label="Desde el 9.º puesto"><input type="number" min="0" max="1000000" required value={draft.participation} onChange={e => setDraft({ ...draft, participation: Number(e.target.value) })} /></Field><button className="button primary" type="submit">Guardar reglas</button></form>;
}

export default function App() {
  const [loaded] = useState(loadState);
  const [state, setState] = useState(loaded.state);
  const [storageBlocked, setStorageBlocked] = useState(Boolean(loaded.error));
  const [page, setPage] = useState<Page>('Ranking');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todas');
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState(loaded.error ?? '');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const ranking = standings(state);
  const filtered = ranking.filter(p => (category === 'Todas' || category === p.category) && `${p.name} ${p.city} ${p.club}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
  const upcoming = [...state.tournaments].filter(t => !t.results.length && t.date >= localDate()).sort((a, b) => a.date.localeCompare(b.date));
  const completed = state.tournaments.filter(t => t.results.length);
  const cities = [...new Set(state.players.map(p => p.city))];
  const latest = [...completed].sort((a, b) => b.date.localeCompare(a.date))[0];

  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); } }, [notice]);

  function commit(next: State, replacement = false) {
    if (storageBlocked && !replacement) throw new Error('Primero exportá los datos originales y restaurá un respaldo desde Configuración.');
    saveState(next);
    setState(next);
    setStorageBlocked(false);
    setError('');
    setNotice('Cambios guardados en este dispositivo.');
  }
  function dispatch(action: Action) {
    try { commit(applyAction(state, action)); setModal(null); } catch (e) { setError(errorMessage(e)); }
  }
  function open(next: Modal) { setError(''); setModal(next); }
  function navigate(next: Page) { setPage(next); setQuery(''); setCategory('Todas'); }
  function exportBackup() {
    try { downloadJSON(storageBlocked ? localStorage.getItem(STORAGE_KEY) ?? '' : JSON.stringify(state, null, 2), `pool-paraguay-${localDate()}.json`); } catch (e) { setError(errorMessage(e)); }
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('El respaldo supera el límite de 10 MB.');
      open({ kind: 'replace', state: validateState(JSON.parse(await file.text())) });
    } catch (e) { setError(errorMessage(e)); }
    if (fileInput.current) fileInput.current.value = '';
  }

  function tournamentCard(t: Tournament) {
    return <article className="tournament-card" key={t.id}><div className="tournament-top"><span className="tag">{t.discipline}</span><span className={`status ${t.results.length ? 'finished' : ''}`}>{t.results.length ? 'Finalizado' : t.date < localDate() ? 'Sin resultados' : 'Próximo'}</span></div><div className="tournament-title"><div className="date-stamp"><strong>{t.date.slice(8)}</strong><span>{new Intl.DateTimeFormat('es-PY', { month: 'short' }).format(new Date(`${t.date}T12:00:00`)).replace('.', '')}</span></div><div><h3>{t.name}</h3><p>{dateLabel(t.date)}</p></div></div><p><MapPin size={15} />{t.venue}</p>{t.results.length ? <><div className="winner"><Trophy size={17} /><span>{state.players.find(p => p.id === t.results.find(r => r.place === 1)?.playerId)?.name ?? 'Resultados publicados'}</span></div><button className="text-button" onClick={() => open({ kind: 'results', tournament: t })}>Ver resultados <ChevronRight size={16} /></button></> : <div className="card-actions"><button className="text-button" onClick={() => open({ kind: 'tournament', tournament: t })}>Editar torneo</button><button className="text-button" disabled={t.date > localDate()} onClick={() => open({ kind: 'results', tournament: t })}>Cargar resultados <ArrowUpRight size={16} /></button></div>}</article>;
  }

  return <div className="app-shell">
    <FloralParallax />
    <a className="skip-link" href="#main-content">Ir al contenido</a>
    <div className="national-stripe" aria-hidden="true" />
    <header className="club-header">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); navigate('Ranking'); }} aria-label="Pool Paraguay, inicio">
        <img src="/icon.svg" alt="" /><span>POOL<span>PARAGUAY</span></span>
      </a>
      <nav aria-label="Navegación principal">{([{ name: 'Ranking', icon: Trophy }, { name: 'Jugadores', icon: Users }, { name: 'Torneos', icon: CalendarDays }, { name: 'Configuración', icon: Settings2 }] as const).map(({ name, icon: Icon }) => <button key={name} className={page === name ? 'nav-item active' : 'nav-item'} aria-current={page === name ? 'page' : undefined} onClick={() => navigate(name)}><Icon size={17} /><span>{name}</span></button>)}</nav>
      <div className="header-country"><span className="flag"><i /><i /><i /></span><span>Hecho de partidas.<strong>Jugado en Paraguay.</strong></span></div>
    </header>
    <div className="workspace"><main id="main-content" tabIndex={-1}>
      {state.demo && <div className="demo-banner"><Flag size={16} /><span>Estás explorando datos de ejemplo.</span><button onClick={() => navigate('Configuración')}>Empezar con mis datos <ArrowUpRight size={14} /></button></div>}
      {storageBlocked && <p role="alert" className="error">No se pudo leer el respaldo local. Los cambios están bloqueados para protegerlo. Exportá los datos originales desde Configuración.</p>}
      {error && !modal && <p className="error" role="alert">{error}</p>}
      {page === 'Ranking' && <>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy"><span className="eyebrow"><span className="mini-star">✳</span> EL PUNTO DE ENCUENTRO DEL POOL PARAGUAYO</span>
            <h1 id="hero-title">El pool tiene<br /><em>bandera.</em></h1>
            <p>De la mesa de tu club al primer puesto.<br />Nuestro juego, nuestra gente, nuestro ranking.</p>
            <div className="hero-actions"><button className="button primary" onClick={() => document.getElementById('ranking-title')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>Ver el ranking <ArrowDown size={17} /></button><button className="text-button" onClick={() => navigate('Torneos')}>Encontrá tu próximo torneo <ArrowUpRight size={17} /></button></div>
            <div className="hero-note"><span className="note-line" />DE CLUB EN CLUB. DE PUNTA A PUNTA.</div>
          </div>
          <div className="hero-art"><span className="art-topline">PASIÓN QUE NOS UNE <span>PY</span></span><PoolEmblem /><span className="art-bottomline">UNA MESA. MIL HISTORIAS.</span></div>
        </section>
        <section className="scoreboard" aria-label="Resumen"><div className="scoreboard-label"><span className="live-dot" />ASÍ ESTÁ<br /><strong>NUESTRO JUEGO</strong></div><div><strong>{number(state.players.length)}</strong><span>Jugadores</span></div><div><strong>{number(completed.length)}</strong><span>Torneos disputados</span></div><div><strong>{String(state.rules.categories.length).padStart(2, '0')}</strong><span>Categorías</span></div><div className="scoreboard-territory"><strong>{String(cities.length).padStart(2, '0')}</strong><span>Ciudades en la mesa</span></div></section>
      </>}
      {(page === 'Ranking' || page === 'Jugadores') && <section className="ranking-section"><div className="section-heading"><div><span className="eyebrow">{page === 'Ranking' ? 'CADA PUESTO SE GANA EN LA MESA' : 'LOS NOMBRES DE NUESTRO JUEGO'}</span><h2 id="ranking-title">{page === 'Ranking' ? <>El <em>ranking</em></> : <em>Jugadores</em>}<span className="heading-period" aria-hidden="true">.</span></h2></div><button className="button primary" onClick={() => open({ kind: 'player' })}><Plus size={17} />Agregar jugador</button></div><div className="ranking-caption"><span>{page === 'Ranking' ? 'La clasificación de nuestra comunidad.' : 'Encontrá jugadores, clubes y ciudades.'}</span><span>{latest ? `Último torneo: ${dateLabel(latest.date, true)}` : 'Listos para la primera partida'}</span></div><div className="filters"><div className="category-tabs" aria-label="Filtrar categoría">{['Todas', ...state.rules.categories.map(c => c.name)].map(c => <button key={c} aria-pressed={category === c} className={category === c ? 'selected' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div><label className="search"><Search size={17} /><input aria-label="Buscar jugadores" placeholder="Buscar jugador o ciudad…" value={query} onChange={e => setQuery(e.target.value)} /></label></div><div className="table-wrap"><table><thead><tr><th scope="col">Puesto</th><th scope="col">Jugador</th><th scope="col">Categoría</th><th scope="col">Torneos</th><th scope="col">Puntos</th><th scope="col"><span className="sr-only">Movimiento</span></th></tr></thead><tbody>{filtered.map(p => <tr key={p.id} className={p.rank === 1 ? 'leader-row' : undefined}><td><span className={`rank rank-${p.rank}`}>{String(p.rank).padStart(2, '0')}</span></td><td><button className="player-link" onClick={() => open({ kind: 'profile', player: p })}><span className={`avatar avatar-${p.rank % 4}`}>{initials(p.name)}</span><span><strong>{p.name}</strong><small>{p.city}<span className="player-club"> · {p.club || 'Independiente'}</span></small></span></button></td><td><span className={`category category-${state.rules.categories.findIndex(c => c.name === p.category)}`}>{p.category}</span></td><td className="muted">{p.played}</td><td className="score"><span>{number(p.points)}<small> pts</small></span><span className="score-track" aria-hidden="true"><i style={{ width: `${Math.max(2, p.points / Math.max(1, ranking[0]?.points ?? 1) * 100)}%` }} /></span></td><td><span className={`movement ${p.previousRank > p.rank ? 'up' : p.previousRank < p.rank ? 'down' : ''}`} aria-label={p.previousRank === p.rank ? 'Sin cambios' : `${p.previousRank > p.rank ? 'Subió' : 'Bajó'} ${Math.abs(p.previousRank - p.rank)} puestos`}>{p.previousRank === p.rank ? '—' : <>{p.previousRank > p.rank ? <ArrowUp size={13} /> : <ArrowDown size={13} />}{Math.abs(p.previousRank - p.rank)}</>}</span></td></tr>)}</tbody></table>{!filtered.length && <div className="empty"><Users size={30} /><h3>{state.players.length ? 'No encontramos jugadores' : 'El primer puesto está disponible'}</h3><p>{state.players.length ? 'Probá otro nombre, ciudad o categoría.' : 'Agregá un jugador para comenzar el ranking.'}</p></div>}<div className="table-footer"><span>{filtered.length} de {state.players.length} jugadores</span><span>Desempate: victorias y nombre</span></div></div></section>}
      {page === 'Ranking' && <section><div className="section-heading"><div><span className="eyebrow">AGENDA DE TORNEOS</span><h2>La próxima <em>mesa</em><span className="heading-period" aria-hidden="true">.</span></h2></div><button className="text-button" onClick={() => navigate('Torneos')}>Ver todos <ArrowUpRight size={16} /></button></div><div className="tournament-grid">{upcoming.slice(0, 2).map(tournamentCard)}</div>{!upcoming.length && <p className="empty">Todavía no hay torneos próximos. Creá uno desde Torneos.</p>}</section>}
      {page === 'Torneos' && <section><div className="section-heading"><div><span className="eyebrow">CALENDARIO Y RESULTADOS</span><h1><em>Torneos</em><span className="heading-period" aria-hidden="true">.</span></h1></div><button className="button primary" onClick={() => open({ kind: 'tournament' })}><Plus size={17} />Crear torneo</button></div><p className="page-description">Organizá los encuentros y registrá cada resultado.</p><div className="tournament-grid">{[...state.tournaments].sort((a, b) => b.date.localeCompare(a.date)).map(tournamentCard)}</div>{!state.tournaments.length && <div className="empty"><CalendarDays size={30} /><h3>La próxima partida empieza acá</h3><p>Creá un torneo para registrar sus resultados.</p></div>}</section>}
      {page === 'Configuración' && <section><div className="section-heading"><div><span className="eyebrow">TU ORGANIZACIÓN</span><h1><em>Configuración</em><span className="heading-period" aria-hidden="true">.</span></h1></div></div><div className="settings-layout"><RulesForm rules={state.rules} onSave={rules => dispatch({ type: 'rules.save', rules })} /><div className="form-stack"><section className="panel settings-panel"><h2>Respaldo de datos</h2><p className="muted">Tus datos se guardan en este navegador. Exportá un respaldo para conservarlos o llevarlos a otro dispositivo.</p><button className="button" onClick={exportBackup}><Download size={17} />{storageBlocked ? 'Exportar datos originales' : 'Exportar respaldo'}</button><button className="button" onClick={() => fileInput.current?.click()}><Upload size={17} />Restaurar respaldo</button><input className="sr-only" ref={fileInput} type="file" accept=".json,application/json" aria-label="Archivo de respaldo" onChange={e => void importBackup(e.target.files?.[0])} /></section><section className="panel settings-panel"><h2>{state.demo ? 'Empezá tu ranking' : 'Nuevo registro'}</h2><p className="muted">Comenzá sin jugadores ni torneos, con las reglas iniciales. Guardá un respaldo antes de reemplazar tus datos.</p><button className="button" onClick={() => open({ kind: 'replace', state: createState(false) })}>Empezar desde cero</button></section></div></div></section>}
      <footer className="club-footer"><div className="footer-brand"><img src="/icon.svg" alt="" /><span>De acá.<br /><strong>De nuestra mesa.</strong></span></div><div className="footer-cities">{cities.length ? <><span>EL POOL NOS ENCUENTRA EN</span><p>{cities.slice(0, 6).join(' · ')}{cities.length > 6 ? ` y ${cities.length - 6} ciudades más` : ''}</p></> : <p>El próximo encuentro empieza con vos.</p>}</div><div className="footer-local"><span className="local-badge"><span />Guardado en este dispositivo</span><span>{state.demo ? 'Datos de demostración' : 'Registro local'} · Sin sincronización</span></div></footer>
    </main></div>
    {notice && <div className="toast" role="status"><Check size={18} />{notice}</div>}
    {needRefresh && <div className="update-banner" role="status">Hay una nueva versión disponible.<button className="button" onClick={() => void updateServiceWorker(true)}>Actualizar</button></div>}
    {modal && <ModalFrame title={modal.kind === 'player' ? modal.player ? 'Editar jugador' : 'Agregar jugador' : modal.kind === 'tournament' ? modal.tournament ? 'Editar torneo' : 'Crear torneo' : modal.kind === 'profile' ? 'Perfil del jugador' : modal.kind === 'reopen' ? 'Corregir resultados' : modal.kind === 'replace' ? 'Reemplazar datos locales' : modal.tournament.name} onClose={() => { setModal(null); setError(''); }}>{error && <p role="alert" className="error">{error}</p>}
      {modal.kind === 'player' && <PlayerForm player={modal.player} submit={dispatch} />}
      {modal.kind === 'tournament' && <TournamentForm tournament={modal.tournament} submit={dispatch} />}
      {modal.kind === 'results' && (modal.tournament.results.length ? <div className="form-stack"><p className="muted">{dateLabel(modal.tournament.date)} · {modal.tournament.discipline}</p><ol className="result-list">{[...modal.tournament.results].sort((a, b) => a.place - b.place).map(r => <li key={r.playerId}><strong>{r.place}.º</strong><span>{state.players.find(p => p.id === r.playerId)?.name}</span><b>+{number(r.points)}</b></li>)}</ol><button className="button" onClick={() => open({ kind: 'reopen', tournament: modal.tournament })}>Corregir resultados</button></div> : <ResultsForm tournament={modal.tournament} state={state} submit={dispatch} />)}
      {modal.kind === 'profile' && <div className="form-stack"><div className="profile-heading"><span className="avatar">{initials(modal.player.name)}</span><div><h3>{modal.player.name}</h3><p className="muted">{modal.player.city} · {modal.player.club || 'Sin club'}</p></div></div><div className="profile-stats"><div><strong>#{modal.player.rank}</strong><span>Posición</span></div><div><strong>{number(modal.player.points)}</strong><span>Puntos</span></div><div><strong>{modal.player.wins}</strong><span>Victorias</span></div></div><h3>Historial de torneos</h3>{modal.player.entries.length ? <ol className="result-list">{[...modal.player.entries].reverse().map(r => <li key={r.tournament.id}><strong>{r.place}.º</strong><span>{r.tournament.name}<small>{dateLabel(r.tournament.date, true)}</small></span><b>+{number(r.points)}</b></li>)}</ol> : <p className="muted">Todavía no tiene resultados registrados.</p>}<button className="button" onClick={() => open({ kind: 'player', player: modal.player })}>Editar jugador</button></div>}
      {modal.kind === 'reopen' && <form className="form-stack" onSubmit={e => { e.preventDefault(); dispatch({ type: 'results.reopen', tournamentId: modal.tournament.id, reason: String(new FormData(e.currentTarget).get('reason')) }); }}><p>Se retirarán del ranking los puntos de <strong>{modal.tournament.name}</strong>. Luego podrás cargar los resultados corregidos.</p><p className="muted small">Exportá un respaldo si necesitás conservar los resultados actuales.</p><Field label="Motivo de la corrección"><textarea name="reason" required minLength={5} maxLength={500} autoFocus /></Field><button className="button primary" type="submit">Reabrir torneo</button></form>}
      {modal.kind === 'replace' && <div className="form-stack"><p>Vas a reemplazar los datos actuales por <strong>{modal.state.players.length} jugadores y {modal.state.tournaments.length} torneos</strong>. Esta acción no se puede deshacer sin un respaldo.</p><button className="button" onClick={exportBackup}><Download size={17} />Exportar datos actuales</button><button className="button danger" onClick={() => { try { commit(modal.state, true); setModal(null); setCategory('Todas'); } catch (e) { setError(errorMessage(e)); } }}>Confirmar reemplazo</button></div>}
    </ModalFrame>}
  </div>;
}
