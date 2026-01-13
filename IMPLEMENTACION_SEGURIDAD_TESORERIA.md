# Implementación de Seguridad en Tesorería

## Resumen

Este documento describe la implementación de múltiples capas de seguridad para proteger el módulo de tesorería contra:

1. **CSRF (Cross-Site Request Forgery)**: Tokens únicos por sesión
2. **Rate Limiting**: Límite de requests por usuario/endpoint
3. **Scope Validation**: Verificación de permisos por local
4. **Audit Logging**: Registro completo de todos los cambios

## Scripts SQL a Ejecutar

### 1. Agregar estado_contable a remesas_trns

```bash
mysql -u app_cajas -p gestion_cajas < SQL_ADD_ESTADO_CONTABLE_REMESAS.sql
```

Este script:
- Agrega columna `estado_contable` con valores: 'Local', 'TRAN', 'Contabilizada'
- Agrega columnas `fecha_estado_local`, `fecha_estado_tran`, `fecha_estado_contabilizada`
- Migra datos existentes basándose en el campo `retirada` y `tesoreria_recibido`

### 2. Crear tabla de auditoría

```bash
mysql -u app_cajas -p gestion_cajas < SQL_CREATE_TESORERIA_AUDIT_LOG.sql
```

Este script:
- Crea tabla `tesoreria_audit_log` para registrar TODOS los cambios
- Incluye: usuario, IP, timestamp, valores anteriores/nuevos

## Cambios en app.py

### 1. Agregar imports (después de línea 33)

```python
# Importar módulo de seguridad de tesorería
from modules.tesoreria_security import (
    init_security,
    csrf_protected,
    rate_limited,
    scope_validated,
    tesoreria_secured,
    CSRFProtection,
    AuditLogger
)
```

### 2. Inicializar seguridad (después de crear app, línea ~45)

```python
app = Flask(__name__)

# ... (configuración existente)

# Inicializar sistema de seguridad de tesorería
init_security(app)
```

### 3. Modificar endpoint `/api/tesoreria/guardar-remesa`

**REEMPLAZAR** (líneas 6313-6388) con:

```python
@app.route('/api/tesoreria/guardar-remesa', methods=['POST'])
@login_required
@role_min_required(7)
@tesoreria_secured(max_requests=30, window_seconds=60, validate_scope=True)
def api_tesoreria_guardar_remesa():
    """
    Guarda el monto real de UNA remesa específica.
    Actualiza o crea registro en tesoreria_recibido.
    Solo permite guardar si la fecha NO está aprobada.

    SEGURIDAD:
    - CSRF protection ✅
    - Rate limiting: 30 requests/min ✅
    - Scope validation ✅
    - Audit logging ✅
    """
    data = request.get_json() or {}
    remesa_id = data.get('remesa_id')
    local = data.get('local', '').strip()
    fecha_retiro = data.get('fecha_retiro', '').strip()
    precinto = data.get('precinto', '').strip()
    nro_remesa = data.get('nro_remesa', '').strip()
    monto_real = data.get('monto_real', 0)
    monto_teorico = data.get('monto_teorico', 0)

    if not (local and fecha_retiro and remesa_id):
        return jsonify(success=False, msg='Faltan datos requeridos (local, fecha_retiro, remesa_id)'), 400

    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)

        username = session.get('username', 'SYSTEM')
        user_id = session.get('user_id')

        # Verificar si la fecha está aprobada
        cur.execute("""
            SELECT estado FROM tesoreria_aprobaciones
            WHERE fecha_retiro = %s
        """, (fecha_retiro,))
        aprobacion = cur.fetchone()

        if aprobacion and aprobacion['estado'] == 'aprobado':
            cur.close()
            conn.close()
            return jsonify(success=False, msg='No se puede editar. La conciliación de esta fecha ya fue aprobada.'), 403

        # Obtener monto_real anterior para audit log
        cur.execute("""
            SELECT monto_real FROM tesoreria_recibido WHERE remesa_id = %s
        """, (remesa_id,))
        old_record = cur.fetchone()
        old_monto = float(old_record['monto_real']) if old_record else 0

        # Determinar estado según diferencia
        dif = float(monto_teorico) - float(monto_real)
        if monto_real == 0:
            estado = 'en_transito'
        elif abs(dif) < 0.01:  # Tolerancia de 1 centavo
            estado = 'recibido'
        else:
            estado = 'con_diferencia'

        # Insertar o actualizar remesa individual usando remesa_id
        cur.execute("""
            INSERT INTO tesoreria_recibido
                (remesa_id, local, fecha_retiro, precinto, nro_remesa, monto_teorico, monto_real, estado, registrado_por, registrado_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON DUPLICATE KEY UPDATE
                monto_real = VALUES(monto_real),
                monto_teorico = VALUES(monto_teorico),
                estado = VALUES(estado),
                registrado_por = VALUES(registrado_por),
                registrado_at = NOW()
        """, (remesa_id, local, fecha_retiro, precinto, nro_remesa, monto_teorico, monto_real, estado, username))

        # NUEVO: Actualizar estado_contable en remesas_trns si se contabilizó
        if float(monto_real) > 0:
            cur.execute("""
                UPDATE remesas_trns
                SET estado_contable = 'Contabilizada',
                    fecha_estado_contabilizada = NOW()
                WHERE id = %s
                  AND estado_contable != 'Contabilizada'
            """, (remesa_id,))

        conn.commit()

        # NUEVO: Registrar en audit log si cambió el monto
        if float(monto_real) != old_monto:
            AuditLogger.log_remesa_change(
                conn, remesa_id, 'monto_real', old_monto, float(monto_real), user_id
            )

        cur.close()
        conn.close()

        return jsonify(success=True, msg='Guardado correctamente', estado=estado)

    except Exception as e:
        print(f"❌ ERROR guardar-remesa: {e}")
        import traceback
        traceback.print_exc()
        try:
            conn.rollback()
        except:
            pass
        return jsonify(success=False, msg=str(e)), 500
```

