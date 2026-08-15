-- Reacciones a los regalos y pulso de la lista propia.
-- Bases creadas antes de esto necesitan este fichero: `CREATE TABLE IF NOT EXISTS` de schema.sql
-- crea las tablas nuevas sin problema, así que esto es idéntico y sirve por separado.

CREATE TABLE IF NOT EXISTS gift_reactions (
  gift_id    TEXT NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (gift_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reactions_gift ON gift_reactions(gift_id);

CREATE TABLE IF NOT EXISTS list_views (
  owner_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day       INTEGER NOT NULL,
  PRIMARY KEY (owner_id, viewer_id, day)
);
CREATE INDEX IF NOT EXISTS idx_views_owner ON list_views(owner_id, day);
