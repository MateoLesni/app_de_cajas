# Gestión de Usuarios de Anticipos

## Resumen

Se creó una interfaz completa para que los **admin_anticipos** (nivel 6) puedan gestionar usuarios con rol **anticipos** (nivel 4), asignándoles y quitándoles locales específicos.

## Características

### ✅ Lo que el Admin de Anticipos PUEDE hacer:

- **Ver todos los usuarios de anticipos** con sus locales asignados
- **Crear nuevos usuarios de anticipos**
  - Asignar locales durante la creación (opcional)
  - El usuario podrá usar cualquier contraseña (mín. 4 caracteres) en su primer login
- **Asignar locales a usuarios existentes**
  - Un usuario puede tener uno o múltiples locales
  - Solo puede crear anticipos en los locales asignados
- **Quitar locales a usuarios**
  - Confirmación antes de quitar
  - Si un usuario no tiene locales, no podrá crear anticipos
- **Resetear contraseñas**
  - El usuario podrá usar cualquier contraseña en su próximo login

### 🎯 Acceso a la Interfaz

**Solo usuarios con nivel 6 (admin_anticipos)** pueden acceder a esta interfaz:

1. Loguearse con usuario admin_anticipos
2. En el sidebar, hacer clic en "Gestión de Usuarios"
3. Se mostrará automáticamente la interfaz de gestión de usuarios de anticipos

## Archivos Creados/Modificados

### Nuevos Archivos

- ✅ [`app_de_cajas/templates/gestion_usuarios_anticipos.html`](app_de_cajas/templates/gestion_usuarios_anticipos.html)
  - Interfaz HTML completa para gestión de usuarios
  - Diseño moderno con modals para crear/editar
  - Tabla interactiva con tags de locales

- ✅ [`app_de_cajas/static/js/gestion_usuarios_anticipos.js`](app_de_cajas/static/js/gestion_usuarios_anticipos.js)
  - JavaScript para toda la funcionalidad
  - AJAX calls a los endpoints
  - Gestión de modals y formularios

- ✅ [`GESTION_USUARIOS_ANTICIPOS_README.md`](GESTION_USUARIOS_ANTICIPOS_README.md)
  - Este archivo de documentación

### Archivos Modificados

- ✅ [`app_de_cajas/app.py`](app_de_cajas/app.py)
  - Actualizado endpoint `/gestion-usuarios` para mostrar interfaz específica si nivel == 6
  - Agregado endpoint `POST /api/usuarios_anticipos/crear`
  - Agregado endpoint `GET /api/usuarios_anticipos/listar`
  - Agregado endpoint `POST /api/usuarios_anticipos/<username>/locales/asignar`
  - Agregado endpoint `DELETE /api/usuarios_anticipos/<username>/locales/<local>/quitar`
  - Agregado endpoint `POST /api/usuarios_anticipos/resetear_password`
  - Todos los endpoints agregados a `allowed_endpoints_anticipos`

- ✅ [`app_de_cajas/static/js/gestion_anticipos.js`](app_de_cajas/static/js/gestion_anticipos.js)
  - Agregado link dinámico "Gestión de Usuarios" en sidebar si nivel >= 6
  - Agregados console.logs para debugging de carga de locales

- ✅ [`app_de_cajas/templates/gestion_anticipos.html`](app_de_cajas/templates/gestion_anticipos.html)
  - Corregido `url_for('gestion_anticipos')` → `url_for('gestion_anticipos_page')`
  - Agregado ID al sidebar para insertar link dinámicamente

## Endpoints API

### `GET /api/usuarios_anticipos/listar`
**Acceso:** Solo nivel 6 (admin_anticipos)

**Respuesta:**
```json
{
  "success": true,
  "usuarios": [
    {
      "id": 123,
      "username": "juan.anticipos",
      "status": "active",
      "role_name": "anticipos",
      "role_level": 4,
      "created_at": "2025-12-12T10:30:00",
      "locales_asignados": ["Ribs Infanta", "La Mala"]
    }
  ]
}
```

### `POST /api/usuarios_anticipos/crear`
**Acceso:** Solo nivel 6 (admin_anticipos)

**Body:**
```json
{
  "username": "maria.anticipos",
  "locales": ["Fabric Sushi", "La Mala"]  // Opcional
}
```

**Respuesta:**
```json
{
  "success": true,
  "msg": "Usuario maria.anticipos creado correctamente",
  "user_id": 124
}
```

**Notas:**
- Password se crea vacío con `first_login=0`
- En el primer login, cualquier contraseña (mín. 4 caracteres) será válida y se guardará
- Los locales son opcionales al crear el usuario

### `POST /api/usuarios_anticipos/<username>/locales/asignar`
**Acceso:** Solo nivel 6 (admin_anticipos)

**Body:**
```json
{
  "local": "Ribs Infanta"
}
```

**Respuesta:**
```json
{
  "success": true,
  "msg": "Local Ribs Infanta asignado correctamente a juan.anticipos"
}
```

**Validaciones:**
- Usuario debe existir
- Usuario debe ser de nivel 4 (anticipos)
- Local no debe estar ya asignado

### `DELETE /api/usuarios_anticipos/<username>/locales/<local>/quitar`
**Acceso:** Solo nivel 6 (admin_anticipos)

**URL:** `/api/usuarios_anticipos/juan.anticipos/locales/Ribs%20Infanta/quitar`

**Respuesta:**
```json
{
  "success": true,
  "msg": "Local Ribs Infanta removido correctamente de juan.anticipos"
}
```

