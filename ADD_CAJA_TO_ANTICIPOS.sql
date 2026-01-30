-- =====================================================
-- Script: Agregar campo caja a anticipos_recibidos
-- Fecha: 2026-01-30
-- Descripción: Para que los anticipos en efectivo resten
--              del resumen de la caja específica que los recibió
-- =====================================================

-- 1. Verificar estructura actual
DESCRIBE anticipos_recibidos;

-- 2. Agregar columna caja (puede ser NULL para anticipos antiguos)
ALTER TABLE anticipos_recibidos
ADD COLUMN caja VARCHAR(50) DEFAULT NULL AFTER local
COMMENT 'Caja que recibió el anticipo (obligatorio para nuevos anticipos en efectivo)';

-- 3. Crear índice para mejorar performance en queries
CREATE INDEX idx_anticipos_local_caja_fecha ON anticipos_recibidos(local, caja, fecha_pago);

-- 4. Verificar el cambio
DESCRIBE anticipos_recibidos;

-- 5. Ver ejemplos de anticipos (ahora con caja NULL)
SELECT id, fecha_pago, local, caja, cliente, importe, medio_pago_id, created_at
FROM anticipos_recibidos
WHERE estado != 'eliminado_global'
ORDER BY created_at DESC
LIMIT 10;

-- =====================================================
-- Notas importantes:
-- - Los anticipos antiguos tendrán caja = NULL
-- - Los nuevos anticipos EN EFECTIVO deben tener caja obligatoria
-- - Los anticipos por transferencia/MP pueden tener caja NULL
-- - El resumen filtrará por caja solo si el anticipo la tiene
-- =====================================================
