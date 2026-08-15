-- Fotos de perfil. Van en su propia tabla para que ninguna consulta normal de `users`
-- arrastre los bytes de la imagen. Se guardan ya recortadas a 256x256 JPEG (~20 KB).
CREATE TABLE IF NOT EXISTS avatars (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mime       TEXT NOT NULL,
  data       BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Sube al cambiar la foto; sirve para cachear la imagen para siempre en el navegador.
ALTER TABLE users ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0;
