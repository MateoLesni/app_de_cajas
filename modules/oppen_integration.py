"""
Módulo de integración con la API de Oppen para creación automática de facturas.

Este módulo maneja:
- Autenticación con la API de Oppen
- Transformación de datos de facturas locales a formato Oppen
- Envío de facturas cuando un local se marca como auditado
- Manejo de errores y logging detallado
"""

import os
import requests
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
import random

# Configurar logger
logger = logging.getLogger(__name__)


def log_sync_attempt(
    conn,
    sync_type: str,
    registro_id: Optional[int],
    local: str,
    fecha: str,
    fecha_auditado: str,
    local_auditado: str,
    status: str,
    sernr_oppen: Optional[int] = None,
    error_message: Optional[str] = None,
    request_payload: Optional[dict] = None,
    response_payload: Optional[dict] = None
) -> bool:
    """
    Registra un intento de sincronización en la tabla oppen_sync_log.

    Args:
        conn: Conexión a la base de datos
        sync_type: Tipo de sincronización ('factura', 'cuenta_corriente', 'recibo')
        registro_id: ID del registro original (puede ser None para recibos)
        local: Local del registro
        fecha: Fecha del registro
        fecha_auditado: Fecha en que se marcó como auditado
        local_auditado: Local que fue auditado
        status: Estado del intento ('success', 'failed', 'pending')
        sernr_oppen: SerNr devuelto por Oppen (si fue exitoso)
        error_message: Mensaje de error (si falló)
        request_payload: Datos enviados a Oppen (opcional)
        response_payload: Respuesta de Oppen (opcional)

    Returns:
        bool: True si se registró correctamente, False en caso contrario
    """
    try:
        import json
        from decimal import Decimal

        class _Encoder(json.JSONEncoder):
            def default(self, o):
                if isinstance(o, Decimal):
                    return float(o)
                return super().default(o)

        cur = conn.cursor()

        # Auto-migrar sernr_oppen a BIGINT si es INT (los SerNr de Oppen superan INT max)
        for tbl in ['oppen_sync_log', 'facturas_trns', 'cuentas_corrientes_trns']:
            try:
                cur.execute("""
                    SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = %s
                      AND COLUMN_NAME = 'sernr_oppen'
                """, (tbl,))
                col_row = cur.fetchone()
                if col_row and 'bigint' not in str(col_row[0] if isinstance(col_row, tuple) else col_row.get('COLUMN_TYPE', '')).lower():
                    cur.execute(f"ALTER TABLE {tbl} MODIFY COLUMN sernr_oppen BIGINT NULL")
                    conn.commit()
                    logger.info(f"[MIGRATE] {tbl}.sernr_oppen cambiado a BIGINT")
            except Exception:
                pass

        # Convertir payloads a JSON string para MySQL
        request_json = json.dumps(request_payload, ensure_ascii=False, cls=_Encoder) if request_payload else None
        response_json = json.dumps(response_payload, ensure_ascii=False, cls=_Encoder) if response_payload else None

        cur.execute("""
            INSERT INTO oppen_sync_log (
                sync_type,
                registro_id,
                local,
                fecha,
                fecha_auditado,
                local_auditado,
                status,
                sernr_oppen,
                error_message,
                request_payload,
                response_payload
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
        """, (
            sync_type,
            registro_id,
            local,
            fecha,
            fecha_auditado,
            local_auditado,
            status,
            sernr_oppen,
            error_message,
            request_json,
            response_json
        ))

        conn.commit()
        cur.close()

        logger.debug(f"📝 Log registrado: {sync_type} {registro_id} - {status}")
        return True

    except Exception as e:
        logger.error(f"❌ Error registrando log de sync: {e}")
        logger.error(f"   Detalles - sync_type: {sync_type}, registro_id: {registro_id}, local: {local}")
        logger.error(f"   request_payload type: {type(request_payload)}")
        logger.error(f"   response_payload type: {type(response_payload)}")
        import traceback
        logger.error(f"   Traceback: {traceback.format_exc()}")
        return False


class OppenAPIError(Exception):
    """Excepción personalizada para errores de la API de Oppen"""
    pass


