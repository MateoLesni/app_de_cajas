# Análisis: Cálculo de Diferencia - Resumen Local vs Cajas Individuales

## Resumen Ejecutivo

El cálculo de "Diferencia" funciona de manera **idéntica** tanto a nivel local como por caja individual:

```
Diferencia = Total Cobrado - Venta Total
```

Donde:
```
Total Cobrado = Efectivo + Tarjetas + MP + Rappi + PedidosYa + Cta Cte + Gastos + Anticipos Consumidos - Anticipos en Efectivo
```

---

## 1. Resumen de Caja Individual

### Endpoint: `/api/cierre/resumen`

**Parámetros:** `fecha`, `local`, `caja`, `turno`

**Cálculo (líneas 4646-4662):**
```python
resumen['total_cobrado'] = sum([
    resumen.get('efectivo',0.0),         # Remesas en efectivo
    resumen.get('tarjeta',0.0),          # Tarjetas
    resumen.get('mercadopago',0.0),      # MercadoPago
    resumen.get('rappi',0.0),            # Rappi
    resumen.get('pedidosya',0.0),        # PedidosYa
    resumen.get('cuenta_cte',0.0),       # Cuenta corriente
    resumen.get('gastos',0.0),           # Gastos (justifican ventas)
    resumen.get('anticipos',0.0),        # Anticipos consumidos
    -resumen.get('anticipos_efectivo',0.0),  # RESTA anticipos recibidos
])
```

**Filtros:**
- `DATE(ar.fecha_pago) = %s` - Fecha específica
- `ar.local = %s` - Local específico
- `ar.caja = %s` - **Caja específica**
- `(ar.turno = %s OR ar.turno IS NULL)` - **Turno específico** (incluye NULL para retrocompatibilidad)
- `ma.es_efectivo = 1` - Solo anticipos en efectivo
- `ar.estado != 'eliminado_global'` - Excluye eliminados

**Frontend: `resumen.js` (líneas 99-113)**
```javascript
let totalCobrado = safeNum(resumen.total_cobrado);
if (!totalCobrado) {
  totalCobrado =
    safeNum(resumen.efectivo) +
    safeNum(resumen.tarjeta) +
    safeNum(resumen.mercadopago) +
    safeNum(resumen.rappi) +
    safeNum(resumen.pedidosya) +
    safeNum(resumen.cuenta_cte) +
    safeNum(resumen.facturas_cc) +
    safeNum(resumen.gastos) +
    safeNum(resumen.anticipos) -
    safeNum(resumen.anticipos_efectivo);  // RESTA
}

const diferencia = totalCobrado - ventaTotal;
```

---

## 2. Resumen Local (Agregado)

### Endpoint: `/api/resumen_local`

**Parámetros:** `fecha`, `local`, `source` (opcional)

**Cálculo (líneas 6375-6385):**
```python
total_cobrado = float(sum([
    efectivo_neto or 0.0,           # Remesas (suma todas las cajas)
    tarjeta_total or 0.0,           # Tarjetas (suma todas las cajas)
    mp_total or 0.0,                # MercadoPago (suma todas)
    rappi_total or 0.0,             # Rappi (suma todas)
    pedidosya_total or 0.0,         # PedidosYa (suma todas)
    cta_cte_total or 0.0,           # Cuenta corriente
    gastos_total or 0.0,            # Gastos
    anticipos_total or 0.0,         # Anticipos consumidos
    -anticipos_efectivo_total,      # RESTA anticipos recibidos
]))
```

**Filtros para `anticipos_efectivo_total` (líneas 6350-6368):**
- `DATE(ar.fecha_pago) = %s` - Fecha específica
- `ar.local = %s` - Local específico
- **NO filtra por caja** - Suma todas las cajas del local
- **NO filtra por turno** - Suma todos los turnos
- `ma.es_efectivo = 1` - Solo anticipos en efectivo
- `ar.estado != 'eliminado_global'` - Excluye eliminados

**Frontend: `resumen_local.js` (líneas 135-138)**
```javascript
// --- RESUMEN ---
const r = data?.resumen || {};
setMoneyWithCopy("rl-venta-total", r.venta_total);
setMoneyWithCopy("rl-total-cobrado", r.total_cobrado);
setMoneyWithCopy("rl-diferencia", r.diferencia);
```

**Payload del API (líneas 6416-6420):**
```python
"resumen": {
    "venta_total": float(venta_total or 0.0),
    "total_cobrado": total_cobrado,
    "diferencia": total_cobrado - float(venta_total or 0.0),
    "diferencias_detalle": diferencias_detalle
}
```

---

## 3. Diferencias Detalladas por Caja/Turno

### Función: `_get_diferencias_detalle()`

**Propósito:** Calcular diferencias individuales por cada (caja, turno) para mostrar en el acordeón de "Diferencias Detalladas".

