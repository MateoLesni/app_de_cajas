-- ============================================================================
-- Migración: Agregar campos USD a snap_remesas
-- Fecha: 2026-01-28
-- Descripción: Agrega los mismos campos USD que remesas_trns a la tabla
--              de snapshots para mantener consistencia en cierres de local
-- ============================================================================

-- IMPORTANTE: Ejecutar DESPUÉS de la migración 04 (remesas_trns)

-- Agregar columnas USD a snap_remesas
ALTER TABLE snap_remesas
ADD COLUMN divisa VARCHAR(3) DEFAULT 'ARS' COMMENT 'Divisa de la remesa: ARS o USD',
ADD COLUMN monto_usd DECIMAL(10,2) NULL COMMENT 'Monto en dólares estadounidenses (solo si divisa=USD)',
ADD COLUMN cotizacion_divisa DECIMAL(10,2) NULL COMMENT 'Cotización del dólar en pesos (solo si divisa=USD)',
ADD COLUMN total_conversion DECIMAL(10,2) NULL COMMENT 'Total convertido a ARS (monto_usd * cotizacion_divisa)';

-- Actualizar registros existentes
UPDATE snap_remesas
SET divisa = 'ARS'
WHERE divisa IS NULL OR divisa = '';

-- ============================================================================
-- NOTAS:
-- - Esta tabla es un snapshot (copia histórica) de remesas_trns
-- - Los triggers NO se aplican aquí porque es una tabla de solo lectura histórica
-- - Los valores de total_conversion ya vienen calculados desde remesas_trns
-- ============================================================================
