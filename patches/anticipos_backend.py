# -*- coding: utf-8 -*-
"""
PARCHE: Cambios para anticipos con divisa y adjuntos
Este archivo contiene las funciones modificadas que deben reemplazar las originales en app.py

INSTRUCCIONES:
1. Buscar cada función en app.py
2. Reemplazar con la versión de este archivo
"""

# ============================================================================
# ENDPOINT: crear_anticipo_recibido (línea ~2276)
# ============================================================================
"""
@app.route('/api/anticipos_recibidos/crear', methods=['POST'])
@login_required
def crear_anticipo_recibido():
    \"\"\"
    Crear un nuevo anticipo recibido.
    Solo accesible para admin_anticipos (nivel 5) o superiores.

    Body:
    {
        "fecha_pago": "2025-12-01",
        "fecha_evento": "2025-12-15",
        "importe": 5000.00,
        "divisa": "ARS",
        "cliente": "Juan Pérez",
        "numero_transaccion": "TRX123456",
        "medio_pago": "Transferencia",
        "observaciones": "Reserva para evento...",
        "local": "Ribs Infanta",
        "adjunto_gcs_path": "ruta/al/archivo.jpg"  # Opcional: ruta del adjunto ya subido
    }
    \"\"\"
    user_level = get_user_level()
    if user_level < 5:
        return jsonify(success=False, msg="No tenés permisos para crear anticipos recibidos"), 403

    data = request.get_json() or {}

    # Validar campos requeridos
    required_fields = ['fecha_pago', 'fecha_evento', 'importe', 'cliente', 'local']
    for field in required_fields:
        if not data.get(field):
            return jsonify(success=False, msg=f"Campo requerido faltante: {field}"), 400

    try:
        # Parsear y validar datos
        fecha_pago = _normalize_fecha(data['fecha_pago'])
        fecha_evento = _normalize_fecha(data['fecha_evento'])
        importe = float(data['importe'])
        cliente = data['cliente'].strip()
        local = data['local'].strip()

        # NUEVO: Campos de divisa
        divisa = (data.get('divisa') or 'ARS').strip().upper()
        tipo_cambio_fecha = data.get('tipo_cambio_fecha')
        if not tipo_cambio_fecha:
            # Si no se especifica, usar la fecha de pago
            tipo_cambio_fecha = fecha_pago
        else:
            tipo_cambio_fecha = _normalize_fecha(tipo_cambio_fecha)

        numero_transaccion = data.get('numero_transaccion', '').strip() or None
        medio_pago = data.get('medio_pago', '').strip() or None
        observaciones = data.get('observaciones', '').strip() or None

        # NUEVO: Adjunto opcional
        adjunto_gcs_path = data.get('adjunto_gcs_path', '').strip() or None

        if importe <= 0:
            return jsonify(success=False, msg="El importe debe ser mayor a cero"), 400

        # NUEVO: Validar divisa
        divisas_permitidas = ['ARS', 'USD', 'EUR', 'BRL', 'CLP', 'UYU']
        if divisa not in divisas_permitidas:
            return jsonify(success=False, msg=f"Divisa no permitida. Usar: {', '.join(divisas_permitidas)}"), 400

        usuario = session.get('username', 'sistema')

        conn = get_db_connection()
        cur = conn.cursor()

        # MODIFICADO: Insertar anticipo recibido con divisa
        sql = \"\"\"
            INSERT INTO anticipos_recibidos
            (fecha_pago, fecha_evento, importe, divisa, tipo_cambio_fecha,
             cliente, numero_transaccion, medio_pago, observaciones,
             local, estado, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'pendiente', %s)
        \"\"\"
        cur.execute(sql, (fecha_pago, fecha_evento, importe, divisa, tipo_cambio_fecha,
                         cliente, numero_transaccion, medio_pago, observaciones,
                         local, usuario))

        anticipo_id = cur.lastrowid

        # NUEVO: Si hay adjunto, vincular a imagenes_adjuntos
        if adjunto_gcs_path:
            try:
                # Actualizar el registro del adjunto con el entity_id
                cur.execute(\"\"\"
                    UPDATE imagenes_adjuntos
                    SET entity_type = 'anticipo_recibido',
                        entity_id = %s
                    WHERE gcs_path = %s
                      AND (entity_id IS NULL OR entity_id = 0)
                \"\"\", (anticipo_id, adjunto_gcs_path))
            except Exception as e:
                print(f"⚠️  Warning: No se pudo vincular adjunto: {e}")

        conn.commit()

        # MODIFICADO: Registrar en auditoría con nuevos campos
        from modules.tabla_auditoria import registrar_auditoria
        registrar_auditoria(
            conn=conn,
            accion='INSERT',
            tabla='anticipos_recibidos',
            registro_id=anticipo_id,
            datos_nuevos={
                'fecha_pago': str(fecha_pago),
                'fecha_evento': str(fecha_evento),
                'importe': importe,
                'divisa': divisa,
                'tipo_cambio_fecha': str(tipo_cambio_fecha),
                'cliente': cliente,
                'local': local,
                'numero_transaccion': numero_transaccion,
                'medio_pago': medio_pago,
                'tiene_adjunto': bool(adjunto_gcs_path)
            },
            descripcion=f"Anticipo recibido creado: {cliente} - {divisa} {importe}"
        )

        cur.close()
        conn.close()

        return jsonify(success=True, msg="Anticipo recibido creado correctamente", anticipo_id=anticipo_id)

    except Exception as e:
        print("❌ ERROR crear_anticipo_recibido:", e)
        import traceback
        traceback.print_exc()
        return jsonify(success=False, msg=str(e)), 500
"""