**Cálculo (líneas 5812-5935):**

```python
# Para cada caja/turno del local:
venta_total = SUM(venta_total_sistema) FROM ventas_trns WHERE caja=%s AND turno=%s

total_cobrado = 0

# Sumar cada medio de cobro
total_cobrado += efectivo (remesas)
total_cobrado += tarjetas
total_cobrado += mercadopago
total_cobrado += rappi
total_cobrado += pedidosya
total_cobrado += cuenta_cte (CC viejas + nuevas)
total_cobrado += gastos
total_cobrado += anticipos consumidos

# RESTAR anticipos en efectivo (FIX APLICADO)
anticipos_efectivo = SUM(...) WHERE caja=%s AND turno=%s
total_cobrado -= anticipos_efectivo

# Calcular diferencia
diferencia = total_cobrado - venta_total

# Solo agregar si diferencia != 0
if abs(diferencia) > 0.01:
    resultado.append({
        'caja': caja,
        'turno': turno,
        'diferencia': diferencia,
        'descargo': observacion
    })
```

**Filtros para anticipos:**
- `DATE(ar.fecha_pago) = %s`
- `ar.local = %s`
- `ar.caja = %s` - **Caja específica**
- `(ar.turno = %s OR ar.turno IS NULL)` - **Turno específico**
- `ma.es_efectivo = 1`
- `ar.estado != 'eliminado_global'`

---

## 4. Diferencia: Matemática del Cálculo

### Ejemplo Numérico

**Local con 2 cajas:**

#### Caja 1 (Turno Día):
```
Venta Total: $100,000
Efectivo (remesa): $50,000
Tarjetas: $30,000
Anticipos en efectivo recibidos: $10,000

Total Cobrado = $50,000 + $30,000 - $10,000 = $70,000
Diferencia = $70,000 - $100,000 = -$30,000 (FALTANTE)
```

#### Caja 2 (Turno Noche):
```
Venta Total: $200,000
Efectivo (remesa): $150,000
Tarjetas: $50,000
Anticipos en efectivo recibidos: $0

Total Cobrado = $150,000 + $50,000 - $0 = $200,000
Diferencia = $200,000 - $200,000 = $0 (CUADRA)
```

#### Resumen Local:
```
Venta Total: $300,000 ($100k + $200k)
Efectivo: $200,000 ($50k + $150k)
Tarjetas: $80,000 ($30k + $50k)
Anticipos en efectivo: $10,000 ($10k + $0)

Total Cobrado = $200,000 + $80,000 - $10,000 = $270,000
Diferencia = $270,000 - $300,000 = -$30,000 (FALTANTE)
```

**Verificación:**
```
Suma de diferencias individuales:
Caja 1: -$30,000
Caja 2: $0
Total: -$30,000 ✅ COINCIDE con Resumen Local
```

---

## 5. Posibles Causas de Inconsistencia

Después del fix aplicado (`f4d9283`), las diferencias **DEBERÍAN coincidir** siempre. Si hay discrepancias, las causas pueden ser:

### 5.1. Anticipos sin Caja Asignada

**Problema:**
- Anticipos antiguos o creados antes del fix pueden tener `caja = NULL`
- Estos anticipos **SÍ** afectan el resumen local (se suman a todos)
- **NO** afectan el resumen de ninguna caja específica (porque filtran por caja)

**Detección:**
```sql
SELECT COUNT(*), SUM(importe)
FROM anticipos_recibidos ar
INNER JOIN medios_anticipos ma ON ar.medio_pago_id = ma.id
WHERE DATE(ar.fecha_pago) = '2026-01-31'
  AND ar.local = 'Narda Sucre'
  AND ar.caja IS NULL  -- SIN CAJA
  AND ma.es_efectivo = 1
  AND ar.estado != 'eliminado_global';
```

**Solución:**
1. Asignar caja manualmente a estos anticipos
2. O excluirlos del cálculo agregando filtro `AND ar.caja IS NOT NULL` en resumen local

---

### 5.2. Anticipos sin Turno en Locales Multi-turno

**Problema:**
- Local tiene turnos múltiples (Día/Noche)
- Anticipos antiguos tienen `turno = NULL`
- El filtro `(ar.turno = %s OR ar.turno IS NULL)` los incluye en AMBOS turnos

**Ejemplo:**
```
Anticipo: $10,000 (caja = Caja 1, turno = NULL)

Caja 1 - Turno Día:
  Anticipo efectivo = $10,000 (incluye NULL)

Caja 1 - Turno Noche:
  Anticipo efectivo = $10,000 (incluye NULL)

Resumen Local:
  Anticipo efectivo = $10,000 (suma sin filtrar turno)

PROBLEMA: Aparece duplicado en cajas individuales
```

