-- Migración: Crear tabla user_locales para asignar múltiples locales a usuarios
-- Propósito: Permitir que Encargados (y otros roles) puedan tener acceso a múltiples locales
-- Fecha: 2026-02-03
-- Versión 3: Con collation compatible con tabla users (utf8mb4_0900_ai_ci)

-- 1. Verificar si la tabla ya existe
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'user_locales';

-- 2. Eliminar tabla si existe (para re-crear limpiamente)
DROP TABLE IF EXISTS user_locales;

-- 3. Crear la tabla user_locales
-- IMPORTANTE: Usar utf8mb4_0900_ai_ci (misma collation que users)
CREATE TABLE user_locales (
    id INT AUTO_INCREMENT PRIMARY KEY,

    -- Relación con users
    user_id VARCHAR(255) NOT NULL COMMENT 'ID del usuario',

    -- Local asignado
    local VARCHAR(100) NOT NULL COMMENT 'Nombre del local asignado',

    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de asignación',

    -- Índices
    UNIQUE KEY unique_user_local (user_id, local),
    INDEX idx_user_id (user_id),
    INDEX idx_local (local)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Relación many-to-many entre usuarios y locales';

-- 4. Migrar datos existentes desde users.local
-- Solo migrar usuarios que tienen un local asignado
INSERT INTO user_locales (user_id, local)
SELECT id, local
FROM users
WHERE local IS NOT NULL
  AND local != ''
  AND local != 'NULL';

-- 5. Verificar que la tabla se creó correctamente
DESCRIBE user_locales;

-- 6. Ver cuántos registros se migraron
SELECT COUNT(*) as total_migraciones FROM user_locales;

-- 7. Ver cuántos locales tiene cada usuario
SELECT
    u.username,
    u.role_id,
    COUNT(ul.local) as num_locales,
    GROUP_CONCAT(ul.local SEPARATOR ', ') as locales
FROM users u
LEFT JOIN user_locales ul ON u.id = ul.user_id
GROUP BY u.id, u.username, u.role_id
ORDER BY num_locales DESC
LIMIT 20;

-- 8. Verificar que no hay duplicados
SELECT
    user_id,
    local,
    COUNT(*) as repeticiones
FROM user_locales
GROUP BY user_id, local
HAVING COUNT(*) > 1;

-- 9. Verificar collation de ambas tablas (deben coincidir)
SELECT
    TABLE_NAME,
    TABLE_COLLATION
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('users', 'user_locales');

-- ========================================
-- CONSULTAS ÚTILES PARA ADMINISTRACIÓN
-- ========================================

-- Ver todos los locales de un usuario específico
-- SELECT local FROM user_locales WHERE user_id = 'USER_ID_HERE';

-- Ver todos los usuarios que tienen acceso a un local específico
-- SELECT u.username, u.role_id
-- FROM users u
-- JOIN user_locales ul ON u.id = ul.user_id
-- WHERE ul.local = 'Narda Sucre';

-- Agregar un nuevo local a un usuario existente
-- INSERT INTO user_locales (user_id, local)
-- VALUES ('USER_ID_HERE', 'NUEVO_LOCAL')
-- ON DUPLICATE KEY UPDATE created_at = created_at;  -- No hace nada si ya existe

-- Eliminar un local de un usuario
-- DELETE FROM user_locales WHERE user_id = 'USER_ID_HERE' AND local = 'LOCAL_A_ELIMINAR';

-- Ver usuarios sin locales asignados
-- SELECT u.id, u.username, u.role_id, u.local as local_original
-- FROM users u
-- LEFT JOIN user_locales ul ON u.id = ul.user_id
-- WHERE ul.id IS NULL;

-- Asignar múltiples locales a un usuario (ejemplo)
-- INSERT INTO user_locales (user_id, local) VALUES
-- ('USER_ID_HERE', 'Local 1'),
-- ('USER_ID_HERE', 'Local 2'),
-- ('USER_ID_HERE', 'Local 3')
-- ON DUPLICATE KEY UPDATE created_at = created_at;
