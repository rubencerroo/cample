-- Regalos en grupo (colectas). Aplicar una sola vez.

CREATE TABLE IF NOT EXISTS gift_groups (
  id           TEXT PRIMARY KEY,
  gift_id      TEXT NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  organizer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'open',   -- open | bought | cancelled
  target_cents INTEGER,                        -- objetivo a repartir
  split_mode   TEXT NOT NULL DEFAULT 'equal',  -- equal | custom
  note         TEXT NOT NULL DEFAULT '',       -- qué se compra exactamente
  created_at   INTEGER NOT NULL,
  closed_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_groups_gift ON gift_groups(gift_id, status);
-- Como mucho una colecta viva por regalo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_one_open ON gift_groups(gift_id)
  WHERE status IN ('open', 'bought');

CREATE TABLE IF NOT EXISTS group_members (
  group_id     TEXT NOT NULL REFERENCES gift_groups(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pledge_cents INTEGER,                        -- solo en split_mode = custom
  has_paid     INTEGER NOT NULL DEFAULT 0,
  joined_at    INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON group_members(user_id);

CREATE TABLE IF NOT EXISTS group_messages (
  id         TEXT PRIMARY KEY,
  group_id   TEXT NOT NULL REFERENCES gift_groups(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_group ON group_messages(group_id, created_at);
