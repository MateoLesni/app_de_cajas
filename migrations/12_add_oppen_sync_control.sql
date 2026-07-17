-- =====================================================
-- Migración: Control de disparo único de la API Oppen
-- =====================================================
-- Regla de negocio: un local+fecha viaja vía API UNA SOLA VEZ.
-- Aunque se des-audite y se vuelva a auditar, no se re-dispara.
-- El flag sobrevive al des-auditado (por eso no vive en locales_auditados).
-- Correcciones posteriores se hacen manualmente en Oppen.
--
-- Para re-habilitar el disparo de una caja puntual (caso excepcional):
--   DELETE FROM oppen_sync_control WHERE local = 'X' AND fecha = 'YYYY-MM-DD';
--   (y limpiar sernr_oppen de las facturas/CC si corresponde regenerarlas)

CREATE TABLE IF NOT EXISTS oppen_sync_control (
  id INT AUTO_INCREMENT PRIMARY KEY,
  local VARCHAR(120) NOT NULL,
  fecha DATE NOT NULL,
  disparado TINYINT(1) NOT NULL DEFAULT 1,
  primera_ejecucion DATETIME NOT NULL,
  usuario VARCHAR(120) NULL,
  UNIQUE KEY uk_local_fecha (local, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill: toda caja que alguna vez tuvo un sync exitoso (contra test o prod)
-- queda bloqueada desde el arranque. Evita re-disparos sobre cajas con historia.
INSERT IGNORE INTO oppen_sync_control (local, fecha, disparado, primera_ejecucion, usuario)
SELECT local, fecha, 1, MIN(created_at), NULL
FROM oppen_sync_log
WHERE status = 'success'
  AND local IS NOT NULL
  AND fecha IS NOT NULL
GROUP BY local, fecha;
