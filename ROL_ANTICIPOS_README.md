# Sistema de Roles para Anticipos

## Resumen

Se agregó un nuevo rol llamado **`anticipos`** (nivel 4) que permite a usuarios específicos crear anticipos únicamente en los locales que se les asignen. Este rol es inferior al `admin_anticipos` (nivel 6) que tiene control total.

## Niveles de Roles

```
1 = cajero
2 = encargado/administrativo
3 = auditor
4 = anticipos          ← NUEVO: Solo crea anticipos en locales asignados
5 = jefe_auditor
6 = admin_anticipos    ← Gestiona TODOS los anticipos
```

## Características del Rol 'anticipos'

### ✅ Lo que PUEDE hacer:
- Crear anticipos recibidos en los locales asignados
- Ver solo los anticipos de sus locales asignados
- Subir comprobantes (imágenes/PDFs)
- Ver detalles de anticipos
- Ver comprobantes adjuntos

### ❌ Lo que NO PUEDE hacer:
- Editar anticipos existentes
- Eliminar anticipos
- Ver anticipos de locales no asignados
- Acceder a otras secciones de la app (index, auditor, etc.)

### 🔒 Comportamiento al iniciar sesión:
- Al loguearse, el usuario es redirigido automáticamente a `/gestion-anticipos`
- No tiene acceso a ninguna otra ruta
- Solo ve la interfaz de gestión de anticipos

## Instalación

### Paso 1: Ejecutar la migración de base de datos

```bash
cd "C:\Users\mateo\GESTION COMPARTIDA Dropbox\Departamento Gestion\0001 - Control de Gestion (1)\Desarrollo\app cajas github"
python ejecutar_migracion_permisos_locales.py
```

Esto creará la tabla `user_local_permissions` que almacena qué locales puede ver cada usuario.

### Paso 2: Crear un usuario con rol 'anticipos'

```sql
-- 1. Crear el usuario
INSERT INTO users (username, password, role_name, role_level, status, first_login)
VALUES ('juan.anticipos', '', 'anticipos', 4, 'active', 0);

-- Nota: password vacío significa que en el primer login, cualquier contraseña que ingrese será guardada
```

### Paso 3: Asignar locales al usuario

```sql
-- Asignar los locales a los que tendrá acceso
INSERT INTO user_local_permissions (username, local, created_by)
VALUES
  ('juan.anticipos', 'Ribs Infanta', 'admin'),
  ('juan.anticipos', 'La Mala', 'admin'),
  ('juan.anticipos', 'Fabric Sushi', 'admin');
```

### Paso 4: Reiniciar el servidor Flask

Reiniciá el servidor para que tome los nuevos cambios.

## Gestión de Permisos

### Ver permisos de un usuario

```sql
SELECT * FROM user_local_permissions
WHERE username = 'juan.anticipos';
```

### Agregar un nuevo local a un usuario

```sql
INSERT INTO user_local_permissions (username, local, created_by)
VALUES ('juan.anticipos', 'Nuevo Local', 'admin');
```

### Quitar un local de un usuario

```sql
DELETE FROM user_local_permissions
WHERE username = 'juan.anticipos' AND local = 'Ribs Infanta';
```

### Ver todos los usuarios con permisos de anticipos

```sql
SELECT
    u.username,
    u.role_name,
    GROUP_CONCAT(ulp.local SEPARATOR ', ') as locales_asignados
FROM users u
LEFT JOIN user_local_permissions ulp ON ulp.username = u.username
WHERE u.role_name = 'anticipos'
GROUP BY u.username, u.role_name;
```

## Endpoint API para el Frontend

### `/api/mi_perfil_anticipos`
Devuelve el perfil del usuario actual:

```json
{
  "success": true,
  "level": 4,
  "allowed_locales": ["Ribs Infanta", "La Mala"],
  "can_edit": false,
  "can_delete": false,
  "has_full_access": false
}
```

Para un `admin_anticipos`:
```json
{
  "success": true,
  "level": 6,
  "allowed_locales": [],  // Vacío = todos los locales
  "can_edit": true,
  "can_delete": true,
  "has_full_access": true
}
```

## Validaciones Implementadas

### Backend
- ✅ Crear anticipo: Valida que el usuario tenga permiso para el local especificado
- ✅ Listar anticipos: Filtra automáticamente por locales permitidos
- ✅ Editar anticipo: Solo `admin_anticipos` (nivel ≥ 6)
- ✅ Eliminar anticipo: Solo `admin_anticipos` (nivel ≥ 6)

