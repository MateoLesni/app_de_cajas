"""Reporte diario de distribucion de la venta por medio de cobro, con foco en terminales BK (Qantara).

Un bloque por local + un consolidado. Los porcentajes son sobre lo cobrado (sin propinas, que se informan aparte).
"Plan Out" se detecta en comentarios de cuenta corriente 'Otro cliente' (CNGCC) y se informa como medio de cobro propio.
Todo el resto de la cuenta corriente va en 'Cuenta corriente'.
Cada medio trae su detalle en forma de arbol (marca > terminal, remesas, clientes, etc.) para poder expandirlo.
"""
import re
from collections import OrderedDict
from unicodedata import normalize as _unormalize, combining as _ucombining

LOCALES_REPORTE = ['Cruza Recoleta', 'Cruza Polo', 'Cochinchina', 'Narda Sucre', 'La Mala',
                   'Malita', 'Costa7070', 'Kona', 'Milvidas']

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

_RE_PLANOUT = re.compile(r'plan\W*(out|aut|ot)\b')


def _norm(s):
    s = ''.join(c for c in _unormalize('NFD', (s or '').strip()) if not _ucombining(c))
    return ' '.join(s.lower().split())


def es_plan_out(comentario):
    return bool(_RE_PLANOUT.search(_norm(comentario)))


def _term(t):
    return t if t.startswith('(') else f'Terminal {t}'


def _f(v):
    return float(v or 0)


class _Arbol:
    """Acumula montos por ruta de etiquetas: add(('VISA', 'Terminal 1'), 100)."""
    def __init__(self):
        self.total = 0.0
        self.hijos = OrderedDict()

    def add(self, ruta, monto):
        self.total += monto
        if ruta:
            self.hijos.setdefault(ruta[0], _Arbol()).add(ruta[1:], monto)

    def merge(self, otro):
        self.total += otro.total
        for k, h in otro.hijos.items():
            self.hijos.setdefault(k, _Arbol()).merge(h)

    def a_lista(self):
        out = [{'label': k, 'monto': round(h.total, 2), 'hijos': h.a_lista()} for k, h in self.hijos.items() if round(h.total, 2) != 0]
        out.sort(key=lambda x: -abs(x['monto']))
        return out


