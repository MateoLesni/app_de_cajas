-- =====================================================
-- Migración: Rol reporte_bk para reporte de acreditación Qantara (terminales BK)
-- =====================================================
-- Rol cerrado (allowlist) que solo ve /reporte-bk. Nivel 8.
-- Descarga Excel crudo de tarjetas_trns y genera el reporte de acreditación
-- Qantara por local que tenga movimiento en terminales BK.

INSERT INTO roles (name, level)
VALUES ('reporte_bk', 8)
ON DUPLICATE KEY UPDATE level=8;

-- Usuario Luis (correr manualmente ajustando lo que haga falta):
-- INSERT INTO users (id, username, password, role_id, local, society, status, created_at, first_login)
-- VALUES (
--   UUID(), 'Luis', '__PRIMER_LOGIN_PENDIENTE__',
--   (SELECT id FROM roles WHERE name = 'reporte_bk' LIMIT 1),
--   '', '', 'active', NOW(), 0
-- );
