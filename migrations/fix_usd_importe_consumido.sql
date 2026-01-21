-- Actualizar anticipos USD ya consumidos para que tengan el importe correcto en pesos
-- Este script corrige anticipos consumidos antes del fix que guardaba USD en lugar de pesos

UPDATE anticipos_estados_caja aec
JOIN anticipos_recibidos ar ON ar.id = aec.anticipo_id
SET aec.importe_consumido = ar.importe * ar.cotizacion_usd
WHERE ar.divisa = 'USD'
  AND ar.cotizacion_usd IS NOT NULL
  AND ar.cotizacion_usd > 0
  AND aec.estado = 'consumido'
  AND aec.importe_consumido = ar.importe; -- Solo actualiza los que tienen USD sin convertir

-- Verificar cuántos registros fueron actualizados
SELECT 'Anticipos USD actualizados:', COUNT(*) as cantidad
FROM anticipos_estados_caja aec
JOIN anticipos_recibidos ar ON ar.id = aec.anticipo_id
WHERE ar.divisa = 'USD'
  AND ar.cotizacion_usd IS NOT NULL
  AND aec.estado = 'consumido';
