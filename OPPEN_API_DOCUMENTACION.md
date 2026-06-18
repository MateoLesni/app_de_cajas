# API Oppen — Documentación completa

Documentación de la integración con la API de Oppen NG para la creación automática de Facturas, Cuentas Corrientes y Recibos desde la app de cajas. Incluye todos los descubrimientos hechos durante el desarrollo (comportamientos no documentados, errores comunes, soluciones).

---

## 1. Ambientes y autenticación

### URLs
| Ambiente | URL |
|---|---|
| Producción | `https://ng.oppen.io` |
| Pruebas | `https://ngprueba.oppen.io` (instancia se apaga sola, hay que iniciarla manualmente desde el panel) |

### Autenticación
`POST /genericapi/ApiNg/authenticate`

```json
{
  "username": "API",
  "password": "apingprueba123"
}
```

Respuesta incluye `token`. En todas las requests siguientes:
```
Authorization: Bearer {token}
Content-Type: application/json
```

El token tiene duración limitada — si expira, re-autenticar.

---

## 2. Crear Factura (A, B, Z)

`POST /genericapi/ApiNg/Invoice`

### Payload
```json
{
  "OfficialSerNr": "00002-00009439",
  "ToOfficialSerNr": "00002-00009439",
  "CustCode": "CUIT0",
  "TransDate": "2026-03-21",
  "InvoiceDate": "2026-03-21",
  "DueDate": "2026-04-20",
  "Office": "100",
  "Labels": "TSTTR01",
  "createUser": "API",
  "Status": 1,
  "VoucherCode": "006",
  "DocType": 1,
  "InvoiceType": 0,
  "FormType": null,
  "Items": [
    {
      "ArtCode": "271240051",
      "Qty": 1,
      "Price": 1677474.64
    }
  ]
}
```

### Campos clave
| Campo | Valor | Descripción |
|---|---|---|
| `OfficialSerNr` | `"XXXXX-YYYYYYYY"` | 5 dígitos PV - 8 dígitos nro. Padear con ceros a izquierda si faltan |
| `ToOfficialSerNr` | **Igual a OfficialSerNr** | Siempre se manda con el mismo valor. Es el campo "Hasta Nro. Official" en la UI |
| `InvoiceDate` | Fecha de la caja | Fecha que aparece como "Fecha Factura" en Oppen. Distinta de `TransDate` (fecha creación) |
| `Labels` | Código del local (ej: `ALMF01`, `TSTTR01`, `CRZ02`) | Viene de tabla `labels_oppen` → `cod_oppen` |
| `Status` | `1` | Aprobado. Necesario para poder vincular a recibos después |
| `VoucherCode` | `"006"` (B), `"001"` (A), `"083"` (Z) | Tipo de comprobante fiscal |
| `DocType` | `1` (A/B), `4` (Z) | Tipo de documento |
| `FormType` | `"Z"` para Z, `null` para A/B | Solo para tiques Z |
| `ArtCode` | `"271240051"` | Artículo genérico |
| `Price` | `monto / 1.21` | Ver sección IVA más abajo |

### Mapeo por tipo de factura
```python
tipo_map = {
  "A":  { "VoucherCode": "001", "DocType": 1, "InvoiceType": 0, "FormType": None },
  "B":  { "VoucherCode": "006", "DocType": 1, "InvoiceType": 0, "FormType": None },
  "Z":  { "VoucherCode": "083", "DocType": 4, "InvoiceType": 0, "FormType": "Z" },
  "CC": { "VoucherCode": "083", "DocType": 1, "InvoiceType": 0, "FormType": None },
}
```

### CRÍTICO: IVA y cálculo de Price
- **El monto en nuestra BD es IVA incluido** (ej: `1,248,000`)
- **Oppen le suma IVA al `Price`** que le mandamos
- Por lo tanto enviamos `Price = monto / 1.21`
- Oppen calcula internamente: `Price * 1.21` → eso queda como `Total` de la factura
- **Puede diferir ±1 centavo del monto original por redondeo** (ej: `1,248,000 / 1.21 * 1.21 = 1,247,999.99`)
- Por eso guardamos el `Total` que Oppen devuelve en `facturas_trns.total_oppen` y lo usamos al vincular al recibo

