# Sistema de Roles y Permisos en Tesorería

## Roles Disponibles

### 1. **Tesorería** (role_level 7)
- **Nombre en BD**: `tesoreria`
- **Acceso**: `/tesoreria/home`
- **Permisos**:
  - ✅ Ver remesas retiradas en su local
  - ✅ Cargar montos reales de bolsas (efectivo contado)
  - ✅ Ver diferencias entre teórico y real
  - ❌ NO puede aprobar/desaprobar conciliaciones
  - ❌ NO puede ver resumen por local (vista consolidada)

### 2. **Admin Tesorería** (role_level 8)
- **Nombre en BD**: `admin_tesoreria`
- **Acceso**: `/tesoreria/home`
- **Permisos**:
  - ✅ Todo lo que puede hacer Tesorería
  - ✅ **Aprobar conciliaciones** de cualquier fecha
  - ✅ **Desaprobar conciliaciones** (con motivo en auditoría)
  - ✅ Ver resumen consolidado por local en `/reporteria/remesas-tesoreria`
  - ✅ Gestionar usuarios de tesorería
  - ✅ Ver panel de aprobación en `/reporteria/remesas`

---

## Endpoints y Permisos

### Páginas de Tesorería
```python
# Disponible para tesoreria (level 7) y admin_tesoreria (level 8)
@role_min_required(7)
- /tesoreria/home
- /reporteria/remesas
- /reporteria/remesas-tesoreria
```

### Endpoints de Carga de Montos
```python
# Disponible para tesoreria (level 7) y admin_tesoreria (level 8)
@role_min_required(7)
- /api/tesoreria/remesas-detalle
- /api/tesoreria/guardar-remesa
- /api/tesoreria/obtener-real
- /api/tesoreria/estado-aprobacion (consultar estado)
```

### Endpoints de Aprobación
```python
# Solo admin_tesoreria (level 8)
@role_min_required(8)
- /api/tesoreria/aprobar-conciliacion
- /api/tesoreria/desaprobar-conciliacion
```

### Endpoints de Resumen
```python
# Disponible para auditores (level 3+)
@role_min_required(3)
- /api/reportes/remesas-matriz
```

---

## Cómo Funciona el Sistema de Aprobación

### 1. **Estado Pendiente** (por defecto)
- Los tesoreros pueden cargar y modificar montos reales
- No hay restricciones de edición

### 2. **Estado Aprobado**
- Un admin_tesoreria aprueba la conciliación de una fecha específica
- **Efecto**: Los tesoreros ya NO pueden modificar montos reales de esa fecha
- Se registra: fecha, usuario que aprobó, timestamp
- Se guarda en auditoría

### 3. **Estado Desaprobado**
- Un admin_tesoreria desaprueba una conciliación previamente aprobada
- **Efecto**: Los tesoreros vuelven a poder editar montos reales
- Debe ingresar un motivo (obligatorio)
- Se registra en auditoría: fecha, usuario, motivo, timestamp

---

## Tablas de Base de Datos

### `roles` - Define niveles de acceso
```sql
id | name             | level | description
---|------------------|-------|----------------------------------
7  | tesoreria        | 7     | Tesoreros que cargan montos reales
9  | admin_tesoreria  | 8     | Admin que aprueba conciliaciones
```

### `users` - Usuarios del sistema
```sql
Columnas clave:
- id: INT (PK)
- username: VARCHAR
- role_id: INT (FK a roles.id)
- local: VARCHAR (local asignado, ej: "TESORERIA", "MATRIZ")
```

### `tesoreria_aprobaciones` - Estado de aprobación por fecha
```sql
CREATE TABLE tesoreria_aprobaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha_retiro DATE NOT NULL UNIQUE,
  estado ENUM('aprobado', 'desaprobado', 'pendiente') DEFAULT 'pendiente',
  aprobado_por VARCHAR(100),
  aprobado_at DATETIME,
  desaprobado_por VARCHAR(100),
  desaprobado_at DATETIME,
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### `tesoreria_aprobaciones_audit` - Registro histórico
```sql
CREATE TABLE tesoreria_aprobaciones_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha_retiro DATE NOT NULL,
  accion ENUM('aprobar', 'desaprobar') NOT NULL,
  usuario VARCHAR(100) NOT NULL,
  observaciones TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fecha (fecha_retiro),
  INDEX idx_usuario (usuario)
);
```

---

## Variables de Sesión

Cuando un usuario inicia sesión, se almacenan en `session`:

```python
session['user_id']      # ID del usuario
session['username']     # Nombre de usuario
session['role']         # Nombre del rol (ej: "admin_tesoreria")
session['role_id']      # ID del rol en la tabla roles (ej: 9)
session['role_level']   # Nivel numérico del rol (ej: 8) ← USADO EN PERMISOS
session['local']        # Local asignado (ej: "TESORERIA")
```

**IMPORTANTE**: Los decoradores `@role_min_required(N)` verifican `session['role_level']`, NO `session['role_id']`.

---

## Decoradores de Permisos

### `@login_required`
```python
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated
```

### `@role_min_required(min_level: int)`
```python
def role_min_required(min_level: int):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            lvl = int(session.get('role_level') or 0)
            if lvl < min_level:
                return jsonify(success=False, msg='Rol insuficiente'), 403
            return view(*args, **kwargs)
        return wrapped
    return decorator
