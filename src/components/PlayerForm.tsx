import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import type { Action, Player } from '../domain';
import ConfirmButton from './ConfirmButton';
import Field from './Field';

export default function PlayerForm({ player, submit }: { player?: Player; submit: (action: Action) => void }) {
  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    submit({
      type: 'player.save',
      player: {
        id: player?.id ?? crypto.randomUUID(),
        name: String(data.get('name')).trim(),
        city: String(data.get('city')).trim(),
        club: String(data.get('club')).trim(),
        initialPoints: Number(data.get('initialPoints')),
      },
    });
  }
  return (
    <form onSubmit={save} className="form-stack">
      <Field label="Nombre y apellido"><input name="name" defaultValue={player?.name} required maxLength={150} autoFocus /></Field>
      <div className="form-grid">
        <Field label="Ciudad"><input name="city" defaultValue={player?.city} required maxLength={150} /></Field>
        <Field label="Club (opcional)"><input name="club" defaultValue={player?.club} maxLength={150} /></Field>
      </div>
      <Field label="Puntos iniciales"><input name="initialPoints" type="number" min="0" max="1000000" step="1" defaultValue={player?.initialPoints ?? 0} required /></Field>
      <p className="muted small">Los puntos de los torneos se suman automáticamente a este valor.</p>
      <button className="button primary" type="submit">Guardar jugador</button>
      {player && <ConfirmButton confirmLabel="Confirmar: eliminar jugador" onConfirm={() => submit({ type: 'player.remove', playerId: player.id })}><Trash2 size={15} />Eliminar jugador</ConfirmButton>}
    </form>
  );
}
