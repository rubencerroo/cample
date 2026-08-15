-- Buzón de fallos y sugerencias. Ejecutar una vez en bases ya creadas:
--   npx wrangler d1 execute cample-db --remote -y --file migrations/002_feedback.sql

CREATE TABLE IF NOT EXISTS feedback (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL DEFAULT 'idea',
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at);
