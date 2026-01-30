-- =====================================================
-- Script: Agregar campo turno a anticipos_recibidos
-- Fecha: 2026-01-30
-- Descripción: Para especificar el turno en que se recibió
--              el anticipo en efectivo (solo para locales
--              con múltiples turnos)
-- =====================================================

-- 1. Verificar estructura actual
DESCRIBE anticipos_recibidos;

-- 2. Agregar columna turno (puede ser NULL para anticipos sin turno o antiguos)
ALTER TABLE anticipos_recibidos
ADD COLUMN turno VARCHAR(50) DEFAULT NULL AFTER caja
COMMENT 'Turno en que se recibió el anticipo (solo locales con múltiples turnos)';

-- 3. Verificar el cambio
DESCRIBE anticipos_recibidos;

-- 4. Ver ejemplos de anticipos (ahora con turno NULL)
SELECT id, fecha_pago, local, caja, turno, cliente, importe, medio_pago_id, created_at
FROM anticipos_recibidos
WHERE estado != 'eliminado_global'
ORDER BY created_at DESC
LIMIT 10;

-- =====================================================
-- Notas importantes:
-- - Los anticipos antiguos tendrán turno = NULL
-- - Los nuevos anticipos EN EFECTIVO de locales con múltiples turnos
--   deben tener turno obligatorio
-- - Los anticipos de locales con un solo turno pueden tener turno NULL
-- =====================================================
