-- Regalos con visibilidad restringida. Solo hace falta en bases ya creadas antes de esta función:
-- `schema.sql` ya trae la columna, pero CREATE TABLE IF NOT EXISTS no la añade a una tabla existente.
-- Ejecutar UNA sola vez (dará error «duplicate column name» si ya está puesta, es inofensivo):
--   npx wrangler d1 execute cample-db --remote -y --file migrations/001_gift_visibility.sql

ALTER TABLE gifts ADD COLUMN visibility TEXT NOT NULL DEFAULT 'all';

CREATE TABLE IF NOT EXISTS gift_audience (
  gift_id TEXT NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (gift_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_audience_user ON gift_audience(user_id);
