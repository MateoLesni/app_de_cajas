-- Script seguro para modificar tesoreria_recibido
-- Permite remesas individuales en lugar de totales por local

-- PASO 1: Ver la estructura actual
DESCRIBE tesoreria_recibido;

-- PASO 2: Ver los índices actuales
SHOW INDEX FROM tesoreria_recibido;

-- PASO 3: Agregar las columnas nuevas (si no existen)
-- Si ya existen, MySQL simplemente dará un warning
ALTER TABLE tesoreria_recibido
  ADD COLUMN precinto VARCHAR(50) AFTER fecha_retiro;

ALTER TABLE tesoreria_recibido
  ADD COLUMN nro_remesa VARCHAR(50) AFTER precinto;

-- PASO 4: Crear la nueva clave única
-- Esto permitirá guardar cada remesa individual
ALTER TABLE tesoreria_recibido
  ADD UNIQUE KEY unique_remesa (local, fecha_retiro, precinto, nro_remesa);

-- PASO 5: Agregar índices para performance
ALTER TABLE tesoreria_recibido
  ADD INDEX idx_precinto (precinto);

ALTER TABLE tesoreria_recibido
  ADD INDEX idx_nro_remesa (nro_remesa);

-- PASO 6: Verificar la estructura final
DESCRIBE tesoreria_recibido;
SHOW INDEX FROM tesoreria_recibido;
