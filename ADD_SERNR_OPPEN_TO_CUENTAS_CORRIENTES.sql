-- Migración: Agregar columna sernr_oppen a cuentas_corrientes_trns
-- Propósito: Guardar el SerNr de Oppen para rastrear facturas creadas en Oppen
-- Fecha: 2026-02-02

-- 1. Verificar si la columna ya existe
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'cuentas_corrientes_trns'
  AND COLUMN_NAME = 'sernr_oppen';

-- 2. Agregar la columna sernr_oppen
-- Esta columna almacenará el SerNr (número interno) generado por Oppen
-- Si ya existe, este comando fallará (ejecutar solo si no existe)
ALTER TABLE cuentas_corrientes_trns
ADD COLUMN sernr_oppen INT DEFAULT NULL
COMMENT 'SerNr de la factura en Oppen (número interno para vincular con el sistema Oppen)';

-- 3. Agregar índice para búsquedas rápidas por SerNr
-- Nota: En MySQL 5.7 y anteriores, usar DROP INDEX si ya existe
CREATE INDEX idx_cuentas_corrientes_sernr_oppen
ON cuentas_corrientes_trns(sernr_oppen);

-- 4. Verificar que la columna se agregó correctamente
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'cuentas_corrientes_trns'
  AND COLUMN_NAME = 'sernr_oppen';

-- 5. Mostrar todas las columnas de la tabla
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'cuentas_corrientes_trns'
ORDER BY ORDINAL_POSITION;
