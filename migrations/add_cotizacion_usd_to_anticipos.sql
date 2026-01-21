-- Agregar columna cotizacion_usd a la tabla anticipos_recibidos
-- Esta columna almacena la cotización del dólar al momento de crear el anticipo

ALTER TABLE anticipos_recibidos
ADD COLUMN cotizacion_usd DECIMAL(10,2) NULL
COMMENT 'Cotización del dólar en pesos al momento de crear el anticipo (solo para divisa USD)';

-- Comentario explicativo
-- Si divisa = 'USD' y cotizacion_usd = 1500, entonces:
-- - importe almacena los USD (ej: 100)
-- - cotizacion_usd almacena la cotización (ej: 1500)
-- - El monto en pesos es: importe * cotizacion_usd (ej: 150000)
