"""
Módulo de integración con la API de Oppen para creación automática de facturas.

Este módulo maneja:
- Autenticación con la API de Oppen
- Transformación de datos de facturas locales a formato Oppen
- Envío de facturas cuando un local se marca como auditado
- Manejo de errores y logging detallado
"""

import requests
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
import random

# Configurar logger
logger = logging.getLogger(__name__)


class OppenAPIError(Exception):
    """Excepción personalizada para errores de la API de Oppen"""
    pass


class OppenClient:
    """Cliente para interactuar con la API de Oppen"""

    # Configuración de la API (ambiente de pruebas)
    BASE_URL = "https://ngprueba.oppen.io"
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
        # Asegurar formato de 4 dígitos para PV y 8 para número
        pv = str(punto_venta).zfill(4)
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

            # === CLIENTE Y FECHAS ===
            "CustCode": self.DEFAULT_CUSTOMER,
            "TransDate": str(trans_date),
            "DueDate": str(due_date),

            # === CONFIGURACIÓN ===
            "Office": self.DEFAULT_OFFICE,
            "Labels": factura.get('label_oppen', factura['local']),  # Label de Oppen o nombre del local
            "createUser": "API",
            "Status": 1,  # Aprobado (necesario para vincular a recibos)

            # === TIPO DE COMPROBANTE ===
            "VoucherCode": tipo_config["VoucherCode"],
            "DocType": tipo_config["DocType"],
            "InvoiceType": tipo_config["InvoiceType"],
            "FormType": tipo_config["FormType"],

            # === ITEMS ===
            "Items": [
                {
                    "ArtCode": "271240051",  # Artículo genérico (según tu ejemplo)
                    "Qty": 1,
                    "Price": float(factura['monto'])
                    # Oppen calcula el IVA automáticamente
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

    def sync_facturas_batch(self, facturas: List[Dict[str, Any]], conn=None) -> Dict[str, Any]:
        """
        Sincroniza un lote de facturas con Oppen.

        Args:
            facturas: Lista de diccionarios con datos de facturas
            conn: Conexión a BD (opcional) para guardar sernr_oppen

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

            if success and response_data:
                # Obtener SerNr generado por Oppen
                sernr_oppen = response_data.get('SerNr')
                official_sernr = response_data.get('OfficialSerNr', 'N/A')

                logger.info(f"🔢 Respuesta de Oppen para factura ID {factura.get('id')} ({factura['tipo']} {factura['punto_venta']}-{factura['nro_factura']}):")
                logger.info(f"   - SerNr recibido: {sernr_oppen}")
                logger.info(f"   - OfficialSerNr recibido: {official_sernr}")

                if sernr_oppen and conn and factura.get('id'):
                    # Guardar SerNr en la BD
                    try:
                        cur = conn.cursor()
                        cur.execute("""
                            UPDATE facturas_trns
                            SET sernr_oppen = %s
                            WHERE id = %s
                        """, (sernr_oppen, factura['id']))
                        conn.commit()
                        cur.close()
                        logger.info(f"✅ SerNr {sernr_oppen} guardado en BD para factura ID {factura['id']}")

                        # Agregar a lista de facturas creadas
                        resultados['facturas_creadas'].append({
                            'id': factura['id'],
                            'sernr_oppen': sernr_oppen,
                            'tipo': factura['tipo']
                        })
                    except Exception as e:
                        logger.error(f"⚠️ Error guardando SerNr en BD: {e}")
                        logger.error(f"   Valor SerNr que causó error: {sernr_oppen}")

                resultados['exitosas'] += 1
            else:
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
                        "ArtCode": "271240051",  # Artículo genérico
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
            # Preparar Invoices - mantener InvoiceNr y Amount
            invoices_cleaned = []
            for inv in recibo_data.get("Invoices", []):
                invoices_cleaned.append({
                    "InvoiceNr": inv["InvoiceNr"],
                    "Amount": inv.get("Amount", 0)
                })

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
                "createUser": "API",
                "Status": 0,
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

        # 3. Agregar label de Oppen a cada factura
        for factura in facturas:
            factura['label_oppen'] = label_oppen

        logger.info(f"📦 Encontradas {len(facturas)} facturas A/B/Z para sincronizar")

        # 4. Crear cliente y sincronizar (pasamos conn para guardar SerNr)
        client = OppenClient()
        resultado = client.sync_facturas_batch(facturas, conn=conn)
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

                # Determinar código de cliente en Oppen
                codigo_oppen = cc.get('codigo_oppen')
                if not codigo_oppen or codigo_oppen == 'CNGCC':
                    # Es "Otro cliente" o sin código → usar Consumidor Final
                    cust_code = "C00001"  # Consumidor Final
                else:
                    cust_code = codigo_oppen

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

                # Determinar Office y VATCode según facturada
                facturada = cc.get('facturada', 0)
                if facturada == 1:
                    office = "100"
                    vat_code = "5"  # 21% IVA
                else:
                    office = "200"
                    vat_code = "3"  # Sin IVA

                # Generar OfficialSerNr
                punto_venta = cc.get('punto_venta') or 1
                nro_comanda = cc.get('nro_comanda') or cc['id']
                official_sernr = f"{int(punto_venta):04d}-{int(nro_comanda):08d}"

                # Preparar datos para la factura
                cc_invoice_data = {
                    "TransDate": str(trans_date),
                    "CustCode": cust_code,
                    "Labels": label_oppen,
                    "Name": description,
                    "Price": float(cc['monto']),
                    "Office": office,
                    "VATCode": vat_code,
                    "OfficialSerNr": official_sernr
                }

                # Crear factura en Oppen
                success, message, response_data = client.create_cuenta_corriente_invoice(cc_invoice_data)

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

                    resultados['exitosas'] += 1
                    resultados['facturas_creadas'].append({
                        'cc_id': cc['id'],
                        'sernr_oppen': sernr_oppen,
                        'official_sernr': official_sernr,
                        'monto': cc['monto']
                    })
                else:
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

        logger.info(f"📋 Creando recibo para {local} ({label_oppen}) - {fecha}")

        # 2. Obtener facturas A, B y Z con sus SerNr de Oppen y montos (excluye CC)
        cur.execute("""
            SELECT id, tipo, sernr_oppen, monto
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

        # 3. Construir lista de facturas para el recibo con montos reales
        invoices = []
        total_facturas = 0
        for f in facturas:
            monto = float(f.get('monto', 0))
            total_facturas += monto
            invoices.append({
                "InvoiceNr": int(f['sernr_oppen']),
                "Amount": monto,
            })

        logger.info(f"📦 Vinculando {len(invoices)} facturas A/B/Z al recibo (Total: ${total_facturas:,.2f})")

        # 4. Obtener PayModes directamente desde la BD
        # Consulta simplificada: obtener solo los totales por forma de pago
        try:
            cur_pm = conn.cursor(dictionary=True)
            rows = []

            # Obtener totales de tarjetas (con propinas incluidas)
            cur_pm.execute("""
                SELECT
                    tarjeta AS forma_pago,
                    CONCAT(terminal, ' / ', lote) AS descripcion,
                    SUM(monto + COALESCE(monto_tip, 0)) AS pagado
                FROM tarjetas_trns
                WHERE local = %s
                  AND DATE(fecha) = %s
                GROUP BY tarjeta, terminal, lote
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
            # Para remesas USD, usar total_conversion (monto convertido a ARS)
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
            rows_remesas = cur_pm.fetchall()
            if rows_remesas:
                rows.extend(rows_remesas)

            # Obtener Gastos (una fila por gasto)
            cur_pm.execute("""
                SELECT
                    tipo AS forma_pago,
                    COALESCE(observaciones, tipo) AS descripcion,
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

            # -------- DISCOVERY y DIFERENCIA (calculados directamente) --------
            try:
                # 1. Obtener venta_total_sistema desde ventas_trns (NO facturas_trns)
                cur_pm.execute("""
                    SELECT COALESCE(SUM(venta_total_sistema), 0) AS total
                    FROM ventas_trns
                    WHERE local = %s AND DATE(fecha) = %s
                """, (local, fecha))
                venta_total_sistema = float(cur_pm.fetchone()['total'] or 0.0)

                # 2. Obtener suma de facturas Z, A, B para DISCOVERY
                cur_pm.execute("""
                    SELECT COALESCE(SUM(monto), 0) AS total
                    FROM facturas_trns
                    WHERE local = %s AND DATE(fecha) = %s
                      AND tipo IN ('Z', 'A', 'B', 'CC')
                """, (local, fecha))
                total_facturas_zab = float(cur_pm.fetchone()['total'] or 0.0)

                # 3. Calcular DISCOVERY
                discovery_val = venta_total_sistema - total_facturas_zab

                # 2. Calcular total_cobrado
                # Remesas (usar total_conversion para USD, monto para ARS)
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

                # Tarjetas (sin tips)
                cur_pm.execute("""
                    SELECT COALESCE(SUM(monto), 0) AS total
                    FROM tarjetas_trns
                    WHERE local = %s AND DATE(fecha) = %s
                """, (local, fecha))
                tarjeta_total = float(cur_pm.fetchone()['total'] or 0.0)

                # MercadoPago (tipo='NORMAL')
                cur_pm.execute("""
                    SELECT COALESCE(SUM(importe), 0) AS total
                    FROM mercadopago_trns
                    WHERE local = %s AND DATE(fecha) = %s
                      AND UPPER(tipo) = 'NORMAL'
                """, (local, fecha))
                mp_total = float(cur_pm.fetchone()['total'] or 0.0)

                # Rappi
                cur_pm.execute("""
                    SELECT COALESCE(SUM(monto), 0) AS total
                    FROM rappi_trns
                    WHERE local = %s AND DATE(fecha) = %s
                """, (local, fecha))
                rappi_total = float(cur_pm.fetchone()['total'] or 0.0)

                # Gastos
                cur_pm.execute("""
                    SELECT COALESCE(SUM(monto), 0) AS total
                    FROM gastos_trns
                    WHERE local = %s AND DATE(fecha) = %s
                """, (local, fecha))
                gastos_total = float(cur_pm.fetchone()['total'] or 0.0)

                # PedidosYa
                cur_pm.execute("""
                    SELECT COALESCE(SUM(monto), 0) AS total
                    FROM pedidosya_trns
                    WHERE local = %s AND DATE(fecha) = %s
                """, (local, fecha))
                pedidosya_total = float(cur_pm.fetchone()['total'] or 0.0)

                # Cuenta Corriente
                cur_pm.execute("""
                    SELECT COALESCE(SUM(monto), 0) AS total
                    FROM facturas_trns
                    WHERE local = %s AND DATE(fecha) = %s
                      AND tipo = 'CC'
                """, (local, fecha))
                cta_cte_total = float(cur_pm.fetchone()['total'] or 0.0)

                # Total cobrado
                total_cobrado = sum([
                    efectivo_total,
                    tarjeta_total,
                    mp_total,
                    rappi_total,
                    gastos_total,
                    pedidosya_total,
                    cta_cte_total,
                ])

                # DIFERENCIA = total_cobrado - venta_total_sistema (invertido)
                diferencia_val = total_cobrado - venta_total_sistema

                # Agregar DISCOVERY (siempre, invertido en signo)
                rows.append({
                    "forma_pago": "DISCOVERY",
                    "descripcion": "DISCOVERY",
                    "pagado": -1 * discovery_val,  # Invertir signo
                })

                # Agregar DIFERENCIA (siempre, invertido en signo)
                rows.append({
                    "forma_pago": "DIFRECAU",
                    "descripcion": "DIFERENCIA DE CAJA",
                    "pagado": -1 * diferencia_val,  # Invertir signo
                })

            except Exception as e:
                logger.warning(f"⚠️ Error al calcular DISCOVERY/DIFERENCIA: {e}")
                import traceback
                traceback.print_exc()
                pass

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
        # Importar mapeo de formas de pago
        from modules.auditoria import FP_CODE_MAP

        # Mapeo especial para códigos que requieren transformación
        CODIGO_ESPECIAL_MAP = {
            'DECIDIR': 'MASDL',  # DECIDIR → MASDL
        }

        pay_modes = []
        for row in rows:
            forma_pago_original = row.get('forma_pago', '')
            descripcion = row.get('descripcion', '')
            pagado = row.get('pagado', 0)

            # Mapear forma de pago al código que Oppen acepta
            forma_pago_key = forma_pago_original.strip().upper()
            forma_pago_codigo = FP_CODE_MAP.get(forma_pago_key, forma_pago_key)

            # Aplicar mapeo especial si existe
            if forma_pago_codigo in CODIGO_ESPECIAL_MAP:
                logger.info(f"🔄 Mapeando '{forma_pago_codigo}' → '{CODIGO_ESPECIAL_MAP[forma_pago_codigo]}'")
                forma_pago_codigo = CODIGO_ESPECIAL_MAP[forma_pago_codigo]

            # Convertir monto a float
            try:
                amount = float(pagado) if pagado else 0.0
            except:
                amount = 0.0

            # Ya no necesitamos invertir signo aquí, porque PROPINAS y DIFRECAU
            # ya vienen con el signo correcto desde las queries SQL

            if amount != 0:  # Solo agregar si hay monto
                pay_modes.append({
                    "PayMode": forma_pago_codigo,
                    "Comment": descripcion,
                    "Amount": amount,
                })

        logger.info(f"💳 {len(pay_modes)} medios de pago encontrados")

        # 6. Crear recibo
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
            sernr = response_data.get('SerNr') if response_data else None
            return {
                'success': True,
                'message': f'Recibo creado con {len(invoices)} facturas y {len(pay_modes)} medios de pago',
                'recibo_creado': True,
                'sernr': sernr,
            }
        else:
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
