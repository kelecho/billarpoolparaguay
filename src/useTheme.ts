import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'pool-paraguay-theme';
const THEME_COLOR: Record<Theme, string> = { light: '#163d67', dark: '#091420' };
const system = (): Theme => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

/** Sigue la preferencia del sistema hasta que la persona elige un tema; desde entonces recuerda su elección. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = () => { try { if (!localStorage.getItem(KEY)) setTheme(system()); } catch { setTheme(system()); } };
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch { /* sin almacenamiento, el tema dura lo que la visita */ }
    setTheme(next);
  }
  return { theme, toggle };
}
