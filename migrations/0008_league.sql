-- Liga todos contra todos y programación de partidos en varias fechas.
ALTER TABLE tournaments ADD COLUMN league_rounds INTEGER;
ALTER TABLE matches ADD COLUMN date TEXT;
