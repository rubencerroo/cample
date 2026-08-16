-- Cambiar el nombre de usuario, con las reglas de Instagram: como mucho 2 cambios cada 14 días, y
-- el nombre que sueltas queda reservado para ti otros 14 días por si te arrepientes.

CREATE TABLE IF NOT EXISTS username_history (
  old_username TEXT PRIMARY KEY,               -- el nombre soltado; único, es lo que lo reserva
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_username_history_user ON username_history(user_id, changed_at);
