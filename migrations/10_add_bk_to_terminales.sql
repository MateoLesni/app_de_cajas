-- =====================================================
-- Migración: Flag BK en terminales
-- =====================================================
-- Permite marcar una terminal como "BK". Las tarjetas cargadas con esa
-- terminal se mapean a PayModes distintos al sincronizar con Oppen
-- (vía API automática o vía Carga Masiva).

ALTER TABLE terminales
  ADD COLUMN bk TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Si =1, las tarjetas con esta terminal usan PayModes BK alternativos en Oppen';
