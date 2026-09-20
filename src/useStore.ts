import { useCallback, useEffect, useRef, useState } from 'react';
import { applyAction, createState, type Action, type State } from './domain';
import { loadState, saveState, STORAGE_KEY } from './storage';
import * as remote from './remote';

export type Store = {
  state: State;
  status: 'loading' | 'ready';
  /** Hay servidor compartido; si es falso, los datos viven en este navegador. */
  remote: boolean;
  /** Puede crear y corregir datos: siempre en modo local, solo el administrador en modo remoto. */
  canEdit: boolean;
  /** Modo remoto sin respuesta del servidor: se muestra la última copia guardada. */
  offlineSince: string | null;
  /** El almacenamiento local es ilegible; se bloquean los cambios para no pisarlo. */
  storageBlocked: boolean;
  loadError: string;
  dispatch: (action: Action) => Promise<void>;
  replace: (state: State) => Promise<void>;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Contenido para el respaldo, con las fotos incluidas; en modo local bloqueado devuelve el texto original sin tocar. */
  exportContent: () => Promise<string>;
};

export function useStore(): Store {
  const [loaded] = useState(() => remote.REMOTE ? null : loadState());
  const [cached] = useState(() => remote.REMOTE ? remote.cachedSnapshot() : null);
  const [state, setState] = useState<State>(() => loaded?.state ?? cached?.state ?? createState(false));
  const [status, setStatus] = useState<Store['status']>(remote.REMOTE && !cached ? 'loading' : 'ready');
  const [admin, setAdmin] = useState(false);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [storageBlocked, setStorageBlocked] = useState(Boolean(loaded?.error));
  const [loadError, setLoadError] = useState(loaded?.error ?? '');
  const version = useRef(cached?.version ?? 0);

  const adopt = useCallback((snapshot: remote.Snapshot) => {
    version.current = snapshot.version;
    setState(snapshot.state);
    setOfflineSince(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await remote.fetchSnapshot();
      adopt(snapshot);
      setAdmin(snapshot.admin);
      setLoadError('');
    } catch (e) {
      const copy = remote.cachedSnapshot();
      if (copy) setOfflineSince(copy.savedAt);
      else setLoadError(e instanceof Error ? e.message : 'No se pudo cargar el ranking.');
    }
    setStatus('ready');
  }, [adopt]);

  useEffect(() => {
    if (!remote.REMOTE) return;
    void refresh();
    // Quien deja la pestaña abierta ve los resultados nuevos al volver.
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onVisible); };
  }, [refresh]);

  async function write(send: () => Promise<remote.Snapshot>) {
    try {
      adopt(await send());
    } catch (e) {
      if (e instanceof remote.ConflictError) adopt(e.snapshot);
      throw e;
    }
  }

  function commitLocal(next: State, replacement = false) {
    if (storageBlocked && !replacement) throw new Error('Primero exportá los datos originales y restaurá un respaldo desde Configuración.');
    saveState(next);
    setState(next);
    setStorageBlocked(false);
    setLoadError('');
  }

  return {
    state, status, offlineSince, storageBlocked, loadError,
    remote: remote.REMOTE,
    canEdit: remote.REMOTE ? admin && !offlineSince : true,
    dispatch: async action => remote.REMOTE ? write(() => remote.sendAction(action, version.current)) : commitLocal(applyAction(state, action)),
    replace: async next => remote.REMOTE ? write(() => remote.replaceState(next, version.current)) : commitLocal(next, true),
    login: async password => { await remote.login(password); await refresh(); },
    logout: async () => { await remote.logout(); setAdmin(false); },
    exportContent: async () => storageBlocked ? localStorage.getItem(STORAGE_KEY) ?? '' : JSON.stringify(remote.REMOTE ? await remote.exportState(state) : state, null, 2),
  };
}
