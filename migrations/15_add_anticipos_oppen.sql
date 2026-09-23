-- =====================================================
-- Migración: Anticipos con integración Oppen (OnAccNr)
-- =====================================================
-- Un anticipo en Oppen es un Recibo (Office 100) con una fila DebtType=1.
-- Al aprobarse, Oppen devuelve SerNr (recibo) y OnAccNr (N° de anticipo).
-- Guardamos AMBOS para poder consumirlo despues en el recibo de la caja
-- auditada (fila negativa con el mismo OnAccNr). Ver ANTICIPOS_OPPEN.md.
--
-- Estas mismas columnas las auto-crea el modulo en runtime si faltan
-- (_ensure_anticipos_oppen_columns), siguiendo el patron del proyecto.

-- 1) Vinculo del anticipo con Oppen
ALTER TABLE anticipos_recibidos
  ADD COLUMN oppen_sernr      BIGINT      NULL COMMENT 'SerNr del recibo de anticipo en Oppen',
  ADD COLUMN oppen_onaccnr    BIGINT      NULL COMMENT 'OnAccNr = N de anticipo en Oppen',
  ADD COLUMN oppen_estado     VARCHAR(20) NULL COMMENT 'NULL=no enviado | creado | error',
  ADD COLUMN oppen_error      TEXT        NULL,
  ADD COLUMN oppen_enviado_at DATETIME    NULL;

-- 2) Codigo PayMode de Oppen por medio de pago (editable desde la vista de Auditor).
--    Default generico INTERC hasta que el sector confirme la lista real.
ALTER TABLE medios_anticipos
  ADD COLUMN paymode_oppen VARCHAR(30) NULL COMMENT 'Codigo PayMode de Oppen para anticipos';

UPDATE medios_anticipos SET paymode_oppen = 'INTERC' WHERE paymode_oppen IS NULL;

-- 3) Rastro del consumo en Oppen: que recibo de caja consumio el anticipo.
ALTER TABLE anticipos_estados_caja
  ADD COLUMN oppen_consumo_sernr BIGINT NULL COMMENT 'SerNr del recibo de caja que consumio el anticipo en Oppen';
