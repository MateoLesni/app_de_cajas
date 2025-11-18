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
    "MASTERCARD PREPAGO": "MASTE",  # Se suma con MASTERCARD
    "VISA": "VISA",
    "VISA DEBITO": "VISAD",
    "VISA PREPAGO": "VISA",  # Se suma con VISA
    "CABAL": "CABAL",
    "CABAL DEBITO": "CABALD",
    "NARANJA": "NARAN",
    "DISCOVERY": "DISCOVERY",
    "DINERS": "DINER",
    "MAESTRO": "MAEST",  # Nueva tarjeta
    "DECIDIR": "MASDL",  # MAS DELIVERY
    "MAS DELIVERY": "MASDL",

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
            # -------- TARJETAS (con propinas sumadas por lote/terminal) --------
            # Primero, obtener ventas de tarjetas agrupadas por marca, terminal y lote
            sql_tar = f"""
                SELECT t.tarjeta AS marca, t.terminal, t.lote, SUM(t.monto) AS total_venta
                FROM tarjetas_trns t
                WHERE t.local = %s
                  AND DATE(t.fecha) = DATE(%s)
                  AND t.estado = 'ok'
                  {g.read_scope}
                GROUP BY t.tarjeta, t.terminal, t.lote
            """
            cur.execute(sql_tar, (local, fecha))
            ventas_tarjetas = cur.fetchall()

            # Segundo, obtener propinas de tarjetas agrupadas por marca, terminal y lote
            sql_tips = f"""
                SELECT t.tarjeta AS marca, t.terminal, t.lote, SUM(t.monto_tip) AS total_tips
                FROM tarjetas_trns t
                WHERE t.local = %s
                  AND DATE(t.fecha) = DATE(%s)
                  {g.read_scope}
                GROUP BY t.tarjeta, t.terminal, t.lote
            """
            cur.execute(sql_tips, (local, fecha))
            tips_tarjetas = {(r["marca"], r["terminal"], r["lote"]): r["total_tips"] for r in cur.fetchall()}

            # Crear un diccionario para agrupar por código (para unificar VISA+VISA PREPAGO, etc.)
            # Clave: (code, terminal, lote)
            agrupado = {}

            for r in ventas_tarjetas:
                marca_orig = (r.get("marca") or "").strip().upper()

                # Reemplazar DECIDIR por MAS DELIVERY antes de mapear
                if marca_orig == "DECIDIR":
                    marca_orig = "MAS DELIVERY"

                code = _fp_to_code(marca_orig)
                terminal = (r.get("terminal") or "").strip()
                lote = (r.get("lote") or "").strip()
                venta = r.get("total_venta") or 0

                # Obtener propinas para este lote/terminal/marca original
                tips = tips_tarjetas.get((r.get("marca"), terminal, lote), 0)

                key = (code, terminal, lote)
                if key not in agrupado:
                    agrupado[key] = 0
                agrupado[key] += venta + tips

            # Generar filas finales
            for (code, terminal, lote), total in sorted(agrupado.items()):
                desc = f"{terminal} / {lote}".strip(" /")
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

            # -------- PROPINAS (en negativo) --------
            # 1) PROPINAS de tarjetas (suma de monto_tip de tarjetas_trns)
            sql_tips_tarjetas = f"""
                SELECT SUM(t.monto_tip) AS total
                FROM tarjetas_trns t
                WHERE t.local = %s
                  AND DATE(t.fecha) = DATE(%s)
                  {g.read_scope}
            """
            cur.execute(sql_tips_tarjetas, (local, fecha))
            tips_tarj = cur.fetchone()
            total_tips_tarjetas = tips_tarj.get("total") if tips_tarj else 0

            if total_tips_tarjetas and total_tips_tarjetas > 0:
                rows.append({
                    "forma_pago": "PROPINAS",
                    "descripcion": "PROPINAS",
                    "tarjeta_credito": "",
                    "plan": "",
                    "cuotas": "",
                    "nro_lote": "",
                    "cheque_cupon": "",
                    "pagado": _n0(-1 * total_tips_tarjetas),  # NEGATIVO
                })

            # 2) PROPINAS de Mercado Pago (tipo='TIP' en mercadopago_trns)
            sql_tips_mp = f"""
                SELECT SUM(t.importe) AS total
                FROM mercadopago_trns t
                WHERE t.local = %s
                  AND DATE(t.fecha) = DATE(%s)
                  AND UPPER(t.tipo) = 'TIP'
                  {g.read_scope}
            """
            cur.execute(sql_tips_mp, (local, fecha))
            tips_mp = cur.fetchone()
            total_tips_mp = tips_mp.get("total") if tips_mp else 0

            if total_tips_mp and total_tips_mp > 0:
                rows.append({
                    "forma_pago": "PROPINAS",
                    "descripcion": "PROPINASMP",
                    "tarjeta_credito": "",
                    "plan": "",
                    "cuotas": "",
                    "nro_lote": "",
                    "cheque_cupon": "",
                    "pagado": _n0(-1 * total_tips_mp),  # NEGATIVO
                })

            # -------- DISCOVERY y DIFERENCIA (calculados directamente) --------
            # DISCOVERY = venta_total_sistema - (facturas_Z + facturas_A + facturas_B)
            # DIFERENCIA = total_cobrado - venta_total_sistema

            try:
                # 1. Obtener venta_total_sistema
                cur.execute(f"""
                    SELECT COALESCE(SUM(t.venta_total_sistema), 0) AS total
                    FROM ventas_trns t
                    WHERE t.local = %s AND DATE(t.fecha) = DATE(%s)
                    {g.read_scope}
                """, (local, fecha))
                row_venta = cur.fetchone()
                venta_total_sistema = float(row_venta['total']) if row_venta else 0.0

                # 2. Obtener suma de facturas Z, A, B
                cur.execute(f"""
                    SELECT COALESCE(SUM(t.monto), 0) AS total
                    FROM facturas_trns t
                    WHERE t.local = %s AND DATE(t.fecha) = DATE(%s)
                    AND t.tipo IN ('Z', 'A', 'B')
                    {g.read_scope}
                """, (local, fecha))
                row_facturas = cur.fetchone()
                total_facturas_zab = float(row_facturas['total']) if row_facturas else 0.0

                # 3. Calcular DISCOVERY (venta_total - facturas Z+A+B)
                # El valor se invierte de signo para el recibo (lógica contable)
                discovery_val = venta_total_sistema - total_facturas_zab

                # 4. Calcular total_cobrado para DIFERENCIA
                # efectivo (remesas)
                cur.execute(f"""
                    SELECT COALESCE(SUM(t.monto), 0) AS total
                    FROM remesas_trns t
                    WHERE t.local = %s AND DATE(t.fecha) = DATE(%s)
                    {g.read_scope}
                """, (local, fecha))
                efectivo_total = float(cur.fetchone()['total'] or 0.0)

                # tarjetas
                cur.execute(f"""
                    SELECT COALESCE(SUM(t.monto), 0) AS total
                    FROM tarjetas_trns t
                    WHERE t.local = %s AND DATE(t.fecha) = DATE(%s)
                    {g.read_scope}
                """, (local, fecha))
                tarjeta_total = float(cur.fetchone()['total'] or 0.0)

                # mercadopago (tipo='NORMAL')
                cur.execute(f"""
                    SELECT COALESCE(SUM(t.importe), 0) AS total
                    FROM mercadopago_trns t
                    WHERE t.local = %s AND DATE(t.fecha) = DATE(%s)
                    AND UPPER(t.tipo) = 'NORMAL'
                    {g.read_scope}
                """, (local, fecha))
                mp_total = float(cur.fetchone()['total'] or 0.0)

                # rappi
                cur.execute(f"""
                    SELECT COALESCE(SUM(t.monto), 0) AS total
                    FROM rappi_trns t
                    WHERE t.local = %s AND DATE(t.fecha) = DATE(%s)
                    {g.read_scope}
                """, (local, fecha))
                rappi_total = float(cur.fetchone()['total'] or 0.0)

                # pedidosya
                cur.execute(f"""
                    SELECT COALESCE(SUM(t.monto), 0) AS total
                    FROM pedidosya_trns t
                    WHERE t.local = %s AND DATE(t.fecha) = DATE(%s)
                    {g.read_scope}
                """, (local, fecha))
                pedidosya_total = float(cur.fetchone()['total'] or 0.0)

                # cuenta corriente (facturas CC - suma como medio de cobro)
                cur.execute(f"""
                    SELECT COALESCE(SUM(t.monto), 0) AS total
                    FROM facturas_trns t
                    WHERE t.local = %s AND DATE(t.fecha) = DATE(%s)
                    AND t.tipo = 'CC'
                    {g.read_scope}
                """, (local, fecha))
                cta_cte_total = float(cur.fetchone()['total'] or 0.0)

                # 5. Calcular total_cobrado y DIFERENCIA
                # Las facturas A, B, Z NO suman al total cobrado (solo sirven para calcular discovery)
                # Solo las facturas CC (cuenta corriente) suman como medio de cobro
                total_cobrado = float(sum([
                    efectivo_total,
                    tarjeta_total,
                    mp_total,
                    rappi_total,
                    pedidosya_total,
                    cta_cte_total,  # Solo CC suma (cuenta corriente)
                ]))

                diferencia_val = total_cobrado - venta_total_sistema

                # 6. Agregar DISCOVERY (siempre, invertido en signo para lógica contable)
                rows.append({
                    "forma_pago": "DISCOVERY",
                    "descripcion": "DISCOVERY",
                    "tarjeta_credito": "",
                    "plan": "",
                    "cuotas": "",
                    "nro_lote": "",
                    "cheque_cupon": "",
                    "pagado": _n0(-1 * discovery_val),  # Invertir signo
                })

                # 7. Agregar DIFERENCIA (siempre, invertido en signo para lógica contable)
                rows.append({
                    "forma_pago": "DIFRECAU",
                    "descripcion": "DIFERENCIA DE CAJA",
                    "tarjeta_credito": "",
                    "plan": "",
                    "cuotas": "",
                    "nro_lote": "",
                    "cheque_cupon": "",
                    "pagado": _n0(-1 * diferencia_val),  # Invertir signo
                })

            except Exception as e:
                # Si hay error, simplemente no agregar estos items
                print(f"⚠️ Error al calcular DISCOVERY/DIFERENCIA: {e}", file=__import__('sys').stderr)
                pass

        # orden estable para visual
        rows.sort(key=lambda x: (str(x.get("descripcion") or "").upper()))

        return jsonify({"rows": rows, "success": True})

    finally:
        try:
            conn.close()
        except Exception:
            pass

