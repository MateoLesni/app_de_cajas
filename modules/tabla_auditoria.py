"""
Sistema de Auditoría Completo - Blueprint
Registra todas las operaciones de INSERT, UPDATE, DELETE en la base de datos
"""

from __future__ import annotations
import json
import time
from datetime import datetime
import pytz
from flask import Blueprint, request, jsonify, render_template, session, g
from functools import wraps
import traceback

# Importar helpers desde app principal
from app import get_db_connection, login_required

# Crear Blueprint
tabla_auditoria_bp = Blueprint("tabla_auditoria", __name__)

# Zona horaria de Argentina
TIMEZONE_ARG = pytz.timezone('America/Argentina/Buenos_Aires')


# ========================================================================
# FUNCIONES DE UTILIDAD
# ========================================================================

def get_user_info():
    """Obtiene información del usuario actual desde la sesión"""
    try:
        # La app usa 'username' en lugar de 'usuario'
        usuario = session.get('username', session.get('usuario', 'SISTEMA'))
        usuario_email = session.get('email', None)
        usuario_nivel = int(session.get('role_level', 1))
        usuario_ip = request.remote_addr if request else None
        user_agent = request.headers.get('User-Agent', '') if request else ''

        return {
            'usuario': usuario,
            'usuario_email': usuario_email,
            'usuario_nivel': usuario_nivel,
            'usuario_ip': usuario_ip,
            'user_agent': user_agent
        }
    except Exception as e:
        print(f"[AUDIT] Error obteniendo info de usuario: {e}")
        return {
            'usuario': 'SISTEMA',
            'usuario_email': None,
            'usuario_nivel': 1,
            'usuario_ip': None,
            'user_agent': ''
        }


def get_context_info():
    """Obtiene información del contexto (local, caja, fecha, turno) desde request args o form"""
    try:
        # Intentar desde query params
        local = request.args.get('local', request.form.get('local'))
        caja = request.args.get('caja', request.form.get('caja'))
        fecha = request.args.get('fecha', request.form.get('fecha'))
        turno = request.args.get('turno', request.form.get('turno', 'UNI'))

        # Intentar desde JSON body si no está en args/form
        if not local or not caja or not fecha:
            try:
                data = request.get_json(silent=True) or {}
                local = local or data.get('local')
                caja = caja or data.get('caja')
                fecha = fecha or data.get('fecha')
                turno = turno or data.get('turno', 'UNI')
            except:
                pass

        return {
            'local': local,
            'caja': caja,
            'fecha_operacion': fecha,
            'turno': turno
        }
    except Exception as e:
        print(f"[AUDIT] Error obteniendo contexto: {e}")
        return {
            'local': None,
            'caja': None,
            'fecha_operacion': None,
            'turno': None
        }


