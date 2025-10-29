# app.py
from flask import Flask, g, redirect, url_for, request, render_template, flash, jsonify, session, Response, stream_with_context, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from functools import wraps
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from apscheduler.schedulers.background import BackgroundScheduler
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from waitress import serve
import glob
import atexit
import json
import subprocess
import shutil
import bcrypt
import os
import sys
import uuid
import time
import threading
import pickle
from itsdangerous import TimestampSigner
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename
import pytz
import time
from collections import defaultdict
import psutil
import time
import platform
import concurrent.futures
from datetime import timedelta
import random

# ========================================================================
# ===== CONFIGURACIÓN INICIAL DE LA APLICACIÓN =====
# ========================================================================

# acá, declaro la app y ni bien declaro la app ya lo que hago es crear los decoradores
# .. y funciones necesarias, con el fin de que estén disponibles para los blueprints 
# que importe luego y sea inyectable en los blueprints
# esto debe ser así ya que cargar el app.py está tardando mucho y no llega a cargar
# los decoradores antes de que los blueprints los necesiten

app = Flask(__name__)

@app.context_processor
def inject_role_level():
    try:
        lvl = get_user_level()
    except Exception:
        lvl = 1
    return {"role_level": int(lvl)}

import mysql.connector

def get_db_connection():
    return mysql.connector.connect(
        host="127.0.0.1",
        user="root",
        password="asd123",
        database="remesas"
    )

def _normalize_fecha(fecha):
    if isinstance(fecha, datetime):
        return fecha.date()
    if isinstance(fecha, date):
        return fecha
    if isinstance(fecha, str):
        try:
            return datetime.strptime(fecha, "%Y-%m-%d").date()
        except ValueError:
            return None
    return None

def get_user_level() -> int:
    """
    Devuelve el nivel del rol desde sesión.
    Asume que guardaste 'role_level' en session en el login.
    Si no, mapeá role -> level acá.
    """
    lvl = session.get('role_level')
    if lvl is not None:
        return int(lvl)
    role = (session.get('role') or '').strip().lower()
    MAP = {'cajero': 1, 'encargado': 2, 'administrativo': 2, 'auditor': 3}
    return MAP.get(role, 0)

def is_local_closed(conn, local:str, fecha) -> bool:
    cur = conn.cursor()
    cur.execute("""
        SELECT estado FROM cierres_locales
        WHERE local=%s AND fecha=%s
        LIMIT 1
    """, (local, _normalize_fecha(fecha)))
    row = cur.fetchone()
    cur.close()
    # Si no existe registro, lo consideramos abierto (estado=1)
    return (row is not None and int(row[0]) == 0)


def can_edit(conn, user_level: int, local: str, caja: str, fecha, turno: str) -> bool:
    """
    Reglas:
    - Si el LOCAL está cerrado (por día): sólo nivel 3 puede modificar.
    - Si el LOCAL está abierto:
        * Nivel 2 (o más) puede modificar aunque la CAJA esté cerrada.
        * Nivel 1 sólo puede modificar con CAJA abierta (por turno).
    """
    f = _normalize_fecha(fecha)

    # Cierre de local es global por fecha (ignora turno)
    if is_local_closed(conn, local, f):
        return user_level >= 3

    # Local abierto: L2+ puede modificar aunque la caja esté cerrada
    if user_level >= 2:
        return True

    # L1: sólo si la caja (para ese turno) está abierta
    return is_caja_abierta(conn, local, caja, f, turno)

# ==== RBAC Lectura/Escritura común ====
from flask import g, request, session, jsonify
from functools import wraps

# --- Subquery: "caja cerrada" (usa tu tabla de estado de cajas) ---
# Ajustado a: tablas "cajas_estado", columna fecha_operacion y estado=0 (cerrada).
CLOSED_BOX_SUBQUERY = """
  EXISTS (
    SELECT 1
    FROM cajas_estado cc
    WHERE cc.local = {a}.local
      AND cc.caja  = {a}.caja
      AND LOWER(cc.turno) = LOWER({a}.turno)
      AND DATE(cc.fecha_operacion) = DATE({a}.fecha)
      AND cc.id = (
        SELECT MAX(cc2.id)
        FROM cajas_estado cc2
        WHERE cc2.local = cc.local
          AND cc2.caja  = cc.caja
          AND LOWER(cc2.turno) = LOWER(cc.turno)
          AND DATE(cc2.fecha_operacion) = DATE(cc.fecha_operacion)
      )
      AND cc.estado = 0  -- el ÚLTIMO estado del día/turno es "cerrada"
  )
"""


# --- Subquery: "local cerrado" (usa tu tabla de cierres de local) ---
# Ajustado a: tabla "cierres_locales", columna fecha y estado=0 (cerrado).
CLOSED_LOCAL_SUBQUERY = """
  EXISTS (
    SELECT 1
    FROM cierres_locales cl
    WHERE cl.local = {a}.local
      AND DATE(cl.fecha) = DATE({a}.fecha)
      AND cl.turno = {a}.turno
      AND cl.estado = 0  -- 0 = cerrado
  )
"""

def _ctx_from_request():
    """Extrae contexto (local/caja/fecha/turno) desde args/JSON + session.local."""
    data = request.get_json(silent=True) or {}
    return {
        'local': session.get('local') or request.args.get('local') or data.get('local'),
        'caja':  request.args.get('caja')  or data.get('caja'),
        'fecha': request.args.get('fecha') or data.get('fecha'),
        'turno': request.args.get('turno') or data.get('turno'),
    }

def read_scope_sql(alias: str = 't') -> str:
    """
    Qué filas puede VER cada rol en endpoints de lectura (SELECT):
      - Nivel 1 (cajero): sin filtro extra → ve todo lo suyo.
      - Nivel 2 (encargado): SOLO cajas cerradas → AND CLOSED_BOX_SUBQUERY.
      - Nivel 3 (auditor): SOLO locales cerrados → AND CLOSED_LOCAL_SUBQUERY.
    """
    lvl = get_user_level()
    if lvl >= 3:
        # Auditor: solo locales cerrados
        return f" AND {CLOSED_LOCAL_SUBQUERY.format(a=alias)}"
    if lvl >= 2:
        # Encargado/Administrativo: solo cajas cerradas
        return f" AND {CLOSED_BOX_SUBQUERY.format(a=alias)}"
    # Cajero: sin filtro adicional de lectura
    return ""

def with_read_scope(alias='t'):
    """
    Decorador para endpoints GET:
      - Expone g.read_scope con el fragmento SQL de visibilidad según el rol.
    Uso:
      @app.route('/remesas_hoy')
      @login_required
      @with_read_scope('t')
      def remesas_hoy():
          sql = f\"\"\"SELECT ... FROM remesas_trns t WHERE ... {g.read_scope} ORDER BY ...\"\"\"
          ...
    """
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **k):
            g.read_scope = read_scope_sql(alias)
            return fn(*a, **k)
        return wrapper
    return deco

def require_edit_ctx(fn):
    """
    Decorador para endpoints de ESCRITURA (POST/PUT/DELETE):
      - Ensambla contexto (local, caja, fecha, turno)
      - Valida permiso con can_edit(...)
      - Si todo ok, expone g.ctx con el contexto validado.
    Uso:
      @app.route('/remesas/<int:id>', methods=['PUT'])
      @login_required
      @require_edit_ctx
      def update_remesa(id):
          # g.ctx['local'], g.ctx['caja'], g.ctx['fecha'], g.ctx['turno']
          ...
    """
    @wraps(fn)
    def wrapper(*a, **k):
        ctx = _ctx_from_request()
        if not all([ctx['local'], ctx['caja'], ctx['fecha'], ctx['turno']]):
            return jsonify(success=False, msg='falta local/caja/fecha/turno'), 400
        conn = get_db_connection()
        try:
            ok = can_edit(conn, get_user_level(), ctx['local'], ctx['caja'], ctx['fecha'], ctx['turno'])
        finally:
            conn.close()
        if not ok:
            # 409 = conflicto por estado/rol (no permitido)
            return jsonify(success=False, msg='No permitido para tu rol/estado'), 409
        g.ctx = ctx
        return fn(*a, **k)
    return wrapper

def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get('user_id'):
            # guarda next (ruta original) solo para GET HTML
            if request.method == 'GET' and request.accept_mimetypes.accept_html:
                return redirect(url_for('login', next=request.full_path))
            return jsonify(success=False, msg='Auth requerido'), 401
        return view(*args, **kwargs)
    return wrapped

def page_access_required(slug):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            pages = session.get('pages') or []
            if slug not in pages:
                return jsonify(success=False, msg=f"Sin acceso a {slug}"), 403
            return view(*args, **kwargs)
        return wrapped
    return decorator

def role_min_required(min_level:int):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            lvl = int(session.get('role_level') or 0)
            if lvl < min_level:
                return jsonify(success=False, msg='Rol insuficiente'), 403
            return view(*args, **kwargs)
        return wrapped
    return decorator
# app.py
from modules import files_gcs

# ... acá definís login_required, get_db_connection, can_edit, get_user_level, _normalize_fecha ...

files_gcs.inject_dependencies(
    login_required=login_required,
    get_db_connection=get_db_connection,
    can_edit=can_edit,
    get_user_level=get_user_level,
    _normalize_fecha_fn=_normalize_fecha,
)

from modules.files_gcs import bp_files     # ← importa el blueprint
app.register_blueprint(bp_files, url_prefix="/files")
app.secret_key = '8V#n*aQHYUt@7MdGBY0wE8f'  # Cambiar en producción
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///registros.db'
app.config['SESSION_COOKIE_SECURE'] = False  # Cambiar a True solo en producción con HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=3)  # Aumentar a 3 días
app.config['DATA_FOLDER'] = 'c:\\Users\\PROPIETARIO\\Downloads\\01.Proyectos\\form-project\\data'
db = SQLAlchemy(app)
from dotenv import load_dotenv
load_dotenv()

def init_app():
    """Inicialización de la aplicación"""
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        
        # Asegurar que el archivo users.json exista
        if not os.path.exists(USERS_FILE):
            save_json_file(USERS_FILE, [])
        
        init_admin_user()  # Crear usuarios iniciales
        create_demo_user() # Crear usuario demo
        migrar_registros()
        
        if not os.path.exists(REGISTROS_FILE):
            with open(REGISTROS_FILE, 'w', encoding='utf-8') as f:
                json.dump([], f)
            print(f"Creado nuevo archivo de registros en {REGISTROS_FILE}")
        
        init_transferencias()
        init_stock_file()  # Inicializar archivo de stock
        
        # Iniciar el sistema de backup automático
        init_backup_scheduler()
        
        print("Inicialización completada exitosamente")
    except Exception as e:
        print(f"Error en la inicialización: {str(e)}")

# ________________
# 
# 
# _________________________________________________________________________________ #



@app.route('/', endpoint='index')  # ← el endpoint pasa a llamarse "index"
@login_required
@page_access_required('index')               # ← valida el slug que ya tienen tus usuarios
def nuevo_registro():
    local = session.get('local')
    conn = get_db_connection()
    cur = conn.cursor()

    # cajas
    cur.execute("SELECT cantidad_cajas FROM locales WHERE local = %s LIMIT 1", (local,))
    row = cur.fetchone()
    cantidad_cajas = row[0] if row else 1

    # turnos habilitados para este local
    cur.execute("SELECT turnos FROM locales WHERE local = %s", (local,))
    turnos = [r[0] for r in cur.fetchall()] or ['UNI']

    cur.close(); conn.close()
    return render_template('index.html', cantidad_cajas=cantidad_cajas, turnos=turnos)



# __________________________________REMESAS__________________________________________#
# =========================== REMESAS (turno + usuario) ============================

# =========================== REMESAS (turno + usuario) ============================
# ===============================
# REMESAS – LECTURAS (GET)
# ===============================
# Quita cualquier @with_read_scope acá
@app.route('/remesas_no_retiradas')
@login_required
def remesas_no_retiradas():
    caja   = request.args.get("caja")
    local  = session.get("local") or request.args.get("local")
    turno  = request.args.get("turno")  # opcional (si lo querés usar)
    lvl    = get_user_level()

    if not (caja and local):
        return jsonify([])

    conn = get_db_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        # Base: todas las no retiradas de esa caja/local (sin fecha)
        extra_sql = ""
        params = [caja, local]

        # L3: solo locales cerrados (por fecha/turno de cada fila)
        if lvl >= 3:
            extra_sql = """
              AND EXISTS (
                SELECT 1 FROM cierres_locales cl
                WHERE cl.local = t.local
                  AND DATE(cl.fecha) = DATE(t.fecha)
                  AND LOWER(cl.turno) = LOWER(t.turno)
                  AND cl.estado = 0
              )
            """
        # L2: sin filtro extra (debe verlas para poder marcarlas)
        # L1: sin filtro extra (pero backend/JS le bloquean edición si caja cerrada)

        # (opcional) si querés además filtrar por turno de selección actual:
        # if turno:
        #     extra_sql += " AND LOWER(t.turno) = LOWER(%s)"
        #     params.append(turno)

        sql = f"""
          SELECT t.id, t.nro_remesa, t.precinto, t.monto, t.retirada, t.retirada_por, t.fecha, t.turno
          FROM remesas_trns t
          WHERE t.retirada='No'
            AND t.caja=%s
            AND t.local=%s
            {extra_sql}
          ORDER BY t.id ASC
        """
        cur.execute(sql, tuple(params))
        return jsonify(cur.fetchall())
    except Exception as e:
        print("❌ remesas_no_retiradas:", e)
        return jsonify([])
    finally:
        try: cur.close()
        except: ...
        conn.close()


@app.route('/remesas_hoy')
@login_required
@with_read_scope('t')
def remesas_hoy():
    caja  = request.args.get("caja")
    local = session.get("local") or request.args.get("local")
    fecha = request.args.get("fecha")
    turno = request.args.get("turno")
    if not (caja and local and fecha and turno):
        return jsonify([])

    conn = get_db_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        sql = f"""
          SELECT t.id, t.fecha, t.nro_remesa, t.precinto, t.monto, t.retirada, t.retirada_por, t.ult_mod, t.turno, t.local, t.caja
          FROM remesas_trns t
          WHERE t.caja=%s AND DATE(t.fecha)=%s AND t.local=%s AND t.turno=%s
            AND t.retirada='Sí'
            {g.read_scope}   -- L2: cajas cerradas (match tolerante). L3: locales cerrados.
          ORDER BY t.id ASC
        """
        cur.execute(sql, (caja, _normalize_fecha(fecha), local, turno))
        return jsonify(cur.fetchall())
    finally:
        cur.close(); conn.close()


# ===============================
# REMESAS – ALTAS (POST)
# ===============================

@app.route('/guardar_remesas_lote', methods=['POST'])
@login_required
@require_edit_ctx  # valida can_edit con (local,caja,fecha,turno) del body + session
def remesas_guardar_lote():
    """
    Body:
    {
      "caja": "Caja 1",
      "fecha": "2025-07-21",
      "turno": "UNI",
      "remesas": [
        {
          "nro_remesa": "...",
          "precinto": "...",
          "monto": "12.345,67" | 12345.67,
          "retirada": "Sí"|"No",
          "retirada_por": "Nombre",
          "fecha_retirada": "YYYY-MM-DD"   # opcional
        }, ...
      ]
    }
    """
    data    = request.get_json() or {}
    remesas = data.get('remesas') or []
    if not remesas:
        return jsonify(success=False, msg="No se recibieron remesas."), 400

    ctx     = g.ctx   # ← lo armó require_edit_ctx
    local   = ctx['local']
    caja    = ctx['caja']
    fecha   = _normalize_fecha(ctx['fecha'])
    turno   = ctx['turno']
    usuario = session.get('username')

    conn = get_db_connection()
    cur  = conn.cursor()
    try:
        sql = """
          INSERT INTO remesas_trns
          (usuario, local, caja, turno, fecha, nro_remesa, precinto, monto, retirada, retirada_por, fecha_retirada, ult_mod, estado)
          VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW(),'revision')
        """
        inserted = 0
        for t in remesas:
            nro_remesa   = (t.get('nro_remesa') or "").strip()
            precinto     = (t.get('precinto') or "").strip()

            # monto saneado
            monto_str = str(t.get('monto', '0')).replace('.', '').replace(',', '.')
            try:   monto = float(monto_str or 0)
            except: monto = 0.0

            retirada     = (t.get('retirada') or "No").strip()
            retirada_por = (t.get('retirada_por') or "").strip()
            f_ret        = t.get('fecha_retirada')
            fecha_ret    = _normalize_fecha(f_ret) if f_ret else None

            cur.execute(sql, (usuario, local, caja, turno, fecha,
                              nro_remesa, precinto, monto, retirada, retirada_por, fecha_ret))
            inserted += cur.rowcount

        conn.commit()
        return jsonify(success=True, inserted=inserted, msg="Remesas guardadas correctamente.")
    except Exception as e:
        conn.rollback()
        print("❌ ERROR al guardar remesas:", e)
        return jsonify(success=False, msg=str(e)), 500
    finally:
        try: cur.close()
        except: ...
        conn.close()


# ===============================
# REMESAS – UPDATE puntuales
# ===============================

