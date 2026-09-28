-- =====================================================
-- Migración: medio de pago de anticipos "Transferencia MP"
-- =====================================================
-- La cuenta (PayMode de Oppen) se configura desde la vista de Anticipos
-- ("PayModes Oppen"), en general o por local. Default genérico INTERC.
-- También lo aplica el módulo en runtime (_ensure_anticipos_oppen_columns).

INSERT IGNORE INTO medios_anticipos (nombre, activo, es_efectivo, paymode_oppen)
VALUES ('Transferencia MP', 1, 0, 'INTERC');
