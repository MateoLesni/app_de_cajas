-- =====================================================
-- Migración: Rol reporte_fabric para el gerente de Fabric Sushi
-- =====================================================
-- Rol cerrado (allowlist) que SOLO ve /reporte-fabric. Nivel 8.
-- Muestra la venta de Fabric Sushi por dia/semana/mes y permite descargar un
-- Excel con Ventas, Medios de cobro y Gastos del local. El local se fuerza a
-- 'Fabric Sushi' en el backend (no depende de parametros del usuario), asi que
-- este rol NUNCA puede ver otro local.

INSERT INTO roles (name, level)
VALUES ('reporte_fabric', 8)
ON DUPLICATE KEY UPDATE level=8;

-- Usuarios. first_login=0 => el primer ingreso acepta cualquier password y la
-- fija como definitiva (patron del proyecto). El campo local queda en
-- 'Fabric Sushi' por prolijidad, aunque el backend igual lo fuerza.
INSERT INTO users (id, username, password, role_id, local, society, status, created_at, first_login)
VALUES (
  UUID(), 'johan reporte', '__PRIMER_LOGIN_PENDIENTE__',
  (SELECT id FROM roles WHERE name = 'reporte_fabric' LIMIT 1),
  'Fabric Sushi', '', 'active', NOW(), 0
);

INSERT INTO users (id, username, password, role_id, local, society, status, created_at, first_login)
VALUES (
  UUID(), 'Test Fabric Reporte', '__PRIMER_LOGIN_PENDIENTE__',
  (SELECT id FROM roles WHERE name = 'reporte_fabric' LIMIT 1),
  'Fabric Sushi', '', 'active', NOW(), 0
);
