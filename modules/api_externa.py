"""
API externa de solo lectura para otras aplicaciones del grupo.

Autenticacion: API key compartida (env CAJAS_API_KEY, cargada desde Secret Manager
en Cloud Run), enviada en el header `X-API-Key` o como `Authorization: Bearer <key>`.
No usa sesion ni usuarios de la app. Si CAJAS_API_KEY no esta configurada, la API
responde 503 (nunca queda abierta por accidente).

Endpoints:
  GET /api/externa/locales
  GET /api/externa/ventas?fecha=YYYY-MM-DD[&local=X&local=Y]
  GET /api/externa/ventas?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD[&local=X]
  GET /api/externa/remesas[?fecha=YYYY-MM-DD | ?fecha_desde=...&fecha_hasta=...][&local=X&local=Y]
"""
import os
import hmac
from functools import wraps
from datetime import datetime, timedelta, date
from decimal import Decimal

import pytz

from flask import Blueprint, request, jsonify

api_externa_bp = Blueprint("api_externa", __name__, url_prefix="/api/externa")

LOCALES_OCULTOS = {"Local_Test"}
MAX_DIAS_RANGO = 366
MAX_DIAS_REMESAS = 93       # las remesas son una fila por remesa: se acota el rango
TZ_AR = pytz.timezone("America/Argentina/Buenos_Aires")


def _api_key() -> str:
    return (os.getenv("CAJAS_API_KEY") or "").strip()


def api_key_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        esperada = _api_key()
        if not esperada:
            return jsonify(success=False, msg="API externa no configurada (falta CAJAS_API_KEY)"), 503
        recibida = (request.headers.get("X-API-Key") or "").strip()
        if not recibida:
            auth = request.headers.get("Authorization") or ""
            if auth.lower().startswith("bearer "):
                recibida = auth[7:].strip()
        if not recibida or not hmac.compare_digest(recibida, esperada):
            return jsonify(success=False, msg="API key inválida o ausente"), 401
        return fn(*args, **kwargs)
    return wrapper


def _parse_fecha(txt):
    try:
        return datetime.strptime((txt or "").strip(), "%Y-%m-%d").date()
    except ValueError:
        return None


def _ayer_ar():
    return (datetime.now(TZ_AR) - timedelta(days=1)).date()


def _rango_desde_request(max_dias=MAX_DIAS_RANGO, default_ayer=False):
    """(desde, hasta, error). Acepta ?fecha=D o ?fecha_desde=A&fecha_hasta=B.
    Con default_ayer=True, si no se manda ninguna fecha se usa el dia de ayer (hora de Argentina)."""
    fecha = request.args.get("fecha")
    desde_txt, hasta_txt = request.args.get("fecha_desde"), request.args.get("fecha_hasta")
    if default_ayer and not (fecha or desde_txt or hasta_txt):
        return _ayer_ar(), _ayer_ar(), None
    if fecha:
        d = _parse_fecha(fecha)
        if not d:
            return None, None, "fecha inválida (formato YYYY-MM-DD)"
        return d, d, None
    if not (desde_txt and hasta_txt):
        return None, None, "Indicá fecha=YYYY-MM-DD, o fecha_desde y fecha_hasta"
    desde, hasta = _parse_fecha(desde_txt), _parse_fecha(hasta_txt)
    if not desde or not hasta:
        return None, None, "fecha_desde / fecha_hasta inválidas (formato YYYY-MM-DD)"
    if desde > hasta:
        return None, None, "fecha_desde debe ser menor o igual a fecha_hasta"
    if (hasta - desde).days > max_dias:
        return None, None, f"El rango no puede superar {max_dias} días"
    return desde, hasta, None


def _conn():
    from app import get_db_connection  # import tardio: app.py importa este modulo
    return get_db_connection()


def _locales_existentes(cur):
    cur.execute("SELECT DISTINCT local FROM locales WHERE local IS NOT NULL AND local <> '' ORDER BY local")
    return [r["local"] for r in cur.fetchall() if r.get("local") and r["local"] not in LOCALES_OCULTOS]


