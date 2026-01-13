# Integración Oppen - Sincronización Automática de Facturas B y Z

## ✅ Estado: IMPLEMENTADO Y FUNCIONAL

---

## Resumen

Este módulo sincroniza automáticamente **facturas tipo B y Z** con el sistema Oppen cuando un auditor marca un local como "auditado".

### Tipos de Facturas Sincronizadas

- ✅ **Tipo B**: Facturas B (VoucherCode: "006")
- ✅ **Tipo Z**: Reportes de cierre de caja (VoucherCode: "083", DocType: 4, FormType: "Z")
- ❌ **Tipo A**: NO se sincroniza
- ❌ **Tipo CC**: NO se sincroniza

---

## Mapeo de Campos

### Local → Label Oppen

La tabla `labels_oppen` mapea el nombre del local en la app al código de Oppen:

| local | cod_oppen | Uso en Oppen |
|-------|-----------|--------------|
| Alma Cerrito | ALM01 | Se envía en campo `Labels` |
| Fabric Sushi | ALMF01 | Se envía en campo `Labels` |
| Laky | BT212 | Se envía en campo `Labels` |
| Match | BT313 | Se envía en campo `Labels` |
| Madre | BT414 | Se envía en campo `Labels` |
| Ribs Polo | BT515 | Se envía en campo `Labels` |
| Fabric Polo (Lechería) | BT616 | Se envía en campo `Labels` |
| Cochinchina | CCHH | Se envía en campo `Labels` |

**Importante**: Si el local no existe en `labels_oppen`, se usa el nombre del local directamente.

### Tipo de Factura → Campos Oppen

| Tipo App | VoucherCode | DocType | InvoiceType | FormType | Descripción |
|----------|-------------|---------|-------------|----------|-------------|
| **B** | "006" | 1 | 0 | null | Factura B |
| **Z** | "083" | 4 | 0 | "Z" | Reporte Z / Cierre de caja |

### Campos de Factura

| Campo App | Campo Oppen | Transformación | Ejemplo |
|-----------|-------------|----------------|---------|
| `fecha` | `TransDate` | `YYYY-MM-DD` | "2026-01-05" |
| `fecha + 30 días` | `DueDate` | `YYYY-MM-DD` (min: HOY + 30) | "2026-02-04" |
| `punto_venta` | `OfficialSerNr` (parte 1) | Zero-pad 4 dígitos | "0001" |
| `nro_factura` | `OfficialSerNr` (parte 2) | Zero-pad 8 dígitos | "00004232" |
| - | `OfficialSerNr` (completo) | `PPPP-NNNNNNNN` | "0001-00004232" |
| `monto` | `Items[0].Price` | Float directo | 150000.00 |
| - | `CustCode` | Constante | "C00001" |
| - | `Office` | Constante | "100" |
| - | `Status` | Constante | 0 (desaprobado) |
| - | `createUser` | Constante | "API" |
| - | `Items[0].ArtCode` | Constante | "271240051" |
| - | `Items[0].Qty` | Constante | 1 |

**Notas Importantes**:
- El IVA se calcula automáticamente en Oppen, no lo enviamos.
- **Facturas Históricas**: Para facturas con `fecha` en el pasado, si `DueDate` calculado queda antes de HOY, se ajusta automáticamente a `HOY + 30 días` para evitar el error `INVERTEDRANGEERR` de Oppen.

---

## Flujo de Trabajo

```
1. Usuario (auditor) marca local como "auditado"
   └─> Endpoint: POST /api/marcar_auditado
       Body: { "local": "Laky", "fecha": "2026-01-05" }

2. Sistema valida:
   ✓ Local está cerrado
   ✓ No está ya auditado
   ✓ No hay anticipos pendientes

3. Insertar en locales_auditados + COMMIT
   └─> Estado persistido en BD

4. Sincronización con Oppen:
   a) Buscar label en labels_oppen
      SELECT cod_oppen FROM labels_oppen WHERE local = 'Laky'
      Resultado: 'BT212'

   b) Obtener facturas B y Z
      SELECT * FROM facturas_trns
      WHERE local = 'Laky'
        AND DATE(fecha) = '2026-01-05'
        AND estado = 'ok'
        AND tipo IN ('B', 'Z')

   c) Para cada factura:
      - Autenticar en Oppen (si no está autenticado)
      - Transformar datos al formato Oppen
      - Generar SerNr único
      - POST /genericapi/ApiNg/Invoice
      - Registrar resultado (éxito/error)

5. Retornar resultado al usuario:
   {
     "success": true,
     "msg": "Local Laky marcado como auditado para 2026-01-05\n✅ 3 factura(s) enviada(s) a Oppen exitosamente",
     "oppen_sync": {
       "total": 3,
       "exitosas": 3,
       "fallidas": 0,
       "errores": [],
       "success": true,
       "label_oppen": "BT212"
     }
   }
```

