-- =====================================================
-- MIGRATION: Ampliar columna turno en cuentas_corrientes_trns
-- Propósito: Resolver error "Data too long for column 'turno'"
-- =====================================================

-- Ampliar la columna turno de VARCHAR(10) a VARCHAR(50)
-- para que sea consistente con otras tablas del sistema
ALTER TABLE cuentas_corrientes_trns
MODIFY COLUMN turno VARCHAR(50) NOT NULL COMMENT 'Turno: dia/noche';

-- Verificar el cambio
DESCRIBE cuentas_corrientes_trns;
