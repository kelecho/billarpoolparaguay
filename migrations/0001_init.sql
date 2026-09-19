-- Todo el registro vive en una fila: es chico, se valida entero y se versiona para detectar ediciones simultáneas.
CREATE TABLE ranking (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  reason TEXT
);

CREATE TABLE login_attempts (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX login_attempts_ip ON login_attempts (ip, at);
