-- Una misma persona puede llevarse varias unidades del mismo regalo (p. ej. las 4 copas).
-- Antes, la clave única por (regalo, persona) obligaba a que fuesen 4 personas distintas.
ALTER TABLE reservations ADD COLUMN units INTEGER NOT NULL DEFAULT 1;
