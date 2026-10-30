"""Reporte diario de distribucion de la venta por medio de cobro, con foco en terminales BK (Qantara).

Un bloque por local + un consolidado. Los porcentajes son sobre lo cobrado (sin propinas, que se informan aparte).
"Plan Out" se detecta en comentarios de cuenta corriente 'Otro cliente' (CNGCC) y se informa como medio de cobro propio.
Todo el resto de la cuenta corriente va en 'Cuenta corriente'.
"""
import re
from collections import OrderedDict
from unicodedata import normalize as _unormalize, combining as _ucombining

LOCALES_REPORTE = ['Cruza Recoleta', 'Cruza Polo', 'Cochinchina', 'Narda Sucre', 'La Mala',
                   'Malita', 'Costa7070', 'Kona', 'Milvidas']

# Orden y etiqueta de los medios en el reporte
MEDIOS = OrderedDict([
    ('tarjeta_qantara', 'Tarjetas Qantara'),
    ('qr_qantara', 'QR Qantara'),
    ('tarjeta_otras', 'Tarjetas (otras terminales)'),
    ('qr_otras', 'QR (otras terminales)'),
    ('efectivo', 'Efectivo'),
    ('mercadopago', 'MercadoPago'),
    ('rappi', 'Rappi'),
    ('pedidosya', 'PedidosYa'),
    ('anticipos', 'Anticipos consumidos'),
    ('plan_out', 'Plan Out'),
    ('cuenta_corriente', 'Cuenta corriente'),
])
GRUPO_QANTARA = ('tarjeta_qantara', 'qr_qantara')

# "planout", "plan out", "plan-out", "plan aut", "planaut"
_RE_PLANOUT = re.compile(r'plan\W*(out|aut|ot)\b')


def _norm(s):
    s = ''.join(c for c in _unormalize('NFD', (s or '').strip()) if not _ucombining(c))
    return ' '.join(s.lower().split())


def es_plan_out(comentario):
    return bool(_RE_PLANOUT.search(_norm(comentario)))


def _f(v):
    return float(v or 0)


