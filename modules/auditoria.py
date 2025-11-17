# modules/auditoria.py
from __future__ import annotations
import os
from flask import Blueprint, render_template, request, jsonify, g
import mysql.connector

# Importa helpers/decoradores desde tu app principal
# (si los tenés en otro módulo, ajustá el import)
from app import (
    get_db_connection,
    login_required,
    with_read_scope,  # expone g.read_scope con el fragmento SQL por rol
)

auditoria_bp = Blueprint("auditoria", __name__)

# ------------------ Mapeos de Forma de Pago -> Código de software ------------------
FP_CODE_MAP = {
    # Tarjetas
    "AMEX": "AMEX",
    "MASTERCARD": "MASTE",
    "MASTERCARD DEBITO": "MASTED",
    "VISA": "VISA",
    "VISA DEBITO": "VISAD",
    "CABAL": "CABAL",
    "CABAL DEBITO": "CABALD",
    "NARANJA": "NARAN",
    "DISCOVERY": "DISCO",

    # Agregadores / links
    "PAGOS INMEDIATOS": "PAGOINMED",
    "MERCADO PAGO": "MERPAG",
    "PEDIDOS YA": "PEDIDOYA",
    "RAPPI": "RAPPI",

    # Varios (gastos/otros)
    "DIFERENCIA DE CAJA": "DIFRECAU",
    "REMESAS": "REMESAS",
    "PROPINAS": "PROPINAS",
    "SERVICIO DE SEGURIDAD": "SEGURIDAD",
    "PAGO DE VIATICOS A PERSONAL": "VPERSONAL",
    "GASTOS LOGISTICOS": "GLOGISTICA",
    "PAGOS A PERSONAL EVENTUAL": "SEVENTUALES",
    "SERVICIO DE DJ": "DJ",
    "SERVICIO DE LIMPIEZA": "LIMPIEZAEV",
    "COMPRA DE MERCADERIA SIN MR": "COMPRAMER",
    "MANTENIMIENTO DE LOCALES": "MANLOCALES",
    "OTROS GASTOS DE OPERACION": "GOPERACION",
    "ARREGLOS FLORALES": "AFLOR",
}

def _fp_to_code(nombre_fp: str) -> str:
    """Mapea el nombre (tal como llega de la DB) al código del software."""
    if not nombre_fp:
        return ""
    key = nombre_fp.strip().upper()
    return FP_CODE_MAP.get(key, key)  # si no está mapeado, devolvemos el texto en mayúsculas

def _n0(v) -> str:
    """
    Devuelve número sin separador de miles (string).
    - Si llega 62000.0 => "62000"
    - Si llega "6.000" => "6000"
    """
    if v is None:
        return ""
    try:
        return str(int(round(float(v))))
    except Exception:
        s = str(v).replace(".", "").replace(",", ".")
        try:
            return str(int(round(float(s))))
        except Exception:
            return ""

# ------------------ Vistas ------------------

@auditoria_bp.route("/auditoria")
@login_required
def auditor_view():
    """
    Página del auditor (HTML).
    Recibe local y fecha como query params desde resumen_local.
    Los filtros están deshabilitados - solo se usan los parámetros de URL.
    """
    import sys
    from flask import session

    local = request.args.get('local') or session.get('local')
    fecha = request.args.get('fecha')

    print(f"🔍 /auditoria - Parámetros recibidos: local={local}, fecha={fecha}", file=sys.stderr, flush=True)
    print(f"🔍 /auditoria - Session: {session.get('local')}", file=sys.stderr, flush=True)
    print(f"🔍 /auditoria - Query args: {dict(request.args)}", file=sys.stderr, flush=True)

    # Si no hay parámetros, usar valores de sesión/defaults
    if not local:
        local = session.get('local', '')
    if not fecha:
        from datetime import date
        fecha = date.today().isoformat()

    print(f"🔍 /auditoria - Valores finales: local='{local}', fecha='{fecha}'", file=sys.stderr, flush=True)

    return render_template("auditor.html", local=local, fecha=fecha)

