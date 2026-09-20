import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CalendarDays, Check, Download, Flag, Lock, Moon, Settings2, Sun, Trophy, Users, WifiOff } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import FloralParallax from './FloralParallax';
import { PasswordForm } from './components/AccountPanel';
import LoginForm from './components/LoginForm';
import ModalFrame from './components/ModalFrame';
import Field from './components/Field';
import PlayerForm from './components/PlayerForm';
import PlayerProfile from './components/PlayerProfile';
import ResultsForm from './components/ResultsForm';
import TournamentCard from './components/TournamentCard';
import TournamentForm from './components/TournamentForm';
import TournamentManager from './components/TournamentManager';
import { dateLabel, localDate, standings, type Action, type Player, type State, type Tournament } from './domain';
import PlayersPage from './pages/PlayersPage';
import RankingPage from './pages/RankingPage';
import SettingsPage from './pages/SettingsPage';
import TournamentsPage from './pages/TournamentsPage';
import { downloadJSON } from './storage';
import { pageHref, useHashRoute, type Page } from './useHashRoute';
import { ROLE_LABELS } from './roles';
import { useStore } from './useStore';
import { useTheme } from './useTheme';

/** Diálogos de edición. El perfil y los resultados de un torneo se abren desde la URL, no desde acá. */
type Modal =
  | { kind: 'player'; player?: Player; category?: string }
  | { kind: 'tournament'; tournament?: Tournament }
  | { kind: 'results'; tournament: Tournament }
  | { kind: 'reopen'; tournament: Tournament }
  | { kind: 'replace'; state: State }
  | { kind: 'login' }
  | null;

const NAV = [{ name: 'Ranking', icon: Trophy }, { name: 'Jugadores', icon: Users }, { name: 'Torneos', icon: CalendarDays }, { name: 'Configuración', icon: Settings2 }] as const;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'No se pudo guardar el cambio.';

