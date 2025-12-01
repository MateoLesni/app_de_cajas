# Integración del Sistema de Auditoría

## Paso 1: Crear la tabla en la base de datos

Ejecutar el script SQL `audit_table.sql` en MySQL:

```bash
mysql -u app_cajas -p cajasdb < audit_table.sql
```

O desde MySQL Workbench/phpMyAdmin, copiar y ejecutar el contenido del archivo.

## Paso 2: Importar el módulo en app.py

**NOTA:** El módulo ya está registrado como Blueprint en app.py (línea ~509):

```python
from modules.tabla_auditoria import tabla_auditoria_bp
app.register_blueprint(tabla_auditoria_bp)
```

Para usar las funciones de auditoría en tus endpoints, importa:

```python
from modules.tabla_auditoria import (
    registrar_auditoria,
    obtener_registro_anterior,
    obtener_auditoria,
    obtener_historial_registro,
    audit_decorator
)
```

## Paso 3: Integrar en los endpoints existentes

### Ejemplo 1: UPDATE de tarjeta (con datos anteriores)

**ANTES:**
```python
@app.route("/tarjetas/<int:tarjeta_id>", methods=["PUT"])
@login_required
def actualizar_tarjeta(tarjeta_id: int):
    try:
        conn = get_db_connection()
        data = request.get_json() or {}
        # ... código de validación ...

        cur2 = conn.cursor()
        cur2.execute(f"UPDATE tarjetas_trns SET {', '.join(sets)} WHERE id=%s", tuple(vals))
        conn.commit()
        cur2.close(); cur.close(); conn.close()
        return jsonify(success=True)
    except Exception as e:
        return jsonify(success=False, msg=f"Error: {e}"), 500
```

**DESPUÉS (con auditoría):**
```python
@app.route("/tarjetas/<int:tarjeta_id>", methods=["PUT"])
@login_required
def actualizar_tarjeta(tarjeta_id: int):
    try:
        conn = get_db_connection()
        data = request.get_json() or {}

        # 1. OBTENER DATOS ANTERIORES antes de modificar
        datos_anteriores = obtener_registro_anterior(conn, 'tarjetas_trns', tarjeta_id)

        # ... código de validación existente ...

        # 2. Ejecutar UPDATE
        cur2 = conn.cursor()
        cur2.execute(f"UPDATE tarjetas_trns SET {', '.join(sets)} WHERE id=%s", tuple(vals))
        conn.commit()

        # 3. REGISTRAR AUDITORÍA
        datos_nuevos = {
            'id': tarjeta_id,
            'monto': data.get('monto'),
            'monto_tip': data.get('monto_tip'),
            # ... otros campos que se actualizaron
        }

        registrar_auditoria(
            conn=conn,
            accion='UPDATE',
            tabla='tarjetas_trns',
            registro_id=tarjeta_id,
            datos_anteriores=datos_anteriores,
            datos_nuevos=datos_nuevos,
            descripcion=f"Actualización de tarjeta {datos_anteriores.get('tarjeta')} - Lote {datos_anteriores.get('lote')}"
        )

        cur2.close(); cur.close(); conn.close()
        return jsonify(success=True)
    except Exception as e:
        return jsonify(success=False, msg=f"Error: {e}"), 500
```

### Ejemplo 2: DELETE de tarjetas (bloque completo)

**ANTES:**
```python
@app.route("/tarjetas/<int:tarjeta_id>", methods=["DELETE"])
@login_required
def borrar_tarjeta(tarjeta_id: int):
    try:
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT id, local, caja, fecha, turno, terminal, lote
              FROM tarjetas_trns
             WHERE id=%s
        """, (tarjeta_id,))
        row = cur.fetchone()

        # ... validaciones ...

        cur2 = conn.cursor()
        cur2.execute("""
            DELETE FROM tarjetas_trns
             WHERE local=%s AND caja=%s AND DATE(fecha)=%s AND turno=%s
               AND terminal=%s AND lote=%s
        """, (row['local'], row['caja'], _normalize_fecha(row['fecha']), row['turno'], row['terminal'], row['lote']))
        eliminadas = cur2.rowcount
        conn.commit()
        cur2.close(); cur.close(); conn.close()
        return jsonify(success=True, deleted=eliminadas)
    except Exception as e:
        return jsonify(success=False, msg=f"Error: {e}"), 500
```

