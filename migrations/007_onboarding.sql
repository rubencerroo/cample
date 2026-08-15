-- Guía de bienvenida: se guarda qué versión ha visto cada persona, para poder volver a
-- enseñarla si algún día cambia de forma importante.
ALTER TABLE users ADD COLUMN onboarding_seen INTEGER NOT NULL DEFAULT 0;
