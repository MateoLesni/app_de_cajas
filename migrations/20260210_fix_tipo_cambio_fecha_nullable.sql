-- ================================================================
-- MIGRACIÓN: Permitir NULL en tipo_cambio_fecha y cotizacion_divisa
-- ================================================================
-- Cuando la divisa es ARS, estos campos deben ser NULL
-- Actualmente están definidos como NOT NULL lo que causa errores
-- ================================================================

-- Cambiar tipo_cambio_fecha para permitir NULL
ALTER TABLE anticipos_recibidos
MODIFY COLUMN tipo_cambio_fecha DATE NULL;

-- Cambiar cotizacion_divisa para permitir NULL (si no lo permite ya)
ALTER TABLE anticipos_recibidos
MODIFY COLUMN cotizacion_divisa DECIMAL(10,4) NULL;

-- Verificar los cambios
SELECT
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE,
    COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'anticipos_recibidos'
  AND COLUMN_NAME IN ('tipo_cambio_fecha', 'cotizacion_divisa');

SELECT 'Migración completada: tipo_cambio_fecha y cotizacion_divisa ahora permiten NULL' AS status;
