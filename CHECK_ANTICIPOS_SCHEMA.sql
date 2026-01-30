-- =====================================================
-- Script: Verificar estructura de anticipos_recibidos
-- Fecha: 2026-01-30
-- Descripción: Revisar el tipo de dato de importe
-- =====================================================

-- 1. Ver estructura de la tabla
DESCRIBE anticipos_recibidos;

-- 2. Ver específicamente el campo importe
SELECT COLUMN_NAME, COLUMN_TYPE, DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'anticipos_recibidos'
  AND COLUMN_NAME = 'importe';

-- 3. Ver un ejemplo de anticipo con el problema (si existe)
SELECT id, importe, divisa, cliente, created_at
FROM anticipos_recibidos
WHERE importe LIKE '%.98' OR importe LIKE '%.99'
ORDER BY created_at DESC
LIMIT 10;

-- 4. Ver la definición completa de la tabla
SHOW CREATE TABLE anticipos_recibidos;
