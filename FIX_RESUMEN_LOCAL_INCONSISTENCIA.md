# Fix: Inconsistencia entre Resumen Local y Resumen de Cajas

## Problema Detectado

El resumen a nivel local mostraba una **diferencia incorrecta** que no coincidía con la suma de las diferencias de las cajas individuales.

### Ejemplo del problema:
- **Resumen Local (Narda Sucre):** Diferencia = -$64,000
- **Resumen Caja 1 + Caja 2:** Diferencia = $0 (cuadran perfectamente)

**Causa raíz:** El resumen local NO estaba restando los anticipos recibidos en efectivo del total cobrado.

---

## ¿Qué son los Anticipos en Efectivo?

Cuando un cliente paga un anticipo (seña) en efectivo:
1. Se recibe el dinero físico en la caja
2. Se carga el anticipo en el sistema
3. **Se crea una remesa** con ese dinero (el efectivo sale de la caja)
4. El anticipo se **resta del total cobrado** para que la caja cuadre

**Ejemplo:**
- Venta total: $100,000
- Efectivo recibido por ventas: $50,000
- Anticipo en efectivo recibido: $10,000
- Remesa creada: $60,000 (incluye el anticipo)

**Cálculo correcto:**
```
Total cobrado = Efectivo ($60,000) - Anticipos efectivo ($10,000) = $50,000
Diferencia = Total cobrado ($50,000) - Venta total ($100,000) = -$50,000 (faltante)
```

Si NO restamos el anticipo, quedaría:
```
Total cobrado = $60,000
Diferencia = $60,000 - $100,000 = -$40,000 (INCORRECTO)
```

---

## Endpoints Afectados

### ✅ Funcionaba correctamente:
1. **`/api/cierre/resumen`** (Resumen de caja individual)
   - Sí restaba anticipos_efectivo del total cobrado
   - Las cajas individuales mostraban diferencias correctas

### ❌ Funcionaba incorrectamente:
1. **`/api/resumen_local`** (Resumen global por local)
   - NO calculaba anticipos_efectivo
   - NO restaba del total cobrado
   - Mostraba diferencia incorrecta a nivel local

2. **`_get_diferencias_detalle()`** (Función interna)
   - NO restaba anticipos_efectivo al calcular diferencias por caja
   - Usada en el acordeón de diferencias detalladas

---

## Cambios Realizados

### 1. Fix en `_get_diferencias_detalle()` (líneas ~5895-5935)

**Agregado:**
```python
# Anticipos Recibidos en Efectivo - RESTAR del total cobrado
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
      AND ar.caja = %s
      AND (ar.turno = %s OR ar.turno IS NULL)
      AND ma.es_efectivo = 1
      AND ar.estado != 'eliminado_global'
""", (f, local, caja, turno))
row = cur.fetchone()
anticipos_efectivo = float(_extract_first_value(row) or 0.0) if row else 0.0
total_cobrado -= anticipos_efectivo  # RESTA del total cobrado
```

**Qué hace:**
- Calcula anticipos recibidos en efectivo para cada caja/turno
- Convierte USD a ARS si es necesario
- Resta del total cobrado antes de calcular la diferencia

---

### 2. Fix en `/api/resumen_local` (líneas ~6319-6385)

**Agregado:**

```python
# ===== ANTICIPOS RECIBIDOS EN EFECTIVO =====
anticipos_efectivo_total = _qsum(
    cur,
    """SELECT COALESCE(SUM(
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
      AND ar.estado != 'eliminado_global'""",
    (f, local),
) or 0.0

# Modificado el cálculo de total_cobrado:
total_cobrado = float(sum([
    efectivo_neto or 0.0,
    tarjeta_total or 0.0,
    mp_total or 0.0,
    rappi_total or 0.0,
    pedidosya_total or 0.0,
    cta_cte_total or 0.0,
    gastos_total or 0.0,
    anticipos_total or 0.0,
    -anticipos_efectivo_total,  # RESTA: anticipos recibidos en efectivo
]))
```

**Agregado al payload:**
```python
"anticipos_efectivo": {
    "total": float(anticipos_efectivo_total or 0.0)
}
```

**Qué hace:**
- Calcula suma total de anticipos en efectivo del local
- Resta del total cobrado
- Incluye en payload para mostrar en frontend

