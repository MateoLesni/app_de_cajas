# Implementación Completada: Múltiples Locales por Encargado

## Resumen

Se implementó exitosamente el sistema de múltiples locales para Encargados, permitiendo que usuarios con role_level=2 puedan gestionar más de un local y seleccionar el local activo desde la UI.

## Cambios Realizados

### 1. Base de Datos ✅

**Archivo**: `CREATE_USER_LOCALES_V3.sql`

- Creada tabla `user_locales` con relación many-to-many entre usuarios y locales
- Migración automática de datos existentes desde `users.local`
- Collation compatible: `utf8mb4_0900_ai_ci`
- Índices optimizados para búsquedas rápidas

```sql
CREATE TABLE user_locales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    local VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_local (user_id, local),
    INDEX idx_user_id (user_id),
    INDEX idx_local (local)
);
```

### 2. Backend (app.py) ✅

#### Funciones Helper

- **`get_user_locales(user_id)`**: Obtiene todos los locales asignados a un usuario
  - Fallback a `users.local` si `user_locales` está vacío
  - Manejo robusto de errores

- **`get_local_param()` (modificada)**: Ahora soporta selección de local para Encargados
  - Nivel 1 (Cajero): Solo `session['local']`
  - Nivel 2 (Encargado): Puede seleccionar entre `available_locales`
  - Nivel 3-4 (Auditor/Jefe): Comportamiento sin cambios

#### Función de Login (modificada)

```python
# Cargar locales disponibles para el usuario
user_locales = get_user_locales(user['id'])
session['available_locales'] = user_locales

# Si el usuario tiene múltiples locales, usar el primero como default
if user_locales:
    session['local'] = user_locales[0]
```

#### Endpoints Nuevos

1. **`GET /api/user/locales`**
   - Retorna los locales disponibles del usuario actual
   - Usado por el frontend para mostrar el selector

#### Endpoints Modificados

1. **`POST /api/users`** (crear usuario)
   - Acepta parámetro `locales` (lista)
   - Llama a `create_user()` con los locales

2. **`create_user()` (función)
   - Nuevo parámetro opcional: `locales`
   - Inserta locales en `user_locales` automáticamente

### 3. Frontend ✅

#### Encargados (`index_encargado.html`)

**Archivo nuevo**: `static/js/multi_local_selector.js`

- Se carga automáticamente al iniciar la página
- Consulta `/api/user/locales` para obtener locales del usuario
- Si tiene más de 1 local, muestra un selector dropdown elegante
- Al cambiar local, recarga la página con parámetro `?local=NOMBRE`
- Funcionalidad autocontenida (no rompe código existente)

**Características**:
- Diseño moderno con estilos inline
- Hover effects
- Indicador de cantidad de locales disponibles
- Se inserta automáticamente en el DOM

#### Crear Usuario (`create_user.html` + `create_user.js`)

**Formulario modificado**:
- Campo "Local Principal" (obligatorio)
- Sección "Locales Adicionales" (opcional, solo visible para Encargados)
- Botón "+ Agregar otro local" para agregar múltiples locales
- Validación de locales duplicados
- Los locales se envían como array `locales: [...]`

**Lógica JavaScript**:
- Muestra/oculta selector según el rol seleccionado
- Inputs dinámicos con botón de eliminar (✕)
- Validación client-side de duplicados
- Mensaje de confirmación con cantidad de locales asignados

### 4. Compatibilidad Hacia Atrás ✅

- ✅ Usuarios con un solo local funcionan igual
- ✅ `session['local']` se mantiene para compatibilidad
- ✅ Fallback a `users.local` si `user_locales` está vacía
- ✅ Cajeros (nivel 1) no se ven afectados
- ✅ Auditores (nivel 3-4) continúan igual
- ✅ Código existente no requiere cambios

## Flujo de Uso

### Caso 1: Auditor Crea Encargado con Múltiples Locales

1. Auditor va a `/admin/create-user`
2. Selecciona rol "Encargado"
3. Aparece sección "Locales Adicionales"
4. Ingresa local principal: "Narda Sucre"
5. Click en "+ Agregar otro local"
6. Ingresa: "W Infanta"
7. Click en "+ Agregar otro local"
8. Ingresa: "Ribs Infanta"
9. Click en "Crear"
10. Backend guarda en `users.local = 'Narda Sucre'` y en `user_locales` los 3 locales

### Caso 2: Encargado Inicia Sesión con Múltiples Locales

1. Encargado hace login
2. Backend carga `session['available_locales'] = ['Narda Sucre', 'W Infanta', 'Ribs Infanta']`
3. Backend setea `session['local'] = 'Narda Sucre'` (primero de la lista)
4. Encargado ve su pantalla principal
5. JavaScript detecta múltiples locales y muestra selector dropdown
6. Selector muestra: 🏪 Local: [Narda Sucre ▼] (3 locales disponibles)
7. Encargado selecciona "W Infanta"
8. Página recarga con `?local=W Infanta`
9. `get_local_param()` detecta el parámetro y valida que esté en `available_locales`
10. Todas las consultas usan el nuevo local seleccionado

### Caso 3: Encargado con Un Solo Local (Sin Cambios)

1. Encargado hace login
2. Backend carga `session['available_locales'] = ['Narda Sucre']`
3. JavaScript detecta que solo tiene 1 local
4. **NO muestra el selector** (comportamiento idéntico a antes)
5. Funciona exactamente como antes

## Archivos Modificados

```
app_de_cajas/
├── app.py                          # Backend: funciones helper, login, endpoints
├── CREATE_USER_LOCALES_V3.sql      # Migración SQL
├── templates/
│   ├── create_user.html            # UI: selector de múltiples locales
│   └── index_encargado.html        # Include del script multi_local_selector.js
└── static/js/
    ├── create_user.js              # Lógica de formulario con múltiples locales
    └── multi_local_selector.js     # Selector de local para Encargados (NUEVO)
```

## Próximos Pasos (Opcional)

1. **Editar Usuario**: Agregar UI para editar locales de un usuario existente
2. **Admin Dashboard**: Página para ver/gestionar locales de todos los usuarios
3. **Validación Avanzada**: Verificar que los locales ingresados existan en la BD
4. **Autocomplete**: Sugerir locales existentes al agregar uno nuevo
5. **Auditoría**: Registrar cambios de local en logs

## Testing

### Casos de Prueba

1. ✅ Crear usuario con 1 local → Debe funcionar como antes
2. ✅ Crear Encargado con 3 locales → Debe insertar 3 filas en `user_locales`
3. ✅ Login de Encargado con 1 local → NO debe mostrar selector
4. ✅ Login de Encargado con 3 locales → Debe mostrar selector
5. ✅ Cambiar local desde selector → Debe recargar con `?local=NOMBRE`
6. ✅ Intentar acceder a local no asignado → Debe usar `session['local']` (fallback)
7. ✅ Cajero login → Sin cambios (no afectado)
8. ✅ Auditor login → Sin cambios (no afectado)

## Notas Técnicas

- **Sin Foreign Key**: Se evitó el constraint para evitar problemas de tipos incompatibles
- **Collation**: Ambas tablas usan `utf8mb4_0900_ai_ci`
- **Session Management**: Los locales se cargan una sola vez en el login
- **Performance**: Índices optimizados en `user_locales` para búsquedas rápidas
- **Seguridad**: `get_local_param()` valida que el local esté en `available_locales`

## Créditos

Implementación completa realizada el 2026-02-03.
Sistema 100% compatible hacia atrás con código existente.

---

**Estado**: ✅ Implementación Completa y Lista para Deploy