@auditoria_bp.route("/api/auditoria/facturas")
@login_required
@with_read_scope(alias="t")
def auditor_facturas_api():
    """
    Devuelve facturas para la tabla del Auditor (4 columnas):
    tipo, id_comentario, importe, comentario

    Reglas:
    - Z/A/B: id_comentario = "punto_venta-nro_factura" (ej: "55555-88888888"), comentario = "-"
    - CC: id_comentario = nro_factura, comentario = comentario de DB
    """
    local = (request.args.get("local") or "").strip()
    fecha = (request.args.get("fecha") or "").strip()  # YYYY-MM-DD

    if not local or not fecha:
        return jsonify(success=False, msg="Faltan parámetros 'local' y/o 'fecha'"), 400

    conn = get_db_connection()
    rows = []

    try:
        with conn.cursor(dictionary=True) as cur:
            # Consultar facturas_trns
            sql = f"""
                SELECT t.tipo, t.punto_venta, t.nro_factura,
                 t.monto, t.comentario
                FROM facturas_trns t
                WHERE t.local = %s
                  AND DATE(t.fecha) = DATE(%s)
                  {g.read_scope}
                ORDER BY t.tipo, t.nro_factura
            """
            cur.execute(sql, (local, fecha))

            for r in cur.fetchall():
                tipo = (r.get("tipo") or "").strip().upper()
                monto = r.get("monto") or 0

                if tipo in ("Z", "A", "B"):
                    # Formato: "punto_venta-nro_factura"
                    pv = str(r.get("punto_venta") or "0").zfill(5)
                    nf = str(r.get("nro_factura") or "0").zfill(8)
                    id_comentario = f"{pv}-{nf}"
                    comentario_col = "-"
                elif tipo == "CC":
                    # Id = nro_factura, comentario = comentario de DB
                    id_comentario = str(r.get("nro_factura") or "")
                    comentario_col = (r.get("comentario") or "").strip()
                else:
                    # Tipo desconocido (por si acaso)
                    id_comentario = ""
                    comentario_col = ""

                rows.append({
                    "tipo": tipo,
                    "id_comentario": id_comentario,
                    "importe": _n0(monto),
                    "comentario": comentario_col,
                })

        return jsonify({"rows": rows, "success": True})

    finally:
        try:
            conn.close()
        except Exception:
            pass

