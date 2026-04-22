-- =====================================================
-- Migración: Rol Reportería + tabla ventas_extras
-- =====================================================

-- 1. Crear rol Reportería (nivel 9)
INSERT INTO roles (name, level, description)
VALUES ('reporteria', 9, 'Carga de ajustes de venta extra para reportería gerencial (no afecta cajas)')
ON DUPLICATE KEY UPDATE level=9, description=VALUES(description);

-- 2. Crear tabla ventas_extras
CREATE TABLE IF NOT EXISTS ventas_extras (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  local VARCHAR(120) NOT NULL,
  fecha DATE NOT NULL,
  monto DECIMAL(15,2) NOT NULL,
  motivo VARCHAR(255) NOT NULL,
  usuario VARCHAR(120) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  updated_by VARCHAR(120) NULL,
  motivo_edicion VARCHAR(255) NULL,
  estado ENUM('activo','eliminado') NOT NULL DEFAULT 'activo',
  deleted_at DATETIME NULL,
  deleted_by VARCHAR(120) NULL,
  motivo_eliminacion VARCHAR(255) NULL,
  INDEX idx_local_fecha (local, fecha),
  INDEX idx_estado (estado),
  INDEX idx_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