---

## Resultado Esperado

Después del fix:

### ✅ Resumen Local
```
Venta Total:     $8,660,940.00
Total Cobrado:   $8,596,940.00
Diferencia:      -$64,000.00  ← AHORA COINCIDE con la suma de cajas
```

### ✅ Resumen Cajas Individuales
```
Caja 1 - Diferencia: -$64,000.00
Caja 2 - Diferencia: $0.00
Total: -$64,000.00  ← COINCIDE con resumen local
```

---

## Validación del Fix

### Test 1: Crear anticipo en efectivo
1. Crear anticipo $10,000 en efectivo en Caja 1
2. Verificar resumen Caja 1: debe mostrar faltante de -$10,000
3. Crear remesa $10,000 en Caja 1
4. Verificar resumen Caja 1: debe cuadrar ($0)
5. Verificar resumen local: debe coincidir con suma de cajas

### Test 2: Verificar consistencia multi-caja
1. Local con 2 cajas (Caja 1 y Caja 2)
2. Caja 1: Anticipo $20,000 + Remesa $20,000 = Diferencia $0
3. Caja 2: Sin anticipos = Diferencia $0
4. Resumen local: Diferencia total debe ser $0

### Test 3: Anticipos USD
1. Crear anticipo USD $100 con cotización 1,150
2. Importe en ARS = $115,000
3. Verificar que resumen resta $115,000 (no $100)

---

## Queries SQL de Validación

### Ver anticipos en efectivo del día
```sql
SELECT
    ar.local,
    ar.caja,
    ar.turno,
    ar.cliente,
    ar.importe,
    ar.divisa,
    ma.nombre as medio,
    CASE
        WHEN ar.divisa = 'USD' AND ar.cotizacion_divisa IS NOT NULL
        THEN ar.importe * ar.cotizacion_divisa
        ELSE ar.importe
    END as importe_ars
FROM anticipos_recibidos ar
INNER JOIN medios_anticipos ma ON ar.medio_pago_id = ma.id
WHERE DATE(ar.fecha_pago) = '2026-01-31'
  AND ar.local = 'Narda Sucre'
  AND ma.es_efectivo = 1
  AND ar.estado != 'eliminado_global';
```

### Ver remesas del día
```sql
SELECT
    local,
    caja,
    turno,
    monto,
    divisa,
    monto_usd,
    cotizacion_divisa,
    total_conversion
FROM remesas_trns
WHERE DATE(fecha) = '2026-01-31'
  AND local = 'Narda Sucre'
ORDER BY caja, turno;
```

### Verificar que coincidan
Suma de `importe_ars` de anticipos debe ser <= suma de remesas de cada caja

---

## Notas Importantes

1. **Anticipos antiguos sin `medio_pago_id`:**
   - El INNER JOIN automáticamente los excluye
   - No afectan el cálculo (esto es correcto)

2. **Anticipos con `caja = NULL`:**
   - Los filtrados por caja/turno solo incluyen los que tienen caja
   - Anticipos antiguos sin caja no afectan el resumen de cajas específicas

3. **Conversión de divisas:**
   - USD se convierte a ARS usando `cotizacion_divisa`
   - La conversión debe coincidir con la de las remesas

4. **Turno NULL:**
   - Filtro usa `(ar.turno = %s OR ar.turno IS NULL)` para incluir antiguos
   - Locales sin turnos múltiples tienen todos los anticipos con turno NULL

---

## Archivos Modificados

- `app.py` (líneas ~5895-5935, ~6319-6385, ~6463-6467)

## Commit

```bash
git add app.py
git commit -m "Fix: Restar anticipos en efectivo en resumen local

- Agregado cálculo de anticipos_efectivo en /api/resumen_local
- Agregado resta de anticipos_efectivo en _get_diferencias_detalle()
- Ahora el resumen local coincide con la suma de cajas individuales
- Incluye conversión USD a ARS usando cotizacion_divisa
- Agregado anticipos_efectivo al payload del API

Fixes #inconsistencia-resumen-local"
```

---

## Testing Realizado

- [x] Sintaxis Python válida (py_compile)
- [ ] Test manual con anticipo en efectivo
- [ ] Test con múltiples cajas
- [ ] Test con anticipos USD
- [ ] Verificar que resumen local = suma de cajas
