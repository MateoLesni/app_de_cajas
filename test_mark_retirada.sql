-- ============================================================================
-- Script de Testing: Marcar remesa como retirada y verificar cambio de estado
-- ============================================================================

-- 1. Estado ANTES de marcar como retirada
SELECT
    '=== ANTES DE RETIRADA ===' as seccion,
    id,
    nro_remesa,
    estado_contable,
    retirada,
    retirada_por,
    fecha_retirada
FROM remesas_trns
WHERE nro_remesa = 'TEST-USD-001';

-- 2. Marcar como retirada (simula lo que hace el endpoint /marcar_remesa_retirada)
UPDATE remesas_trns
SET retirada = 1,
    retirada_por = 'test_usuario',
    fecha_retirada = CURDATE(),
    fecha_marca_retirada = NOW(),
    estado_contable = 'TRAN',
    ult_mod = NOW()
WHERE nro_remesa = 'TEST-USD-001';

-- 3. Estado DESPUÉS de marcar como retirada
SELECT
    '=== DESPUÉS DE RETIRADA ===' as seccion,
    id,
    nro_remesa,
    estado_contable,
    retirada,
    retirada_por,
    fecha_retirada
FROM remesas_trns
WHERE nro_remesa = 'TEST-USD-001';

-- 4. Verificar que NO aparece en Apertura AP USD (porque estado_contable = 'TRAN')
-- Debe retornar 0
SELECT
    '=== APERTURA AP USD después de retirada - Debe ser 0 ===' as seccion,
    COUNT(*) as cantidad_remesas_visibles
FROM remesas_trns
WHERE nro_remesa = 'TEST-USD-001'
  AND divisa = 'USD'
  AND estado_contable = 'Local'
  AND retirada = 0;

-- 5. Verificar que SÍ aparece con estado TRAN
-- Debe retornar 1
SELECT
    '=== Remesa en estado TRAN - Debe ser 1 ===' as seccion,
    COUNT(*) as cantidad_en_tran,
    estado_contable,
    retirada
FROM remesas_trns
WHERE nro_remesa = 'TEST-USD-001'
  AND estado_contable = 'TRAN'
GROUP BY estado_contable, retirada;
