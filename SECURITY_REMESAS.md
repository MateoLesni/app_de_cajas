# 🔒 Seguridad en Endpoints de Remesas

## Resumen Ejecutivo

Este documento describe las **capas de seguridad** implementadas en los endpoints de remesas para prevenir ataques de manipulación de datos.

---

## ⚠️ Escenario de Ataque Bloqueado

### Intento de ataque:
Un usuario malicioso podría intentar:

1. **Interceptar requests** con DevTools del navegador
2. **Modificar el `remesa_id`** en la URL del fetch
3. **Cambiar fechas y datos** en el JSON body
4. **Reenviar el request** para manipular remesas de otros locales o ya procesadas

### Resultado actual: **❌ BLOQUEADO**

---

## 🛡️ Capas de Seguridad Implementadas

### 1. **Autenticación y Autorización**

#### `@login_required`
- **Qué hace**: Verifica que el usuario esté autenticado
- **Ubicación**: Todos los endpoints de remesas
- **Bloquea**: Usuarios no autenticados

#### `@role_min_required(nivel)`
- **Qué hace**: Verifica nivel de rol del usuario
- **Niveles**:
  - `2` - Encargados de local
  - `3` - Auditores
  - `6` - Admin Anticipos
  - `8` - Admin Tesorería
- **Bloquea**: Usuarios con nivel insuficiente

---

### 2. **Validación de Estado de Remesa**

#### Endpoint: `/api/remesas-no-retiradas/<id>/marcar-retirada`

**Validación 1: Estado ya retirado**
```python
# Línea 9789-9794
if retirada_val.lower() in ('1', 'si', 'sí', 'true'):
    return jsonify(msg="Esta remesa ya está marcada como retirada"), 400
```
- **Previene**: Duplicar el marcado de retirada
- **HTTP Code**: `400 Bad Request`

**Validación 2: Estado contable** ⭐ **NUEVA**
```python
# Línea 9796-9801
estado_actual = str(remesa.get('estado_contable', '')).upper()
if estado_actual not in ('', 'LOCAL', 'NONE'):
    return jsonify(msg=f"No se puede marcar en estado {estado_actual}"), 400
```
- **Previene**: Modificar remesas en estado `TRAN` o `CONTABILIZADA`
- **HTTP Code**: `400 Bad Request`

**Validación 3: Permisos por local**
```python
# Línea 9803-9810
if user_level < 3:  # Encargado
    if remesa['local'] != user_local:
        return jsonify(msg="No tenés permisos para otro local"), 403
```
- **Previene**: Encargados modificando remesas de otros locales
- **HTTP Code**: `403 Forbidden`

---

#### Endpoint: `/api/remesas-no-retiradas/<id>/editar`

**Solo auditores** (`@role_min_required(3)`)

**Validación: Remesas contabilizadas** ⭐ **NUEVA**
```python
# Línea 9899-9904
if estado_actual == 'CONTABILIZADA':
    return jsonify(msg="No se puede editar una remesa contabilizada"), 403
```
- **Previene**: Modificar remesas finalizadas (ni siquiera auditores)
- **HTTP Code**: `403 Forbidden`

---

### 3. **Protección CSRF**

Implementado en: `modules/tesoreria_security.py`

```python
@csrf_protected
def marcar_remesa_retirada(remesa_id):
    ...
```

**Validación de token**:
- Token generado por sesión: `secrets.token_hex(32)`
- Comparación segura: `hmac.compare_digest()`
- Headers verificados: `X-CSRF-Token`

**Previene**:
- Cross-Site Request Forgery (CSRF)
- Requests desde dominios externos
- Ataques de replay sin token válido

---

### 4. **Rate Limiting**

Implementado en: `modules/tesoreria_security.py`

```python
@rate_limited(max_requests=30, window_seconds=60)
def marcar_remesa_retirada(remesa_id):
    ...
```

**Límites**:
- **30 requests por minuto** por usuario y endpoint
- Algoritmo: Token Bucket
- Respuesta: `429 Too Many Requests`

**Previene**:
- Ataques de fuerza bruta
- Abuso de endpoints
- Scripts automatizados maliciosos

---

### 5. **Audit Logging**

Todas las modificaciones quedan registradas:

```python
registrar_auditoria(
    conn=conn,
    accion='UPDATE',
    tabla='remesas_trns',
    registro_id=remesa_id,
    datos_anteriores=datos_anteriores,
    datos_nuevos=datos_nuevos,
    descripcion=f"Remesa marcada como retirada - Local: {local}"
)
```

**Información registrada**:
- ✅ Usuario que hizo el cambio
- ✅ Timestamp exacto
- ✅ IP del request
- ✅ Datos anteriores y nuevos
- ✅ Descripción del cambio

**Tabla**: `tesoreria_audit_log`

---

## 🔍 Flujo de Validación Completo

### Ejemplo: Marcar remesa como retirada

