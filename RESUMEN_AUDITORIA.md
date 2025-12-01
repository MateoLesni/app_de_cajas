# 📋 Sistema de Auditoría Completo - Resumen

## Archivos creados

### 1. `audit_table.sql` ✅
**Contenido**: Script SQL completo con:
- Tabla `auditoria` con todos los campos necesarios
- Índices optimizados para consultas rápidas
- Vista `auditoria_resumen` para consultas frecuentes
- Procedimiento almacenado `limpiar_auditoria_antigua()` para mantenimiento
- Ejemplos de consultas útiles

**Campos principales**:
- Información temporal: `fecha_hora`, `fecha_hora_utc`
- Usuario: `usuario`, `usuario_email`, `usuario_nivel`, `usuario_ip`
- Contexto: `local`, `caja`, `fecha_operacion`, `turno`
- Operación: `accion` (INSERT/UPDATE/DELETE/CLOSE_BOX/etc.), `tabla`, `registro_id`
- Datos: `datos_anteriores` (JSON), `datos_nuevos` (JSON), `datos_cambios` (JSON)
- Metadatos: `descripcion`, `endpoint`, `metodo_http`, `user_agent`, `duracion_ms`, `exito`, `error_mensaje`

### 2. `modules/tabla_auditoria.py` ✅
**Contenido**: Módulo Python Blueprint completo con:

**Funciones principales**:
- `registrar_auditoria()`: Función principal para registrar cualquier cambio
- `obtener_registro_anterior()`: Captura el estado de un registro antes de modificarlo
- `get_user_info()`: Obtiene información del usuario desde la sesión
- `get_context_info()`: Obtiene local/caja/fecha/turno automáticamente
- `obtener_auditoria()`: Consulta registros con filtros avanzados
- `obtener_historial_registro()`: Historial completo de un registro específico
- `audit_decorator()`: Decorador para auditar funciones automáticamente

### 3. `INTEGRACION_AUDITORIA.md` ✅
**Contenido**: Guía completa de integración con:
- Instrucciones paso a paso
- 4 ejemplos detallados de integración:
  - UPDATE con datos anteriores
  - DELETE con registro del estado previo
  - INSERT de nuevos registros
  - Operaciones de cierre de caja
- Lista completa de endpoints a modificar
- Nuevos endpoints para consultar auditoría
- Ejemplos de consultas SQL útiles
- Notas importantes sobre rendimiento y transacciones

### 4. `templates/auditoria_sistema.html` ✅
**Contenido**: Interfaz web para consultar auditoría (básica, puedes expandirla)

---

## Cómo usar el sistema

### Paso 1: Crear la tabla en MySQL

```bash
mysql -u app_cajas -p cajasdb < audit_table.sql
```

### Paso 2: Importar en app.py

**YA ESTÁ HECHO**: El blueprint ya está registrado en app.py (línea ~509).

Para usar las funciones en tus endpoints:

```python
from modules.tabla_auditoria import (
    registrar_auditoria,
    obtener_registro_anterior,
    obtener_auditoria,
    obtener_historial_registro
)
```

### Paso 3: Integrar en endpoints

**Patrón para UPDATE**:
```python
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

**Patrón para DELETE**:
```python
@app.route("/tarjetas/<int:tarjeta_id>", methods=["DELETE"])
@login_required
def borrar_tarjeta(tarjeta_id: int):
    conn = get_db_connection()

    # 1. Capturar estado anterior
    datos_anteriores = obtener_registro_anterior(conn, 'tarjetas_trns', tarjeta_id)

    # 2. Ejecutar DELETE
    # ... tu código de delete ...
    conn.commit()

    # 3. Registrar auditoría
    registrar_auditoria(
        conn=conn,
        accion='DELETE',
        tabla='tarjetas_trns',
        registro_id=tarjeta_id,
        datos_anteriores=datos_anteriores,
        descripcion=f"Eliminación de tarjeta {datos_anteriores.get('tarjeta')}"
    )

    return jsonify(success=True)
```

**Patrón para INSERT**:
```python
@app.route("/guardar_tarjetas_lote", methods=["POST"])
@login_required
def guardar_tarjetas_lote():
    conn = get_db_connection()
    data = request.get_json()

    # 1. Ejecutar INSERT
    cur = conn.cursor()
    cur.execute(sql_insert, valores)
    nuevo_id = cur.lastrowid  # Capturar ID
    conn.commit()

    # 2. Registrar auditoría
    registrar_auditoria(
        conn=conn,
        accion='INSERT',
        tabla='tarjetas_trns',
        registro_id=nuevo_id,
        datos_nuevos={'tarjeta': data['tarjeta'], 'monto': data['monto'], ...}
    )

    return jsonify(success=True)
```

### Paso 4: Agregar endpoints de consulta

**YA ESTÁ HECHO**: Los endpoints ya están disponibles en el blueprint:

- `GET /api/tabla_auditoria` - Consultar registros con filtros
- `GET /api/tabla_auditoria/historial/<tabla>/<registro_id>` - Historial de un registro
- `GET /auditoria_sistema` - Página web de consulta

Ejemplo de uso desde código:

```python
# Este código es solo de referencia - los endpoints ya existen en el blueprint
@app.route("/api/auditoria", methods=["GET"])
@login_required
def api_auditoria():
    """Consulta registros de auditoría con filtros"""
    conn = get_db_connection()

    filtros = {
        'usuario': request.args.get('usuario'),
        'tabla': request.args.get('tabla'),
        'accion': request.args.get('accion'),
        'local': request.args.get('local'),
        'caja': request.args.get('caja'),
        'fecha_operacion': request.args.get('fecha_operacion'),
    }
    filtros = {k: v for k, v in filtros.items() if v}

    limit = int(request.args.get('limit', 100))
    offset = int(request.args.get('offset', 0))

    resultados = obtener_auditoria(conn, filtros, limit, offset)
    conn.close()

    return jsonify(success=True, items=resultados)


