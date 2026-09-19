import Field from './Field';

export default function LoginForm({ submit }: { submit: (password: string) => void }) {
  return (
    <form className="form-stack" onSubmit={e => { e.preventDefault(); submit(String(new FormData(e.currentTarget).get('password'))); }}>
      <p className="muted">El ranking es público. Solo los administradores cargan jugadores, torneos y resultados.</p>
      <Field label="Contraseña de administrador"><input name="password" type="password" autoComplete="current-password" required autoFocus /></Field>
      <button className="button primary" type="submit">Ingresar</button>
    </form>
  );
}
