-- Migración: Agregar rol "soporte" (nivel 10)
-- Fecha: 2026-02-26
-- Descripción: Rol para Desarrollo que permite reabrir cajas, locales y des-auditar.
--              Todas las acciones quedan registradas en auditoría.

INSERT INTO roles (name, level, description)
VALUES ('soporte', 10, 'Soporte Desarrollo - reabrir cajas, locales, des-auditar')
ON DUPLICATE KEY UPDATE level=10, description=VALUES(description);