**DESPUÉS (con auditoría):**
```python
@app.route("/tarjetas/<int:tarjeta_id>", methods=["DELETE"])
@login_required
def borrar_tarjeta(tarjeta_id: int):
    try:
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT id, local, caja, fecha, turno, terminal, lote
              FROM tarjetas_trns
             WHERE id=%s
        """, (tarjeta_id,))
        row = cur.fetchone()

        # ... validaciones ...

        # 1. OBTENER TODOS LOS REGISTROS QUE SE VAN A BORRAR
        cur.execute("""
            SELECT * FROM tarjetas_trns
             WHERE local=%s AND caja=%s AND DATE(fecha)=%s AND turno=%s
               AND terminal=%s AND lote=%s
        """, (row['local'], row['caja'], _normalize_fecha(row['fecha']), row['turno'], row['terminal'], row['lote']))
        registros_a_borrar = cur.fetchall()

        # 2. Ejecutar DELETE
        cur2 = conn.cursor()
        cur2.execute("""
            DELETE FROM tarjetas_trns
             WHERE local=%s AND caja=%s AND DATE(fecha)=%s AND turno=%s
               AND terminal=%s AND lote=%s
        """, (row['local'], row['caja'], _normalize_fecha(row['fecha']), row['turno'], row['terminal'], row['lote']))
        eliminadas = cur2.rowcount
        conn.commit()

        # 3. REGISTRAR AUDITORÍA (una entrada para el grupo completo)
        registrar_auditoria(
            conn=conn,
            accion='DELETE',
            tabla='tarjetas_trns',
            registro_id=tarjeta_id,
            datos_anteriores={
                'registros_eliminados': registros_a_borrar,
                'cantidad': eliminadas
            },
            descripcion=f"Eliminación de lote completo: Terminal {row['terminal']} / Lote {row['lote']} ({eliminadas} registros)",
            contexto_override={
                'local': row['local'],
                'caja': row['caja'],
                'fecha_operacion': str(row['fecha']),
                'turno': row['turno']
            }
        )

        cur2.close(); cur.close(); conn.close()
        return jsonify(success=True, deleted=eliminadas)
    except Exception as e:
        return jsonify(success=False, msg=f"Error: {e}"), 500
```

### Ejemplo 3: INSERT de nuevas tarjetas

**ANTES:**
```python
@app.route("/guardar_tarjetas_lote", methods=["POST"])
@login_required
def guardar_tarjetas_lote():
    try:
        conn = get_db_connection()
        data = request.get_json() or {}
        # ... código de inserción ...

        cur = conn.cursor()
        cur.execute(sql_insert, valores)
        conn.commit()
        cur.close(); conn.close()
        return jsonify(success=True)
    except Exception as e:
        return jsonify(success=False, msg=f"Error: {e}"), 500
```

**DESPUÉS (con auditoría):**
```python
@app.route("/guardar_tarjetas_lote", methods=["POST"])
@login_required
def guardar_tarjetas_lote():
    try:
        conn = get_db_connection()
        data = request.get_json() or {}
        # ... código de inserción ...

        cur = conn.cursor()
        cur.execute(sql_insert, valores)
        nuevo_id = cur.lastrowid  # Capturar el ID del nuevo registro
        conn.commit()

        # REGISTRAR AUDITORÍA
        registrar_auditoria(
            conn=conn,
            accion='INSERT',
            tabla='tarjetas_trns',
            registro_id=nuevo_id,
            datos_nuevos={
                'tarjeta': data.get('tarjeta'),
                'monto': data.get('monto'),
                'monto_tip': data.get('tip'),
                'terminal': data.get('terminal'),
                'lote': data.get('lote')
            },
            descripcion=f"Nueva tarjeta guardada: {data.get('tarjeta')} - Lote {data.get('lote')}"
        )

        cur.close(); conn.close()
        return jsonify(success=True)
    except Exception as e:
        return jsonify(success=False, msg=f"Error: {e}"), 500
```

### Ejemplo 4: Cierre de caja

```python
@app.route("/cerrar_caja", methods=["POST"])
@login_required
def cerrar_caja():
    try:
        conn = get_db_connection()
        data = request.get_json() or {}

        local = data.get('local')
        caja = data.get('caja')
        fecha = data.get('fecha')
        turno = data.get('turno')

        # ... lógica de cierre ...

        cur = conn.cursor()
        cur.execute("""
            INSERT INTO cajas_estado (local, caja, fecha_operacion, turno, estado)
            VALUES (%s, %s, %s, %s, 0)
            ON DUPLICATE KEY UPDATE estado=0
        """, (local, caja, fecha, turno))
        conn.commit()

        # REGISTRAR AUDITORÍA DE CIERRE
        registrar_auditoria(
            conn=conn,
            accion='CLOSE_BOX',
            tabla='cajas_estado',
            descripcion=f"Cierre de caja: {caja} - Local: {local}",
            contexto_override={
                'local': local,
                'caja': caja,
                'fecha_operacion': fecha,
                'turno': turno
            }
        )

        cur.close(); conn.close()
        return jsonify(success=True)
    except Exception as e:
        return jsonify(success=False, msg=f"Error: {e}"), 500
```

