import { useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import type { Action, Player, State } from '../domain';
import ConfirmButton from './ConfirmButton';
import Field from './Field';
import Avatar from './Avatar';
import { preparePlayerPhoto } from '../photoUpload';

export default function PlayerForm({ player, state, submit, defaultCategory }: { defaultCategory?: string; player?: Player; state: State; submit: (action: Action) => void }) {
  const photoInput = useId();
  const [photo, setPhoto] = useState(player?.photo);
  const [name, setName] = useState(player?.name ?? '');
  const [processing, setProcessing] = useState(false);
  const [photoError, setPhotoError] = useState('');
  async function choosePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    setPhotoError('');
    setProcessing(true);
    try { setPhoto(await preparePlayerPhoto(file)); }
    catch (error) { setPhotoError(error instanceof Error ? error.message : 'No se pudo cargar la foto.'); }
    finally { setProcessing(false); }
  }
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (processing) return;
    const data = new FormData(e.currentTarget);
    submit({
      type: 'player.save',
      player: {
        id: player?.id ?? crypto.randomUUID(),
        name: String(data.get('name')).trim(),
        city: String(data.get('city')).trim(),
        club: String(data.get('club')).trim(),
        category: String(data.get('category') ?? player?.category ?? defaultCategory ?? state.rules.categories.at(-1)!.name),
        initialPoints: Number(data.get('initialPoints')),
        ...(photo ? { photo } : {}),
      },
    });
  }
  return (
    <form onSubmit={save} className="form-stack">
      <div className="photo-editor" aria-busy={processing}>
        <Avatar name={name} photo={photo} />
        <div className="photo-editor-controls">
          <label className="field" htmlFor={photoInput}><span>Foto del jugador (opcional)</span></label>
          <input id={photoInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={processing} aria-describedby={`${photoInput}-hint`} onChange={choosePhoto} />
          <p id={`${photoInput}-hint`} className="muted small">JPG, PNG o WebP, hasta 8 MB. Se recorta al centro en formato cuadrado.</p>
          {photo && <button className="text-button" type="button" disabled={processing} onClick={() => { setPhoto(undefined); setPhotoError(''); }}>Quitar foto</button>}
          {processing && <p className="small" role="status">Preparando foto…</p>}
        </div>
      </div>
      {photoError && <p className="photo-error" role="alert">{photoError}</p>}
      <Field label="Nombre y apellido"><input name="name" value={name} onChange={e => setName(e.target.value)} required maxLength={150} autoFocus /></Field>
      <div className="form-grid">
        <Field label="Ciudad"><input name="city" defaultValue={player?.city} required maxLength={150} /></Field>
        <Field label="Club (opcional)"><input name="club" defaultValue={player?.club} maxLength={150} /></Field>
      </div>
      <Field label="Categoría del jugador"><select name="category" defaultValue={player?.category ?? defaultCategory ?? state.rules.categories.at(-1)!.name} disabled={Boolean(player && state.tournaments.some(t => t.registered?.includes(player.id) || t.results.some(r => r.playerId === player.id)))}>{state.rules.categories.map(c => <option key={c.name}>{c.name}</option>)}</select></Field>
      <p className="muted small">La categoría queda asignada al jugador. Los ascensos se definirán más adelante.</p>
      <Field label="Puntos iniciales"><input name="initialPoints" type="number" min="0" max="1000000" step="1" defaultValue={player?.initialPoints ?? 0} required /></Field>
      <p className="muted small">Los puntos de los torneos se suman automáticamente a este valor.</p>
      <button className="button primary" type="submit" disabled={processing}>Guardar jugador</button>
      {player && <ConfirmButton confirmLabel="Confirmar: eliminar jugador" onConfirm={() => submit({ type: 'player.remove', playerId: player.id })}><Trash2 size={15} />Eliminar jugador</ConfirmButton>}
    </form>
  );
}
