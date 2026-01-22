-- =====================================================
-- MIGRATION: Sistema de Cuentas Corrientes
-- Propósito: Migrar de facturas tipo CC a sistema dedicado
-- =====================================================

-- Tabla 1: Clientes con Cuenta Corriente
CREATE TABLE IF NOT EXISTS clientes_cta_cte (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre_cliente VARCHAR(100) NOT NULL COMMENT 'Nombre del cliente (ej: Julio Nores)',
    codigo_oppen VARCHAR(20) NOT NULL COMMENT 'Código del cliente en Oppen (ej: JN)',
    activo TINYINT(1) DEFAULT 1 COMMENT '1=activo, 0=inactivo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY idx_codigo_oppen (codigo_oppen),
    KEY idx_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Clientes que tienen cuenta corriente en el sistema';

-- Insertar clientes iniciales
INSERT INTO clientes_cta_cte (nombre_cliente, codigo_oppen) VALUES
('Otro cliente', 'CNGCC'),
('Julio Nores', 'JN'),
('Pablo Dabas', 'PD'),
('Ines de los Santos', 'IS'),
('Narda Lepes', 'NL'),
('Nicolas Cotella', 'NC'),
('Pedro Gervara', 'PG'),
('Jorge Torres', 'JT'),
('El Ruso', 'ER'),
('El Tano', 'ET'),
('David Pickerman', 'DP');

-- Tabla 2: Transacciones de Cuentas Corrientes
CREATE TABLE IF NOT EXISTS cuentas_corrientes_trns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha DATETIME NOT NULL COMMENT 'Fecha y hora de la transacción',
    local VARCHAR(50) NOT NULL COMMENT 'Local donde se realizó la transacción',
    caja VARCHAR(50) NOT NULL COMMENT 'Caja donde se registró',
    turno VARCHAR(10) NOT NULL COMMENT 'Turno: dia/noche',

    cliente_id INT NOT NULL COMMENT 'FK a clientes_cta_cte',
    monto DECIMAL(10,2) NOT NULL COMMENT 'Monto de la cuenta corriente',
    comentario TEXT NULL COMMENT 'Comentario (obligatorio para CNGCC - Otro cliente)',
    facturada TINYINT(1) DEFAULT 0 COMMENT '0=no facturada, 1=facturada',

    usuario VARCHAR(100) NOT NULL COMMENT 'Usuario que cargó el registro',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(20) DEFAULT 'ok' COMMENT 'Estado del registro: ok, eliminado, revision',

    FOREIGN KEY (cliente_id) REFERENCES clientes_cta_cte(id),
    KEY idx_fecha (fecha),
    KEY idx_local_fecha (local, fecha),
    KEY idx_estado (estado),
    KEY idx_cliente (cliente_id),
    KEY idx_facturada (facturada)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Transacciones de cuentas corrientes del sistema';

-- Verificar tablas creadas
SELECT
    'Tablas creadas exitosamente' as resultado,
    (SELECT COUNT(*) FROM clientes_cta_cte) as total_clientes,
    (SELECT COUNT(*) FROM cuentas_corrientes_trns) as total_transacciones;
