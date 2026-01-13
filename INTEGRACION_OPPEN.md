# Integración con Oppen - Sincronización Automática de Facturas

## Descripción General

Este módulo sincroniza automáticamente las facturas con el sistema Oppen cuando un auditor marca un local como "auditado".

## Flujo de Trabajo

```
┌─────────────────────────────────────────────────────────────┐
│  1. Auditor marca local como "auditado"                    │
│     (/api/marcar_auditado)                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Sistema valida:                                         │
│     ✓ Local está cerrado                                    │
│     ✓ No está ya auditado                                   │
│     ✓ No hay anticipos pendientes                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Insertar en locales_auditados                           │
│     (commit en BD)                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Sincronización con Oppen (módulo oppen_integration.py) │
│     a) Autenticar en API de Oppen                           │
│     b) Obtener todas las facturas del local/fecha           │
│     c) Transformar datos al formato Oppen                   │
│     d) Enviar cada factura mediante POST                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Retornar resultado al auditor                           │
│     ✅ "X facturas enviadas exitosamente"                   │
│     ⚠️ "Y facturas fallaron" (si hubo errores)              │
└─────────────────────────────────────────────────────────────┘
```

## Archivos Involucrados

### 1. `modules/oppen_integration.py`
Módulo principal de integración con la API de Oppen.

**Clases principales:**
- `OppenClient`: Cliente HTTP para interactuar con la API
- `OppenAPIError`: Excepción personalizada para errores de Oppen

**Funciones principales:**
- `authenticate()`: Autentica y obtiene token JWT
- `create_invoice(factura)`: Crea una factura individual
- `sync_facturas_batch(facturas)`: Sincroniza un lote de facturas
- `sync_facturas_to_oppen(conn, local, fecha)`: Función principal que orquesta todo

### 2. `app.py` (líneas 7558-7609)
Integración en el endpoint `/api/marcar_auditado`.

**Comportamiento:**
1. Marca local como auditado (commit en BD)
2. Intenta sincronizar facturas con Oppen
3. Si Oppen falla, **el local SIGUE auditado** (no se hace rollback)
4. Retorna mensaje informativo sobre el resultado de la sincronización

---

## Configuración

### Variables de Configuración (en `oppen_integration.py`)

```python
BASE_URL = "https://ngprueba.oppen.io"  # URL del ambiente de pruebas
USERNAME = "API"                         # Usuario de API
PASSWORD = "apingprueba123"              # Contraseña de API

DEFAULT_CUSTOMER = "C00001"              # Cliente: Consumidor Final
DEFAULT_OFFICE = "100"                   # Sucursal
DEFAULT_LABEL = "Local"                  # Label para facturas
PAYMENT_DAYS = 30                        # Días de plazo para vencimiento
```

### Cambiar a Producción

Para usar el ambiente de producción de Oppen, modificar en `oppen_integration.py`:

```python
BASE_URL = "https://ng.oppen.io"  # URL de producción (VERIFICAR)
```

---

## Mapeo de Datos

### De la BD Local → Oppen API

| Campo Local | Campo Oppen | Valor/Transformación |
|-------------|-------------|----------------------|
| `id` | - | No se envía |
| `local` | `Labels` | Se agrega como `"Local\|NOMBRE_LOCAL"` |
| `fecha` | `TransDate` | Formato `YYYY-MM-DD` |
| - | `DueDate` | `TransDate + 30 días` |
| `tipo` | `InvoiceType` (tentativo) | Z→0, A→1, B→2, CC→3 |
| `punto_venta` | `OfficialSerNr` (parte 1) | Formato `PPPP-NNNNNNNN` |
| `nro_factura` | `OfficialSerNr` (parte 2) | Ej: `"0005-00001691"` |
| `monto` | `Items[0].Price` | Precio con IVA incluido |
| - | `SerNr` | Generado: timestamp + random |
| - | `CustCode` | Constante: `"C00001"` |
| - | `Office` | Constante: `"100"` |
| - | `Status` | Constante: `0` (desaprobado) |
| - | `createUser` | Constante: `"API"` |
| - | `Items[0].ArtCode` | Constante: `"271240051"` (Genérico) |
| - | `Items[0].Qty` | Constante: `1` |

