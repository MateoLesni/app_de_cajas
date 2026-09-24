-- =====================================================
-- Migración: PayMode de Oppen por local + medio de pago (anticipos)
-- =====================================================
-- Cada local puede tener una cuenta/PayMode distinta para el mismo medio.
-- Resolución al enviar un anticipo a Oppen:
--   anticipos_paymode_local(local, medio) > medios_anticipos.paymode_oppen > 'INTERC'
-- La tabla también la crea el módulo en runtime si falta
-- (_ensure_anticipos_oppen_columns).

CREATE TABLE IF NOT EXISTS anticipos_paymode_local (
    id INT AUTO_INCREMENT PRIMARY KEY,
    local VARCHAR(100) NOT NULL,
    medio_pago_id INT NOT NULL,
    paymode_oppen VARCHAR(30) NOT NULL,
    updated_by VARCHAR(100) NULL,
    updated_at DATETIME NULL,
    UNIQUE KEY uq_local_medio (local, medio_pago_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