## Paso 4: Endpoints para consultar auditoría

Agregar estos nuevos endpoints a `app.py`:

```python
@app.route("/api/auditoria", methods=["GET"])
@login_required
def api_auditoria():
    """Obtiene registros de auditoría con filtros opcionales"""
    try:
        conn = get_db_connection()

        # Obtener filtros desde query params
        filtros = {
            'usuario': request.args.get('usuario'),
            'tabla': request.args.get('tabla'),
            'accion': request.args.get('accion'),
            'fecha_desde': request.args.get('fecha_desde'),
            'fecha_hasta': request.args.get('fecha_hasta'),
            'local': request.args.get('local'),
            'caja': request.args.get('caja'),
            'fecha_operacion': request.args.get('fecha_operacion'),
        }

        # Remover valores None
        filtros = {k: v for k, v in filtros.items() if v is not None}

        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))

        resultados = obtener_auditoria(conn, filtros, limit, offset)

        conn.close()
        return jsonify(success=True, items=resultados, count=len(resultados))
    except Exception as e:
        print(f"❌ ERROR en api_auditoria: {e}")
        return jsonify(success=False, msg=str(e)), 500


@app.route("/api/auditoria/historial/<tabla>/<int:registro_id>", methods=["GET"])
@login_required
def api_auditoria_historial(tabla, registro_id):
    """Obtiene el historial completo de un registro específico"""
    try:
        conn = get_db_connection()
        historial = obtener_historial_registro(conn, tabla, registro_id)
        conn.close()
        return jsonify(success=True, items=historial, count=len(historial))
    except Exception as e:
        print(f"❌ ERROR en api_auditoria_historial: {e}")
        return jsonify(success=False, msg=str(e)), 500
```

## Paso 5: Aplicar a TODOS los endpoints

Aplicar el mismo patrón a todos los endpoints que modifican datos:

### Endpoints a modificar:

1. **Remesas:**
   - `/guardar_remesas_lote` (INSERT)
   - `/remesas/<id>` PUT (UPDATE)
   - `/remesas/<id>` DELETE

2. **Rappi:**
   - `/guardar_rappi` (INSERT)
   - `/rappi/<id>` DELETE

3. **PedidosYa:**
   - `/guardar_pedidosya` (INSERT)
   - `/pedidosya/<id>` DELETE

4. **MercadoPago:**
   - `/guardar_mercadopago` (INSERT)
   - `/mercadopago/<id>` DELETE

5. **Anticipos:**
   - `/guardar_anticipos_lote` (INSERT)
   - `/anticipos/<id>` PUT (UPDATE)
   - `/anticipos/<id>` DELETE

6. **Ventas:**
   - `/guardar_ventas` (INSERT)
   - `/ventas/<id>` DELETE

7. **Facturas:**
   - `/guardar_facturas` (INSERT)
   - `/facturas/<id>` PUT (UPDATE)
   - `/facturas/<id>` DELETE

8. **Gastos:**
   - `/guardar_gastos` (INSERT)
   - `/gastos/<id>` DELETE

9. **Operaciones de cierre:**
   - `/cerrar_caja` (CLOSE_BOX)
   - `/cerrar_local` (CLOSE_LOCAL)
   - `/auditar_local` (AUDIT)

## Paso 6: Verificar funcionamiento

Después de integrar, puedes verificar que funcione:

```sql
-- Ver últimas 20 acciones
SELECT * FROM auditoria ORDER BY fecha_hora DESC LIMIT 20;

-- Ver todas las eliminaciones
SELECT * FROM auditoria WHERE accion = 'DELETE' ORDER BY fecha_hora DESC;

-- Ver cambios en tarjetas
SELECT * FROM auditoria WHERE tabla = 'tarjetas_trns' ORDER BY fecha_hora DESC;

-- Ver acciones de un usuario específico
SELECT * FROM auditoria WHERE usuario = 'nombre_usuario' ORDER BY fecha_hora DESC;
```

## Notas importantes:

1. **Rendimiento**: La tabla de auditoría puede crecer rápido. Considera ejecutar `CALL limpiar_auditoria_antigua(365)` periódicamente para limpiar registros antiguos.

2. **Transacciones**: Asegúrate de que `registrar_auditoria()` se llame DESPUÉS del `commit()` para que no se registre si falla la operación.

3. **Errores**: Si falla el registro de auditoría, NO debe fallar la operación principal (esto ya está manejado en el código).

4. **JSON**: Los campos `datos_anteriores`, `datos_nuevos` y `datos_cambios` son JSON, perfectos para guardar estructuras complejas.

5. **Contexto**: El sistema captura automáticamente local/caja/fecha/turno desde los query params o form data. Si necesitas sobrescribirlo, usa `contexto_override`.
