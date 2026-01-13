# =====================================================
# MEDIOS DE PAGO PARA ANTICIPOS - ENDPOINTS API
# =====================================================
# Insertar este código en app.py ANTES de la línea 9022
# (antes de "## ====== REMESAS NO RETIRADAS")
# =====================================================

## ====== MEDIOS DE PAGO PARA ANTICIPOS ======

@app.route('/api/medios_anticipos/listar', methods=['GET'])
@login_required
@role_min_required(6)  # Solo admin_anticipos
def api_medios_anticipos_listar():
    """
    Listar todos los medios de pago para anticipos.
    Solo para admin_anticipos (level 6+)
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)

        cur.execute("""
            SELECT
                id,
                nombre,
                activo,
                es_efectivo,
                created_at,
                updated_at
            FROM medios_anticipos
            ORDER BY
                CASE nombre
                    WHEN 'Efectivo' THEN 1
                    ELSE 2
                END,
                nombre ASC
        """)

        medios = cur.fetchall()

        # Convertir timestamps a string
        for medio in medios:
            if medio.get('created_at'):
                medio['created_at'] = medio['created_at'].isoformat() if hasattr(medio['created_at'], 'isoformat') else str(medio['created_at'])
            if medio.get('updated_at'):
                medio['updated_at'] = medio['updated_at'].isoformat() if hasattr(medio['updated_at'], 'isoformat') else str(medio['updated_at'])

        cur.close()
        conn.close()

        return jsonify(success=True, medios=medios)

    except Exception as e:
        print("❌ ERROR api_medios_anticipos_listar:", e)
        import traceback
        traceback.print_exc()
        return jsonify(success=False, msg=str(e)), 500


@app.route('/api/medios_anticipos/crear', methods=['POST'])
@login_required
@role_min_required(6)  # Solo admin_anticipos
def api_medios_anticipos_crear():
    """
    Crear un nuevo medio de pago para anticipos.
    Solo para admin_anticipos (level 6+)

    Body JSON:
    {
        "nombre": "Nombre del medio",
        "es_efectivo": 0/1
    }
    """
    try:
        data = request.get_json()
        nombre = data.get('nombre', '').strip()
        es_efectivo = int(data.get('es_efectivo', 0))

        if not nombre:
            return jsonify(success=False, msg='El nombre es obligatorio'), 400

        conn = get_db_connection()
        cur = conn.cursor()

        # Verificar si ya existe
        cur.execute("SELECT id FROM medios_anticipos WHERE nombre = %s", (nombre,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify(success=False, msg=f'Ya existe un medio de pago con el nombre "{nombre}"'), 400

        # Insertar
        cur.execute("""
            INSERT INTO medios_anticipos (nombre, es_efectivo, activo)
            VALUES (%s, %s, 1)
        """, (nombre, es_efectivo))

        conn.commit()
        nuevo_id = cur.lastrowid

        cur.close()
        conn.close()

        print(f"✅ Medio de pago creado: ID={nuevo_id}, nombre={nombre}, es_efectivo={es_efectivo}")

        return jsonify(success=True, msg='Medio de pago creado correctamente', id=nuevo_id)

    except Exception as e:
        print("❌ ERROR api_medios_anticipos_crear:", e)
        import traceback
        traceback.print_exc()
        return jsonify(success=False, msg=str(e)), 500


@app.route('/api/medios_anticipos/<int:medio_id>', methods=['DELETE'])
@login_required
@role_min_required(6)  # Solo admin_anticipos
def api_medios_anticipos_eliminar(medio_id):
    """
    Eliminar (desactivar) un medio de pago.
    Solo para admin_anticipos (level 6+)

    IMPORTANTE: No se elimina físicamente, solo se desactiva (activo=0)
    para no romper referencias en anticipos existentes.
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)

        # Verificar que existe
        cur.execute("SELECT nombre, es_efectivo FROM medios_anticipos WHERE id = %s", (medio_id,))
        medio = cur.fetchone()

        if not medio:
            cur.close()
            conn.close()
            return jsonify(success=False, msg='Medio de pago no encontrado'), 404

        # No permitir eliminar "Efectivo"
        if medio['nombre'] == 'Efectivo':
            cur.close()
            conn.close()
            return jsonify(success=False, msg='No se puede eliminar el medio "Efectivo" (es el medio por defecto)'), 400

        # Verificar si hay anticipos usando este medio
        cur.execute("SELECT COUNT(*) as count FROM anticipos_recibidos WHERE medio_pago_id = %s", (medio_id,))
        result = cur.fetchone()
        anticipos_count = result['count'] if result else 0

        # Desactivar (no eliminar físicamente)
        cur.execute("UPDATE medios_anticipos SET activo = 0 WHERE id = %s", (medio_id,))
        conn.commit()

        cur.close()
        conn.close()

        msg = f'Medio de pago "{medio["nombre"]}" desactivado correctamente'
        if anticipos_count > 0:
            msg += f' (había {anticipos_count} anticipo(s) usando este medio)'

        print(f"✅ {msg}")

        return jsonify(success=True, msg=msg)

    except Exception as e:
        print("❌ ERROR api_medios_anticipos_eliminar:", e)
        import traceback
        traceback.print_exc()
        return jsonify(success=False, msg=str(e)), 500


@app.route('/api/medios_anticipos/activos', methods=['GET'])
@login_required
def api_medios_anticipos_activos():
    """
    Listar solo medios de pago activos (para uso en formularios).
    Accesible para cualquier usuario autenticado.
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)

        cur.execute("""
            SELECT
                id,
                nombre,
                es_efectivo
            FROM medios_anticipos
            WHERE activo = 1
            ORDER BY
                CASE nombre
                    WHEN 'Efectivo' THEN 1
                    ELSE 2
                END,
                nombre ASC
        """)

        medios = cur.fetchall()

        cur.close()
        conn.close()

        return jsonify(success=True, medios=medios)

    except Exception as e:
        print("❌ ERROR api_medios_anticipos_activos:", e)
        import traceback
        traceback.print_exc()
        return jsonify(success=False, msg=str(e)), 500


# =====================================================
# FIN DE ENDPOINTS DE MEDIOS DE PAGO
# =====================================================
