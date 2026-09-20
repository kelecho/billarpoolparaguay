-- Opciones de la definición del torneo: partido por el tercer puesto y revancha de la gran final.
ALTER TABLE tournaments ADD COLUMN third_place INTEGER;
ALTER TABLE tournaments ADD COLUMN final_rematch INTEGER;