@app.route("/api/auditoria/historial/<tabla>/<int:registro_id>", methods=["GET"])
@login_required
def api_auditoria_historial(tabla, registro_id):
    """Historial completo de un registro"""
    conn = get_db_connection()
    historial = obtener_historial_registro(conn, tabla, registro_id)
    conn.close()

    return jsonify(success=True, items=historial)


@app.route("/auditoria_sistema")
@login_required
def pagina_auditoria():
    """Página web para consultar auditoría"""
    return render_template('auditoria_sistema.html')
```

---

## Consultas SQL útiles

```sql
-- Ver últimas 100 acciones
SELECT * FROM auditoria ORDER BY fecha_hora DESC LIMIT 100;

-- Ver todos los DELETE
SELECT * FROM auditoria WHERE accion = 'DELETE' ORDER BY fecha_hora DESC;

-- Ver cambios en tarjetas
SELECT * FROM auditoria WHERE tabla = 'tarjetas_trns' ORDER BY fecha_hora DESC;

-- Ver acciones de un usuario
SELECT * FROM auditoria WHERE usuario = 'nombre_usuario' ORDER BY fecha_hora DESC;

-- Ver acciones en una fecha específica
SELECT * FROM auditoria WHERE fecha_operacion = '2025-11-27';

-- Ver solo operaciones fallidas
SELECT * FROM auditoria WHERE exito = FALSE ORDER BY fecha_hora DESC;

-- Limpiar registros antiguos (más de 1 año)
CALL limpiar_auditoria_antigua(365);
```

---

## Tablas/Endpoints a auditar

### ✅ Debes integrar en:

1. **Tarjetas** (`tarjetas_trns`)
   - `/guardar_tarjetas_lote` (INSERT)
   - `/tarjetas/<id>` PUT (UPDATE)
   - `/tarjetas/<id>` DELETE

2. **Remesas** (`remesas_trns`)
   - `/guardar_remesas_lote` (INSERT)
   - `/remesas/<id>` PUT (UPDATE)
   - `/remesas/<id>` DELETE

3. **Rappi** (`rappi_trns`)
   - `/guardar_rappi` (INSERT)
   - `/rappi/<id>` DELETE

4. **PedidosYa** (`pedidosya_trns`)
   - `/guardar_pedidosya` (INSERT)
   - `/pedidosya/<id>` DELETE

5. **MercadoPago** (`mercadopago_trns`)
   - `/guardar_mercadopago` (INSERT)
   - `/mercadopago/<id>` DELETE

6. **Anticipos** (`anticipos_consumidos_trns`)
   - `/guardar_anticipos_lote` (INSERT)
   - `/anticipos/<id>` PUT (UPDATE)
   - `/anticipos/<id>` DELETE

7. **Ventas** (`ventas_trns`)
   - `/guardar_ventas` (INSERT)
   - `/ventas/<id>` DELETE

8. **Facturas** (`facturas_trns`)
   - `/guardar_facturas` (INSERT)
   - `/facturas/<id>` PUT (UPDATE)
   - `/facturas/<id>` DELETE

9. **Gastos** (`gastos_trns`)
   - `/guardar_gastos` (INSERT)
   - `/gastos/<id>` DELETE

10. **Operaciones especiales**
    - `/cerrar_caja` (CLOSE_BOX)
    - `/cerrar_local` (CLOSE_LOCAL)
    - `/auditar_local` (AUDIT)

---

## Características del sistema

✅ **Registro completo**: Captura usuario, fecha/hora, IP, navegador, contexto (local/caja/turno), etc.

✅ **Datos completos**: Guarda el estado anterior, el nuevo, y solo los cambios (para UPDATE)

✅ **No invasivo**: Si falla la auditoría, NO falla la operación principal

✅ **Rendimiento**: Índices optimizados para búsquedas rápidas

✅ **Mantenimiento**: Procedimiento para limpiar registros antiguos

✅ **Flexible**: Campos JSON para guardar cualquier estructura de datos

✅ **Consultas**: Funciones Python para consultar y filtrar fácilmente

✅ **Vista simplificada**: Para reportes rápidos

---

## Próximos pasos

1. Ejecutar `audit_table.sql` en MySQL
2. Importar `auditoria.py` en `app.py`
3. Integrar `registrar_auditoria()` en cada endpoint (empezar con uno de prueba)
4. Agregar los endpoints de consulta (`/api/auditoria`, etc.)
5. Probar consultando la tabla directamente en MySQL
6. Expandir la interfaz web si es necesario

---

## Notas importantes

⚠️ **Rendimiento**: La tabla crecerá con el tiempo. Ejecuta `CALL limpiar_auditoria_antigua(365)` periódicamente.

⚠️ **Transacciones**: Registra la auditoría DESPUÉS del `commit()`, no antes.

⚠️ **Errores**: El sistema NO fallará si falla la auditoría (está protegido con try/except).

⚠️ **JSON**: Los campos JSON son perfectos para datos complejos sin necesidad de crear más columnas.

⚠️ **Contexto automático**: El sistema captura automáticamente local/caja/fecha/turno de los parámetros de la request.
