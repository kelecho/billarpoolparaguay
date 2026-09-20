-- Cada entidad tiene su tabla: ninguna fila crece con el ranking y cada guardado escribe solo lo que cambió.
-- Las fotos viven en R2; `players.photo` guarda la referencia (/api/photos/<sha256>.jpg).
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  club TEXT NOT NULL,
  initial_points INTEGER NOT NULL,
  category TEXT,
  photo TEXT
);

-- El torneo tiene fixture cuando existen partidos; `draw` recuerda cómo se sorteó.
CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  venue TEXT NOT NULL,
  discipline TEXT NOT NULL,
  category TEXT,
  race_to INTEGER,
  draw TEXT
);

-- `seed` es el lugar del inscripto en la llave; los lugares sin inscripto son pases libres.
CREATE TABLE registrations (
  tournament_id TEXT NOT NULL REFERENCES tournaments (id),
  player_id TEXT NOT NULL REFERENCES players (id),
  position INTEGER NOT NULL,
  seed INTEGER,
  PRIMARY KEY (tournament_id, player_id)
) WITHOUT ROWID;
CREATE INDEX registrations_player ON registrations (player_id);

CREATE TABLE matches (
  tournament_id TEXT NOT NULL REFERENCES tournaments (id),
  id TEXT NOT NULL,
  round INTEGER NOT NULL,
  idx INTEGER NOT NULL,
  score_a INTEGER,
  score_b INTEGER,
  table_name TEXT,
  time TEXT,
  PRIMARY KEY (tournament_id, id)
) WITHOUT ROWID;

CREATE TABLE results (
  tournament_id TEXT NOT NULL REFERENCES tournaments (id),
  player_id TEXT NOT NULL REFERENCES players (id),
  position INTEGER NOT NULL,
  place INTEGER NOT NULL,
  points INTEGER NOT NULL,
  PRIMARY KEY (tournament_id, player_id)
) WITHOUT ROWID;
CREATE INDEX results_player ON results (player_id);

-- Reparte en las tablas el documento que vivía en `ranking.state`.
INSERT INTO players (id, name, city, club, initial_points, category)
SELECT p.value->>'id', p.value->>'name', p.value->>'city', p.value->>'club', p.value->>'initialPoints', p.value->>'category'
FROM ranking, json_each(ranking.state, '$.players') AS p ORDER BY p.key;

INSERT INTO tournaments (id, name, date, venue, discipline, category, race_to, draw)
SELECT t.value->>'id', t.value->>'name', t.value->>'date', t.value->>'venue', t.value->>'discipline', t.value->>'category', t.value->>'raceTo', t.value->>'$.fixture.draw'
FROM ranking, json_each(ranking.state, '$.tournaments') AS t ORDER BY t.key;

INSERT INTO registrations (tournament_id, player_id, position, seed)
SELECT t.value->>'id', r.value, r.key, (SELECT s.key FROM json_each(t.value, '$.fixture.seeds') AS s WHERE s.value = r.value)
FROM ranking, json_each(ranking.state, '$.tournaments') AS t, json_each(t.value, '$.registered') AS r;

INSERT INTO matches (tournament_id, id, round, idx, score_a, score_b, table_name, time)
SELECT t.value->>'id', m.value->>'id', m.value->>'round', m.value->>'index', m.value->>'scoreA', m.value->>'scoreB', m.value->>'table', m.value->>'time'
FROM ranking, json_each(ranking.state, '$.tournaments') AS t, json_each(t.value, '$.fixture.matches') AS m;

INSERT INTO results (tournament_id, player_id, position, place, points)
SELECT t.value->>'id', r.value->>'playerId', r.key, r.value->>'place', r.value->>'points'
FROM ranking, json_each(ranking.state, '$.tournaments') AS t, json_each(t.value, '$.results') AS r;

-- `ranking` conserva la versión global y las reglas. La fila existe siempre: la versión 0 es el registro vacío.
ALTER TABLE ranking ADD COLUMN rules TEXT NOT NULL DEFAULT '';
UPDATE ranking SET rules = json_extract(state, '$.rules');
ALTER TABLE ranking DROP COLUMN state;
INSERT OR IGNORE INTO ranking (id, version, rules, updated_at) VALUES (1, 0, '', '');
