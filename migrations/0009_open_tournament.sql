-- Torneos abiertos: se inscribe a cualquier jugador, sin filtro de categoría.
ALTER TABLE tournaments ADD COLUMN open INTEGER;