### Respuesta de Oppen
```json
{
  "SerNr": 10600180968,
  "OfficialSerNr": "00002-00009439",
  "Total": 2029744.31,
  "Saldo": 2029744.31,
  "Labels": "TSTTR01",
  "CustCode": "CUIT0",
  "Status": 1,
  "CustName": "CLIENTE AFIP CUIT 0",
  ...
}
```

Guardamos `SerNr` en `facturas_trns.sernr_oppen` y `Total` en `facturas_trns.total_oppen`.

---

## 3. Crear Cuenta Corriente

`POST /genericapi/ApiNg/Invoice` (misma API que facturas, diferente configuración)

### Payload
```json
{
  "OfficialSerNr": "0003-00558080",
  "ToOfficialSerNr": "0003-00558080",
  "CustCode": "C00001",
  "TransDate": "2026-03-22",
  "InvoiceDate": "2026-03-22",
  "DueDate": "2026-04-21",
  "Office": "200",
  "Labels": "CRZ02",
  "createUser": "API",
  "Status": 1,
  "VoucherCode": "082",
  "DocType": 1,
  "InvoiceType": 0,
  "FormType": null,
  "Items": [
    {
      "ArtCode": "271240051",
      "Qty": 1,
      "Price": 384000,
      "VATCode": "3"
    }
  ]
}
```

### Diferencias con facturas A/B/Z
| Campo | CC | Factura normal |
|---|---|---|
| `Office` | **`"200"`** (no fiscal) | `"100"` (fiscal) |
| `VATCode` | `"3"` (exento IVA) | `"5"` (IVA 21%) |
| `Price` | **Monto directo** (sin dividir) | `monto / 1.21` |
| `VoucherCode` | `"082"` | Según tipo |

Las CC no se vinculan al recibo como Invoice — se crean por separado.

---

## 4. Crear Recibo

`POST /genericapi/ApiNg/Receipt`

### Payload
```json
{
  "TransDate": "2026-03-21",
  "CustCode": "CUIT0",
  "Office": "100",
  "Labels": "TSTTR01",
  "RefStr": "Caja Tostado 2026-03-21",
  "createUser": "API",
  "Status": 1,
  "Invoices": [
    {
      "InvoiceNr": 10600180968,
      "Amount": 2029744.31
    }
  ],
  "PayModes": [
    { "PayMode": "PAGOINMED", "Amount": 105100.00, "Comment": "16582980 / 625" },
    { "PayMode": "VISA",      "Amount": 237400.00, "Comment": "16582980 / 625" },
    { "PayMode": "MERPAG",    "Amount": 414580.00, "Comment": "MercadoPago" },
    { "PayMode": "REMESAS",   "Amount": 223200.00, "Comment": "Remesa 561916" },
    { "PayMode": "DISCOVERY", "Amount": -10.69,    "Comment": "DISCOVERY" },
    { "PayMode": "DIFRECAU",  "Amount": -27525.00, "Comment": "DIFERENCIA DE CAJA" }
  ]
}
```

### Campos clave
| Campo | Valor | Descripción |
|---|---|---|
| `RefStr` | `"Caja {local} {fecha}"` | Campo "Referencia" en la UI del recibo. **NO es `Reference`** (ese no existe) |
| `CustCode` | Igual al de las facturas vinculadas | Si la factura tiene `CUIT0`, el recibo también. Si no, error `REGNOTCORRESPOND` |
| `Invoices[].InvoiceNr` | `SerNr` de la factura | Nro interno que devolvió Oppen al crear la factura |
| `Invoices[].Amount` | `total_oppen` de la factura | **Usar el Total que devolvió Oppen, no nuestro monto de BD** |
| `Status` | `1` (aprobado) | Status 0 no bypasea la validación de balance |

### CRÍTICO: Balance del recibo
- La **suma neta de PayModes debe ser EXACTAMENTE igual** a la suma de `Invoices[].Amount`
- `DISCOVERY` y `DIFRECAU` van con Amount **negativo** para compensar cuando hay más venta que facturación fiscal
- Si hay diferencia de centavos por redondeo IVA, **ajustar el Discovery** para absorber la diferencia
- Si no cierra exacto: Oppen devuelve `Invoice Balance Can Not Be Negative`

