# Testing de Remesas USD - Guía Completa

## Resumen de Implementación

Se implementó soporte completo para remesas en USD con las siguientes características:

### 1. Campos en Base de Datos
- `divisa`: 'ARS' o 'USD' (default 'ARS')
- `monto_usd`: Monto en dólares (NULL si es ARS)
- `cotizacion_divisa`: Tipo de cambio (NULL si es ARS)
- `total_conversion`: Auto-calculado por trigger = `monto_usd * cotizacion_divisa`
- `estado_contable`: Flujo de estados (Local → TRAN → Contabilizada → Archivada)

### 2. Workflow de Estados
1. **Crear remesa** → `estado_contable = 'Local'` (físicamente en el local)
2. **Marcar retirada** → `estado_contable = 'TRAN'` (en tránsito/retirada)
3. **Contabilizar** → `estado_contable = 'Contabilizada'` (procesada)
4. **Archivar** → `estado_contable = 'Archivada'` (histórico)

### 3. Reportes Separados
- **Apertura AP**: Solo remesas ARS (`divisa IS NULL OR divisa = '' OR divisa = 'ARS'`)
- **Apertura AP USD**: Solo remesas USD (`divisa = 'USD'`)
- Ambos reportes filtran por `estado_contable = 'Local'` y `retirada = 0`

### 4. Integración Oppen/Discovery
✅ **Confirmado**: La integración usa `total_conversion` para remesas USD
- Archivo: `modules/oppen_integration.py`
- Líneas 718-729: Query de remesas usa CASE statement
- Líneas 808-818: Cálculo de efectivo_total usa total_conversion
- **Resultado**: Las remesas USD se envían a Oppen/Discovery convertidas a ARS

---

## Scripts de Testing

### Paso 1: Crear Remesa USD de Prueba

**Archivo**: `test_create_remesa_usd.sql`

Ejecutar este script para crear una remesa USD de prueba:
- Local: Local_Test
- Monto: USD $1,000.00
- Cotización: $1,150.00
- Total ARS: $1,150,000.00

**Resultado esperado**:
- ✅ Se crea la remesa con ID nuevo
- ✅ `total_conversion` = 1,150,000.00 (calculado por trigger)
- ✅ `estado_contable` = 'Local'
- ✅ `divisa` = 'USD'

---

### Paso 2: Verificar Reportes

**Archivo**: `test_verify_reportes.sql`

Ejecutar para verificar que la remesa aparece en los reportes correctos.

**Resultado esperado**:

#### Query 1: Remesa creada
✅ Debe mostrar la remesa TEST-USD-001 con todos los campos correctos

#### Query 2: Apertura AP (Solo ARS)
✅ Debe retornar **0** (la remesa USD NO debe aparecer aquí)

#### Query 3: Apertura AP USD (Solo USD)
✅ Debe retornar **1** (la remesa USD SÍ debe aparecer aquí)
✅ `total_usd` = 1000.00
✅ `total_conversion_ars` = 1150000.00

#### Query 4: Detalle en Apertura AP USD
✅ Debe mostrar todos los campos de la remesa

---

### Paso 3: Marcar como Retirada

**Archivo**: `test_mark_retirada.sql`

Ejecutar para simular el flujo de marcar la remesa como retirada.

**Resultado esperado**:

#### Query 1: ANTES de retirada
- `estado_contable` = 'Local'
- `retirada` = 0
- `retirada_por` = NULL
- `fecha_retirada` = NULL

#### Query 2: UPDATE (simula marcar retirada)
✅ Ejecuta el UPDATE que cambia estado

#### Query 3: DESPUÉS de retirada
- `estado_contable` = **'TRAN'** ✅ (cambió automáticamente)
- `retirada` = **1** ✅
- `retirada_por` = 'test_usuario'
- `fecha_retirada` = CURDATE()

#### Query 4: Apertura AP USD después de retirada
✅ Debe retornar **0** (la remesa ya NO aparece porque estado_contable = 'TRAN')

#### Query 5: Remesa en estado TRAN
✅ Debe retornar **1** (confirmando que está en estado TRAN)

---

## Verificación Manual en UI

### 1. Crear Remesa USD desde UI
1. Entrar como Auditor o Encargado
2. Ir a pestaña "Remesas"
3. Tildar "Son dólares (USD)" **ANTES** de ingresar montos
4. Ingresar:
   - Monto USD: 1000
   - Cotización: 1150
