-- `avatar_version` pasa a ser un contador que solo sube, para que cada foto tenga una dirección
-- distinta. Antes, al quitar la foto se ponía a 0 y la siguiente volvía a ser ?v=1: el navegador
-- servía de su caché la foto anterior. Tener foto o no se guarda ahora aparte.
ALTER TABLE users ADD COLUMN has_avatar INTEGER NOT NULL DEFAULT 0;

UPDATE users SET has_avatar = 1 WHERE id IN (SELECT user_id FROM avatars);
