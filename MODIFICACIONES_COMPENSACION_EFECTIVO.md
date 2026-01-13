# 🔧 Modificaciones: Compensación de Efectivo en Anticipos

## Fecha: 2026-01-07

---

## 📋 Objetivo

Cuando un anticipo **en efectivo** es consumido en una caja, debe:
1. ✅ Sumarse a "Anticipos" (ya funciona)
2. ✅ **Restarse del cálculo de "Efectivo"** (NUEVO)

Esto evita la duplicación cuando el cajero cierra la caja y crea la remesa.

---

## 🎯 Cambios Necesarios

### 1. Modificación en `resumen_por_caja` (línea ~4297)

**UBICACIÓN**: `app.py` línea 4297-4303

**ANTES:**
```python
# efectivo (remesas)
cur.execute(f"""
    SELECT COALESCE(SUM(monto),0)
      FROM {T_REMESAS}
     WHERE DATE(fecha)=%s AND local=%s AND caja=%s AND turno=%s
""", (fecha, local, caja, turno))
row = cur.fetchone()
resumen['efectivo'] = float(row[0]) if row and row[0] is not None else 0.0
```

**DESPUÉS:**
```python
# efectivo (remesas)
cur.execute(f"""
    SELECT COALESCE(SUM(monto),0)
      FROM {T_REMESAS}
     WHERE DATE(fecha)=%s AND local=%s AND caja=%s AND turno=%s
""", (fecha, local, caja, turno))
row = cur.fetchone()
efectivo_base = float(row[0]) if row and row[0] is not None else 0.0

# COMPENSACIÓN: Restar anticipos en efectivo consumidos en esta caja
# (para evitar duplicación al crear la remesa)
cur.execute("""
    SELECT COALESCE(SUM(aec.importe_consumido), 0)
    FROM anticipos_estados_caja aec
    JOIN anticipos_recibidos ar ON ar.id = aec.anticipo_id
    JOIN medios_anticipos ma ON ma.id = ar.medio_pago_id
    WHERE aec.fecha = %s
      AND aec.local = %s
      AND aec.caja = %s
      AND aec.turno = %s
      AND aec.estado = 'consumido'
      AND ma.es_efectivo = 1
""", (fecha, local, caja, turno))
row_compensacion = cur.fetchone()
compensacion_efectivo = float(row_compensacion[0]) if row_compensacion and row_compensacion[0] is not None else 0.0

# Efectivo final = efectivo_base - compensación
resumen['efectivo'] = efectivo_base - compensacion_efectivo
resumen['compensacion_anticipos_efectivo'] = compensacion_efectivo  # Para debugging
```

---

### 2. Modificación en `resumen_por_local` (línea ~5377)

**UBICACIÓN**: `app.py` línea 5377-5382

**ANTES:**
```python
# ===== EFECTIVO (Remesas) =====
efectivo_remesas = _qsum(
    cur,
    f"SELECT COALESCE(SUM(monto),0) FROM {T_REMESAS} WHERE DATE(fecha)=%s AND local=%s",
    (f, local),
)
efectivo_neto = efectivo_remesas
```

**DESPUÉS:**
```python
# ===== EFECTIVO (Remesas) =====
efectivo_remesas = _qsum(
    cur,
    f"SELECT COALESCE(SUM(monto),0) FROM {T_REMESAS} WHERE DATE(fecha)=%s AND local=%s",
    (f, local),
)

# COMPENSACIÓN: Restar anticipos en efectivo consumidos en este local/fecha
compensacion_efectivo_local = _qsum(
    cur,
    """
    SELECT COALESCE(SUM(aec.importe_consumido), 0)
    FROM anticipos_estados_caja aec
    JOIN anticipos_recibidos ar ON ar.id = aec.anticipo_id
    JOIN medios_anticipos ma ON ma.id = ar.medio_pago_id
    WHERE aec.fecha = %s
      AND aec.local = %s
      AND aec.estado = 'consumido'
      AND ma.es_efectivo = 1
    """,
    (f, local)
) or 0.0

efectivo_neto = efectivo_remesas - compensacion_efectivo_local
```

---

### 3. Actualización del endpoint `crear anticipo` (línea ~2439)

**UBICACIÓN**: `app.py` línea 2439+ (dentro de `api_anticipos_recibidos/crear`)

Buscar la línea donde se hace el INSERT de `anticipos_recibidos` y modificar:

**ANTES:**
```python
cur.execute("""
    INSERT INTO anticipos_recibidos
    (fecha_pago, fecha_evento, importe, divisa, tipo_cambio_fecha,
     cliente, numero_transaccion, medio_pago, observaciones, local,
     estado, created_by, created_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pendiente', %s, %s)
""", (fecha_pago, fecha_evento, importe, divisa, tipo_cambio,
      cliente, numero_transaccion, medio_pago, observaciones, local,
      created_by, ahora))
```

