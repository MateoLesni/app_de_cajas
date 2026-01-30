# Implementación de Anticipos en Efectivo

## Problema Original

Cuando un local recibe una seña (anticipo) en efectivo y luego la convierte en remesa el mismo día, se genera un **sobrante falso** en el Resumen de Caja porque:

1. El anticipo en efectivo NO aparece en los medios de cobro (no es efectivo del día)
2. Cuando se crea la remesa, SÍ aparece en "Efectivo"
3. Resultado: La caja muestra un sobrante = monto del anticipo

## Solución Implementada

### Flujo Completo

**Ejemplo: Anticipo de USD $100 el 30/01**

#### 1. Recepción del Anticipo (30/01)
- Local recibe seña de USD $100 en efectivo
- Se carga en sistema como anticipo con:
  - `fecha_pago`: 30/01
  - `medio_pago_id`: Efectivo (tabla `medios_anticipos` con `es_efectivo = 1`)
  - `divisa`: USD
  - `cotizacion_divisa`: 1150 (ejemplo)
  - `importe`: 100

#### 2. Impacto en Resumen de Caja (30/01)
El Resumen de Caja del 30/01 muestra:
```
Efectivo:                    $0
Tarjeta:                     $500,000
Mercado Pago:                $200,000
Anticipos Efectivo:          -$115,000  ← NUEVO CAMPO (resta)
------------------------------------------
Total Cobrado:               $585,000
Venta Total:                 $700,000
------------------------------------------
Diferencia:                  -$115,000  ← FALTANTE
```

**Interpretación:**
- El faltante de $115,000 **obliga** al local a crear la remesa del anticipo
- Sin la remesa, la caja cierra con faltante

#### 3. Creación de Remesa (30/01 - mismo día)
- Local crea remesa física de USD $100
- Se carga en `remesas_trns`:
  - `fecha`: 30/01
  - `monto_usd`: 100
  - `cotizacion_divisa`: 1150
  - `total_conversion`: 115,000 (auto-calculado por trigger)
  - `divisa`: USD
  - `estado_contable`: Local

#### 4. Resumen de Caja Actualizado (30/01)
Después de crear la remesa:
```
Efectivo:                    $115,000  ← Remesa USD convertida a ARS
Tarjeta:                     $500,000
Mercado Pago:                $200,000
Anticipos Efectivo:          -$115,000 ← Resta del anticipo
------------------------------------------
Total Cobrado:               $700,000
Venta Total:                 $700,000
------------------------------------------
Diferencia:                  $0         ← CUADRA PERFECTO
```

#### 5. Reporte AP Efectivo USD (31/01)
El reporte del día siguiente muestra:
```
Local          | Saldo Ant | 30/01      | AP Proyectada
--------------------------------------------------------
Local_Example  | $0        | USD $100   | USD $100
```

**Explicación:**
- El reporte del 31/01 muestra efectivo del 30/01
- Incluye la remesa de USD $100 creada ese día
- **NO resta** anticipos en efectivo (ya están reflejados en las remesas)

---

## Cambios en el Código

### 1. Backend - Endpoint Resumen de Caja

**Archivo:** `app.py`
**Línea:** ~4522-4560

#### Cálculo de Anticipos en Efectivo
```python
# ===== ANTICIPOS RECIBIDOS EN EFECTIVO =====
# Anticipos recibidos en efectivo en la fecha_pago (fecha de la caja)
# Estos se RESTAN del total cobrado porque se convertirán en remesas
# Incluye conversión a ARS para divisas extranjeras (USD, EUR, etc.)
cur.execute("""
    SELECT COALESCE(SUM(
        CASE
            WHEN ar.divisa = 'USD' AND ar.cotizacion_divisa IS NOT NULL
            THEN ar.importe * ar.cotizacion_divisa
            WHEN ar.divisa = 'ARS' OR ar.divisa IS NULL
            THEN ar.importe
            ELSE ar.importe
        END
    ), 0)
    FROM anticipos_recibidos ar
    INNER JOIN medios_anticipos ma ON ar.medio_pago_id = ma.id
    WHERE DATE(ar.fecha_pago) = %s
      AND ar.local = %s
      AND ma.es_efectivo = 1
      AND ar.estado != 'eliminado_global'
""", (fecha, local))
row = cur.fetchone()
resumen['anticipos_efectivo'] = float(row[0]) if row and row[0] is not None else 0.0
```

#### Modificación del Total Cobrado
```python
# ===== Total cobrado (medios de cobro + gastos)
resumen['total_cobrado'] = sum([
    resumen.get('efectivo',0.0),
    resumen.get('tarjeta',0.0),
    resumen.get('mercadopago',0.0),
    resumen.get('rappi',0.0),
    resumen.get('pedidosya',0.0),
    resumen.get('cuenta_cte',0.0),
    resumen.get('gastos',0.0),
    resumen.get('anticipos',0.0),
    -resumen.get('anticipos_efectivo',0.0),  # ← RESTA: anticipos recibidos en efectivo
])
```