@auditoria_bp.route("/api/auditoria/resumen")
@login_required
@with_read_scope(alias="t")  # expone g.read_scope con subquery de visibilidad según rol
def auditor_resumen_api():
    """
    Devuelve filas normalizadas para la tabla del Auditor (8 columnas):
    forma_pago, descripcion, tarjeta_credito, plan, cuotas, nro_lote, cheque_cupon, pagado

    Reglas:
    - Tarjetas: descripcion = "terminal / lote"
    - MERPAG / RAPPI / PEDIDOYA: descripcion tal cual
    - REMESAS: UNA FILA POR REMESA -> descripcion = nro_remesa
    - 'pagado' sale sin separador de miles
    """
    local = (request.args.get("local") or "").strip()
    fecha = (request.args.get("fecha") or "").strip()  # YYYY-MM-DD

    if not local or not fecha:
        return jsonify(success=False, msg="Faltan parámetros 'local' y/o 'fecha'"), 400

    conn = get_db_connection()
    rows = []

    try:
        with conn.cursor(dictionary=True) as cur:
            # -------- TARJETAS --------
            # Se asume: tarjetas_trns(local, fecha, estado, tarjeta, terminal, lote, monto, turno, caja, ...)
            sql_tar = f"""
                SELECT t.tarjeta AS marca, t.terminal, t.lote, t.monto
                FROM tarjetas_trns t
                WHERE t.local = %s
                  AND DATE(t.fecha) = DATE(%s)
                  AND t.estado = 'ok'
                  {g.read_scope}
            """
            cur.execute(sql_tar, (local, fecha))
            for r in cur.fetchall():
                marca = (r.get("marca") or "").strip().upper()
                code = _fp_to_code(marca)
                terminal = (r.get("terminal") or "").strip()
                lote = (r.get("lote") or "").strip()
                desc = f"{terminal} / {lote}".strip(" /")
                rows.append({
                    "forma_pago": code,
                    "descripcion": desc,
                    "tarjeta_credito": "",
                    "plan": "",
                    "cuotas": "",
                    "nro_lote": "",
                    "cheque_cupon": "",
                    "pagado": _n0(r.get("monto")),
                })

            # -------- MERCADO PAGO --------
            # Se asume: mercadopago_trns(local, fecha, importe, turno, caja, ...)
            sql_mp = f"""
                SELECT SUM(t.importe) AS total
                FROM mercadopago_trns t
                WHERE t.local = %s
                  AND DATE(t.fecha) = DATE(%s)
                  {g.read_scope}
            """
            cur.execute(sql_mp, (local, fecha))
            mp = cur.fetchone()
            if mp and mp["total"]:
                rows.append({
                    "forma_pago": _fp_to_code("MERCADO PAGO"),
                    "descripcion": "MERCADO PAGO",
                    "tarjeta_credito": "",
                    "plan": "",
                    "cuotas": "",
                    "nro_lote": "",
                    "cheque_cupon": "",
                    "pagado": _n0(mp["total"]),
                })

            # -------- RAPPI --------
            # Se asume: rappi_trns(local, fecha, monto, turno, caja, ...)
            sql_rp = f"""
                SELECT SUM(t.monto) AS total
                FROM rappi_trns t
                WHERE t.local = %s
                  AND DATE(t.fecha) = DATE(%s)
                  {g.read_scope}
            """
            cur.execute(sql_rp, (local, fecha))
            rp = cur.fetchone()
            if rp and rp["total"]:
                rows.append({
                    "forma_pago": _fp_to_code("RAPPI"),
                    "descripcion": "RAPPI",
                    "tarjeta_credito": "",
                    "plan": "",
                    "cuotas": "",
                    "nro_lote": "",
                    "cheque_cupon": "",
                    "pagado": _n0(rp["total"]),
                })

            # -------- PEDIDOS YA --------
            # Se asume: pedidosya_trns(local, fecha, monto, turno, caja, ...)
            sql_py = f"""
                SELECT SUM(t.monto) AS total
                FROM pedidosya_trns t
                WHERE t.local = %s
                  AND DATE(t.fecha) = DATE(%s)
                  {g.read_scope}
            """
            cur.execute(sql_py, (local, fecha))
            py = cur.fetchone()
            if py and py["total"]:
                rows.append({
                    "forma_pago": _fp_to_code("PEDIDOS YA"),
                    "descripcion": "PEDIDOS YA",
                    "tarjeta_credito": "",
                    "plan": "",
                    "cuotas": "",
                    "nro_lote": "",
                    "cheque_cupon": "",
                    "pagado": _n0(py["total"]),
                })

            # -------- REMESAS (UNA FILA POR REMESA) --------
            # Tabla: remesas_trns(local, fecha, nro_remesa, monto, turno, caja, ...)
            sql_rem = f"""
                SELECT t.nro_remesa, t.monto
                FROM remesas_trns t
                WHERE t.local = %s
                  AND DATE(t.fecha) = DATE(%s)
                  {g.read_scope}
                ORDER BY t.nro_remesa
            """
            cur.execute(sql_rem, (local, fecha))
            for rrem in cur.fetchall():
                nro = rrem.get("nro_remesa")
                rows.append({
                    "forma_pago": _fp_to_code("REMESAS"),
                    "descripcion": str(nro) if nro is not None else "REMESAS",
                    "tarjeta_credito": "",
                    "plan": "",
                    "cuotas": "",
                    "nro_lote": "",
                    "cheque_cupon": "",
                    "pagado": _n0(rrem.get("monto")),
                })

            # -------- PROPINAS (tips tarjetas / mp) --------
            # Se asume: tips_tarjetas(local, fecha, visa_tips, ...)
            sql_tips = f"""
                SELECT SUM(monto) AS total
                FROM facturas_trns t
                WHERE t.local = %s
                  AND DATE(t.fecha) = DATE(%s)
                  {g.read_scope}
            """
            cur.execute(sql_tips, (local, fecha))
            tips = cur.fetchone()
            if tips and tips["total"]:
                rows.append({
                    "forma_pago": _fp_to_code("PROPINAS"),
                    "descripcion": "PROPINAS",
                    "tarjeta_credito": "",
                    "plan": "",
                    "cuotas": "",
                    "nro_lote": "",
                    "cheque_cupon": "",
                    "pagado": _n0(tips["total"]),
                })

            # -------- GASTOS --------
            # Se asume: gastos_trns(local, fecha, tipo, monto, ...)
            sql_gastos = f"""
                SELECT t.tipo, SUM(t.monto) AS total
                FROM gastos_trns t
                WHERE t.local = %s
                  AND DATE(t.fecha) = DATE(%s)
                  {g.read_scope}
                GROUP BY t.tipo
            """
            cur.execute(sql_gastos, (local, fecha))
            for gitem in cur.fetchall():
                desc = (gitem.get("tipo") or "").strip()  # usar 'tipo' según tu esquema actual
                if not desc:
                    continue
                code = _fp_to_code(desc)
                total = gitem.get("total") or 0
                if total:
                    rows.append({
                        "forma_pago": code,
                        "descripcion": desc,
                        "tarjeta_credito": "",
                        "plan": "",
                        "cuotas": "",
                        "nro_lote": "",
                        "cheque_cupon": "",
                        "pagado": _n0(total),
                    })

            # -------- DIFERENCIA DE CAJA (opcional) --------
            # (dejé tu bloque como estaba apuntando a remesas_trns si así lo usás)
            sql_dif = f"""
                SELECT SUM(t.monto) AS total
                FROM remesas_trns t
                WHERE t.local = %s
                  AND DATE(t.fecha) = DATE(%s)
                  {g.read_scope}
            """
            try:
                cur.execute(sql_dif, (local, fecha))
                dif = cur.fetchone()
                if dif and dif["total"]:
                    rows.append({
                        "forma_pago": "DIFRECAU",
                        "descripcion": "DIFERENCIA DE CAJA",
                        "tarjeta_credito": "",
                        "plan": "",
                        "cuotas": "",
                        "nro_lote": "",
                        "cheque_cupon": "",
                        "pagado": _n0(dif["total"]),
                    })
            except Exception:
                pass

        # orden estable para visual
        rows.sort(key=lambda x: (str(x.get("descripcion") or "").upper()))

        return jsonify({"rows": rows, "success": True})

    finally:
        try:
            conn.close()
        except Exception:
            pass

