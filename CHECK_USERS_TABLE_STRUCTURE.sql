-- Script para verificar la estructura de la tabla users
-- Ejecuta esto primero para ver qué tipo de dato tiene la columna 'id'

SELECT
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE,
    COLUMN_KEY,
    EXTRA
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'users'
ORDER BY ORDINAL_POSITION;
