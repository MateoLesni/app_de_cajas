-- =====================================================
-- Migración: Rol gestion_ng (reportería de locales, nivel 8)
-- =====================================================
-- Rol cerrado (misma allowlist y pantalla que reporte_bk, /reporte-bk) que ve
-- TODOS los locales menos los excluidos en app.py (GESTION_NG_LOCALES_EXCLUIDOS:
-- Alma Esmeralda, Alma Cerrito, Tostado, Local_Test). Sin reporte Qantara.
-- Descargas: ventas por fecha, facturas por fecha y medios de cobro.

INSERT INTO roles (name, level)
VALUES ('gestion_ng', 8)
ON DUPLICATE KEY UPDATE level=8;

-- Usuario Juan Cruz (first_login=0 => la primera contraseña que ingrese queda fijada)
INSERT INTO users (id, username, password, role_id, local, society, status, created_at, first_login)
SELECT UUID(), 'Juan Cruz', '__PRIMER_LOGIN_PENDIENTE__', r.id, '', '', 'active', NOW(), 0
FROM roles r WHERE r.name = 'gestion_ng'
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = 'Juan Cruz');
