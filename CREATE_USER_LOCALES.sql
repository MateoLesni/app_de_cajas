-- Migración: Crear tabla user_locales para asignar múltiples locales a usuarios
-- Propósito: Permitir que Encargados (y otros roles) puedan tener acceso a múltiples locales
-- Fecha: 2026-02-03

-- 1. Verificar si la tabla ya existe
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'user_locales';

-- 2. Crear la tabla user_locales
CREATE TABLE IF NOT EXISTS user_locales (
    id INT AUTO_INCREMENT PRIMARY KEY,

    -- Relación con users
    user_id VARCHAR(36) NOT NULL COMMENT 'ID del usuario (UUID)',

    -- Local asignado
    local VARCHAR(100) NOT NULL COMMENT 'Nombre del local asignado',

    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de asignación',

    -- Índices
    UNIQUE KEY unique_user_local (user_id, local),
    INDEX idx_user_id (user_id),
    INDEX idx_local (local),

    -- Foreign key
    CONSTRAINT fk_user_locales_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Relación many-to-many entre usuarios y locales';

-- 3. Migrar datos existentes desde users.local
-- Solo migrar usuarios que tienen un local asignado
INSERT INTO user_locales (user_id, local)
SELECT id, local
FROM users
WHERE local IS NOT NULL
  AND local != ''
  AND NOT EXISTS (
      SELECT 1 FROM user_locales ul WHERE ul.user_id = users.id AND ul.local = users.local
  );

-- 4. Verificar que la tabla se creó correctamente
DESCRIBE user_locales;

-- 5. Ver cuántos locales tiene cada usuario
SELECT
    u.username,
    u.role_id,
    COUNT(ul.local) as num_locales,
    GROUP_CONCAT(ul.local SEPARATOR ', ') as locales
FROM users u
LEFT JOIN user_locales ul ON u.id = ul.user_id
GROUP BY u.id, u.username, u.role_id
ORDER BY num_locales DESC;

-- 6. Ejemplos de consultas útiles

-- Ver todos los locales de un usuario específico
-- SELECT local FROM user_locales WHERE user_id = 'USER_ID_HERE';

-- Ver todos los usuarios que tienen acceso a un local específico
-- SELECT u.username, u.role_id
-- FROM users u
-- JOIN user_locales ul ON u.id = ul.user_id
-- WHERE ul.local = 'Narda Sucre';

-- Agregar un nuevo local a un usuario existente
-- INSERT INTO user_locales (user_id, local) VALUES ('USER_ID_HERE', 'NUEVO_LOCAL');

-- Eliminar un local de un usuario
-- DELETE FROM user_locales WHERE user_id = 'USER_ID_HERE' AND local = 'LOCAL_A_ELIMINAR';
