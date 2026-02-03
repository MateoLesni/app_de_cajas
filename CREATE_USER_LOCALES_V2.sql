-- Migración: Crear tabla user_locales para asignar múltiples locales a usuarios
-- Propósito: Permitir que Encargados (y otros roles) puedan tener acceso a múltiples locales
-- Fecha: 2026-02-03
-- Versión 2: Sin foreign key constraint para evitar conflictos de tipos

-- 1. Verificar si la tabla ya existe
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'user_locales';

-- 2. Eliminar tabla si existe (para re-crear limpiamente)
DROP TABLE IF EXISTS user_locales;

-- 3. Crear la tabla user_locales
-- NOTA: Usamos el mismo tipo de dato que users.id (verificar con CHECK_USERS_TABLE_STRUCTURE.sql)
CREATE TABLE user_locales (
    id INT AUTO_INCREMENT PRIMARY KEY,

    -- Relación con users (ajustar tipo según users.id)
    -- Si users.id es VARCHAR(36), usar VARCHAR(36)
    -- Si users.id es INT, usar INT
    user_id VARCHAR(255) NOT NULL COMMENT 'ID del usuario',

    -- Local asignado
    local VARCHAR(100) NOT NULL COMMENT 'Nombre del local asignado',

    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de asignación',

    -- Índices
    UNIQUE KEY unique_user_local (user_id, local),
    INDEX idx_user_id (user_id),
    INDEX idx_local (local)

    -- Foreign key comentada por ahora (descomentar después de verificar tipos)
    -- CONSTRAINT fk_user_locales_user
    --     FOREIGN KEY (user_id)
    --     REFERENCES users(id)
    --     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
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

-- ========================================
-- DESPUÉS DE VERIFICAR QUE TODO FUNCIONA
-- ========================================

-- 9. OPCIONAL: Agregar foreign key constraint (solo si los tipos coinciden)
-- Primero verifica que users.id y user_locales.user_id tengan el mismo tipo

-- Descomentar estas líneas SOLO si los tipos son compatibles:
-- ALTER TABLE user_locales
-- ADD CONSTRAINT fk_user_locales_user
--     FOREIGN KEY (user_id)
--     REFERENCES users(id)
--     ON DELETE CASCADE;

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