### Mapeo de PayModes
Códigos usados por nuestra integración:

| Forma de pago (nuestra BD) | PayMode de Oppen |
|---|---|
| VISA | `VISA` |
| VISA DÉBITO | `VISAD` |
| VISA PREPAGO | `VISA` |
| MASTERCARD | `MASTE` |
| MASTERCARD DÉBITO | `MASTED` |
| CABAL | `CABAL` |
| CABAL DÉBITO | `CABALD` |
| AMEX | `AMEX` |
| NARANJA | `NARAN` |
| MAESTRO | `MAEST` |
| DINERS | `DINER` |
| DECIDIR | `MASDL` |
| PAGOS INMEDIATOS | `PAGOINMED` |
| MERCADO PAGO | `MERPAG` |
| PEDIDOS YA | `PEDIDOYA` |
| RAPPI | `RAPPI` |
| REMESAS (efectivo) | `REMESAS` |
| PROPINAS | `PROPINAS` |
| DISCOVERY | `DISCOVERY` |
| DIFERENCIA DE CAJA | `DIFRECAU` |
| SERVICIO DE SEGURIDAD | `SEGURIDAD` |
| MANTENIMIENTO DE LOCALES | `MANLOCALES` |
| OTROS GASTOS DE OPERACION | `GOPERACION` |

**Importante**: normalizar acentos antes de buscar el código (ej: `"VISA DÉBITO"` → `"VISA DEBITO"` → `VISAD`). Usar `unicodedata.normalize('NFD', ...)`.

### Respuesta de Oppen
```json
{
  "SerNr": 19419,
  "InvTotal": 2029744.31,
  "PayTotal": 2029744.31,
  "DifValue": 0,
  "Status": 1,
  "RefStr": "Caja Tostado 2026-03-21",
  "Invoices": [...],
  "PayModes": [...]
}
```

Guardamos `SerNr` en `locales_auditados.sernr_recibo_oppen`.

---

## 5. Clientes especiales

El `CustCode` por defecto es `C00001` (CONSUMIDOR FINAL). Algunos locales usan otros:

| Local | CustCode | Nombre |
|---|---|---|
| Tostado | `CUIT0` | CLIENTE AFIP CUIT 0 |
| Milvidas | `ZT11111` | (específico de Milvidas) |
| Resto | `C00001` | CONSUMIDOR FINAL |

Aplicado tanto a facturas como a recibos (deben coincidir o falla con `REGNOTCORRESPOND`).

---

## 6. Labels (etiquetas)

Cada local tiene un código único en Oppen (ej: `ALMF01`, `CRZ02`, `TSTTR01`). Se guardan en la tabla `labels_oppen`:

```sql
SELECT local, cod_oppen FROM labels_oppen;
```

Al enviar `Labels`, Oppen puede agregar automáticamente la razón social después de una coma (ej: `"ALMF01,PERSEO"` o `"CCHH,RABBLE"`). **Esto es comportamiento de Oppen, no de nuestra integración** — nosotros solo enviamos el código limpio.

Si el label no existe en Oppen → error `LINKTOINVALIDVALUEERR Labels`.

---

## 7. Locales excluidos de la sincronización

- **Costa7070**: se audita manualmente por configuración compleja. Lista en `LOCALES_SIN_OPPEN`.

---

## 8. Errores comunes y soluciones

