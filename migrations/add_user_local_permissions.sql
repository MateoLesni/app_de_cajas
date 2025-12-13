-- ========================================
-- Migración: Tabla de permisos de locales por usuario
-- Fecha: 2025-12-10
-- ========================================

-- Tabla para asignar locales específicos a usuarios con rol 'anticipos'
CREATE TABLE IF NOT EXISTS user_local_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL COMMENT 'Usuario al que se le asigna el permiso',
    local VARCHAR(100) NOT NULL COMMENT 'Local al que tiene acceso',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT NULL COMMENT 'Usuario que asignó el permiso',

    UNIQUE KEY unique_user_local (username, local),
    INDEX idx_username (username),
    INDEX idx_local (local)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Permisos de acceso a locales para usuarios con rol anticipos';

-- ========================================
-- Ejemplos de uso:
-- ========================================

-- Asignar locales a un usuario de anticipos:
-- INSERT INTO user_local_permissions (username, local, created_by)
-- VALUES
--   ('juan.perez', 'Ribs Infanta', 'admin'),
--   ('juan.perez', 'La Mala', 'admin'),
--   ('juan.perez', 'Fabric Sushi', 'admin');

-- Ver permisos de un usuario:
-- SELECT * FROM user_local_permissions WHERE username = 'juan.perez';

-- Eliminar permiso:
-- DELETE FROM user_local_permissions
-- WHERE username = 'juan.perez' AND local = 'Ribs Infanta';
