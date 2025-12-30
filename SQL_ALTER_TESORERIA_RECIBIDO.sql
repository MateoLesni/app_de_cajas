-- Agregar columnas para identificar remesas individuales
-- Esto permite guardar el monto real de cada bolsa/remesa por separado

-- Paso 1: Agregar columnas si no existen
ALTER TABLE tesoreria_recibido
ADD COLUMN IF NOT EXISTS precinto VARCHAR(50) AFTER fecha_retiro,
ADD COLUMN IF NOT EXISTS nro_remesa VARCHAR(50) AFTER precinto;

-- Paso 2: Eliminar índices únicos existentes que puedan causar conflicto
-- Primero verificamos y eliminamos las posibles claves únicas
SET @drop_index_sql = (
  SELECT CONCAT('ALTER TABLE tesoreria_recibido DROP INDEX ', INDEX_NAME, ';')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tesoreria_recibido'
    AND NON_UNIQUE = 0
    AND INDEX_NAME != 'PRIMARY'
  LIMIT 1
);

-- Ejecutar drop solo si existe
SET @drop_index_sql = IFNULL(@drop_index_sql, 'SELECT "No hay índices únicos para eliminar";');
PREPARE stmt FROM @drop_index_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Paso 3: Crear nueva clave única por (local, fecha_retiro, precinto, nro_remesa)
ALTER TABLE tesoreria_recibido
ADD UNIQUE KEY unique_remesa (local, fecha_retiro, precinto, nro_remesa);

-- Paso 4: Agregar índices para mejorar performance
ALTER TABLE tesoreria_recibido
ADD INDEX IF NOT EXISTS idx_precinto (precinto),
ADD INDEX IF NOT EXISTS idx_nro_remesa (nro_remesa);
