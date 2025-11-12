# modules/terminales.py
from __future__ import annotations
from flask import Blueprint, request, jsonify, render_template, session
from app import get_db_connection, login_required, get_user_level  # ajustá si tu import cambia
import mysql.connector

terminales_bp = Blueprint("terminales", __name__)

# ------------------------- Permisos -------------------------
def _require_level(min_level: int = 3):
    """True si el usuario logueado cumple el nivel requerido."""
    try:
        lvl = int(get_user_level())
    except Exception:
        lvl = 1
    return lvl >= min_level

def _forbidden(msg="No autorizado"):
    return jsonify(success=False, msg=msg), 403

# ------------------------- Normalizadores -------------------
def _norm(s):
    if s is None:
        return ""
    return str(s).strip()

# ------------------------- API ------------------------------

@terminales_bp.get("/api/terminales")
@login_required
def api_list_terminales():
    """
    Lista terminales. Filtros:
      - ?local=Fabric%20Sushi  -> solo ese local
      - ?q=POS-01              -> búsqueda contiene en terminal o local
    """
    local = _norm(request.args.get("local"))
    q     = _norm(request.args.get("q"))

    sql = ["SELECT id, local, terminal, creada_por, fecha_creacion FROM terminales"]
    where = []
    args = []

    if local:
        where.append("local = %s")
        args.append(local)

    if q:
        where.append("(terminal LIKE %s OR local LIKE %s)")
        like = f"%{q}%"
        args.extend([like, like])

    if where:
        sql.append("WHERE " + " AND ".join(where))
    sql.append("ORDER BY local, terminal")
    query = " ".join(sql)

    conn = get_db_connection()
    try:
        with conn.cursor(dictionary=True) as cur:
            cur.execute(query, tuple(args))
            rows = cur.fetchall()
        return jsonify({"success": True, "items": rows})
    finally:
        try: conn.close()
        except: pass


@terminales_bp.get("/api/terminales/<int:tid>")
@login_required
def api_get_terminal(tid: int):
    conn = get_db_connection()
    try:
        with conn.cursor(dictionary=True) as cur:
            cur.execute("SELECT id, local, terminal, creada_por, fecha_creacion FROM terminales WHERE id=%s", (tid,))
            row = cur.fetchone()
            if not row:
                return jsonify(success=False, msg="No encontrado"), 404
        return jsonify(success=True, item=row)
    finally:
        try: conn.close()
        except: pass


@terminales_bp.post("/api/terminales")
@login_required
def api_create_terminal():
    if not _require_level(3):
        return _forbidden("Solo nivel 3 puede crear terminales")

    data = request.get_json() or {}
    local    = _norm(data.get("local"))
    terminal = _norm(data.get("terminal"))
    if not local or not terminal:
        return jsonify(success=False, msg="Faltan campos: local y terminal"), 400

    user = session.get("username") or "system"

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            try:
                cur.execute("""
                    INSERT INTO terminales (local, terminal, creada_por)
                    VALUES (%s, %s, %s)
                """, (local, terminal, user))
                conn.commit()
            except mysql.connector.IntegrityError as e:
                # Duplica por UNIQUE(local,terminal)
                return jsonify(success=False, msg="Ya existe esa terminal para el local"), 409

        # devolver fila creada
        with conn.cursor(dictionary=True) as cur2:
            cur2.execute("""
                SELECT id, local, terminal, creada_por, fecha_creacion
                  FROM terminales
                 WHERE local=%s AND terminal=%s
                 ORDER BY id DESC
                 LIMIT 1
            """, (local, terminal))
            row = cur2.fetchone()
        return jsonify(success=True, item=row or {"local": local, "terminal": terminal})
    finally:
        try: conn.close()
        except: pass


@terminales_bp.put("/api/terminales/<int:tid>")
@login_required
def api_update_terminal(tid: int):
    if not _require_level(3):
        return _forbidden("Solo nivel 3 puede editar terminales")

    data = request.get_json() or {}
    new_local    = data.get("local")
    new_terminal = data.get("terminal")

    if new_local is None and new_terminal is None:
        return jsonify(success=False, msg="Nada para actualizar"), 400

    # Traer actual para verificar existencia y cambios
    conn = get_db_connection()
    try:
        with conn.cursor(dictionary=True) as cur:
            cur.execute("SELECT id, local, terminal FROM terminales WHERE id=%s", (tid,))
            row = cur.fetchone()
            if not row:
                return jsonify(success=False, msg="No encontrado"), 404

        # Preparar update
        sets = []
        args = []
        if new_local is not None:
            sets.append("local=%s")
            args.append(_norm(new_local))
        if new_terminal is not None:
            sets.append("terminal=%s")
            args.append(_norm(new_terminal))
        args.append(tid)

        if not sets:
            return jsonify(success=True, item=row)  # sin cambios

        with conn.cursor() as cur2:
            try:
                cur2.execute(f"UPDATE terminales SET {', '.join(sets)} WHERE id=%s", tuple(args))
                conn.commit()
            except mysql.connector.IntegrityError:
                return jsonify(success=False, msg="Ya existe esa terminal para ese local"), 409

        with conn.cursor(dictionary=True) as cur3:
            cur3.execute("SELECT id, local, terminal, creada_por, fecha_creacion FROM terminales WHERE id=%s", (tid,))
            out = cur3.fetchone()
        return jsonify(success=True, item=out)
    finally:
        try: conn.close()
        except: pass


@terminales_bp.delete("/api/terminales/<int:tid>")
@login_required
def api_delete_terminal(tid: int):
    if not _require_level(3):
        return _forbidden("Solo nivel 3 puede borrar terminales")

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM terminales WHERE id=%s", (tid,))
            deleted = cur.rowcount
            conn.commit()
        if deleted == 0:
            return jsonify(success=False, msg="No encontrado"), 404
        return jsonify(success=True, deleted=deleted)
    finally:
        try: conn.close()
        except: pass


@terminales_bp.get("/api/terminales/by-local")
@login_required
def api_by_local():
    """
    Atajo para poblar el selector: ?local=Fabric%20Sushi
    Devuelve: { items: [ {id, terminal}, ... ] }
    """
    local = _norm(request.args.get("local"))
    if not local:
        return jsonify(success=False, msg="Falta ?local"), 400

    conn = get_db_connection()
    try:
        with conn.cursor(dictionary=True) as cur:
            cur.execute("""
                SELECT id, terminal
                  FROM terminales
                 WHERE local=%s
                 ORDER BY terminal
            """, (local,))
            rows = cur.fetchall()
        return jsonify(success=True, items=rows)
    finally:
        try: conn.close()
        except: pass

# ------------------------- Vista HTML (nivel 3) -------------------------

@terminales_bp.get("/terminales")
@login_required
def terminales_view():
    """
    Placeholder de la vista de gestión (solo nivel 3).
    Luego metemos el HTML real; por ahora validamos acceso.
    """
    if not _require_level(3):
        # Podés redirigir o devolver 403; acá devolvemos 403 JSON para claridad:
        return _forbidden("Solo nivel 3 puede gestionar terminales")
    # Cuando quieras, creamos un template 'terminales.html'
    # con una tabla editable: list, create, update, delete usando los endpoints de arriba.
    return render_template("terminales.html")  # crearemos el HTML en el siguiente paso