@auditoria_bp.route("/api/auditoria/propinas")
@login_required
@with_read_scope(alias="t")
def auditor_propinas_api():
    """
    Devuelve filas con propinas y discovery:
    - PROPINAS/PROPINAS: suma de tips de tarjetas + tips de MP (tipo='TIP')
    - DISCOVERY/DISCOVERY: monto de discovery desde resumen

    Formato: [{"cuenta": "...", "descripcion": "...", "monto": "..."}, ...]
    """
    local = (request.args.get("local") or "").strip()
    fecha = (request.args.get("fecha") or "").strip()

    if not local or not fecha:
        return jsonify(success=False, msg="Faltan parámetros 'local' y/o 'fecha'"), 400

    conn = get_db_connection()
    rows = []

    try:
        with conn.cursor(dictionary=True) as cur:
            # 1) Sumar tips de tarjetas
            sql_tips_tarjetas = f"""
                SELECT SUM(monto_tip) AS total
                FROM tarjetas_trns t
                WHERE t.local = %s
                  AND DATE(t.fecha) = DATE(%s)
                  {g.read_scope}
            """
            cur.execute(sql_tips_tarjetas, (local, fecha))
            result_tarjetas = cur.fetchone()
            tips_tarjetas = result_tarjetas.get("total") if result_tarjetas else 0

            # 2) Sumar tips de Mercado Pago (tipo='TIP')
            sql_tips_mp = f"""
                SELECT SUM(importe) AS total
                FROM mercadopago_trns t
                WHERE t.local = %s
                  AND DATE(t.fecha) = DATE(%s)
                  AND t.tipo = 'TIP'
                  {g.read_scope}
            """
            cur.execute(sql_tips_mp, (local, fecha))
            result_mp = cur.fetchone()
            tips_mp = result_mp.get("total") if result_mp else 0

            # Suma total de propinas
            total_propinas = (tips_tarjetas or 0) + (tips_mp or 0)

            if total_propinas > 0:
                rows.append({
                    "cuenta": "PROPINAS",
                    "descripcion": "PROPINAS",
                    "monto": _n0(total_propinas),
                })

            # 3) DISCOVERY desde resumen
            # Buscar en la tabla que guarda los importes por tarjeta (agrupado)
            sql_discovery = f"""
                SELECT SUM(t.monto) AS total
                FROM tarjetas_trns t
                WHERE t.local = %s
                  AND DATE(t.fecha) = DATE(%s)
                  AND UPPER(t.tarjeta) = 'DISCOVERY'
                  {g.read_scope}
            """
            cur.execute(sql_discovery, (local, fecha))
            result_discovery = cur.fetchone()
            total_discovery = result_discovery.get("total") if result_discovery else 0

            if total_discovery and total_discovery > 0:
                rows.append({
                    "cuenta": "DISCOVERY",
                    "descripcion": "DISCOVERY",
                    "monto": _n0(total_discovery),
                })

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
