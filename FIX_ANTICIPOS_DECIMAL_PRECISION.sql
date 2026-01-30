-- =====================================================
-- Script: Corregir precisión decimal en anticipos_recibidos
-- Fecha: 2026-01-30
-- Problema: El campo importe puede estar como FLOAT causando
--           pérdida de precisión (10000 se guarda como 9999.98)
-- Solución: Cambiar a DECIMAL(15,2) para precisión exacta
-- =====================================================

-- 1. Verificar tipo de dato actual
SELECT
    COLUMN_NAME,
    COLUMN_TYPE,
    DATA_TYPE,
    NUMERIC_PRECISION,
    NUMERIC_SCALE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'anticipos_recibidos'
  AND COLUMN_NAME IN ('importe', 'cotizacion_divisa');

-- 2. Si importe es FLOAT o DOUBLE, cambiarlo a DECIMAL(15,2)
-- IMPORTANTE: Ejecutar esto solo si el campo NO es DECIMAL
-- Verificá primero con el query anterior

-- Para importe:
ALTER TABLE anticipos_recibidos
MODIFY COLUMN importe DECIMAL(15,2) NOT NULL
COMMENT 'Importe del anticipo con precisión decimal exacta';

-- Para cotizacion_divisa (si existe):
ALTER TABLE anticipos_recibidos
MODIFY COLUMN cotizacion_divisa DECIMAL(10,2) DEFAULT NULL
COMMENT 'Cotización de divisa con precisión decimal exacta';

-- 3. Verificar el cambio
DESCRIBE anticipos_recibidos;

-- 4. Ver ejemplos de anticipos para verificar que los valores se mantuvieron
SELECT id, importe, divisa, cotizacion_divisa, cliente, created_at
FROM anticipos_recibidos
ORDER BY created_at DESC
LIMIT 10;

-- =====================================================
-- Notas:
-- - DECIMAL(15,2) permite hasta 15 dígitos totales, 2 decimales
--   Rango: -9,999,999,999,999.99 a 9,999,999,999,999.99
-- - DECIMAL(10,2) para cotización permite hasta $99,999,999.99
-- - MySQL convierte automáticamente los valores de FLOAT a DECIMAL
-- - No se pierden datos en la conversión
-- =====================================================
