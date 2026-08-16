-- Cample — esquema D1 (SQLite). Idempotente.

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  username     TEXT NOT NULL UNIQUE,          -- minúsculas, [a-z0-9._], 3-20
  display_name TEXT NOT NULL,
  bio          TEXT NOT NULL DEFAULT '',
  avatar_seed  TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,                -- pbkdf2$iter$salt$hash
  dni_hash     TEXT,                          -- opcional y heredado: HMAC-SHA256(DNI, DNI_PEPPER).
  phone_hash   TEXT,                          -- opcional, HMAC igual que el DNI. Solo para encontrarse.
  birthday     TEXT,                          -- MM-DD opcional
  created_at   INTEGER NOT NULL,
  is_active    INTEGER NOT NULL DEFAULT 1,
  is_admin     INTEGER NOT NULL DEFAULT 0,    -- puede aprobar reseteos de contraseña
  avatar_version INTEGER NOT NULL DEFAULT 0,  -- contador que SOLO sube: da una URL nueva a cada foto
  has_avatar     INTEGER NOT NULL DEFAULT 0,  -- si ahora mismo tiene foto puesta
  onboarding_seen INTEGER NOT NULL DEFAULT 0, -- versión de la guía de bienvenida ya vista
  trust_level  INTEGER NOT NULL DEFAULT 0,    -- 0 normal, 1 verificada (ve las reservas sin espera)
  trust_source TEXT,                          -- 'admin' | 'phone' | 'dni'
  trusted_at   INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone_hash) WHERE phone_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_dni   ON users(dni_hash)   WHERE dni_hash   IS NOT NULL;

-- Señales del registro, solo para que un admin detecte cuentas duplicadas. No bloquean nada.
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

-- Fotos de perfil aparte, para que las consultas de `users` no arrastren los bytes.
CREATE TABLE IF NOT EXISTS avatars (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mime       TEXT NOT NULL,
  data       BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Recuperación de contraseña sin email: la persona lo pide con su DNI, un admin lo aprueba
-- y le dicta el código por teléfono. El código solo se muestra una vez, al admin.
CREATE TABLE IF NOT EXISTS password_resets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | approved | used | rejected
  code_hash   TEXT,                            -- SHA-256(codigo + SESSION_PEPPER), solo si aprobado
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  approved_at INTEGER,
  expires_at  INTEGER,
  used_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id, status);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,                -- SHA-256 del token de la cookie
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Amistad simétrica: se guarda una fila por par ordenado (a < b) cuando está aceptada.
CREATE TABLE IF NOT EXISTS friendships (
  user_a     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_a, user_b)
);
CREATE INDEX IF NOT EXISTS idx_friend_b ON friendships(user_b);

CREATE TABLE IF NOT EXISTS friend_requests (
  from_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS idx_req_to ON friend_requests(to_id);

CREATE TABLE IF NOT EXISTS gifts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  notes       TEXT NOT NULL DEFAULT '',       -- descripción libre (talla, color, "cualquier modelo"…)
  url         TEXT,
  image_url   TEXT,
  price_cents INTEGER,                        -- opcional
  currency    TEXT NOT NULL DEFAULT 'EUR',
  priority    INTEGER NOT NULL DEFAULT 1,     -- 0 baja, 1 normal, 2 alta
  quantity    INTEGER NOT NULL DEFAULT 1,     -- nº de unidades reservables
  is_received INTEGER NOT NULL DEFAULT 0,     -- lo marca solo el dueño
  received_at INTEGER,
  is_archived INTEGER NOT NULL DEFAULT 0,
  visibility  TEXT NOT NULL DEFAULT 'all',   -- all | only (solo los de gift_audience) | except (todos menos ellos)
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gifts_user ON gifts(user_id, is_archived);

-- Personas señaladas de un regalo restringido. Según `gifts.visibility` son las únicas que lo ven
-- ('only') o las únicas que NO lo ven ('except'). Solo el dueño conoce los nombres.
CREATE TABLE IF NOT EXISTS gift_audience (
  gift_id TEXT NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (gift_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_audience_user ON gift_audience(user_id);

-- Reservas. El dueño de la lista NUNCA puede leer esta tabla (se filtra en la API).
CREATE TABLE IF NOT EXISTS reservations (
  id          TEXT PRIMARY KEY,
  gift_id     TEXT NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  reserver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  units       INTEGER NOT NULL DEFAULT 1,      -- cuántas unidades se lleva esa persona
  note        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  UNIQUE (gift_id, reserver_id)
);
CREATE INDEX IF NOT EXISTS idx_res_gift ON reservations(gift_id);
CREATE INDEX IF NOT EXISTS idx_res_user ON reservations(reserver_id);

-- Colectas: varias personas se juntan para un mismo regalo. Invisibles para el dueño de la lista.
CREATE TABLE IF NOT EXISTS gift_groups (
  id           TEXT PRIMARY KEY,
  gift_id      TEXT NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  organizer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'open',   -- open | bought | cancelled
  target_cents INTEGER,
  split_mode   TEXT NOT NULL DEFAULT 'equal',  -- equal | custom
  note         TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  closed_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_groups_gift ON gift_groups(gift_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_one_open ON gift_groups(gift_id)
  WHERE status IN ('open', 'bought');

CREATE TABLE IF NOT EXISTS group_members (
  group_id     TEXT NOT NULL REFERENCES gift_groups(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pledge_cents INTEGER,
  has_paid     INTEGER NOT NULL DEFAULT 0,
  joined_at    INTEGER NOT NULL,
  last_read_at INTEGER NOT NULL DEFAULT 0,   -- hasta dónde ha leído el chat
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

-- Reacciones a los regalos de un amigo («qué buena idea»). NO son reservas y el dueño SÍ las ve:
-- es la única señal alegre que recibe de vuelta quien se molesta en escribir su lista.
-- Una por persona y regalo, para que no se conviertan en un contador de nada.
CREATE TABLE IF NOT EXISTS gift_reactions (
  gift_id    TEXT NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (gift_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reactions_gift ON gift_reactions(gift_id);

-- Visitas a la lista de alguien, una fila por persona y día. Solo alimenta el «pulso» de
-- `GET /me/pulse`, que devuelve un RANGO, nunca un número ni quién ha entrado: saber que una
-- lista se está mirando anima a llenarla, saber quién la mira empezaría a destripar la sorpresa.
CREATE TABLE IF NOT EXISTS list_views (
  owner_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day       INTEGER NOT NULL,               -- días enteros desde epoch
  PRIMARY KEY (owner_id, viewer_id, day)
);
CREATE INDEX IF NOT EXISTS idx_views_owner ON list_views(owner_id, day);

-- Avisos para quien regala (p. ej. "el regalo que reservaste se ha borrado/editado").
-- Nunca se generan avisos que revelen reservas al dueño de la lista.
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                   -- friend_request | friend_accept | gift_changed | gift_deleted | gift_received
  body       TEXT NOT NULL,
  link       TEXT,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);

-- Fallos y sugerencias que manda la gente desde Ajustes. Solo los leen los administradores.
CREATE TABLE IF NOT EXISTS feedback (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL DEFAULT 'idea',   -- bug | idea
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new',    -- new | done
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at);

-- Control de intentos (login / registro) por IP+clave, ventana deslizante simple.
CREATE TABLE IF NOT EXISTS rate_limits (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL,
  reset_at   INTEGER NOT NULL
);
