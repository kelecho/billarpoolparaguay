import { createState, validateState, type State } from './domain';

export const STORAGE_KEY = 'pool-paraguay-state-v1';

export function loadState(): { state: State; error?: string } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return { state: saved ? validateState(JSON.parse(saved)) : createState() };
  } catch {
    return { state: createState(), error: 'No se pudieron leer los datos guardados. Exportá una copia de los datos originales antes de reemplazarlos.' };
  }
}

export function saveState(state: State) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(validateState(state)));
}

export function downloadJSON(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