### 4. Modificar endpoint `/api/tesoreria/aprobar-conciliacion`

**REEMPLAZAR** (líneas 6391-6445) con:

```python
@app.route('/api/tesoreria/aprobar-conciliacion', methods=['POST'])
@login_required
@role_min_required(8)
@tesoreria_secured(max_requests=10, window_seconds=60, validate_scope=False)
def api_aprobar_conciliacion():
    """
    Aprueba la conciliación de una fecha específica.
    Solo admin de tesorería puede aprobar.

    SEGURIDAD:
    - CSRF protection ✅
    - Rate limiting: 10 requests/min ✅
    """
    data = request.get_json() or {}
    fecha_retiro = data.get('fecha_retiro', '').strip()
    observaciones = data.get('observaciones', '').strip()

    if not fecha_retiro:
        return jsonify(success=False, msg='Falta fecha_retiro'), 400

    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        username = session.get('username', 'SYSTEM')

        # Insertar o actualizar aprobación
        cur.execute("""
            INSERT INTO tesoreria_aprobaciones
                (fecha_retiro, estado, aprobado_por, aprobado_at, observaciones)
            VALUES (%s, 'aprobado', %s, NOW(), %s)
            ON DUPLICATE KEY UPDATE
                estado = 'aprobado',
                aprobado_por = VALUES(aprobado_por),
                aprobado_at = NOW(),
                observaciones = VALUES(observaciones)
        """, (fecha_retiro, username, observaciones))

        # Registrar en auditoría
        cur.execute("""
            INSERT INTO tesoreria_aprobaciones_audit
                (fecha_retiro, accion, usuario, observaciones)
            VALUES (%s, 'aprobar', %s, %s)
        """, (fecha_retiro, username, observaciones))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify(success=True, msg='Conciliación aprobada correctamente')

    except Exception as e:
        print(f"❌ ERROR aprobar-conciliacion: {e}")
        import traceback
        traceback.print_exc()
        try:
            conn.rollback()
        except:
            pass
        return jsonify(success=False, msg=str(e)), 500
```

### 5. Modificar endpoint `/api/tesoreria/desaprobar-conciliacion`

**REEMPLAZAR** (líneas 6448-6502) con:

```python
@app.route('/api/tesoreria/desaprobar-conciliacion', methods=['POST'])
@login_required
@role_min_required(8)
@tesoreria_secured(max_requests=10, window_seconds=60, validate_scope=False)
def api_desaprobar_conciliacion():
    """
    Desaprueba la conciliación de una fecha específica.

    SEGURIDAD:
    - CSRF protection ✅
    - Rate limiting: 10 requests/min ✅
    """
    data = request.get_json() or {}
    fecha_retiro = data.get('fecha_retiro', '').strip()
    observaciones = data.get('observaciones', '').strip()

    if not fecha_retiro:
        return jsonify(success=False, msg='Falta fecha_retiro'), 400

    if not observaciones:
        return jsonify(success=False, msg='Debes proporcionar un motivo para desaprobar'), 400

    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        username = session.get('username', 'SYSTEM')

        # Actualizar aprobación a desaprobado
        cur.execute("""
            INSERT INTO tesoreria_aprobaciones
                (fecha_retiro, estado, desaprobado_por, desaprobado_at, observaciones)
            VALUES (%s, 'desaprobado', %s, NOW(), %s)
            ON DUPLICATE KEY UPDATE
                estado = 'desaprobado',
                desaprobado_por = VALUES(desaprobado_por),
                desaprobado_at = NOW(),
                observaciones = VALUES(observaciones)
        """, (fecha_retiro, username, observaciones))

        # Registrar en auditoría
        cur.execute("""
            INSERT INTO tesoreria_aprobaciones_audit
                (fecha_retiro, accion, usuario, observaciones)
            VALUES (%s, 'desaprobar', %s, %s)
        """, (fecha_retiro, username, observaciones))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify(success=True, msg='Conciliación desaprobada. Los tesoreros pueden volver a editar.')

    except Exception as e:
        print(f"❌ ERROR desaprobar-conciliacion: {e}")
        import traceback
        traceback.print_exc()
        try:
            conn.rollback()
        except:
            pass
        return jsonify(success=False, msg=str(e)), 500
```

### 6. Modificar endpoint `/api/tesoreria/remesas-detalle`

**AGREGAR** decorador `@rate_limited` (línea 6234):

```python
@app.route('/api/tesoreria/remesas-detalle', methods=['GET'])
@login_required
@role_min_required(7)
@rate_limited(max_requests=60, window_seconds=60)  # ← AGREGAR ESTA LÍNEA
def api_tesoreria_remesas_detalle():
    """
    Obtiene TODAS las remesas retiradas en una fecha específica.

    SEGURIDAD:
    - Rate limiting: 60 requests/min ✅
    """
    # ... (resto del código sin cambios)
```

## Cambios en Templates HTML

### Modificar `templates/reporte_remesas.html`

**AGREGAR** en el `<head>` (después de línea 10):

```html
<meta name="csrf-token" content="{{ csrf_token() }}">
```

**MODIFICAR** el JavaScript de fetch para incluir CSRF token:

Buscar todas las llamadas `fetch('/api/tesoreria/...)` y agregar el header:

```javascript
// ANTES:
fetch('/api/tesoreria/guardar-remesa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
})

// DESPUÉS:
fetch('/api/tesoreria/guardar-remesa', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content
    },
    body: JSON.stringify(data)
})
```

Aplicar este cambio en:
- `guardarRemesa()` function
- `guardarTodos()` function
- `aprobarFecha()` function
- `desaprobarFecha()` function

## Explicación de las Capas de Seguridad

### 1. CSRF Protection

**Problema que resuelve**: Evita que sitios maliciosos ejecuten acciones en nombre del usuario autenticado.

**Cómo funciona**:
1. Al cargar la página, se genera un token único
2. El token se incluye en el HTML como meta tag
3. Cada request POST/PUT/DELETE debe incluir este token
4. El servidor valida que el token sea correcto

**Ejemplo de ataque bloqueado**:
```html
<!-- Sitio malicioso: sitio-malo.com -->
<form action="https://tu-app.com/api/tesoreria/guardar-remesa" method="POST">
  <input name="monto_real" value="0">
  <script>document.forms[0].submit()</script>
</form>
```
❌ Este ataque falla porque no tiene el token CSRF válido.

### 2. Rate Limiting

**Problema que resuelve**: Evita que un atacante abuse de los endpoints haciendo miles de requests.

**Cómo funciona**:
- Cada usuario tiene un límite de requests por endpoint
- Ejemplo: 30 requests/minuto para `/guardar-remesa`
- Si se excede, se bloquea temporalmente

**Ejemplo de ataque bloqueado**:
```python
# Script malicioso intentando modificar 1000 remesas
for i in range(1000):
    requests.post('/api/tesoreria/guardar-remesa', json={...})
```
❌ Después de 30 requests, se bloquea por 60 segundos.

### 3. Scope Validation

**Problema que resuelve**: Evita que un tesorero acceda a remesas de otros locales.

**Cómo funciona**:
- Antes de procesar el request, verifica que el usuario tenga acceso al local
- Admin tesorería (level 8): acceso a TODO
- Tesorero (level 7): solo a su local asignado