### Generación de `SerNr` (ID único)

Actualmente se genera usando:
```python
timestamp = int(datetime.now().timestamp())  # Segundos desde epoch
random_suffix = random.randint(100000, 999999)  # 6 dígitos aleatorios
SerNr = int(f"{timestamp}{random_suffix}")
```

⚠️ **NOTA**: En producción, considerar usar una secuencia de base de datos para garantizar unicidad absoluta.

### Generación de `OfficialSerNr`

Formato: `PPPP-NNNNNNNN`
- `PPPP`: Punto de venta con padding de ceros (4 dígitos)
- `NNNNNNNN`: Número de factura con padding de ceros (8 dígitos)

Ejemplo:
```python
punto_venta = "5"
nro_factura = "1691"
# Resultado: "0005-00001691"
```

---

## Estructura del Payload

### Ejemplo de Factura Enviada a Oppen

```json
{
  "SerNr": 1735967123456789,
  "OfficialSerNr": "0005-00001691",
  "CustCode": "C00001",
  "TransDate": "2025-01-05",
  "DueDate": "2025-02-04",
  "Office": "100",
  "Labels": "Local|MATRIZ",
  "createUser": "API",
  "Status": 0,
  "Items": [
    {
      "ArtCode": "271240051",
      "Qty": 1,
      "Price": 15000.00
    }
  ]
}
```

---

## Manejo de Errores

### 1. Error de Autenticación

**Causa**: Credenciales incorrectas o servicio no disponible.

**Comportamiento**:
- Se captura en `authenticate()`
- Se retorna error sin intentar crear facturas
- El local **permanece auditado**

**Respuesta al usuario**:
```json
{
  "success": true,
  "msg": "Local MATRIZ marcado como auditado para 2025-01-05\n⚠️ Error sincronizando con Oppen: Error de autenticación...",
  "oppen_error": "Error de autenticación: HTTP 401 - Unauthorized"
}
```

### 2. Error en Factura Individual

**Causa**: Datos inválidos, factura duplicada, etc.

**Comportamiento**:
- Se captura en `create_invoice()`
- Se registra el error y se continúa con las demás facturas
- Al final se reporta resumen

**Respuesta al usuario**:
```json
{
  "success": true,
  "msg": "Local MATRIZ marcado como auditado para 2025-01-05\n⚠️ Algunas facturas no pudieron enviarse a Oppen: 2/10\nPrimer error: Error HTTP 400: Invalid invoice number",
  "oppen_sync": {
    "total": 10,
    "exitosas": 8,
    "fallidas": 2,
    "errores": [
      {
        "factura": "A 0005-00001691",
        "error": "Error HTTP 400: Invalid invoice number"
      },
      {
        "factura": "Z 0002-00000150",
        "error": "Error HTTP 409: Duplicate invoice"
      }
    ],
    "success": false
  }
}
```

### 3. Error de Conexión

**Causa**: Timeout, red no disponible, DNS no resuelve, etc.

**Comportamiento**:
- Se captura en `create_invoice()` o `authenticate()`
- Se registra error detallado en logs
- El local **permanece auditado**

**Respuesta al usuario**:
```json
{
  "success": true,
  "msg": "Local MATRIZ marcado como auditado para 2025-01-05\n⚠️ Error sincronizando con Oppen: Error de conexión: Connection timeout",
  "oppen_error": "Error de conexión: Connection timeout"
}
```

### 4. Módulo No Disponible

**Causa**: Archivo `oppen_integration.py` no existe o error de importación.

**Comportamiento**:
- Se captura `ImportError`
- El local **permanece auditado**
- Se notifica que la sincronización no está disponible

**Respuesta al usuario**:
```json
{
  "success": true,
  "msg": "Local MATRIZ marcado como auditado para 2025-01-05 (sincronización con Oppen no disponible)"
}
```

---

## Logging

El módulo utiliza el sistema de logging de Python para registrar eventos:

```python
import logging
logger = logging.getLogger(__name__)
```

### Niveles de Log

- **INFO**: Operaciones exitosas y progreso normal
  - `✅ Autenticación exitosa en Oppen`
  - `📤 Enviando factura A 0005-00001691 ($15000.00)...`
  - `✨ Sincronización completada: 8 exitosas, 2 fallidas de 10 totales`

