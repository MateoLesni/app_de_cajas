-- Tabla para gestionar aprobaciones de conciliaciones de remesas por fecha
-- Esta tabla permite que admin de tesorería (role_id 9) apruebe las cargas
-- realizadas por tesoreros (role_id 8)

CREATE TABLE IF NOT EXISTS tesoreria_aprobaciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha_retiro DATE NOT NULL UNIQUE,
    estado ENUM('pendiente', 'aprobado', 'desaprobado') DEFAULT 'pendiente',
    aprobado_por VARCHAR(100),
    aprobado_at DATETIME,
    desaprobado_por VARCHAR(100),
    desaprobado_at DATETIME,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_fecha_retiro (fecha_retiro),
    INDEX idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de auditoría para registrar todas las aprobaciones/desaprobaciones
CREATE TABLE IF NOT EXISTS tesoreria_aprobaciones_audit (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha_retiro DATE NOT NULL,
    accion ENUM('aprobar', 'desaprobar') NOT NULL,
    usuario VARCHAR(100) NOT NULL,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fecha_retiro (fecha_retiro),
    INDEX idx_usuario (usuario),
    INDEX idx_accion (accion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comentarios de las tablas
ALTER TABLE tesoreria_aprobaciones COMMENT = 'Control de aprobaciones de conciliaciones de remesas por fecha';
ALTER TABLE tesoreria_aprobaciones_audit COMMENT = 'Auditoría de aprobaciones y desaprobaciones de conciliaciones';
