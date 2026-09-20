import Field from './Field';

export default function LoginForm({ submit }: { submit: (email: string, password: string) => void }) {
  return (
    <form className="form-stack" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); submit(String(data.get('email')), String(data.get('password'))); }}>
      <p className="muted">El ranking es público. Solo las cuentas de la organización cargan jugadores, torneos y resultados.</p>
      <Field label="Correo"><input name="email" type="email" autoComplete="username" required autoFocus /></Field>
      <Field label="Contraseña"><input name="password" type="password" autoComplete="current-password" required /></Field>
      <button className="button primary" type="submit">Ingresar</button>
    </form>
  );
}
