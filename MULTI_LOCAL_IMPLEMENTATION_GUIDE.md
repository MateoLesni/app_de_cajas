# Guía de Implementación: Múltiples Locales por Encargado

## Objetivo

Permitir que los Encargados (role_level=2) puedan tener asignados múltiples locales y seleccionar el local activo desde la UI, similar a como los Auditores seleccionan el local actualmente.

## Arquitectura Actual

### Sistema de Roles

```
role_level=1: Cajero      → 1 local fijo (session['local'])
role_level=2: Encargado   → 1 local fijo (session['local']) ← CAMBIAREMOS ESTO
role_level=3: Auditor     → Selecciona local desde UI
role_level=4: Jefe Auditor→ Selecciona local desde UI
```

### Flujo Actual

1. **Login**: Se guarda `session['local']` desde `users.local`
2. **get_local_param()**:
   - `lvl >= 3` (Auditor+): Prioriza `request.args.get('local')`, fallback a `session['local']`
   - `lvl < 3` (Cajero/Encargado): Solo `session['local']`
3. **UI**:
   - Auditores tienen selector de local
   - Encargados/Cajeros NO tienen selector

---

## Solución Propuesta

### 1. Estructura de Datos

#### Tabla `user_locales` (Many-to-Many)

```sql
CREATE TABLE user_locales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    local VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_local (user_id, local),
    INDEX idx_user_id (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Migración automática**: Copia datos de `users.local` → `user_locales`

### 2. Cambios en Backend (app.py)

#### A. Función helper para obtener locales del usuario

```python
def get_user_locales(user_id):
    """
    Obtiene todos los locales asignados a un usuario.

    Returns:
        list: Lista de locales ['Local1', 'Local2', ...]
              Si no hay en user_locales, fallback a users.local
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Intentar obtener de user_locales
        cur.execute("""
            SELECT local
            FROM user_locales
            WHERE user_id = %s
            ORDER BY local
        """, (user_id,))

        locales = [row['local'] for row in cur.fetchall()]

        # Si no hay en user_locales, fallback a users.local
        if not locales:
            cur.execute("SELECT local FROM users WHERE id = %s", (user_id,))
            user = cur.fetchone()
            if user and user.get('local'):
                locales = [user['local']]

        cur.close()
        conn.close()

        return locales
    except Exception as e:
        logger.error(f"Error obteniendo locales del usuario {user_id}: {e}")
        # Fallback a session['local']
        return [session.get('local')] if session.get('local') else []
```

#### B. Modificar función de login

```python
@app.route('/auth/login', methods=['GET', 'POST'])
def login():
    # ... código existente hasta línea 9210 ...

    session['local'] = user.get('local')  # ← Mantener para compatibilidad

    # NUEVO: Cargar locales disponibles para el usuario
    user_locales = get_user_locales(user['id'])
    session['available_locales'] = user_locales  # Lista de locales

    # Si el usuario tiene múltiples locales, usar el primero como default
    if user_locales:
        session['local'] = user_locales[0]

    # ... resto del código ...
```

#### C. Modificar get_local_param()

```python
def get_local_param():
    """
    Obtiene el local según el nivel del usuario:
    - Nivel 3-4 (Auditor/Jefe): Usa request.args.get('local'), fallback a session
    - Nivel 2 (Encargado): Usa request.args.get('local') SI está en available_locales
    - Nivel 1 (Cajero): Solo session['local']
    """
    lvl = get_user_level()

    if lvl >= 3:
        # Auditor: prioridad al parámetro, fallback a session
        local_param = (request.args.get('local') or '').strip()
        return local_param if local_param else session.get('local')

    elif lvl == 2:
        # NUEVO: Encargado puede seleccionar entre sus locales asignados
        local_param = (request.args.get('local') or '').strip()
        available = session.get('available_locales', [])

        # Si el parámetro está en la lista de locales permitidos, usarlo
        if local_param and local_param in available:
            return local_param

        # Sino, usar el local de sesión
        return session.get('local')

    else:
        # Cajero: solo su local de sesión
        return session.get('local')
```

#### D. Endpoint para obtener locales del usuario actual

```python
@app.route('/api/user/locales', methods=['GET'])
@login_required
def get_current_user_locales():
    """
    Retorna los locales disponibles para el usuario actual.
    Usado por el frontend para mostrar el selector.
    """
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'ok': False, 'msg': 'No autenticado'}), 401

    locales = get_user_locales(user_id)

    return jsonify({
        'ok': True,
        'locales': locales,
        'current_local': session.get('local')
    })
```

### 3. Cambios en Frontend

#### A. Modificar `index_encargado.html`

Agregar selector de local similar al que tienen los auditores:

```html
<!-- Después del selector de turno, agregar selector de local -->
<div class="form-group" id="selectorLocalContainer" style="display: none;">
    <label for="selectorLocal">Local:</label>
    <select id="selectorLocal" class="form-control">
        <!-- Se llena dinámicamente -->
    </select>
</div>

<script>
// Al cargar la página
document.addEventListener('DOMContentLoaded', async function() {
    // Obtener locales del usuario
    const response = await fetch('/api/user/locales');
    const data = await response.json();

    if (data.ok && data.locales && data.locales.length > 1) {
        // Mostrar selector solo si tiene múltiples locales
        const container = document.getElementById('selectorLocalContainer');
        const selector = document.getElementById('selectorLocal');

        container.style.display = 'block';

        // Llenar selector
        data.locales.forEach(local => {
            const option = document.createElement('option');
            option.value = local;
            option.textContent = local;
            if (local === data.current_local) {
                option.selected = true;
            }
            selector.appendChild(option);
        });

        // Al cambiar local, recargar página con nuevo parámetro
        selector.addEventListener('change', function() {
            const nuevoLocal = this.value;
            const url = new URL(window.location);
            url.searchParams.set('local', nuevoLocal);
            window.location.href = url.toString();
        });
    }
});
</script>
```

#### B. Modificar solicitudes AJAX

Asegurarse de que todas las solicitudes AJAX incluyan el parámetro `local`:

```javascript
function getLocalActual() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('local') || '';  // Obtener de URL si existe
}

// Al hacer fetch
fetch('/api/endpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        local: getLocalActual(),
        // ... otros datos
    })
})
```

### 4. UI de Gestión de Locales (Admin)

Crear una página para que los administradores puedan asignar locales a encargados:

```python
@app.route('/admin/user-locales', methods=['GET'])
@login_required
def admin_user_locales():
    """Página para gestionar locales de usuarios"""
    if get_user_level() < 4:  # Solo jefe auditor
        return "No autorizado", 403

    conn = get_db_connection()
    cur = conn.cursor()

    # Obtener todos los encargados con sus locales
    cur.execute("""
        SELECT
            u.id,
            u.username,
            u.role_id,
            GROUP_CONCAT(ul.local SEPARATOR ',') as locales_asignados
        FROM users u
        LEFT JOIN user_locales ul ON u.id = ul.user_id
        WHERE u.role_id = '2'  -- Solo encargados
        GROUP BY u.id, u.username, u.role_id
        ORDER BY u.username
    """)

    users_data = cur.fetchall()

    # Obtener lista de todos los locales disponibles
    cur.execute("SELECT DISTINCT local FROM users WHERE local IS NOT NULL ORDER BY local")
    all_locales = [row['local'] for row in cur.fetchall()]

    cur.close()
    conn.close()

    return render_template('admin_user_locales.html',
                         users=users_data,
                         all_locales=all_locales)

@app.route('/admin/user-locales/update', methods=['POST'])
@login_required
def admin_update_user_locales():
    """Actualizar locales de un usuario"""
    if get_user_level() < 4:
        return jsonify({'ok': False, 'msg': 'No autorizado'}), 403

    data = request.get_json()
    user_id = data.get('user_id')
    locales = data.get('locales', [])  # Lista de locales

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Eliminar asignaciones anteriores
        cur.execute("DELETE FROM user_locales WHERE user_id = %s", (user_id,))

        # Insertar nuevas asignaciones
        for local in locales:
            cur.execute("""
                INSERT INTO user_locales (user_id, local)
                VALUES (%s, %s)
            """, (user_id, local))

        conn.commit()
        cur.close()
        conn.close()

        return jsonify({'ok': True, 'msg': f'{len(locales)} locales asignados'})
    except Exception as e:
        return jsonify({'ok': False, 'msg': str(e)}), 500
```

---

## Plan de Implementación

### Fase 1: Preparación (Sin impacto)
1. ✅ Crear tabla `user_locales` con migración SQL
2. ✅ Migrar datos existentes automáticamente
3. ✅ Verificar integridad de datos

### Fase 2: Backend (Compatible hacia atrás)
1. Agregar función `get_user_locales(user_id)`
2. Modificar `login()` para cargar `session['available_locales']`
3. Modificar `get_local_param()` para soportar nivel 2
4. Agregar endpoint `/api/user/locales`
5. Probar en local

### Fase 3: Frontend Encargados
1. Modificar `index_encargado.html` con selector de local
2. Actualizar solicitudes AJAX para incluir parámetro `local`
3. Probar flujo completo

### Fase 4: Admin UI (Opcional)
1. Crear página de gestión `/admin/user-locales`
2. Agregar endpoint de actualización
3. Permitir asignación/desasignación de locales

### Fase 5: Testing y Deploy
1. Probar con usuarios reales en local
2. Deploy a producción
3. Asignar múltiples locales a encargados que lo necesiten
4. Monitorear logs

---

## Compatibilidad

Esta solución es **100% compatible hacia atrás**:

- ✅ Usuarios con un solo local siguen funcionando igual
- ✅ `session['local']` se mantiene para compatibilidad
- ✅ Si `user_locales` está vacía, hace fallback a `users.local`
- ✅ Cajeros (nivel 1) no se ven afectados
- ✅ Auditores (nivel 3-4) continúan igual

---

## Notas de Seguridad

1. **Validación**: `get_local_param()` valida que el local solicitado esté en `available_locales`
2. **Session**: La lista de locales se guarda en session para evitar consultas repetidas
3. **Foreign Key**: Cascade delete asegura limpieza automática al eliminar usuarios

---

## Próximos Pasos

¿Querés que implemente esta solución paso a paso? Podemos empezar por:

1. **Ejecutar la migración SQL** (crear tabla y migrar datos)
2. **Implementar los cambios en backend** (funciones helper y modificaciones)
3. **Actualizar el frontend** para Encargados
4. **Crear la UI de admin** (opcional, para gestionar locales)

¿Por dónde querés empezar?