```

**Uso**:
```python
@app.route('/api/tesoreria/aprobar-conciliacion', methods=['POST'])
@login_required
@role_min_required(8)  # Solo admin_tesoreria (level 8)
def api_aprobar_conciliacion():
    # código...
```

---

## Verificación en Templates (Jinja2)

En los archivos HTML, verificá permisos usando `session.get('role_level')`:

```html
<!-- Mostrar solo para admin_tesoreria (level 8+) -->
{% if session.get('role_level') and session.get('role_level') >= 8 %}
  <div id="panelAprobacion">
    <button onclick="aprobarFecha()">Aprobar Conciliación</button>
    <button onclick="desaprobarFecha()">Desaprobar</button>
  </div>
{% endif %}
```

---

## Flujo de Aprobación

### Diagrama de Estados
```
┌─────────────┐
│  PENDIENTE  │ ← Estado inicial
└──────┬──────┘
       │
       │ Admin aprueba
       ▼
┌─────────────┐
│  APROBADO   │ ← Tesoreros NO pueden editar
└──────┬──────┘
       │
       │ Admin desaprueba (con motivo)
       ▼
┌─────────────┐
│ DESAPROBADO │ ← Tesoreros pueden volver a editar
└─────────────┘
       │
       │ Admin vuelve a aprobar
       ▼
┌─────────────┐
│  APROBADO   │
└─────────────┘
```

### Ejemplo de Uso

1. **Tesorero (level 7)** carga montos reales del 2025-12-30
2. **Admin Tesorería (level 8)** revisa y aprueba la fecha 2025-12-30
3. Sistema registra: `aprobado_por="admin.tesoreria"`, `aprobado_at=NOW()`
4. Tesorero intenta editar → **BLOQUEADO** (ya aprobado)
5. Admin encuentra error → desaprueba con motivo "Error en caja 3"
6. Sistema registra en auditoría: `accion="desaprobar"`, `observaciones="Error en caja 3"`
7. Tesorero puede volver a editar

---

## Consultas SQL Útiles

### Ver nivel de un usuario
```sql
SELECT u.username, r.name as role, r.level as role_level
FROM users u
JOIN roles r ON u.role_id = r.id
WHERE u.username = 'admin.tesoreria';
```

### Ver estado de aprobación de una fecha
```sql
SELECT * FROM tesoreria_aprobaciones
WHERE fecha_retiro = '2025-12-30';
```

### Ver historial de aprobaciones/desaprobaciones
```sql
SELECT * FROM tesoreria_aprobaciones_audit
WHERE fecha_retiro = '2025-12-30'
ORDER BY created_at DESC;
```

### Ver usuarios de tesorería
```sql
SELECT u.id, u.username, u.local, r.name as role, r.level
FROM users u
JOIN roles r ON u.role_id = r.id
WHERE r.name IN ('tesoreria', 'admin_tesoreria')
ORDER BY r.level DESC, u.created_at DESC;
```

---

## Resumen de Correcciones Realizadas

### Problema Original
- Los endpoints de aprobación tenían `@role_min_required(9)`
- Esto pedía `role_level >= 9`, pero admin_tesoreria tiene `role_level = 8`
- Resultado: "Permisos insuficientes" incluso siendo admin

### Solución Implementada
```python
# ANTES (incorrecto)
@role_min_required(9)  # Pedía level 9, pero admin_tesoreria es level 8

# DESPUÉS (correcto)
@role_min_required(8)  # Ahora funciona con admin_tesoreria
```

### Archivos Modificados
- [app.py:6392](app.py#L6392) - Endpoint aprobar-conciliacion
- [app.py:6449](app.py#L6449) - Endpoint desaprobar-conciliacion

---

## Testing de Permisos

### Como Admin Tesorería (level 8)
```bash
# Login como admin.tesoreria
# Ir a /reporteria/remesas
# Debería ver:
✅ Panel de aprobación visible
✅ Botón "Aprobar Conciliación" o "Desaprobar" según estado
✅ Poder ejecutar ambas acciones sin error 403
```

### Como Tesorero (level 7)
```bash
# Login como usuario tesoreria
# Ir a /reporteria/remesas
# Debería ver:
❌ Panel de aprobación NO visible ({% if role_level >= 8 %})
❌ Si intenta llamar endpoint directamente → 403 Forbidden
```

---

## Preguntas Frecuentes

**Q: ¿Qué pasa si un tesorero intenta guardar un monto en una fecha aprobada?**
A: El backend debería validar el estado antes de guardar. Si está aprobado, retornar error.

**Q: ¿Puede un admin_tesoreria editar montos reales directamente?**
A: Sí, tiene nivel 8 que incluye permisos de nivel 7. Puede hacer TODO lo que hace un tesorero.

**Q: ¿Se puede eliminar una aprobación?**
A: No se elimina, se desaprueba. El registro queda en `tesoreria_aprobaciones` y en auditoría.

**Q: ¿Cómo crear un nuevo admin_tesoreria?**
A: Desde `/gestion-usuarios-tesoreria`, crear usuario con rol "admin_tesoreria".

**Q: ¿Por qué usar `role_level` y no `role_id`?**
A: `role_level` es numérico y permite comparaciones (>=, <). `role_id` es arbitrario.
