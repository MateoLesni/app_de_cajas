-- Migración: Corregir nombre de tab para imágenes de Cuentas Corrientes
-- Fecha: 2026-02-10
-- Descripción: Las imágenes se guardaron con tab='cuenta_cte' pero el frontend
--              usa 'ctas_ctes'. Esta migración actualiza los registros antiguos.

-- Ver cuántos registros hay que corregir
SELECT
    tab,
    COUNT(*) as cantidad,
    MIN(created_at) as primera,
    MAX(created_at) as ultima
FROM imagenes_adjuntos
WHERE tab IN ('cuenta_cte', 'ctas_ctes')
GROUP BY tab;

-- Actualizar registros de 'cuenta_cte' a 'ctas_ctes' (si existen)
-- NOTA: Este UPDATE solo afecta registros con el tab antiguo
UPDATE imagenes_adjuntos
SET tab = 'ctas_ctes'
WHERE tab = 'cuenta_cte';

-- Verificar que se actualizó correctamente
SELECT
    tab,
    COUNT(*) as cantidad
FROM imagenes_adjuntos
WHERE tab = 'ctas_ctes'
GROUP BY tab;
