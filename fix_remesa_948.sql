-- Corregir remesa ID 948 que fue marcada como retirada pero no cambió a TRAN
-- Fecha: 2026-01-09

UPDATE remesas_trns
SET estado_contable = 'TRAN',
    fecha_estado_tran = fecha_retirada
WHERE id = 948
  AND retirada = 1
  AND estado_contable = 'Local';

-- Verificar el cambio
SELECT
    id,
    local,
    fecha,
    nro_remesa,
    precinto,
    monto,
    retirada,
    retirada_por,
    fecha_retirada,
    estado_contable,
    fecha_estado_tran
FROM remesas_trns
WHERE id = 948;