| Error | Causa | Solución |
|---|---|---|
| `Duplicate Official Serial Nr!` | La factura con ese `OfficialSerNr` ya existe en Oppen | Filtrar `sernr_oppen IS NULL` para no re-enviar |
| `Invoice Balance Can Not Be Negative` | El `Amount` del recibo supera el `Total` de la factura | Usar `total_oppen` en vez de `monto` de BD, y ajustar Discovery para que cierre exacto |
| `NOBALANCEERR` | `Amount: 0` en una Invoice del recibo | Siempre enviar el Amount correcto (nunca 0 ni omitir) |
| `LINKTOINVALIDVALUEERR Labels` | El código de label no existe en Oppen | Agregar el label a `labels_oppen` con el código que existe en Oppen |
| `LINKTOINVALIDVALUEERR PayMode` | El código de PayMode no existe en Oppen | Verificar normalización de acentos (ver FP_CODE_MAP) |
| `LINKTOINVALIDVALUEERR Account` | La cuenta contable no existe (ej: 2110112, 1110322) | Solo ocurre en **ambiente test**. En producción todas las cuentas están configuradas |
| `REGNOTCORRESPOND InvoiceNr` | El `CustCode` del recibo no coincide con el de la factura | Usar el mismo cliente en factura y recibo (ej: ambos `CUIT0` para Tostado) |
| `Field Reference not found` | Enviamos `Reference` en el recibo | El campo correcto es `RefStr` |
| `Field OfficialEndSerNr not found` | Enviamos `OfficialEndSerNr` | El campo correcto es `ToOfficialSerNr` |
| HTTP 502 con HTML de "Testing Framework" | La instancia de Oppen **test** está apagada | Iniciarla manualmente desde el panel web de ngprueba.oppen.io |

---

## 9. Columnas BIGINT necesarias en nuestra BD

Los `SerNr` que devuelve Oppen superan el máximo de INT (2,147,483,647). **Todas las columnas que guardan SerNr deben ser BIGINT**:

```sql
ALTER TABLE facturas_trns MODIFY sernr_oppen BIGINT NULL;
ALTER TABLE cuentas_corrientes_trns MODIFY sernr_oppen BIGINT NULL;
ALTER TABLE oppen_sync_log MODIFY sernr_oppen BIGINT NULL;
ALTER TABLE locales_auditados MODIFY sernr_recibo_oppen BIGINT NULL;
```

También guardamos:
```sql
ALTER TABLE facturas_trns ADD COLUMN total_oppen DECIMAL(15,2) NULL;
```

---

## 10. Flujo completo al auditar un local

1. **Usuario marca el local como auditado** en la app
2. **Iteramos facturas `tipo IN ('A','B','Z') AND sernr_oppen IS NULL`** y las creamos una por una en Oppen
   - Guardamos `SerNr` y `Total` en `facturas_trns`
3. **Iteramos CCs `sernr_oppen IS NULL`** y las creamos en Oppen con `Office=200, VATCode=3`
   - Guardamos `SerNr` en `cuentas_corrientes_trns`
4. **Armamos el recibo**:
   - `Invoices[]`: facturas A/B/Z creadas con su `sernr_oppen` y `total_oppen` como Amount
   - `PayModes[]`: query a cada tabla de cobros (tarjetas, MP, remesas, etc.)
   - Agregamos Discovery y Diferencia calculadas de BD
   - Ajustamos Discovery para que suma neta = suma total_oppen (balance exacto)
5. **Enviamos el recibo** a Oppen
   - Guardamos el `SerNr` del recibo en `locales_auditados.sernr_recibo_oppen`
6. **Log de sincronización** en tabla `oppen_sync_log` con status, request, response

---

## 11. Campos de Oppen importantes para referencia

### En Facturas (respuesta)
- `SerNr`: ID interno de Oppen (lo usamos para vincular en recibos)
- `OfficialSerNr`: número oficial AFIP (formato 5-8 dígitos)
- `Total`: monto final con IVA incluido
- `Saldo`: cuánto falta cobrar (útil para verificar si ya tiene recibo)
- `Status`: 1 = aprobada, 0 = no aprobada
- `VATPerc`: alícuota IVA aplicada (21, 0, etc.)
- `InvoiceDate`: fecha de la factura
- `DueDate`: fecha de vencimiento
- `PayTerm`: término de pago (`D30` = 30 días)

### En Recibos (respuesta)
- `SerNr`: ID interno del recibo
- `InvTotal`: total de facturas vinculadas
- `PayTotal`: total de medios de pago
- `DifValue`: diferencia entre ambos (debe ser 0)
- `RefStr`: referencia visible en UI
- `Status`: 1 = aprobado