def armar_reporte(conn, desde, hasta=None, locales=None):
    """desde/hasta: 'YYYY-MM-DD' (hasta opcional = un solo dia). Devuelve dict con bloques por local y consolidado."""
    hasta = hasta or desde
    locales = list(locales or LOCALES_REPORTE)
    ph = ','.join(['%s'] * len(locales))
    rango = [desde, hasta] + locales
    cur = conn.cursor(dictionary=True)
    arb = {l: {k: _Arbol() for k in MEDIOS} for l in locales}
    propinas = {l: {'qantara': 0.0, 'otras': 0.0} for l in locales}

    # Tarjetas y QR. Subconsulta de terminales para no duplicar filas si el maestro repite una terminal.
    cur.execute(f"""
        SELECT t.local, UPPER(TRIM(t.tarjeta)) AS tarjeta, COALESCE(NULLIF(TRIM(t.terminal), ''), '(sin terminal)') AS terminal,
               COALESCE(tm.bk, 0) AS es_bk, SUM(t.monto) AS monto, SUM(COALESCE(t.monto_tip, 0)) AS propina
        FROM tarjetas_trns t
        LEFT JOIN (SELECT local, terminal, MAX(bk) AS bk FROM terminales GROUP BY local, terminal) tm
               ON tm.local = t.local AND tm.terminal = t.terminal
        WHERE DATE(t.fecha) BETWEEN %s AND %s AND t.local IN ({ph})
        GROUP BY t.local, UPPER(TRIM(t.tarjeta)), terminal, COALESCE(tm.bk, 0)
    """, rango)
    for r in cur.fetchall() or []:
        l = r['local']
        bk = int(r['es_bk'] or 0) == 1
        marca = _norm(r['tarjeta']).upper() or '(SIN TIPO)'
        es_qr = marca == 'PAGOS INMEDIATOS'
        sufijo = 'qantara' if bk else 'otras'
        propinas[l][sufijo] += _f(r['propina'])
        if es_qr:
            arb[l]['qr_' + sufijo].add((_term(r['terminal']),), _f(r['monto']))
        else:
            arb[l]['tarjeta_' + sufijo].add((marca, _term(r['terminal'])), _f(r['monto']))

    # Efectivo (remesas; USD convertido a ARS). Las remesas espejo de anticipos no cuentan.
    cur.execute(f"""
        SELECT local, nro_remesa, UPPER(COALESCE(divisa,'ARS')) AS divisa, monto_usd, cotizacion_divisa,
               CASE WHEN UPPER(COALESCE(divisa,'ARS'))='USD'
                    THEN COALESCE(NULLIF(total_conversion,0), monto_usd*cotizacion_divisa, 0) ELSE monto END AS m
        FROM remesas_trns WHERE DATE(fecha) BETWEEN %s AND %s AND local IN ({ph}) AND origen_anticipo_id IS NULL
    """, rango)
    for r in cur.fetchall() or []:
        nro = (r['nro_remesa'] or '').strip() or 's/nro'
        et = f"Remesa {nro}"
        if r['divisa'] == 'USD':
            et += f" (USD {_f(r['monto_usd']):,.0f})"
        arb[r['local']]['efectivo'].add((et,), _f(r['m']))

    # MercadoPago (TIP = propina)
    cur.execute(f"""
        SELECT local, UPPER(TRIM(tipo)) AS tipo, COALESCE(NULLIF(TRIM(terminal), ''), '(sin terminal)') AS terminal, SUM(importe) AS m
        FROM mercadopago_trns WHERE DATE(fecha) BETWEEN %s AND %s AND local IN ({ph}) GROUP BY local, tipo, terminal
    """, rango)
    for r in cur.fetchall() or []:
        if r['tipo'] == 'TIP':
            propinas[r['local']]['otras'] += _f(r['m'])
        else:
            arb[r['local']]['mercadopago'].add((_term(r['terminal']),), _f(r['m']))

    for tabla, clave in (('rappi_trns', 'rappi'), ('pedidosya_trns', 'pedidosya')):
        cur.execute(f"""SELECT local, caja, turno, SUM(monto) AS m FROM {tabla}
                        WHERE DATE(fecha) BETWEEN %s AND %s AND local IN ({ph}) GROUP BY local, caja, turno""", rango)
        for r in cur.fetchall() or []:
            arb[r['local']][clave].add((f"{r['caja']} · {r['turno']}",), _f(r['m']))

    # Anticipos consumidos (ya en ARS)
    cur.execute(f"""
        SELECT a.local, COALESCE(NULLIF(TRIM(ar.cliente), ''), '(sin cliente)') AS cliente, a.anticipo_id, SUM(a.importe_consumido) AS m
        FROM anticipos_estados_caja a LEFT JOIN anticipos_recibidos ar ON ar.id = a.anticipo_id
        WHERE a.fecha BETWEEN %s AND %s AND a.local IN ({ph}) AND a.estado = 'consumido'
        GROUP BY a.local, cliente, a.anticipo_id
    """, rango)
    for r in cur.fetchall() or []:
        arb[r['local']]['anticipos'].add((f"{r['cliente']} (anticipo #{r['anticipo_id']})",), _f(r['m']))

    cerrados, auditados = set(), set()
    cur.execute(f"SELECT local FROM cierres_locales WHERE fecha BETWEEN %s AND %s AND local IN ({ph})", rango)
    cerrados = {r['local'] for r in cur.fetchall() or []}
    cur.execute(f"SELECT local FROM locales_auditados WHERE fecha BETWEEN %s AND %s AND local IN ({ph})", rango)
    auditados = {r['local'] for r in cur.fetchall() or []}

    # Cuenta corriente: 'Otro cliente' con Plan Out -> medio propio; el resto -> cuenta corriente
    cur.execute(f"""
        SELECT t.local, t.monto, t.comentario, COALESCE(c.codigo_oppen, '') AS cod, c.nombre_cliente
        FROM cuentas_corrientes_trns t
        LEFT JOIN clientes_cta_cte c ON c.id = t.cliente_id
        WHERE DATE(t.fecha) BETWEEN %s AND %s AND t.local IN ({ph}) AND COALESCE(t.estado, 'ok') = 'ok'
    """, rango)
    for r in cur.fetchall() or []:
        l, m = r['local'], _f(r['monto'])
        com = (r['comentario'] or '').strip()
        if r['cod'] == 'CNGCC' and es_plan_out(com):
            arb[l]['plan_out'].add((com,), m)
        else:
            cli = (r['nombre_cliente'] or 'Cliente').strip()
            arb[l]['cuenta_corriente'].add(((f"{cli}: {com}" if r['cod'] == 'CNGCC' and com else cli),), m)
    cur.close()

    def _bloque(nombre, a, prop, estado=None):
        total = sum(a[k].total for k in MEDIOS)
        filas = [{'clave': k, 'medio': et, 'monto': round(a[k].total, 2),
                  'pct': round(a[k].total * 100.0 / total, 1) if total else 0.0,
                  'detalle': a[k].a_lista()} for k, et in MEDIOS.items()]
        qantara = sum(a[k].total for k in GRUPO_QANTARA)
        return {'local': nombre, 'estado': estado, 'total_cobrado': round(total, 2), 'medios': filas,
                'qantara': {'monto': round(qantara, 2), 'pct': round(qantara * 100.0 / total, 1) if total else 0.0},
                'propinas': {k: round(v, 2) for k, v in prop.items()}}

    bloques = [_bloque(l, arb[l], propinas[l],
                       (('auditado' if l in auditados else ('cerrado' if l in cerrados else 'abierto')) if desde == hasta else None))
               for l in locales]
    cons = {k: _Arbol() for k in MEDIOS}
    for l in locales:
        for k in MEDIOS:
            cons[k].merge(arb[l][k])
    cons_prop = {k: sum(propinas[l][k] for l in locales) for k in ('qantara', 'otras')}
    return {'fecha_desde': desde, 'fecha_hasta': hasta, 'locales': bloques,
            'consolidado': _bloque('TOTAL (9 locales)', cons, cons_prop)}