**DESPUÉS:**
```python
# Obtener el medio_pago_id del request (viene del frontend)
medio_pago_id = data.get('medio_pago_id')  # NUEVO CAMPO

if not medio_pago_id:
    # Si no viene, asignar "Efectivo" por defecto (por retrocompatibilidad)
    cur.execute("SELECT id FROM medios_anticipos WHERE nombre = 'Efectivo' LIMIT 1")
    result = cur.fetchone()
    medio_pago_id = result[0] if result else None

cur.execute("""
    INSERT INTO anticipos_recibidos
    (fecha_pago, fecha_evento, importe, divisa, tipo_cambio_fecha,
     cliente, numero_transaccion, medio_pago, observaciones, local,
     medio_pago_id, estado, created_by, created_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pendiente', %s, %s)
""", (fecha_pago, fecha_evento, importe, divisa, tipo_cambio,
      cliente, numero_transaccion, medio_pago, observaciones, local,
      medio_pago_id, created_by, ahora))
```

---

## 🧪 Casos de Prueba

### Caso 1: Anticipo Efectivo Consumido

```
SETUP:
- Caja X tiene ventas por $5000
- Admin crea anticipo EFECTIVO de $1000 para Local X
- Usuario de Caja X consume el anticipo

CÁLCULO SIN COMPENSACIÓN (INCORRECTO):
- Efectivo (remesas): $5000
- Anticipos: +$1000
- Total: $6000 ❌ (duplicado)

CÁLCULO CON COMPENSACIÓN (CORRECTO):
- Efectivo (remesas): $5000
- Compensación anticipos efectivo: -$1000
- Efectivo neto: $4000
- Anticipos: +$1000
- Total: $5000 ✅ (correcto)
```

### Caso 2: Anticipo Transferencia (No Efectivo)

```
SETUP:
- Caja X tiene ventas por $5000
- Admin crea anticipo TRANSFERENCIA de $1000
- Usuario de Caja X consume el anticipo

CÁLCULO (NO SE COMPENSA):
- Efectivo (remesas): $5000
- Anticipos: +$1000
- Total: $6000 ✅ (correcto, son medios diferentes)
```

### Caso 3: Anticipo No Consumido

```
SETUP:
- Caja X tiene ventas por $5000
- Admin crea anticipo EFECTIVO de $1000
- Anticipo NO se consume (queda pendiente)

CÁLCULO:
- Efectivo (remesas): $5000
- Compensación: $0 (no hay consumo)
- Anticipos: $0 (no consumido)
- Total: $5000 ✅ (correcto)
```

---

## 📊 Verificación SQL

### Query para ver anticipos en efectivo consumidos

```sql
SELECT
    aec.fecha,
    aec.local,
    aec.caja,
    aec.turno,
    ar.cliente,
    ar.importe,
    ma.nombre as medio_pago,
    ma.es_efectivo,
    aec.estado
FROM anticipos_estados_caja aec
JOIN anticipos_recibidos ar ON ar.id = aec.anticipo_id
JOIN medios_anticipos ma ON ma.id = ar.medio_pago_id
WHERE aec.estado = 'consumido'
  AND ma.es_efectivo = 1
ORDER BY aec.fecha DESC, aec.local, aec.caja;
```

### Query para ver compensación por caja

```sql
SELECT
    aec.fecha,
    aec.local,
    aec.caja,
    aec.turno,
    SUM(aec.importe_consumido) as total_compensar
FROM anticipos_estados_caja aec
JOIN anticipos_recibidos ar ON ar.id = aec.anticipo_id
JOIN medios_anticipos ma ON ma.id = ar.medio_pago_id
WHERE aec.estado = 'consumido'
  AND ma.es_efectivo = 1
GROUP BY aec.fecha, aec.local, aec.caja, aec.turno
ORDER BY aec.fecha DESC;
```

---

## ⚠️ Notas Importantes

1. **Migración de datos**: Los anticipos existentes sin `medio_pago_id` se asignarán automáticamente a "Efectivo" con el script SQL.

2. **Retrocompatibilidad**: Si el frontend no envía `medio_pago_id`, se asigna "Efectivo" por defecto.

3. **campo `medio_pago` (string)**: Se mantiene por retrocompatibilidad pero se reemplaza por `medio_pago_id` (FK).

4. **Compensación solo en consumo**: La resta de efectivo solo ocurre cuando el anticipo está en estado `'consumido'` en la caja específica.

5. **Anticipos desconsumidos**: Si se desconsume un anticipo, la compensación desaparece automáticamente (porque el JOIN no encontrará filas con `estado='consumido'`).

---

## 🔄 Orden de Implementación

1. ✅ Ejecutar `SQL_CREATE_MEDIOS_ANTICIPOS.sql`
2. ✅ Insertar endpoints en `app.py` (antes línea 9022)
3. ✅ Modificar cálculo de efectivo en `resumen_por_caja` (línea ~4297)
4. ✅ Modificar cálculo de efectivo en `resumen_por_local` (línea ~5377)
5. ✅ Modificar endpoint de crear anticipo para aceptar `medio_pago_id`
6. ✅ Crear/modificar frontend para mostrar desplegable de medios
7. ✅ Crear vista admin para gestionar medios de pago
8. ✅ Probar con casos de prueba

---

**Autor**: Sistema de Desarrollo
**Fecha**: 2026-01-07
**Estado**: Documentado - Pendiente de implementación
