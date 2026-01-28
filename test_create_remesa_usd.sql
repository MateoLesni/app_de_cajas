-- ============================================================================
-- Script de Testing: Crear remesa USD de prueba
-- Local: Local_Test
-- Monto: USD $1,000.00 a cotización $1,150.00 = ARS $1,150,000.00
-- ============================================================================

INSERT INTO remesas_trns
(usuario, local, caja, turno, fecha, nro_remesa, precinto, monto, retirada,
 divisa, monto_usd, cotizacion_divisa, estado_contable, ult_mod, estado)
VALUES
('test_auditor', 'Local_Test', 1, 'Mañana', CURDATE(), 'TEST-USD-001',
 'PRECINTO-TEST-001', 0, 0, 'USD', 1000.00, 1150.00, 'Local', NOW(), 'revision');

-- Verificar que se creó correctamente y que el trigger calculó total_conversion
SELECT
    id,
    local,
    nro_remesa,
    divisa,
    monto_usd,
    cotizacion_divisa,
    total_conversion,
    estado_contable,
    retirada,
    fecha
FROM remesas_trns
WHERE nro_remesa = 'TEST-USD-001'
ORDER BY id DESC
LIMIT 1;