- **WARNING**: Situaciones anormales pero no críticas
  - `⚠️ No se encontraron facturas para MATRIZ en 2025-01-05`

- **ERROR**: Errores que impiden completar una operación
  - `❌ Error de autenticación: HTTP 401 - Unauthorized`
  - `❌ Error HTTP 400: Invalid invoice number`
  - `❌ Error obteniendo facturas de BD: MySQL connection lost`

---

## Testing

### Caso de Prueba 1: Sincronización Exitosa

**Precondiciones**:
- Local "MATRIZ" con 5 facturas (3 tipo A, 2 tipo Z)
- Todas con datos válidos
- Servicio Oppen disponible

**Pasos**:
1. Marcar local como auditado
2. Verificar respuesta

**Resultado esperado**:
```json
{
  "success": true,
  "msg": "Local MATRIZ marcado como auditado para 2025-01-05\n✅ 5 factura(s) enviada(s) a Oppen exitosamente",
  "oppen_sync": {
    "total": 5,
    "exitosas": 5,
    "fallidas": 0,
    "errores": [],
    "success": true
  }
}
```

### Caso de Prueba 2: Sin Facturas

**Precondiciones**:
- Local "SUCURSAL" sin facturas cargadas

**Pasos**:
1. Marcar local como auditado
2. Verificar respuesta

**Resultado esperado**:
```json
{
  "success": true,
  "msg": "Local SUCURSAL marcado como auditado para 2025-01-05\nℹ️ No había facturas para sincronizar con Oppen",
  "oppen_sync": {
    "total": 0,
    "exitosas": 0,
    "fallidas": 0,
    "errores": [],
    "success": true,
    "message": "No hay facturas para sincronizar"
  }
}
```

### Caso de Prueba 3: Error Parcial

**Precondiciones**:
- Local "PALERMO" con 3 facturas
- Una de ellas tiene un número de factura duplicado en Oppen

**Pasos**:
1. Marcar local como auditado
2. Verificar respuesta

**Resultado esperado**:
```json
{
  "success": true,
  "msg": "Local PALERMO marcado como auditado para 2025-01-05\n⚠️ Algunas facturas no pudieron enviarse a Oppen: 1/3\nPrimer error: Error HTTP 409: Duplicate invoice",
  "oppen_sync": {
    "total": 3,
    "exitosas": 2,
    "fallidas": 1,
    "errores": [
      {
        "factura": "A 0005-00001691",
        "error": "Error HTTP 409: Duplicate invoice"
      }
    ],
    "success": false
  }
}
```

---

## Monitoreo y Depuración

### Ver Logs en Tiempo Real

Si tu aplicación Flask loguea a un archivo (por ejemplo `logs/app.log`):

```bash
tail -f logs/app.log | grep -E "Oppen|factura|🔄|✅|❌"
```

### Verificar Facturas Enviadas

Para verificar qué facturas se intentaron enviar:

```sql
SELECT
    tipo,
    punto_venta,
    nro_factura,
    monto,
    fecha
FROM facturas_trns
WHERE local = 'MATRIZ'
  AND DATE(fecha) = '2025-01-05'
  AND estado = 'ok'
ORDER BY tipo, punto_venta, nro_factura;
```

### Debugging Manual

Para probar el módulo de forma aislada:

```python
from modules.oppen_integration import OppenClient

# Crear cliente
client = OppenClient()

# Autenticar
client.authenticate()

# Crear factura de prueba
factura_test = {
    'local': 'MATRIZ',
    'fecha': '2025-01-05 12:00:00',
    'tipo': 'A',
    'punto_venta': '0005',
    'nro_factura': '00001691',
    'monto': 15000.00
}

# Enviar
success, message, response = client.create_invoice(factura_test)
print(f"Success: {success}")
print(f"Message: {message}")
print(f"Response: {response}")
```

---

## Preguntas Frecuentes (FAQ)

### ¿Qué pasa si Oppen está caído?

El local **se marca como auditado de todas formas**. La sincronización con Oppen es un proceso secundario. Se notifica al usuario que hubo un error y se loguea para seguimiento.

### ¿Se puede reenviar facturas manualmente?