---

## Ejemplos de Uso

### 1. Auditar Local con Facturas B y Z

**Request:**
```json
POST /api/marcar_auditado
{
  "local": "Laky",
  "fecha": "2026-01-05"
}
```

**Response (éxito):**
```json
{
  "success": true,
  "msg": "Local Laky marcado como auditado para 2026-01-05\n✅ 5 factura(s) enviada(s) a Oppen exitosamente",
  "oppen_sync": {
    "total": 5,
    "exitosas": 5,
    "fallidas": 0,
    "errores": [],
    "success": true,
    "label_oppen": "BT212"
  }
}
```

### 2. Auditar Local Sin Facturas B/Z

**Response:**
```json
{
  "success": true,
  "msg": "Local Match marcado como auditado para 2026-01-05\nℹ️ No había facturas para sincronizar con Oppen",
  "oppen_sync": {
    "total": 0,
    "exitosas": 0,
    "fallidas": 0,
    "errores": [],
    "success": true,
    "message": "No hay facturas B o Z para sincronizar",
    "label_oppen": "BT313"
  }
}
```

### 3. Error Parcial

**Response:**
```json
{
  "success": true,
  "msg": "Local Madre marcado como auditado para 2026-01-05\n⚠️ Algunas facturas no pudieron enviarse a Oppen: 1/3\nPrimer error: Error HTTP 409: Duplicate invoice",
  "oppen_sync": {
    "total": 3,
    "exitosas": 2,
    "fallidas": 1,
    "errores": [
      {
        "factura": "B 0001-00004232",
        "error": "Error HTTP 409: Duplicate invoice"
      }
    ],
    "success": false,
    "label_oppen": "BT414"
  }
}
```

---

## Ejemplo de Payload Enviado

### Factura Tipo Z

```json
{
  "SerNr": 121767617234567,
  "OfficialSerNr": "0001-00000510",
  "CustCode": "C00001",
  "TransDate": "2026-01-05",
  "DueDate": "2026-02-04",
  "Office": "100",
  "Labels": "BT212",
  "createUser": "API",
  "Status": 0,
  "VoucherCode": "083",
  "DocType": 4,
  "InvoiceType": 0,
  "FormType": "Z",
  "Items": [
    {
      "ArtCode": "271240051",
      "Qty": 1,
      "Price": 150000.00
    }
  ]
}
```

### Factura Tipo B

```json
{
  "SerNr": 121767617234568,
  "OfficialSerNr": "0001-00004232",
  "CustCode": "C00001",
  "TransDate": "2026-01-05",
  "DueDate": "2026-02-04",
  "Office": "100",
  "Labels": "BT212",
  "createUser": "API",
  "Status": 0,
  "VoucherCode": "006",
  "DocType": 1,
  "InvoiceType": 0,
  "FormType": null,
  "Items": [
    {
      "ArtCode": "271240051",
      "Qty": 1,
      "Price": 25000.00
    }
  ]
}
```

---

## Testing

### Verificar Label de Local

```sql
SELECT local, cod_oppen
FROM labels_oppen
WHERE local = 'Laky';
```

### Verificar Facturas a Sincronizar

```sql
SELECT
    tipo,
    punto_venta,
    nro_factura,
    monto,
    fecha
FROM facturas_trns
WHERE local = 'Laky'
  AND DATE(fecha) = '2026-01-05'
  AND estado = 'ok'
  AND tipo IN ('B', 'Z')
ORDER BY tipo, punto_venta, nro_factura;
```

### Probar Sincronización Manual

```python
python test_oppen_integration.py --local Laky --fecha 2026-01-05
```

### Consultar Facturas en Oppen

```python
python test_oppen_get.py --date 2026-01-05 --limit 20
```

---

## Configuración de Producción

### 1. Cambiar URL de Oppen

En `modules/oppen_integration.py`:

```python
# Cambiar de:
BASE_URL = "https://ngprueba.oppen.io"

# A:
BASE_URL = "https://ng.oppen.io"  # Verificar URL correcta con Oppen
```

### 2. Actualizar Credenciales (si cambian)

```python
USERNAME = "API"
PASSWORD = "apingprueba123"  # Actualizar si cambia en producción
```

### 3. Verificar Artículo Genérico

Confirmar que el código `271240051` (ARTICULO GENERICO) existe en producción.

---

## Manejo de Errores

### Error: Label No Encontrado

