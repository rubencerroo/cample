-- Marca de lectura del chat de cada colecta, para los avisos de las pestañas.
ALTER TABLE group_members ADD COLUMN last_read_at INTEGER NOT NULL DEFAULT 0;
