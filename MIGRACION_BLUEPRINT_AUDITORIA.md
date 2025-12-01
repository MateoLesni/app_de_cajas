# Migración del Sistema de Auditoría a Blueprint

## ✅ Cambios Realizados

### 1. Creación del Módulo Blueprint
- **Archivo creado**: `modules/tabla_auditoria.py`
- **Tipo**: Flask Blueprint
- **Nombre del Blueprint**: `tabla_auditoria_bp`

### 2. Estructura del Módulo

El nuevo módulo sigue el patrón Blueprint estándar del proyecto:

```python
from flask import Blueprint
from app import get_db_connection, login_required

tabla_auditoria_bp = Blueprint("tabla_auditoria", __name__)
```

### 3. Funciones Disponibles

El módulo exporta las siguientes funciones para uso en otros endpoints:

- `registrar_auditoria()` - Registrar cambios en la base de datos
- `obtener_registro_anterior()` - Capturar estado antes de modificar
- `get_user_info()` - Obtener información del usuario de sesión
- `get_context_info()` - Obtener contexto (local/caja/fecha/turno)
- `obtener_auditoria()` - Consultar registros con filtros
- `obtener_historial_registro()` - Historial de un registro específico
- `audit_decorator()` - Decorador para auditar funciones automáticamente

### 4. Endpoints de API Disponibles

El blueprint expone automáticamente estos endpoints:

#### `GET /api/tabla_auditoria`
Consulta registros de auditoría con filtros opcionales.

**Query params**:
- `usuario` - Filtrar por usuario
- `tabla` - Filtrar por tabla
- `accion` - Filtrar por tipo de acción (INSERT/UPDATE/DELETE/etc.)
- `fecha_desde` - Fecha desde (YYYY-MM-DD HH:MM:SS)
- `fecha_hasta` - Fecha hasta (YYYY-MM-DD HH:MM:SS)
- `local` - Filtrar por local
- `caja` - Filtrar por caja
- `fecha_operacion` - Filtrar por fecha de operación (YYYY-MM-DD)
- `limit` - Cantidad de registros (default: 100)
- `offset` - Paginación (default: 0)

**Ejemplo**:
```
GET /api/tabla_auditoria?tabla=tarjetas_trns&accion=DELETE&limit=50
```

**Respuesta**:
```json
{
  "success": true,
  "items": [...],
  "count": 50
}
```

#### `GET /api/tabla_auditoria/historial/<tabla>/<registro_id>`
Obtiene el historial completo de cambios de un registro específico.

**Ejemplo**:
```
GET /api/tabla_auditoria/historial/tarjetas_trns/12345
```

**Respuesta**:
```json
{
  "success": true,
  "items": [
    {
      "id": 1,
      "fecha_hora": "2025-11-28 14:30:00",
      "usuario": "juan.perez",
      "accion": "INSERT",
      "tabla": "tarjetas_trns",
      "registro_id": 12345,
      "datos_nuevos": {...},
      "descripcion": "Nueva tarjeta guardada: VISA - Lote 12345"
    },
    {
      "id": 2,
      "fecha_hora": "2025-11-28 15:45:00",
      "usuario": "maria.lopez",
      "accion": "UPDATE",
      "tabla": "tarjetas_trns",
      "registro_id": 12345,
      "datos_anteriores": {...},
      "datos_nuevos": {...},
      "datos_cambios": {...},
      "descripcion": "Actualización en tarjetas_trns - Campos: monto, monto_tip"
    }
  ],
  "count": 2
}
```

#### `GET /auditoria_sistema`
Página web para consultar auditoría (HTML).

### 5. Registro en app.py

El blueprint ya está registrado automáticamente en `app.py` (línea ~509):

```python
from modules.tabla_auditoria import tabla_auditoria_bp
app.register_blueprint(tabla_auditoria_bp)
```

### 6. Cómo Usar en tus Endpoints

Para usar las funciones de auditoría en cualquier endpoint de `app.py`:

```python
from modules.tabla_auditoria import registrar_auditoria, obtener_registro_anterior

@app.route("/tarjetas/<int:tarjeta_id>", methods=["PUT"])
@login_required
def actualizar_tarjeta(tarjeta_id: int):
    conn = get_db_connection()

    # 1. Capturar estado anterior
    datos_anteriores = obtener_registro_anterior(conn, 'tarjetas_trns', tarjeta_id)

    # 2. Ejecutar UPDATE
    # ... tu código de update ...
    conn.commit()

    # 3. Registrar auditoría
    registrar_auditoria(
        conn=conn,
        accion='UPDATE',
        tabla='tarjetas_trns',
        registro_id=tarjeta_id,
        datos_anteriores=datos_anteriores,
        datos_nuevos={'monto': nuevo_monto, ...}
    )

    return jsonify(success=True)
```

## 🗑️ Archivos Eliminados

- `auditoria.py` (del directorio raíz) - Ahora está en `modules/tabla_auditoria.py`

## 📝 Archivos Actualizados

1. **`app.py`** (línea ~509)
   - Agregado: `from modules.tabla_auditoria import tabla_auditoria_bp`
   - Agregado: `app.register_blueprint(tabla_auditoria_bp)`

2. **`INTEGRACION_AUDITORIA.md`**
   - Actualizado el Paso 2 para reflejar la nueva ubicación del módulo

3. **`RESUMEN_AUDITORIA.md`**
   - Actualizado para indicar que el blueprint ya está registrado
   - Actualizado las rutas de import

## ✨ Ventajas del Nuevo Diseño

1. **Modularidad**: Código separado en módulos independientes
2. **Escalabilidad**: Fácil de mantener y extender
3. **Estándar del Proyecto**: Sigue el mismo patrón que `terminales.py` y `files_gcs.py`
4. **Endpoints Automáticos**: Los endpoints de consulta ya están disponibles sin necesidad de escribir código adicional
5. **Importación Limpia**: `from modules.tabla_auditoria import registrar_auditoria`

## 🚀 Próximos Pasos

1. ✅ **Crear la tabla en MySQL** ejecutando `audit_table.sql`
2. ⏳ **Integrar en endpoints existentes** siguiendo `INTEGRACION_AUDITORIA.md`
3. ⏳ **Probar los endpoints** de consulta:
   - `/api/tabla_auditoria`
   - `/api/tabla_auditoria/historial/tarjetas_trns/123`
   - `/auditoria_sistema`

## 📚 Documentación Relacionada

- `RESUMEN_AUDITORIA.md` - Resumen ejecutivo del sistema
- `INTEGRACION_AUDITORIA.md` - Guía paso a paso para integrar en endpoints
- `audit_table.sql` - Script SQL para crear la tabla de auditoría
- `modules/tabla_auditoria.py` - Código fuente del módulo Blueprint