**Comportamiento**: Usa el nombre del local directamente
**Log**: `⚠️ No se encontró label de Oppen para {local}, usando nombre del local`
**Acción**: Agregar el local a la tabla `labels_oppen`

### Error: Factura Duplicada

**Causa**: Ya existe una factura con el mismo `OfficialSerNr` en Oppen
**Respuesta**: HTTP 409 - Duplicate invoice
**Solución**: Verificar si la factura ya fue sincronizada anteriormente

### Error: SerNr Fuera de Rango

**Causa**: SerNr generado es demasiado grande
**Respuesta**: HTTP 422 - RANGEERR4
**Solución**: ✅ Ya implementado el fix (usar timestamp limitado)

### Error: Fecha de Vencimiento Inválida (INVERTEDRANGEERR)

**Causa**: DueDate calculado está en el pasado (facturas históricas)
**Respuesta**: HTTP 422 - INVERTEDRANGEERR, Field EstPayDate
**Solución**: ✅ Ya implementado el fix automático:
- Si `TransDate + 30 días` < HOY → usar `HOY + 30 días`
- Log: `⚠️ Factura histórica detectada. DueDate ajustado a {nueva_fecha}`

### Error: Oppen No Disponible

**Comportamiento**: El local SIGUE auditado (no se hace rollback)
**Respuesta**: `{ "success": true, "oppen_error": "..." }`
**Acción**: Revisar conectividad con Oppen

---

## Logs

Todos los eventos se loguean con el siguiente formato:

```
2026-01-05 14:32:15 - modules.oppen_integration - INFO - 🔐 Autenticando en Oppen API...
2026-01-05 14:32:16 - modules.oppen_integration - INFO - ✅ Autenticación exitosa en Oppen
2026-01-05 14:32:16 - modules.oppen_integration - INFO - 📋 Label Oppen para Laky: BT212
2026-01-05 14:32:16 - modules.oppen_integration - INFO - 📦 Encontradas 5 facturas B/Z para sincronizar
2026-01-05 14:32:16 - modules.oppen_integration - INFO - 📤 Enviando factura Z 0001-00000510 ($150000.0)...
2026-01-05 14:32:17 - modules.oppen_integration - INFO - ✅ Factura creada exitosamente en Oppen
...
2026-01-05 14:32:20 - modules.oppen_integration - INFO - ✨ Sincronización completada: 5 exitosas, 0 fallidas de 5 totales
```

---

## Resumen de Archivos

### Archivos Modificados

1. **[modules/oppen_integration.py](modules/oppen_integration.py)**
   - Módulo principal de integración
   - Mapeo de tipos B y Z
   - Consulta a `labels_oppen`
   - Filtro `tipo IN ('B', 'Z')`

2. **[app.py:7558-7609](app.py#L7558-L7609)**
   - Integración en `api_marcar_auditado`
   - Llamada a `sync_facturas_to_oppen`
   - Manejo de respuestas

### Archivos de Prueba

1. **[test_oppen_integration.py](test_oppen_integration.py)**
   - Pruebas de facturas individuales
   - Verificación de payload

2. **[test_oppen_get.py](test_oppen_get.py)**
   - Consulta de facturas en Oppen
   - Verificación de campos

### Documentación

1. **[INTEGRACION_OPPEN.md](INTEGRACION_OPPEN.md)** - Documentación técnica detallada
2. **[INTEGRACION_OPPEN_FINAL.md](INTEGRACION_OPPEN_FINAL.md)** - Este documento (resumen ejecutivo)

---

## Checklist de Implementación

- [x] Mapeo de tipos B y Z funcionando
- [x] Campo `FormType: "Z"` para reportes Z
- [x] Campo `DocType: 4` para reportes Z
- [x] Integración con `labels_oppen`
- [x] Filtro `tipo IN ('B', 'Z')` en SQL
- [x] Manejo de errores robusto
- [x] Logging detallado
- [x] Documentación completa
- [x] Scripts de prueba
- [ ] **Pruebas en ambiente de producción** ← PENDIENTE
- [ ] **Verificación con datos reales** ← PENDIENTE

---

## Próximos Pasos

1. ✅ **Testing con datos reales**: Marcar un local como auditado y verificar que las facturas se creen correctamente en Oppen
2. ⏳ **Cambiar a producción**: Actualizar BASE_URL cuando se apruebe el testing
3. ⏳ **Monitoreo**: Revisar logs después de las primeras auditorías en producción
4. ⏳ **Optimizaciones**: Considerar agregar campo `enviado_oppen` a `facturas_trns` para trackear estado

---

## Soporte

Para reportar bugs o solicitar cambios, contactar al equipo de desarrollo.

**Última actualización**: 2026-01-05