@api_externa_bp.get("/locales")
@api_key_required
def api_externa_locales():
    conn = _conn()
    cur = conn.cursor(dictionary=True)
    try:
        return jsonify(success=True, locales=_locales_existentes(cur))
    finally:
        cur.close(); conn.close()


@api_externa_bp.get("/ventas")
@api_key_required
def api_externa_ventas():
    """
    Venta por local y dia. Por cada (local, fecha) con datos:
      venta_total   -> venta declarada (Z del sistema, ventas_trns.venta_total_sistema)
      ventas_extras -> ajustes de reporteria (ventas_extras activas, pueden ser negativos)
      total         -> venta_total + ventas_extras
      local_cerrado -> el encargado cerro el local ese dia
      auditado      -> auditoria confirmo ese dia (dato definitivo)
    """
    desde, hasta, err = _rango_desde_request()
    if err:
        return jsonify(success=False, msg=err), 400
    pedidos = []
    for l in request.args.getlist("local"):
        l = (l or "").strip()
        if l and l not in pedidos:
            pedidos.append(l)

    conn = _conn()
    cur = conn.cursor(dictionary=True)
    try:
        existentes = _locales_existentes(cur)
        if pedidos:
            desconocidos = [l for l in pedidos if l not in existentes]
            if desconocidos:
                return jsonify(success=False, msg=f"Local(es) inexistente(s): {', '.join(desconocidos)}", locales_validos=existentes), 404
            locales = pedidos
        else:
            locales = existentes
        if not locales:
            return jsonify(success=True, fecha_desde=desde.isoformat(), fecha_hasta=hasta.isoformat(), items=[], totales={})

        ph = ",".join(["%s"] * len(locales))
        base = [desde, hasta] + locales

        cur.execute(f"""
            SELECT local, DATE(fecha) AS fecha, SUM(venta_total_sistema) AS monto
            FROM ventas_trns
            WHERE DATE(fecha) BETWEEN %s AND %s AND COALESCE(estado, '') <> 'eliminado' AND local IN ({ph})
            GROUP BY local, DATE(fecha)
        """, base)
        ventas = {(r["local"], r["fecha"]): float(r["monto"] or 0) for r in cur.fetchall()}

        cur.execute(f"""
            SELECT local, fecha, SUM(monto) AS monto
            FROM ventas_extras
            WHERE fecha BETWEEN %s AND %s AND estado = 'activo' AND local IN ({ph})
            GROUP BY local, fecha
        """, base)
        extras = {(r["local"], r["fecha"]): float(r["monto"] or 0) for r in cur.fetchall()}

        cur.execute(f"""
            SELECT local, fecha, estado FROM cierres_locales
            WHERE fecha BETWEEN %s AND %s AND local IN ({ph})
        """, base)
        cerrados = {(r["local"], r["fecha"]) for r in cur.fetchall() if r["estado"] is not None and int(r["estado"]) == 0}

        cur.execute(f"""
            SELECT local, DATE(fecha) AS fecha FROM locales_auditados
            WHERE DATE(fecha) BETWEEN %s AND %s AND local IN ({ph})
        """, base)
        auditados = {(r["local"], r["fecha"]) for r in cur.fetchall()}

        items = []
        tot_v = tot_e = 0.0
        for key in sorted(set(ventas) | set(extras), key=lambda k: (k[0], k[1])):
            v, e = round(ventas.get(key, 0.0), 2), round(extras.get(key, 0.0), 2)
            tot_v += v; tot_e += e
            items.append({
                "local": key[0],
                "fecha": key[1].isoformat(),
                "venta_total": v,
                "ventas_extras": e,
                "total": round(v + e, 2),
                "local_cerrado": key in cerrados,
                "auditado": key in auditados,
            })
        return jsonify(
            success=True,
            fecha_desde=desde.isoformat(), fecha_hasta=hasta.isoformat(),
            locales=locales if pedidos else None,
            items=items,
            totales={"dias": len(items), "venta_total": round(tot_v, 2), "ventas_extras": round(tot_e, 2), "total": round(tot_v + tot_e, 2)},
        )
    except Exception as e:
        print("❌ api_externa_ventas:", e)
        return jsonify(success=False, msg="Error interno"), 500
    finally:
        try: cur.close()
        except Exception: pass
        try: conn.close()
        except Exception: pass