Actualmente no hay endpoint para reenviarlo manualmente, pero se puede implementar fácilmente:

```python
@app.route('/api/reenviar_facturas_oppen', methods=['POST'])
@login_required
@role_min_required(3)
def reenviar_facturas_oppen():
    data = request.get_json()
    local = data.get('local')
    fecha = data.get('fecha')

    conn = get_db_connection()
    resultado = sync_facturas_to_oppen(conn, local, fecha)
    conn.close()

    return jsonify(resultado)
```

### ¿Cómo cambiar el artículo genérico (ArtCode)?

Modificar en `oppen_integration.py`, línea ~150:

```python
"Items": [
    {
        "ArtCode": "NUEVO_CODIGO_ARTICULO",  # Cambiar aquí
        "Qty": 1,
        "Price": float(factura['monto'])
    }
]
```

### ¿Cómo mapear diferentes tipos de facturas a diferentes artículos?

Modificar el método `_build_invoice_payload`:

```python
def _get_artcode_for_tipo(self, tipo: str) -> str:
    """Mapea tipo de factura a código de artículo"""
    tipo_map = {
        "Z": "271240051",  # Artículo para reportes Z
        "A": "271240052",  # Artículo para facturas A
        "B": "271240053",  # Artículo para facturas B
        "CC": "271240054"  # Artículo para cuenta corriente
    }
    return tipo_map.get(tipo.upper(), "271240051")  # Default

# Luego en _build_invoice_payload:
"Items": [
    {
        "ArtCode": self._get_artcode_for_tipo(factura['tipo']),
        "Qty": 1,
        "Price": float(factura['monto'])
    }
]
```

### ¿Cómo sé si una factura ya fue enviada a Oppen?

Actualmente no se trackea. Se puede agregar una columna `enviado_oppen` a `facturas_trns`:

```sql
ALTER TABLE facturas_trns
ADD COLUMN enviado_oppen TINYINT(1) DEFAULT 0,
ADD COLUMN fecha_envio_oppen DATETIME NULL,
ADD COLUMN oppen_response TEXT NULL;
```

Y modificar `create_invoice` para actualizar este campo al enviar exitosamente.

---

## Mejoras Futuras

### 1. Persistencia de Estado de Sincronización

Agregar tabla `oppen_sync_log`:

```sql
CREATE TABLE oppen_sync_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  local VARCHAR(100) NOT NULL,
  fecha DATE NOT NULL,
  factura_id INT NOT NULL,
  factura_ref VARCHAR(100) NOT NULL,
  estado ENUM('pendiente', 'enviado', 'error') DEFAULT 'pendiente',
  oppen_sernr BIGINT NULL,
  error_msg TEXT NULL,
  intentos INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_local_fecha (local, fecha),
  INDEX idx_estado (estado)
);
```

### 2. Retry Automático con Backoff

Implementar reintentos exponenciales para facturas que fallan:

```python
import time

def create_invoice_with_retry(self, factura, max_retries=3):
    for intento in range(max_retries):
        success, message, response = self.create_invoice(factura)

        if success:
            return True, message, response

        if intento < max_retries - 1:
            wait_time = 2 ** intento  # Backoff exponencial: 1s, 2s, 4s
            time.sleep(wait_time)
            logger.warning(f"Reintentando ({intento + 1}/{max_retries})...")

    return False, f"Falló después de {max_retries} intentos", None
```

### 3. Webhook para Notificaciones

Implementar webhook que notifique cuando hay errores de sincronización:

```python
def send_webhook_notification(local, fecha, errores):
    webhook_url = "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

    mensaje = f"⚠️ Errores sincronizando {local} ({fecha}):\n"
    for error in errores[:5]:  # Primeros 5 errores
        mensaje += f"• {error['factura']}: {error['error']}\n"

    requests.post(webhook_url, json={"text": mensaje})
```

### 4. Dashboard de Monitoreo

Crear página en la app para ver estado de sincronizaciones:

- `/admin/oppen-sync` - Panel de control
- Mostrar: facturas pendientes, errores recientes, estadísticas
- Botón para reenviar manualmente

---

## Soporte

Para reportar bugs o solicitar features relacionados con la integración de Oppen, contactar al equipo de desarrollo.
