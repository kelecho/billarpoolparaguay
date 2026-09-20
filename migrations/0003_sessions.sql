-- Sesiones revocables: la cookie lleva un token al azar y acá se guarda solo su resumen.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
) WITHOUT ROWID;
