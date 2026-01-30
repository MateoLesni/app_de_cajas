-- =====================================================
-- Script: Verificación de anticipos sin medio_pago_id
-- Fecha: 2026-01-30
-- Descripción: Los anticipos antiguos sin medio_pago_id
--              quedarán NULL hasta que el auditor los edite.
--              Los nuevos DEBEN tener medio_pago_id obligatorio.
-- =====================================================

-- 1. Ver cuántos anticipos tienen medio_pago_id NULL (antiguos)
SELECT
    'Anticipos sin medio_pago_id (antiguos):' as info,
    COUNT(*) as cantidad,
    SUM(importe) as total_importe
FROM anticipos_recibidos
WHERE medio_pago_id IS NULL
  AND estado != 'eliminado_global';

-- 2. Ver lista de anticipos sin medio (para revisión manual)
SELECT
    id,
    fecha_pago,
    local,
    cliente,
    importe,
    divisa,
    medio_pago_id,
    created_at
FROM anticipos_recibidos
WHERE medio_pago_id IS NULL
  AND estado != 'eliminado_global'
ORDER BY fecha_pago DESC
LIMIT 20;

-- 3. IMPORTANTE: Los anticipos NULL NO afectarán el cálculo
--    porque el query usa INNER JOIN con medios_anticipos.
--    Por lo tanto, solo se contarán los que tengan medio_pago_id válido.

-- 4. Query que usa el sistema (simula el cálculo real)
SELECT
    ar.local,
    ar.fecha_pago,
    ar.importe,
    ar.divisa,
    ar.cotizacion_divisa,
    ma.nombre as medio_pago,
    ma.es_efectivo,
    CASE
        WHEN ar.divisa = 'USD' AND ar.cotizacion_divisa IS NOT NULL
        THEN ar.importe * ar.cotizacion_divisa
        ELSE ar.importe
    END as importe_ars
FROM anticipos_recibidos ar
INNER JOIN medios_anticipos ma ON ar.medio_pago_id = ma.id
WHERE DATE(ar.fecha_pago) = CURDATE()
  AND ma.es_efectivo = 1
  AND ar.estado != 'eliminado_global';

-- 5. Ver anticipos por estado (con/sin medio)
SELECT
    CASE
        WHEN medio_pago_id IS NULL THEN 'Sin medio (antiguos - ignorados)'
        ELSE 'Con medio (se incluyen en cálculo)'
    END as estado,
    COUNT(*) as cantidad,
    SUM(importe) as total_importe
FROM anticipos_recibidos
WHERE estado != 'eliminado_global'
GROUP BY CASE WHEN medio_pago_id IS NULL THEN 'Sin medio (antiguos - ignorados)' ELSE 'Con medio (se incluyen en cálculo)' END;

-- 6. Ver distribución de medios de pago (solo los válidos)
SELECT
    ma.nombre as medio_pago,
    ma.es_efectivo,
    COUNT(ar.id) as cantidad_anticipos,
    SUM(ar.importe) as total_importe,
    COUNT(DISTINCT ar.local) as cantidad_locales
FROM anticipos_recibidos ar
INNER JOIN medios_anticipos ma ON ar.medio_pago_id = ma.id
WHERE ar.estado != 'eliminado_global'
GROUP BY ma.nombre, ma.es_efectivo
ORDER BY cantidad_anticipos DESC;

-- =====================================================
-- Resultado esperado:
-- - Los anticipos NULL NO afectan el cálculo (INNER JOIN los excluye)
-- - Los nuevos anticipos DEBEN tener medio_pago_id (validación obligatoria)
-- - Los antiguos NULL quedan sin medio hasta que se editen manualmente
-- =====================================================