def armar_reporte(conn, desde, hasta=None, locales=None):
    """desde/hasta: 'YYYY-MM-DD' (hasta opcional = un solo dia). Devuelve dict con bloques por local y consolidado."""
    hasta = hasta or desde
    locales = list(locales or LOCALES_REPORTE)
    ph = ','.join(['%s'] * len(locales))
    cur = conn.cursor(dictionary=True)
    datos = {l: {k: 0.0 for k in MEDIOS} for l in locales}
    propinas = {l: {'qantara': 0.0, 'otras': 0.0} for l in locales}
    marcas = {l: {} for l in locales}          # detalle por marca de tarjeta {(qantara?, marca): monto}
    plan_out_det = {l: [] for l in locales}    # comentarios clasificados Plan Out

    # Tarjetas y QR. Subconsulta de terminales para no duplicar filas si el maestro repite una terminal.
    cur.execute(f"""
        SELECT t.local, UPPER(TRIM(t.tarjeta)) AS tarjeta, COALESCE(tm.bk, 0) AS es_bk,
               SUM(t.monto) AS monto, SUM(COALESCE(t.monto_tip, 0)) AS propina
        FROM tarjetas_trns t
        LEFT JOIN (SELECT local, terminal, MAX(bk) AS bk FROM terminales GROUP BY local, terminal) tm
               ON tm.local = t.local AND tm.terminal = t.terminal
        WHERE DATE(t.fecha) BETWEEN %s AND %s AND t.local IN ({ph})
        GROUP BY t.local, UPPER(TRIM(t.tarjeta)), COALESCE(tm.bk, 0)
    """, [desde, hasta] + locales)
    for r in cur.fetchall() or []:
        l = r['local']
        bk = int(r['es_bk'] or 0) == 1
        es_qr = _norm(r['tarjeta']) == 'pagos inmediatos'
        clave = ('qr_' if es_qr else 'tarjeta_') + ('qantara' if bk else 'otras')
        datos[l][clave] += _f(r['monto'])
        propinas[l]['qantara' if bk else 'otras'] += _f(r['propina'])
        if not es_qr:
            k = (bk, _norm(r['tarjeta']).upper() or '(SIN TIPO)')
            marcas[l][k] = marcas[l].get(k, 0.0) + _f(r['monto'])

    # Efectivo (remesas; USD convertido a ARS)
    cur.execute(f"""
        SELECT local, SUM(CASE WHEN UPPER(COALESCE(divisa,'ARS'))='USD'
                    THEN COALESCE(NULLIF(total_conversion,0), monto_usd*cotizacion_divisa, 0)
                    ELSE monto END) AS m
        FROM remesas_trns WHERE DATE(fecha) BETWEEN %s AND %s AND local IN ({ph}) AND origen_anticipo_id IS NULL GROUP BY local
    """, [desde, hasta] + locales)
    for r in cur.fetchall() or []:
        datos[r['local']]['efectivo'] += _f(r['m'])

    # MercadoPago (TIP = propina)
    cur.execute(f"""
        SELECT local, UPPER(TRIM(tipo)) AS tipo, SUM(importe) AS m
        FROM mercadopago_trns WHERE DATE(fecha) BETWEEN %s AND %s AND local IN ({ph}) GROUP BY local, UPPER(TRIM(tipo))
    """, [desde, hasta] + locales)
    for r in cur.fetchall() or []:
        if r['tipo'] == 'TIP':
            propinas[r['local']]['otras'] += _f(r['m'])
        else:
            datos[r['local']]['mercadopago'] += _f(r['m'])

    for tabla, clave in (('rappi_trns', 'rappi'), ('pedidosya_trns', 'pedidosya')):
        cur.execute(f"SELECT local, SUM(monto) AS m FROM {tabla} WHERE DATE(fecha) BETWEEN %s AND %s AND local IN ({ph}) GROUP BY local",
                    [desde, hasta] + locales)
        for r in cur.fetchall() or []:
            datos[r['local']][clave] += _f(r['m'])

    cur.execute(f"""SELECT local, SUM(importe_consumido) AS m FROM anticipos_estados_caja
        WHERE fecha BETWEEN %s AND %s AND local IN ({ph}) AND estado = 'consumido' GROUP BY local""", [desde, hasta] + locales)
    for r in cur.fetchall() or []:
        datos[r['local']]['anticipos'] += _f(r['m'])

    cerrados, auditados = set(), set()
    cur.execute(f"SELECT local FROM cierres_locales WHERE fecha BETWEEN %s AND %s AND local IN ({ph})", [desde, hasta] + locales)
    cerrados = {r['local'] for r in cur.fetchall() or []}
    cur.execute(f"SELECT local FROM locales_auditados WHERE fecha BETWEEN %s AND %s AND local IN ({ph})", [desde, hasta] + locales)
    auditados = {r['local'] for r in cur.fetchall() or []}

    # Cuenta corriente: 'Otro cliente' con Plan Out -> medio propio; el resto -> cuenta corriente
    cur.execute(f"""
        SELECT t.local, t.monto, t.comentario, COALESCE(c.codigo_oppen, '') AS cod
        FROM cuentas_corrientes_trns t
        LEFT JOIN clientes_cta_cte c ON c.id = t.cliente_id
        WHERE DATE(t.fecha) BETWEEN %s AND %s AND t.local IN ({ph}) AND COALESCE(t.estado, 'ok') = 'ok'
    """, [desde, hasta] + locales)
    for r in cur.fetchall() or []:
        l, m = r['local'], _f(r['monto'])
        if r['cod'] == 'CNGCC' and es_plan_out(r['comentario']):
            datos[l]['plan_out'] += m
            plan_out_det[l].append({'comentario': (r['comentario'] or '').strip(), 'monto': round(m, 2)})
        else:
            datos[l]['cuenta_corriente'] += m
    cur.close()

    def _bloque(nombre, d, prop, marc, po, estado=None):
        total = sum(d.values())
        filas = []
        for k, etiqueta in MEDIOS.items():
            filas.append({'clave': k, 'medio': etiqueta, 'monto': round(d[k], 2),
                          'pct': round(d[k] * 100.0 / total, 1) if total else 0.0})
        qantara = sum(d[k] for k in GRUPO_QANTARA)
        brand = sorted(({'qantara': q, 'marca': m, 'monto': round(v, 2)} for (q, m), v in marc.items() if v),
                       key=lambda x: (not x['qantara'], -x['monto']))
        return {'local': nombre, 'estado': estado, 'total_cobrado': round(total, 2), 'medios': filas,
                'qantara': {'monto': round(qantara, 2), 'pct': round(qantara * 100.0 / total, 1) if total else 0.0},
                'detalle_marcas': brand, 'propinas': {k: round(v, 2) for k, v in prop.items()},
                'plan_out_detalle': po}

    bloques = [_bloque(l, datos[l], propinas[l], marcas[l], plan_out_det[l],
                         ('auditado' if l in auditados else ('cerrado' if l in cerrados else 'abierto')) if desde == hasta else None) for l in locales]
    cons = {k: sum(datos[l][k] for l in locales) for k in MEDIOS}
    cons_prop = {k: sum(propinas[l][k] for l in locales) for k in ('qantara', 'otras')}
    cons_marc = {}
    for l in locales:
        for k, v in marcas[l].items():
            cons_marc[k] = cons_marc.get(k, 0.0) + v
    consolidado = _bloque('TOTAL (9 locales)', cons, cons_prop, cons_marc,
                          [x for l in locales for x in plan_out_det[l]])
    return {'fecha_desde': desde, 'fecha_hasta': hasta, 'locales': bloques, 'consolidado': consolidado}