5. Verificar que "Total convertido" muestra: $1,150,000.00
6. Guardar remesa

**Verificar**:
- ✅ Remesa aparece en "Resumen de Caja"
- ✅ Remesa aparece en "Resumen Local" (acordeón Efectivo → Remesas)
- ✅ Al cambiar de pestaña, el checkbox "Son dólares" se destilda automáticamente

### 2. Verificar Reportes
1. Ir a "Apertura AP" (ARS)
   - ✅ La remesa USD **NO** debe aparecer
2. Ir a "Apertura AP USD"
   - ✅ La remesa USD **SÍ** debe aparecer en "Saldo a Retirar"
   - ✅ Monto en USD correcto
   - ✅ Cotización correcta

### 3. Marcar como Retirada
1. En la tabla de remesas, hacer clic en "Marcar Retirada"
2. Ingresar usuario que retira
3. Confirmar

**Verificar**:
- ✅ La remesa desaparece de "Apertura AP USD"
- ✅ En base de datos: `estado_contable` cambió a 'TRAN'

### 4. Verificar Integración Oppen
Cuando el local sea auditado y se sincronice con Oppen:
- ✅ La remesa USD se envía con el valor de `total_conversion` (ARS)
- ✅ En Oppen aparece como efectivo por $1,150,000.00 (no USD $1,000)

---

## Código Relevante - Integración Oppen

### modules/oppen_integration.py

**Líneas 718-729**: Query de remesas para medios de pago
```python
cur_pm.execute("""
    SELECT
        'REMESAS' AS forma_pago,
        CONCAT('Remesa ', nro_remesa) AS descripcion,
        CASE
            WHEN divisa = 'USD' AND total_conversion IS NOT NULL THEN total_conversion
            ELSE monto
        END AS pagado
    FROM remesas_trns
    WHERE local = %s
      AND DATE(fecha) = %s
""", (local, fecha))
```

**Líneas 808-818**: Cálculo de efectivo total
```python
cur_pm.execute("""
    SELECT COALESCE(SUM(
        CASE
            WHEN divisa = 'USD' AND total_conversion IS NOT NULL THEN total_conversion
            ELSE monto
        END
    ), 0) AS total
    FROM remesas_trns
    WHERE local = %s AND DATE(fecha) = %s
""", (local, fecha))
efectivo_total = float(cur_pm.fetchone()['total'] or 0.0)
```

✅ **Conclusión**: Todas las remesas USD se envían a Oppen convertidas a ARS usando `total_conversion`

---

## Limpieza después del Testing

Una vez completado el testing, eliminar la remesa de prueba:

```sql
DELETE FROM remesas_trns
WHERE nro_remesa = 'TEST-USD-001';
```

---

## Checklist de Testing Completo

- [ ] **Paso 1**: Crear remesa USD con script SQL
  - [ ] Verificar ID creado
  - [ ] Verificar total_conversion calculado
  - [ ] Verificar estado_contable = 'Local'

- [ ] **Paso 2**: Verificar reportes
  - [ ] Apertura AP NO muestra remesa USD ✅
  - [ ] Apertura AP USD SÍ muestra remesa USD ✅
  - [ ] Montos correctos en USD y ARS ✅

- [ ] **Paso 3**: Marcar retirada
  - [ ] Estado cambia a 'TRAN' ✅
  - [ ] Remesa desaparece de Apertura AP USD ✅
  - [ ] Remesa visible con estado TRAN en BD ✅

- [ ] **Paso 4**: Verificar código Oppen
  - [ ] Confirmar uso de total_conversion ✅
  - [ ] Confirmar envío en ARS a Discovery ✅

- [ ] **Paso 5**: Testing manual en UI
  - [ ] Crear remesa USD desde formulario ✅
  - [ ] Verificar auto-reset checkbox ✅
  - [ ] Verificar visualización en resúmenes ✅
  - [ ] Marcar retirada desde UI ✅

- [ ] **Paso 6**: Limpieza
  - [ ] Eliminar remesa TEST-USD-001 ✅

---

## Estado Actual

✅ **Implementación completa**
✅ **Scripts de testing creados**
✅ **Integración Oppen verificada**
⏳ **Pendiente**: Ejecutar testing manual

---

## Contacto para Dudas

- Script de creación: `test_create_remesa_usd.sql`
- Script de verificación: `test_verify_reportes.sql`
- Script de retirada: `test_mark_retirada.sql`
- Este documento: `TESTING_USD_REMESAS.md`
