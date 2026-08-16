-- Avisos al móvil (Web Push). Para bases creadas antes de esto: `CREATE TABLE IF NOT EXISTS` no
-- añade columnas a una tabla que ya existe, así que las columnas nuevas van a mano.
-- Las tablas nuevas salen igualmente de `schema.sql`; aquí están por si se aplica esto suelto.

ALTER TABLE users ADD COLUMN push_lang TEXT;
ALTER TABLE users ADD COLUMN push_last_at INTEGER NOT NULL DEFAULT 0;

ALTER TABLE notifications ADD COLUMN push_state INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN push_body TEXT;

CREATE INDEX IF NOT EXISTS idx_notif_push ON notifications(user_id, push_state);

CREATE TABLE IF NOT EXISTS push_subs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subs(user_id);

CREATE TABLE IF NOT EXISTS push_sent (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