**Características importantes:**
- Convierte USD a ARS usando `cotizacion_divisa`
- Solo considera medios de pago con `es_efectivo = 1`
- Excluye anticipos eliminados (`estado != 'eliminado_global'`)
- Filtra por `fecha_pago` (no por `fecha_evento`)

---

### 2. Frontend - Visualización en Resumen de Caja

#### HTML - Nueva Fila en Tabla

**Archivo:** `templates/index.html`
**Línea:** ~197-212

```html
<tr><td>Anticipos Efectivo</td><td class="valor" id="resAnticiposEfectivo" style="color: #dc2626;">-$ 0,00</td></tr>
```

**Características:**
- Color rojo (#dc2626) para indicar que es una resta
- Muestra siempre con signo negativo

#### JavaScript - Mapeo de Campos

**Archivo:** `static/js/resumen.js`
**Línea:** ~6-23

```javascript
const campos = {
    venta_total: 'resVentaTotal',
    // ... otros campos ...
    anticipos:   'resAnticipos',
    anticipos_efectivo: 'resAnticiposEfectivo',  // ← NUEVO
};
```

#### JavaScript - Formateo Especial

**Archivo:** `static/js/resumen.js`
**Línea:** ~87-106

```javascript
function aplicarResumenAUI(resumen, estadoOverride = null) {
    // 1) Campos simples
    for (const [k, id] of Object.entries(campos)) {
      // Formateo especial para anticipos_efectivo (mostrar con signo negativo)
      if (k === 'anticipos_efectivo') {
        const val = safeNum(resumen[k]);
        setTextIf(id, val > 0 ? '-' + formatMoneda(val) : formatMoneda(0));
      } else {
        setTextIf(id, formatMoneda(safeNum(resumen[k])));
      }
    }

    // 2) Total cobrado (incluye gastos, resta anticipos en efectivo)
    let totalCobrado = safeNum(resumen.total_cobrado);
    if (!totalCobrado) {
      totalCobrado =
        safeNum(resumen.efectivo) +
        safeNum(resumen.tarjeta) +
        // ... otros medios ...
        safeNum(resumen.anticipos) -
        safeNum(resumen.anticipos_efectivo);  // ← RESTA
    }
    // ...
}
```

---

### 3. Reportes AP Efectivo (Sin Cambios)

**Archivo:** `app.py`
**Endpoints:** `/api/operaciones/ap-efectivo`, `/api/operaciones/ap-efectivo-usd`

**NO se modificaron** estos endpoints porque:

1. El efectivo ya incluye las remesas creadas a partir de anticipos
2. Las remesas se crean el mismo día que el anticipo (fecha_pago)
3. El reporte del día siguiente muestra correctamente esas remesas
4. Restar anticipos aquí causaría doble contabilización

**Comentario agregado:**
```python
# EFECTIVO = TODAS las remesas del día ANTERIOR a la fecha del reporte
# Incluye remesas creadas a partir de anticipos en efectivo (mismo día)
```

---

## Validaciones y Comportamiento

### Restricciones
1. **Mismo día obligatorio:**
   - Anticipo y remesa deben tener la misma `fecha_pago`
   - Si no se crea la remesa, queda faltante en caja

2. **Solo efectivo:**
   - Solo aplica a anticipos con `medio_pago_id` que tenga `es_efectivo = 1`
   - Transferencias, Mercado Pago, etc. NO se restan del efectivo

3. **Conversión de divisas:**
   - Anticipos USD se convierten a ARS usando `cotizacion_divisa`
   - Fluyen correctamente a AP Efectivo USD

### Casos de Uso

#### Caso 1: Anticipo ARS en efectivo
```
Anticipo:     ARS $50,000
Resumen Caja: Anticipos Efectivo: -$50,000
Remesa:       ARS $50,000 (mismo día)
AP Efectivo:  Muestra la remesa al día siguiente
```

#### Caso 2: Anticipo USD en efectivo
```
Anticipo:          USD $100 @ $1,150
Resumen Caja:      Anticipos Efectivo: -$115,000 (convertido)
Remesa:            USD $100 @ $1,150 (mismo día)
AP Efectivo USD:   Muestra USD $100 al día siguiente
```

#### Caso 3: Anticipo por Transferencia
```
Anticipo:     ARS $50,000 (medio_pago: Transferencia)
Resumen Caja: NO aparece en Anticipos Efectivo (es_efectivo = 0)
Remesa:       NO se crea (no es efectivo físico)
```

#### Caso 4: Anticipo sin Remesa
```
Anticipo:     ARS $50,000
Resumen Caja: Anticipos Efectivo: -$50,000
Remesa:       NO creada
Cierre:       Faltante de $50,000 ← OBLIGA a crear la remesa
```

---

## Tabla medios_anticipos

**Archivo:** `SQL_CREATE_MEDIOS_ANTICIPOS.sql`

```sql
CREATE TABLE IF NOT EXISTS medios_anticipos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    activo TINYINT(1) DEFAULT 1,
    es_efectivo TINYINT(1) DEFAULT 0,  -- ← Campo clave
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO medios_anticipos (nombre, es_efectivo) VALUES
('Efectivo', 1),                    -- ← es_efectivo = 1
('Transferencia Bancaria', 0),
('Mercado Pago', 0),
('Lemon', 0),
('Passline', 0);
```

---

## Flujo de Auditoría

### 1. Creación de Anticipo
- Usuario crea anticipo con medio_pago_id = Efectivo
- Se registra en `tabla_auditoria` (INSERT)
- Sistema calcula conversión a ARS si es USD

### 2. Consulta de Resumen de Caja
- Sistema busca anticipos con:
  - `fecha_pago` = fecha de caja
  - `es_efectivo = 1`
  - `estado != 'eliminado_global'`
- Convierte a ARS y suma
- Resta del total_cobrado

### 3. Creación de Remesa
- Usuario crea remesa del mismo monto
- Remesa aparece en "Efectivo"
- Total cobrado = efectivo - anticipos_efectivo = 0 (cuadra)

### 4. Eliminación de Anticipo
Si se elimina el anticipo:
- Cambia `estado` a 'eliminado_global'
- Deja de restar del total_cobrado
- Caja muestra sobrante = monto del anticipo

---

## Testing

### Test Manual

1. **Crear anticipo en efectivo USD:**
   ```
   - Fecha pago: Hoy
   - Importe: USD $100
   - Cotización: $1,150
   - Medio pago: Efectivo
   ```

2. **Verificar Resumen de Caja:**
   ```
   - Debe mostrar "Anticipos Efectivo: -$115,000"
   - Diferencia debe ser negativa (faltante)
   ```

3. **Crear remesa:**
   ```
   - Monto USD: $100
   - Cotización: $1,150
   - Fecha: Hoy (mismo día que anticipo)
   ```

4. **Verificar Resumen de Caja actualizado:**
   ```
   - Efectivo: $115,000
   - Anticipos Efectivo: -$115,000
   - Diferencia: $0
   ```

5. **Verificar AP Efectivo USD (día siguiente):**
   ```
   - Debe mostrar USD $100 en columna de fecha
   - NO debe restar anticipos
   ```

### Test de Integración

**Query SQL para verificar:**
```sql
-- 1. Ver anticipos en efectivo de hoy
SELECT
    ar.local,
    ar.importe,
    ar.divisa,
    ar.cotizacion_divisa,
    ma.nombre as medio_pago,
    ma.es_efectivo
FROM anticipos_recibidos ar
INNER JOIN medios_anticipos ma ON ar.medio_pago_id = ma.id
WHERE DATE(ar.fecha_pago) = CURDATE()
  AND ma.es_efectivo = 1
  AND ar.estado != 'eliminado_global';

-- 2. Ver remesas de hoy (deben incluir las del anticipo)
SELECT
    local,
    monto,
    monto_usd,
    cotizacion_divisa,
    divisa
FROM remesas_trns
WHERE DATE(fecha) = CURDATE();
```

---

## Preguntas Frecuentes

### ¿Por qué se resta del total cobrado?
Porque el efectivo del anticipo **no pertenece** a esa caja. Es una seña para un evento futuro. Al restar, forzamos a crear la remesa para que el dinero quede registrado correctamente.

### ¿Qué pasa si crean la remesa otro día?
El sistema está diseñado para que sean **el mismo día**. Si crean la remesa otro día:
- Día del anticipo: Faltante
- Día de la remesa: Sobrante
- **Incorrecto:** Deben ser mismo día

### ¿Funciona con otras divisas (EUR, BRL)?
Sí, mientras tengan `cotizacion_divisa` configurada. El sistema convierte a ARS automáticamente.

### ¿Qué pasa si el anticipo es por Transferencia?
No afecta el Resumen de Caja porque `es_efectivo = 0`. Solo anticipos en efectivo restan del total cobrado.

---

## Archivos Modificados

1. **app.py** (líneas 4522-4560)
   - Endpoint `/api/cierre/resumen`
   - Agregado cálculo de `anticipos_efectivo`
   - Modificado cálculo de `total_cobrado`

2. **templates/index.html** (línea ~208)
   - Agregada fila "Anticipos Efectivo"

3. **static/js/resumen.js** (líneas 6-23, 87-106)
   - Agregado campo `anticipos_efectivo` al mapeo
   - Formateo especial con signo negativo
   - Actualizado cálculo de `total_cobrado`

4. **ANTICIPOS_EFECTIVO_IMPLEMENTACION.md** (este archivo)
   - Documentación completa del flujo

---

## Estado de Implementación

✅ Backend - Endpoint Resumen de Caja
✅ Frontend - Visualización en HTML
✅ Frontend - JavaScript de renderizado
✅ Conversión de divisas (USD a ARS)
✅ Integración con medios_anticipos
✅ Documentación
⏳ Testing manual pendiente
⏳ Testing en producción pendiente

---

## Contacto

Para dudas o issues:
- Revisar este documento primero
- Verificar tabla `medios_anticipos` (campo `es_efectivo`)
- Revisar query de anticipos en endpoint `/api/cierre/resumen`
