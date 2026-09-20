import { useState } from 'react';
import Field from './Field';
import { changePassword } from '../remote';
import { MIN_PASSWORD_LENGTH, ROLE_LABELS, type User } from '../roles';

/** Cada persona cambia su propia contraseña; el servidor cierra sus sesiones en otros dispositivos. */
export function PasswordForm({ currentLabel = 'Contraseña actual', onDone }: { currentLabel?: string; onDone?: () => void }) {
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form);
    setDone(false);
    if (data.get('next') !== data.get('repeat')) return setError('Las contraseñas nuevas no coinciden.');
    setBusy(true);
    try {
      await changePassword(String(data.get('current')), String(data.get('next')));
      form.reset();
      setError('');
      setDone(true);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña.');
    }
    setBusy(false);
  }

  return (
    <form className="form-stack" onSubmit={e => { e.preventDefault(); void submit(e.currentTarget); }}>
      <Field label={currentLabel}><input name="current" type="password" autoComplete="current-password" required /></Field>
      <Field label="Contraseña nueva"><input name="next" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={200} /></Field>
      <Field label="Repetir contraseña nueva"><input name="repeat" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} maxLength={200} /></Field>
      {error && <p role="alert" className="error">{error}</p>}
      {done && <p role="status" className="muted">Contraseña cambiada. Cerramos tus sesiones en otros dispositivos.</p>}
      <button className="button primary" type="submit" disabled={busy}>Cambiar contraseña</button>
    </form>
  );
}

export default function AccountPanel({ user }: { user: User }) {
  return (
    <section className="panel settings-panel">
      <h2>Mi cuenta</h2>
      <p className="muted">{user.name} · {user.email} · {ROLE_LABELS[user.role]}</p>
      <PasswordForm />
    </section>
  );
}
