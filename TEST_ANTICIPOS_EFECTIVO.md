# Test de Anticipos en Efectivo - Guía Paso a Paso

## ✅ Estado Actual

### Ya Verificado:
- ✅ Tabla `medios_anticipos` existe
- ✅ Campo `cotizacion_divisa` existe en `anticipos_recibidos`
- ✅ Código backend implementado (app.py líneas 4534-4574)
- ✅ Frontend implementado (index.html, resumen.js)

### ℹ️ Nota Importante:
- ℹ️ Algunos anticipos antiguos tienen `medio_pago_id = NULL` (esto es normal)
- ℹ️ Los anticipos NULL son **ignorados** en el cálculo (INNER JOIN los excluye)
- ℹ️ Los nuevos anticipos **DEBEN** tener medio de pago obligatorio

---

## 📝 PASO 1: Verificar estado de anticipos

### 1.1 Ejecutar script de verificación

**Archivo:** `FIX_ANTICIPOS_MEDIO_PAGO.sql`

**Instrucciones:**
1. Abrí tu cliente MySQL (Workbench, phpMyAdmin, DBeaver, etc.)
2. Conectate a la base de datos del proyecto
3. Ejecutá el script completo
4. Revisá los resultados

**Qué hace:**
- Muestra cuántos anticipos tienen `medio_pago_id` NULL (antiguos)
- Lista anticipos sin medio (para revisión manual si querés)
- Simula el query del sistema (solo incluye los que tienen medio)
- Muestra distribución de medios de pago válidos

**Resultado esperado:**
```
Sin medio (antiguos - ignorados): X
Con medio (se incluyen): Y
```

**✅ Los NULL NO afectan el cálculo**

---

## 🧪 PASO 2: Test - Anticipo ARS en Efectivo

### 2.1 Crear anticipo de prueba

**Datos:**
- **Fecha pago:** Hoy
- **Fecha evento:** Fecha futura
- **Cliente:** "TEST - Cliente Prueba"
- **Local:** (Tu local de prueba)
- **Caja:** Caja 1 ← **OBLIGATORIO** (la que recibió el efectivo)
- **Medio de pago:** Efectivo ← **OBLIGATORIO**
- **Divisa:** ARS
- **Importe:** $50,000
- **Observaciones:** "Test anticipo efectivo"

### 2.2 Verificar Resumen de Caja (ANTES de remesa)

**Abrir:** Cierre de Caja → Resumen

**Fecha:** Hoy
**Caja:** Caja 1 ← **Misma que el anticipo**

**Debe mostrar:**
```
Efectivo:                    $0
Anticipos Efectivo:          -$50,000  ← ROJO
------------------------------------------
Diferencia:                  -$50,000  ← FALTANTE
```

**✅ Exitoso si:**
- "Anticipos Efectivo" muestra -$50,000 en rojo
- Diferencia = faltante de $50,000

### 2.3 Crear remesa

**Datos:**
- **Fecha:** Hoy (misma del anticipo)
- **Local:** (Mismo del anticipo)
- **Divisa:** ARS
- **Monto:** $50,000
- **Estado:** Local

### 2.4 Verificar Resumen (DESPUÉS de remesa)

**Refrescar página**

**Debe mostrar:**
```
Efectivo:                    $50,000   ← Remesa
Anticipos Efectivo:          -$50,000  ← Resta
------------------------------------------
Diferencia:                  $0        ← CUADRA
```

**✅ Exitoso si:** Diferencia = $0

---

## 🧪 PASO 3: Test - Anticipo USD en Efectivo

### 3.1 Crear anticipo USD

**Datos:**
- **Fecha pago:** Hoy
- **Cliente:** "TEST - Cliente USD"
- **Medio de pago:** Efectivo ← **OBLIGATORIO**
- **Divisa:** USD
- **Importe:** USD $100
- **Cotización:** 1150
- **Observaciones:** "Test USD"

**Cálculo:** USD $100 × 1150 = ARS $115,000

### 3.2 Verificar Resumen (ANTES de remesa)

**Debe mostrar:**
```
Anticipos Efectivo:          -$115,000  ← USD convertido
Diferencia:                  -$115,000
```