@auditoria_bp.route("/api/locales")
@login_required
def auditoria_locales():
    """
    Devuelve lista de locales para el selector:
    { "locales": [ {"nombre": "Fabric Sushi"}, ... ] }
    """
    conn = get_db_connection()
    locales = []
    try:
        # 1) intenta tabla 'locales' si la tenés
        with conn.cursor(dictionary=True) as cur:
            try:
                cur.execute("SELECT nombre FROM locales ORDER BY nombre")
                locales = [{"nombre": r["nombre"]} for r in cur.fetchall()]
            except Exception:
                # 2) fallback: distintos locales desde alguna tabla operativa
                cur.execute("""
                    SELECT DISTINCT local AS nombre
                    FROM (
                        SELECT local, fecha FROM tarjetas_trns
                        UNION ALL
                        SELECT local, fecha FROM mercadopago_trns
                        UNION ALL
                        SELECT local, fecha FROM rappi_trns
                        UNION ALL
                        SELECT local, fecha FROM pedidosya_trns
                        UNION ALL
                        SELECT local, fecha FROM remesas_trns
                        UNION ALL
                        SELECT local, fecha FROM gastos_trns
                    ) x
                    ORDER BY nombre
                """)
                locales = [{"nombre": r["nombre"]} for r in cur.fetchall()]
    finally:
        try:
            conn.close()
        except Exception:
            pass

    return jsonify({"locales": locales})
