-- Actualizar anticipos con divisa extranjera ya consumidos para que tengan el importe correcto en pesos
-- Este script corrige anticipos consumidos antes del fix que guardaba el importe en divisa extranjera en lugar de pesos

UPDATE anticipos_estados_caja aec
JOIN anticipos_recibidos ar ON ar.id = aec.anticipo_id
SET aec.importe_consumido = ar.importe * ar.cotizacion_divisa
WHERE ar.divisa != 'ARS'
  AND ar.cotizacion_divisa IS NOT NULL
  AND ar.cotizacion_divisa > 0
  AND aec.estado = 'consumido'
  AND aec.importe_consumido = ar.importe; -- Solo actualiza los que tienen divisa sin convertir

-- Verificar cuántos registros fueron actualizados
SELECT 'Anticipos con divisa extranjera actualizados:' as mensaje, COUNT(*) as cantidad
FROM anticipos_estados_caja aec
JOIN anticipos_recibidos ar ON ar.id = aec.anticipo_id
WHERE ar.divisa != 'ARS'
  AND ar.cotizacion_divisa IS NOT NULL
  AND aec.estado = 'consumido';
