-- =====================================================
-- MIGRATION PASO 1: Ampliar columna estado_contable
-- Propósito: Permitir almacenar valor 'Archivada' (9 caracteres)
-- =====================================================

-- Verificar el tamaño actual de la columna
DESCRIBE remesas_trns;

-- Ampliar la columna estado_contable
-- De VARCHAR(10) o similar a VARCHAR(20) para permitir 'Archivada' y futuros estados
ALTER TABLE remesas_trns
MODIFY COLUMN estado_contable VARCHAR(20) NULL
COMMENT 'Estado contable: Local, TRAN, Contabilizada, Archivada';

-- Verificar el cambio
DESCRIBE remesas_trns;

-- Ver valores actuales únicos en la columna
SELECT DISTINCT estado_contable, COUNT(*) as cantidad
FROM remesas_trns
GROUP BY estado_contable;
