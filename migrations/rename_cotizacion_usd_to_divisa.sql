-- =====================================================
-- MIGRATION: Renombrar cotizacion_usd a cotizacion_divisa
-- Propósito: Hacer la solución escalable para cualquier divisa
-- =====================================================

-- Paso 1: Renombrar columna cotizacion_usd a cotizacion_divisa
-- Esto permite que la columna se use para USD, EUR, BRL, o cualquier otra divisa
ALTER TABLE anticipos_recibidos
CHANGE COLUMN cotizacion_usd cotizacion_divisa DECIMAL(10,2) NULL
COMMENT 'Cotización de la divisa en pesos al momento de crear el anticipo (USD, EUR, BRL, etc.)';

-- Paso 2: Actualizar anticipos ya consumidos con divisa extranjera
-- Corregir los que tienen el importe en divisa extranjera sin convertir a pesos
UPDATE anticipos_estados_caja aec
JOIN anticipos_recibidos ar ON ar.id = aec.anticipo_id
SET aec.importe_consumido = ar.importe * ar.cotizacion_divisa
WHERE ar.divisa != 'ARS'
  AND ar.cotizacion_divisa IS NOT NULL
  AND ar.cotizacion_divisa > 0
  AND aec.estado = 'consumido'
  AND aec.importe_consumido = ar.importe; -- Solo actualiza los que tienen divisa sin convertir

-- Paso 3: Verificar el resultado
SELECT
    'Anticipos con divisa extranjera en el sistema:' as descripcion,
    COUNT(*) as cantidad,
    COUNT(DISTINCT divisa) as divisas_distintas
FROM anticipos_recibidos
WHERE divisa != 'ARS';

SELECT
    'Anticipos consumidos actualizados:' as descripcion,
    ar.divisa,
    COUNT(*) as cantidad,
    SUM(ar.importe) as total_en_divisa,
    SUM(aec.importe_consumido) as total_en_pesos
FROM anticipos_estados_caja aec
JOIN anticipos_recibidos ar ON ar.id = aec.anticipo_id
WHERE ar.divisa != 'ARS'
  AND ar.cotizacion_divisa IS NOT NULL
  AND aec.estado = 'consumido'
GROUP BY ar.divisa;
