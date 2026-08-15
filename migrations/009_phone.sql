-- Teléfono opcional, solo para que la gente se encuentre. Nunca en claro: HMAC con DNI_PEPPER.
-- El DNI sigue siendo lo que garantiza una cuenta por persona; el teléfono no sustituye a nada.
ALTER TABLE users ADD COLUMN phone_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone_hash) WHERE phone_hash IS NOT NULL;
