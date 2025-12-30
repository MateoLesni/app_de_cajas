-- Agregar columnas para identificar remesas individuales
-- Esto permite guardar el monto real de cada bolsa/remesa por separado

ALTER TABLE tesoreria_recibido
ADD COLUMN precinto VARCHAR(50) AFTER fecha_retiro,
ADD COLUMN nro_remesa VARCHAR(50) AFTER precinto;

-- Eliminar la clave única anterior (local, fecha_retiro)
ALTER TABLE tesoreria_recibido
DROP INDEX local;

-- Crear nueva clave única por (local, fecha_retiro, precinto, nro_remesa)
ALTER TABLE tesoreria_recibido
ADD UNIQUE KEY unique_remesa (local, fecha_retiro, precinto, nro_remesa);

-- Agregar índices para mejorar performance
ALTER TABLE tesoreria_recibido
ADD INDEX idx_precinto (precinto),
ADD INDEX idx_nro_remesa (nro_remesa);
