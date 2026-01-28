-- ============================================================================
-- Migración: Agregar soporte para remesas en USD
-- Fecha: 2026-01-28
-- Descripción: Agrega campos para manejar remesas en dólares estadounidenses
--              con conversión automática a pesos argentinos
-- ============================================================================

-- Agregar columna para identificar la divisa (ARS por defecto, USD para dólares)
ALTER TABLE remesas_trns
ADD COLUMN divisa VARCHAR(3) DEFAULT 'ARS' COMMENT 'Divisa de la remesa: ARS o USD';

-- Agregar columna para el monto en USD (NULL si es ARS)
ALTER TABLE remesas_trns
ADD COLUMN monto_usd DECIMAL(10,2) NULL COMMENT 'Monto en dólares estadounidenses (solo si divisa=USD)';

-- Agregar columna para la cotización del dólar (NULL si es ARS)
ALTER TABLE remesas_trns
ADD COLUMN cotizacion_divisa DECIMAL(10,2) NULL COMMENT 'Cotización del dólar en pesos (solo si divisa=USD)';

-- Agregar columna para el total en pesos convertido (NULL si es ARS, auto-calculado si es USD)
ALTER TABLE remesas_trns
ADD COLUMN total_conversion DECIMAL(10,2) NULL COMMENT 'Total convertido a ARS (monto_usd * cotizacion_divisa)';

-- Crear índice para búsquedas por divisa
CREATE INDEX idx_remesas_divisa ON remesas_trns(divisa);

-- ============================================================================
-- Trigger para auto-calcular total_conversion en INSERT
-- ============================================================================
DELIMITER $$

DROP TRIGGER IF EXISTS trg_remesas_calc_conversion_insert$$

CREATE TRIGGER trg_remesas_calc_conversion_insert
BEFORE INSERT ON remesas_trns
FOR EACH ROW
BEGIN
    -- Si es USD y hay monto_usd y cotización, calcular total_conversion
    IF NEW.divisa = 'USD' AND NEW.monto_usd IS NOT NULL AND NEW.cotizacion_divisa IS NOT NULL THEN
        SET NEW.total_conversion = NEW.monto_usd * NEW.cotizacion_divisa;
    END IF;

    -- Si es ARS, asegurar que los campos USD estén en NULL
    IF NEW.divisa = 'ARS' OR NEW.divisa IS NULL THEN
        SET NEW.divisa = 'ARS';
        SET NEW.monto_usd = NULL;
        SET NEW.cotizacion_divisa = NULL;
        SET NEW.total_conversion = NULL;
    END IF;
END$$

DELIMITER ;

-- ============================================================================
-- Trigger para auto-calcular total_conversion en UPDATE
-- ============================================================================
DELIMITER $$

DROP TRIGGER IF EXISTS trg_remesas_calc_conversion_update$$

CREATE TRIGGER trg_remesas_calc_conversion_update
BEFORE UPDATE ON remesas_trns
FOR EACH ROW
BEGIN
    -- Si es USD y hay monto_usd y cotización, recalcular total_conversion
    IF NEW.divisa = 'USD' AND NEW.monto_usd IS NOT NULL AND NEW.cotizacion_divisa IS NOT NULL THEN
        SET NEW.total_conversion = NEW.monto_usd * NEW.cotizacion_divisa;
    END IF;

    -- Si cambió a ARS, limpiar campos USD
    IF NEW.divisa = 'ARS' THEN
        SET NEW.monto_usd = NULL;
        SET NEW.cotizacion_divisa = NULL;
        SET NEW.total_conversion = NULL;
    END IF;

    -- Si cambió de ARS a USD pero no hay datos, limpiar total_conversion
    IF NEW.divisa = 'USD' AND (NEW.monto_usd IS NULL OR NEW.cotizacion_divisa IS NULL) THEN
        SET NEW.total_conversion = NULL;
    END IF;
END$$

DELIMITER ;

-- ============================================================================
-- Validar datos existentes (todas las remesas actuales son ARS)
-- ============================================================================
UPDATE remesas_trns
SET divisa = 'ARS'
WHERE divisa IS NULL OR divisa = '';

-- ============================================================================
-- Comentarios finales
-- ============================================================================
-- NOTAS IMPORTANTES:
-- 1. El campo 'importe' sigue siendo el monto base en ARS para remesas en pesos
-- 2. Para remesas USD, 'importe' puede quedarse en 0 o contener el monto original
--    pero el valor que impacta en DISCOVERY es 'total_conversion'
-- 3. Los triggers aseguran que total_conversion siempre esté sincronizado
-- 4. La integración con Oppen debe usar 'total_conversion' para remesas USD
-- 5. El reporte "Apertura AP USD" mostrará monto_usd y cotizacion_divisa
-- ============================================================================