def registrar_auditoria(conn, accion, tabla, registro_id=None, datos_anteriores=None,
                       datos_nuevos=None, descripcion=None, exito=True, error_mensaje=None,
                       duracion_ms=None, contexto_override=None):
    """
    Registra una entrada en la tabla de auditoría

    Args:
        conn: Conexión a la base de datos
        accion: 'INSERT', 'UPDATE', 'DELETE', 'CLOSE_BOX', 'CLOSE_LOCAL', 'AUDIT', etc.
        tabla: Nombre de la tabla afectada
        registro_id: ID del registro afectado (opcional)
        datos_anteriores: Diccionario con los datos antes del cambio (para UPDATE/DELETE)
        datos_nuevos: Diccionario con los datos después del cambio (para INSERT/UPDATE)
        descripcion: Descripción legible de la acción
        exito: Boolean indicando si la operación fue exitosa
        error_mensaje: Mensaje de error si hubo uno
        duracion_ms: Tiempo que tomó la operación en milisegundos
        contexto_override: Diccionario para sobrescribir local/caja/fecha/turno
    """
    try:
        # Información del usuario
        user_info = get_user_info()

        # Información del contexto
        context_info = get_context_info()
        if contexto_override:
            context_info.update(contexto_override)

        # Calcular cambios si es UPDATE
        datos_cambios = None
        if accion == 'UPDATE' and datos_anteriores and datos_nuevos:
            datos_cambios = {}
            for key in datos_nuevos:
                if key in datos_anteriores and datos_anteriores[key] != datos_nuevos[key]:
                    datos_cambios[key] = {
                        'anterior': datos_anteriores[key],
                        'nuevo': datos_nuevos[key]
                    }

        # Convertir a JSON
        datos_anteriores_json = json.dumps(datos_anteriores, ensure_ascii=False, default=str) if datos_anteriores else None
        datos_nuevos_json = json.dumps(datos_nuevos, ensure_ascii=False, default=str) if datos_nuevos else None
        datos_cambios_json = json.dumps(datos_cambios, ensure_ascii=False, default=str) if datos_cambios else None

        # Información de la request
        endpoint = request.path if request else None
        metodo_http = request.method if request else None

        # Timestamp en zona horaria de Argentina
        fecha_hora_arg = datetime.now(TIMEZONE_ARG)

        # Auto-generar descripción si no se proporciona
        if not descripcion:
            if accion == 'INSERT':
                descripcion = f"Nuevo registro en {tabla}"
            elif accion == 'UPDATE':
                campos_cambiados = list(datos_cambios.keys()) if datos_cambios else []
                descripcion = f"Actualización en {tabla} - Campos: {', '.join(campos_cambiados)}"
            elif accion == 'DELETE':
                descripcion = f"Eliminación de registro en {tabla}"
            else:
                descripcion = f"Operación {accion} en {tabla}"

        # Insertar en auditoría
        sql = """
            INSERT INTO auditoria (
                fecha_hora,
                usuario, usuario_email, usuario_nivel, usuario_ip,
                local, caja, fecha_operacion, turno,
                accion, tabla, registro_id,
                datos_anteriores, datos_nuevos, datos_cambios,
                descripcion, endpoint, metodo_http, user_agent,
                duracion_ms, exito, error_mensaje
            ) VALUES (
                %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s
            )
        """

        cursor = conn.cursor()
        cursor.execute(sql, (
            fecha_hora_arg,
            user_info['usuario'], user_info['usuario_email'], user_info['usuario_nivel'], user_info['usuario_ip'],
            context_info['local'], context_info['caja'], context_info['fecha_operacion'], context_info['turno'],
            accion, tabla, registro_id,
            datos_anteriores_json, datos_nuevos_json, datos_cambios_json,
            descripcion, endpoint, metodo_http, user_info['user_agent'],
            duracion_ms, exito, error_mensaje
        ))
        conn.commit()  # ← CRÍTICO: Hacer commit para guardar en BD
        cursor.close()

        print(f"[AUDIT] ✓ Registrado: {accion} en {tabla} (ID:{registro_id}) por {user_info['usuario']}")

    except Exception as e:
        # No queremos que falle la operación principal si falla la auditoría
        print(f"[AUDIT] ✗ Error registrando auditoría: {e}")
        traceback.print_exc()


def obtener_registro_anterior(conn, tabla, registro_id):
    """
    Obtiene el estado actual de un registro antes de modificarlo/eliminarlo

    Args:
        conn: Conexión a la base de datos
        tabla: Nombre de la tabla
        registro_id: ID del registro

    Returns:
        Diccionario con los datos del registro, o None si no existe
    """
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(f"SELECT * FROM {tabla} WHERE id = %s", (registro_id,))
        resultado = cursor.fetchone()
        cursor.close()
        return resultado
    except Exception as e:
        print(f"[AUDIT] Error obteniendo registro anterior: {e}")
        return None


