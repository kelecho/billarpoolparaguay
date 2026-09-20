-- Cuentas individuales con rol. La contraseña se guarda derivada con PBKDF2 y una sal propia.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'supervisor')),
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  -- La contraseña la eligió otra persona: hay que cambiarla antes de hacer cualquier otra cosa.
  must_change INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Cada sesión pertenece a una cuenta. Las anteriores dependían de la contraseña compartida y dejan de valer.
DROP TABLE sessions;
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX sessions_user ON sessions (user_id);

-- Quién hizo cada cambio. Se guarda el correo como texto para que el registro sobreviva a la cuenta.
ALTER TABLE audit ADD COLUMN actor TEXT;
