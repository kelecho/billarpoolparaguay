import { useId, useState, type ChangeEvent } from 'react';
import { prepareBanner } from '../photoUpload';

/** Carga, vista previa y quita del banner del evento. `onBusy` avisa mientras se prepara la imagen. */
export default function BannerField({ banner, onChange, onBusy }: { banner?: string; onChange: (banner?: string) => void; onBusy?: (busy: boolean) => void }) {
  const input = useId();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    onBusy?.(true);
    try { onChange(await prepareBanner(file)); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'No se pudo cargar el banner.'); }
    finally { setBusy(false); onBusy?.(false); }
  }
  return (
    <div className="banner-editor" aria-busy={busy}>
      {banner && <img className="banner-preview" src={banner} alt="Vista previa del banner" />}
      <div className="photo-editor-controls">
        <label className="field" htmlFor={input}><span>Banner del evento (opcional)</span></label>
        <input id={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} aria-describedby={`${input}-hint`} onChange={choose} />
        <p id={`${input}-hint`} className="muted small">JPG, PNG o WebP, hasta 8 MB. Se muestra completo, sin recortar: sirve un afiche vertical o una imagen apaisada.</p>
        {banner && <button className="text-button" type="button" disabled={busy} onClick={() => { onChange(undefined); setError(''); }}>Quitar banner</button>}
      </div>
      {error && <p className="photo-error" role="alert">{error}</p>}
    </div>
  );
}