**Ejemplo de ataque bloqueado**:
```javascript
// Tesorero de "Fabric" intenta editar remesa de "Ribs"
fetch('/api/tesoreria/guardar-remesa', {
    body: JSON.stringify({ local: 'Ribs', ... })
})
```
❌ Bloqueado con error 403: "No tienes permisos para acceder a este local"

### 4. Audit Logging

**Problema que resuelve**: Permite rastrear QUIÉN hizo QUÉ y CUÁNDO.

**Qué se registra**:
- Usuario (ID + username)
- IP address
- Campo modificado
- Valor anterior → valor nuevo
- Timestamp exacto

**Ejemplo de uso**:
```sql
-- Ver todos los cambios de hoy
SELECT * FROM tesoreria_audit_log
WHERE DATE(changed_at) = CURDATE()
ORDER BY changed_at DESC;

-- Ver quién modificó la remesa 12345
SELECT * FROM tesoreria_audit_log
WHERE remesa_id = 12345
ORDER BY changed_at ASC;
```

## Configuración de Límites de Rate Limiting

Límites actuales implementados:

| Endpoint | Límite | Ventana | Razón |
|----------|--------|---------|-------|
| `/guardar-remesa` | 30 req | 60 seg | Permite guardar ~30 remesas/min (suficiente para operación normal) |
| `/aprobar-conciliacion` | 10 req | 60 seg | Operación crítica, bajo volumen esperado |
| `/desaprobar-conciliacion` | 10 req | 60 seg | Operación crítica, bajo volumen esperado |
| `/remesas-detalle` | 60 req | 60 seg | Consulta, puede necesitar varios reloads |

## Testing de Seguridad

### Test 1: CSRF Protection

```bash
# Intento sin token (debe fallar)
curl -X POST http://localhost:5000/api/tesoreria/guardar-remesa \
  -H "Content-Type: application/json" \
  -d '{"local":"Fabric","monto_real":1000}' \
  --cookie "session=..."

# Respuesta esperada: 403 Forbidden
# {"success": false, "msg": "Token de seguridad inválido", "error_code": "CSRF_INVALID"}
```

### Test 2: Rate Limiting

```bash
# Hacer 35 requests seguidos (debe fallar después del 30)
for i in {1..35}; do
  curl -X POST http://localhost:5000/api/tesoreria/guardar-remesa \
    -H "X-CSRF-Token: ..." \
    ...
done

# Respuesta esperada después del request 31:
# {"success": false, "msg": "Demasiadas solicitudes. Espera X segundos", "error_code": "RATE_LIMIT_EXCEEDED"}
```

### Test 3: Scope Validation

```bash
# Login como tesorero de "Fabric"
# Intentar editar remesa de "Ribs" (debe fallar)
curl -X POST http://localhost:5000/api/tesoreria/guardar-remesa \
  -d '{"local":"Ribs",...}'

# Respuesta esperada: 403 Forbidden
# {"success": false, "msg": "No tienes permisos para acceder a este local"}
```

## Mantenimiento

### Limpiar logs de auditoría antiguos (opcional)

```sql
-- Eliminar logs de más de 2 años
DELETE FROM tesoreria_audit_log
WHERE changed_at < DATE_SUB(NOW(), INTERVAL 2 YEAR);
```

### Backup de auditoría

```bash
# Exportar todos los logs
mysqldump -u app_cajas -p gestion_cajas tesoreria_audit_log > audit_backup_$(date +%Y%m%d).sql
```

## Troubleshooting

### Error: "Token de seguridad inválido"

**Causa**: El token CSRF no se está enviando correctamente.

**Solución**:
1. Verificar que el meta tag existe: `<meta name="csrf-token" content="...">`
2. Verificar que el JavaScript incluye el header `X-CSRF-Token`
3. Recargar la página para generar un nuevo token

### Error: "Demasiadas solicitudes"

**Causa**: Se excedió el límite de rate limiting.

**Solución**:
1. Esperar el tiempo indicado (típicamente 60 segundos)
2. Si es operación legítima, contactar admin para revisar límites

### Error: "No tienes permisos para acceder a este local"

**Causa**: Usuario intentando acceder a local fuera de su scope.

**Solución**:
1. Verificar que el usuario tiene el local correcto asignado en BD
2. Si es admin_tesoreria, verificar que role_level >= 8

---

**Última actualización**: 2026-01-06
**Versión**: 1.0