### Frontend
- ✅ Dropdown de locales: Solo muestra locales asignados
- ✅ Botones editar/eliminar: Ocultos para rol 'anticipos'
- ✅ Filtros: Solo muestra anticipos de locales permitidos

## Ejemplo de Uso Completo

```bash
# 1. Ejecutar migración
python ejecutar_migracion_permisos_locales.py

# 2. Crear usuario
mysql -u mate-dev -p cajasdb
```

```sql
-- 3. En MySQL:
INSERT INTO users (username, password, role_name, role_level, status, first_login)
VALUES ('maria.anticipos', '', 'anticipos', 4, 'active', 0);

-- 4. Asignar locales
INSERT INTO user_local_permissions (username, local, created_by)
VALUES
  ('maria.anticipos', 'La Mala', 'admin'),
  ('maria.anticipos', 'Ribs Infanta', 'admin');

-- 5. Verificar
SELECT * FROM user_local_permissions WHERE username = 'maria.anticipos';
```

```bash
# 6. Reiniciar servidor
# Presionar Ctrl+C en la terminal del servidor Flask
# Volver a ejecutar: python app_de_cajas/app.py
```

## Testing

1. **Loguearse como usuario 'anticipos':**
   - Deberías ser redirigido automáticamente a `/gestion-anticipos`
   - Solo verás los locales asignados en el dropdown

2. **Crear un anticipo:**
   - Solo podrás seleccionar los locales asignados
   - Deberás subir un comprobante obligatorio

3. **Ver anticipos:**
   - Solo verás anticipos de tus locales asignados
   - No verás botones de editar/eliminar

4. **Intentar acceder a otras rutas:**
   - Al intentar ir a `/auditor` o `/index`, deberías ser redirigido a `/gestion-anticipos`

## Troubleshooting

### Error: "No tenés permisos para crear anticipos en el local 'X'"
- Verificá que el usuario tenga el local asignado en `user_local_permissions`

### El usuario no ve ningún local
- Verificá que existan registros en `user_local_permissions` para ese username
- Verificá que el rol sea 'anticipos' (nivel 4)

### El usuario puede editar/eliminar (no debería)
- Verificá el nivel del rol: debe ser 4, no 6
- Verificá que el navegador no esté cacheando el JavaScript antiguo (Ctrl+Shift+R)

## Cambios Técnicos Realizados

### Base de Datos
- Nueva tabla: `user_local_permissions`
- Campos: `id`, `username`, `local`, `created_at`, `created_by`

### Backend (app.py)
- Actualizado `get_user_level()`: Ahora incluye nivel 4 y 6
- Nueva función: `get_user_allowed_locales()`
- Nueva función: `can_user_access_local_for_anticipos()`
- Actualizado `route_for_current_role()`: Redirige rol 'anticipos' a `/gestion-anticipos`
- Actualizado `redirect_after_login()`: Forzar redirección para rol 'anticipos'
- Nuevo endpoint: `/api/mi_perfil_anticipos`
- Actualizado `/api/anticipos_recibidos/crear`: Valida permisos por local
- Actualizado `/api/anticipos_recibidos/listar`: Filtra por locales permitidos
- Actualizado `/api/anticipos_recibidos/editar`: Solo nivel ≥ 6
- Actualizado `/api/anticipos_recibidos/eliminar`: Solo nivel ≥ 6

### Frontend (gestion_anticipos.js)
- Nueva variable global: `userProfile`
- Nueva función: `loadUserProfile()`
- Actualizado `loadLocales()`: Filtra por permisos del usuario
- Actualizado renderizado de botones: Usa `userProfile.can_edit` y `userProfile.can_delete`

## Resumen de Archivos Creados/Modificados

### Nuevos Archivos
- ✅ `app_de_cajas/migrations/add_user_local_permissions.sql`
- ✅ `ejecutar_migracion_permisos_locales.py`
- ✅ `ROL_ANTICIPOS_README.md` (este archivo)

### Archivos Modificados
- ✅ `app_de_cajas/app.py`
- ✅ `app_de_cajas/static/js/gestion_anticipos.js`

---

**Autor:** Claude Code
**Fecha:** 2025-12-10
**Versión:** 1.0
