-- =====================================================
-- Migración: ambiente Oppen en el que se creó cada anticipo
-- =====================================================
-- Los OnAccNr se solapan entre ngprueba y producción (ngprueba es copia).
-- Al auditar, el recibo solo consume anticipos cuyo oppen_url coincide con
-- el Oppen al que viaja el recibo; el resto se saltea (absorbido en DIFERENCIA).
-- También la crea el módulo en runtime (_ensure_anticipos_oppen_columns).

ALTER TABLE anticipos_recibidos
  ADD COLUMN oppen_url VARCHAR(120) NULL COMMENT 'BASE_URL de Oppen donde se creó el anticipo';
