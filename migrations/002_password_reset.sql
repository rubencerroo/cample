-- Aplicar una sola vez sobre una base creada con la versión inicial del esquema.
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS password_resets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending',
  code_hash   TEXT,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  approved_at INTEGER,
  expires_at  INTEGER,
  used_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id, status);