@app.route("/actualizar_retirada", methods=["POST"])
@login_required
def remesas_actualizar_retirada():
    """
    Body: { "id": 123, "retirada": "Sí"|"No", "retirada_por": "...", "fecha_retirada": "YYYY-MM-DD" (opcional) }
    """
    data = request.get_json() or {}
    remesa_id        = data.get('id')
    nueva_retirada   = (data.get('retirada') or '').strip() or None
    retirada_por     = (data.get('retirada_por') or '').strip()
    fecha_retirada_s = data.get('fecha_retirada')

    if not remesa_id:
        return jsonify(success=False, msg="Falta id"), 400
    if nueva_retirada not in ('Sí', 'No'):
        return jsonify(success=False, msg="Valor de 'retirada' inválido"), 400

    conn = get_db_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT id, local, caja, fecha, turno FROM remesas_trns WHERE id=%s", (remesa_id,))
        row = cur.fetchone()
        if not row:
            return jsonify(success=False, msg="No existe la remesa"), 404

        if not can_edit(conn, get_user_level(), row['local'], row['caja'], row['fecha'], row['turno']):
            return jsonify(success=False, msg="No permitido (caja/local cerrados para tu rol)"), 409

        fecha_retirada = _normalize_fecha(fecha_retirada_s) if fecha_retirada_s else None

        cur2 = conn.cursor()
        cur2.execute("""
            UPDATE remesas_trns
               SET retirada=%s,
                   retirada_por=%s,
                   fecha_retirada = COALESCE(%s, fecha_retirada),
                   ult_mod=NOW()
             WHERE id=%s
        """, (nueva_retirada, retirada_por, fecha_retirada, remesa_id))
        conn.commit()
        return jsonify(success=True, updated=cur2.rowcount)
    except Exception as e:
        conn.rollback()
        print("❌ actualizar_retirada:", e)
        return jsonify(success=False, msg=str(e)), 500
    finally:
        try: cur.close()
        except: ...
        conn.close()


@app.route('/remesas/<int:remesa_id>', methods=['PUT'])
@login_required
def remesas_update(remesa_id):
    """
    Body (opcional por campo): { nro_remesa, precinto, monto, retirada, retirada_por, fecha_retirada }
    """
    data = request.get_json() or {}

    conn = get_db_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        # contexto real → para can_edit
        cur.execute("SELECT id, local, caja, fecha, turno FROM remesas_trns WHERE id=%s", (remesa_id,))
        row = cur.fetchone()
        if not row:
            return jsonify(success=False, msg="No existe la remesa"), 404

        if not can_edit(conn, get_user_level(), row['local'], row['caja'], row['fecha'], row['turno']):
            return jsonify(success=False, msg="No permitido (caja/local cerrados para tu rol)"), 409

        sets, params = [], []

        def add(col, val):
            sets.append(f"{col}=%s")
            params.append(val)

        if 'nro_remesa' in data:
            add("nro_remesa", (data.get('nro_remesa') or "").strip())
        if 'precinto' in data:
            add("precinto", (data.get('precinto') or "").strip())
        if 'monto' in data:
            m = str(data.get('monto', '0')).replace('.', '').replace(',', '.')
            try: add("monto", float(m or 0))
            except: return jsonify(success=False, msg="Monto inválido"), 400
        if 'retirada' in data:
            r = (data.get('retirada') or "").strip()
            if r not in ('Sí', 'No'): return jsonify(success=False, msg="retirada inválida"), 400
            add("retirada", r)
        if 'retirada_por' in data:
            add("retirada_por", (data.get('retirada_por') or "").strip())
        if 'fecha_retirada' in data:
            f = data.get('fecha_retirada')
            add("fecha_retirada", _normalize_fecha(f) if f else None)

        if not sets:
            return jsonify(success=False, msg="Sin cambios"), 400

        sets.append("ult_mod=NOW()")
        sql = f"UPDATE remesas_trns SET {', '.join(sets)} WHERE id=%s"
        params.append(remesa_id)

        cur2 = conn.cursor()
        cur2.execute(sql, tuple(params))
        conn.commit()
        return jsonify(success=True, updated=cur2.rowcount)
    except Exception as e:
        conn.rollback()
        print("❌ remesas_update:", e)
        return jsonify(success=False, msg=str(e)), 500
    finally:
        try: cur.close()
        except: ...
        conn.close()


@app.route('/remesas/<int:remesa_id>', methods=['DELETE'])
@login_required
def remesas_delete(remesa_id):
    conn = get_db_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT id, local, caja, fecha, turno FROM remesas_trns WHERE id=%s", (remesa_id,))
        row = cur.fetchone()
        if not row:
            return jsonify(success=False, msg="No existe la remesa"), 404

        if not can_edit(conn, get_user_level(), row['local'], row['caja'], row['fecha'], row['turno']):
            return jsonify(success=False, msg="No permitido (caja/local cerrados para tu rol)"), 409

        cur2 = conn.cursor()
        cur2.execute("DELETE FROM remesas_trns WHERE id=%s", (remesa_id,))
        conn.commit()
        return jsonify(success=True, deleted=cur2.rowcount)
    except Exception as e:
        conn.rollback()
        print("❌ remesas_delete:", e)
        return jsonify(success=False, msg=str(e)), 500
    finally:
        try: cur.close()
        except: ...
        conn.close()


    # _________________________________________ tarjetas ____________________-
# =========================
#  TARJETAS (helpers + API)
# =========================
# ----------------------------------------------
# TARJETAS (con TURNO + USUARIO en todas las ops)
# ----------------------------------------------
from datetime import datetime, date
from flask import request, jsonify, session

# ------------ Helpers comunes ------------


def is_caja_abierta(conn, local, caja, fecha, turno):
    """Caja abierta para (local, caja, fecha, turno). Si no hay fila => abierta."""
    fecha = _normalize_fecha(fecha)
    cur = conn.cursor()
    cur.execute("""
        SELECT estado
          FROM cajas_estado
         WHERE local=%s AND caja=%s AND fecha_operacion=%s AND turno=%s
    """, (local, caja, fecha, turno))
    row = cur.fetchone()
    cur.close()
    return (row is None) or (row[0] is None) or (int(row[0]) == 1)
# ____________________________ TARJETAS__________________________________
# ---------- Mapeo de columnas de tips ----------
def _tip_col_from_tarjeta(nombre):
    n = (nombre or "").strip().upper()
    n = (n.replace("É","E").replace("Á","A").replace("Í","I").replace("Ó","O").replace("Ú","U"))
    if n == "VISA": return "visa_tips"
    if n in ("VISA DEBITO","VISA DÉBITO"): return "visa_debito_tips"
    if n == "VISA PREPAGO": return "visa_prepago_tips"              # ← NUEVO
    if n == "MASTERCARD": return "mastercard_tips"
    if n in ("MASTERCARD DEBITO","MASTERCARD DÉBITO"): return "mastercard_debito_tips"
    if n == "MASTERCARD PREPAGO": return "mastercard_prepago_tips"  # ← NUEVO
    if n == "CABAL": return "cabal_tips"
    if n in ("CABAL DEBITO","CABAL DÉBITO"): return "cabal_debito_tips"
    if n == "AMEX": return "amex_tips"
    if n == "MAESTRO": return "maestro_tips"
    if n == "NARANJA": return "naranja_tips"                        # ← NUEVO
    if n in ("DINERS","DINER"): return "diners_tips"                # ← NUEVO
    if n == "PAGOS INMEDIATOS": return "pagos_inmediatos_tips"
    return None

_ALL_TIP_COLS = [
    "visa_tips","visa_debito_tips","visa_prepago_tips",            # ← NUEVO
    "mastercard_tips","mastercard_debito_tips","mastercard_prepago_tips",  # ← NUEVO
    "cabal_tips","cabal_debito_tips","amex_tips","maestro_tips",
    "naranja_tips","diners_tips",                                  # ← NUEVO
    "pagos_inmediatos_tips"
]

# ----------------------------------------------------------------------
# GUARDAR LOTE (Tarjetas) — usa @require_edit_ctx → can_edit(L1/L2/L3)
# ----------------------------------------------------------------------
@app.route('/guardar_tarjetas_lote', methods=['POST'])
@login_required
@require_edit_ctx
def guardar_tarjetas_lote():
    data     = request.get_json() or {}
    tarjetas = data.get('tarjetas', [])
    if not tarjetas:
        return jsonify(success=False, msg="No se recibieron tarjetas"), 400

    ctx     = g.ctx  # require_edit_ctx ya validó permisos y normalizó fecha
    local   = ctx['local']
    caja    = ctx['caja']
    fecha   = ctx['fecha']
    turno   = ctx['turno']
    usuario = session.get('username')

    try:
        conn = get_db_connection()
        cur  = conn.cursor()
        sql = """
            INSERT INTO tarjetas_trns
            (usuario, local, caja, turno, tarjeta, terminal, lote, monto, fecha, estado)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'revision')
        """
        inserted = 0
        for t in tarjetas:
            tarjeta   = (t.get('tarjeta') or "").strip()
            lote      = (t.get('lote') or "").strip()
            terminal  = (t.get('terminal') or "").strip()
            monto_str = str(t.get('monto', '0')).replace(".", "").replace(",", ".")
            try:
                monto = float(monto_str or 0)
            except Exception:
                monto = 0.0
            if not (tarjeta and lote and terminal):
                continue
            cur.execute(sql, (usuario, local, caja, turno, tarjeta, terminal, lote, monto, fecha))
            inserted += cur.rowcount

        conn.commit()
        cur.close(); conn.close()
        return jsonify(success=True, msg="Tarjetas guardadas correctamente.", inserted=inserted)
    except Exception as e:
        print("❌ ERROR al guardar tarjetas:", e)
        return jsonify(success=False, msg=f"Error al guardar tarjetas: {e}"), 500

# ----------------------------------------------------------------------
# LISTADO (Tarjetas + TIP por fila) — con @with_read_scope('t')
# L2: sólo “cajas cerradas” por ÚLTIMO estado del día/turno
# L3: sólo “locales cerrados”
# ----------------------------------------------------------------------
# ----------------------------------------------------------------------
# LISTADO (Tarjetas + TIP por fila) — con @with_read_scope('t')
# L2: sólo “cajas cerradas” por ÚLTIMO estado del día/turno
# L3: sólo “locales cerrados”
# ----------------------------------------------------------------------
@app.route("/tarjetas_cargadas_hoy")
@login_required
@with_read_scope('t')  # inyecta g.read_scope usando CLOSED_BOX_SUBQUERY/CLOSED_LOCAL_SUBQUERY
def tarjetas_cargadas_hoy():
    caja      = request.args.get("caja")
    fecha_str = request.args.get("fecha")
    turno     = request.args.get("turno")
    local     = session.get('local') or request.args.get('local')

    if not (caja and fecha_str and turno and local):
        return jsonify([])

    fecha = _normalize_fecha(fecha_str)
    if not fecha:
        return jsonify([])

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # ⬇️ CASE extendido para contemplar nuevas tarjetas de TIPS
        case_tip = """
            CASE
                WHEN t.tarjeta='VISA' THEN COALESCE(tt.visa_tips,0)
                WHEN t.tarjeta IN ('VISA DÉBITO','VISA DEBITO') THEN COALESCE(tt.visa_debito_tips,0)
                WHEN t.tarjeta='VISA PREPAGO' THEN COALESCE(tt.visa_prepago_tips,0)

                WHEN t.tarjeta='MASTERCARD' THEN COALESCE(tt.mastercard_tips,0)
                WHEN t.tarjeta IN ('MASTERCARD DÉBITO','MASTERCARD DEBITO') THEN COALESCE(tt.mastercard_debito_tips,0)
                WHEN t.tarjeta='MASTERCARD PREPAGO' THEN COALESCE(tt.mastercard_prepago_tips,0)

                WHEN t.tarjeta='CABAL' THEN COALESCE(tt.cabal_tips,0)
                WHEN t.tarjeta IN ('CABAL DÉBITO','CABAL DEBITO') THEN COALESCE(tt.cabal_debito_tips,0)

                WHEN t.tarjeta='AMEX' THEN COALESCE(tt.amex_tips,0)
                WHEN t.tarjeta='MAESTRO' THEN COALESCE(tt.maestro_tips,0)
                WHEN t.tarjeta='NARANJA' THEN COALESCE(tt.naranja_tips,0)
                WHEN t.tarjeta='DINERS' THEN COALESCE(tt.diners_tips,0)
                WHEN t.tarjeta='PAGOS INMEDIATOS' THEN COALESCE(tt.pagos_inmediatos_tips,0)
                ELSE 0
            END AS tip
        """

        sql = f"""
            SELECT t.id, t.tarjeta, t.terminal, t.lote, t.monto, {case_tip}
              FROM tarjetas_trns t
              LEFT JOIN tips_tarjetas tt
                ON tt.local    = %s
               AND tt.caja     = t.caja
               AND DATE(tt.fecha) = DATE(t.fecha)
               AND tt.turno    = t.turno
               AND tt.terminal = t.terminal
               AND tt.lote     = t.lote
             WHERE t.local=%s AND t.caja=%s AND DATE(t.fecha)=%s AND t.turno=%s
               {g.read_scope}   -- L2/L3 según reglas
             ORDER BY t.terminal, t.lote, t.tarjeta, t.id
        """
        cursor.execute(sql, (local, local, caja, fecha, turno))
        resultados = cursor.fetchall()
        cursor.close(); conn.close()
        return jsonify(resultados)
    except Exception as e:
        print("❌ ERROR al consultar tarjetas cargadas:", e)
        return jsonify([])


