-- ========================================
-- Migración: Agregar divisa y adjuntos a anticipos
-- Fecha: 2025-12-09
-- ========================================

-- 1. Agregar campo divisa (moneda) a anticipos_recibidos
ALTER TABLE anticipos_recibidos
ADD COLUMN divisa VARCHAR(10) DEFAULT 'ARS' COMMENT 'Moneda del anticipo: ARS, USD, EUR, etc.' AFTER importe,
ADD COLUMN tipo_cambio_fecha DATE COMMENT 'Fecha en que se registró el tipo de cambio' AFTER divisa;

-- 2. Crear tabla para tipos de cambio (para futuras consultas)
CREATE TABLE IF NOT EXISTS tipos_cambio (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha DATE NOT NULL,
    divisa VARCHAR(10) NOT NULL,
    valor_compra DECIMAL(10,4) DEFAULT NULL COMMENT 'Tipo de cambio compra',
    valor_venta DECIMAL(10,4) DEFAULT NULL COMMENT 'Tipo de cambio venta',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_fecha_divisa (fecha, divisa),
    INDEX idx_fecha (fecha),
    INDEX idx_divisa (divisa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Registro histórico de tipos de cambio';

-- Insertar valores por defecto para ARS
INSERT INTO tipos_cambio (fecha, divisa, valor_compra, valor_venta)
VALUES (CURDATE(), 'ARS', 1.0000, 1.0000)
ON DUPLICATE KEY UPDATE valor_compra=1.0000, valor_venta=1.0000;

-- 3. La tabla imagenes_adjuntos ya existe y soporta entity_type/entity_id
-- Solo verificamos que tenga los campos necesarios (no hace falta modificar)
-- Los adjuntos de anticipos usarán:
--   entity_type = 'anticipo_recibido'
--   entity_id = id del anticipo

-- 4. Actualizar anticipos existentes con fecha del tipo de cambio
UPDATE anticipos_recibidos
SET tipo_cambio_fecha = fecha_pago
WHERE tipo_cambio_fecha IS NULL;

-- 5. Hacer tipo_cambio_fecha NOT NULL después de rellenar valores
ALTER TABLE anticipos_recibidos
MODIFY COLUMN tipo_cambio_fecha DATE NOT NULL;

-- ========================================
-- Verificación
-- ========================================
-- SELECT * FROM anticipos_recibidos LIMIT 5;
-- SHOW COLUMNS FROM anticipos_recibidos LIKE 'divisa';
-- SHOW COLUMNS FROM anticipos_recibidos LIKE 'tipo_cambio_fecha';
-- SELECT * FROM tipos_cambio;
