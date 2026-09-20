-- Formato del torneo: sin valor es eliminación directa. En doble eliminación, `qualifiers` son los jugadores que pasan
-- a la fase final y `bracket` dice a qué llave pertenece cada partido (G ganadores, P perdedores, F fase final).
ALTER TABLE tournaments ADD COLUMN format TEXT;
ALTER TABLE tournaments ADD COLUMN qualifiers INTEGER;
ALTER TABLE matches ADD COLUMN bracket TEXT;
