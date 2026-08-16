-- Foto propia del regalo, subida desde la galería, para lo que no viene de una tienda.
-- Los bytes van en su propia tabla, como los avatares: así ninguna consulta normal los arrastra.

ALTER TABLE gifts ADD COLUMN image_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gifts ADD COLUMN has_image INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS gift_images (
  gift_id    TEXT PRIMARY KEY REFERENCES gifts(id) ON DELETE CASCADE,
  mime       TEXT NOT NULL,
  data       BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);