def _ars(v):
    return '$ ' + f"{v:,.0f}".replace(',', '.')


def _pct(v):
    return f"{v:.1f}".replace('.', ',') + '%'


def _esc(t):
    return str(t).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _rango_txt(rep):
    f = lambda x: f"{x[8:10]}/{x[5:7]}/{x[:4]}"
    d, h = rep['fecha_desde'], rep['fecha_hasta']
    return f(d) if d == h else f"{f(d)} al {f(h)}"


_CELDA = 'padding:5px 10px;border-bottom:1px solid #e5e5e5;font-size:13px'


def _fila(label, monto, pct_txt, nivel=0, bg='', bold=False, expandible=False):
    sangria = 10 + nivel * 18
    peso = 'font-weight:700;' if bold else ''
    color = 'color:#555;' if nivel else ''
    tam = 'font-size:12px;' if nivel else ''
    flecha = '<span style="color:#1F4E78">▸&nbsp;</span>' if expandible else ('' if nivel == 0 else '')
    return (f'<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;{bg}{peso}{color}{tam}"><tr>'
            f'<td style="padding:5px 10px 5px {sangria}px;border-bottom:1px solid #e5e5e5">{flecha}{_esc(label)}</td>'
            f'<td style="{_CELDA};text-align:right;width:130px">{_ars(monto)}</td>'
            f'<td style="{_CELDA};text-align:right;width:110px">{pct_txt}</td></tr></table>')


def _hijos_html(items, padre_total, nivel):
    out = []
    for it in items:
        p = _pct(it['monto'] * 100.0 / padre_total) if padre_total else ''
        fila = _fila(it['label'], it['monto'], p, nivel=nivel)
        if it['hijos']:
            out.append(f'<details><summary style="cursor:pointer;list-style:none">{_fila(it["label"], it["monto"], p, nivel=nivel, expandible=True)}</summary>'
                       f'{_hijos_html(it["hijos"], it["monto"], nivel + 1)}</details>')
        else:
            out.append(fila)
    return ''.join(out)


