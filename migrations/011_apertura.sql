-- Apertura: fuera el DNI obligatorio, entra el nivel de confianza.
--
-- Antes, "una cuenta por persona" lo garantizaba el DNI. Al abrir la app fuera de la familia eso
-- deja de valer (barrera enorme para un desconocido, y solo sirve en España), así que la defensa
-- contra la cuenta-espía pasa a ser social: la señal de reserva solo se ve cuando la amistad tiene
-- unos días y hay amigos en común, o cuando un admin ha desbloqueado a esa persona.
--
-- SQLite no sabe quitar un NOT NULL / UNIQUE de una columna: hay que rehacer la tabla.

PRAGMA foreign_keys = OFF;

CREATE TABLE users_nuevo (
  id           TEXT PRIMARY KEY,
  username     TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio          TEXT NOT NULL DEFAULT '',
  avatar_seed  TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  dni_hash     TEXT,                          -- ya opcional; las cuentas viejas conservan el suyo
  phone_hash   TEXT,
  birthday     TEXT,
  created_at   INTEGER NOT NULL,
  is_active    INTEGER NOT NULL DEFAULT 1,
  is_admin     INTEGER NOT NULL DEFAULT 0,
  avatar_version INTEGER NOT NULL DEFAULT 0,
  has_avatar     INTEGER NOT NULL DEFAULT 0,
  onboarding_seen INTEGER NOT NULL DEFAULT 0,
  trust_level  INTEGER NOT NULL DEFAULT 0,    -- 0 normal, 1 verificada (ve las reservas sin espera)
  trust_source TEXT,                          -- 'admin' | 'phone' | 'dni'
  trusted_at   INTEGER
);

INSERT INTO users_nuevo (
  id, username, display_name, bio, avatar_seed, password_hash, dni_hash, phone_hash, birthday,
  created_at, is_active, is_admin, avatar_version, has_avatar, onboarding_seen,
  trust_level, trust_source, trusted_at
)
SELECT
  id, username, display_name, bio, avatar_seed, password_hash, dni_hash, phone_hash, birthday,
  created_at, is_active, is_admin, avatar_version, has_avatar, onboarding_seen,
  -- Todas las cuentas que existen hoy se crearon con DNI validado: son de fiar y no deben
  -- notar absolutamente nada del cambio.
  1, 'dni', created_at
FROM users;

DROP TABLE users;
ALTER TABLE users_nuevo RENAME TO users;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone_hash) WHERE phone_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_dni   ON users(dni_hash)   WHERE dni_hash   IS NOT NULL;

PRAGMA foreign_keys = ON;

-- Señales del registro, solo para que un admin detecte cuentas duplicadas. No bloquean nada y no
-- se le dicen nunca al usuario. La IP se guarda hasheada.
CREATE TABLE IF NOT EXISTS signup_signals (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ip_hash    TEXT,
  ua_hash    TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signals_ip ON signup_signals(ip_hash);

-- Enlaces de invitación: quien entra por uno sale con la amistad ya hecha.
CREATE TABLE IF NOT EXISTS invites (
  code       TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  uses       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invites_user ON invites(user_id);
