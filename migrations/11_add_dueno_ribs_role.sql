-- =====================================================
-- Migración: Rol dueno_ribs para dashboard ejecutivo de Ribs Infanta
-- =====================================================
-- Rol cerrado (allowlist) que solo ve /dashboard-ribs.
-- Nivel 8 (libre, no colisiona con otros roles del sistema).
-- La restricción real de acceso se aplica en login_required por
-- session['role'] == 'dueno_ribs' (no por nivel).

INSERT INTO roles (name, level)
VALUES ('dueno_ribs', 8)
ON DUPLICATE KEY UPDATE level=8;

-- Los usuarios se crean después con el nombre elegido:
-- Ejemplos (correr manualmente, ajustando el UUID):
-- INSERT INTO users (id, username, password, role_id, local, society, status, created_at, first_login)
-- VALUES (
--   UUID(),
--   'Ribs',
--   '__PRIMER_LOGIN_PENDIENTE__',
--   (SELECT id FROM roles WHERE name = 'dueno_ribs' LIMIT 1),
--   'Ribs Infanta',
--   '',
--   'active',
--   NOW(),
--   0
-- );
