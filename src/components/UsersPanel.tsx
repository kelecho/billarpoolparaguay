import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import ConfirmButton from './ConfirmButton';
import Field from './Field';
import { createUser, deleteUser, fetchUsers, updateUser, type AccountInput } from '../remote';
import { MIN_PASSWORD_LENGTH, ROLE_LABELS, ROLES, type Role, type User } from '../roles';

function AccountForm({ account, own, busy, submit }: { account?: User; own: boolean; busy: boolean; submit: (input: Partial<AccountInput>) => void }) {
  function send(form: HTMLFormElement) {
    const data = new FormData(form);
    const password = String(data.get('password') ?? '');
    submit({
      name: String(data.get('name')), email: String(data.get('email')),
      ...(own ? {} : { role: String(data.get('role')) as Role, ...(account ? { active: data.get('active') === 'on' } : {}) }),
      ...(password ? { password } : {}),
    });
  }
  return (
    <form className="form-stack account-form" onSubmit={e => { e.preventDefault(); send(e.currentTarget); }}>
      <div className="form-grid">
        <Field label="Nombre y apellido"><input name="name" defaultValue={account?.name} required maxLength={150} autoFocus /></Field>
        <Field label="Correo"><input name="email" type="email" defaultValue={account?.email} required maxLength={150} autoComplete="off" /></Field>
      </div>
      {own ? <p className="muted small">Tu rol no se puede cambiar desde tu propia sesión. La contraseña se cambia en «Mi cuenta».</p> : <>
        <div className="form-grid">
          <Field label="Rol"><select name="role" defaultValue={account?.role ?? 'supervisor'}>{ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></Field>
          <Field label={account ? 'Contraseña nueva (opcional)' : 'Contraseña inicial'}><input name="password" type="password" autoComplete="new-password" required={!account} minLength={MIN_PASSWORD_LENGTH} maxLength={200} /></Field>
        </div>
        {account && <label className="check"><input name="active" type="checkbox" defaultChecked={account.active} /><span>Cuenta activa</span></label>}
      </>}
      <button className="button primary" type="submit" disabled={busy}>{account ? 'Guardar cuenta' : 'Crear cuenta'}</button>
    </form>
  );
}

/** Solo el superadministrador: alta, rol, contraseña, baja temporal y eliminación de cuentas. */
export default function UsersPanel({ me, onChange }: { me: User; onChange: () => void }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = () => fetchUsers().then(setUsers, e => { setUsers([]); setError(e instanceof Error ? e.message : 'No se pudieron cargar las cuentas.'); });
  useEffect(() => { void reload(); }, []);

  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    try {
      await task();
      setError('');
      setEditing(null);
      onChange();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la cuenta.');
    }
    setBusy(false);
  }

  return (
    <section className="panel settings-panel">
      <h2>Cuentas</h2>
      <p className="muted">El superadministrador define las reglas, restaura respaldos y administra las cuentas. Los supervisores cargan jugadores, torneos y resultados.</p>
      {error && <p role="alert" className="error">{error}</p>}
      {!users ? <p className="muted">Cargando…</p> : (
        <ul className="account-list">
          {users.map(user => (
            <li key={user.id}>
              <div className="account-row">
                <span><strong>{user.name}{user.id === me.id && ' (vos)'}</strong><small>{user.email}</small></span>
                <span className="tag">{ROLE_LABELS[user.role]}{!user.active && ' · inactiva'}</span>
                <button className="text-button" type="button" aria-expanded={editing === user.id} onClick={() => { setError(''); setEditing(editing === user.id ? null : user.id); }}>{editing === user.id ? 'Cancelar' : `Editar a ${user.name}`}</button>
              </div>
              {editing === user.id && <>
                <AccountForm account={user} own={user.id === me.id} busy={busy} submit={changes => void run(() => updateUser(user.id, changes))} />
                {user.id !== me.id && <ConfirmButton disabled={busy} confirmLabel={`Sí, eliminar a ${user.name}`} onConfirm={() => void run(() => deleteUser(user.id))}>Eliminar cuenta</ConfirmButton>}
              </>}
            </li>
          ))}
        </ul>
      )}
      {editing === 'new'
        ? <><AccountForm own={false} busy={busy} submit={account => void run(() => createUser(account as AccountInput))} /><button className="text-button" type="button" onClick={() => setEditing(null)}>Cancelar</button></>
        : <button className="button" type="button" onClick={() => { setError(''); setEditing('new'); }}><UserPlus size={17} />Agregar cuenta</button>}
    </section>
  );
}
