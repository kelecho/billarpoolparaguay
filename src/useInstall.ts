import { useCallback, useEffect, useState } from 'react';

export type Platform = 'ios' | 'android' | 'desktop';
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
const DISMISSED_KEY = 'pool-paraguay-install-dismissed';

function detectPlatform(): Platform {
  const agent = navigator.userAgent;
  // El iPad se presenta como Mac; se lo reconoce por la pantalla táctil.
  if (/iphone|ipad|ipod/i.test(agent) || (/macintosh/i.test(agent) && navigator.maxTouchPoints > 1)) return 'ios';
  return /android/i.test(agent) ? 'android' : 'desktop';
}

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/**
 * Android y las computadoras avisan cuando la app se puede instalar y dejan abrir el diálogo desde un botón;
 * iPhone no avisa nunca, así que ahí solo se puede guiar a la persona paso a paso.
 */
export function useInstall() {
  const [platform] = useState(detectPlatform);
  const [installed, setInstalled] = useState(standalone);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; } });

  useEffect(() => {
    const available = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const done = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', available); window.removeEventListener('appinstalled', done); };
  }, []);

  /** Abre el diálogo del navegador. Devuelve si la persona aceptó; solo se puede usar una vez por aviso. */
  const install = useCallback(async () => {
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setPrompt(null);
    return outcome === 'accepted';
  }, [prompt]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* sin almacenamiento, se oculta solo por esta visita */ }
  }, []);

  return {
    platform, installed, install, dismiss,
    /** El navegador ofrece instalar con un toque. */
    canPrompt: Boolean(prompt),
    /** En el celular, a quien no la instaló ni cerró el aviso, se le ofrece arriba de todo. */
    suggest: !installed && !dismissed && platform !== 'desktop',
  };
}
