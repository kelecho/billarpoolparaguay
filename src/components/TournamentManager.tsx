import { useState } from 'react';
import { ImagePlus, Pencil, Share2, Shuffle } from 'lucide-react';
import { dateLabel, localDate, standings, type Action, type State, type Tournament } from '../domain';
import { drawPlayers, fixtureOutcome, resolveFixture } from '../fixture';
import BannerField from './BannerField';
import CategoryBadge from './CategoryBadge';
import ConfirmButton from './ConfirmButton';
import DrawReveal from './DrawReveal';
import FixtureBoard from './FixtureBoard';
import LeagueBoard from './LeagueBoard';
import TournamentRegistration from './TournamentRegistration';
import TournamentResults from './TournamentResults';
import Field from './Field';

type Props = { tournament: Tournament; state: State; canEdit: boolean; /** Se está jugando y la página se actualiza sola. */ live?: boolean; submit: (action: Action) => Promise<boolean>; onLegacyResults: () => void; onCreatePlayer: () => void; onEdit: () => void; onReopen: () => void; onShare: () => void };

export default function TournamentManager({ tournament: t, state, canEdit, live = false, submit, onLegacyResults, onCreatePlayer, onEdit, onReopen, onShare }: Props) {
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<'random' | 'ranking' | 'manual'>('random');
  // Con los resultados publicados el torneo ya no se edita, pero el banner no cambia nada deportivo.
  const [banner, setBanner] = useState<{ value?: string } | null>(null);
  // Se enciende antes de guardar el sorteo, para que el fixture nunca se vea antes que la revelación.
  const [reveal, setReveal] = useState(false);
  const registered = t.registered ?? [];
  const league = t.format === 'league';
  const matches = resolveFixture(t);
  const finished = t.results.length > 0;
  const started = matches.some(m => m.scoreA !== undefined);
  const finalReady = fixtureOutcome(matches).complete;
  const save = async (action: Action) => {
    if (busy) return false;
    setBusy(true);
    try { return await submit(action); } finally { setBusy(false); }
  };
  const generate = (draw = method) => {
    const playerIds = draw === 'random' ? drawPlayers(registered) : draw === 'ranking' ? standings(state, undefined, t.category).filter(p => registered.includes(p.id)).map(p => p.id) : registered;
    // Solo el sorteo al azar tiene suspenso; con cabezas de serie los cruces ya están dichos. Quien pidió menos movimiento va directo al fixture.
    const animate = !league && draw === 'random' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReveal(animate);
    void save({ type: 'fixture.generate', tournamentId: t.id, playerIds, draw }).then(ok => { if (!ok) setReveal(false); });
  };
  return <div className="tournament-manager form-stack" aria-busy={busy}>
    {/* El mismo afiche, desenfocado, rellena los costados cuando es vertical. */}
    {t.banner && !banner && <div className="tournament-banner" style={{ backgroundImage: `url("${t.banner}")` }}><img src={t.banner} alt={`Banner de ${t.name}`} /></div>}
    {banner && <div className="form-stack">
      <BannerField banner={banner.value} onChange={value => setBanner({ value })} />
      <div className="modal-actions">
        <button className="button primary" disabled={busy} onClick={() => void save({ type: 'tournament.banner', tournamentId: t.id, banner: banner.value }).then(ok => { if (ok) setBanner(null); })}>Guardar banner</button>
        <button className="button" disabled={busy} onClick={() => setBanner(null)}>Cancelar</button>
      </div>
    </div>}
    <div className="tournament-summary">
      {t.category && <CategoryBadge category={t.category} rules={state.rules} large />}
      <div><p>{dateLabel(t.date)} · {t.discipline}</p><p className="muted">{t.venue}</p>{t.category && <p className="muted small">{league ? `Liga todos contra todos · ${t.leagueRounds === 2 ? 'ida y vuelta' : 'una vuelta'}` : t.format === 'double' ? `Doble eliminación · ${t.qualifiers === 2 ? t.finalRematch ? 'gran final con revancha' : 'gran final a partido único' : `${t.qualifiers} clasifican a la fase final`}` : 'Eliminación directa'}{t.thirdPlace && ' · con partido por el tercer puesto'} · Primero en llegar a {t.raceTo ?? 5} partidas · {registered.length} inscriptos</p>}</div>
    </div>
    <div className="modal-actions">
      {canEdit && !finished && <button className="button" disabled={busy} onClick={onEdit}><Pencil size={15} />Editar torneo</button>}
      {canEdit && !finished && !t.category && <button className="button" disabled={t.date > localDate()} onClick={onLegacyResults}>Cargar resultados</button>}
      {canEdit && finished && !banner && <button className="button" disabled={busy} onClick={() => setBanner({ value: t.banner })}><ImagePlus size={15} />{t.banner ? 'Cambiar banner' : 'Agregar banner'}</button>}
      <button className="button" onClick={onShare}><Share2 size={15} />Compartir torneo</button>
    </div>
    {!t.category && !finished && <p className="muted">Asigná una categoría desde «Editar torneo» para abrir las inscripciones y realizar el sorteo.</p>}
    {reveal && (busy || !t.fixture) && <p className="draw-wait" role="status">Girando el bolillero…</p>}
    {reveal && !busy && t.fixture && <DrawReveal key={t.fixture.seeds.join()} seeds={t.fixture.seeds} name={id => state.players.find(p => p.id === id)?.name ?? 'Jugador'} onDone={() => setReveal(false)} />}
    {!reveal && t.category && !t.fixture && !finished && (canEdit
      ? <TournamentRegistration onCreatePlayer={onCreatePlayer} tournament={t} state={state} busy={busy} submit={save} />
      : <section><h3>Inscriptos · {registered.length}</h3><ul className="public-registrations">{registered.map(id => <li key={id}>{state.players.find(p => p.id === id)?.name}</li>)}</ul><p className="muted">El fixture estará disponible después del sorteo inicial.</p></section>)}
    {!reveal && canEdit && t.category && !finished && !t.fixture && <section className="draw-panel">
      <div><h3><Shuffle size={21} />Sorteo inicial y emparejamientos</h3><p className="muted small">{league ? 'Cada jugador enfrenta a todos los demás. Si hay un número impar, uno descansa por jornada.' : 'Revisá los inscriptos antes de armar el cuadro. Los pases libres se resuelven automáticamente.'}</p></div>
      <Field label="Armado de cruces"><select value={method} onChange={e => setMethod(e.target.value as typeof method)}><option value="random">Sorteo aleatorio</option><option value="ranking">{league ? 'Orden por ranking' : 'Cabezas de serie por ranking'}</option><option value="manual">{league ? 'Orden de inscripción' : 'Cabezas de serie en orden manual'}</option></select></Field>
      <p className="muted small">{league ? 'El orden elegido define las jornadas; todos juegan la misma cantidad de encuentros. Podés asignar fecha, mesa y horario a cada partido.' : method === 'random' ? 'Todos participan del sorteo, incluidos los pases libres. Los cruces quedan guardados para compartirlos.' : 'Las primeras cabezas de serie reciben los pases libres y se distribuyen en lados opuestos del cuadro.'}</p>
      <button className="button primary" disabled={busy || registered.length < 2} onClick={() => generate()}><Shuffle size={17} />{league ? 'Generar jornadas' : method === 'random' ? 'Realizar sorteo inicial' : 'Generar emparejamientos'}</button>
    </section>}
    {!reveal && t.fixture && <section className="form-stack">
      <div className="fixture-title"><div><h3>Fixture{live && <span className="live-tag"><span aria-hidden="true" />En vivo</span>}</h3><p className="muted small">{t.fixture.draw === 'random' ? 'Sorteo aleatorio' : t.fixture.draw === 'ranking' ? league ? 'Orden por ranking' : 'Cabezas de serie por ranking' : 'Armado manual'} · {matches.filter(m => m.complete && !m.bye && !m.unneeded).length}/{matches.filter(m => !m.bye && !m.unneeded).length} partidos disputados{live && ' · Los marcadores se actualizan solos'}</p>{!league && t.fixture.draw === 'random' && <button className="text-button" type="button" onClick={() => setReveal(true)}><Shuffle size={14} />Ver el sorteo otra vez</button>}</div>
        {canEdit && !finished && !started && <div className="modal-actions"><ConfirmButton disabled={busy} confirmLabel="Confirmar nuevo sorteo" onConfirm={() => generate('random')}>Volver a sortear</ConfirmButton><ConfirmButton disabled={busy} confirmLabel="Confirmar: quitar fixture" onConfirm={() => void save({ type: 'fixture.reset', tournamentId: t.id })}>Quitar fixture y editar inscripciones</ConfirmButton></div>}
      </div>
      {canEdit && !finished && !started && <p className="muted small">Un nuevo sorteo reemplaza los cruces y la programación. Después del primer resultado, el sorteo queda cerrado.</p>}
      {canEdit && !finished && t.date > localDate() && <p className="filter-note">Podés programar los partidos ahora y cargar resultados desde la fecha del torneo.</p>}
      <>{league ? <LeagueBoard tournament={t} state={state} canEdit={canEdit} busy={busy} submit={save} /> : <FixtureBoard tournament={t} state={state} canEdit={canEdit} busy={busy} submit={save} />}</>
      {!finished && !league && <p className="muted small">Los eliminados en la misma ronda comparten puesto y puntos. El ranking se actualiza al publicar el torneo completo.</p>}
      {canEdit && !finished && <button className="button primary" disabled={busy || !finalReady || t.date > localDate()} onClick={() => void save({ type: 'fixture.publish', tournamentId: t.id })}>Publicar resultados del torneo</button>}
    </section>}
    {finished && <section><h3>Clasificación final</h3><TournamentResults tournament={t} state={state} canEdit={canEdit} onReopen={onReopen} onShare={onShare} /></section>}
  </div>;
}
