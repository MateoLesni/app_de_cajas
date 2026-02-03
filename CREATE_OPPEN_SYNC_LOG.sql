-- Migración: Crear tabla oppen_sync_log para rastrear intentos de sincronización con Oppen
-- Propósito: Registrar todos los intentos de sincronización (facturas, cuentas corrientes, recibos)
--            con la capacidad de vincularlos a eventos de auditoría específicos
-- Fecha: 2026-02-03

-- 1. Verificar si la tabla ya existe
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'oppen_sync_log';

-- 2. Crear la tabla oppen_sync_log
CREATE TABLE IF NOT EXISTS oppen_sync_log (
    id INT AUTO_INCREMENT PRIMARY KEY,

    -- Tipo de sincronización
    sync_type ENUM('factura', 'cuenta_corriente', 'recibo') NOT NULL COMMENT 'Tipo de registro sincronizado',

    -- ID del registro original (factura, cuenta corriente, etc.)
    registro_id INT NULL COMMENT 'ID del registro en la tabla original',

    -- Información del registro
    local VARCHAR(100) NOT NULL COMMENT 'Local del registro',
    fecha DATE NOT NULL COMMENT 'Fecha del registro',

    -- CRÍTICO: Vínculo con el evento de auditoría
    fecha_auditado DATE NOT NULL COMMENT 'Fecha en que se marcó como auditado el local',
    local_auditado VARCHAR(100) NOT NULL COMMENT 'Local que fue auditado',

    -- Estado de la sincronización
    status ENUM('success', 'failed', 'pending') NOT NULL COMMENT 'Estado del intento de sync',

    -- Información de Oppen
    sernr_oppen INT NULL COMMENT 'SerNr devuelto por Oppen (si fue exitoso)',

    -- Detalles del error
    error_message TEXT NULL COMMENT 'Mensaje de error si falló',

    -- Payloads para debugging
    request_payload JSON NULL COMMENT 'Datos enviados a Oppen API',
    response_payload JSON NULL COMMENT 'Respuesta completa de Oppen API',

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha y hora del intento',

    -- Manejo de reintentos
    retry_count INT DEFAULT 0 COMMENT 'Número de veces que se reintentó',
    last_retry_at TIMESTAMP NULL COMMENT 'Última vez que se reintentó',

    -- Índices para búsquedas rápidas
    INDEX idx_sync_type_status (sync_type, status),
    INDEX idx_local_fecha (local, fecha),
    INDEX idx_audit_date (local_auditado, fecha_auditado),
    INDEX idx_registro (sync_type, registro_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Registro de intentos de sincronización con Oppen API';

-- 3. Verificar que la tabla se creó correctamente
DESCRIBE oppen_sync_log;

-- 4. Mostrar los índices creados
SHOW INDEX FROM oppen_sync_log;

-- 5. Consulta de ejemplo: Ver logs de un local/fecha auditada específica
-- SELECT * FROM oppen_sync_log
-- WHERE local_auditado = 'LOCAL_NAME'
--   AND fecha_auditado = '2026-02-03'
-- ORDER BY created_at DESC;

-- 6. Consulta de ejemplo: Ver solo intentos fallidos de una auditoría
-- SELECT sync_type, registro_id, error_message, created_at
-- FROM oppen_sync_log
-- WHERE local_auditado = 'LOCAL_NAME'
--   AND fecha_auditado = '2026-02-03'
--   AND status = 'failed'
-- ORDER BY created_at DESC;