class OppenClient:
    """Cliente para interactuar con la API de Oppen"""

    # Configuración de la API (PRODUCCIÓN)
    BASE_URL = "https://ng.oppen.io"
    USERNAME = "API"
    PASSWORD = "apingprueba123"

    # Constantes de mapeo
    DEFAULT_CUSTOMER = "C00001"  # Consumidor Final
    DEFAULT_OFFICE = "100"       # Sucursal
    DEFAULT_LABEL = "Local"      # Label para facturas
    PAYMENT_DAYS = 30            # Días de plazo para vencimiento

    def __init__(self):
        """Inicializa el cliente de Oppen"""
        self.token = None
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json'
        })

    def authenticate(self) -> bool:
        """
        Autentica el usuario en la API de Oppen y obtiene el token.

        Returns:
            bool: True si la autenticación fue exitosa, False en caso contrario

        Raises:
            OppenAPIError: Si hay un error en la autenticación
        """
        url = f"{self.BASE_URL}/genericapi/ApiNg/authenticate"

        try:
            logger.info("🔐 Autenticando en Oppen API...")
            response = self.session.post(
                url,
                json={
                    "username": self.USERNAME,
                    "password": self.PASSWORD
                },
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                self.token = data.get("token")

                if not self.token:
                    raise OppenAPIError("Token no recibido en la respuesta de autenticación")

                # Actualizar headers con el token
                self.session.headers.update({
                    'Authorization': f'Bearer {self.token}'
                })

                logger.info("✅ Autenticación exitosa en Oppen")
                return True
            else:
                error_msg = f"Error de autenticación: HTTP {response.status_code} - {response.text}"
                logger.error(f"❌ {error_msg}")
                raise OppenAPIError(error_msg)

        except requests.exceptions.RequestException as e:
            error_msg = f"Error de conexión durante autenticación: {str(e)}"
            logger.error(f"❌ {error_msg}")
            raise OppenAPIError(error_msg)

    def _generate_sernr(self) -> int:
        """
        Genera un SerNr único para la factura.

        En producción, esto debería venir de una secuencia en base de datos
        para garantizar unicidad. Por ahora usamos un número secuencial basado
        en el formato que usa Oppen (similar al ejemplo: 120000000000001).

        Returns:
            int: Número de serie único en el rango permitido por Oppen
        """
        # Formato: 12 + timestamp de 10 dígitos (últimos 10 de timestamp actual)
        # Esto nos da números como: 120000000001, 120000000002, etc.
        timestamp_str = str(int(datetime.now().timestamp()))[-10:]  # Últimos 10 dígitos
        random_suffix = random.randint(1, 999)  # 3 dígitos aleatorios
        return int(f"12{timestamp_str}{random_suffix:03d}")

    def _generate_official_sernr(self, punto_venta: str, nro_factura: str) -> str:
        """
        Genera el OfficialSerNr en formato PPPP-NNNNNNNN.

        Args:
            punto_venta: Punto de venta (ej: "00005")
            nro_factura: Número de factura (ej: "00001691")

        Returns:
            str: OfficialSerNr formateado (ej: "0005-00001691")
        """
        # Asegurar formato de 5 dígitos para PV y 8 para número
        pv = str(punto_venta).zfill(5)
        nro = str(nro_factura).zfill(8)
        return f"{pv}-{nro}"

    def _map_tipo_factura(self, tipo: str) -> dict:
        """
        Mapea el tipo de factura local a los campos de Oppen.

        Args:
            tipo: Tipo de factura local ("Z", "A", "B", "CC")

        Returns:
            dict: Diccionario con VoucherCode, DocType, InvoiceType y FormType

        Note:
            Códigos AFIP (VoucherCode):
            - "001" = Factura A
            - "006" = Factura B (Factura C)
            - "083" = Tique

            DocType:
            - 1 = Factura estándar
            - 4 = Reporte Z / Cierre de caja

            FormType:
            - "Z" = Reporte Z (cierre de caja)
            - null = Otros tipos
        """
        tipo_map = {
            "A": {
                "VoucherCode": "001",  # Factura A
                "DocType": 1,
                "InvoiceType": 0,
                "FormType": None
            },
            "B": {
                "VoucherCode": "006",  # Factura B
                "DocType": 1,
                "InvoiceType": 0,
                "FormType": None
            },
            "Z": {
                "VoucherCode": "083",  # Tique
                "DocType": 4,          # DocType 4 = Reporte Z
                "InvoiceType": 0,
                "FormType": "Z"        # FormType "Z" = Cierre de caja
            },
            "CC": {
                "VoucherCode": "083",  # Tique
                "DocType": 1,
                "InvoiceType": 0,
                "FormType": None
            }
        }
        return tipo_map.get(tipo.upper(), tipo_map["B"])  # Default: Factura B

    def _build_invoice_payload(self, factura: Dict[str, Any]) -> Dict[str, Any]:
        """
        Construye el payload para crear una factura en Oppen.

        Args:
            factura: Diccionario con los datos de la factura local

        Returns:
            Dict: Payload formateado para la API de Oppen
        """
        # Parsear fecha de la factura
        if isinstance(factura['fecha'], str):
            trans_date = datetime.strptime(factura['fecha'], '%Y-%m-%d %H:%M:%S').date()
        else:
            trans_date = factura['fecha']

        # Calcular fecha de vencimiento
        due_date = trans_date + timedelta(days=self.PAYMENT_DAYS)

        # Para facturas históricas, asegurar que DueDate no esté en el pasado
        # Si la fecha calculada es anterior a hoy, usar hoy + 30 días
        today = datetime.now().date()
        if due_date < today:
            due_date = today + timedelta(days=self.PAYMENT_DAYS)
            logger.info(f"⚠️ Factura histórica detectada. DueDate ajustado a {due_date}")

        # Generar identificadores
        # PRUEBA: Dejamos que Oppen genere el SerNr automáticamente
        # sernr = self._generate_sernr()
        official_sernr = self._generate_official_sernr(
            factura['punto_venta'],
            factura['nro_factura']
        )

        # Mapear tipo de factura
        tipo_config = self._map_tipo_factura(factura['tipo'])

        # Construir payload
        payload = {
            # === IDENTIFICACIÓN ===
            # "SerNr": sernr,  # COMENTADO: Dejamos que Oppen lo genere
            "OfficialSerNr": official_sernr,
            "ToOfficialSerNr": official_sernr,

            # === CLIENTE Y FECHAS ===
            "CustCode": factura.get('cust_code', self.DEFAULT_CUSTOMER),
            "TransDate": str(trans_date),
            "InvoiceDate": str(trans_date),  # Fecha Factura = fecha de la caja
            "DueDate": str(due_date),

            # === CONFIGURACIÓN ===
            "Office": self.DEFAULT_OFFICE,
            "Labels": factura.get('label_oppen', factura['local']),
            "createUser": "API",
            "Status": 1,  # Aprobado (necesario para vincular a recibos)

            # === TIPO DE COMPROBANTE ===
            "VoucherCode": tipo_config["VoucherCode"],
            "DocType": tipo_config["DocType"],
            "InvoiceType": tipo_config["InvoiceType"],
            "FormType": tipo_config["FormType"],

            # === ITEMS ===
            # El monto de la app es IVA incluido. Oppen suma IVA al Price,
            # así que enviamos monto / 1.21 para que el Total Bruto sea el monto exacto.
            "Items": [
                {
                    "ArtCode": "271240051",  # Artículo genérico (IVA 21%, código 5)
                    "Qty": 1,
                    "Price": round(float(factura['monto']) / 1.21, 2)
                }
            ]
        }

        return payload

    def create_invoice(self, factura: Dict[str, Any]) -> Tuple[bool, str, Optional[Dict]]:
        """
        Crea una factura en Oppen.

        Args:
            factura: Diccionario con los datos de la factura local

        Returns:
            Tuple[bool, str, Optional[Dict]]:
                - success: True si se creó exitosamente
                - message: Mensaje descriptivo del resultado
                - response_data: Datos de respuesta de Oppen (si aplica)
        """
        if not self.token:
            return False, "No autenticado. Llamar a authenticate() primero.", None

        url = f"{self.BASE_URL}/genericapi/ApiNg/Invoice"

        try:
            payload = self._build_invoice_payload(factura)

            logger.info(f"📤 Enviando factura {factura['tipo']} {factura['punto_venta']}-{factura['nro_factura']} (${factura['monto']})...")
            logger.debug(f"📦 Payload: {payload}")

            response = self.session.post(
                url,
                json=payload,
                timeout=30
            )

            if response.status_code in [200, 201]:
                response_data = response.json()
                logger.info(f"✅ Factura creada exitosamente en Oppen")
                # Log completo de la respuesta para debugging
                import json
                logger.info(f"📋 Respuesta completa de Oppen:")
                logger.info(json.dumps(response_data, indent=2, ensure_ascii=False))
                return True, "Factura creada exitosamente", response_data
            else:
                error_msg = f"Error HTTP {response.status_code}: {response.text}"
                logger.error(f"❌ {error_msg}")
                return False, error_msg, None

        except requests.exceptions.RequestException as e:
            error_msg = f"Error de conexión: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return False, error_msg, None
        except Exception as e:
            error_msg = f"Error inesperado: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return False, error_msg, None

    def sync_facturas_batch(self, facturas: List[Dict[str, Any]], conn=None, fecha_auditado: str = None, local_auditado: str = None) -> Dict[str, Any]:
        """
        Sincroniza un lote de facturas con Oppen.

        Args:
            facturas: Lista de diccionarios con datos de facturas
            conn: Conexión a BD (opcional) para guardar sernr_oppen
            fecha_auditado: Fecha en que se marcó como auditado (para logging)
            local_auditado: Local que fue auditado (para logging)

        Returns:
            Dict con el resultado de la sincronización:
            {
                'total': int,
                'exitosas': int,
                'fallidas': int,
                'errores': List[Dict],
                'success': bool,
                'facturas_creadas': List[Dict]  # Incluye id y sernr_oppen
            }
        """
        if not facturas:
            return {
                'total': 0,
                'exitosas': 0,
                'fallidas': 0,
                'errores': [],
                'success': True,
                'facturas_creadas': []
            }

        # Autenticar antes de enviar
        try:
            self.authenticate()
        except OppenAPIError as e:
            return {
                'total': len(facturas),
                'exitosas': 0,
                'fallidas': len(facturas),
                'errores': [{'error': f'Error de autenticación: {str(e)}', 'factura': None}],
                'success': False,
                'facturas_creadas': []
            }

        resultados = {
            'total': len(facturas),
            'exitosas': 0,
            'fallidas': 0,
            'errores': [],
            'facturas_creadas': []
        }

        logger.info(f"📦 Iniciando sincronización de {len(facturas)} facturas con Oppen...")

        for factura in facturas:
            success, message, response_data = self.create_invoice(factura)

            # Preparar datos para logging
            factura_fecha = str(factura.get('fecha', ''))
            if ' ' in factura_fecha:
                factura_fecha = factura_fecha.split()[0]  # Obtener solo la fecha

            factura_local = factura.get('local', '')
            factura_id = factura.get('id')

            # Construir payload para logging (no incluimos el payload completo para ahorrar espacio)
            request_payload_log = {
                'tipo': factura['tipo'],
                'punto_venta': factura['punto_venta'],
                'nro_factura': factura['nro_factura'],
                'monto': factura['monto']
            }

            if success and response_data:
                # Obtener SerNr generado por Oppen
                sernr_oppen = response_data.get('SerNr')
                official_sernr = response_data.get('OfficialSerNr', 'N/A')

                logger.info(f"🔢 Respuesta de Oppen para factura ID {factura.get('id')} ({factura['tipo']} {factura['punto_venta']}-{factura['nro_factura']}):")
                logger.info(f"   - SerNr recibido: {sernr_oppen}")
                logger.info(f"   - OfficialSerNr recibido: {official_sernr}")

                # Obtener Total real de Oppen (puede diferir de nuestro monto por redondeo IVA)
                total_oppen = response_data.get('Total')

                if sernr_oppen and conn and factura.get('id'):
                    # Guardar SerNr y Total de Oppen en la BD
                    try:
                        cur = conn.cursor()
                        # Auto-agregar columna total_oppen si no existe
                        try:
                            cur.execute("""
                                SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                                WHERE TABLE_SCHEMA = DATABASE()
                                  AND TABLE_NAME = 'facturas_trns'
                                  AND COLUMN_NAME = 'total_oppen'
                            """)
                            if cur.fetchone()[0] == 0:
                                cur.execute("ALTER TABLE facturas_trns ADD COLUMN total_oppen DECIMAL(15,2) NULL")
                                conn.commit()
                                print("[MIGRATE] facturas_trns.total_oppen agregado")
                        except Exception:
                            pass

                        cur.execute("""
                            UPDATE facturas_trns
                            SET sernr_oppen = %s, total_oppen = %s
                            WHERE id = %s
                        """, (sernr_oppen, total_oppen, factura['id']))
                        conn.commit()
                        cur.close()
                        logger.info(f"✅ SerNr {sernr_oppen} + Total {total_oppen} guardado en BD para factura ID {factura['id']}")

                        # Agregar a lista de facturas creadas
                        resultados['facturas_creadas'].append({
                            'id': factura['id'],
                            'sernr_oppen': sernr_oppen,
                            'tipo': factura['tipo']
                        })
                    except Exception as e:
                        logger.error(f"⚠️ Error guardando SerNr en BD: {e}")
                        logger.error(f"   Valor SerNr que causó error: {sernr_oppen}")

                # Log sync exitoso
                if conn and fecha_auditado and local_auditado:
                    log_sync_attempt(
                        conn=conn,
                        sync_type='factura',
                        registro_id=factura_id,
                        local=factura_local,
                        fecha=factura_fecha,
                        fecha_auditado=fecha_auditado,
                        local_auditado=local_auditado,
                        status='success',
                        sernr_oppen=sernr_oppen,
                        request_payload=request_payload_log,
                        response_payload={'SerNr': sernr_oppen, 'OfficialSerNr': official_sernr}
                    )

                resultados['exitosas'] += 1
            else:
                # Log sync fallido
                if conn and fecha_auditado and local_auditado:
                    log_sync_attempt(
                        conn=conn,
                        sync_type='factura',
                        registro_id=factura_id,
                        local=factura_local,
                        fecha=factura_fecha,
                        fecha_auditado=fecha_auditado,
                        local_auditado=local_auditado,
                        status='failed',
                        error_message=message,
                        request_payload=request_payload_log
                    )

                resultados['fallidas'] += 1
                resultados['errores'].append({
                    'factura': f"{factura['tipo']} {factura['punto_venta']}-{factura['nro_factura']}",
                    'error': message
                })

        resultados['success'] = resultados['fallidas'] == 0

        logger.info(
            f"✨ Sincronización completada: "
            f"{resultados['exitosas']} exitosas, "
            f"{resultados['fallidas']} fallidas de {resultados['total']} totales"
        )

        return resultados

    def create_cuenta_corriente_invoice(self, cc_data: Dict[str, Any]) -> Tuple[bool, str, Optional[Dict]]:
        """
        Crea una factura de cuenta corriente (Tique B) en Oppen.

        Args:
            cc_data: Diccionario con:
                - TransDate: fecha de la transacción (YYYY-MM-DD)
                - CustCode: código del cliente en Oppen (ej: "CNGCC" para Consumidor Final)
                - Labels: label del local (ej: "BT212")
                - Name: descripción del cajero (va en Items[0].Name)
                - Price: monto de la cuenta corriente
                - Office: "200" para facturada=0, "100" para facturada=1
                - VATCode: "3" para facturada=0 (sin IVA), "5" para facturada=1 (21% IVA)
                - OfficialSerNr: formato "{punto_venta:04d}-{nro_comanda:08d}"

        Returns:
            Tuple[bool, str, Optional[Dict]]
        """
        if not self.token:
            return False, "No autenticado. Llamar a authenticate() primero.", None

        url = f"{self.BASE_URL}/genericapi/ApiNg/Invoice"

        try:
            # Calcular fecha de vencimiento
            if isinstance(cc_data['TransDate'], str):
                trans_date = datetime.strptime(cc_data['TransDate'], '%Y-%m-%d').date()
            else:
                trans_date = cc_data['TransDate']

            due_date = trans_date + timedelta(days=self.PAYMENT_DAYS)

            # Para facturas históricas, asegurar que DueDate no esté en el pasado
            today = datetime.now().date()
            if due_date < today:
                due_date = today + timedelta(days=self.PAYMENT_DAYS)

            # Construir payload para Tique B de Cuenta Corriente
            payload = {
                "OfficialSerNr": cc_data["OfficialSerNr"],
                "CustCode": cc_data.get("CustCode", self.DEFAULT_CUSTOMER),
                "TransDate": str(trans_date),
                "InvoiceDate": str(trans_date),  # Fecha Factura = fecha de la caja
                "DueDate": str(due_date),
                "Office": cc_data["Office"],
                "Labels": cc_data.get("Labels", ""),
                "createUser": "API",
                "Status": 1,  # Aprobado
                "VoucherCode": "082",  # Tique B
                "DocType": 1,
                "InvoiceType": 0,
                "Items": [
                    {
                        "ArtCode": "OTR-ING",  # Otros ingresos (CC no es venta de mercadería)
                        "Name": cc_data["Name"],  # Descripción del cajero
                        "Qty": 1,
                        "Price": float(cc_data["Price"]),
                        "VATCode": cc_data["VATCode"]
                    }
                ]
            }

            logger.info(f"📤 Enviando factura CC {cc_data['OfficialSerNr']} (${cc_data['Price']})...")
            logger.debug(f"📦 Payload CC: {payload}")

            response = self.session.post(url, json=payload, timeout=30)

            if response.status_code in [200, 201]:
                response_data = response.json()
                logger.info(f"✅ Factura CC creada exitosamente en Oppen")
                import json
                logger.info(json.dumps(response_data, indent=2, ensure_ascii=False))
                return True, "Factura CC creada exitosamente", response_data
            else:
                error_msg = f"Error HTTP {response.status_code}: {response.text}"
                logger.error(f"❌ {error_msg}")
                return False, error_msg, None

        except requests.exceptions.RequestException as e:
            error_msg = f"Error de conexión: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return False, error_msg, None
        except Exception as e:
            error_msg = f"Error inesperado: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return False, error_msg, None

    def create_receipt(self, recibo_data: Dict[str, Any]) -> Tuple[bool, str, Optional[Dict]]:
        """
        Crea un recibo en Oppen.

        Args:
            recibo_data: Diccionario con:
                - TransDate: fecha del recibo (YYYY-MM-DD)
                - CustCode: código del cliente (ej: "C00001")
                - Labels: label del local (ej: "BT212")
                - Invoices: lista de facturas a vincular [{"InvoiceNr": sernr, "Amount": monto}, ...]
                - PayModes: lista de medios de pago [{"PayMode": "VISA", "Amount": 1000, ...}, ...]

        Returns:
            Tuple[bool, str, Optional[Dict]]
        """
        if not self.token:
            return False, "No autenticado", None

        url = f"{self.BASE_URL}/genericapi/ApiNg/Receipt"

        try:
            # Preparar Invoices.
            #  - Fila de factura: {InvoiceNr, Amount?}
            #  - Fila de ANTICIPO (consumo): {OnAccNr, DebtType:1, InvoiceAmount, Amount}
            #    con monto NEGATIVO (cancela la factura sin plata nueva). Ver ANTICIPOS_OPPEN.md §4.2
            invoices_cleaned = []
            for inv in recibo_data.get("Invoices", []):
                if inv.get("OnAccNr") is not None:
                    monto = round(float(inv.get("Amount", inv.get("InvoiceAmount", 0))), 2)
                    invoices_cleaned.append({
                        "OnAccNr": int(inv["OnAccNr"]),
                        "DebtType": 1,
                        "InvoiceAmount": monto,
                        "Amount": monto,
                    })
                    continue
                inv_entry = {"InvoiceNr": inv["InvoiceNr"]}
                if "Amount" in inv and inv["Amount"]:
                    inv_entry["Amount"] = inv["Amount"]
                invoices_cleaned.append(inv_entry)

            # Preparar PayModes - quitar Comment si está vacío
            paymodes_cleaned = []
            for pm in recibo_data.get("PayModes", []):
                pm_entry = {
                    "PayMode": pm["PayMode"],
                    "Amount": pm["Amount"]
                }
                # Solo agregar Comment si no está vacío
                if pm.get("Comment", "").strip():
                    pm_entry["Comment"] = pm["Comment"]
                paymodes_cleaned.append(pm_entry)

            payload = {
                "TransDate": recibo_data["TransDate"],
                "CustCode": recibo_data.get("CustCode", self.DEFAULT_CUSTOMER),
                "Office": self.DEFAULT_OFFICE,
                "Labels": recibo_data.get("Labels", ""),
                "RefStr": recibo_data.get("Reference", ""),
                "createUser": "API",
                "Status": 1,
                "Invoices": invoices_cleaned,
                "PayModes": paymodes_cleaned,
            }

            logger.info(f"📤 Enviando recibo con {len(payload['Invoices'])} facturas y {len(payload['PayModes'])} medios de pago...")
            logger.info(f"📦 Payload recibo completo (cleaned):")
            import json
            logger.info(json.dumps(payload, indent=2, ensure_ascii=False))

            response = self.session.post(url, json=payload, timeout=30)

            if response.status_code in [200, 201]:
                response_data = response.json()
                logger.info(f"✅ Recibo creado exitosamente en Oppen")
                logger.info(f"📄 Respuesta completa de Oppen:")
                logger.info(json.dumps(response_data, indent=2, ensure_ascii=False))
                return True, "Recibo creado exitosamente", response_data
            else:
                error_msg = f"Error HTTP {response.status_code}: {response.text}"
                logger.error(f"❌ {error_msg}")
                return False, error_msg, None

        except Exception as e:
            error_msg = f"Error: {str(e)}"
            logger.error(f"❌ {error_msg}")
            return False, error_msg, None

    def create_anticipo(self, anticipo_data: Dict[str, Any]) -> Tuple[bool, str, Optional[Dict]]:
        """
        Crea un ANTICIPO en Oppen (ver ANTICIPOS_OPPEN.md).

        Un anticipo es un Recibo (Office 100) con una unica fila de Invoices
        con DebtType=1 y SIN InvoiceNr. Se envia SIEMPRE aprobado (Status=1):
        en borrador el OnAccNr viene null y Receipt no tiene PUT, asi que no
        habria forma de aprobarlo despues.

        anticipo_data: TransDate, CustCode, Labels, RefStr, Amount, PayMode, Comment

        Returns (ok, msg, response). En response:
            SerNr                 -> N del recibo
            Invoices[0].OnAccNr   -> N DE ANTICIPO (lo que se consume despues)
        """
        if not self.token:
            return False, "No autenticado", None

        url = f"{self.BASE_URL}/genericapi/ApiNg/Receipt"
        try:
            amount = round(float(anticipo_data["Amount"]), 2)
            if amount <= 0:
                return False, "El monto del anticipo debe ser mayor a cero", None

            pm = {"PayMode": anticipo_data["PayMode"], "Amount": amount}
            comment = (anticipo_data.get("Comment") or "").strip()
            if comment:
                pm["Comment"] = comment

            payload = {
                "Office": self.DEFAULT_OFFICE,
                "CustCode": anticipo_data.get("CustCode", self.DEFAULT_CUSTOMER),
                "TransDate": anticipo_data["TransDate"],
                "Labels": anticipo_data.get("Labels", ""),
                "RefStr": anticipo_data.get("RefStr", ""),
                "createUser": "API",
                "Status": 1,
                "Invoices": [{"DebtType": 1, "InvoiceAmount": amount, "Amount": amount}],
                "PayModes": [pm],
            }

            import json
            print(f"[ANTICIPO-OPPEN] POST {url}")
            print(json.dumps(payload, indent=2, ensure_ascii=False))

            response = self.session.post(url, json=payload, timeout=30)

            if response.status_code not in (200, 201):
                error_msg = f"Error HTTP {response.status_code}: {response.text[:800]}"
                print(f"[ANTICIPO-OPPEN] ❌ {error_msg}")
                return False, error_msg, None

            data = response.json()
            sernr = data.get("SerNr")
            filas = data.get("Invoices") or []
            onaccnr = filas[0].get("OnAccNr") if filas else None
            if not onaccnr:
                # Sin OnAccNr el anticipo no sirve para consumir; lo tratamos como fallo
                # (pero el recibo quedo creado en Oppen: se informa el SerNr para revisarlo).
                error_msg = f"Oppen creo el recibo {sernr} pero no devolvio OnAccNr (anticipo sin numero)"
                print(f"[ANTICIPO-OPPEN] ❌ {error_msg}")
                return False, error_msg, data

            print(f"[ANTICIPO-OPPEN] ✅ Recibo {sernr} | OnAccNr (N anticipo) = {onaccnr}")
            return True, f"Anticipo creado: N {onaccnr} (recibo {sernr})", data

        except Exception as e:
            error_msg = f"Error: {str(e)}"
            print(f"[ANTICIPO-OPPEN] ❌ {error_msg}")
            return False, error_msg, None


# =============================================================================
# ANTICIPOS EN OPPEN (creacion + persistencia del OnAccNr)
# =============================================================================
# Feature flag: mientras no este en "1", crear_anticipo_en_oppen no envia nada
# (permite deployar sin crear anticipos reales hasta validar en ngprueba).
ANTICIPOS_OPPEN_ENABLED = os.getenv("ANTICIPOS_OPPEN_ENABLED", "0") == "1"
# Override de URL SOLO para anticipos (ej. https://ngprueba.oppen.io). Si esta
# vacio se usa OppenClient.BASE_URL (el mismo de facturas/recibos).
ANTICIPOS_OPPEN_URL = (os.getenv("ANTICIPOS_OPPEN_URL") or "").strip()
# PayMode generico hasta que el sector confirme la lista (editable por medio en BD).
ANTICIPOS_PAYMODE_DEFAULT = "INTERC"


def _get_label_oppen(cur, local: str) -> str:
    """cod_oppen del local (sin razon social); si no hay, el nombre del local."""
    cur.execute("SELECT cod_oppen FROM labels_oppen WHERE local = %s LIMIT 1", (local,))
    row = cur.fetchone()
    label = (row['cod_oppen'] if row else None) or local
    if ',' in label:
        label = label.split(',')[0].strip()
    return label


_ANTICIPOS_OPPEN_COLS_OK = False


def _ensure_anticipos_oppen_columns(conn) -> None:
    """Auto-migracion inline (patron del proyecto) de las columnas de migrations/15.
    Se verifica una sola vez por proceso: despues es no-op."""
    global _ANTICIPOS_OPPEN_COLS_OK
    if _ANTICIPOS_OPPEN_COLS_OK:
        return
    cur = conn.cursor()
    try:
        def _has(table, col):
            cur.execute("""
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s
            """, (table, col))
            r = cur.fetchone()
            return (r[0] if isinstance(r, tuple) else list(r.values())[0]) > 0

        alters = [
            ('anticipos_recibidos', 'oppen_sernr',      "ALTER TABLE anticipos_recibidos ADD COLUMN oppen_sernr BIGINT NULL"),
            ('anticipos_recibidos', 'oppen_onaccnr',    "ALTER TABLE anticipos_recibidos ADD COLUMN oppen_onaccnr BIGINT NULL"),
            ('anticipos_recibidos', 'oppen_estado',     "ALTER TABLE anticipos_recibidos ADD COLUMN oppen_estado VARCHAR(20) NULL"),
            ('anticipos_recibidos', 'oppen_error',      "ALTER TABLE anticipos_recibidos ADD COLUMN oppen_error TEXT NULL"),
            ('anticipos_recibidos', 'oppen_enviado_at', "ALTER TABLE anticipos_recibidos ADD COLUMN oppen_enviado_at DATETIME NULL"),
            ('anticipos_recibidos', 'oppen_url',        "ALTER TABLE anticipos_recibidos ADD COLUMN oppen_url VARCHAR(120) NULL"),
            ('medios_anticipos',    'paymode_oppen',    "ALTER TABLE medios_anticipos ADD COLUMN paymode_oppen VARCHAR(30) NULL"),
            ('anticipos_estados_caja', 'oppen_consumo_sernr', "ALTER TABLE anticipos_estados_caja ADD COLUMN oppen_consumo_sernr BIGINT NULL"),
        ]
        for table, col, ddl in alters:
            if not _has(table, col):
                cur.execute(ddl)
                conn.commit()
                print(f"[MIGRATE] {table}.{col} agregado")
                if col == 'paymode_oppen':
                    cur.execute("UPDATE medios_anticipos SET paymode_oppen = %s WHERE paymode_oppen IS NULL",
                                (ANTICIPOS_PAYMODE_DEFAULT,))
                    conn.commit()
        # oppen_sync_log.sync_type es ENUM: sin 'anticipo' el log de envios de anticipos
        # fallaba en silencio (Data truncated) y no quedaba rastro.
        try:
            cur.execute("""
                SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'oppen_sync_log' AND COLUMN_NAME = 'sync_type'
            """)
            r = cur.fetchone()
            ctype = (r[0] if isinstance(r, tuple) else list(r.values())[0]) if r else ''
            if ctype and 'anticipo' not in str(ctype):
                cur.execute("""ALTER TABLE oppen_sync_log
                               MODIFY sync_type ENUM('factura','cuenta_corriente','recibo','anticipo') NOT NULL""")
                conn.commit()
                print("[MIGRATE] oppen_sync_log.sync_type += 'anticipo'")
        except Exception as e_enum:
            print(f"[MIGRATE] ⚠️ oppen_sync_log.sync_type: {e_enum}")
        # PayMode por local + medio (override del default de medios_anticipos.paymode_oppen)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS anticipos_paymode_local (
                id INT AUTO_INCREMENT PRIMARY KEY,
                local VARCHAR(100) NOT NULL,
                medio_pago_id INT NOT NULL,
                paymode_oppen VARCHAR(30) NOT NULL,
                updated_by VARCHAR(100) NULL,
                updated_at DATETIME NULL,
                UNIQUE KEY uq_local_medio (local, medio_pago_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)
        conn.commit()
        _ANTICIPOS_OPPEN_COLS_OK = True
    except Exception as e:
        print(f"[MIGRATE] ⚠️ _ensure_anticipos_oppen_columns: {e}")
    finally:
        try: cur.close()
        except Exception: pass


def resolver_paymode_anticipo(cur, local: str, medio_pago_id, paymode_default: Optional[str]) -> str:
    """PayMode efectivo: override por local+medio > default del medio > INTERC."""
    if local and medio_pago_id:
        try:
            cur.execute("""
                SELECT paymode_oppen FROM anticipos_paymode_local
                WHERE local = %s AND medio_pago_id = %s LIMIT 1
            """, (local, medio_pago_id))
            r = cur.fetchone()
            if r:
                v = r['paymode_oppen'] if isinstance(r, dict) else r[0]
                if v and str(v).strip():
                    return str(v).strip()
        except Exception as e:
            print(f"[ANTICIPO-OPPEN] ⚠️ no se pudo leer paymode por local: {e}")
    return (paymode_default or ANTICIPOS_PAYMODE_DEFAULT).strip()


def crear_anticipo_en_oppen(conn, anticipo_id: int, usuario: Optional[str] = None) -> Dict[str, Any]:
    """
    Envia a Oppen un anticipo ya guardado en anticipos_recibidos y persiste
    SerNr + OnAccNr. Idempotente: si ya tiene OnAccNr no reenvia.

    Reglas (ANTICIPOS_OPPEN.md):
      - Siempre Status=1. No hay PUT en Receipt: un error se corrige con
        contra-recibos, NO editando -> validar todo ANTES de mandar.
      - El monto va en ARS: si el anticipo es en otra divisa se convierte con
        cotizacion_divisa (obligatoria en ese caso).
      - PayMode: medios_anticipos.paymode_oppen (editable), default INTERC.
      - CustCode: Consumidor Final (decision actual).
      - RefStr: "<fecha evento> <local>" ; Comment: N transaccion + cliente.
    """
    if not ANTICIPOS_OPPEN_ENABLED:
        return {
            'success': False, 'skipped': True,
            'message': 'Integración de anticipos con Oppen desactivada (ANTICIPOS_OPPEN_ENABLED != 1)'
        }

    _ensure_anticipos_oppen_columns(conn)
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("""
            SELECT a.id, a.local, a.fecha_pago, a.fecha_evento, a.importe, a.divisa,
                   a.cotizacion_divisa, a.cliente, a.numero_transaccion, a.medio_pago_id,
                   a.estado, a.oppen_sernr, a.oppen_onaccnr,
                   m.paymode_oppen, m.nombre AS medio_nombre
            FROM anticipos_recibidos a
            LEFT JOIN medios_anticipos m ON m.id = a.medio_pago_id
            WHERE a.id = %s
        """, (anticipo_id,))
        a = cur.fetchone()
        if not a:
            return {'success': False, 'message': f'Anticipo {anticipo_id} no encontrado'}
        if a['estado'] == 'eliminado_global':
            return {'success': False, 'message': 'El anticipo está eliminado; no se envía a Oppen'}
        if a['oppen_onaccnr']:
            return {
                'success': True, 'already': True,
                'onaccnr': int(a['oppen_onaccnr']), 'sernr': a['oppen_sernr'],
                'message': f"El anticipo ya está en Oppen (N {a['oppen_onaccnr']}, recibo {a['oppen_sernr']})"
            }

        # Monto en ARS
        divisa = (a['divisa'] or 'ARS').strip().upper()
        importe = float(a['importe'] or 0)
        if divisa == 'ARS':
            monto = round(importe, 2)
        else:
            cot = a['cotizacion_divisa']
            if not cot or float(cot) <= 0:
                return {'success': False,
                        'message': f'Anticipo en {divisa} sin cotización: no se puede convertir a ARS para Oppen'}
            monto = round(importe * float(cot), 2)
        if monto <= 0:
            return {'success': False, 'message': 'El monto del anticipo debe ser mayor a cero'}

        paymode = resolver_paymode_anticipo(cur, a['local'], a['medio_pago_id'], a['paymode_oppen'])
        label = _get_label_oppen(cur, a['local'])
        fecha_pago = a['fecha_pago'].isoformat() if hasattr(a['fecha_pago'], 'isoformat') else str(a['fecha_pago'])
        fecha_evento = a['fecha_evento'].isoformat() if hasattr(a['fecha_evento'], 'isoformat') else str(a['fecha_evento'])

        comment = (a['numero_transaccion'] or f"Anticipo #{a['id']}").strip()
        comment = f"{comment} - {a['cliente']}"[:120]

        anticipo_data = {
            "TransDate": fecha_pago,
            "CustCode": OppenClient.DEFAULT_CUSTOMER,
            "Labels": label,
            "RefStr": f"{fecha_evento} {a['local']}",
            "Amount": monto,
            "PayMode": paymode,
            "Comment": comment,
        }

        client = OppenClient()
        if ANTICIPOS_OPPEN_URL:
            client.BASE_URL = ANTICIPOS_OPPEN_URL.rstrip('/')
        print(f"[ANTICIPO-OPPEN] anticipo {a['id']} ({a['local']}, {divisa} {importe} -> ARS {monto}, PayMode {paymode}) via {client.BASE_URL}")

        try:
            client.authenticate()
        except OppenAPIError as e:
            msg = f"No se pudo autenticar en Oppen: {e}"
            _marcar_anticipo_oppen_error(conn, a['id'], msg)
            return {'success': False, 'message': msg}

        ok, msg, resp = client.create_anticipo(anticipo_data)

        if ok:
            sernr = resp.get('SerNr')
            onaccnr = int(resp['Invoices'][0]['OnAccNr'])
            cur_u = conn.cursor()
            cur_u.execute("""
                UPDATE anticipos_recibidos
                SET oppen_sernr = %s, oppen_onaccnr = %s, oppen_estado = 'creado',
                    oppen_error = NULL, oppen_enviado_at = NOW(), oppen_url = %s
                WHERE id = %s
            """, (sernr, onaccnr, client.BASE_URL.rstrip('/'), a['id']))
            conn.commit()
            cur_u.close()
            log_sync_attempt(
                conn=conn, sync_type='anticipo', registro_id=a['id'],
                local=a['local'], fecha=fecha_pago, fecha_auditado=fecha_pago,
                local_auditado=a['local'], status='success', sernr_oppen=sernr,
                request_payload=anticipo_data,
                response_payload={'SerNr': sernr, 'OnAccNr': onaccnr},
            )
            return {'success': True, 'onaccnr': onaccnr, 'sernr': sernr, 'message': msg}

        _marcar_anticipo_oppen_error(conn, a['id'], msg)
        log_sync_attempt(
            conn=conn, sync_type='anticipo', registro_id=a['id'],
            local=a['local'], fecha=fecha_pago, fecha_auditado=fecha_pago,
            local_auditado=a['local'], status='failed', error_message=msg,
            request_payload=anticipo_data, response_payload=resp,
        )
        return {'success': False, 'message': msg, 'sernr_huerfano': (resp or {}).get('SerNr')}

    except Exception as e:
        import traceback
        traceback.print_exc()
        msg = f"Error inesperado enviando anticipo a Oppen: {e}"
        try:
            _marcar_anticipo_oppen_error(conn, anticipo_id, msg)
        except Exception:
            pass
        return {'success': False, 'message': msg}
    finally:
        try: cur.close()
        except Exception: pass


def _marcar_anticipo_oppen_error(conn, anticipo_id: int, msg: str) -> None:
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE anticipos_recibidos
            SET oppen_estado = 'error', oppen_error = %s
            WHERE id = %s AND oppen_onaccnr IS NULL
        """, ((msg or '')[:2000], anticipo_id))
        conn.commit()
    finally:
        cur.close()


def sync_facturas_to_oppen(conn, local: str, fecha: str) -> Dict[str, Any]:
    """
    Función principal para sincronizar todas las facturas de un local/fecha con Oppen.

    Solo sincroniza facturas tipo A, B y Z (ignora CC y otros tipos).

    Args:
        conn: Conexión a la base de datos MySQL
        local: Nombre del local
        fecha: Fecha en formato YYYY-MM-DD

    Returns:
        Dict con el resultado de la sincronización
    """
    cur = conn.cursor(dictionary=True)

    try:
        # 1. Obtener label de Oppen para el local
        cur.execute("""
            SELECT cod_oppen
            FROM labels_oppen
            WHERE local = %s
            LIMIT 1
        """, (local,))

        label_row = cur.fetchone()
        label_oppen = label_row['cod_oppen'] if label_row else None

        if not label_oppen:
            logger.warning(f"⚠️ No se encontró label de Oppen para {local}, usando nombre del local")
            label_oppen = local

        # Asegurar que Labels sea solo el código de etiqueta (sin razón social)
        # Si tiene coma (ej: "ALMF01,PERSEO"), tomar solo el primer valor
        if ',' in label_oppen:
            label_oppen = label_oppen.split(',')[0].strip()

        logger.info(f"📋 Label Oppen para {local}: {label_oppen}")

        # 2. Obtener todas las facturas del local/fecha (SOLO tipo A, B y Z)
        cur.execute("""
            SELECT
                id,
                local,
                caja,
                turno,
                fecha,
                tipo,
                punto_venta,
                nro_factura,
                monto,
                comentario
            FROM facturas_trns
            WHERE local = %s
              AND DATE(fecha) = %s
              AND estado = 'ok'
              AND tipo IN ('A', 'B', 'Z')
              AND sernr_oppen IS NULL
            ORDER BY tipo, punto_venta, nro_factura
        """, (local, fecha))

        facturas = cur.fetchall()

        if not facturas:
            logger.warning(f"⚠️ No se encontraron facturas A, B o Z para {local} en {fecha}")
            return {
                'total': 0,
                'exitosas': 0,
                'fallidas': 0,
                'errores': [],
                'success': True,
                'message': 'No hay facturas A, B o Z para sincronizar',
                'label_oppen': label_oppen
            }

        # 3. Agregar label de Oppen y CustCode a cada factura
        # Clientes especiales por local
        LOCALES_CUSTCODE = {'Tostado': 'CUIT0', 'Milvidas': 'ZT11111'}
        cust_code = LOCALES_CUSTCODE.get(local, 'C00001')
        for factura in facturas:
            factura['label_oppen'] = label_oppen
            factura['cust_code'] = cust_code

        logger.info(f"📦 Encontradas {len(facturas)} facturas A/B/Z para sincronizar")

        # 4. Crear cliente y sincronizar (pasamos conn y datos de auditoría para logging)
        client = OppenClient()
        resultado = client.sync_facturas_batch(
            facturas,
            conn=conn,
            fecha_auditado=fecha,
            local_auditado=local
        )
        resultado['label_oppen'] = label_oppen

        return resultado

    except Exception as e:
        logger.error(f"❌ Error obteniendo facturas de BD: {str(e)}")
        return {
            'total': 0,
            'exitosas': 0,
            'fallidas': 0,
            'errores': [{'error': f'Error de base de datos: {str(e)}', 'factura': None}],
            'success': False
        }
    finally:
        cur.close()


def sync_cuentas_corrientes_to_oppen(conn, local: str, fecha: str) -> Dict[str, Any]:
    """
    Crea facturas en Oppen para todas las cuentas corrientes de un local/fecha.

    Esta función se ejecuta DESPUÉS de sync_facturas_to_oppen (facturas Z)
    y ANTES de sync_recibo_to_oppen.

    Args:
        conn: Conexión a la base de datos
        local: Nombre del local
        fecha: Fecha en formato YYYY-MM-DD

    Returns:
        Dict con el resultado de la sincronización:
        {
            'total': int,
            'exitosas': int,
            'fallidas': int,
            'errores': List[Dict],
            'success': bool,
            'facturas_creadas': List[Dict]
        }
    """
    cur = conn.cursor(dictionary=True)

    try:
        # 1. Obtener label de Oppen para el local
        cur.execute("""
            SELECT cod_oppen
            FROM labels_oppen
            WHERE local = %s
            LIMIT 1
        """, (local,))

        label_row = cur.fetchone()
        label_oppen = label_row['cod_oppen'] if label_row else local
        if ',' in label_oppen:
            label_oppen = label_oppen.split(',')[0].strip()

        logger.info(f"📋 Procesando cuentas corrientes para {local} ({label_oppen}) - {fecha}")

        # 2. Obtener todas las cuentas corrientes del local/fecha con datos del cliente
        cur.execute("""
            SELECT
                cc.id,
                cc.fecha,
                cc.cliente_id,
                cc.monto,
                cc.comentario,
                cc.facturada,
                cc.punto_venta,
                cc.nro_comanda,
                cl.codigo_oppen,
                cl.nombre_cliente
            FROM cuentas_corrientes_trns cc
            LEFT JOIN clientes_cta_cte cl ON cc.cliente_id = cl.id
            WHERE cc.local = %s
              AND DATE(cc.fecha) = %s
              AND cc.estado = 'ok'
              AND cc.sernr_oppen IS NULL
            ORDER BY cc.id
        """, (local, fecha))

        cuentas_corrientes = cur.fetchall()

        if not cuentas_corrientes:
            logger.info(f"ℹ️ No hay cuentas corrientes para {local} en {fecha}")
            return {
                'total': 0,
                'exitosas': 0,
                'fallidas': 0,
                'errores': [],
                'success': True,
                'message': 'No hay cuentas corrientes para sincronizar',
                'facturas_creadas': []
            }

        logger.info(f"📦 Encontradas {len(cuentas_corrientes)} cuentas corrientes para facturar")

        # 3. Autenticar con Oppen
        client = OppenClient()
        try:
            client.authenticate()
        except OppenAPIError as e:
            return {
                'total': len(cuentas_corrientes),
                'exitosas': 0,
                'fallidas': len(cuentas_corrientes),
                'errores': [{'error': f'Error de autenticación: {str(e)}', 'cc_id': None}],
                'success': False,
                'facturas_creadas': []
            }

        # 4. Crear factura para cada cuenta corriente
        resultados = {
            'total': len(cuentas_corrientes),
            'exitosas': 0,
            'fallidas': 0,
            'errores': [],
            'facturas_creadas': []
        }

        for cc in cuentas_corrientes:
            try:
                # Parsear fecha
                if isinstance(cc['fecha'], str):
                    # Intentar diferentes formatos de fecha
                    fecha_str = cc['fecha'].strip()
                    if ' ' in fecha_str:
                        # Formato con hora: "YYYY-MM-DD HH:MM:SS"
                        trans_date = datetime.strptime(fecha_str.split()[0], '%Y-%m-%d').date()
                    else:
                        # Formato solo fecha: "YYYY-MM-DD"
                        trans_date = datetime.strptime(fecha_str, '%Y-%m-%d').date()
                elif hasattr(cc['fecha'], 'date'):
                    # Es un objeto datetime
                    trans_date = cc['fecha'].date()
                else:
                    # Ya es un objeto date
                    trans_date = cc['fecha']

                # Determinar código de cliente en Oppen.
                # Cliente conocido → su codigo_oppen. "Otro Cliente" o sin código → CNGCC.
                codigo_oppen = cc.get('codigo_oppen')
                cust_code = codigo_oppen if codigo_oppen else "CNGCC"

                # Construir descripción
                # Si es CNGCC (Otro cliente), usar el comentario del cajero
                # Si no, usar el nombre del cliente + comentario adicional si existe
                nombre_cliente = cc.get('nombre_cliente', '')
                comentario_adicional = (cc.get('comentario') or '').strip()

                if codigo_oppen == 'CNGCC' or not codigo_oppen:
                    # Otro cliente: usar comentario como descripción principal
                    description = comentario_adicional if comentario_adicional else "Cuenta Corriente"
                else:
                    # Cliente conocido: nombre + comentario si existe
                    if comentario_adicional:
                        description = f"{nombre_cliente} - {comentario_adicional}"
                    else:
                        description = nombre_cliente

                # CC siempre van por Office 200 (no fiscal) con VATCode 3 (sin IVA)
                office = "200"
                vat_code = "3"

                # Generar OfficialSerNr — formato obligatorio de Oppen: 5 dígitos - 8 dígitos
                punto_venta = cc.get('punto_venta') or 1
                nro_comanda = cc.get('nro_comanda') or cc['id']
                official_sernr = f"{int(punto_venta):05d}-{int(nro_comanda):08d}"

                # CC sin IVA: el precio es el monto directo
                precio_neto = float(cc['monto'])

                cc_invoice_data = {
                    "TransDate": str(trans_date),
                    "CustCode": cust_code,
                    "Labels": label_oppen,
                    "Name": description,
                    "Price": precio_neto,
                    "Office": office,
                    "VATCode": vat_code,
                    "OfficialSerNr": official_sernr
                }

                # Crear factura en Oppen
                success, message, response_data = client.create_cuenta_corriente_invoice(cc_invoice_data)

                # Preparar datos para logging
                request_payload_log = {
                    'cc_id': cc['id'],
                    'cliente': nombre_cliente,
                    'monto': cc['monto'],
                    'official_sernr': official_sernr
                }

                if success and response_data:
                    sernr_oppen = response_data.get('SerNr')
                    logger.info(f"✅ Factura CC creada: ID {cc['id']} → SerNr {sernr_oppen}")

                    # Guardar SerNr en la BD para rastreo
                    if sernr_oppen:
                        try:
                            cur_update = conn.cursor()
                            cur_update.execute("""
                                UPDATE cuentas_corrientes_trns
                                SET sernr_oppen = %s
                                WHERE id = %s
                            """, (sernr_oppen, cc['id']))
                            conn.commit()
                            cur_update.close()
                            logger.info(f"✅ SerNr {sernr_oppen} guardado en BD para Cuenta Corriente ID {cc['id']}")
                        except Exception as e:
                            logger.error(f"⚠️ Error guardando SerNr en BD para CC ID {cc['id']}: {e}")

                    # Log sync exitoso
                    log_sync_attempt(
                        conn=conn,
                        sync_type='cuenta_corriente',
                        registro_id=cc['id'],
                        local=local,
                        fecha=str(trans_date),
                        fecha_auditado=fecha,
                        local_auditado=local,
                        status='success',
                        sernr_oppen=sernr_oppen,
                        request_payload=request_payload_log,
                        response_payload={'SerNr': sernr_oppen, 'OfficialSerNr': official_sernr}
                    )

                    resultados['exitosas'] += 1
                    resultados['facturas_creadas'].append({
                        'cc_id': cc['id'],
                        'sernr_oppen': sernr_oppen,
                        'official_sernr': official_sernr,
                        'monto': cc['monto']
                    })
                else:
                    # Log sync fallido
                    log_sync_attempt(
                        conn=conn,
                        sync_type='cuenta_corriente',
                        registro_id=cc['id'],
                        local=local,
                        fecha=str(trans_date),
                        fecha_auditado=fecha,
                        local_auditado=local,
                        status='failed',
                        error_message=message,
                        request_payload=request_payload_log
                    )

                    resultados['fallidas'] += 1
                    resultados['errores'].append({
                        'cc_id': cc['id'],
                        'official_sernr': official_sernr,
                        'error': message
                    })

            except Exception as e:
                logger.error(f"❌ Error procesando CC ID {cc['id']}: {str(e)}")
                resultados['fallidas'] += 1
                resultados['errores'].append({
                    'cc_id': cc['id'],
                    'error': str(e)
                })

        resultados['success'] = resultados['fallidas'] == 0

        logger.info(
            f"✨ Sincronización de Cuentas Corrientes completada: "
            f"{resultados['exitosas']} exitosas, "
            f"{resultados['fallidas']} fallidas de {resultados['total']} totales"
        )

        return resultados

    except Exception as e:
        logger.error(f"❌ Error obteniendo cuentas corrientes de BD: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'total': 0,
            'exitosas': 0,
            'fallidas': 0,
            'errores': [{'error': f'Error de base de datos: {str(e)}', 'cc_id': None}],
            'success': False,
            'facturas_creadas': []
        }
    finally:
        cur.close()


def sync_recibo_to_oppen(conn, local: str, fecha: str) -> Dict[str, Any]:
    """
    Crea un recibo en Oppen vinculando todas las facturas A, B y Z del día.

    NO vincula facturas tipo CC (Cuentas Corrientes), ya que son facturas individuales a clientes.

    Esta función debe ejecutarse DESPUÉS de sync_facturas_to_oppen,
    ya que necesita los sernr_oppen de las facturas A, B y Z.

    Usa el endpoint /api/auditoria/resumen para obtener los PayModes
    (mismo endpoint que usa "Carga masiva").

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
        if ',' in label_oppen:
            label_oppen = label_oppen.split(',')[0].strip()

        logger.info(f"📋 Creando recibo para {local} ({label_oppen}) - {fecha}")

        # 2. Obtener facturas A, B y Z con sus SerNr de Oppen y montos (excluye CC)
        # Incluir total_oppen (el Total real de Oppen) para usar como Amount en el recibo
        cur.execute("""
            SELECT id, tipo, sernr_oppen, monto, total_oppen
            FROM facturas_trns
            WHERE local = %s
              AND DATE(fecha) = %s
              AND estado = 'ok'
              AND tipo IN ('A', 'B', 'Z')
              AND sernr_oppen IS NOT NULL
            ORDER BY tipo, id
        """, (local, fecha))

        facturas = cur.fetchall()

        if not facturas:
            logger.warning(f"⚠️ No hay facturas A/B/Z con SerNr para crear recibo")
            return {
                'success': True,
                'message': 'No hay facturas A/B/Z con SerNr para crear recibo',
                'recibo_creado': False
            }

        # 3. Construir lista de facturas para el recibo
        # Usar total_oppen (Total real de Oppen) como Amount para evitar discrepancias de centavos
        # Si total_oppen no existe (facturas creadas antes de este cambio), usar monto de BD
        invoices = []
        total_facturas = 0
        for f in facturas:
            total_real = float(f.get('total_oppen') or f.get('monto', 0))
            total_facturas += total_real
            invoices.append({
                "InvoiceNr": int(f['sernr_oppen']),
                "Amount": total_real,
            })

        print(f"[RECIBO] === FACTURAS VINCULADAS ({len(invoices)}) ===")
        for f in facturas:
            t_oppen = f.get('total_oppen')
            monto_bd = f.get('monto')
            diff = round(float(monto_bd or 0) - float(t_oppen or monto_bd or 0), 4)
            print(f"[RECIBO]   ID={f.get('id')} tipo={f.get('tipo')} sernr={f.get('sernr_oppen')} monto_bd={monto_bd} total_oppen={t_oppen} diff={diff}")
        print(f"[RECIBO] Total facturas (usando total_oppen): {total_facturas}")

        # 3b. ANTICIPOS consumidos en esta caja/fecha que ya existen en Oppen (OnAccNr).
        # Van como filas NEGATIVAS de Invoices (DebtType=1): el anticipo cancela la
        # factura sin plata nueva (ANTICIPOS_OPPEN.md §4.2). Se agrupa por OnAccNr.
        # Los anticipos SIN OnAccNr (locales viejos / envio fallido) NO se tocan: siguen
        # absorbiendose en DIFERENCIA como hasta ahora.
        total_anticipos_oppen = 0.0
        anticipos_oppen_rows = []      # [{onaccnr, monto, anticipo_ids:[..]}]
        anticipos_sin_oppen = []       # ids consumidos localmente pero sin OnAccNr (aviso)
        anticipos_otro_ambiente = []   # ids con OnAccNr de OTRO Oppen (ej. ngprueba): NUNCA se consumen aca
        recibo_url = OppenClient.BASE_URL.rstrip('/')
        try:
            _ensure_anticipos_oppen_columns(conn)
            cur_ant = conn.cursor(dictionary=True)
            cur_ant.execute("""
                SELECT aec.id AS aec_id, aec.anticipo_id, aec.importe_consumido,
                       ar.oppen_onaccnr, ar.oppen_url, ar.cliente
                FROM anticipos_estados_caja aec
                JOIN anticipos_recibidos ar ON ar.id = aec.anticipo_id
                WHERE aec.local = %s
                  AND DATE(aec.fecha) = %s
                  AND aec.estado = 'consumido'
                  AND aec.oppen_consumo_sernr IS NULL
            """, (local, fecha))
            por_onacc = {}
            for r in cur_ant.fetchall() or []:
                monto_c = round(float(r['importe_consumido'] or 0), 2)
                if monto_c <= 0:
                    continue
                if not r['oppen_onaccnr']:
                    anticipos_sin_oppen.append(int(r['anticipo_id']))
                    continue
                # Los numeros de anticipo se solapan entre ngprueba y produccion: un OnAccNr
                # creado en otro ambiente podria consumir el anticipo de OTRO cliente.
                if (r.get('oppen_url') or '').rstrip('/') != recibo_url:
                    anticipos_otro_ambiente.append((int(r['anticipo_id']), int(r['oppen_onaccnr']), r.get('oppen_url')))
                    continue
                k = int(r['oppen_onaccnr'])
                g = por_onacc.setdefault(k, {'onaccnr': k, 'monto': 0.0, 'aec_ids': [], 'cliente': r['cliente']})
                g['monto'] = round(g['monto'] + monto_c, 2)
                g['aec_ids'].append(int(r['aec_id']))
            cur_ant.close()
            for g in por_onacc.values():
                invoices.append({"OnAccNr": g['onaccnr'], "Amount": -g['monto']})
                total_anticipos_oppen = round(total_anticipos_oppen + g['monto'], 2)
                anticipos_oppen_rows.append(g)
                print(f"[RECIBO]   ANTICIPO OnAccNr={g['onaccnr']} ({g['cliente']}) consume -{g['monto']}")
            if anticipos_sin_oppen:
                print(f"[RECIBO] ⚠️ Anticipos consumidos SIN OnAccNr (no van a Oppen, se absorben en DIFERENCIA): {anticipos_sin_oppen}")
            if anticipos_otro_ambiente:
                print(f"[RECIBO] ⚠️ Anticipos con OnAccNr de OTRO Oppen (recibo va a {recibo_url}); se saltean y se absorben en DIFERENCIA: {anticipos_otro_ambiente}")
        except Exception as e_ant:
            print(f"[RECIBO] ⚠️ No se pudieron cargar anticipos para el recibo: {e_ant}")
        print(f"[RECIBO] Total anticipos consumidos via Oppen: {total_anticipos_oppen}")

        # 4. Obtener PayModes directamente desde la BD
        # Consulta simplificada: obtener solo los totales por forma de pago
        try:
            cur_pm = conn.cursor(dictionary=True)
            rows = []

            # Obtener totales de tarjetas (con propinas incluidas).
            # LEFT JOIN a `terminales` para saber si la terminal tiene flag BK.
            # Si bk=1, usaremos los códigos PayMode alternativos del FP_CODE_MAP_BK.
            cur_pm.execute("""
                SELECT
                    t.tarjeta AS forma_pago,
                    CONCAT(t.terminal, ' / ', t.lote) AS descripcion,
                    SUM(t.monto + COALESCE(t.monto_tip, 0)) AS pagado,
                    COALESCE(MAX(tm.bk), 0) AS es_bk
                FROM tarjetas_trns t
                LEFT JOIN terminales tm
                    ON tm.local = t.local AND tm.terminal = t.terminal
                WHERE t.local = %s
                  AND DATE(t.fecha) = %s
                GROUP BY t.tarjeta, t.terminal, t.lote
            """, (local, fecha))
            rows_tarjetas = cur_pm.fetchall()
            if rows_tarjetas:
                rows.extend(rows_tarjetas)

            # Obtener MercadoPago (incluye NORMAL + TIP, como las tarjetas)
            cur_pm.execute("""
                SELECT
                    'MERCADO PAGO' AS forma_pago,
                    'MercadoPago' AS descripcion,
                    SUM(importe) AS pagado
                FROM mercadopago_trns
                WHERE local = %s
                  AND DATE(fecha) = %s
                  AND UPPER(tipo) IN ('NORMAL', 'TIP')
            """, (local, fecha))
            row_mp = cur_pm.fetchone()
            if row_mp and row_mp['pagado']:
                rows.append(row_mp)

            # Obtener Rappi
            cur_pm.execute("""
                SELECT
                    'RAPPI' AS forma_pago,
                    'Rappi' AS descripcion,
                    SUM(monto) AS pagado
                FROM rappi_trns
                WHERE local = %s
                  AND DATE(fecha) = %s
            """, (local, fecha))
            row_rappi = cur_pm.fetchone()
            if row_rappi and row_rappi['pagado']:
                rows.append(row_rappi)

            # Obtener PedidosYa
            cur_pm.execute("""
                SELECT
                    'PEDIDOS YA' AS forma_pago,
                    'PedidosYa' AS descripcion,
                    SUM(monto) AS pagado
                FROM pedidosya_trns
                WHERE local = %s
                  AND DATE(fecha) = %s
            """, (local, fecha))
            row_py = cur_pm.fetchone()
            if row_py and row_py['pagado']:
                rows.append(row_py)

            # Obtener Remesas (una fila por remesa)
            # Excluir remesas creadas por anticipos en efectivo (origen_anticipo_id NOT NULL)
            # Para remesas USD, usar total_conversion (monto convertido a ARS)
            # Verificar si existe la columna origen_anticipo_id
            try:
                cur_pm.execute("""
                    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'remesas_trns'
                      AND COLUMN_NAME = 'origen_anticipo_id'
                """)
                has_origen = cur_pm.fetchone()
                has_origen = (list(has_origen.values())[0] if isinstance(has_origen, dict) else has_origen[0]) > 0
            except Exception:
                has_origen = False

            filtro_origen = "AND (origen_anticipo_id IS NULL)" if has_origen else ""
            cur_pm.execute(f"""
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
                  {filtro_origen}
            """, (local, fecha))
            rows_remesas = cur_pm.fetchall()
            if rows_remesas:
                rows.extend(rows_remesas)

            # Obtener Gastos (una fila por gasto)
            cur_pm.execute("""
                SELECT
                    tipo AS forma_pago,
                    COALESCE(NULLIF(observaciones, ''), tipo) AS descripcion,
                    monto AS pagado
                FROM gastos_trns
                WHERE local = %s
                  AND DATE(fecha) = %s
            """, (local, fecha))
            rows_gastos = cur_pm.fetchall()
            if rows_gastos:
                rows.extend(rows_gastos)

            # -------- PROPINAS (en negativo) --------
            # 1) PROPINAS de tarjetas (suma de monto_tip de tarjetas_trns)
            cur_pm.execute("""
                SELECT SUM(monto_tip) AS total
                FROM tarjetas_trns
                WHERE local = %s
                  AND DATE(fecha) = %s
            """, (local, fecha))
            tips_tarj = cur_pm.fetchone()
            total_tips_tarjetas = tips_tarj.get('total') if tips_tarj else 0

            if total_tips_tarjetas and total_tips_tarjetas > 0:
                rows.append({
                    "forma_pago": "PROPINAS",
                    "descripcion": "PROPINAS",
                    "pagado": -1 * float(total_tips_tarjetas),  # NEGATIVO
                })

            # 2) PROPINAS de Mercado Pago (tipo='TIP')
            cur_pm.execute("""
                SELECT SUM(importe) AS total
                FROM mercadopago_trns
                WHERE local = %s
                  AND DATE(fecha) = %s
                  AND UPPER(tipo) = 'TIP'
            """, (local, fecha))
            tips_mp = cur_pm.fetchone()
            total_tips_mp = tips_mp.get('total') if tips_mp else 0

            if total_tips_mp and total_tips_mp > 0:
                rows.append({
                    "forma_pago": "PROPINAS",
                    "descripcion": "PROPINASMP",
                    "pagado": -1 * float(total_tips_mp),  # NEGATIVO
                })

            # -------- DISCOVERY y DIFERENCIA (calculados directamente de BD) --------
            try:
                # 1. Obtener venta_total_sistema
                cur_pm.execute("""
                    SELECT COALESCE(SUM(venta_total_sistema), 0) AS total
                    FROM ventas_trns
                    WHERE local = %s AND DATE(fecha) = %s
                """, (local, fecha))
                venta_total_sistema = float(cur_pm.fetchone()['total'] or 0.0)

                # 2. Obtener suma de facturas Z, A, B, CC para DISCOVERY
                cur_pm.execute("""
                    SELECT COALESCE(SUM(monto), 0) AS total
                    FROM facturas_trns
                    WHERE local = %s AND DATE(fecha) = %s
                      AND tipo IN ('Z', 'A', 'B', 'CC')
                """, (local, fecha))
                total_facturas_zab = float(cur_pm.fetchone()['total'] or 0.0)

                # 2b. Las Cuentas Corrientes del sistema nuevo también son fiscales:
                # restan al Discovery igual que una Z
                cur_pm.execute("""
                    SELECT COALESCE(SUM(monto), 0) AS total
                    FROM cuentas_corrientes_trns
                    WHERE local = %s AND DATE(fecha) = %s AND estado = 'ok'
                """, (local, fecha))
                total_cc_nuevas = float(cur_pm.fetchone()['total'] or 0.0)
                total_facturas_zab += total_cc_nuevas

                # 3. Calcular DISCOVERY
                discovery_val = venta_total_sistema - total_facturas_zab

                # 4. Calcular total_cobrado desde BD
                cur_pm.execute(f"""
                    SELECT COALESCE(SUM(
                        CASE WHEN divisa = 'USD' AND total_conversion IS NOT NULL THEN total_conversion ELSE monto END
                    ), 0) AS total FROM remesas_trns WHERE local = %s AND DATE(fecha) = %s {filtro_origen}
                """, (local, fecha))
                efectivo_total = float(cur_pm.fetchone()['total'] or 0.0)

                cur_pm.execute("SELECT COALESCE(SUM(monto), 0) AS total FROM tarjetas_trns WHERE local = %s AND DATE(fecha) = %s", (local, fecha))
                tarjeta_total = float(cur_pm.fetchone()['total'] or 0.0)

                cur_pm.execute("SELECT COALESCE(SUM(importe), 0) AS total FROM mercadopago_trns WHERE local = %s AND DATE(fecha) = %s AND UPPER(tipo) = 'NORMAL'", (local, fecha))
                mp_total = float(cur_pm.fetchone()['total'] or 0.0)

                cur_pm.execute("SELECT COALESCE(SUM(monto), 0) AS total FROM rappi_trns WHERE local = %s AND DATE(fecha) = %s", (local, fecha))
                rappi_total = float(cur_pm.fetchone()['total'] or 0.0)

                cur_pm.execute("SELECT COALESCE(SUM(monto), 0) AS total FROM gastos_trns WHERE local = %s AND DATE(fecha) = %s", (local, fecha))
                gastos_total = float(cur_pm.fetchone()['total'] or 0.0)

                cur_pm.execute("SELECT COALESCE(SUM(monto), 0) AS total FROM pedidosya_trns WHERE local = %s AND DATE(fecha) = %s", (local, fecha))
                pedidosya_total = float(cur_pm.fetchone()['total'] or 0.0)

                cur_pm.execute("SELECT COALESCE(SUM(monto), 0) AS total FROM facturas_trns WHERE local = %s AND DATE(fecha) = %s AND tipo = 'CC'", (local, fecha))
                cta_cte_total = float(cur_pm.fetchone()['total'] or 0.0)
                # Incluir CC del sistema nuevo (misma simetría que en el Discovery)
                cta_cte_total += total_cc_nuevas

                total_cobrado = sum([efectivo_total, tarjeta_total, mp_total, rappi_total, gastos_total, pedidosya_total, cta_cte_total])
                # Los anticipos que se consumen via Oppen (fila negativa OnAccNr) son
                # cobro real: van en total_cobrado para que NO aparezcan como DIFERENCIA.
                # (Igual que el calculo local, que suma anticipos_estados_caja.importe_consumido.)
                total_cobrado += total_anticipos_oppen

                # DIFERENCIA = total_cobrado - venta_total_sistema (invertido)
                diferencia_val = total_cobrado - venta_total_sistema

                # Agregar DISCOVERY (siempre, invertido en signo)
                rows.append({
                    "forma_pago": "DISCOVERY",
                    "descripcion": "DISCOVERY",
                    "pagado": round(-1 * discovery_val, 2),
                })

                # Agregar DIFERENCIA (siempre, invertido en signo)
                rows.append({
                    "forma_pago": "DIFRECAU",
                    "descripcion": "DIFERENCIA DE CAJA",
                    "pagado": round(-1 * diferencia_val, 2),
                })

            except Exception as e:
                logger.warning(f"⚠️ Error al calcular DISCOVERY/DIFERENCIA: {e}")
                import traceback
                traceback.print_exc()

            cur_pm.close()

        except Exception as e:
            logger.error(f"❌ Error obteniendo PayModes: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'message': f'Error obteniendo medios de pago: {str(e)}',
                'recibo_creado': False
            }

        # 5. Convertir rows a formato PayModes de Oppen
        from modules.auditoria import FP_CODE_MAP, FP_CODE_MAP_BK

        CODIGO_ESPECIAL_MAP = {
            'DECIDIR': 'MASDL',
        }

        pay_modes = []
        for row in rows:
            forma_pago_original = row.get('forma_pago', '')
            descripcion = row.get('descripcion', '')
            pagado = row.get('pagado', 0)
            es_bk = bool(row.get('es_bk', 0))  # solo viene en filas de tarjetas

            import unicodedata
            forma_pago_key = forma_pago_original.strip().upper()
            forma_pago_key = ''.join(
                c for c in unicodedata.normalize('NFD', forma_pago_key)
                if unicodedata.category(c) != 'Mn'
            )

            # Si la terminal está flaggeada como BK y la tarjeta tiene equivalente BK,
            # usar el código alternativo. Si no, comportamiento normal.
            if es_bk and forma_pago_key in FP_CODE_MAP_BK:
                forma_pago_codigo = FP_CODE_MAP_BK[forma_pago_key]
            else:
                forma_pago_codigo = FP_CODE_MAP.get(forma_pago_key, forma_pago_key)

            if forma_pago_codigo in CODIGO_ESPECIAL_MAP:
                forma_pago_codigo = CODIGO_ESPECIAL_MAP[forma_pago_codigo]

            try:
                amount = round(float(pagado), 2) if pagado else 0.0
            except:
                amount = 0.0

            if amount != 0:
                pay_modes.append({
                    "PayMode": forma_pago_codigo,
                    "Comment": descripcion,
                    "Amount": amount,
                })

        # Ajustar DISCOVERY para que la suma neta de PayModes sea EXACTAMENTE igual al
        # neto de Invoices: total_facturas (total_oppen) MENOS los anticipos consumidos
        # via Oppen (filas negativas OnAccNr). Absorbe centavos de redondeo IVA.
        target_paymodes = round(total_facturas - total_anticipos_oppen, 2)
        sum_neto_pre = round(sum(pm['Amount'] for pm in pay_modes), 2)
        ajuste = round(target_paymodes - sum_neto_pre, 2)
        if ajuste != 0:
            # Buscar el DISCOVERY existente y ajustarlo
            discovery_found = False
            for pm in pay_modes:
                if pm['PayMode'] == 'DISCOVERY':
                    print(f"[RECIBO] Ajustando DISCOVERY: {pm['Amount']} + {ajuste} = {round(pm['Amount'] + ajuste, 2)}")
                    pm['Amount'] = round(pm['Amount'] + ajuste, 2)
                    discovery_found = True
                    break
            if not discovery_found:
                # Si no hay DISCOVERY, crear uno con el ajuste
                print(f"[RECIBO] Creando DISCOVERY de ajuste: {ajuste}")
                pay_modes.append({
                    "PayMode": "DISCOVERY",
                    "Comment": "DISCOVERY",
                    "Amount": ajuste,
                })

        # Log diagnóstico detallado
        print(f"[RECIBO] === PAYMODES ({len(pay_modes)}) ===")
        sum_positivos = 0
        sum_negativos = 0
        for pm in pay_modes:
            signo = "+" if pm['Amount'] > 0 else ""
            print(f"[RECIBO]   {pm['PayMode']:<12} {signo}{pm['Amount']:>15.2f}  {pm.get('Comment','')}")
            if pm['Amount'] > 0:
                sum_positivos += pm['Amount']
            else:
                sum_negativos += pm['Amount']
        sum_neto = round(sum_positivos + sum_negativos, 2)
        print(f"[RECIBO] --- RESUMEN ---")
        print(f"[RECIBO]   Positivos: {round(sum_positivos, 2)}")
        print(f"[RECIBO]   Negativos: {round(sum_negativos, 2)}")
        print(f"[RECIBO]   Neto: {sum_neto}")
        print(f"[RECIBO]   Total facturas (total_oppen): {total_facturas}")
        print(f"[RECIBO]   Diferencia neto vs facturas: {round(total_facturas - sum_neto, 2)}")

        # 6. Crear recibo
        # Clientes especiales por local
        LOCALES_CUSTCODE = {'Tostado': 'CUIT0', 'Milvidas': 'ZT11111'}
        cust_code = LOCALES_CUSTCODE.get(local, 'C00001')
        recibo_data = {
            "TransDate": fecha,
            "CustCode": cust_code,
            "Labels": label_oppen,
            "Reference": f"Caja {local} {fecha}",
            "Invoices": invoices,
            "PayModes": pay_modes,
        }

        # Log detallado del payload completo con print para que aparezca en Cloud Logging
        import json
        print(f"[RECIBO] === PAYLOAD COMPLETO ===")
        print(json.dumps(recibo_data, indent=2, ensure_ascii=False, default=str))
        print(f"[RECIBO] === FIN PAYLOAD ===")

        # Resumen numérico
        sum_positivos = round(sum(pm['Amount'] for pm in pay_modes if pm['Amount'] > 0), 2)
        sum_negativos = round(sum(pm['Amount'] for pm in pay_modes if pm['Amount'] < 0), 2)
        sum_neto = round(sum(pm['Amount'] for pm in pay_modes), 2)
        print(f"[RECIBO] PayModes positivos: {sum_positivos}, negativos: {sum_negativos}, neto: {sum_neto}")
        print(f"[RECIBO] Total facturas: {total_facturas}, diferencia neto vs facturas: {round(total_facturas - sum_neto, 2)}")

        client = OppenClient()
        client.authenticate()

        success, message, response_data = client.create_receipt(recibo_data)

        # Fallback: si falla por "Invoice Balance Can Not Be Negative", reintentar con Status: 0 (desaprobado)
        if not success and 'Balance Can Not Be Negative' in (message or ''):
            logger.warning(f"⚠️ Recibo rechazado por balance negativo. Reintentando con Status: 0 (desaprobado)...")
            recibo_data["Status"] = 0
            success, message, response_data = client.create_receipt(recibo_data)
            if success:
                logger.info(f"✅ Recibo creado como DESAPROBADO (Status: 0) por balance negativo en factura")

        # ONLYPOSNRSERR = el ERP dice que un anticipo NO tiene saldo (ya consumido /
        # revertido). Es la fuente de verdad (ANTICIPOS_OPPEN.md §6.4): NO se reintenta
        # sin la fila (dejaria el consumo fuera de Oppen en silencio). Se informa claro.
        if not success and 'ONLYPOSNRSERR' in (message or ''):
            nros = ', '.join(str(g['onaccnr']) for g in anticipos_oppen_rows) or '?'
            message = (f"Oppen rechazó el consumo de anticipo (sin saldo en el ERP): OnAccNr {nros}. "
                       f"Revisar el anticipo en Oppen (¿ya consumido o revertido?) antes de re-auditar. "
                       f"Detalle: {message}")
            print(f"[RECIBO] ❌ {message}")

        # Preparar datos resumidos para logging (no guardamos todos los PayModes para ahorrar espacio)
        request_payload_log = {
            'num_invoices': len(invoices),
            'num_paymodes': len(pay_modes),
            'total_facturas': total_facturas,
            'anticipos_oppen': [{'onaccnr': g['onaccnr'], 'monto': g['monto']} for g in anticipos_oppen_rows],
            'anticipos_sin_oppen': anticipos_sin_oppen,
        }

        if success:
            sernr = response_data.get('SerNr') if response_data else None

            # Marcar en anticipos_estados_caja que recibo de Oppen consumio cada anticipo
            # (evita re-consumir si se vuelve a generar el recibo).
            if sernr and anticipos_oppen_rows:
                try:
                    cur_mk = conn.cursor()
                    aec_ids = [i for g in anticipos_oppen_rows for i in g['aec_ids']]
                    ph = ','.join(['%s'] * len(aec_ids))
                    cur_mk.execute(
                        f"UPDATE anticipos_estados_caja SET oppen_consumo_sernr = %s WHERE id IN ({ph})",
                        (sernr, *aec_ids))
                    conn.commit()
                    cur_mk.close()
                    print(f"[RECIBO] ✅ {len(aec_ids)} consumo(s) de anticipo marcados con recibo {sernr}")
                except Exception as e_mk:
                    print(f"[RECIBO] ⚠️ No se pudo marcar oppen_consumo_sernr: {e_mk}")

            # Log sync exitoso
            log_sync_attempt(
                conn=conn,
                sync_type='recibo',
                registro_id=None,  # Recibo no tiene ID en nuestra BD
                local=local,
                fecha=fecha,
                fecha_auditado=fecha,
                local_auditado=local,
                status='success',
                sernr_oppen=sernr,
                request_payload=request_payload_log,
                response_payload={'SerNr': sernr} if sernr else None
            )

            return {
                'success': True,
                'message': f'Recibo creado con {len(invoices)} facturas y {len(pay_modes)} medios de pago',
                'recibo_creado': True,
                'sernr': sernr,
            }
        else:
            # Log sync fallido
            log_sync_attempt(
                conn=conn,
                sync_type='recibo',
                registro_id=None,
                local=local,
                fecha=fecha,
                fecha_auditado=fecha,
                local_auditado=local,
                status='failed',
                error_message=message,
                request_payload=request_payload_log
            )

            return {
                'success': False,
                'message': f'Error creando recibo: {message}',
                'recibo_creado': False,
            }

    except Exception as e:
        logger.error(f"❌ Error sincronizando recibo: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'success': False,
            'message': f'Error: {str(e)}',
            'recibo_creado': False,
        }
    finally:
        cur.close()
