-- ============================================================================
-- Script de Testing: Verificar que la remesa USD aparece en los reportes correctos
-- ============================================================================

-- 1. Verificar que la remesa existe y tiene los valores correctos
SELECT
    '=== REMESA CREADA ===' as seccion,
    id,
    local,
    nro_remesa,
    divisa,
    monto as monto_ars,
    monto_usd,
    cotizacion_divisa,
    total_conversion,
    estado_contable,
    retirada,
    fecha
FROM remesas_trns
WHERE nro_remesa = 'TEST-USD-001'
ORDER BY id DESC
LIMIT 1;

-- 2. Verificar que NO aparece en Apertura AP (solo ARS)
-- Esta query debería retornar 0 si está bien filtrada
SELECT
    '=== APERTURA AP (Solo ARS) - Debe ser 0 ===' as seccion,
    COUNT(*) as cantidad_remesas_usd_incorrectas
FROM remesas_trns
WHERE local = 'Local_Test'
  AND DATE(fecha) = CURDATE()
  AND estado_contable = 'Local'
  AND retirada = 0
  AND (divisa IS NULL OR divisa = '' OR divisa = 'ARS')
  AND nro_remesa = 'TEST-USD-001';

-- 3. Verificar que SÍ aparece en Apertura AP USD (solo USD)
-- Esta query debería retornar 1
SELECT
    '=== APERTURA AP USD (Solo USD) - Debe ser 1 ===' as seccion,
    COUNT(*) as cantidad_remesas_usd_correctas,
    SUM(monto_usd) as total_usd,
    SUM(total_conversion) as total_conversion_ars
FROM remesas_trns
WHERE local = 'Local_Test'
  AND DATE(fecha) = CURDATE()
  AND divisa = 'USD'
  AND estado_contable = 'Local'
  AND retirada = 0
  AND nro_remesa = 'TEST-USD-001';

-- 4. Detalle de la remesa USD en Apertura AP USD
SELECT
    '=== DETALLE REMESA EN APERTURA AP USD ===' as seccion,
    nro_remesa,
    precinto,
    monto_usd,
    cotizacion_divisa,
    total_conversion,
    estado_contable,
    retirada,
    DATEDIFF(CURDATE(), fecha) as dias_transcurridos
FROM remesas_trns
WHERE nro_remesa = 'TEST-USD-001';
