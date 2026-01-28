-- ============================================================================
-- Migración: Agregar soporte para remesas en USD (Versión MySQL Cloud)
-- Fecha: 2026-01-28
-- Descripción: Agrega campos para manejar remesas en dólares estadounidenses
--              con conversión automática a pesos argentinos
--
-- IMPORTANTE: Ejecutar cada statement POR SEPARADO en MySQL Cloud
-- ============================================================================

-- PASO 1: Agregar columnas
-- Ejecutar este bloque primero:

ALTER TABLE remesas_trns
ADD COLUMN divisa VARCHAR(3) DEFAULT 'ARS' COMMENT 'Divisa de la remesa: ARS o USD',
ADD COLUMN monto_usd DECIMAL(10,2) NULL COMMENT 'Monto en dólares estadounidenses (solo si divisa=USD)',
ADD COLUMN cotizacion_divisa DECIMAL(10,2) NULL COMMENT 'Cotización del dólar en pesos (solo si divisa=USD)',
ADD COLUMN total_conversion DECIMAL(10,2) NULL COMMENT 'Total convertido a ARS (monto_usd * cotizacion_divisa)';

-- PASO 2: Crear índice
-- Ejecutar este statement:

CREATE INDEX idx_remesas_divisa ON remesas_trns(divisa);

-- PASO 3: Validar datos existentes
-- Ejecutar este statement:

UPDATE remesas_trns
SET divisa = 'ARS'
WHERE divisa IS NULL OR divisa = '';

-- PASO 4: Trigger INSERT
-- Ejecutar este statement completo (sin DELIMITER):

DROP TRIGGER IF EXISTS trg_remesas_calc_conversion_insert;

CREATE TRIGGER trg_remesas_calc_conversion_insert
BEFORE INSERT ON remesas_trns
FOR EACH ROW
BEGIN
    IF NEW.divisa = 'USD' AND NEW.monto_usd IS NOT NULL AND NEW.cotizacion_divisa IS NOT NULL THEN
        SET NEW.total_conversion = NEW.monto_usd * NEW.cotizacion_divisa;
    END IF;

    IF NEW.divisa = 'ARS' OR NEW.divisa IS NULL THEN
        SET NEW.divisa = 'ARS';
        SET NEW.monto_usd = NULL;
        SET NEW.cotizacion_divisa = NULL;
        SET NEW.total_conversion = NULL;
    END IF;
END;

-- PASO 5: Trigger UPDATE
-- Ejecutar este statement completo (sin DELIMITER):

DROP TRIGGER IF EXISTS trg_remesas_calc_conversion_update;

CREATE TRIGGER trg_remesas_calc_conversion_update
BEFORE UPDATE ON remesas_trns
FOR EACH ROW
BEGIN
    IF NEW.divisa = 'USD' AND NEW.monto_usd IS NOT NULL AND NEW.cotizacion_divisa IS NOT NULL THEN
        SET NEW.total_conversion = NEW.monto_usd * NEW.cotizacion_divisa;
    END IF;

    IF NEW.divisa = 'ARS' THEN
        SET NEW.monto_usd = NULL;
        SET NEW.cotizacion_divisa = NULL;
        SET NEW.total_conversion = NULL;
    END IF;

    IF NEW.divisa = 'USD' AND (NEW.monto_usd IS NULL OR NEW.cotizacion_divisa IS NULL) THEN
        SET NEW.total_conversion = NULL;
    END IF;
END;

-- ============================================================================
-- INSTRUCCIONES PARA MYSQL CLOUD:
-- ============================================================================
-- 1. Copiar PASO 1 (ALTER TABLE) y ejecutar
-- 2. Copiar PASO 2 (CREATE INDEX) y ejecutar
-- 3. Copiar PASO 3 (UPDATE) y ejecutar
-- 4. Copiar PASO 4 completo (DROP + CREATE TRIGGER INSERT) y ejecutar
-- 5. Copiar PASO 5 completo (DROP + CREATE TRIGGER UPDATE) y ejecutar
--
-- NOTAS:
-- - Si algún paso falla, no continuar con los siguientes
-- - Los triggers NO usan DELIMITER porque no es necesario en MySQL Cloud
-- - Verificar que cada statement se ejecutó correctamente antes de continuar
-- ============================================================================
