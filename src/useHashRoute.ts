import { useCallback, useSyncExternalStore } from 'react';

export const PAGES = { '': 'Ranking', jugadores: 'Jugadores', torneos: 'Torneos', configuracion: 'Configuración' } as const;
export type Page = (typeof PAGES)[keyof typeof PAGES];
export type Route = { page: Page; playerId: string | null; tournamentId: string | null };

const subscribe = (notify: () => void) => {
  window.addEventListener('hashchange', notify);
  return () => window.removeEventListener('hashchange', notify);
};

export function pageHref(page: Page, params: { jugador?: string; torneo?: string } = {}) {
  const slug = Object.entries(PAGES).find(([, name]) => name === page)![0];
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString();
  return `#/${slug}${query ? `?${query}` : ''}`;
}

/** Rutas en el hash (`#/torneos?torneo=t3`): enlaces compartibles y botón atrás sin configurar el servidor. */
export function useHashRoute() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const route: Route = { page: PAGES[path as keyof typeof PAGES] ?? 'Ranking', playerId: params.get('jugador'), tournamentId: params.get('torneo') };
  const navigate = useCallback((href: string) => { window.location.hash = href; }, []);
  return { route, navigate };
}