**Detección:**
```sql
SELECT ar.local, ar.caja, ar.turno, COUNT(*), SUM(importe)
FROM anticipos_recibidos ar
INNER JOIN medios_anticipos ma ON ar.medio_pago_id = ma.id
WHERE DATE(ar.fecha_pago) = '2026-01-31'
  AND ar.local = 'Narda Sucre'
  AND ar.turno IS NULL  -- SIN TURNO
  AND ma.es_efectivo = 1
  AND ar.estado != 'eliminado_global'
GROUP BY ar.local, ar.caja, ar.turno;
```

**Solución:**
1. Cambiar filtro en resumen de caja a `AND ar.turno = %s` (excluir NULL)
2. O asignar turno a anticipos antiguos

---

### 5.3. Conversión USD Incorrecta

**Problema:**
- Anticipo en USD sin `cotizacion_divisa` o con cotización incorrecta
- Backend usa cotización diferente en resumen local vs caja individual

**Detección:**
```sql
SELECT ar.id, ar.importe, ar.divisa, ar.cotizacion_divisa,
       CASE
         WHEN ar.divisa = 'USD' AND ar.cotizacion_divisa IS NOT NULL
         THEN ar.importe * ar.cotizacion_divisa
         ELSE ar.importe
       END as importe_ars
FROM anticipos_recibidos ar
INNER JOIN medios_anticipos ma ON ar.medio_pago_id = ma.id
WHERE DATE(ar.fecha_pago) = '2026-01-31'
  AND ar.local = 'Narda Sucre'
  AND ar.divisa = 'USD'
  AND ma.es_efectivo = 1;
```

**Validación:**
- Verificar que `cotizacion_divisa` coincide con la de las remesas USD del mismo día

---

### 5.4. Caché del Frontend

**Problema:**
- Frontend usa datos en caché
- Backend ya tiene el fix pero frontend muestra datos viejos

**Solución:**
- Forzar refresh (Ctrl+F5)
- Verificar que la request incluye `&_t=timestamp` para bypass de caché
- Verificar headers `Cache-Control: no-store`

---

### 5.5. Tablas Snapshot vs Normales

**Problema:**
- Resumen local puede usar tablas `snap_*` (datos del cierre)
- Anticipos **NO** tienen snapshot todavía
- Siempre se consultan de tablas normales

**Escenario:**
```
Local cerrado → Usa snap_ventas, snap_tarjetas, etc.
Anticipos → SIEMPRE usa anticipos_recibidos (normal)

Si después del cierre se edita un anticipo:
- Resumen local lo verá (tabla normal)
- Diferencias detalladas también (tabla normal)
- DEBERÍA ser consistente
```

**Nota:** Los anticipos siempre se consultan de tablas normales tanto en modo "operación" como "admin" (líneas 6158-6174).

---

## 6. Query de Diagnóstico Completo

Para diagnosticar inconsistencias, ejecutar:

```sql
-- ==========================================
-- DIAGNÓSTICO: Resumen Local vs Cajas
-- ==========================================

SET @fecha = '2026-01-31';
SET @local = 'Narda Sucre';

-- 1. Anticipos en efectivo a nivel LOCAL
SELECT
    'RESUMEN LOCAL' as nivel,
    NULL as caja,
    NULL as turno,
    COUNT(*) as cantidad,
    SUM(CASE
        WHEN ar.divisa = 'USD' AND ar.cotizacion_divisa IS NOT NULL
        THEN ar.importe * ar.cotizacion_divisa
        ELSE ar.importe
    END) as total_anticipos_efectivo
FROM anticipos_recibidos ar
INNER JOIN medios_anticipos ma ON ar.medio_pago_id = ma.id
WHERE DATE(ar.fecha_pago) = @fecha
  AND ar.local = @local
  AND ma.es_efectivo = 1
  AND ar.estado != 'eliminado_global'

UNION ALL

-- 2. Anticipos en efectivo por CAJA/TURNO
SELECT
    'CAJA INDIVIDUAL' as nivel,
    ar.caja,
    ar.turno,
    COUNT(*) as cantidad,
    SUM(CASE
        WHEN ar.divisa = 'USD' AND ar.cotizacion_divisa IS NOT NULL
        THEN ar.importe * ar.cotizacion_divisa
        ELSE ar.importe
    END) as total_anticipos_efectivo
FROM anticipos_recibidos ar
INNER JOIN medios_anticipos ma ON ar.medio_pago_id = ma.id
WHERE DATE(ar.fecha_pago) = @fecha
  AND ar.local = @local
  AND ma.es_efectivo = 1
  AND ar.estado != 'eliminado_global'
GROUP BY ar.caja, ar.turno

ORDER BY nivel, caja, turno;

-- 3. Verificar que la suma de cajas = total local
SELECT
    SUM(CASE
        WHEN ar.divisa = 'USD' AND ar.cotizacion_divisa IS NOT NULL
        THEN ar.importe * ar.cotizacion_divisa
        ELSE ar.importe
    END) as suma_por_cajas
FROM anticipos_recibidos ar
INNER JOIN medios_anticipos ma ON ar.medio_pago_id = ma.id
WHERE DATE(ar.fecha_pago) = @fecha
  AND ar.local = @local
  AND ma.es_efectivo = 1
  AND ar.estado != 'eliminado_global'
GROUP BY ar.id; -- Agrupar por ID para evitar duplicados por turno NULL

-- 4. Detectar anticipos problemáticos
SELECT
    'SIN CAJA' as problema,
    ar.id,
    ar.cliente,
    ar.importe,
    ar.divisa,
    ar.caja,
    ar.turno
FROM anticipos_recibidos ar
INNER JOIN medios_anticipos ma ON ar.medio_pago_id = ma.id
WHERE DATE(ar.fecha_pago) = @fecha
  AND ar.local = @local
  AND ma.es_efectivo = 1
  AND ar.estado != 'eliminado_global'
  AND ar.caja IS NULL

UNION ALL

SELECT
    'SIN TURNO (multi-turno)' as problema,
    ar.id,
    ar.cliente,
    ar.importe,
    ar.divisa,
    ar.caja,
    ar.turno
FROM anticipos_recibidos ar
INNER JOIN medios_anticipos ma ON ar.medio_pago_id = ma.id
INNER JOIN locales l ON ar.local = l.local
WHERE DATE(ar.fecha_pago) = @fecha
  AND ar.local = @local
  AND ma.es_efectivo = 1
  AND ar.estado != 'eliminado_global'
  AND ar.turno IS NULL
  AND l.turnos LIKE '%,%'  -- Local con múltiples turnos

UNION ALL

SELECT
    'USD SIN COTIZACIÓN' as problema,
    ar.id,
    ar.cliente,
    ar.importe,
    ar.divisa,
    ar.caja,
    ar.turno
FROM anticipos_recibidos ar
INNER JOIN medios_anticipos ma ON ar.medio_pago_id = ma.id
WHERE DATE(ar.fecha_pago) = @fecha
  AND ar.local = @local
  AND ma.es_efectivo = 1
  AND ar.estado != 'eliminado_global'
  AND ar.divisa = 'USD'
  AND ar.cotizacion_divisa IS NULL;
```

---

## 7. Checklist de Validación

Cuando hay inconsistencia entre Resumen Local y Cajas:

- [ ] 1. Verificar si hay anticipos sin caja (`caja IS NULL`)
- [ ] 2. Verificar si hay anticipos sin turno en local multi-turno (`turno IS NULL`)
- [ ] 3. Verificar conversión USD (cotización correcta)
- [ ] 4. Forzar refresh del navegador (Ctrl+F5)
- [ ] 5. Verificar que backend tiene el fix `f4d9283`
- [ ] 6. Ejecutar query de diagnóstico completo
- [ ] 7. Verificar que no hay datos en caché (timestamp en URL)
- [ ] 8. Verificar logs del backend para errores SQL

---

## 8. Mejoras Futuras Recomendadas

### 8.1. Validar Caja Obligatoria
```python
# En endpoint de crear anticipo
if medio_seleccionado.es_efectivo == 1 and not caja:
    return jsonify(success=False, msg="Caja es obligatoria para anticipos en efectivo"), 400
```

### 8.2. Validar Turno en Multi-turno
```python
# Verificar si local tiene múltiples turnos
cur.execute("SELECT turnos FROM locales WHERE local = %s", (local,))
turnos = cur.fetchone()[0]

if medio_seleccionado.es_efectivo == 1 and ',' in turnos and not turno:
    return jsonify(success=False, msg="Turno es obligatorio para anticipos en efectivo en este local"), 400
```

### 8.3. Excluir NULL en Resumen Local
Para evitar contar anticipos sin caja:
```python
# En query de anticipos_efectivo_total
WHERE DATE(ar.fecha_pago) = %s
  AND ar.local = %s
  AND ar.caja IS NOT NULL  # NUEVO: excluir sin caja
  AND ma.es_efectivo = 1
```

### 8.4. Agregar Snapshot para Anticipos
Crear tabla `snap_anticipos_recibidos` para congelar datos al cierre del local.

---

## Conclusión

Después del fix `f4d9283`:
- ✅ El cálculo de diferencia es **matemáticamente idéntico** en todos los niveles
- ✅ Resumen Local = Suma de Cajas Individuales (si no hay datos inconsistentes)
- ⚠️ Discrepancias solo pueden ocurrir por:
  - Anticipos sin caja asignada
  - Anticipos sin turno en locales multi-turno
  - Cotización USD incorrecta
  - Caché del navegador

**Para diagnosticar:** Usar el query de diagnóstico completo y revisar el checklist.
