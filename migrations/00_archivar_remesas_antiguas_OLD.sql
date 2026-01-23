-- =====================================================
-- MIGRATION: Archivar remesas antiguas (pre-producción)
-- Propósito: Limpiar remesas de prueba antes del uso real del sistema
-- =====================================================

-- CONTEXTO:
-- El sistema tiene remesas antiguas de prueba que nunca se usaron:
-- - Remesas en TRAN que son muy antiguas
-- - Remesas no retiradas con más de 3 días de antigüedad
--
-- SOLUCIÓN:
-- Marcar estas remesas como 'Archivada' para que no aparezcan en reportes activos
-- pero manteniendo la trazabilidad para auditoría.

-- Paso 1: Definir fecha de corte (ajustar según necesidad)
-- Por ejemplo: mantener solo las de la última semana
SET @fecha_corte_tran = DATE_SUB(CURDATE(), INTERVAL 7 DAY);
SET @fecha_corte_no_retiradas = DATE_SUB(CURDATE(), INTERVAL 3 DAY);

-- Paso 2: Verificar qué remesas se archivarán (PREVIEW)
SELECT
    'Remesas TRAN a archivar' as tipo,
    COUNT(*) as cantidad,
    MIN(DATE(fecha)) as fecha_mas_antigua,
    MAX(DATE(fecha)) as fecha_mas_reciente,
    SUM(monto) as monto_total
FROM remesas_trns
WHERE estado_contable = 'TRAN'
  AND DATE(fecha) < @fecha_corte_tran;

SELECT
    'Remesas No Retiradas a archivar' as tipo,
    COUNT(*) as cantidad,
    MIN(DATE(fecha)) as fecha_mas_antigua,
    MAX(DATE(fecha)) as fecha_mas_reciente,
    SUM(monto) as monto_total
FROM remesas_trns
WHERE retirada = 0
  AND estado_contable != 'TRAN'
  AND DATE(fecha) < @fecha_corte_no_retiradas;

-- Paso 3: Archivar remesas TRAN antiguas (más de 7 días)
UPDATE remesas_trns
SET estado_contable = 'Archivada'
WHERE estado_contable = 'TRAN'
  AND DATE(fecha) < @fecha_corte_tran;

-- Paso 4: Archivar remesas No Retiradas antiguas (más de 3 días)
UPDATE remesas_trns
SET estado_contable = 'Archivada'
WHERE retirada = 0
  AND estado_contable NOT IN ('TRAN', 'Archivada')  -- No sobrescribir TRAN o ya archivadas
  AND DATE(fecha) < @fecha_corte_no_retiradas;

-- Paso 5: Verificar resultado
SELECT
    estado_contable,
    COUNT(*) as cantidad,
    MIN(DATE(fecha)) as fecha_mas_antigua,
    MAX(DATE(fecha)) as fecha_mas_reciente,
    SUM(monto) as monto_total
FROM remesas_trns
GROUP BY estado_contable
ORDER BY estado_contable;

-- Paso 6: Verificar remesas activas (las que quedan visibles)
SELECT
    'Remesas TRAN activas (última semana)' as tipo,
    COUNT(*) as cantidad,
    MIN(DATE(fecha)) as desde,
    MAX(DATE(fecha)) as hasta
FROM remesas_trns
WHERE estado_contable = 'TRAN'
  AND DATE(fecha) >= @fecha_corte_tran;

SELECT
    'Remesas No Retiradas activas (últimos 3 días)' as tipo,
    COUNT(*) as cantidad,
    MIN(DATE(fecha)) as desde,
    MAX(DATE(fecha)) as hasta
FROM remesas_trns
WHERE retirada = 0
  AND estado_contable NOT IN ('TRAN', 'Archivada')
  AND DATE(fecha) >= @fecha_corte_no_retiradas;

-- =====================================================
-- NOTAS IMPORTANTES:
-- =====================================================
-- 1. Las remesas archivadas NO se eliminan físicamente
-- 2. Mantienen toda su información para auditoría
-- 3. Simplemente se excluyen de reportes activos
-- 4. Si necesitás ajustar las fechas de corte, modificá las variables @fecha_corte_* al inicio
-- 5. Para revertir (si es necesario): UPDATE remesas_trns SET estado_contable = 'Local' WHERE estado_contable = 'Archivada';
