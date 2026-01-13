# Implementación de Recibos en Oppen

## Estado: EN PROGRESO

## Resumen

Este documento describe la implementación para crear automáticamente recibos en Oppen cuando se marca un local como auditado.

## Cambios Requeridos

### 1. Base de Datos

**Agregar columna a `facturas_trns`:**
```sql
ALTER TABLE facturas_trns
ADD COLUMN sernr_oppen BIGINT NULL
COMMENT 'SerNr generado por Oppen al crear la factura';

CREATE INDEX idx_sernr_oppen ON facturas_trns(sernr_oppen);
```

**Ejecutar:**
```bash
python add_sernr_column_script.py
```

###2. Modificaciones a `modules/oppen_integration.py`

#### A. Modificar `sync_facturas_batch` para guardar SerNr

Después de crear cada factura exitosamente, guardar el SerNr:

```python
for factura in facturas:
    success, message, response_data = self.create_invoice(factura)

    if success and response_data:
        # Guardar SerNr en la BD
        sernr = response_data.get('SerNr')
        if sernr:
            factura['sernr_oppen'] = sernr  # Guardar para uso posterior
        resultados['exitosas'] += 1
    else:
        resultados['fallidas'] += 1
        ...
```

#### B. Agregar función para actualizar SerNr en BD

```python
def _update_sernr_in_db(self, conn, factura_id: int, sernr: int):
    """Actualiza el sernr_oppen en facturas_trns"""
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE facturas_trns
            SET sernr_oppen = %s
            WHERE id = %s
        """, (sernr, factura_id))
        conn.commit()
        cur.close()
    except Exception as e:
        logger.error(f"Error actualizando sernr_oppen: {e}")
```

#### C. Agregar método para crear recibos

```python
def create_receipt(self, recibo_data: Dict[str, Any]) -> Tuple[bool, str, Optional[Dict]]:
    """
    Crea un recibo en Oppen.

    Args:
        recibo_data: Diccionario con:
            - TransDate: fecha del recibo (YYYY-MM-DD)
            - CustCode: código del cliente (ej: "C00001")
            - Labels: label del local (ej: "BT212")
            - Invoices: lista de facturas a vincular [{"InvoiceNr": sernr}, ...]
            - PayModes: lista de medios de pago [{"PayMode": "VISA", "Amount": 1000, ...}, ...]

    Returns:
        Tuple[bool, str, Optional[Dict]]
    """
    if not self.token:
        return False, "No autenticado", None

    url = f"{self.BASE_URL}/genericapi/ApiNg/Receipt"

    try:
        payload = {
            # Dejar que Oppen genere SerNr y OfficialSerNr
            "TransDate": recibo_data["TransDate"],
            "CustCode": recibo_data.get("CustCode", self.DEFAULT_CUSTOMER),
            "Office": self.DEFAULT_OFFICE,
            "Labels": recibo_data.get("Labels", ""),
            "createUser": "API",
            "Status": 0,

            # Facturas vinculadas
            "Invoices": recibo_data.get("Invoices", []),

            # Medios de pago
            "PayModes": recibo_data.get("PayModes", []),
        }

        logger.info(f"📤 Enviando recibo con {len(payload['Invoices'])} facturas y {len(payload['PayModes'])} medios de pago...")

        response = self.session.post(url, json=payload, timeout=30)

        if response.status_code in [200, 201]:
            response_data = response.json()
            logger.info(f"✅ Recibo creado exitosamente en Oppen")
            return True, "Recibo creado exitosamente", response_data
        else:
            error_msg = f"Error HTTP {response.status_code}: {response.text}"
            logger.error(f"❌ {error_msg}")
            return False, error_msg, None

    except Exception as e:
        error_msg = f"Error: {str(e)}"
        logger.error(f"❌ {error_msg}")
        return False, error_msg, None
```

###3. Nueva función `sync_recibo_to_oppen` en `modules/oppen_integration.py`

