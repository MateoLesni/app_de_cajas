-- Agregar columna cotizacion_divisa a la tabla anticipos_recibidos
-- Esta columna almacena la cotización de cualquier divisa extranjera al momento de crear el anticipo

ALTER TABLE anticipos_recibidos
ADD COLUMN cotizacion_divisa DECIMAL(10,2) NULL
COMMENT 'Cotización de la divisa en pesos al momento de crear el anticipo (USD, EUR, BRL, etc.)';

-- Comentario explicativo
-- Ejemplos de uso:
-- 1. divisa = 'USD', cotizacion_divisa = 1500:
--    - importe = 100 (USD)
--    - Monto en pesos = 100 * 1500 = $150,000
-- 2. divisa = 'EUR', cotizacion_divisa = 1650:
--    - importe = 50 (EUR)
--    - Monto en pesos = 50 * 1650 = $82,500
-- 3. divisa = 'ARS', cotizacion_divisa = NULL:
--    - importe = 10000 (ARS)
--    - Monto en pesos = 10000 (sin conversión)