# ----------------------------------------------------------------------
# UPDATE (Tarjeta) — can_edit en base a la fila (rol + caja/local)
# ----------------------------------------------------------------------
@app.route("/tarjetas/<int:tarjeta_id>", methods=["PUT"])
@login_required
def actualizar_tarjeta(tarjeta_id):
    data = request.get_json() or {}
    nuevo_monto = data.get("monto")
    if nuevo_monto is None:
        return jsonify(success=False, msg="Falta 'monto'"), 400

    try:
        nuevo_monto = float(str(nuevo_monto).replace(".", "").replace(",", "."))
    except Exception:
        return jsonify(success=False, msg="Monto inválido"), 400

    try:
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)
        cur.execute("SELECT id, local, caja, fecha, turno FROM tarjetas_trns WHERE id=%s", (tarjeta_id,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return jsonify(success=False, msg="Registro no encontrado"), 404

        # Permisos L1/L2/L3 idénticos a remesas/MP
        if not can_edit(conn, get_user_level(), row['local'], row['caja'], row['fecha'], row['turno']):
            cur.close(); conn.close()
            return jsonify(success=False, msg="No permitido (caja/local cerrados para tu rol)"), 409

        cur2 = conn.cursor()
        cur2.execute("UPDATE tarjetas_trns SET monto=%s WHERE id=%s", (nuevo_monto, tarjeta_id))
        conn.commit()
        cur2.close(); cur.close(); conn.close()
        return jsonify(success=True)
    except Exception as e:
        print("❌ ERROR al actualizar tarjeta:", e)
        return jsonify(success=False, msg=f"Error al actualizar tarjeta: {e}"), 500

# ----------------------------------------------------------------------
# DELETE en bloque (tarjetas + tips del grupo) — usa can_edit con la fila
# ----------------------------------------------------------------------
@app.route("/tarjetas/<int:tarjeta_id>", methods=["DELETE"])
@login_required
def borrar_tarjeta(tarjeta_id):
    try:
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT id, local, caja, fecha, turno, terminal, lote
              FROM tarjetas_trns
             WHERE id=%s
        """, (tarjeta_id,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return jsonify(success=False, msg="Registro no encontrado"), 404

        if not can_edit(conn, get_user_level(), row['local'], row['caja'], row['fecha'], row['turno']):
            cur.close(); conn.close()
            return jsonify(success=False, msg="No permitido (caja/local cerrados para tu rol)"), 409

        cur2 = conn.cursor()
        # tarjetas
        cur2.execute("""
            DELETE FROM tarjetas_trns
             WHERE local=%s AND caja=%s AND DATE(fecha)=%s AND turno=%s AND terminal=%s AND lote=%s
        """, (row['local'], row['caja'], _normalize_fecha(row['fecha']), row['turno'], row['terminal'], row['lote']))
        # tips
        cur2.execute("""
            DELETE FROM tips_tarjetas
             WHERE local=%s AND caja=%s AND DATE(fecha)=%s AND turno=%s AND terminal=%s AND lote=%s
        """, (row['local'], row['caja'], _normalize_fecha(row['fecha']), row['turno'], row['terminal'], row['lote']))

        eliminadas = cur2.rowcount
        conn.commit()
        cur2.close(); cur.close(); conn.close()
        return jsonify(success=True, deleted=eliminadas)
    except Exception as e:
        print("❌ ERROR al borrar tarjetas/tips (bloque):", e)
        return jsonify(success=False, msg=f"Error al borrar: {e}"), 500

# =========================
#  TIPS DE TARJETAS - API
# =========================

# UPDATE puntual de un TIP — valida con @require_edit_ctx (rol + estado)
@app.route("/tarjetas/tip", methods=["PUT"])
@login_required
@require_edit_ctx
def actualizar_tip_tarjeta():
    data     = request.get_json() or {}
    ctx      = g.ctx  # local/caja/fecha/turno validados y normalizados
    local    = ctx['local']
    caja     = ctx['caja']
    fecha    = ctx['fecha']
    turno    = ctx['turno']

    usuario  = session.get("username")
    terminal = data.get("terminal")
    lote     = data.get("lote")
    tarjeta  = data.get("tarjeta")
    tip_raw  = data.get("tip", 0)

    if not all([terminal, lote, tarjeta]):
        return jsonify(success=False, msg="Faltan parámetros (terminal/lote/tarjeta)"), 400

    try:
        tip_val = float(str(tip_raw).replace(".", "").replace(",", "."))
    except Exception:
        tip_val = 0.0

    col = _tip_col_from_tarjeta(tarjeta)
    if not col:
        return jsonify(success=False, msg="Tarjeta no soportada para TIP"), 400

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # asegurar fila
        cur.execute(f"""
            INSERT INTO tips_tarjetas
                (usuario, local, caja, turno, terminal, lote, fecha, {", ".join(_ALL_TIP_COLS)})
            VALUES (%s,%s,%s,%s,%s,%s,%s,{",".join(["0"]*len(_ALL_TIP_COLS))})
            ON DUPLICATE KEY UPDATE local=local
        """, (usuario, local, caja, turno, terminal, lote, fecha))

        # actualizar solo la columna del TIP
        cur.execute(f"""
            UPDATE tips_tarjetas
               SET {col}=%s
             WHERE local=%s AND caja=%s AND turno=%s AND terminal=%s AND lote=%s AND DATE(fecha)=%s
        """, (tip_val, local, caja, turno, terminal, lote, fecha))

        conn.commit()
        cur.close(); conn.close()
        return jsonify(success=True)
    except Exception as e:
        print("❌ ERROR actualizar_tip_tarjeta:", e)
        return jsonify(success=False, msg=str(e)), 500

@app.post("/guardar_tips_tarjetas_lote")
@login_required
@require_edit_ctx
def guardar_tips_tarjetas_lote():
    data   = request.get_json() or {}
    grupos = data.get("grupos", []) or []
    if not grupos:
        return jsonify(success=False, msg="Faltan datos (grupos)"), 400

    ctx     = g.ctx
    local   = ctx['local']
    caja    = ctx['caja']
    fecha   = ctx['fecha']
    turno   = ctx['turno']
    usuario = session.get("username")

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        for grp in grupos:  # <-- NO usar 'g' aquí
            terminal = (grp.get("terminal") or "").strip()
            lote     = (grp.get("lote") or "").strip()
            tips_dict= grp.get("tips", {}) or {}
            estado   = "revision"
            if not (terminal and lote):
                continue

            valores = {c: 0.0 for c in _ALL_TIP_COLS}
            for nombre_tarj, monto in tips_dict.items():
                col = _tip_col_from_tarjeta(nombre_tarj)
                if not col:
                    continue
                try:
                    monto_f = float(str(monto).replace(".", "").replace(",", "."))
                except Exception:
                    monto_f = 0.0
                valores[col] = valores.get(col, 0.0) + (monto_f or 0.0)

            if all(v == 0 for v in valores.values()):
                continue

            cols_part    = ", ".join(_ALL_TIP_COLS)
            placeholders = ", ".join(["%s"] * len(_ALL_TIP_COLS))
            update_part  = ", ".join([f"{c}={c}+VALUES({c})" for c in _ALL_TIP_COLS])

            sql = f"""
                INSERT INTO tips_tarjetas
                  (usuario, local, caja, turno, terminal, lote, fecha, {cols_part}, estado)
                VALUES
                  (%s,%s,%s,%s,%s,%s,%s,{placeholders},%s)
                ON DUPLICATE KEY UPDATE
                  {update_part}
            """
            cur.execute(sql, (
                usuario, local, caja, turno, terminal, lote, fecha,
                *[valores[c] for c in _ALL_TIP_COLS], estado
            ))

        conn.commit()
        cur.close(); conn.close()
        return jsonify(success=True)
    except Exception as e:
        print("❌ ERROR guardar_tips_tarjetas_lote:", e)
        return jsonify(success=False, msg=f"Error al guardar TIPS: {e}"), 500


# Lectura de TIPS — con @with_read_scope('tt') para aplicar visibilidad L2/L3
@app.get("/tips_tarjetas_cargados")
@login_required
@with_read_scope('tt')
def tips_tarjetas_cargados():
    caja   = request.args.get("caja")
    fecha  = request.args.get("fecha")
    turno  = request.args.get("turno")
    local  = session.get("local")

    if not (caja and fecha and turno and local):
        return jsonify([])

    try:
        conn = get_db_connection()
        cur = conn.cursor(dictionary=True)
        sql = f"""
            SELECT tt.terminal, tt.lote, {", ".join(_ALL_TIP_COLS)}
              FROM tips_tarjetas tt
             WHERE tt.local=%s AND tt.caja=%s AND tt.turno=%s AND DATE(tt.fecha)=%s
               {g.read_scope}   -- L2/L3 según reglas
             ORDER BY tt.terminal, tt.lote
        """
        cur.execute(sql, (local, caja, turno, _normalize_fecha(fecha)))
        rows = cur.fetchall()
        cur.close(); conn.close()
        return jsonify(rows or [])
    except Exception as e:
        print("❌ ERROR tips_tarjetas_cargados:", e)
        return jsonify([])

    #____________________________________RAPPI_______________________________

# =================== R A P P I  (API con TURNOS) ===================
# ===== Rappi =====

@app.route('/guardar_rappi_lote', methods=['POST'])
@login_required
@require_edit_ctx  # usa local/caja/fecha/turno del body y valida can_edit
def guardar_rappi_lote():
    data = request.get_json() or {}
    transacciones = data.get('transacciones', []) or []

    if not transacciones:
        return jsonify(success=False, msg="No se recibieron transacciones"), 400

    # Contexto validado por el decorador
    ctx     = g.ctx
    local   = ctx['local']
    caja    = ctx['caja']
    fecha   = _normalize_fecha(ctx['fecha'])
    turno   = ctx['turno']
    usuario = session.get('username') or 'sistema'

    try:
        conn = get_db_connection()
        cur  = conn.cursor()

        sql = """
            INSERT INTO rappi_trns (usuario, caja, transaccion, monto, fecha, local, turno, estado)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'revision')
        """

        inserted = 0
        for t in transacciones:
            transaccion = (t.get('transaccion') or "").strip()
            m = t.get('monto', 0)
            try:
                if isinstance(m, str):
                    m = float(m.replace('.', '').replace(',', '.'))
                monto = float(m or 0)
            except Exception:
                monto = 0.0

            cur.execute(sql, (usuario, caja, transaccion, monto, fecha, local, turno))
            inserted += cur.rowcount

        conn.commit()
        cur.close(); conn.close()
        return jsonify(success=True, inserted=inserted, msg="Rappi guardado correctamente.")
    except Exception as e:
        print("❌ ERROR guardar_rappi_lote:", e)
        return jsonify(success=False, msg=str(e)), 500


# ===============================
# Rappi – LECTURA (GET)
# ===============================
@app.route('/rappi_cargadas')
@login_required
@with_read_scope('t')  # agrega g.read_scope acorde al nivel (L2: cajas cerradas; L3: locales cerrados)
def rappi_cargadas():
    local = session.get('local') or request.args.get('local')
    caja  = request.args.get('caja')
    fecha = request.args.get('fecha')
    turno = request.args.get('turno')

    if not (local and caja and fecha and turno):
        return jsonify(success=True, datos=[])

    try:
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)
        sql = f"""
            SELECT t.id, t.transaccion, t.monto, t.fecha, t.turno
              FROM rappi_trns t
             WHERE t.local=%s
               AND t.caja=%s
               AND t.turno=%s
               AND DATE(t.fecha)=%s
               {g.read_scope}   -- L2/L3 pueden ver aun con cierres
             ORDER BY t.id ASC
        """
        cur.execute(sql, (local, caja, turno, _normalize_fecha(fecha)))
        datos = cur.fetchall()
        cur.close(); conn.close()
        return jsonify(success=True, datos=datos)
    except Exception as e:
        print("❌ ERROR rappi_cargadas:", e)
        return jsonify(success=False, msg=str(e)), 500


# ===============================
# Rappi – UPDATE (PUT)
# ===============================
@app.route('/rappi/<int:rappi_id>', methods=['PUT'])
@login_required
def actualizar_rappi(rappi_id):
    data = request.get_json() or {}
    transaccion = (data.get('transaccion') or "").strip()

    try:
        imp = data.get('monto', 0)
        if isinstance(imp, str):
            imp = float(imp.replace('.', '').replace(',', '.'))
        importe = float(imp or 0)
    except Exception:
        return jsonify(success=False, msg="Monto inválido"), 400

    try:
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)
        cur.execute("SELECT id, local, caja, fecha, turno FROM rappi_trns WHERE id=%s", (rappi_id,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return jsonify(success=False, msg="Registro no encontrado"), 404

        # Permisos por nivel/estado (L1/L2/L3)
        if not can_edit(conn, get_user_level(), row['local'], row['caja'], row['fecha'], row['turno']):
            cur.close(); conn.close()
            return jsonify(success=False, msg="No permitido (caja/local cerrados para tu rol)"), 409

        cur2 = conn.cursor()
        cur2.execute("""
            UPDATE rappi_trns
               SET transaccion=%s, monto=%s
             WHERE id=%s
        """, (transaccion, importe, rappi_id))
        conn.commit()
        cur2.close(); cur.close(); conn.close()
        return jsonify(success=True)
    except Exception as e:
        print("❌ ERROR actualizar_rappi:", e)
        return jsonify(success=False, msg=str(e)), 500


# ===============================
# Rappi – DELETE
# ===============================
@app.route('/rappi/<int:rappi_id>', methods=['DELETE'])
@login_required
def borrar_rappi(rappi_id):
    try:
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)
        cur.execute("SELECT id, local, caja, fecha, turno FROM rappi_trns WHERE id=%s", (rappi_id,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return jsonify(success=False, msg="Registro no encontrado"), 404

        if not can_edit(conn, get_user_level(), row['local'], row['caja'], row['fecha'], row['turno']):
            cur.close(); conn.close()
            return jsonify(success=False, msg="No permitido (caja/local cerrados para tu rol)"), 409

        cur2 = conn.cursor()
        cur2.execute("DELETE FROM rappi_trns WHERE id=%s", (rappi_id,))
        conn.commit()
        deleted = cur2.rowcount
        cur2.close(); cur.close(); conn.close()
        return jsonify(success=True, deleted=deleted)
    except Exception as e:
        print("❌ ERROR borrar_rappi:", e)
        return jsonify(success=False, msg=str(e)), 500

## __________________________________ PEDIDOS YA _______________________________________
# ---------------------------
#  PEDIDOSYA (API)
# ---------------------------
# ---------------------------
#  PEDIDOSYA (API) con TURNO
# ---------------------------

# Usa tu _normalize_fecha ya definido en tu app.
# Aquí lo invocamos tal como lo tenés en otras secciones.

def is_caja_abierta_turno(conn, local, caja, fecha, turno="UNI"):
    """
    True si la caja/turno está ABIERTA para (local, caja, fecha, turno).
    Si no hay fila en cajas_estado => se considera ABIERTA (True).
    """
    turno = (turno or "UNI").upper()
    f = _normalize_fecha(fecha)
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT estado
              FROM cajas_estado
             WHERE local=%s AND caja=%s AND fecha_operacion=%s AND turno=%s
             LIMIT 1
        """, (local, caja, f, turno))
        row = cur.fetchone()
        # abierta si no hay fila o estado=1; cerrada si estado=0
        return (row is None) or (row[0] is None) or (int(row[0]) == 1)
    finally:
        cur.close()

# ===== PedidosYa =====
# Requiere utilidades ya presentes en tu app:
# - get_db_connection()
# - _normalize_fecha()
# - can_edit(conn, user_level, local, caja, fecha, turno) -> bool
# - get_user_level() -> int
# - require_edit_ctx: valida permisos de escritura y expone g.ctx = {local,caja,fecha,turno}
# - with_read_scope(alias): expone g.read_scope para filtrar según rol (L1/L2/L3)
# - login_required

# ===============================
# PedidosYa – CREAR (lote)
# ===============================
@app.route('/guardar_pedidosya_lote', methods=['POST'])
@login_required
@require_edit_ctx  # valida permisos y deja g.ctx con {local,caja,fecha,turno}
def guardar_pedidosya_lote():
    """
    Body:
    {
      "caja": "Caja 1",
      "fecha": "YYYY-MM-DD",
      "turno": "DIA" | "NOCHE" | "UNI",
      "transacciones": [{ "transaccion":"abc", "monto":"1.234,56" }, ...]
    }
    """
    data = request.get_json() or {}
    transacciones = data.get('transacciones', []) or []

    if not transacciones:
        return jsonify(success=False, msg="No se recibieron transacciones"), 400

    ctx     = g.ctx
    local   = ctx['local']
    caja    = ctx['caja']
    fecha   = _normalize_fecha(ctx['fecha'])
    turno   = (ctx['turno'] or 'UNI').upper()
    usuario = session.get('username') or 'sistema'

    try:
        conn = get_db_connection()
        cur  = conn.cursor()

        sql = """
            INSERT INTO pedidosya_trns (usuario, local, caja, turno, transaccion, monto, fecha, estado)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'revision')
        """

        inserted = 0
        for t in transacciones:
            transaccion = (t.get('transaccion') or "").strip()
            m = t.get('monto', 0)
            try:
                if isinstance(m, str):
                    m = float(m.replace('.', '').replace(',', '.'))
                monto = float(m or 0)
            except Exception:
                monto = 0.0

            cur.execute(sql, (usuario, local, caja, turno, transaccion, monto, fecha))
            inserted += cur.rowcount

        conn.commit()
        cur.close(); conn.close()
        return jsonify(success=True, inserted=inserted, msg="PedidosYa guardado correctamente.")
    except Exception as e:
        print("❌ ERROR guardar_pedidosya_lote:", e)
        return jsonify(success=False, msg=str(e)), 500


# ===============================
# PedidosYa – LECTURA (GET)
# ===============================
@app.route('/pedidosya_cargadas')
@login_required
@with_read_scope('t')  # agrega g.read_scope acorde a L1/L2/L3
def pedidosya_cargadas():
    """
    Query params: ?caja=Caja%201&fecha=YYYY-MM-DD&turno=DIA|NOCHE|UNI
    Respuesta: { success:true, datos:[{id, transaccion, monto, fecha, turno}, ...] }
    """
    local = session.get('local') or request.args.get('local')
    caja  = request.args.get('caja')
    fecha = request.args.get('fecha')
    turno = (request.args.get('turno') or 'UNI').upper()

    if not (local and caja and fecha and turno):
        return jsonify(success=True, datos=[])

    try:
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)
        sql = f"""
            SELECT t.id, t.transaccion, t.monto, t.fecha, t.turno
              FROM pedidosya_trns t
             WHERE t.local=%s
               AND t.caja=%s
               AND t.turno=%s
               AND DATE(t.fecha)=%s
               {g.read_scope}   -- L2/L3 pueden ver aun con cierres
             ORDER BY t.id ASC
        """
        cur.execute(sql, (local, caja, turno, _normalize_fecha(fecha)))
        datos = cur.fetchall()
        cur.close(); conn.close()
        return jsonify(success=True, datos=datos)
    except Exception as e:
        print("❌ ERROR pedidosya_cargadas:", e)
        return jsonify(success=False, msg=str(e)), 500