def render_html(rep, abierto=False):
    """HTML del mail (estilos inline). Los medios con detalle son <details> expandibles.
    Clientes de mail sin soporte de <details> muestran el detalle desplegado. abierto=True lo deja abierto siempre."""
    qbg = 'background:#FFF4D6;'
    head = ('<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse"><tr>'
            '<th style="text-align:left;padding:6px 10px;background:#1F4E78;color:#fff;font-size:13px">Medio de cobro (clic para ver el detalle)</th>'
            '<th style="text-align:right;padding:6px 10px;background:#1F4E78;color:#fff;font-size:13px;width:130px">Monto</th>'
            '<th style="text-align:right;padding:6px 10px;background:#1F4E78;color:#fff;font-size:13px;width:110px">% del total cobrado</th></tr></table>')
    ab = ' open' if abierto else ''

    def tabla(b):
        filas = [head]
        for m in b['medios']:
            if not m['monto']:
                continue
            q = m['clave'] in GRUPO_QANTARA
            bg = qbg if q else ''
            if m['detalle']:
                filas.append(f'<details{ab}><summary style="cursor:pointer;list-style:none">{_fila(m["medio"], m["monto"], _pct(m["pct"]), bg=bg, bold=q, expandible=True)}</summary>'
                             f'{_hijos_html(m["detalle"], m["monto"], 1)}</details>')
            else:
                filas.append(_fila(m['medio'], m['monto'], _pct(m['pct']), bg=bg, bold=q))
        filas.append(_fila('Total cobrado', b['total_cobrado'], '100%', bold=True))
        filas.append(_fila('Subtotal Qantara', b['qantara']['monto'], _pct(b['qantara']['pct']), bg=qbg, bold=True))
        return ''.join(filas)

    def nota(b):
        p = b['propinas']
        if not (p['qantara'] or p['otras']):
            return ''
        return f'<div style="font-size:12px;color:#666;margin-top:4px">Propinas (no incluidas): Qantara {_ars(p["qantara"])} · otras {_ars(p["otras"])}</div>'

    estado_txt = {'auditado': 'auditado', 'cerrado': 'cerrado', 'abierto': 'sin cerrar'}
    th = 'style="text-align:left;padding:6px 10px;background:#1F4E78;color:#fff;font-size:13px"'
    thr = 'style="text-align:right;padding:6px 10px;background:#1F4E78;color:#fff;font-size:13px"'
    td = 'style="padding:5px 10px;border-bottom:1px solid #e5e5e5;font-size:13px"'
    tdr = 'style="padding:5px 10px;border-bottom:1px solid #e5e5e5;font-size:13px;text-align:right"'
    cons = rep['consolidado']
    partes = [f'<div style="font-family:Arial,sans-serif;max-width:760px"><h2 style="color:#1F4E78">Distribución de la venta por medio de cobro — {_rango_txt(rep)}</h2>',
              '<p style="font-size:12px;color:#666">Porcentajes sobre lo cobrado (sin propinas). Qantara = terminales BK. Plan Out se informa como medio de cobro propio. '
              'Tocá un medio para ver cómo se compone.</p>',
              f'<h3 style="color:#1F4E78">{cons["local"]}</h3>', tabla(cons), nota(cons)]
    filas = ''.join(f'<tr><td {td}>{b["local"]}</td><td {tdr}>{_ars(b["total_cobrado"])}</td><td {tdr}>{_ars(b["qantara"]["monto"])}</td><td {tdr}>{_pct(b["qantara"]["pct"])}</td></tr>'
                    for b in rep['locales'] if b['total_cobrado'])
    partes.append(f'<h3 style="color:#1F4E78">Qantara por local</h3><table cellspacing="0" style="width:100%;border-collapse:collapse"><tr><th {th}>Local</th><th {thr}>Cobrado</th><th {thr}>Qantara</th><th {thr}>% Qantara</th></tr>{filas}</table>')
    for b in rep['locales']:
        sin = '' if b['total_cobrado'] else ' <span style="font-weight:400;font-size:12px;color:#b00">sin movimientos cargados</span>'
        est = f' ({estado_txt[b["estado"]]})' if b['estado'] else ''
        partes.append(f'<h3 style="color:#1F4E78;margin-bottom:4px">{b["local"]} <span style="font-weight:400;font-size:12px;color:#666">{est}</span>{sin}</h3>')
        if b['total_cobrado']:
            partes.append(tabla(b) + nota(b))
    partes.append('</div>')
    return ''.join(partes)