```python
def sync_recibo_to_oppen(conn, local: str, fecha: str) -> Dict[str, Any]:
    """
    Crea un recibo en Oppen vinculando todas las facturas Z del día.

    Esta función debe ejecutarse DESPUÉS de sync_facturas_to_oppen,
    ya que necesita los sernr_oppen de las facturas Z.

    Args:
        conn: Conexión a BD
        local: Nombre del local
        fecha: Fecha YYYY-MM-DD

    Returns:
        Dict con resultado de la sincronización
    """
    from modules.auditoria import FP_CODE_MAP  # Importar mapeo de formas de pago

    cur = conn.cursor(dictionary=True)

    try:
        # 1. Obtener label de Oppen
        cur.execute("""
            SELECT cod_oppen
            FROM labels_oppen
            WHERE local = %s
            LIMIT 1
        """, (local,))

        label_row = cur.fetchone()
        label_oppen = label_row['cod_oppen'] if label_row else local

        # 2. Obtener facturas Z con sus SerNr de Oppen
        cur.execute("""
            SELECT id, sernr_oppen
            FROM facturas_trns
            WHERE local = %s
              AND DATE(fecha) = %s
              AND estado = 'ok'
              AND tipo = 'Z'
              AND sernr_oppen IS NOT NULL
            ORDER BY id
        """, (local, fecha))

        facturas_z = cur.fetchall()

        if not facturas_z:
            return {
                'success': True,
                'message': 'No hay facturas Z con SerNr para crear recibo',
                'recibo_creado': False
            }

        # 3. Construir lista de facturas para el recibo
        invoices = []
        for fz in facturas_z:
            invoices.append({
                "InvoiceNr": int(fz['sernr_oppen']),
                "Amount": 0,  # Oppen calcula automáticamente
            })

        # 4. Obtener PayModes (medios de pago) usando la misma lógica que auditoria.py
        pay_modes = _build_pay_modes(conn, local, fecha)

        # 5. Crear recibo
        recibo_data = {
            "TransDate": fecha,
            "CustCode": "C00001",
            "Labels": label_oppen,
            "Invoices": invoices,
            "PayModes": pay_modes,
        }

        client = OppenClient()
        client.authenticate()

        success, message, response_data = client.create_receipt(recibo_data)

        if success:
            return {
                'success': True,
                'message': f'Recibo creado con {len(invoices)} facturas y {len(pay_modes)} medios de pago',
                'recibo_creado': True,
                'sernr': response_data.get('SerNr') if response_data else None,
            }
        else:
            return {
                'success': False,
                'message': f'Error creando recibo: {message}',
                'recibo_creado': False,
            }

    except Exception as e:
        logger.error(f"❌ Error sincronizando recibo: {str(e)}")
        return {
            'success': False,
            'message': f'Error: {str(e)}',
            'recibo_creado': False,
        }
    finally:
        cur.close()


def _build_pay_modes(conn, local: str, fecha: str) -> List[Dict[str, Any]]:
    """
    Construye la lista de PayModes para el recibo.
    Replica EXACTAMENTE la lógica de modules/auditoria.py auditor_resumen_api()
    """
    # Esta función debe implementarse copiando la lógica de auditor_resumen_api
    # para construir los medios de pago con el mismo formato
    # Ver líneas 136-510 de modules/auditoria.py

    # TO-DO: Implementar esta función
    pass
```

### 4. Modificar `app.py` endpoint `api_marcar_auditado`

Después de crear las facturas, crear el recibo:

```python
# Después de sync_facturas_to_oppen

# Crear recibo con las facturas Z
try:
    from modules.oppen_integration import sync_recibo_to_oppen

    resultado_recibo = sync_recibo_to_oppen(conn, local, f)

    if resultado_recibo['recibo_creado']:
        msg_recibo = f"\n✅ Recibo creado en Oppen"
    else:
        msg_recibo = f"\n⚠️ {resultado_recibo['message']}"

except Exception as e:
    logger.error(f"Error creando recibo: {e}")
    msg_recibo = f"\n⚠️ Error creando recibo: {str(e)}"

# Agregar msg_recibo al mensaje final
```

## Próximos Pasos

1. ✅ Crear script SQL para agregar columna
2. ⏳ Ejecutar script SQL
3. ⏳ Implementar `_build_pay_modes()` copiando lógica de auditoria.py
4. ⏳ Modificar `sync_facturas_batch` para guardar SerNr
5. ⏳ Implementar `create_receipt()` en OppenClient
6. ⏳ Implementar `sync_recibo_to_oppen()`
7. ⏳ Integrar en `api_marcar_auditado`
8. ⏳ Probar

## Preguntas Pendientes

- ¿El campo `Comment` en PayModes debe incluir terminal/lote para tarjetas?
- ¿Cómo manejar montos negativos en PayModes (DISCOVERY, DIFERENCIA, PROPINAS)?
