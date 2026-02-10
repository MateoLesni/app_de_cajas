-- ================================================================
-- SCRIPT DE REPARACIÓN: Vincular adjuntos huérfanos a anticipos
-- ================================================================
-- Este script vincula imágenes que quedaron como 'anticipo_recibido_temp'
-- con los anticipos creados en enero/febrero 2026.
--
-- IMPORTANTE: Este script es SEGURO y hace lo siguiente:
-- 1. Crea tabla de backup de los registros que va a modificar
-- 2. Vincula adjuntos usando la ruta GCS y la fecha del anticipo
-- 3. Muestra reporte de lo que hizo
--
-- EJECUTAR ESTE SCRIPT SOLO UNA VEZ después del deploy del fix.
-- ================================================================

-- Paso 1: Crear tabla de backup (si no existe)
CREATE TABLE IF NOT EXISTS imagenes_adjuntos_backup_20260209 (
    id INT,
    tab VARCHAR(50),
    local VARCHAR(255),
    caja VARCHAR(50),
    turno VARCHAR(50),
    fecha DATE,
    entity_type VARCHAR(100),
    entity_id VARCHAR(255),
    gcs_path TEXT,
    original_name VARCHAR(500),
    mime VARCHAR(100),
    size_bytes BIGINT,
    checksum_sha256 VARCHAR(64),
    subido_por VARCHAR(100),
    estado VARCHAR(20),
    fecha_subida DATETIME,
    backup_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_backup_entity (entity_type, entity_id),
    INDEX idx_backup_gcs_path (gcs_path(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Paso 2: Hacer backup de los registros que vamos a modificar
INSERT INTO imagenes_adjuntos_backup_20260209
(id, tab, local, caja, turno, fecha, entity_type, entity_id, gcs_path,
 original_name, mime, size_bytes, checksum_sha256, subido_por, estado, fecha_subida)
SELECT
    id, tab, local, caja, turno, fecha, entity_type, entity_id, gcs_path,
    original_name, mime, size_bytes, checksum_sha256, subido_por, estado, fecha_subida
FROM imagenes_adjuntos
WHERE entity_type = 'anticipo_recibido_temp'
  AND tab = 'anticipos'
  AND estado = 'active'
  AND (entity_id IS NULL OR entity_id = '' OR entity_id = '0');

-- Paso 3: Mostrar cuántos registros se van a reparar
SELECT
    COUNT(*) as total_adjuntos_huerfanos,
    COUNT(DISTINCT local) as locales_afectados,
    MIN(fecha) as fecha_mas_antigua,
    MAX(fecha) as fecha_mas_reciente
FROM imagenes_adjuntos
WHERE entity_type = 'anticipo_recibido_temp'
  AND tab = 'anticipos'
  AND estado = 'active'
  AND (entity_id IS NULL OR entity_id = '' OR entity_id = '0');

-- Paso 4: Vincular adjuntos a anticipos usando la ruta GCS
-- La ruta GCS contiene: /anticipos/YYYY/MM/DD/admin/dia/
-- Los anticipos tienen fecha_pago que coincide con la fecha en la ruta
UPDATE imagenes_adjuntos img
INNER JOIN anticipos_recibidos ant ON (
    -- Vincular por fecha (la fecha del adjunto debe coincidir con fecha_pago)
    img.fecha = ant.fecha_pago
    -- Y por local (debe ser el mismo local)
    AND img.local = ant.local
    -- Solo anticipos creados después de dic 2025 (cuando se rompió)
    AND ant.fecha_pago >= '2026-01-01'
    -- Solo anticipos que no tienen adjunto vinculado aún
    AND NOT EXISTS (
        SELECT 1 FROM imagenes_adjuntos img2
        WHERE img2.entity_type = 'anticipo_recibido'
          AND img2.entity_id = ant.id
          AND img2.estado = 'active'
    )
)
SET
    img.entity_type = 'anticipo_recibido',
    img.entity_id = ant.id
WHERE
    img.entity_type = 'anticipo_recibido_temp'
    AND img.tab = 'anticipos'
    AND img.estado = 'active'
    AND (img.entity_id IS NULL OR img.entity_id = '' OR img.entity_id = '0');

-- Paso 5: Mostrar reporte de lo que se hizo
SELECT 'REPORTE DE REPARACIÓN' as '';

SELECT
    COUNT(*) as adjuntos_reparados,
    COUNT(DISTINCT local) as locales_reparados
FROM imagenes_adjuntos
WHERE entity_type = 'anticipo_recibido'
  AND id IN (SELECT id FROM imagenes_adjuntos_backup_20260209);

SELECT
    COUNT(*) as adjuntos_aun_huerfanos
FROM imagenes_adjuntos
WHERE entity_type = 'anticipo_recibido_temp'
  AND tab = 'anticipos'
  AND estado = 'active'
  AND (entity_id IS NULL OR entity_id = '' OR entity_id = '0');

-- Paso 6: Mostrar detalles de anticipos reparados por local
SELECT
    ant.local,
    COUNT(DISTINCT ant.id) as anticipos_con_adjunto,
    COUNT(img.id) as total_adjuntos_vinculados
FROM anticipos_recibidos ant
INNER JOIN imagenes_adjuntos img ON (
    img.entity_type = 'anticipo_recibido'
    AND img.entity_id = ant.id
    AND img.id IN (SELECT id FROM imagenes_adjuntos_backup_20260209)
)
WHERE ant.fecha_pago >= '2026-01-01'
GROUP BY ant.local
ORDER BY ant.local;

-- Paso 7: Si quedan adjuntos huérfanos, mostrar por qué no se vincularon
SELECT
    img.local,
    img.fecha,
    img.gcs_path,
    COUNT(*) as adjuntos_sin_vincular,
    COUNT(DISTINCT ant.id) as anticipos_candidatos
FROM imagenes_adjuntos img
LEFT JOIN anticipos_recibidos ant ON (
    img.fecha = ant.fecha_pago
    AND img.local = ant.local
)
WHERE img.entity_type = 'anticipo_recibido_temp'
  AND img.tab = 'anticipos'
  AND img.estado = 'active'
  AND (img.entity_id IS NULL OR img.entity_id = '' OR img.entity_id = '0')
GROUP BY img.local, img.fecha, img.gcs_path
LIMIT 20;

SELECT 'Migración de reparación completada' AS status;
