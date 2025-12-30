-- ============================================================================
-- IMPORTANTE: Ejecutar este script LÍNEA POR LÍNEA en MySQL Workbench o CLI
-- ============================================================================

-- 1. Agregar columnas nuevas
ALTER TABLE tesoreria_recibido ADD COLUMN precinto VARCHAR(50) AFTER fecha_retiro;
ALTER TABLE tesoreria_recibido ADD COLUMN nro_remesa VARCHAR(50) AFTER precinto;

-- 2. DESPUÉS de ejecutar el paso 1, ejecuta SHOW INDEX para ver qué índices únicos existen:
SHOW INDEX FROM tesoreria_recibido WHERE Non_unique = 0;

-- 3. Si ves un índice único diferente a PRIMARY, elimínalo con uno de estos comandos:
-- (Descomenta el que corresponda según el nombre del índice que viste)

-- Opción A: Si el índice se llama 'local'
-- ALTER TABLE tesoreria_recibido DROP INDEX local;

-- Opción B: Si el índice se llama 'unique_local_fecha'
-- ALTER TABLE tesoreria_recibido DROP INDEX unique_local_fecha;

-- Opción C: Si el índice se llama 'local_fecha_retiro'
-- ALTER TABLE tesoreria_recibido DROP INDEX local_fecha_retiro;

-- 4. Crear la nueva clave única
ALTER TABLE tesoreria_recibido ADD UNIQUE KEY unique_remesa (local, fecha_retiro, precinto, nro_remesa);

-- 5. Agregar índices para performance
ALTER TABLE tesoreria_recibido ADD INDEX idx_precinto (precinto);
ALTER TABLE tesoreria_recibido ADD INDEX idx_nro_remesa (nro_remesa);

-- 6. Verificar que todo quedó bien
DESCRIBE tesoreria_recibido;
SHOW INDEX FROM tesoreria_recibido;
