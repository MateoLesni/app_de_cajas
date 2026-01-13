-- =====================================================
-- Tabla: medios_anticipos
-- Descripción: Medios de pago disponibles para anticipos
-- Fecha: 2026-01-07
-- =====================================================

CREATE TABLE IF NOT EXISTS medios_anticipos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    activo TINYINT(1) DEFAULT 1 COMMENT '1=activo, 0=inactivo',
    es_efectivo TINYINT(1) DEFAULT 0 COMMENT '1=es efectivo (resta de remesas), 0=no es efectivo',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_activo (activo),
    INDEX idx_es_efectivo (es_efectivo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Medios de pago disponibles para anticipos';

-- =====================================================
-- Insertar medios de pago iniciales
-- =====================================================

INSERT INTO medios_anticipos (nombre, es_efectivo) VALUES
('Efectivo', 1),
('Transferencia Bancaria', 0),
('Mercado Pago', 0),
('Lemon', 0),
('Passline', 0)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

-- =====================================================
-- Agregar columna medio_pago_id a tabla anticipos_recibidos
-- =====================================================

-- Verificar si la columna ya existe
SET @column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'anticipos_recibidos'
      AND COLUMN_NAME = 'medio_pago_id'
);

-- Agregar columna solo si no existe
SET @sql = IF(
    @column_exists = 0,
    'ALTER TABLE anticipos_recibidos ADD COLUMN medio_pago_id INT DEFAULT NULL AFTER observaciones',
    'SELECT "Column medio_pago_id already exists" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Agregar foreign key (solo si no existe)
SET @fk_exists = (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'anticipos_recibidos'
      AND CONSTRAINT_NAME = 'fk_anticipos_recibidos_medio_pago'
);

SET @sql = IF(
    @fk_exists = 0,
    'ALTER TABLE anticipos_recibidos ADD CONSTRAINT fk_anticipos_recibidos_medio_pago FOREIGN KEY (medio_pago_id) REFERENCES medios_anticipos(id) ON DELETE SET NULL',
    'SELECT "Foreign key already exists" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Crear índice en medio_pago_id
-- =====================================================

SET @index_exists = (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'anticipos_recibidos'
      AND INDEX_NAME = 'idx_medio_pago'
);

SET @sql = IF(
    @index_exists = 0,
    'ALTER TABLE anticipos_recibidos ADD INDEX idx_medio_pago (medio_pago_id)',
    'SELECT "Index idx_medio_pago already exists" AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- Migrar datos existentes a "Efectivo"
-- =====================================================

UPDATE anticipos_recibidos
SET medio_pago_id = (SELECT id FROM medios_anticipos WHERE nombre = 'Efectivo' LIMIT 1)
WHERE medio_pago_id IS NULL;

-- =====================================================
-- Verificación
-- =====================================================

SELECT 'Medios de pago creados:' AS mensaje;
SELECT * FROM medios_anticipos;

SELECT 'Columna agregada a anticipos_recibidos:' AS mensaje;
DESCRIBE anticipos_recibidos;

SELECT
    'Anticipos sin medio de pago:' AS mensaje,
    COUNT(*) as cantidad
FROM anticipos_recibidos
WHERE medio_pago_id IS NULL;