# Columnas de remesas_trns que expone la API (mismo orden que la consulta original).
REMESAS_COLUMNAS = (
    "id", "local", "caja", "turno", "usuario", "estado", "fecha", "fecha_retirada",
    "fecha_marca_retirada", "nro_remesa", "precinto", "monto", "retirada", "retirada_por",
    "estado_contable", "fecha_estado_local", "fecha_estado_tran", "fecha_estado_contabilizada",
    "ult_mod", "fecha_creacion", "divisa", "monto_usd", "cotizacion_divisa", "total_conversion",
    "origen_anticipo_id",
)


def _json_val(v):
    if isinstance(v, datetime):
        return v.isoformat(sep=" ")
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    return v


@api_externa_bp.get("/remesas")
@api_key_required
def api_externa_remesas():
    """
    Remesas (remesas_trns) por local y fecha, una fila por remesa y con todas las columnas
    de la tabla (ver REMESAS_COLUMNAS). Sin filtrar por estado: cada fila trae su `estado`
    (y `estado_contable`) para que quien consume decida.

    Parametros:
      fecha=YYYY-MM-DD  |  fecha_desde=...&fecha_hasta=...   (si no se manda ninguna: ayer)
      local=X           repetible; sin local = todos los locales. No distingue mayusculas.
    Rango maximo: 93 dias.
    """
    desde, hasta, err = _rango_desde_request(max_dias=MAX_DIAS_REMESAS, default_ayer=True)
    if err:
        return jsonify(success=False, msg=err), 400
    pedidos = []
    for l in request.args.getlist("local"):
        l = (l or "").strip()
        if l and l.lower() not in [p.lower() for p in pedidos]:
            pedidos.append(l)

    conn = _conn()
    cur = conn.cursor(dictionary=True)
    try:
        existentes = _locales_existentes(cur)
        por_minuscula = {e.lower(): e for e in existentes}
        if pedidos:
            desconocidos = [l for l in pedidos if l.lower() not in por_minuscula]
            if desconocidos:
                return jsonify(success=False, msg=f"Local(es) inexistente(s): {', '.join(desconocidos)}", locales_validos=existentes), 404
            locales = [por_minuscula[l.lower()] for l in pedidos]
        else:
            locales = existentes
        if not locales:
            return jsonify(success=True, fecha_desde=desde.isoformat(), fecha_hasta=hasta.isoformat(), items=[], totales={})

        ph = ",".join(["%s"] * len(locales))
        cols = ", ".join(f"`{c}`" for c in REMESAS_COLUMNAS)
        cur.execute(
            f"SELECT {cols} FROM remesas_trns WHERE `fecha` BETWEEN %s AND %s AND `local` IN ({ph}) "
            "ORDER BY `fecha` DESC, `id` ASC",
            [desde, hasta] + locales,
        )
        items = [{c: _json_val(r.get(c)) for c in REMESAS_COLUMNAS} for r in cur.fetchall()]

        return jsonify(
            success=True,
            fecha_desde=desde.isoformat(), fecha_hasta=hasta.isoformat(),
            locales=locales if pedidos else None,
            items=items,
            totales={"remesas": len(items)},
        )
    except Exception as e:
        print("❌ api_externa_remesas:", e)
        return jsonify(success=False, msg="Error interno"), 500
    finally:
        try: cur.close()
        except Exception: pass
        try: conn.close()
        except Exception: pass
