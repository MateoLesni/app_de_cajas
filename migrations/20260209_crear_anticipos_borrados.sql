CREATE TABLE IF NOT EXISTS anticipos_borrados (
    id INT AUTO_INCREMENT PRIMARY KEY,
    anticipo_id INT NOT NULL,
    fecha_pago DATE NOT NULL,
    fecha_evento DATE NOT NULL,
    importe DECIMAL(10,2) NOT NULL,
    divisa VARCHAR(10) DEFAULT 'ARS',
    tipo_cambio_fecha DATE NULL,
    cotizacion_divisa DECIMAL(10,4) NULL,
    cliente VARCHAR(255) NOT NULL,
    numero_transaccion VARCHAR(100) NULL,
    medio_pago VARCHAR(100) NULL,
    medio_pago_id INT NULL,
    observaciones TEXT NULL,
    local VARCHAR(255) NOT NULL,
    caja VARCHAR(50) NOT NULL,
    turno VARCHAR(50) NOT NULL,
    estado_original VARCHAR(50) NOT NULL,
    motivo_eliminacion TEXT NOT NULL,
    deleted_by VARCHAR(100) NOT NULL,
    deleted_at DATETIME NOT NULL,
    created_by VARCHAR(100) NULL,
    created_at DATETIME NULL,
    registro_creado_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_anticipo_id (anticipo_id),
    INDEX idx_local (local),
    INDEX idx_fecha_evento (fecha_evento),
    INDEX idx_deleted_by (deleted_by),
    INDEX idx_deleted_at (deleted_at),
    INDEX idx_estado_original (estado_original)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'anticipos_recibidos'
      AND COLUMN_NAME = 'motivo_eliminacion'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE anticipos_recibidos ADD COLUMN motivo_eliminacion TEXT NULL AFTER deleted_at',
    'SELECT ''Column motivo_eliminacion already exists'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Migración completada exitosamente' AS status;
SELECT COUNT(*) AS anticipos_borrados_count FROM anticipos_borrados;