def audit_decorator(tabla, accion_override=None):
    """
    Decorador para auditar automáticamente una función

    Uso:
        @audit_decorator('tarjetas_trns', accion_override='DELETE')
        def eliminar_tarjeta(tarjeta_id):
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            inicio = time.time()
            exito = True
            error_mensaje = None
            resultado = None

            try:
                # Ejecutar la función original
                resultado = func(*args, **kwargs)
                return resultado
            except Exception as e:
                exito = False
                error_mensaje = str(e)
                raise
            finally:
                try:
                    # Calcular duración
                    duracion_ms = int((time.time() - inicio) * 1000)

                    # Intentar obtener conexión desde g (Flask global)
                    conn = getattr(g, 'db_connection', None)

                    if conn:
                        # Detectar acción automáticamente si no se especifica
                        accion = accion_override
                        if not accion:
                            if func.__name__.startswith('delete') or func.__name__.startswith('eliminar'):
                                accion = 'DELETE'
                            elif func.__name__.startswith('update') or func.__name__.startswith('actualizar'):
                                accion = 'UPDATE'
                            elif func.__name__.startswith('insert') or func.__name__.startswith('guardar') or func.__name__.startswith('crear'):
                                accion = 'INSERT'
                            else:
                                accion = 'OPERATION'

                        registrar_auditoria(
                            conn=conn,
                            accion=accion,
                            tabla=tabla,
                            descripcion=f"Ejecución de {func.__name__}",
                            exito=exito,
                            error_mensaje=error_mensaje,
                            duracion_ms=duracion_ms
                        )
                except Exception as audit_error:
                    print(f"[AUDIT] Error en decorador: {audit_error}")

        return wrapper
    return decorator


# ========================================================================
# FUNCIONES DE CONSULTA DE AUDITORÍA
# ========================================================================

def obtener_auditoria(conn, filtros=None, limit=100, offset=0):
    """
    Obtiene registros de auditoría con filtros

    Args:
        conn: Conexión a la base de datos
        filtros: Diccionario con filtros opcionales:
            - usuario: Filtrar por usuario
            - tabla: Filtrar por tabla
            - accion: Filtrar por tipo de acción
            - fecha_desde: Filtrar desde fecha
            - fecha_hasta: Filtrar hasta fecha
            - local: Filtrar por local
            - caja: Filtrar por caja
            - fecha_operacion: Filtrar por fecha de operación
            - exito: Filtrar por éxito (True/False)
        limit: Cantidad máxima de registros
        offset: Offset para paginación

    Returns:
        Lista de diccionarios con los registros de auditoría
    """
    try:
        filtros = filtros or {}

        sql = "SELECT * FROM auditoria WHERE 1=1"
        params = []

        if filtros.get('usuario'):
            sql += " AND usuario = %s"
            params.append(filtros['usuario'])

        if filtros.get('tabla'):
            sql += " AND tabla = %s"
            params.append(filtros['tabla'])

        if filtros.get('accion'):
            sql += " AND accion = %s"
            params.append(filtros['accion'])

        if filtros.get('fecha_desde'):
            sql += " AND fecha_hora >= %s"
            params.append(filtros['fecha_desde'])

        if filtros.get('fecha_hasta'):
            sql += " AND fecha_hora <= %s"
            params.append(filtros['fecha_hasta'])

        if filtros.get('local'):
            sql += " AND local = %s"
            params.append(filtros['local'])

        if filtros.get('caja'):
            sql += " AND caja = %s"
            params.append(filtros['caja'])

        if filtros.get('fecha_operacion'):
            sql += " AND fecha_operacion = %s"
            params.append(filtros['fecha_operacion'])

        if filtros.get('exito') is not None:
            sql += " AND exito = %s"
            params.append(filtros['exito'])

        sql += " ORDER BY fecha_hora DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])

        cursor = conn.cursor(dictionary=True)
        cursor.execute(sql, params)
        resultados = cursor.fetchall()
        cursor.close()

        # Parsear JSON en los resultados
        for r in resultados:
            if r.get('datos_anteriores'):
                try:
                    r['datos_anteriores'] = json.loads(r['datos_anteriores'])
                except:
                    pass
            if r.get('datos_nuevos'):
                try:
                    r['datos_nuevos'] = json.loads(r['datos_nuevos'])
                except:
                    pass
            if r.get('datos_cambios'):
                try:
                    r['datos_cambios'] = json.loads(r['datos_cambios'])
                except:
                    pass

        return resultados

    except Exception as e:
        print(f"[AUDIT] Error obteniendo auditoría: {e}")
        return []


def obtener_historial_registro(conn, tabla, registro_id):
    """
    Obtiene todo el historial de cambios de un registro específico

    Args:
        conn: Conexión a la base de datos
        tabla: Nombre de la tabla
        registro_id: ID del registro

    Returns:
        Lista de diccionarios con el historial del registro
    """
    return obtener_auditoria(conn, {
        'tabla': tabla,
        'registro_id': registro_id
    }, limit=1000)


# ========================================================================
# ENDPOINTS DE API
# ========================================================================

@tabla_auditoria_bp.route("/api/tabla_auditoria", methods=["GET"])
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


@tabla_auditoria_bp.route("/api/tabla_auditoria/historial/<tabla>/<int:registro_id>", methods=["GET"])
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


# ========================================================================
# VISTA HTML
# ========================================================================

@tabla_auditoria_bp.route("/auditoria_sistema")
@login_required
def pagina_auditoria():
    """Página web para consultar auditoría"""
    return render_template('auditoria_sistema.html')
