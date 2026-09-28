-- =====================================================
-- Migración: cliente Oppen por anticipo + tarjetas como medio de anticipo
-- =====================================================
-- Oppen solo deja consumir un anticipo en un recibo del MISMO cliente
-- (ONACCOUNTWRONGCUSTOMERSUPPLIER): se guarda el CustCode con el que se creó.
-- También lo aplica el módulo en runtime (_ensure_anticipos_oppen_columns).

ALTER TABLE anticipos_recibidos
  ADD COLUMN oppen_custcode VARCHAR(20) NULL COMMENT 'CustCode de Oppen con el que se creó el anticipo';

-- Tarjetas que acepta la caja, con el PayMode de FP_CODE_MAP
INSERT IGNORE INTO medios_anticipos (nombre, activo, es_efectivo, paymode_oppen) VALUES
  ('VISA', 1, 0, 'VISA'),
  ('VISA DEBITO', 1, 0, 'VISAD'),
  ('VISA PREPAGO', 1, 0, 'VISA'),
  ('MASTERCARD', 1, 0, 'MASTE'),
  ('MASTERCARD DEBITO', 1, 0, 'MASTED'),
  ('MASTERCARD PREPAGO', 1, 0, 'MASTE'),
  ('CABAL', 1, 0, 'CABAL'),
  ('CABAL DEBITO', 1, 0, 'CABALD'),
  ('AMEX', 1, 0, 'AMEX'),
  ('MAESTRO', 1, 0, 'MAEST'),
  ('NARANJA', 1, 0, 'NARAN'),
  ('MAS DELIVERY', 1, 0, 'MASDL'),
  ('DINERS (DISCOVER)', 1, 0, 'DISCOVERY'),
  ('PAGOS INMEDIATOS', 1, 0, 'PAGOINMED');

-- Lemon y Passline dejan de ofrecerse (se desactivan, no se borran: hay anticipos históricos)
UPDATE medios_anticipos SET activo = 0 WHERE nombre IN ('Lemon', 'Passline');
