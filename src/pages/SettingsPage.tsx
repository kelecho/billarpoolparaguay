import { useEffect, useRef, useState } from 'react';
import { Download, LogOut, Upload } from 'lucide-react';
import AccountPanel from '../components/AccountPanel';
import RulesForm from '../components/RulesForm';
import UsersPanel from '../components/UsersPanel';
import { createState, validateState, type Rules, type State } from '../domain';
import { fetchAudit, type AuditEntry } from '../remote';
import type { Store } from '../useStore';

type Props = { store: Store; onSaveRules: (rules: Rules) => void; onExport: () => void; onReplace: (state: State) => void; onError: (e: unknown) => void; onLogout: (all: boolean) => void };

/** Los respaldos llevan fotos y banners adentro; al servidor viaja solo el registro con las referencias. */
const MAX_BACKUP_BYTES = 40 * 1024 * 1024;
const auditDate = (at: string) => new Intl.DateTimeFormat('es-PY', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(at));

/** Se vuelve a pedir cuando cambia el ranking o alguna cuenta. */
function AuditLog({ revision, accounts }: { revision: State; accounts: number }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  useEffect(() => { fetchAudit().then(setEntries, () => setEntries([])); }, [revision, accounts]);
  return (
    <section className="panel settings-panel">
      <h2>Registro de cambios</h2>
      {!entries ? <p className="muted">Cargando…</p> : !entries.length ? <p className="muted">Todavía no hay cambios registrados.</p> : (
        <ol className="audit-list">
          {entries.map((entry, i) => <li key={i}><time dateTime={entry.at}>{auditDate(entry.at)}</time><span>{entry.summary}{entry.reason && <small>Motivo: {entry.reason}</small>}{entry.actor && <small>{entry.actor}</small>}</span></li>)}
        </ol>
      )}
    </section>
  );
}

export default function SettingsPage({ store, onSaveRules, onExport, onReplace, onError, onLogout }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { state, user, isSuperadmin } = store;
  const [accountChanges, setAccountChanges] = useState(0);

  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('El respaldo supera el límite de 40 MB.');
      onReplace(validateState(JSON.parse(await file.text())));
    } catch (e) {
      onError(e);
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <section>
      <div className="section-heading">
        <div>
          <span className="eyebrow">TU ORGANIZACIÓN</span>
          <h1><em>Configuración</em><span className="heading-period" aria-hidden="true">.</span></h1>
        </div>
        {store.remote && <div className="session-actions">
          <button className="button" onClick={() => onLogout(false)}><LogOut size={16} />Cerrar sesión</button>
          <button className="text-button" onClick={() => onLogout(true)}>Cerrar en todos los dispositivos</button>
        </div>}
      </div>
      <div className="settings-layout">
        {isSuperadmin ? <RulesForm rules={state.rules} onSave={onSaveRules} /> : user && <AccountPanel user={user} />}
        <div className="form-stack">
          <section className="panel settings-panel">
            <h2>Respaldo de datos</h2>
            <p className="muted">{store.remote
              ? 'Los datos se guardan en el servidor y los ve todo el público. Exportá un respaldo periódicamente para conservar una copia propia.'
              : 'Tus datos se guardan en este navegador. Exportá un respaldo para conservarlos o llevarlos a otro dispositivo.'}</p>
            <button className="button" onClick={onExport}><Download size={17} />{store.storageBlocked ? 'Exportar datos originales' : 'Exportar respaldo'}</button>
            {isSuperadmin && <>
              <button className="button" onClick={() => fileInput.current?.click()}><Upload size={17} />Restaurar respaldo</button>
              <input className="sr-only" ref={fileInput} type="file" accept=".json,application/json" aria-label="Archivo de respaldo" onChange={e => void importBackup(e.target.files?.[0])} />
            </>}
          </section>
          {isSuperadmin && <section className="panel settings-panel">
            <h2>{state.demo ? 'Empezá tu ranking' : 'Nuevo registro'}</h2>
            <p className="muted">Comenzá sin jugadores ni torneos, con las reglas iniciales. Guardá un respaldo antes de reemplazar tus datos.</p>
            <button className="button" onClick={() => onReplace(createState(false))}>Empezar desde cero</button>
          </section>}
          {isSuperadmin && user && <UsersPanel me={user} onChange={() => setAccountChanges(n => n + 1)} />}
          {isSuperadmin && user && <AccountPanel user={user} />}
          {isSuperadmin && store.remote && <AuditLog revision={state} accounts={accountChanges} />}
        </div>
      </div>
    </section>
  );
}