export default function App() {
  const [modal, setModal] = useState<Modal>(null);
  const store = useStore();
  const { state, canEdit } = store;
  const { route, navigate } = useHashRoute();
  const { theme, toggle: toggleTheme } = useTheme();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  const ranking = useMemo(() => standings(state), [state]);
  const page: Page = route.page === 'Configuración' && !canEdit ? 'Ranking' : route.page;
  const profile = ranking.find(p => p.id === route.playerId);
  const shownTournament = profile ? undefined : state.tournaments.find(t => t.id === route.tournamentId);
  const cities = [...new Set(state.players.map(p => p.city))];
  const savedNotice = store.remote ? 'Cambios publicados para todos.' : 'Cambios guardados en este dispositivo.';

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => { window.scrollTo(0, 0); }, [page]);

  function open(next: Modal) { setError(''); setModal(next); }
  function closeModal() {
    setError('');
    setModal(null);
    if (profile || shownTournament) navigate(pageHref(page));
  }
  /** Ejecuta un cambio; si falla, deja el diálogo abierto con el motivo. */
  async function run(task: () => Promise<void>, message = savedNotice) {
    try {
      await task();
      setError('');
      setModal(null);
      setNotice(message);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const dispatch = (action: Action) => void run(async () => {
    await store.dispatch(action);
    if (action.type === 'player.remove' || action.type === 'tournament.remove') navigate(pageHref(page));
  });
  async function exportBackup() {
    try { downloadJSON(await store.exportContent(), `pool-paraguay-${localDate()}.json`); } catch (e) { setError(errorMessage(e)); }
  }
  async function share(title: string) {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${title} · Pool Paraguay`, url });
      else { await navigator.clipboard.writeText(url); setNotice('Enlace copiado. Pegalo donde quieras compartirlo.'); }
    } catch { /* la persona canceló el diálogo de compartir */ }
  }

  const renderTournament = (t: Tournament) => (
    <TournamentCard key={t.id} tournament={t} state={state} page={page} canEdit={canEdit} onEdit={() => open({ kind: 'tournament', tournament: t })} onResults={() => open({ kind: 'results', tournament: t })} />
  );

  // La contraseña la puso el superadministrador: antes de cualquier otra cosa, la persona elige la suya.
  const mustChangePassword = Boolean(store.user?.mustChangePassword);
  const modalTitle = mustChangePassword ? 'Elegí tu contraseña' : modal
    ? { player: modal.kind === 'player' && modal.player ? 'Editar jugador' : 'Agregar jugador', tournament: modal.kind === 'tournament' && modal.tournament ? 'Editar torneo' : 'Crear torneo', results: modal.kind === 'results' ? modal.tournament.name : '', reopen: 'Corregir resultados', replace: store.remote ? 'Reemplazar datos publicados' : 'Reemplazar datos locales', login: 'Iniciar sesión' }[modal.kind]
    : profile ? 'Perfil del jugador' : shownTournament?.name;

  return (
    <div className="app-shell">
      <FloralParallax />
      <a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>Ir al contenido</a>
      <div className="national-stripe" aria-hidden="true" />
      <header className="club-header">
        <a className="brand" href={pageHref('Ranking')} aria-label="Pool Paraguay, inicio">
          <img src="/icon.svg" alt="" /><span>POOL<span>PARAGUAY</span></span>
        </a>
        <nav aria-label="Navegación principal" className={canEdit ? undefined : 'nav-public'}>
          {NAV.filter(item => item.name !== 'Configuración' || canEdit).map(({ name, icon: Icon }) => (
            <a key={name} href={pageHref(name)} className={page === name ? 'nav-item active' : 'nav-item'} aria-current={page === name ? 'page' : undefined}><Icon size={17} /><span>{name}</span></a>
          ))}
        </nav>
        <div className="header-end">
          <div className="header-country"><span className="flag"><i /><i /><i /></span><span>Hecho de partidas.<strong>Jugado en Paraguay.</strong></span></div>
          <button className="theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} aria-pressed={theme === 'dark'}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <div className="workspace">
        <main id="main-content" tabIndex={-1}>
          {state.demo && <div className="demo-banner"><Flag size={16} /><span>Estás explorando datos de ejemplo.</span><a href={pageHref('Configuración')}>Empezar con mis datos <ArrowUpRight size={14} /></a></div>}
          {store.offlineSince && <div className="demo-banner"><WifiOff size={16} /><span>Sin conexión. Mostramos el ranking guardado el {dateLabel(store.offlineSince.slice(0, 10))}.</span></div>}
          {store.storageBlocked && <p role="alert" className="error">No se pudo leer el respaldo local. Los cambios están bloqueados para protegerlo. Exportá los datos originales desde Configuración.</p>}
          {store.loadError && !store.storageBlocked && <p role="alert" className="error">{store.loadError}</p>}
          {error && !modalTitle && <p className="error" role="alert">{error}</p>}

          {store.status === 'loading' ? <p className="empty" role="status">Cargando el ranking…</p> : <>
            {page === 'Ranking' && <RankingPage state={state} canEdit={canEdit} onAddPlayer={() => open({ kind: 'player' })} renderTournament={renderTournament} />}
            {page === 'Jugadores' && <PlayersPage state={state} ranking={ranking} canEdit={canEdit} onAddPlayer={() => open({ kind: 'player' })} />}
            {page === 'Torneos' && <TournamentsPage state={state} canEdit={canEdit} onCreate={() => open({ kind: 'tournament' })} renderTournament={renderTournament} />}
            {page === 'Configuración' && <SettingsPage store={store} onSaveRules={rules => dispatch({ type: 'rules.save', rules })} onExport={exportBackup} onReplace={next => open({ kind: 'replace', state: next })} onError={e => setError(errorMessage(e))} onLogout={all => void run(async () => { await store.logout(all); navigate(pageHref('Ranking')); }, all ? 'Sesiones cerradas en todos los dispositivos.' : 'Sesión cerrada.')} />}
          </>}

          <footer className="club-footer">
            <div className="footer-brand"><img src="/icon.svg" alt="" /><span>De acá.<br /><strong>De nuestra mesa.</strong></span></div>
            <div className="footer-cities">
              {cities.length ? <><span>EL POOL NOS ENCUENTRA EN</span><p>{cities.slice(0, 6).join(' · ')}{cities.length > 6 ? ` y ${cities.length - 6} ciudades más` : ''}</p></> : <p>El próximo encuentro empieza con vos.</p>}
            </div>
            <div className="footer-local">
              {store.remote
                ? store.user ? <span className="local-badge"><span />{store.user.name} · {ROLE_LABELS[store.user.role]}</span> : <button className="text-button" onClick={() => open({ kind: 'login' })}><Lock size={14} />Iniciar sesión</button>
                : <><span className="local-badge"><span />Guardado en este dispositivo</span><span>{state.demo ? 'Datos de demostración' : 'Registro local'} · Sin sincronización</span></>}
            </div>
          </footer>
        </main>
      </div>

      {notice && <div className="toast" role="status"><Check size={18} />{notice}</div>}
      {needRefresh && <div className="update-banner" role="status">Hay una nueva versión disponible.<button className="button" onClick={() => void updateServiceWorker(true)}>Actualizar</button></div>}

      {modalTitle && (
        <ModalFrame wide={!mustChangePassword && !modal && Boolean(shownTournament)} key={mustChangePassword ? 'password' : modal?.kind ?? profile?.id ?? shownTournament?.id} title={modalTitle} onClose={mustChangePassword ? () => void store.logout(false) : closeModal}>
          {error && <p role="alert" className="error">{error}</p>}
          {mustChangePassword && <>
            <p className="muted">Tu cuenta tiene la contraseña inicial que te pasaron. Elegí una propia, de al menos 12 caracteres, para empezar a cargar datos.</p>
            <PasswordForm currentLabel="Contraseña inicial" onDone={() => void store.refresh().then(() => setNotice('Contraseña cambiada. Ya podés cargar resultados.'))} />
          </>}
          {!mustChangePassword && <>
          {!modal && profile && <PlayerProfile player={profile} rules={state.rules} canEdit={canEdit} onEdit={() => open({ kind: 'player', player: profile })} onShare={() => void share(profile.name)} />}
          {!modal && shownTournament && <TournamentManager onLegacyResults={() => open({ kind: 'results', tournament: shownTournament })} onCreatePlayer={() => open({ kind: 'player', category: shownTournament.category })} tournament={shownTournament} submit={async action => { try { await store.dispatch(action); setError(''); setNotice(savedNotice); return true; } catch (e) { setError(errorMessage(e)); return false; } }} onEdit={() => open({ kind: 'tournament', tournament: shownTournament })} state={state} canEdit={canEdit} onReopen={() => open({ kind: 'reopen', tournament: shownTournament })} onShare={() => void share(shownTournament.name)} />}
          {modal?.kind === 'player' && <PlayerForm defaultCategory={modal.category} state={state} player={modal.player} submit={dispatch} />}
          {modal?.kind === 'tournament' && <TournamentForm state={state} tournament={modal.tournament} submit={dispatch} />}
          {modal?.kind === 'results' && <ResultsForm tournament={modal.tournament} state={state} submit={dispatch} />}
          {modal?.kind === 'login' && <LoginForm submit={(email, password) => void run(() => store.login(email, password), 'Sesión iniciada. Ya podés cargar resultados.')} />}
          {modal?.kind === 'reopen' && (
            <form className="form-stack" onSubmit={e => { e.preventDefault(); dispatch({ type: 'results.reopen', tournamentId: modal.tournament.id, reason: String(new FormData(e.currentTarget).get('reason')) }); }}>
              <p>Se retirarán del ranking los puntos de <strong>{modal.tournament.name}</strong>. Luego podrás cargar los resultados corregidos.</p>
              <p className="muted small">{store.remote ? 'El motivo queda en el registro de cambios.' : 'Exportá un respaldo si necesitás conservar los resultados actuales.'}</p>
              <Field label="Motivo de la corrección"><textarea name="reason" required minLength={5} maxLength={500} autoFocus /></Field>
              <button className="button primary" type="submit">Reabrir torneo</button>
            </form>
          )}
          {modal?.kind === 'replace' && (
            <div className="form-stack">
              <p>Vas a reemplazar los datos actuales por <strong>{modal.state.players.length} jugadores y {modal.state.tournaments.length} torneos</strong>. Esta acción no se puede deshacer sin un respaldo.</p>
              <button className="button" onClick={exportBackup}><Download size={17} />Exportar datos actuales</button>
              <button className="button danger" onClick={() => void run(() => store.replace(modal.state))}>Confirmar reemplazo</button>
            </div>
          )}
          </>}
        </ModalFrame>
      )}
    </div>
  );
}
