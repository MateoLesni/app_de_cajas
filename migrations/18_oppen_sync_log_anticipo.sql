-- =====================================================
-- Migración: oppen_sync_log.sync_type admite 'anticipo'
-- =====================================================
-- El ENUM original no incluía 'anticipo': los INSERT del log de envío de
-- anticipos a Oppen fallaban en silencio y no quedaba rastro del payload.
-- También la aplica el módulo en runtime (_ensure_anticipos_oppen_columns).

ALTER TABLE oppen_sync_log
  MODIFY sync_type ENUM('factura','cuenta_corriente','recibo','anticipo') NOT NULL;