### 3.3 Crear remesa USD

**Datos:**
- **Fecha:** Hoy
- **Divisa:** USD
- **Monto USD:** $100
- **Cotización:** 1150

### 3.4 Verificar Resumen (DESPUÉS)

**Debe mostrar:**
```
Efectivo:                    $115,000
Anticipos Efectivo:          -$115,000
Diferencia:                  $0
```

### 3.5 Verificar AP Efectivo USD (día siguiente)

**Abrir:** Operaciones → AP Efectivo USD

**Fecha:** Mañana

**Debe mostrar:**
```
Local | Saldo Ant | [Hoy]     | AP Proy
-----------------------------------------
[Tu Local] | $0   | USD $100  | USD $100
```

**✅ Exitoso si:** USD $100 en columna correcta

---

## 🧪 PASO 4: Test - Transferencia (NO debe afectar)

### 4.1 Crear anticipo por transferencia

**Datos:**
- **Medio de pago:** Transferencia Bancaria ← NO es efectivo
- **Importe:** $30,000

### 4.2 Verificar Resumen

**Debe mostrar:**
```
Anticipos Efectivo:          -$XXX  ← NO incluye los $30k
```

**✅ Exitoso si:** Solo efectivo afecta el resumen

---

## 🧪 PASO 5: Test - Sin remesa (debe quedar faltante)

### 5.1 Crear anticipo sin remesa

**Datos:**
- **Medio:** Efectivo
- **Importe:** $20,000

### 5.2 NO crear remesa

**Verificar:**
```
Anticipos Efectivo:          -$20,000
Diferencia:                  -$20,000  ← FALTANTE
```

**✅ Exitoso si:** Faltante obliga a crear remesa

---

## 🧪 PASO 6: Test - Eliminar anticipo

### 6.1 Eliminar un anticipo de prueba

### 6.2 Verificar Resumen

**Debe mostrar:**
```
Anticipos Efectivo:          -$X  ← Ya no incluye el eliminado
```

**✅ Exitoso si:** El eliminado no afecta

---

## 📊 PASO 7: Verificación SQL

### 7.1 Anticipos en efectivo del día

```sql
SELECT
    ar.local,
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
WHERE DATE(ar.fecha_pago) = CURDATE()
  AND ma.es_efectivo = 1
  AND ar.estado != 'eliminado_global';
```

### 7.2 Remesas del día

```sql
SELECT
    local,
    monto,
    monto_usd,
    divisa,
    total_conversion
FROM remesas_trns
WHERE DATE(fecha) = CURDATE();
```

### 7.3 Verificar que coincidan

**Suma de anticipos ARS = Suma de remesas**

---

## ✅ Checklist Final

- [ ] 1. Ejecuté `FIX_ANTICIPOS_MEDIO_PAGO.sql`
- [ ] 2. Test ARS: Anticipo → Faltante → Remesa → Cuadra
- [ ] 3. Test USD: Conversión a ARS funciona
- [ ] 4. Test Transferencia: NO afecta efectivo
- [ ] 5. Test sin remesa: Queda faltante
- [ ] 6. Test eliminar: No afecta
- [ ] 7. AP Efectivo USD: Muestra remesas correctamente
- [ ] 8. Nuevos anticipos tienen medio obligatorio

---

## 🐛 Troubleshooting

### "Anticipos Efectivo" muestra $0

**Causas:**
1. Anticipo sin `medio_pago_id` → Normal, el INNER JOIN lo excluye
2. Medio tiene `es_efectivo = 0` → Verificar tabla `medios_anticipos`
3. Fecha incorrecta → Verificar `fecha_pago`
4. Anticipo eliminado → Verificar `estado`

### Monto duplicado

**Ya corregido** en commit 50fcdc0

### Tips no aparecen

**Ya corregido** en esta sesión

---

## 📞 Soporte

Si falla algún test:
1. Logs: `tail -f logs/server_*.log`
2. Console del navegador (F12)
3. Network tab: Ver `/api/cierre/resumen`
4. Docs: `ANTICIPOS_EFECTIVO_IMPLEMENTACION.md`
