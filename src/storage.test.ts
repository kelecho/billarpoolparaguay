import { afterEach, describe, expect, it, vi } from 'vitest';
import { createState } from './domain';
import { loadState, saveState, STORAGE_KEY } from './storage';

afterEach(() => vi.unstubAllGlobals());

describe('Persistencia local', () => {
  it('inicia con datos de ejemplo sin sobrescribir el almacenamiento', () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    expect(loadState().state.demo).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('recupera exactamente el registro guardado', () => {
    const state = createState(false);
    let saved = '';
    vi.stubGlobal('localStorage', { getItem: () => saved, setItem: (key: string, value: string) => { expect(key).toBe(STORAGE_KEY); saved = value; } });
    saveState(state);
    expect(loadState()).toEqual({ state });
  });
  it('reporta datos corruptos sin reemplazarlos', () => {
    const storage = { getItem: () => '{broken', setItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    expect(loadState().error).toBeTruthy();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('propaga fallos al guardar para impedir un mensaje de éxito falso', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new DOMException('Sin espacio', 'QuotaExceededError'); } });
    expect(() => saveState(createState(false))).toThrow('Sin espacio');
  });
});