**Notas:**
- El nombre del local en la URL debe estar URL-encoded
- Se decodifica automáticamente en el backend

### `POST /api/usuarios_anticipos/resetear_password`
**Acceso:** Solo nivel 6 (admin_anticipos)

**Body:**
```json
{
  "username": "juan.anticipos"
}
```

**Respuesta:**
```json
{
  "success": true,
  "msg": "Contraseña reseteada para juan.anticipos"
}
```

**Comportamiento:**
- Pone `password = ''` y `first_login = 0`
- En el próximo login, el usuario puede usar cualquier contraseña (mín. 4 caracteres)
- Esa contraseña se guardará como la nueva

## Flujo de Uso

### 1. Crear un nuevo usuario de anticipos

```
1. Admin_anticipos hace clic en "+ Nuevo Usuario de Anticipos"
2. Ingresa username (ej: "pedro.anticipos")
3. Selecciona locales de la lista (opcional)
4. Hace clic en "Crear Usuario"
5. El sistema confirma la creación
6. El usuario aparece en la tabla
```

### 2. Asignar un local a un usuario existente

```
1. En la fila del usuario, hacer clic en "+ Agregar" (botón verde)
2. Seleccionar el local del dropdown
3. Hacer clic en "Asignar Local"
4. El local aparece como tag azul en la columna "Locales Asignados"
```

### 3. Quitar un local

```
1. En el tag azul del local, hacer clic en la "×"
2. Confirmar la acción
3. El tag desaparece de la lista
```

### 4. Resetear contraseña

```
1. En la columna "Acciones", hacer clic en "Reset Pass"
2. Confirmar la acción
3. El usuario puede usar cualquier contraseña en su próximo login
```

## Interfaz de Usuario

### Vista Principal
- **Header:** Título y descripción
- **Botón acción:** "+ Nuevo Usuario de Anticipos" (arriba a la derecha)
- **Tabla:** Lista de todos los usuarios de anticipos
  - **Columnas:**
    1. Usuario (username)
    2. Estado (active/inactive badge)
    3. Locales Asignados (tags azules con botón × para quitar + botón verde para agregar)
    4. Creado (fecha)
    5. Acciones (botón "Reset Pass")

### Modal: Nuevo Usuario
- Campo: Username (requerido, mín. 3 caracteres)
- Checklist de locales (opcional, múltiple selección)
- Botones: Cancelar / Crear Usuario

### Modal: Asignar Local
- Dropdown con locales disponibles (excluye los ya asignados)
- Botones: Cancelar / Asignar Local

## Validaciones

### Frontend
- ✅ Username mínimo 3 caracteres
- ✅ Local requerido al asignar
- ✅ Confirmación antes de quitar local
- ✅ Confirmación antes de resetear password
- ✅ Mostrar solo locales no asignados en dropdown

### Backend
- ✅ Usuario debe existir para asignar/quitar locales
- ✅ Usuario debe ser de nivel 4 (anticipos)
- ✅ No duplicar locales ya asignados
- ✅ Username único al crear
- ✅ Registro en auditoría de todas las acciones

## Auditoría

Todas las acciones se registran en la tabla `tabla_auditoria`:

- **Crear usuario:** `INSERT` en tabla `users`
- **Asignar local:** `INSERT` en tabla `user_local_permissions`
- **Quitar local:** `DELETE` en tabla `user_local_permissions`
- **Resetear password:** `UPDATE` en tabla `users`

Cada registro incluye:
- Usuario que realizó la acción (admin_anticipos)
- Fecha y hora
- Datos anteriores/nuevos
- Descripción de la acción

## Troubleshooting

### Error: "Rol anticipos no encontrado"
- **Causa:** No existe el rol con nivel 4 en la tabla `roles`
- **Solución:** Ejecutar las queries SQL de [ROL_ANTICIPOS_README.md](ROL_ANTICIPOS_README.md) para crear el rol

### Error: "El usuario ya existe"
- **Causa:** Ya existe un usuario con ese username
- **Solución:** Usar un username diferente

### Error: "El local ya está asignado"
- **Causa:** El usuario ya tiene ese local asignado
- **Solución:** Verificar en la tabla que el local no esté duplicado

### No aparece el botón "Gestión de Usuarios"
- **Causa:** El usuario no es de nivel 6 (admin_anticipos)
- **Solución:** Verificar el nivel del rol en la base de datos

### Los locales no se cargan en el dropdown
- **Causa:** Error al llamar `/api/locales`
- **Solución:**
  1. Abrir consola del navegador (F12)
  2. Verificar errores de red
  3. Verificar que el endpoint esté en `allowed_endpoints_anticipos`

## Estructura de Tablas

### `users`
```sql
id, username, password, role_id (FK), status, first_login, created_at
```

### `roles`
```sql
id, name, level, created_at
-- Nivel 4 = anticipos
-- Nivel 6 = admin_anticipos
```

### `user_local_permissions`
```sql
id, username, local, created_at, created_by
-- Username: FK informal a users.username
-- Local: Nombre del local
-- Created_by: Username del admin que asignó
```

## Siguiente Paso

Reiniciá el servidor Flask y accedé a la interfaz:

1. Loguearse con un usuario admin_anticipos (nivel 6)
2. Hacer clic en "Gestión de Usuarios" en el sidebar
3. Crear usuarios de anticipos y asignarles locales

---

**Autor:** Claude Code
**Fecha:** 2025-12-12
**Versión:** 1.0
