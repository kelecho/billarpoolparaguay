import { useCallback, useEffect, useRef, useState } from 'react';
import { applyAction, createState, type Action, type State } from './domain';
import { loadState, saveState, STORAGE_KEY } from './storage';
import * as remote from './remote';
import type { User } from './roles';

export type Store = {
  state: State;
  status: 'loading' | 'ready';
  /** Hay servidor compartido; si es falso, los datos viven en este navegador. */
  remote: boolean;
  /** Cuenta con sesión abierta en modo remoto. */
  user: User | null;
  /** Puede crear y corregir datos: siempre en modo local, solo con sesión en modo remoto. */
  canEdit: boolean;
  /** Puede cambiar reglas, reemplazar datos y administrar cuentas. */
  isSuperadmin: boolean;
  /** Modo remoto sin respuesta del servidor: se muestra la última copia guardada. */
  offlineSince: string | null;
  /** El almacenamiento local es ilegible; se bloquean los cambios para no pisarlo. */
  storageBlocked: boolean;
  loadError: string;
  dispatch: (action: Action) => Promise<void>;
  replace: (state: State) => Promise<void>;
  /** Vuelve a pedir datos y sesión al servidor. */
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  /** Con `all` cierra también las sesiones de otros dispositivos. */
  logout: (all?: boolean) => Promise<void>;
  /** Contenido para el respaldo, con las fotos incluidas; en modo local bloqueado devuelve el texto original sin tocar. */
  exportContent: () => Promise<string>;
};

export function useStore(): Store {
  const [loaded] = useState(() => remote.REMOTE ? null : loadState());
  const [cached] = useState(() => remote.REMOTE ? remote.cachedSnapshot() : null);
  const [state, setState] = useState<State>(() => loaded?.state ?? cached?.state ?? createState(false));
  const [status, setStatus] = useState<Store['status']>(remote.REMOTE && !cached ? 'loading' : 'ready');
  const [user, setUser] = useState<User | null>(null);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [storageBlocked, setStorageBlocked] = useState(Boolean(loaded?.error));
  const [loadError, setLoadError] = useState(loaded?.error ?? '');
  const current = useRef<remote.Snapshot | null>(cached);

  const adopt = useCallback((snapshot: remote.Snapshot) => {
    // La misma etiqueta es el mismo registro: no se vuelve a dibujar la página en cada consulta.
    if (snapshot.tag !== current.current?.tag || !snapshot.tag) setState(snapshot.state);
    current.current = snapshot;
    setOfflineSince(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await remote.fetchSnapshot(current.current);
      adopt(snapshot);
      setUser(snapshot.user);
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
    state, status, offlineSince, storageBlocked, loadError, user, refresh,
    remote: remote.REMOTE,
    canEdit: remote.REMOTE ? Boolean(user) && !user?.mustChangePassword && !offlineSince : true,
    isSuperadmin: remote.REMOTE ? user?.role === 'superadmin' && !offlineSince : true,
    dispatch: async action => remote.REMOTE ? write(() => remote.sendAction(action, current.current?.version ?? 0)) : commitLocal(applyAction(state, action)),
    replace: async next => remote.REMOTE ? write(() => remote.replaceState(next, current.current?.version ?? 0)) : commitLocal(next, true),
    login: async (email, password) => { await remote.login(email, password); await refresh(); },
    logout: async all => { await remote.logout(all); setUser(null); },
    exportContent: async () => storageBlocked ? localStorage.getItem(STORAGE_KEY) ?? '' : JSON.stringify(remote.REMOTE ? await remote.exportState(state) : state, null, 2),
  };
}
