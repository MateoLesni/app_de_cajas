-- ================================================================
-- MIGRACIÓN: Cambiar entity_id de INT a VARCHAR para soportar IDs temporales
-- ================================================================
-- La columna entity_id en imagenes_adjuntos necesita aceptar tanto:
-- - IDs numéricos (cuando ya está vinculado): "123"
-- - IDs temporales UUID (antes de vincular): "temp_1234_abc"
--
-- Actualmente es INT, lo que causa errores al intentar insertar
-- strings temporales durante la carga de imágenes.
-- ================================================================

-- Cambiar el tipo de columna de INT a VARCHAR(255)
ALTER TABLE imagenes_adjuntos
MODIFY COLUMN entity_id VARCHAR(255) NULL;

-- Verificar el cambio
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'imagenes_adjuntos'
  AND COLUMN_NAME = 'entity_id';

SELECT 'Migración completada: entity_id ahora es VARCHAR(255)' AS status;