# ============================================================================
# ENDPOINT: listar_anticipos_recibidos (línea ~2371)
# ============================================================================
"""
MODIFICAR el SELECT para incluir divisa, tipo_cambio_fecha, created_by

Buscar la línea que dice:
    sql = "SELECT * FROM anticipos_recibidos WHERE 1=1"

Y reemplazarla con:
    sql = \"\"\"
        SELECT
            ar.*,
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM imagenes_adjuntos ia
                    WHERE ia.entity_type = 'anticipo_recibido'
                      AND ia.entity_id = ar.id
                      AND ia.estado = 'active'
                ) THEN 1
                ELSE 0
            END as tiene_adjunto
        FROM anticipos_recibidos ar
        WHERE 1=1
    \"\"\"

El resto del código queda igual.
"""

# ============================================================================
# ENDPOINT: api_anticipos_disponibles (buscar por nombre)
# ============================================================================
"""
MODIFICAR el SELECT para incluir created_by y adjunto

Buscar el query que devuelve los anticipos disponibles y agregar:
- ar.created_by
- LEFT JOIN con imagenes_adjuntos

Query modificado:
    SELECT
        ar.id,
        ar.cliente,
        ar.fecha_pago,
        ar.fecha_evento,
        ar.importe,
        ar.divisa,
        ar.medio_pago,
        ar.numero_transaccion,
        ar.observaciones,
        ar.created_by,
        ia.gcs_path as adjunto_gcs_path,
        ia.original_name as adjunto_nombre
    FROM anticipos_recibidos ar
    LEFT JOIN (
        SELECT entity_id, gcs_path, original_name
        FROM imagenes_adjuntos
        WHERE entity_type = 'anticipo_recibido'
          AND estado = 'active'
        GROUP BY entity_id
    ) ia ON ia.entity_id = ar.id
    WHERE ar.estado = 'pendiente'
      AND ar.local = %s
    ORDER BY ar.fecha_evento ASC, ar.id ASC
"""

# ============================================================================
# ENDPOINT: api_anticipos_consumidos_en_caja (buscar por nombre)
# ============================================================================
"""
MODIFICAR el SELECT para incluir created_by y divisa

Agregar a la lista de campos:
- ar.created_by
- ar.divisa
"""

print("✅ Archivo de parche creado.")
print("📝 Instrucciones:")
print("1. Abrí app.py")
print("2. Buscá cada función mencionada arriba")
print("3. Reemplazá con las versiones modificadas")
print("4. Guardá el archivo")