# ===============================
# PedidosYa – UPDATE (PUT)
# ===============================
@app.route('/pedidosya/<int:py_id>', methods=['PUT'])
@login_required
def actualizar_pedidosya(py_id):
    data = request.get_json() or {}
    transaccion = (data.get('transaccion') or "").strip()

    try:
        imp = data.get('monto', 0)
        if isinstance(imp, str):
            imp = float(imp.replace('.', '').replace(',', '.'))
        importe = float(imp or 0)
    except Exception:
        return jsonify(success=False, msg="Monto inválido"), 400

    try:
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)
        cur.execute("SELECT id, local, caja, fecha, turno FROM pedidosya_trns WHERE id=%s", (py_id,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return jsonify(success=False, msg="Registro no encontrado"), 404

        # Permisos por nivel/estado (L1/L2/L3)
        if not can_edit(conn, get_user_level(), row['local'], row['caja'], row['fecha'], row['turno']):
            cur.close(); conn.close()
            return jsonify(success=False, msg="No permitido (caja/local cerrados para tu rol)"), 409

        cur2 = conn.cursor()
        cur2.execute("""
            UPDATE pedidosya_trns
               SET transaccion=%s, monto=%s
             WHERE id=%s
        """, (transaccion, importe, py_id))
        conn.commit()
        cur2.close(); cur.close(); conn.close()
        return jsonify(success=True)
    except Exception as e:
        print("❌ ERROR actualizar_pedidosya:", e)
        return jsonify(success=False, msg=str(e)), 500


# ===============================
# PedidosYa – DELETE
# ===============================
@app.route('/pedidosya/<int:py_id>', methods=['DELETE'])
@login_required
def borrar_pedidosya(py_id):
    try:
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)
        cur.execute("SELECT id, local, caja, fecha, turno FROM pedidosya_trns WHERE id=%s", (py_id,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return jsonify(success=False, msg="Registro no encontrado"), 404

        if not can_edit(conn, get_user_level(), row['local'], row['caja'], row['fecha'], row['turno']):
            cur.close(); conn.close()
            return jsonify(success=False, msg="No permitido (caja/local cerrados para tu rol)"), 409

        cur2 = conn.cursor()
        cur2.execute("DELETE FROM pedidosya_trns WHERE id=%s", (py_id,))
        conn.commit()
        deleted = cur2.rowcount
        cur2.close(); cur.close(); conn.close()
        return jsonify(success=True, deleted=deleted)
    except Exception as e:
        print("❌ ERROR borrar_pedidosya:", e)
        return jsonify(success=False, msg=str(e)), 500


# _________________________________________ MERCADO PAGO _____________________________________
# ---------- MERCADO PAGO ----------


# --- Helpers si hiciera falta (si ya existen globales, podés omitirlos) ---
def _normalize_fecha(fecha):
    if isinstance(fecha, datetime):
        return fecha.date()
    if isinstance(fecha, date):
        return fecha
    if isinstance(fecha, str):
        try:
            return datetime.strptime(fecha, "%Y-%m-%d").date()
        except ValueError:
            return None
    return None

# Versión con TURNO (si ya tenés una global, usá esa):
# def is_caja_abierta(conn, local, caja, fecha, turno):
#     fecha = _normalize_fecha(fecha)
#     cur = conn.cursor()
#     cur.execute("""
#         SELECT estado FROM cajas_estado
#          WHERE local=%s AND caja=%s AND fecha_operacion=%s AND turno=%s
#     """, (local, caja, fecha, turno))
#     row = cur.fetchone()
#     cur.close()
#     return (row is None) or (row[0] is None) or (int(row[0]) == 1)

# --------------------------------------------------------------------
# Guardar lote (con TURNO + USUARIO)
# --------------------------------------------------------------------
# MERCADO PAGO (con rol/estado unificado como en REMESAS)
# --------------------------------------------------------------------
# ===============================
# MERCADOPAGO – ALTAS (POST)
# ===============================
@app.route('/guardar_mercadopago_lote', methods=['POST'])
@login_required
@require_edit_ctx  # valida can_edit con (local,caja,fecha,turno) del body + session
def guardar_mercadopago_lote():
    data      = request.get_json() or {}
    registros = data.get('registros', [])

    if not registros:
        return jsonify(success=False, msg="No se recibieron registros"), 400

    ctx     = g.ctx
    local   = ctx['local']
    caja    = ctx['caja']
    fecha   = _normalize_fecha(ctx['fecha'])
    turno   = ctx['turno']
    usuario = session.get('username')

    try:
        conn = get_db_connection()
        cur  = conn.cursor()
        sql = """
            INSERT INTO mercadopago_trns
                (usuario, local, caja, turno, tipo, terminal, comprobante, importe, fecha, estado)
            VALUES
                (%s, %s, %s, %s, %s, %s, %s, %s, %s,'revision')
        """
        inserted = 0
        for r in registros:
            tipo = (r.get("tipo") or "").upper()
            if tipo not in ("NORMAL", "TIP"):
                tipo = "NORMAL"

            terminal    = (r.get("terminal") or "").strip()
            comprobante = (r.get("comprobante") or "").strip()

            imp = r.get("importe", 0)
            try:
                if isinstance(imp, str):
                    imp = float((imp or "0").replace(".", "").replace(",", "."))
                importe = float(imp or 0)
            except Exception:
                importe = 0.0

            cur.execute(sql, (usuario, local, caja, turno, tipo, terminal, comprobante, importe, fecha))
            inserted += cur.rowcount

        conn.commit()
        cur.close(); conn.close()
        return jsonify(success=True, inserted=inserted, msg="MercadoPago guardado correctamente.")
    except Exception as e:
        print("❌ ERROR guardar_mercadopago_lote:", e)
        return jsonify(success=False, msg=str(e)), 500

# (Si preferís sin require_edit_ctx, tu versión original funciona.
#  Bastaría con reemplazar el decorador por @login_required y dejar el can_edit inline.)

# ===============================
# MERCADOPAGO – LECTURA (GET)
# ===============================
@app.route('/mercadopago_cargadas')
@login_required
@with_read_scope('t')
def mercado_pago_cargadas():
    caja  = request.args.get('caja')
    fecha = request.args.get('fecha')
    turno = request.args.get('turno')
    local = session.get('local') or request.args.get('local')

    if not (caja and fecha and turno and local):
        return jsonify(success=True, datos=[])

    try:
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)
        sql = f"""
            SELECT t.id, t.tipo, t.terminal, t.comprobante, t.importe, t.fecha, t.turno
              FROM mercadopago_trns t
             WHERE t.local=%s
               AND t.caja=%s
               AND t.turno=%s
               AND DATE(t.fecha)=%s
               {g.read_scope}   -- L2: cajas cerradas; L3: locales cerrados
             ORDER BY t.id ASC
        """
        cur.execute(sql, (local, caja, turno, _normalize_fecha(fecha)))
        datos = cur.fetchall()
        cur.close(); conn.close()
        return jsonify(success=True, datos=datos)
    except Exception as e:
        print("❌ ERROR mercado_pago_cargadas:", e)
        return jsonify(success=False, msg=str(e)), 500

# ===============================
# MERCADOPAGO – UPDATE (PUT)
# ===============================
@app.route('/mercadopago/<int:mp_id>', methods=['PUT'])
@login_required
def actualizar_mercadopago(mp_id):
    data = request.get_json() or {}

    tipo = (data.get('tipo') or '').upper()
    if tipo not in ('NORMAL', 'TIP'):
        tipo = 'NORMAL'
    terminal    = (data.get('terminal') or '').strip()
    comprobante = (data.get('comprobante') or '').strip()

    try:
        imp = data.get('importe')
        if isinstance(imp, str):
            imp = float(imp.replace('.', '').replace(',', '.'))
        importe = float(imp)
    except Exception:
        return jsonify(success=False, msg="Importe inválido"), 400

    try:
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)
        cur.execute("SELECT id, local, caja, fecha, turno FROM mercadopago_trns WHERE id=%s", (mp_id,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return jsonify(success=False, msg="Registro no encontrado"), 404

        # Permiso por rol/estado (igual que Remesas)
        if not can_edit(conn, get_user_level(), row['local'], row['caja'], row['fecha'], row['turno']):
            cur.close(); conn.close()
            return jsonify(success=False, msg="No permitido (caja/local cerrados para tu rol)"), 409

        cur2 = conn.cursor()
        cur2.execute("""
            UPDATE mercadopago_trns
               SET tipo=%s, terminal=%s, comprobante=%s, importe=%s
             WHERE id=%s
        """, (tipo, terminal, comprobante, importe, mp_id))
        conn.commit()
        cur2.close(); cur.close(); conn.close()
        return jsonify(success=True)
    except Exception as e:
        print("❌ ERROR actualizar_mercadopago:", e)
        return jsonify(success=False, msg=str(e)), 500

# ===============================
# MERCADOPAGO – DELETE
# ===============================
@app.route('/mercadopago/<int:mp_id>', methods=['DELETE'])
@login_required
def borrar_mercadopago(mp_id):
    try:
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)
        cur.execute("SELECT id, local, caja, fecha, turno FROM mercadopago_trns WHERE id=%s", (mp_id,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return jsonify(success=False, msg="Registro no encontrado"), 404

        if not can_edit(conn, get_user_level(), row['local'], row['caja'], row['fecha'], row['turno']):
            cur.close(); conn.close()
            return jsonify(success=False, msg="No permitido (caja/local cerrados para tu rol)"), 409

        cur2 = conn.cursor()
        cur2.execute("DELETE FROM mercadopago_trns WHERE id=%s", (mp_id,))
        conn.commit()
        deleted = cur2.rowcount
        cur2.close(); cur.close(); conn.close()
        return jsonify(success=True, deleted=deleted)
    except Exception as e:
        print("❌ ERROR borrar_mercadopago:", e)
        return jsonify(success=False, msg=str(e)), 500

# ______________________________________ VENTAS (BASE + Z) ____________________________________________
# Reemplaza tu sección de "VENTAS" por esto.
# Quita: /guardar_ventas y TODOS los /ventas_especiales_*



# ─────────────────────────────────────
# VENTA SISTEMA (única por fecha/caja/local)
# ─────────────────────────────────────

# ─────────────────────────────────────
# Helpers comunes (si ya existen, usá los tuyos)
# ─────────────────────────────────────
from datetime import datetime

def _normalize_fecha_str(s):
    if not s:
        return None
    if isinstance(s, datetime):
        return s.strftime("%Y-%m-%d")
    if hasattr(s, 'strftime'):
        return s.strftime("%Y-%m-%d")
    if isinstance(s, str):
        try:
            return datetime.strptime(s, "%Y-%m-%d").strftime("%Y-%m-%d")
        except ValueError:
            return s
    return None

def _get_turno_from_request(data):
    # Acepta por body o por querystring; default 'UNI' si faltara
    return (data.get('turno')
            or request.args.get('turno')
            or 'UNI')

# ─────────────────────────────────────
# VENTA SISTEMA (única por fecha/caja/turno/local)
# ─────────────────────────────────────

# ─────────────────────────────────────
# VENTAS BASE
# ─────────────────────────────────────

@app.route('/ventas_base', methods=['POST', 'PUT', 'DELETE'])
@login_required
def ventas_base():
    """
    POST   -> Crea la base si NO existe para (local,caja,fecha,turno).
              body: { fecha, caja, turno, venta_total_sistema }  (acepta 'venta_total' como alias)
    PUT    -> Actualiza la base existente (solo venta_total_sistema).
              body: { fecha, caja, turno, venta_total_sistema }  (acepta 'venta_total' como alias)
    DELETE -> Borra la base.
              body: { fecha, caja, turno }
    """
    data   = request.get_json() or {}
    local  = session.get('local')
    user   = session.get('username')

    if not local or not user:
        return jsonify(success=False, msg="Faltan datos de sesión (usuario/local)."), 401

    fecha = data.get('fecha')
    caja  = data.get('caja')
    turno = _get_turno_from_request(data)

    if not fecha or not caja or not turno:
        return jsonify(success=False, msg="Faltan parámetros (fecha/caja/turno)."), 400

    # normalizamos fecha para todas las comparaciones
    nfecha = _normalize_fecha(fecha)

    conn = get_db_connection()
    cur  = conn.cursor(dictionary=True)

    try:
        # Permisos por rol/estado
        if not can_edit(conn, get_user_level(), local, caja, nfecha, turno):
            return jsonify(success=False, msg="No permitido (caja/local cerrados para tu rol)"), 409

        # Resolvemos monto (acepta venta_total_sistema o venta_total)
        vts = data.get('venta_total_sistema')
        if vts is None:
            vts = data.get('venta_total')
        try:
            vts = float(str(vts or 0).replace('.', '').replace(',', '.'))
        except Exception:
            vts = 0.0

        if request.method == 'POST':
            # ¿existe ya una base para ese turno?
            cur.execute("""
                SELECT id
                  FROM ventas_trns
                 WHERE local=%s AND caja=%s AND DATE(fecha)=%s AND turno=%s
                 LIMIT 1
            """, (local, caja, nfecha, turno))
            row = cur.fetchone()
            if row:
                return jsonify(success=False, msg="Ya existe una venta para esa fecha/caja/turno."), 409

            cur2 = conn.cursor()
            cur2.execute("""
                INSERT INTO ventas_trns (usuario, local, caja, turno, fecha, venta_total_sistema, estado)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (user, local, caja, turno, nfecha, vts, "revision"))
            cur2.close()
            conn.commit()
            return jsonify(success=True)

        if request.method == 'PUT':
            cur.execute("""
                SELECT id
                  FROM ventas_trns
                 WHERE local=%s AND caja=%s AND DATE(fecha)=%s AND turno=%s
                 LIMIT 1
            """, (local, caja, nfecha, turno))
            row = cur.fetchone()
            if not row:
                return jsonify(success=False, msg="No existe base para esa fecha/caja/turno."), 404

            cur2 = conn.cursor()
            cur2.execute("""
                UPDATE ventas_trns
                   SET venta_total_sistema=%s, usuario=%s
                 WHERE id=%s
            """, (vts, user, row['id']))
            cur2.close()
            conn.commit()
            return jsonify(success=True)

        # DELETE
        cur.execute("""
            DELETE FROM ventas_trns
             WHERE local=%s AND caja=%s AND DATE(fecha)=%s AND turno=%s
        """, (local, caja, nfecha, turno))
        conn.commit()
        return jsonify(success=True)

    except Exception as e:
        conn.rollback()
        return jsonify(success=False, msg=str(e)), 500
    finally:
        cur.close()
        conn.close()


@app.route('/ventas_cargadas')
@login_required
@with_read_scope('t')
def ventas_cargadas():
    """
    GET -> Devuelve la BASE (única) de la fecha/caja/turno/local.
    resp: { success:true, datos:[ { id, fecha:'YYYY-MM-DD', caja, turno, venta_total:<decimal> } ] }
    """
    local = session.get('local')
    fecha = request.args.get('fecha')
    caja  = request.args.get('caja')
    turno = request.args.get('turno') or 'UNI'

    if not local or not fecha or not caja or not turno:
        return jsonify(success=False, msg="Faltan parámetros"), 400

    try:
        nfecha = _normalize_fecha(fecha)
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)
        cur.execute(f"""
            SELECT
              t.id,
              DATE_FORMAT(t.fecha,'%Y-%m-%d') AS fecha,
              t.caja,
              t.turno,
              t.venta_total_sistema AS venta_total
            FROM ventas_trns t
            WHERE t.local=%s
              AND t.caja=%s
              AND t.turno=%s
              AND DATE(t.fecha)=%s
              {g.read_scope}  -- L2: sólo cajas cerradas; L3: sólo locales cerrados
            LIMIT 1
        """, (local, caja, turno, nfecha))
        datos = cur.fetchall()
        cur.close(); conn.close()
        return jsonify(success=True, datos=datos)
    except Exception as e:
        return jsonify(success=False, msg=str(e)), 500


# ─────────────────────────────────────
# VENTA Z (múltiples por fecha/caja/turno/local)
# ─────────────────────────────────────
@app.route('/ventas_z', methods=['POST'])
@login_required
def ventas_z_crear():
    """
    POST -> Crea un comprobante Z
    body: { fecha, caja, turno, punto_venta, numero_z, monto }
    Reglas de edición:
      - L1: sólo si la CAJA (de ese turno) está abierta.
      - L2: puede aunque la caja esté cerrada, siempre que el LOCAL esté abierto.
      - L3: siempre puede.
    """
    data   = request.get_json() or {}
    local  = session.get('local')
    user   = session.get('username')

    if not local or not user:
        return jsonify(success=False, msg="Faltan datos de sesión (usuario/local)."), 401

    fecha       = data.get('fecha')
    caja        = data.get('caja')
    turno       = _get_turno_from_request(data)
    punto_venta = (data.get('punto_venta') or '').strip()
    numero_z    = (data.get('numero_z') or '').strip()

    # Parseo robusto de monto (admite "12.345,67" o 12345.67)
    monto_raw   = data.get('monto')
    try:
        if isinstance(monto_raw, str):
            monto = float(monto_raw.replace('.', '').replace(',', '.'))
        else:
            monto = float(monto_raw or 0)
    except Exception:
        monto = 0.0

    if not fecha or not caja or not turno or not punto_venta or not numero_z or monto <= 0:
        return jsonify(success=False, msg="Parámetros inválidos."), 400

    conn = get_db_connection()
    try:
        # ⬇️ Permisos por rol/estado (misma lógica que remesas / MP):
        if not can_edit(conn, get_user_level(), local, caja, fecha, turno):
            conn.close()
            return jsonify(success=False, msg="No permitido (caja/local cerrados para tu rol)."), 409

        cur = conn.cursor()
        try:
            cur.execute("""
                INSERT INTO ventas_z_trns
                    (local, caja, turno, fecha, punto_venta, numero_z, monto, usuario, estado)
                VALUES
                    (%s,    %s,   %s,    %s,    %s,          %s,       %s,    %s,      %s)
            """, (local, caja, turno, _normalize_fecha(fecha), punto_venta, numero_z, monto, user, "Revision"))
            conn.commit()
        except mysql.connector.Error as me:
            # Duplicado por UNIQUE (local,caja,fecha,turno,punto_venta,numero_z)
            if getattr(me, 'errno', None) == 1062:
                conn.rollback()
                return jsonify(success=False, msg="Comprobante Z duplicado para esa fecha/caja/turno/punto/número."), 409
            conn.rollback()
            raise
        finally:
            cur.close()

        return jsonify(success=True)
    except Exception as e:
        print("❌ ventas_z_crear:", e)
        return jsonify(success=False, msg=str(e)), 500
    finally:
        try: conn.close()
        except: ...



@app.route('/ventas_z/<int:z_id>', methods=['PUT', 'DELETE'])
@login_required
def ventas_z_mutar(z_id):
    """
    PUT    -> body: { punto_venta, numero_z, monto }
    DELETE -> sin body
    """
    local = session.get('local')
    user  = session.get('username')
    if not local or not user:
        return jsonify(success=False, msg="Faltan datos de sesión (usuario/local)."), 401

    conn = get_db_connection()
    cur  = conn.cursor(dictionary=True)

    try:
        # Traer registro para conocer fecha/caja/turno y validar permisos
        cur.execute("""
            SELECT id, fecha, caja, turno, punto_venta, numero_z
              FROM ventas_z_trns
             WHERE id=%s AND local=%s
             LIMIT 1
        """, (z_id, local))
        row = cur.fetchone()
        if not row:
            return jsonify(success=False, msg="Z no encontrado."), 404

        nfecha = _normalize_fecha(row['fecha'])
        caja   = row['caja']
        turno  = row['turno']

        # Permisos por rol/estado
        if not can_edit(conn, get_user_level(), local, caja, nfecha, turno):
            return jsonify(success=False, msg="No permitido (caja/local cerrados para tu rol)"), 409

        if request.method == 'PUT':
            data         = request.get_json() or {}
            punto_venta  = (data.get('punto_venta') or '').strip()
            numero_z     = (data.get('numero_z') or '').strip()
            try:
                monto = float(str(data.get('monto') or 0).replace('.', '').replace(',', '.'))
            except Exception:
                return jsonify(success=False, msg="Monto inválido"), 400

            if not punto_venta or not numero_z or monto <= 0:
                return jsonify(success=False, msg="Parámetros inválidos."), 400

            # Evitar colisión con otro registro (UNIQUE) para el MISMO turno
            cur.execute("""
                SELECT id
                  FROM ventas_z_trns
                 WHERE local=%s AND caja=%s AND turno=%s AND DATE(fecha)=%s
                   AND punto_venta=%s AND numero_z=%s AND id<>%s
                 LIMIT 1
            """, (local, caja, turno, nfecha, punto_venta, numero_z, z_id))
            dupe = cur.fetchone()
            if dupe:
                return jsonify(success=False, msg="Otro Z con mismo Punto/Número ya existe para esa fecha/caja/turno."), 409

            cur2 = conn.cursor()
            cur2.execute("""
                UPDATE ventas_z_trns
                   SET punto_venta=%s, numero_z=%s, monto=%s, usuario=%s
                 WHERE id=%s AND local=%s
            """, (punto_venta, numero_z, monto, user, z_id, local))
            cur2.close()
            conn.commit()
            return jsonify(success=True)

        # DELETE
        cur2 = conn.cursor()
        cur2.execute("""
            DELETE FROM ventas_z_trns
             WHERE id=%s AND local=%s
        """, (z_id, local))
        cur2.close()
        conn.commit()
        return jsonify(success=True)

    except Exception as e:
        conn.rollback()
        return jsonify(success=False, msg=str(e)), 500
    finally:
        cur.close()
        conn.close()


@app.route('/ventas_z_cargadas')
@login_required
@with_read_scope('t')
def ventas_z_cargadas():
    """
    GET -> Devuelve TODOS los Z de la fecha/caja/turno/local
    resp: { success:true, datos:[ { id, fecha:'YYYY-MM-DD', caja, turno, punto_venta, numero_z, monto } ] }
    """
    local = session.get('local')
    fecha = request.args.get('fecha')
    caja  = request.args.get('caja')
    turno = request.args.get('turno') or 'UNI'

    if not local or not fecha or not caja or not turno:
        return jsonify(success=False, msg="Faltan parámetros"), 400

    try:
        nfecha = _normalize_fecha(fecha)
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)

        # Elegí la colación que tiene cajas_estado (probable: utf8mb4_unicode_ci).
        COLL = "utf8mb4_unicode_ci"

        # Normalizamos local/caja/turno SOLO en este endpoint, sin tocar la subquery global.
        sql = f"""
            SELECT
              t.id,
              DATE_FORMAT(t.fecha,'%Y-%m-%d') AS fecha,
              t.caja,
              t.turno,
              t.punto_venta,
              t.numero_z,
              t.monto
            FROM (
                SELECT
                  id,
                  fecha,
                  -- Las tres columnas textual que se comparan en el scope:
                  CONVERT(local  USING utf8mb4) COLLATE {COLL} AS local,
                  CONVERT(caja   USING utf8mb4) COLLATE {COLL} AS caja,
                  CONVERT(turno  USING utf8mb4) COLLATE {COLL} AS turno,
                  punto_venta,
                  numero_z,
                  monto
                FROM ventas_z_trns
            ) AS t
            WHERE t.local=%s
              AND t.caja=%s
              AND t.turno=%s
              AND DATE(t.fecha)=%s
              {g.read_scope}  -- L2: sólo cajas cerradas; L3: sólo locales cerrados
            ORDER BY t.id ASC
        """

        cur.execute(sql, (local, caja, turno, nfecha))
        datos = cur.fetchall()
        cur.close(); conn.close()
        return jsonify(success=True, datos=datos)
    except Exception as e:
        # Logueá e para ver si hubiera otro problema
        print("❌ ventas_z_cargadas:", e)
        return jsonify(success=False, msg=str(e)), 500



## _________________________________________________ CIERRE CAJA INDIVIDUAL _______________________________________
# ───────────────────────────────────────────
# /api/cierre/resumen  (caja/fecha únicos)
# ───────────────────────────────────────────
@app.route('/api/cierre/resumen')
@login_required
def cierre_resumen():
    local = session.get('local')
    caja  = request.args.get('caja')
    fecha = request.args.get('fecha')
    turno = request.args.get('turno') or 'UNI'  # <-- TURNO

    if not local or not caja or not fecha or not turno:
        return jsonify(error="Parámetros insuficientes"), 400

    conn = get_db_connection()
    cur  = conn.cursor()

    resumen = {}

    try:
        # ===== Ventas base (una fila por caja/fecha/turno en ventas_trns) =====
        # venta_total
        cur.execute("""
            SELECT COALESCE(SUM(venta_total_sistema),0)
              FROM ventas_trns
             WHERE DATE(fecha)=%s AND local=%s AND caja=%s AND turno=%s
        """, (fecha, local, caja, turno))
        row = cur.fetchone()
        resumen['venta_total'] = float(row[0]) if row and row[0] is not None else 0.0

        # venta_z  (se respeta tu lógica actual en ventas_trns)
        cur.execute("""
            SELECT COALESCE(SUM(monto),0)
              FROM ventas_z_trns
             WHERE DATE(fecha)=%s AND local=%s AND caja=%s AND turno=%s
        """, (fecha, local, caja, turno))
        row = cur.fetchone()
        resumen['venta_z'] = float(row[0]) if row and row[0] is not None else 0.0
        resumen['discovery'] = float(resumen['venta_total'] - resumen['venta_z'])

        # ===== Ingresos / medios de cobro =====
        # efectivo (remesas)
        cur.execute("""
            SELECT COALESCE(SUM(monto),0)
              FROM remesas_trns
             WHERE DATE(fecha)=%s AND local=%s AND caja=%s AND turno=%s
        """, (fecha, local, caja, turno))
        row = cur.fetchone()
        resumen['efectivo'] = float(row[0]) if row and row[0] is not None else 0.0

        # tarjeta (ventas con tarjeta NO TIPS)
        cur.execute("""
            SELECT COALESCE(SUM(monto),0)
              FROM tarjetas_trns
             WHERE DATE(fecha)=%s AND local=%s AND caja=%s AND turno=%s
        """, (fecha, local, caja, turno))
        row = cur.fetchone()
        resumen['tarjeta'] = float(row[0]) if row and row[0] is not None else 0.0

        # mercadopago normal
        cur.execute("""
            SELECT COALESCE(SUM(importe),0)
              FROM mercadopago_trns
             WHERE DATE(fecha)=%s AND local=%s AND tipo='NORMAL' AND caja=%s AND turno=%s
        """, (fecha, local, caja, turno))
        row = cur.fetchone()
        resumen['mercadopago'] = float(row[0]) if row and row[0] is not None else 0.0

        # cuenta corriente (si hoy usás MP como placeholder, se respeta)
        cur.execute("""
            SELECT COALESCE(SUM(importe),0)
              FROM mercadopago_trns
             WHERE TIPO = 'NADA' AND DATE(fecha)=%s AND local=%s AND tipo='NORMAL' AND caja=%s AND turno=%s
        """, (fecha, local, caja, turno))
        row = cur.fetchone()
        resumen['cuenta_cte'] = float(row[0]) if row and row[0] is not None else 0.0

        # rappi
        cur.execute("""
            SELECT COALESCE(SUM(monto),0)
              FROM rappi_trns
             WHERE DATE(fecha)=%s AND local=%s AND caja=%s AND turno=%s
        """, (fecha, local, caja, turno))
        row = cur.fetchone()
        resumen['rappi'] = float(row[0]) if row and row[0] is not None else 0.0

        # pedidosya
        cur.execute("""
            SELECT COALESCE(SUM(monto),0)
              FROM pedidosya_trns
             WHERE DATE(fecha)=%s AND local=%s AND caja=%s AND turno=%s
        """, (fecha, local, caja, turno))
        row = cur.fetchone()
        resumen['pedidosya'] = float(row[0]) if row and row[0] is not None else 0.0

        # ===== TIPS =====
        # Tips de tarjetas: suma de columnas (respetando tu set actual)
        cur.execute("""
            SELECT COALESCE(SUM(
              COALESCE(visa_tips,0) +
              COALESCE(visa_debito_tips,0) +
              COALESCE(mastercard_tips,0) +
              COALESCE(mastercard_debito_tips,0) +
              COALESCE(cabal_tips,0) +
              COALESCE(cabal_debito_tips,0) +
              COALESCE(amex_tips,0)
            ),0)
              FROM tips_tarjetas
             WHERE DATE(fecha)=%s AND local=%s AND caja=%s AND turno=%s
        """, (fecha, local, caja, turno))
        row = cur.fetchone()
        tips_tarjeta = float(row[0]) if row and row[0] is not None else 0.0

        # Tips de MercadoPago (tipo TIP)
        cur.execute("""
            SELECT COALESCE(SUM(importe),0)
              FROM mercadopago_trns
             WHERE DATE(fecha)=%s AND local=%s AND tipo='TIP' AND caja=%s AND turno=%s
        """, (fecha, local, caja, turno))
        row = cur.fetchone()
        tips_mp = float(row[0]) if row and row[0] is not None else 0.0

        resumen['tips'] = tips_tarjeta + tips_mp

        # ===== Total cobrado (sin venta_total ni tips)
        resumen['total_cobrado'] = sum([
            resumen.get('efectivo',0.0),
            resumen.get('tarjeta',0.0),
            resumen.get('mercadopago',0.0),
            resumen.get('rappi',0.0),
            resumen.get('pedidosya',0.0),
            resumen.get('cuenta_cte',0.0),
        ])

        # ===== Estado de caja (por turno)
        try:
            cur.execute("""
                SELECT estado
                  FROM cajas_estado
                 WHERE DATE(fecha)=%s AND local=%s AND caja=%s AND turno=%s
                 ORDER BY id DESC
                 LIMIT 1
            """, (fecha, local, caja, turno))
            row = cur.fetchone()
            resumen['estado_caja'] = int(row[0]) if row and row[0] is not None else 1  # 1=abierta por defecto
        except Exception:
            resumen['estado_caja'] = 1

        return jsonify(resumen)

    except Exception as e:
        return jsonify(error=str(e)), 500
    finally:
        cur.close()
        conn.close()


#________________ ====== UTILIDADES DE CAJA ABIERTA/CERRADA ====== ________________________________________________________________________
from datetime import datetime
def ensure_estado_row(conn, local: str, caja: str, fecha: str, turno: str = "UNI"):
    """
    Garantiza que exista una fila (local,caja,fecha,turno). Si no existe, la crea como abierta (estado=1).
    """
    turno = (turno or "UNI").upper()
    cur = conn.cursor()
    cur.execute("""
        SELECT id FROM cajas_estado
        WHERE local=%s AND caja=%s AND fecha_operacion=%s AND turno=%s
    """, (local, caja, fecha, turno))
    row = cur.fetchone()
    if not row:
        cur.execute("""
            INSERT INTO cajas_estado (local, caja, fecha_operacion, turno, estado)
            VALUES (%s, %s, %s, %s, 1)
        """, (local, caja, fecha, turno))
        conn.commit()
    cur.close()

def caja_esta_cerrada(conn, local: str, caja: str, fecha: str, turno: str = "UNI") -> bool:
    """
    True si la caja está cerrada para (local,caja,fecha,turno).
    Si no hay fila -> se considera ABIERTA (False).
    """
    turno = (turno or "UNI").upper()
    cur = conn.cursor()
    cur.execute("""
        SELECT estado FROM cajas_estado
        WHERE local=%s AND caja=%s AND fecha_operacion=%s AND turno=%s
    """, (local, caja, fecha, turno))
    row = cur.fetchone()
    cur.close()
    if not row:
        return False
    return int(row[0]) == 0  # 0 = cerrada

def extract_context_from_request():
    """
    Extrae (local, caja, fecha, turno) de la request/sesión.
    """
    local = session.get('local') or request.args.get('local')
    caja  = request.args.get('caja')
    fecha = request.args.get('fecha')
    turno = request.args.get('turno') or "UNI"

    if request.is_json:
        j = request.get_json(silent=True) or {}
        caja  = j.get('caja', caja)
        fecha = j.get('fecha', fecha)
        turno = j.get('turno', turno)
        local = j.get('local', local)

    if turno:
        turno = turno.upper()
    return local, caja, fecha, (turno or "UNI")

def abort_if_cerrada(conn, local, caja, fecha, turno="UNI"):
    """
    Lanza 409 si la caja está cerrada.
    """
    if not (local and caja and fecha):
        abort(400, description="Faltan parámetros de contexto (local/caja/fecha).")
    if caja_esta_cerrada(conn, local, caja, fecha, turno):
        abort(409, description="Caja cerrada: no se puede modificar.")

# ====== ENDPOINTS ======
@app.get('/estado_caja')
@login_required
def estado_caja():
    local, caja, fecha, turno = extract_context_from_request()
    if not (local and caja and fecha):
        return jsonify({"error": "Faltan parámetros local/caja/fecha"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT estado FROM cajas_estado
        WHERE local=%s AND caja=%s AND fecha_operacion=%s AND turno=%s
    """, (local, caja, fecha, turno))
    row = cur.fetchone()
    cur.close(); conn.close()

    estado = 1 if (not row) else int(row[0])  # abierta por defecto
    return jsonify({"estado": estado})

## meto helpers a la func de cierre_caja
def _normalize_fecha(fecha):
    # tu impl. actual (la dejo como está)
    return fecha

def ensure_estado_row(conn, local, caja, fecha, turno):
    """Crea la fila (abierta) si no existe para ese local/caja/fecha/turno."""
    cur = conn.cursor()
    cur.execute("""
        INSERT IGNORE INTO cajas_estado (local, caja, turno, fecha_operacion, estado)
        VALUES (%s, %s, %s, %s, 1)
    """, (local, caja, turno, _normalize_fecha(fecha)))
    conn.commit()
    cur.close()

def is_caja_abierta(conn, local, caja, fecha, turno):
    """True si no hay fila o si estado=1 (abierta)."""
    cur = conn.cursor()
    cur.execute("""
        SELECT estado
        FROM cajas_estado
        WHERE local=%s AND caja=%s AND fecha_operacion=%s AND turno=%s
        LIMIT 1
    """, (local, caja, _normalize_fecha(fecha), turno))
    row = cur.fetchone()
    cur.close()
    if row is None:
        return True
    return int(row[0]) == 1
## ahora si la func
@app.post('/cerrar_caja')
@login_required
def cerrar_caja():
    data = request.get_json() or {}
    local   = data.get('local')  or session.get('local')
    caja    = data.get('caja')
    fecha   = data.get('fecha')
    turno   = data.get('turno')            # ← obligatorio
    usuario = session.get('username') or data.get('usuario') or 'sistema'

    if not (local and caja and fecha and turno):
        return jsonify(ok=False, msg="Faltan parámetros local/caja/fecha/turno"), 400

    conn = get_db_connection()
    try:
        # asegurar fila abierta
        ensure_estado_row(conn, local, caja, fecha, turno)

        cur = conn.cursor()
        cur.execute("""
            SELECT id, estado
            FROM cajas_estado
            WHERE local=%s AND caja=%s AND fecha_operacion=%s AND turno=%s
            FOR UPDATE
        """, (local, caja, _normalize_fecha(fecha), turno))
        row = cur.fetchone()
        if not row:
            conn.rollback(); cur.close(); conn.close()
            return jsonify(ok=False, msg="No se encontró estado"), 404

        _id, estado = row
        if int(estado) == 0:
            cur.close(); conn.close()
            return jsonify(ok=True, already_closed=True)

        cur.execute("""
            UPDATE cajas_estado
            SET estado=0, cerrada_en=NOW(), cerrada_por=%s
            WHERE id=%s
        """, (usuario, _id))
        conn.commit()
        cur.close(); conn.close()
        return jsonify(ok=True, closed=True)

    except Exception as e:
        try: conn.rollback()
        except: pass
        try: conn.close()
        except: pass
        # loggear e
        return jsonify(ok=False, msg=str(e)), 500


##__________________________ GASTOS PESTAÑA _____________________________-#
# __________________________________ GASTOS _______________________________________
# CRUD + lote, con soporte de turno y bloqueo por estado de caja

@app.route('/gastos_cargadas')
@login_required
def gastos_cargadas():
    local = session.get('local')
    caja  = request.args.get('caja')
    fecha = request.args.get('fecha')
    turno = request.args.get('turno')

    if not (local and caja and fecha and turno):
        # Por compatibilidad con el front, devolvemos flags de estado
        return jsonify(success=True, datos=[], estado_caja=1, estado_local=1)

    try:
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)

        # ===== Estados para la UI =====
        try:
            # abierta => 1; cerrada => 0
            estado_caja = 1 if is_caja_abierta(conn, local, caja, _normalize_fecha(fecha), turno) else 0
        except Exception:
            estado_caja = 1

        try:
            # usamos tu is_local_closed; si está cerrado -> 0; abierto -> 1
            estado_local = 0 if is_local_closed(conn, local, _normalize_fecha(fecha)) else 1
        except Exception:
            estado_local = 1

        cur.execute("""
            SELECT id, fecha, local, caja, turno, tipo, monto, observaciones, created_at
            FROM gastos_trns
            WHERE local=%s AND caja=%s AND DATE(fecha)=%s AND turno=%s
            ORDER BY id ASC
        """, (local, caja, _normalize_fecha(fecha), turno))
        rows = cur.fetchall()

        cur.close(); conn.close()
        return jsonify(success=True, datos=rows, estado_caja=estado_caja, estado_local=estado_local)

    except Exception as e:
        print("❌ ERROR gastos_cargadas:", e)
        return jsonify(success=False, msg=str(e)), 500


@app.route('/guardar_gastos_lote', methods=['POST'])
@login_required
def guardar_gastos_lote():
    payload = request.get_json() or {}
    caja   = payload.get('caja')
    fecha  = payload.get('fecha')
    turno  = payload.get('turno')
    items  = payload.get('transacciones', []) or []

    local   = session.get('local')
    usuario = session.get('username') or 'sistema'

    if not (local and caja and fecha and turno):
        return jsonify(success=False, msg="Faltan local/caja/fecha/turno"), 400
    if not items:
        return jsonify(success=False, msg="No se recibieron gastos"), 400

    try:
        conn = get_db_connection()

        user_level = get_user_level()
        if not can_edit(conn, user_level, local, caja, _normalize_fecha(fecha), turno):
            conn.close()
            return jsonify(success=False, msg="No tenés permisos para guardar (caja/local cerrados para tu rol)."), 409

        cur = conn.cursor()
        for g in items:
            tipo = (g.get('tipo') or "").strip()
            obs  = (g.get('observaciones') or "").strip()

            # monto puede venir con separadores locales
            mstr = str(g.get('monto', '0')).replace('.', '').replace(',', '.')
            try:
                monto = float(mstr or 0)
            except Exception:
                monto = 0.0

            cur.execute("""
                INSERT INTO gastos_trns
                    (fecha, local, caja, turno, tipo, monto, observaciones, usuario, created_at, estado)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), %s)
            """, (_normalize_fecha(fecha), local, caja, turno, tipo, monto, obs, usuario, "revision"))

        conn.commit()
        cur.close(); conn.close()
        return jsonify(success=True)

    except Exception as e:
        print("❌ ERROR guardar_gastos_lote:", e)
        return jsonify(success=False, msg=str(e)), 500


@app.route('/gastos/<int:gasto_id>', methods=['PUT'])
@login_required
def actualizar_gasto(gasto_id):
    data  = request.get_json() or {}
    tipo  = (data.get('tipo') or "").strip()
    # Observaciones puede NO venir desde el lápiz, en ese caso conservamos la actual
    obs_in = data.get('observaciones')  # puede ser None
    monto = data.get('monto')

    # normalizo monto
    try:
        if isinstance(monto, str):
            monto = float(monto.replace('.', '').replace(',', '.'))
        else:
            monto = float(monto or 0)
    except Exception:
        return jsonify(success=False, msg="Monto inválido"), 400

    try:
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT id, local, caja, fecha, turno, observaciones
            FROM gastos_trns
            WHERE id=%s
        """, (gasto_id,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return jsonify(success=False, msg="Registro no encontrado"), 404

        user_level = get_user_level()
        if not can_edit(conn, user_level, row['local'], row['caja'], row['fecha'], row['turno']):
            cur.close(); conn.close()
            return jsonify(success=False, msg="No tenés permisos para actualizar (caja/local cerrados para tu rol)."), 409

        final_obs = (obs_in if obs_in is not None else (row.get('observaciones') or "")).strip()

        cur2 = conn.cursor()
        cur2.execute("""
            UPDATE gastos_trns
               SET tipo=%s, monto=%s, observaciones=%s
             WHERE id=%s
        """, (tipo, monto, final_obs, gasto_id))

        conn.commit()
        cur2.close(); cur.close(); conn.close()
        return jsonify(success=True)

    except Exception as e:
        print("❌ ERROR actualizar_gasto:", e)
        return jsonify(success=False, msg=str(e)), 500


@app.route('/gastos/<int:gasto_id>', methods=['DELETE'])
@login_required
def borrar_gasto(gasto_id):
    try:
        conn = get_db_connection()
        cur  = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT id, local, caja, fecha, turno
            FROM gastos_trns
            WHERE id=%s
        """, (gasto_id,))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return jsonify(success=False, msg="Registro no encontrado"), 404

        user_level = get_user_level()
        if not can_edit(conn, user_level, row['local'], row['caja'], row['fecha'], row['turno']):
            cur.close(); conn.close()
            return jsonify(success=False, msg="No tenés permisos para borrar (caja/local cerrados para tu rol)."), 409

        cur2 = conn.cursor()
        cur2.execute("DELETE FROM gastos_trns WHERE id=%s", (gasto_id,))
        conn.commit()
        deleted = cur2.rowcount

        cur2.close(); cur.close(); conn.close()
        return jsonify(success=True, deleted=deleted)

    except Exception as e:
        print("❌ ERROR borrar_gasto:", e)
        return jsonify(success=False, msg=str(e)), 500
























# ___________ RESUMEN_LOCAL.HTML _____________________________-#
# ========= Vista =========
@app.route("/resumen-local")
@login_required
def resumen_local():
    # Variables mínimas para la plantilla
    session.setdefault("username", session.get("username", "USUARIO"))
    session.setdefault("local",    session.get("local",    "Mi Local"))
    session.setdefault("society",  session.get("society",  "Mi Sociedad SA"))
    return render_template("resumen_local.html")


# ========= Helpers =========
from flask import request, jsonify, session, make_response

def _qsum(cur, sql, params):
    """Suma segura: devuelve float siempre."""
    cur.execute(sql, params)
    row = cur.fetchone()
    return float(row[0]) if row and row[0] is not None else 0.0

def _fetch_ventas_z(conn, cur, fecha, local):
    """
    Devuelve (items, total):
      items = [{'numero_z': '123', 'monto': 1000.0}, ...]
      total = suma de los montos
    """
    numero_cols = ["numero_z", "nro_z", "z_numero", "num_z"]
    monto_cols  = ["monto", "importe", "total"]
    last_error = None

    for ncol in numero_cols:
        for mcol in monto_cols:
            try:
                cur.execute(
                    f"""
                    SELECT {ncol} AS znum, COALESCE(SUM({mcol}),0) AS total
                    FROM ventas_z_trns
                    WHERE DATE(fecha)=%s AND local=%s
                    GROUP BY {ncol}
                    ORDER BY {ncol}
                    """,
                    (fecha, local),
                )
                rows = cur.fetchall()
                items = [{'numero_z': str(r[0]), 'monto': float(r[1] or 0)} for r in rows] if rows else []
                return items, sum(i['monto'] for i in items)
            except Exception as e:
                conn.rollback()
                last_error = e
                continue
    # Si nada funcionó
    return [], 0.0

def _sum_cuenta_corriente(conn, cur, fecha, local):
    """Total de Cuenta Corriente, tolerante a diferencias de columnas."""
    try:
        return _qsum(
            cur,
            "SELECT COALESCE(SUM(monto),0) FROM cuenta_corriente_trns WHERE DATE(fecha)=%s AND local=%s",
            (fecha, local),
        )
    except Exception:
        conn.rollback()
        try:
            return _qsum(
                cur,
                "SELECT COALESCE(SUM(importe),0) FROM cuenta_corriente_trns WHERE DATE(fecha)=%s AND local=%s",
                (fecha, local),
            )
        except Exception:
            conn.rollback()
            return 0.0


# ========= API GLOBAL =========
@app.route('/api/resumen_local', methods=['GET'])
@login_required
def api_resumen_local():
    """
    Resumen global por local+fecha (suma todas las cajas/turnos).
    Si el local está CERRADO ese día, lee de SNAPSHOTS (tablas snap_*).
    """
    local = (request.args.get('local') or session.get('local') or '').strip()
    fecha_s = (request.args.get('fecha') or '').strip()
    if not local or not fecha_s:
        return jsonify(error="Parámetros insuficientes: fecha y local son requeridos"), 400

    f = _normalize_fecha(fecha_s)
    if not f:
        return jsonify(error="Fecha inválida (formato esperado YYYY-MM-DD)"), 400

    conn = get_db_connection()
    cur  = conn.cursor()
    try:
        # ¿Local cerrado ese día? -> snapshots
        cur.execute("""
            SELECT COALESCE(MIN(estado), 1) AS min_estado
            FROM cierres_locales
            WHERE local=%s AND fecha=%s
        """, (local, f))
        row = cur.fetchone()
        local_cerrado = (row is not None and row[0] is not None and int(row[0]) == 0)

        # Tablas según estado del local
        if local_cerrado:
            T_REMESAS    = "snap_remesas"
            T_TARJETAS   = "snap_tarjetas"
            T_TIPS_TJ    = "snap_tips_tarjetas"
            T_MP         = "snap_mercadopago"
            T_RAPPI      = "snap_rappi"
            T_PEDIDOSYA  = "snap_pedidosya"
            T_GASTOS     = "snap_gastos"
            T_VENTAS     = "snap_ventas"
            T_VENTAS_Z   = "snap_ventas_z"
        else:
            T_REMESAS    = "remesas_trns"
            T_TARJETAS   = "tarjetas_trns"
            T_TIPS_TJ    = "tips_tarjetas"
            T_MP         = "mercadopago_trns"
            T_RAPPI      = "rappi_trns"
            T_PEDIDOSYA  = "pedidosya_trns"
            T_GASTOS     = "gastos_trns"
            T_VENTAS     = "ventas_trns"
            T_VENTAS_Z   = "ventas_z_trns"

        # ===== RESUMEN: venta total, Z y discovery =====
        venta_total = _qsum(
            cur,
            f"SELECT COALESCE(SUM(venta_total_sistema),0) FROM {T_VENTAS} WHERE DATE(fecha)=%s AND local=%s",
            (f, local),
        )

        # Breakdown Z por número (usa tabla dinámica)
        z_items, vta_z_total = _fetch_ventas_z_dyn(cur, f, local, T_VENTAS_Z)
        discovery = max((venta_total or 0.0) - (vta_z_total or 0.0), 0.0)

        # ===== EFECTIVO (Remesas) =====
        efectivo_remesas = _qsum(
            cur,
            f"SELECT COALESCE(SUM(monto),0) FROM {T_REMESAS} WHERE DATE(fecha)=%s AND local=%s",
            (f, local),
        )
        efectivo_neto = efectivo_remesas

        # ===== TARJETAS (por marca) — mismas marcas nuevas =====
        marcas = [
            "VISA", "VISA DEBITO", "VISA PREPAGO",
            "MASTERCARD", "MASTERCARD DEBITO", "MASTERCARD PREPAGO",
            "CABAL", "CABAL DEBITO",
            "AMEX", "MAESTRO",
            "NARANJA", "DECIDIR", "DINERS",
            "PAGOS INMEDIATOS"
        ]

        def _sum_tarjeta_from(table_name, marca):
            return _qsum(
                cur,
                f"""
                SELECT COALESCE(SUM(monto),0)
                FROM {table_name}
                WHERE DATE(fecha)=%s AND local=%s AND UPPER(tarjeta)=%s
                """,
                (f, local, marca.upper()),
            ) or 0.0

        tarjetas_det = {m: _sum_tarjeta_from(T_TARJETAS, m) for m in marcas}
        tarjeta_total = float(sum(tarjetas_det.values()))

        # ===== MP, Rappi, PedidosYa (dinámico con snap_*) =====
        mp_total = _qsum(
            cur,
            f"SELECT COALESCE(SUM(importe),0) FROM {T_MP} WHERE DATE(fecha)=%s AND local=%s AND UPPER(tipo)='NORMAL'",
            (f, local),
        )
        tips_mp = _qsum(
            cur,
            f"SELECT COALESCE(SUM(importe),0) FROM {T_MP} WHERE DATE(fecha)=%s AND local=%s AND UPPER(tipo)='TIP'",
            (f, local),
        )
        rappi_total = _qsum(
            cur,
            f"SELECT COALESCE(SUM(monto),0) FROM {T_RAPPI} WHERE DATE(fecha)=%s AND local=%s",
            (f, local),
        )
        pedidosya_total = _qsum(
            cur,
            f"SELECT COALESCE(SUM(monto),0) FROM {T_PEDIDOSYA} WHERE DATE(fecha)=%s AND local=%s",
            (f, local),
        )

        # ===== GASTOS (solo total) =====
        gastos_total = _qsum(
            cur,
            f"SELECT COALESCE(SUM(monto),0) FROM {T_GASTOS} WHERE DATE(fecha)=%s AND local=%s",
            (f, local),
        )

        # ===== CTA CTE (sin snap por ahora) =====
        cta_cte_total = _sum_cuenta_corriente(conn, cur, f, local)

        # ===== TIPS TARJETAS (incluye las nuevas columnas) =====
        tips_tarj = _qsum(
            cur,
            f"""
            SELECT COALESCE(SUM(
                COALESCE(visa_tips,0) +
                COALESCE(visa_debito_tips,0) +
                COALESCE(visa_prepago_tips,0) +
                COALESCE(mastercard_tips,0) +
                COALESCE(mastercard_debito_tips,0) +
                COALESCE(mastercard_prepago_tips,0) +
                COALESCE(cabal_tips,0) +
                COALESCE(cabal_debito_tips,0) +
                COALESCE(amex_tips,0) +
                COALESCE(maestro_tips,0) +
                COALESCE(naranja_tips,0) +
                COALESCE(diners_tips,0) +
                COALESCE(pagos_inmediatos_tips,0)
            ),0)
            FROM {T_TIPS_TJ}
            WHERE DATE(fecha)=%s AND local=%s
            """,
            (f, local),
        ) or 0.0

        tips_total = float(tips_tarj or 0.0) + float(tips_mp or 0.0)

        # ===== Totales del panel =====
        total_cobrado = float(sum([
            efectivo_neto or 0.0,
            tarjeta_total or 0.0,
            mp_total or 0.0,
            rappi_total or 0.0,
            pedidosya_total or 0.0,
            cta_cte_total or 0.0,
        ]))

        info_total = float(sum([
            efectivo_neto or 0.0,
            tarjeta_total or 0.0,
            mp_total or 0.0,
            rappi_total or 0.0,
            pedidosya_total or 0.0,
            gastos_total or 0.0,   # sólo total
            cta_cte_total or 0.0,
            tips_total or 0.0,
        ]))

        payload = {
            "fecha": fecha_s,
            "local": local,
            "local_cerrado": bool(local_cerrado),

            "resumen": {
                "venta_total": float(venta_total or 0.0),
                "total_cobrado": total_cobrado,
                "diferencia": total_cobrado - float(venta_total or 0.0)
            },

            "ventas": {
                "vta_z_total": float(vta_z_total or 0.0),
                "discovery": float(discovery or 0.0),
                "z_items": z_items
            },

            "info": {
                "total": info_total,
                "efectivo": {
                    "total": float(efectivo_neto or 0.0),
                    "remesas": float(efectivo_remesas or 0.0),
                    "neto_efectivo": float(efectivo_neto or 0.0)
                },
                "tarjeta": {
                    "total": tarjeta_total,
                    "breakdown": {k: float(v or 0.0) for k, v in tarjetas_det.items()}
                },
                "mercadopago": {
                    "total": float(mp_total or 0.0),
                    "tips": float(tips_mp or 0.0)
                },
                "rappi": { "total": float(rappi_total or 0.0) },
                "pedidosya": { "total": float(pedidosya_total or 0.0) },
                "gastos": { "total": float(gastos_total or 0.0) },
                "cuenta_cte": { "total": float(cta_cte_total or 0.0) },
                "tips": {
                    "total": float(tips_total or 0.0),
                    "mp": float(tips_mp or 0.0),
                    "tarjetas": float(tips_tarj or 0.0)
                }
            }
        }

        resp = make_response(jsonify(payload))
        resp.headers['Cache-Control'] = 'no-store, max-age=0'
        return resp

    except Exception as e:
        try: conn.rollback()
        except: ...
        return jsonify(error=str(e)), 500
    finally:
        try: cur.close()
        except: ...
        try: conn.close()
        except: ...


def _fetch_ventas_z_dyn(cur, fecha, local, table_name="ventas_z_trns"):
    """
    Igual que _fetch_ventas_z original pero con nombre de tabla dinámico.
    Devuelve (items, total) donde items = [{'numero_z': '123', 'monto': 1000.0}, ...]
    """
    numero_cols = ["numero_z", "nro_z", "z_numero", "num_z"]
    monto_cols  = ["monto", "importe", "total"]
    last_error = None

    for ncol in numero_cols:
        for mcol in monto_cols:
            try:
                cur.execute(
                    f"""
                    SELECT {ncol} AS znum, COALESCE(SUM({mcol}),0) AS total
                    FROM {table_name}
                    WHERE DATE(fecha)=%s AND local=%s
                    GROUP BY {ncol}
                    ORDER BY {ncol}
                    """,
                    (fecha, local),
                )
                rows = cur.fetchall() or []
                items = [{'numero_z': str(r[0]), 'monto': float(r[1] or 0)} for r in rows]
                return items, sum(i['monto'] for i in items)
            except Exception as e:
                last_error = e
                continue
    # Si nada funcionó, devolvemos vacío
    return [], 0.0



## _______________________________ REPORTERIA REMESAS _______________________


# --- Reportería: Remesas ---
from datetime import date, datetime, timedelta
from io import BytesIO
from flask import send_file, jsonify, render_template, request
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from openpyxl.utils import get_column_letter

# Página UI
@app.route("/reporteria/remesas")
@login_required
@role_min_required(3)  # encargado+ crea usuarios
def ui_reporteria_remesas():
    return render_template("reporte_remesas.html")

# Helpers DB
def _get_locales(cur):
    # 1) tabla "locales" si existe
    try:
        cur.execute("SELECT nombre FROM locales WHERE activo=1 ORDER BY nombre")
        rows = cur.fetchall()
        if rows:
            return [r[0] for r in rows]
    except Exception:
        pass
    # 2) fallback: distintos locales que tengan actividad
    cur.execute("""
        SELECT DISTINCT local
        FROM (
            SELECT local FROM ventas_trns
            UNION ALL
            SELECT local FROM remesas_trns
        ) t
        ORDER BY 1
    """)
    return [r[0] for r in cur.fetchall()]

def _sum_remesas_no_retiradas(cur, local, hasta_fecha):
    # Ajusta el campo "retirada" si en tu tabla es 1/0, true/false, etc.
    cur.execute("""
        SELECT COALESCE(SUM(monto),0)
        FROM remesas_trns
        WHERE local=%s
          AND retirada = 'No'
          AND DATE(fecha) <= %s
    """, (local, hasta_fecha))
    r = cur.fetchone()
    return float(r[0] or 0)

def _sum_venta_dia(cur, local, el_dia):
    cur.execute("""
        SELECT COALESCE(SUM(venta_total_sistema),0)
        FROM ventas_trns
        WHERE local=%s AND DATE(fecha)=%s
    """, (local, el_dia))
    r = cur.fetchone()
    return float(r[0] or 0)

def _dia_es_lunes(d):
    return d.weekday() == 0  # 0=Lunes

def _nombre_dia_es(d):
    # Lunes..Domingo capitalizado
    dias = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"]
    return dias[d.weekday()]

# Construye el reporte (datos)
def _build_remesas_report(fecha_sel: date):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        is_lunes = _dia_es_lunes(fecha_sel)
        dia_label = _nombre_dia_es(fecha_sel)

        locales = _get_locales(cur)
        rows = []

        # Totales
        tot = {
            "saldo_anterior": 0.0,
            "dia": 0.0,            # para días no lunes
            "viernes": 0.0,
            "sabado": 0.0,
            "domingo": 0.0,
            "total_fds": 0.0,
            "ap_proyectada": 0.0,
            "saldo_retirar": 0.0,  # siempre 0 por ahora
        }


        for loc in locales:
            saldo_ant = _sum_remesas_no_retiradas(cur, loc, fecha_sel)

            if is_lunes:
                viernes = _sum_venta_dia(cur, loc, fecha_sel - timedelta(days=3))
                sabado  = _sum_venta_dia(cur, loc, fecha_sel - timedelta(days=2))
                domingo = _sum_venta_dia(cur, loc, fecha_sel - timedelta(days=1))
                total_fds = saldo_ant + viernes + sabado + domingo
                ap_proj = total_fds  # saldo a retirar = 0
                row = {
                    "fecha": fecha_sel.isoformat(),
                    "local": loc,
                    "saldo_anterior": saldo_ant,
                    "viernes": viernes,
                    "sabado": sabado,
                    "domingo": domingo,
                    "total_fds": total_fds,
                    "ap_proyectada": ap_proj,
                    "saldo_retirar": 0.0,
                }
                # acum
                tot["saldo_anterior"] += saldo_ant
                tot["viernes"]        += viernes
                tot["sabado"]         += sabado
                tot["domingo"]        += domingo
                tot["total_fds"]      += total_fds
                tot["ap_proyectada"]  += ap_proj
                # saldo_retirar ya es 0
            else:
                monto_dia = _sum_venta_dia(cur, loc, fecha_sel)
                ap_proj = saldo_ant + monto_dia  # saldo a retirar = 0
                row = {
                    "fecha": fecha_sel.isoformat(),
                    "local": loc,
                    "saldo_anterior": saldo_ant,
                    "dia": monto_dia,
                    "ap_proyectada": ap_proj,
                    "saldo_retirar": 0.0,
                }
                # acum
                tot["saldo_anterior"] += saldo_ant
                tot["dia"]            += monto_dia
                tot["ap_proyectada"]  += ap_proj

            rows.append(row)

        return {
            "fecha": fecha_sel.isoformat(),
            "is_lunes": is_lunes,
            "dia_label": dia_label,
            "rows": rows,
            "totals": tot,
        }
    finally:
        cur.close()
        conn.close()

# API JSON
@app.route("/api/reportes/remesas")
@login_required
def api_reportes_remesas():
    f = request.args.get("fecha")
    try:
        fecha_sel = datetime.strptime(f, "%Y-%m-%d").date() if f else date.today()
    except Exception:
        return jsonify(error="fecha inválida (YYYY-MM-DD)"), 400

    data = _build_remesas_report(fecha_sel)
    return jsonify(data)

# Excel (XLSX) con estilo
@app.route("/api/reportes/remesas.xlsx")
@login_required
def api_reportes_remesas_xlsx():
    f = request.args.get("fecha")
    try:
        fecha_sel = datetime.strptime(f, "%Y-%m-%d").date() if f else date.today()
    except Exception:
        return "fecha inválida", 400

    data = _build_remesas_report(fecha_sel)

    wb = Workbook()
    ws = wb.active
    ws.title = "Remesas"

    # Estilos
    header_fill = PatternFill("solid", fgColor="EFEFEF")
    ap_fill     = PatternFill("solid", fgColor="D9D9D9")
    bold        = Font(bold=True)
    center      = Alignment(horizontal="center", vertical="center")
    right       = Alignment(horizontal="right", vertical="center")
    border = Border(left=Side(style="thin"), right=Side(style="thin"),
                    top=Side(style="thin"), bottom=Side(style="thin"))

    # Cabeceras
    if data["is_lunes"]:
        headers = ["Fecha Sello","Locales","Saldo Anterior",
                   "Viernes","Sábado","Domingo","Total FDS","Ap Proyectada","Saldo a retirar"]
    else:
        headers = ["Fecha Sello","Locales","Saldo Anterior",
                   data["dia_label"],"Ap Proyectada","Saldo a retirar"]

    ws.append(headers)

    # Header style
    for col, _ in enumerate(headers, start=1):
        c = ws.cell(row=1, column=col)
        c.font = bold
        c.alignment = center
        c.fill = header_fill
        c.border = border

    # Filas
    r0 = 2
    if data["is_lunes"]:
        for r in data["rows"]:
            ws.append([
                datetime.strptime(r["fecha"], "%Y-%m-%d").strftime("%-d/%-m/%Y") if hasattr(date, 'fromisoformat') else r["fecha"],
                r["local"],
                r["saldo_anterior"],
                r["viernes"], r["sabado"], r["domingo"],
                r["total_fds"],
                r["ap_proyectada"],
                r["saldo_retirar"]
            ])
    else:
        for r in data["rows"]:
            ws.append([
                datetime.strptime(r["fecha"], "%Y-%m-%d").strftime("%-d/%-m/%Y") if hasattr(date, 'fromisoformat') else r["fecha"],
                r["local"],
                r["saldo_anterior"],
                r["dia"],
                r["ap_proyectada"],
                r["saldo_retirar"]
            ])

    # Formato numérico y bordes
    num_fmt = '#,##0.00'
    for row in ws.iter_rows(min_row=2, max_row=ws.max_row, min_col=1, max_col=len(headers)):
        for idx, cell in enumerate(row, start=1):
            cell.border = border
            if idx >= 3:  # columnas numéricas
                cell.number_format = num_fmt
                cell.alignment = right

    # Sombrear columnas especiales
    if data["is_lunes"]:
        # Total FDS (col 7) y AP (col 8)
        for r in range(2, ws.max_row + 1):
            ws.cell(r, 7).fill = ap_fill
            ws.cell(r, 8).fill = ap_fill
    else:
        # AP (última-1)
        ap_col = 5
        for r in range(2, ws.max_row + 1):
            ws.cell(r, ap_col).fill = ap_fill

    # Totales
    ws.append([])
    totals_row = ws.max_row + 1
    if data["is_lunes"]:
        tot = data["totals"]
        ws.append([
            "Total", "",
            tot["saldo_anterior"],
            tot["viernes"], tot["sabado"], tot["domingo"],
            tot["total_fds"], tot["ap_proyectada"], 0.0
        ])
    else:
        tot = data["totals"]
        ws.append([
            "Total", "",
            tot["saldo_anterior"], tot["dia"], tot["ap_proyectada"], 0.0
        ])

    for col in range(1, len(headers)+1):
        c = ws.cell(row=totals_row, column=col)
        c.font = bold
        c.border = border
        if col >= 3:  # num
            c.number_format = num_fmt
            c.alignment = right
        if headers[col-1] in ("Total FDS","Ap Proyectada"):
            c.fill = ap_fill

    # Anchos
    col_widths = {
        1: 12,  # Fecha Sello
        2: 26,  # Locales
    }
    for i in range(3, len(headers)+1):
        col_widths[i] = 16
    for col, w in col_widths.items():
        ws.column_dimensions[get_column_letter(col)].width = w

    ws.freeze_panes = "A2"

    # Salida
    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)
    fname = f"reporte_remesas_{fecha_sel.isoformat()}.xlsx"
    return send_file(bio, as_attachment=True,
                     download_name=fname,
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")





## REGISTRO Y LOGIN NUEVO ________________________________

# utils_auth.py (o dentro de app.py si preferís archivo único)
# --- imports necesarios ---
import uuid, bcrypt
from datetime import datetime
from flask import render_template, request, jsonify, session
from functools import wraps
from mysql.connector import Error

# ---------- Decoradores mínimos ----------

# ---------- (Re)usar la función create_user ----------
def create_user(username, password_plain, role_name, local, society, pages_slugs, status='active'):
    """
    Crea usuario, asegura pages y relaciones. Devuelve dict con {user_id}
    """
    user_id = str(uuid.uuid4())
    pw_hash = bcrypt.hashpw(password_plain.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

    conn = get_db_connection()
    try:
        cur = conn.cursor()

        # Verificar username único
        cur.execute("SELECT 1 FROM users WHERE username=%s", (username,))
        if cur.fetchone():
            raise ValueError("El usuario ya existe")

        # Role
        cur.execute("SELECT id FROM roles WHERE name=%s", (role_name,))
        row = cur.fetchone()
        if not row:
            raise ValueError(f"Rol '{role_name}' no existe (cajero|encargado|auditor)")
        role_id = row[0]

        # Insert user
        cur.execute("""
            INSERT INTO users (id, username, password, role_id, local, society, status, created_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        """, (user_id, username, pw_hash, role_id, local, society, status, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))

        # Asegurar páginas y vincular
        for slug in pages_slugs:
            cur.execute("INSERT IGNORE INTO pages (slug) VALUES (%s)", (slug,))
            conn.commit()
            cur.execute("SELECT id FROM pages WHERE slug=%s", (slug,))
            pid = cur.fetchone()[0]
            cur.execute("INSERT IGNORE INTO user_pages (user_id, page_id) VALUES (%s,%s)", (user_id, pid))

        conn.commit()
        return {"user_id": user_id}
    except ValueError as ve:
        conn.rollback()
        raise ve
    except Error as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

# ---------- UI: página de creación ----------
@app.route('/admin/create-user', methods=['GET'])
@login_required
@role_min_required(2)  # Encargado (2) o Auditor (3)
def ui_create_user():
    return render_template('create_user.html')

# ---------- API: crear usuario ----------
@app.route('/api/users', methods=['POST'])
@login_required
@role_min_required(2)
def api_create_user():
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '')
    role     = (data.get('role') or '').strip()
    status   = (data.get('status') or 'active').strip() or 'active'
    local    = (data.get('local') or '').strip()
    society  = (data.get('society') or '').strip()
    pages    = data.get('pages') or []

    # Validaciones base
    if not (username and password and role and local and society):
        return jsonify(success=False, msg='Faltan campos obligatorios'), 400
    if len(password) < 4:
        return jsonify(success=False, msg='La contraseña debe tener al menos 4 caracteres'), 400
    if role not in ('cajero','encargado','auditor'):
        return jsonify(success=False, msg='Rol inválido'), 400
    if status not in ('active','inactive'):
        return jsonify(success=False, msg='Estado inválido'), 400

    # Sanitizar pages
    pages = [str(p).strip() for p in pages if str(p).strip()]

    try:
        out = create_user(username, password, role, local, society, pages, status=status)
        return jsonify(success=True, user_id=out['user_id'])
    except ValueError as ve:
        return jsonify(success=False, msg=str(ve)), 409
    except Error as e:
        return jsonify(success=False, msg=f'Error de base de datos: {e}'), 500
    except Exception as e:
        return jsonify(success=False, msg=f'Error: {e}'), 500


# ---------- Login / Logout ----------

def _fetch_user_by_username(username):
    conn = get_db_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute("""
            SELECT u.id, u.username, u.password, u.local, u.society, u.status,
                   r.id AS role_id, r.name AS role_name, r.level AS role_level
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.username=%s
            LIMIT 1
        """, (username,))
        user = cur.fetchone()
        if not user:
            return None

        # Páginas por ROL (canon)
        cur.execute("""
            SELECT p.slug
            FROM role_pages rp
            JOIN pages p ON p.id = rp.page_id
            WHERE rp.role_id=%s
        """, (user['role_id'],))
        role_pages = {row['slug'] for row in cur.fetchall()}

        # (Opcional) extras por usuario — si no querés extras, dejá user_pages = set()
        cur.execute("""
            SELECT p.slug
            FROM user_pages up
            JOIN pages p ON up.page_id = p.id
            WHERE up.user_id=%s
        """, (user['id'],))
        user_pages = {row['slug'] for row in cur.fetchall()}

        user['pages'] = sorted(role_pages | user_pages)  # rol ∪ extras
        return user
    finally:
        conn.close()


def _update_last_access(user_id):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("UPDATE users SET last_access=NOW() WHERE id=%s", (user_id,))
        conn.commit()
    finally:
        conn.close()


# --- rutas ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        # tu HTML de login que enviaste
        return render_template('login.html', error=None)

    # POST (form tradicional o JSON)
    data = request.form if request.form else (request.get_json(silent=True) or {})
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()

    user = _fetch_user_by_username(username)
    if not user or user['status'] != 'active':
        # para HTML
        if request.form:
            return render_template('login.html', error='Usuario o contraseña inválidos'), 401
        # para API
        return jsonify(ok=False, msg="Usuario o contraseña inválidos"), 401

    if not bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
        if request.form:
            return render_template('login.html', error='Usuario o contraseña inválidos'), 401
        return jsonify(ok=False, msg="Usuario o contraseña inválidos"), 401

    # Poblo session con las MISMAS claves que usa tu app
    session.clear()
    session['user_id']    = user['id']
    session['username']   = user['username']
    session['local']      = user['local']
    session['society']    = user['society']
    session['role']       = user['role_name']         # 'cajero'|'encargado'|'auditor'
    session['role_level'] = int(user['role_level'])   # 1|2|3
    session['pages']      = user['pages']             # ['index','reporte_remesas','resumen_local']

    _update_last_access(user['id'])

    # si vino por HTML -> redirect
    if request.form:
        return redirect(url_for('index'))
    # si vino por API
    return jsonify(ok=True, redirect=url_for('index'))

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


## __________________________ FIN LOGIN NUEVO ________________________








## ____________ endpoints nivel 2 ______________________

# === ruta nueva (Nivel 2) ===
@app.route('/encargado', endpoint='carga_datos_encargado')
@login_required
def carga_datos_encargado():
    # seguridad de acceso por rol: mínimo 2
    if get_user_level() < 2:
        return jsonify(success=False, msg='Acceso sólo para nivel 2+'), 403

    local = session.get('local')
    conn = get_db_connection()
    cur  = conn.cursor()

    # cajas disponibles para el local
    cur.execute("SELECT cantidad_cajas FROM locales WHERE local = %s LIMIT 1", (local,))
    row = cur.fetchone()
    cantidad_cajas = row[0] if row else 1

    # turnos habilitados
    cur.execute("SELECT turnos FROM locales WHERE local = %s", (local,))
    turnos = [r[0] for r in cur.fetchall()] or ['UNI']

    cur.close(); conn.close()

    # Renderiza copia del index (tu HTML clon)
    return render_template('index_encargado.html',
                           cantidad_cajas=cantidad_cajas,
                           turnos=turnos,
                           role_level=get_user_level())










def get_turnos_del_dia(conn, local: str, fecha):
    """
    Devuelve la lista de turnos existentes para (local, fecha).
    Fuente principal: cajas_estado. Si no hay, intenta ver en tablas operativas.
    """
    f = _normalize_fecha(fecha)
    cur = conn.cursor()
    turnos = set()

    # Fuente principal: cajas_estado (más confiable para cierres)
    cur.execute("""
        SELECT DISTINCT turno
          FROM cajas_estado
         WHERE local=%s AND DATE(fecha_operacion)=%s
           AND turno IS NOT NULL AND turno <> ''
    """, (local, f))
    for (t,) in cur.fetchall() or []:
        turnos.add(str(t))

    # Fallbacks por si no hay filas en cajas_estado (raro pero posible)
    if not turnos:
        tablas = [
            ("remesas_trns",     "fecha"),
            ("tarjetas_trns",    "fecha"),
            ("mercadopago_trns", "fecha"),
            ("gastos_trns",      "fecha"),
            ("rappi_trns",       "fecha"),
            ("pedidosya_trns",   "fecha"),
            ("ventas_base",      "fecha"),
            ("ventas_z",         "fecha"),
            ("tips_tarjetas",    "fecha"),
        ]
        for tabla, col_fecha in tablas:
            try:
                cur.execute(f"""
                    SELECT DISTINCT turno
                      FROM {tabla}
                     WHERE local=%s AND DATE({col_fecha})=%s
                       AND turno IS NOT NULL AND turno <> ''
                """, (local, f))
                for (t,) in cur.fetchall() or []:
                    turnos.add(str(t))
            except Exception:
                # Si alguna tabla no existe / no tiene turno en tu entorno, la salteamos
                pass

    cur.close()
    return sorted(turnos)
def create_snapshot_for_local_by_day(conn, local: str, fecha, made_by: str):
    """
    Genera snapshots por CADA turno existente en el día.
    Usa la función ya existente: create_snapshot_for_local(conn, local, fecha, turno, made_by)
    """
    f = _normalize_fecha(fecha)
    turnos = get_turnos_del_dia(conn, local, f)

    # Si no detectamos turnos, igualmente intentamos con uno "UNI" (por si tu operación es de turno único)
    if not turnos:
        turnos = ["UNI"]

    for turno in turnos:
        # Tu función ya existente; no la reescribimos
        create_snapshot_for_local(conn, local, f, turno, made_by=made_by)







## ______________________ CIERRE LOCAL _______________________
@app.route('/api/cierre_local', methods=['POST'])
@login_required
@role_min_required(2)  # mínimo L2
def api_cierre_local():
    data  = request.get_json() or {}
    local = session.get('local')
    fecha = data.get('fecha')

    if not (local and fecha):
        return jsonify(success=False, msg='falta local/fecha'), 400

    f = _normalize_fecha(fecha)
    if not f:
        return jsonify(success=False, msg='fecha inválida'), 400

    conn = get_db_connection()
    cur  = conn.cursor(dictionary=True)
    try:
        # (1) Verificar que NO queden cajas abiertas ese día (en cualquier turno)
        cur.execute("""
            SELECT DISTINCT caja
              FROM cajas_estado
             WHERE local=%s AND DATE(fecha_operacion)=%s AND estado=1
        """, (local, f))
        abiertas = [r['caja'] for r in (cur.fetchall() or [])]
        if abiertas:
            return jsonify(success=False, msg='Hay cajas abiertas', detalle=abiertas), 409

        # (2) Marcar/crear cierre de local (sin columna turno)
        cur.execute("""
          INSERT INTO cierres_locales (local, fecha, estado, closed_by, closed_at)
          VALUES (%s,%s,0,%s,NOW())
          ON DUPLICATE KEY UPDATE
            estado=VALUES(estado),
            closed_by=VALUES(closed_by),
            closed_at=VALUES(closed_at)
        """, (local, f, session.get('username')))

        # (3) Pasar estado='ok' en todas las tablas operativas del día (sin turno)
        updates = [
          ("remesas_trns",     "UPDATE remesas_trns     SET estado='ok' WHERE local=%s AND DATE(fecha)=%s"),
          ("mercadopago_trns", "UPDATE mercadopago_trns SET estado='ok' WHERE local=%s AND DATE(fecha)=%s"),
          ("tarjetas_trns",    "UPDATE tarjetas_trns    SET estado='ok' WHERE local=%s AND DATE(fecha)=%s"),
          ("gastos_trns",      "UPDATE gastos_trns      SET estado='ok' WHERE local=%s AND DATE(fecha)=%s"),
          ("rappi_trns",       "UPDATE rappi_trns       SET estado='ok' WHERE local=%s AND DATE(fecha)=%s"),
          ("pedidosya_trns",   "UPDATE pedidosya_trns   SET estado='ok' WHERE local=%s AND DATE(fecha)=%s"),
          ("ventas_base",      "UPDATE ventas_base      SET estado='ok' WHERE local=%s AND DATE(fecha)=%s"),
          ("ventas_z",         "UPDATE ventas_z         SET estado='ok' WHERE local=%s AND DATE(fecha)=%s"),
          ("tips_tarjetas",    "UPDATE tips_tarjetas    SET estado='ok' WHERE local=%s AND DATE(fecha)=%s"),
        ]
        for _, sql in updates:
            try:
                cur.execute(sql, (local, f))
            except Exception:
                # Por si tenés alguna tabla aún no creada en todos los entornos
                pass

        # (4) Congelar snapshot por CADA turno del día (usa tu función existente con 'turno')
        create_snapshot_for_local_by_day(conn, local, f, made_by=session.get('username'))

        conn.commit()
        return jsonify(success=True, msg="Cierre del local confirmado y snapshots por turno creados")
    except Exception as e:
        conn.rollback()
        print("❌ cierre_local:", e)
        return jsonify(success=False, msg=str(e)), 500
    finally:
        try: cur.close()
        except: ...
        try: conn.close()
        except: ...



def create_snapshot_for_local(conn, local:str, fecha, turno:str, made_by:str):
    """
    Congela el estado 'aceptado por L2' (lo que hay en tablas operativas
    tras pasar a estado='ok') en tablas snap_* para (local, fecha, turno).
    Idempotente: si existe snapshot, lo reutiliza y repuebla su contenido.
    """
    f = _normalize_fecha(fecha)
    cur = conn.cursor()

    # Cabecera: upsert que preserve el id para reinsertar detalles
    cur.execute("""
        INSERT INTO cierre_snapshots (local, fecha, turno, made_at, made_by)
        VALUES (%s,%s,%s,NOW(),%s)
        ON DUPLICATE KEY UPDATE made_at=VALUES(made_at), made_by=VALUES(made_by)
    """, (local, f, turno, made_by))

    # Obtener id (si ya existía, lo recuperamos)
    cur.execute("SELECT id FROM cierre_snapshots WHERE local=%s AND fecha=%s AND turno=%s",
                (local, f, turno))
    snapshot_id = cur.fetchone()[0]

    # Limpiamos detalles previos de ese snapshot para repoblar
    for tbl in (
        "snap_remesas",
        "snap_tarjetas",
        "snap_tips_tarjetas",
        "snap_mercadopago",
        "snap_ventas",
        "snap_ventas_z",
        "snap_gastos",
        "snap_rappi",
        "snap_pedidosya",
    ):
        cur.execute(f"DELETE FROM {tbl} WHERE snapshot_id=%s", (snapshot_id,))

    # --- Remesas ---
    cur.execute("""
        INSERT INTO snap_remesas
        (snapshot_id, id_src, usuario, local, caja, turno, fecha, nro_remesa, precinto, monto,
         retirada, retirada_por, fecha_retirada, ult_mod, estado)
        SELECT %s, r.id, r.usuario, r.local, r.caja, r.turno, DATE(r.fecha), r.nro_remesa,
               r.precinto, r.monto, r.retirada, r.retirada_por, r.fecha_retirada, r.ult_mod, r.estado
          FROM remesas_trns r
         WHERE r.local=%s AND DATE(r.fecha)=%s AND r.turno=%s
    """, (snapshot_id, local, f, turno))

    # --- Tarjetas ---
    cur.execute("""
        INSERT INTO snap_tarjetas
        (snapshot_id, id_src, usuario, local, caja, turno, fecha, tarjeta, terminal, lote, monto, estado)
        SELECT %s, t.id, t.usuario, t.local, t.caja, t.turno, DATE(t.fecha), t.tarjeta, t.terminal, t.lote, t.monto, t.estado
          FROM tarjetas_trns t
         WHERE t.local=%s AND DATE(t.fecha)=%s AND t.turno=%s
    """, (snapshot_id, local, f, turno))

    # --- Tips tarjetas ---
    cur.execute("""
        INSERT INTO snap_tips_tarjetas
        (snapshot_id, local, caja, turno, fecha, terminal, lote,
         visa_tips, visa_debito_tips, visa_prepago_tips,
         mastercard_tips, mastercard_debito_tips, mastercard_prepago_tips,
         cabal_tips, cabal_debito_tips, amex_tips, maestro_tips,
         naranja_tips, diners_tips, pagos_inmediatos_tips, estado)
        SELECT %s, tt.local, tt.caja, tt.turno, DATE(tt.fecha), tt.terminal, tt.lote,
               tt.visa_tips, tt.visa_debito_tips, tt.visa_prepago_tips,
               tt.mastercard_tips, tt.mastercard_debito_tips, tt.mastercard_prepago_tips,
               tt.cabal_tips, tt.cabal_debito_tips, tt.amex_tips, tt.maestro_tips,
               tt.naranja_tips, tt.diners_tips, tt.pagos_inmediatos_tips, tt.estado
          FROM tips_tarjetas tt
         WHERE tt.local=%s AND DATE(tt.fecha)=%s AND tt.turno=%s
    """, (snapshot_id, local, f, turno))

    # --- Mercado Pago ---
    cur.execute("""
        INSERT INTO snap_mercadopago
        (snapshot_id, id_src, usuario, local, caja, turno, fecha, tipo, terminal, comprobante, importe, estado)
        SELECT %s, m.id, m.usuario, m.local, m.caja, m.turno, DATE(m.fecha),
               UPPER(m.tipo), m.terminal, m.comprobante, m.importe, m.estado
          FROM mercadopago_trns m
         WHERE m.local=%s AND DATE(m.fecha)=%s AND m.turno=%s
    """, (snapshot_id, local, f, turno))

    # --- Ventas (base) ---
    cur.execute("""
        INSERT INTO snap_ventas
        (snapshot_id, id_src, usuario, local, caja, turno, fecha, venta_total_sistema, estado)
        SELECT %s, v.id, v.usuario, v.local, v.caja, v.turno, DATE(v.fecha), v.venta_total_sistema, v.estado
          FROM ventas_trns v
         WHERE v.local=%s AND DATE(v.fecha)=%s AND v.turno=%s
    """, (snapshot_id, local, f, turno))

    # --- Ventas Z ---
    cur.execute("""
        INSERT INTO snap_ventas_z
        (snapshot_id, id_src, local, caja, turno, fecha, punto_venta, numero_z, monto, estado)
        SELECT %s, vz.id, vz.local, vz.caja, vz.turno, DATE(vz.fecha), vz.punto_venta, vz.numero_z, vz.monto, vz.estado
          FROM ventas_z_trns vz
         WHERE vz.local=%s AND DATE(vz.fecha)=%s AND vz.turno=%s
    """, (snapshot_id, local, f, turno))

    # --- Gastos ---
    cur.execute("""
        INSERT INTO snap_gastos
        (snapshot_id, id_src, local, caja, turno, fecha, tipo, monto, observaciones, estado)
        SELECT %s, g.id, g.local, g.caja, g.turno, DATE(g.fecha), g.tipo, g.monto, g.observaciones, g.estado
          FROM gastos_trns g
         WHERE g.local=%s AND DATE(g.fecha)=%s AND g.turno=%s
    """, (snapshot_id, local, f, turno))

    # --- Rappi ---
    cur.execute("""
        INSERT INTO snap_rappi
        (snapshot_id, id_src, local, caja, turno, fecha, transaccion, monto, estado)
        SELECT %s, r.id, r.local, r.caja, r.turno, DATE(r.fecha), r.transaccion, r.monto, r.estado
          FROM rappi_trns r
         WHERE r.local=%s AND DATE(r.fecha)=%s AND r.turno=%s
    """, (snapshot_id, local, f, turno))

    # --- PedidosYa ---
    cur.execute("""
        INSERT INTO snap_pedidosya
        (snapshot_id, id_src, local, caja, turno, fecha, transaccion, monto, estado)
        SELECT %s, r.id, r.local, r.caja, r.turno, DATE(r.fecha), r.transaccion, r.monto, r.estado
          FROM pedidosya_trns r
         WHERE r.local=%s AND DATE(r.fecha)=%s AND r.turno=%s
    """, (snapshot_id, local, f, turno))

    cur.close()
    # commit lo hace quien llama



@app.get("/estado_local")
@login_required
def estado_local():
    local = session.get("local")
    fecha = request.args.get("fecha") or session.get('fecha')
    if not (local and fecha):
        return jsonify(ok=False, msg="Faltan parámetros"), 400

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Consideramos "local cerrado" si TODOS los turnos están con estado=0
        # Si no tenés tabla de turnos por local, podés inferirlos de cajas_estado.
        cur.execute("""
            SELECT COALESCE(MIN(estado), 1) AS min_estado
            FROM cierres_locales
            WHERE local=%s AND fecha=%s
        """, (local, _normalize_fecha(fecha)))
        row = cur.fetchone()
        # Si no hay filas => lo consideramos ABIERTO (estado=1)
        estado = 1 if (row is None or row[0] is None) else int(row[0])
        return jsonify(ok=True, estado=estado)
    finally:
        cur.close(); conn.close()


def crear_snapshot_local(conn, local, fecha, usuario):
    """
    Congela (copia) la foto del día por local a tablas *snap*.
    Idempotente: podés borrar e insertar, o usar UPSERT por (local, fecha, ...).
    """
    # --- REMESAS (ejemplo simple) ---
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO remesas_snap (local, fecha, caja, turno, nro_remesa, precinto, monto, retirada, retirada_por, fuente_usuario, ts_snap)
        SELECT local, DATE(fecha) AS fecha, caja, turno, nro_remesa, precinto, monto, retirada, retirada_por, %s, NOW()
        FROM remesas_trns
        WHERE local=%s AND DATE(fecha)=%s
        ON DUPLICATE KEY UPDATE
          monto=VALUES(monto), retirada=VALUES(retirada), retirada_por=VALUES(retirada_por), ts_snap=VALUES(ts_snap)
    """, (usuario, local, fecha))
    cur.close()

    # --- TARJETAS (ejemplo simple) ---
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO tarjetas_snap (local, fecha, caja, turno, tarjeta, terminal, lote, monto, fuente_usuario, ts_snap)
        SELECT local, DATE(fecha), caja, turno, tarjeta, terminal, lote, monto, %s, NOW()
        FROM tarjetas_trns
        WHERE local=%s AND DATE(fecha)=%s
        ON DUPLICATE KEY UPDATE
          monto=VALUES(monto), ts_snap=VALUES(ts_snap)
    """, (usuario, local, fecha))
    cur.close()

    # --- TIPS TARJETAS (opcional) ---
    cur = conn.cursor()
    cur.execute(f"""
        INSERT INTO tips_tarjetas_snap
          (local, fecha, caja, turno, terminal, lote, {", ".join(_ALL_TIP_COLS)}, fuente_usuario, ts_snap)
        SELECT local, DATE(fecha), caja, turno, terminal, lote, {", ".join(_ALL_TIP_COLS)}, %s, NOW()
        FROM tips_tarjetas
        WHERE local=%s AND DATE(fecha)=%s
        ON DUPLICATE KEY UPDATE
          ts_snap=VALUES(ts_snap) {"" if not _ALL_TIP_COLS else ","}
          {", ".join([f"{c}=VALUES({c})" for c in _ALL_TIP_COLS])}
    """, (usuario, local, fecha))
    cur.close()

    # >>> Agregá aquí otras fuentes (MP, Rappi, Gastos, etc.) con el mismo patrón.