def _ars(v):
    return '$ ' + f"{v:,.0f}".replace(',', '.')


def _pct(v):
    return f"{v:.1f}".replace('.', ',') + '%'


def _rango_txt(rep):
    f = lambda x: f"{x[8:10]}/{x[5:7]}/{x[:4]}"
    d, h = rep['fecha_desde'], rep['fecha_hasta']
    return f(d) if d == h else f"{f(d)} al {f(h)}"


def render_html(rep):
    """HTML del mail (estilos inline, sin dependencias externas)."""
    th = 'style="text-align:left;padding:6px 10px;background:#1F4E78;color:#fff;font-size:13px"'
    thr = 'style="text-align:right;padding:6px 10px;background:#1F4E78;color:#fff;font-size:13px"'
    td = 'style="padding:5px 10px;border-bottom:1px solid #e5e5e5;font-size:13px"'
    tdr = 'style="padding:5px 10px;border-bottom:1px solid #e5e5e5;font-size:13px;text-align:right"'
    qbg = 'background:#FFF4D6;'

    def tabla(b):
        filas = []
        for m in b['medios']:
            if not m['monto']:
                continue
            q = m['clave'] in GRUPO_QANTARA
            st = (qbg if q else '') + ('font-weight:600;' if q else '')
            filas.append(f'<tr style="{st}"><td {td}>{m["medio"]}</td><td {tdr}>{_ars(m["monto"])}</td><td {tdr}>{_pct(m["pct"])}</td></tr>')
        filas.append(f'<tr style="font-weight:700"><td {td}>Total cobrado</td><td {tdr}>{_ars(b["total_cobrado"])}</td><td {tdr}>100%</td></tr>')
        q = b['qantara']
        filas.append(f'<tr style="{qbg}font-weight:700"><td {td}>Subtotal Qantara</td><td {tdr}>{_ars(q["monto"])}</td><td {tdr}>{_pct(q["pct"])}</td></tr>')
        return f'<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse"><tr><th {th}>Medio de cobro</th><th {thr}>Monto</th><th {thr}>% s/ cobrado</th></tr>{"".join(filas)}</table>'

    def nota(b):
        out = []
        p = b['propinas']
        if p['qantara'] or p['otras']:
            out.append(f'Propinas (no incluidas): Qantara {_ars(p["qantara"])} · otras {_ars(p["otras"])}')
        for x in b['plan_out_detalle']:
            out.append(f'Plan Out: "{x["comentario"]}" {_ars(x["monto"])}')
        return ''.join(f'<div style="font-size:12px;color:#666;margin-top:4px">{t}</div>' for t in out)

    estado_txt = {'auditado': 'auditado', 'cerrado': 'cerrado', 'abierto': 'sin cerrar'}
    partes = [f'<div style="font-family:Arial,sans-serif;max-width:720px"><h2 style="color:#1F4E78">Distribución de la venta por medio de cobro — {_rango_txt(rep)}</h2>',
              '<p style="font-size:12px;color:#666">Porcentajes sobre lo cobrado (sin propinas). Qantara = terminales BK. Plan Out se informa como medio de cobro propio.</p>',
              f'<h3 style="color:#1F4E78">{rep["consolidado"]["local"]}</h3>', tabla(rep['consolidado']), nota(rep['consolidado'])]
    # resumen Qantara por local
    filas = ''.join(f'<tr><td {td}>{b["local"]}</td><td {tdr}>{_ars(b["total_cobrado"])}</td><td {tdr}>{_ars(b["qantara"]["monto"])}</td><td {tdr}>{_pct(b["qantara"]["pct"])}</td></tr>'
                    for b in rep['locales'] if b['total_cobrado'])
    partes.append(f'<h3 style="color:#1F4E78">Qantara por local</h3><table cellspacing="0" style="width:100%;border-collapse:collapse"><tr><th {th}>Local</th><th {thr}>Cobrado</th><th {thr}>Qantara</th><th {thr}>% Qantara</th></tr>{filas}</table>')
    for b in rep['locales']:
        sin = '' if b['total_cobrado'] else ' <span style="font-weight:400;font-size:12px;color:#b00">sin movimientos cargados</span>'
        partes.append(f'<h3 style="color:#1F4E78;margin-bottom:4px">{b["local"]} <span style="font-weight:400;font-size:12px;color:#666">{('(' + estado_txt[b["estado"]] + ')') if b["estado"] else ''}</span>{sin}</h3>')
        if b['total_cobrado']:
            partes.append(tabla(b) + nota(b))
    partes.append('</div>')
    return ''.join(partes)