```
┌─────────────────────────────────────────┐
│ 1. Request POST /marcar-retirada/123    │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 2. @login_required                      │
│    ✓ Usuario autenticado?               │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 3. @role_min_required(2)                │
│    ✓ Nivel >= 2?                        │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 4. @csrf_protected                      │
│    ✓ Token CSRF válido?                 │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 5. @rate_limited                        │
│    ✓ No excede 30 req/min?              │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 6. Query DB: SELECT remesa              │
│    ✓ Remesa existe?                     │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 7. Validación: Ya retirada?             │
│    ✓ retirada != 1?                     │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 8. Validación: Estado contable          │
│    ✓ estado = 'Local'?                  │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 9. Validación: Permisos local           │
│    ✓ Si nivel < 3, local == user.local? │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 10. UPDATE remesas_trns                 │
│     SET retirada=1, estado='TRAN'       │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 11. INSERT tesoreria_audit_log          │
│     Registrar cambio completo           │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 12. Response 200 OK                     │
└─────────────────────────────────────────┘
```

**Si falla CUALQUIER validación → Request rechazado**

---

## 🎯 Vectores de Ataque Bloqueados

| Vector de Ataque | Protección | Código HTTP |
|------------------|------------|-------------|
| Usuario no autenticado | `@login_required` | `401 Unauthorized` |
| Rol insuficiente | `@role_min_required` | `403 Forbidden` |
| Sin token CSRF | `@csrf_protected` | `403 Forbidden` |
| Demasiados requests | `@rate_limited` | `429 Too Many Requests` |
| Remesa ya retirada | Validación estado | `400 Bad Request` |
| Remesa en TRAN/Contabilizada | Validación estado | `400 Bad Request` |
| Local diferente (encargado) | Validación permisos | `403 Forbidden` |
| Editar contabilizada (auditor) | Validación estado | `403 Forbidden` |

---

## 📊 Matriz de Permisos

| Acción | Encargado (Nivel 2) | Auditor (Nivel 3+) |
|--------|---------------------|-------------------|
| Ver remesas no retiradas | ✅ Solo su local | ✅ Todos los locales |
| Marcar como retirada | ✅ Solo su local, solo estado Local | ✅ Todos los locales, solo estado Local |
| Editar fecha/nombre retiro | ❌ No permitido | ✅ Todos los locales, excepto Contabilizada |
| Ver remesas retiradas | ✅ Solo su local | ✅ Todos los locales + filtros |
| Modificar contabilizada | ❌ No permitido | ❌ No permitido |

---

## 🔧 Recomendaciones de Seguridad Adicionales

### Para implementar en el futuro:

1. **HTTPS Obligatorio en Producción**
   - Prevenir man-in-the-middle attacks
   - Proteger tokens CSRF en tránsito

2. **IP Whitelisting (Opcional)**
   - Limitar acceso a IPs conocidas
   - Especialmente para roles de auditor

3. **Session Timeout**
   - Ya implementado: 3 días (`PERMANENT_SESSION_LIFETIME`)
   - Considerar reducir para roles sensibles

4. **Monitoring y Alertas**
   - Alertar si se detectan múltiples intentos fallidos
   - Dashboard de audit logs para admin

5. **Backup Regular de Audit Logs**
   - Los logs son críticos para forensics
   - Exportar periódicamente a storage seguro

---

## 📝 Código de Respuesta a Incidentes

Si detectás actividad sospechosa:

### 1. Revisar audit logs
```sql
SELECT * FROM tesoreria_audit_log
WHERE changed_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
ORDER BY changed_at DESC;
```

### 2. Revisar por usuario específico
```sql
SELECT * FROM tesoreria_audit_log
WHERE changed_by_username = 'usuario_sospechoso'
ORDER BY changed_at DESC
LIMIT 100;
```

### 3. Revisar cambios en remesa específica
```sql
SELECT * FROM tesoreria_audit_log
WHERE remesa_id = 123
ORDER BY changed_at DESC;
```

### 4. Revertir cambio (solo admin DB)
```sql
-- CUIDADO: Solo usar con supervisión
UPDATE remesas_trns
SET
    retirada = [valor_anterior],
    fecha_retirada = [valor_anterior],
    retirada_por = [valor_anterior],
    estado_contable = [valor_anterior]
WHERE id = [remesa_id];
```

---

## ✅ Checklist de Seguridad

- [x] Autenticación requerida
- [x] Autorización por roles
- [x] Protección CSRF
- [x] Rate limiting
- [x] Validación de estado de remesa
- [x] Validación de permisos por local
- [x] Audit logging completo
- [x] Validación de inputs
- [x] Mensajes de error informativos pero seguros
- [x] No expone estructura de BD en errores
- [ ] HTTPS en producción (pendiente deploy)
- [ ] Monitoring de audit logs (futuro)

---

## 📞 Contacto

Para reportar vulnerabilidades de seguridad:
- **No crear issues públicos en GitHub**
- Contactar directamente al equipo de desarrollo

---

**Última actualización**: 2026-01-14
**Commit**: `996e48c` - "Reforzar validaciones de seguridad en endpoints de remesas"
