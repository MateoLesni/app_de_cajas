// resumen-caja.js — Actualiza el “Resumen de Caja” (con OrqTabs o en fallback)
document.addEventListener('DOMContentLoaded', () => {
  const TAB_KEY = 'cierre-caja-container';

  // Mapeo: clave de backend -> id del TD en el HTML
  const campos = {
    venta_total: 'resVentaTotal',
    venta_z:     'resVtaZ',
    facturas_a:  'resFacturasA',
    facturas_b:  'resFacturasB',
    facturas_cc: 'resFacturasCC',
    efectivo:    'resEfectivo',
    tarjeta:     'resTarjeta',
    mercadopago: 'resMercadoPago',
    rappi:       'resRappi',
    pedidosya:   'resPedidosYa',
    gastos:      'resGastos',
    cuenta_cte:  'rescuentaCte',
    tips:        'resTips',
    discovery:   'resDiscovery',
  };

  // ====== Helpers ======
  const getLocal  = () => (document.getElementById('userLocal')?.innerText || '').trim();
  const getCaja   = () => document.getElementById('cajaSelect')?.value || '';
  const getFecha  = () => document.getElementById('fechaGlobal')?.value || '';
  const getTurno  = () => document.getElementById('turnoSelect')?.value || 'UNI'; // <-- TURNO

  const safeNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const formatMoneda = (v) => {
    const s = (Number(v) || 0).toLocaleString('es-AR', {
      style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2
    });
    return s.replace(/\u00A0/g, ' ');
  };

  const setTextIf = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  function resetDiferenciaStyles(el) {
    el.style.removeProperty('color');
    el.style.removeProperty('background-color');
    el.style.removeProperty('padding');
    el.style.removeProperty('border-radius');
    el.style.removeProperty('font-weight');
  }

  function pintarDiferencia(valor) {
    const el = document.getElementById('diferencia');
    if (!el) return;
    resetDiferenciaStyles(el);
    el.style.setProperty('font-weight', '700', 'important');

    const EPS = 0.005;
    if (valor > EPS) {
      el.style.setProperty('color', '#088f42ff', 'important');
      el.style.setProperty('background-color', '#ffffffff', '');
      el.style.setProperty('padding', '2px 6px', '');
      el.style.setProperty('border-radius', '6px', '');
    } else if (Math.abs(valor) <= EPS) {
      el.style.setProperty('color', '#0d9e26ff', 'important');
      el.style.setProperty('background-color', '#ffffffff', '');
      el.style.setProperty('padding', '2px 6px', '');
      el.style.setProperty('border-radius', '6px', '');
    } else {
      el.style.setProperty('color', '#B00020', 'important');
    }
  }

  function pintarBadgeEstado(estado) {
    // estado: 1=Abierta, 0=Cerrada
    const badge = document.getElementById('badgeEstadoCaja');
    if (!badge) return;
    const abierta = Number(estado) === 1;
    badge.textContent = abierta ? 'Abierta' : 'Cerrada';
    badge.classList.remove('badge-abierta', 'badge-cerrada');
    badge.classList.add(abierta ? 'badge-abierta' : 'badge-cerrada');
  }

  function aplicarResumenAUI(resumen, estadoOverride = null) {
    // 1) Campos simples
    for (const [k, id] of Object.entries(campos)) {
      setTextIf(id, formatMoneda(safeNum(resumen[k])));
    }

    // 2) Total cobrado
    let totalCobrado = safeNum(resumen.total_cobrado);
    if (!totalCobrado) {
      totalCobrado =
        safeNum(resumen.efectivo) +
        safeNum(resumen.tarjeta) +
        safeNum(resumen.mercadopago) +
        safeNum(resumen.rappi) +
        safeNum(resumen.pedidosya) +
        safeNum(resumen.cuenta_cte) +
        safeNum(resumen.facturas_cc);
    }
    setTextIf('totalCobrado', formatMoneda(totalCobrado));
    setTextIf('resTotalCobradoVentas', formatMoneda(totalCobrado));

    // 3) Diferencia
    const ventaTotal = safeNum(resumen.venta_total);
    const diferencia = totalCobrado - ventaTotal;
    setTextIf('diferencia', formatMoneda(diferencia));
    pintarDiferencia(diferencia);

    // 4) Estado de caja
    const estadoCaja = (estadoOverride != null)
      ? Number(estadoOverride)
      : (resumen.estado_caja != null ? Number(resumen.estado_caja) : 1);
    pintarBadgeEstado(estadoCaja);
  }

  // ====== Render para OrqTabs ======
  // Configuración sugerida de OrqTabs:
  // 'cierre-caja-container': {
  //   endpoints: [
  //     `/api/cierre/resumen?caja=${cajaSelect.value}&fecha=${fechaGlobal.value}&turno=${turnoSelect.value}`,
  //     `/estado_caja?local=${userLocal.innerText.trim()}&caja=${cajaSelect.value}&fecha=${fechaGlobal.value}&turno=${turnoSelect.value}`
  //   ],
  //   render: (d,o)=>window.renderResumenCaja && window.renderResumenCaja(d,o)
  // }
  window.renderResumenCaja = function(main, opts) {
    const map   = opts?.datasets || {};
    const caja  = getCaja();
    const fecha = getFecha();
    if (!caja || !fecha) return;

    const resumen = map['/api/cierre/resumen'] || main || {};
    const estado  = (map['/estado_caja'] && typeof map['/estado_caja'].estado !== 'undefined')
      ? Number(map['/estado_caja'].estado)
      : null;

    aplicarResumenAUI(resumen || {}, estado);
  };

  // ====== Fallback (sin OrqTabs) ======
  async function obtenerYActualizarResumen() {
    const caja  = getCaja();
    const fecha = getFecha();
    const local = getLocal();
    const turno = getTurno(); // <-- TURNO
    if (!caja || !fecha) return;

    try {
      const [resResumen, resEstado] = await Promise.allSettled([
        fetch(`/api/cierre/resumen?caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`).then(r => r.json()),
        fetch(`/estado_caja?local=${encodeURIComponent(local)}&caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`).then(r => r.json())
      ]);

      const resumen = (resResumen.status === 'fulfilled') ? (resResumen.value || {}) : {};
      const estado  = (resEstado.status === 'fulfilled' && typeof resEstado.value?.estado !== 'undefined')
        ? Number(resEstado.value.estado)
        : null;

      aplicarResumenAUI(resumen, estado);
    } catch (e) {
      console.error('Resumen de caja (fallback) →', e);
      Object.values(campos).forEach(id => setTextIf(id, '$ 0,00'));
      setTextIf('totalCobrado', '$ 0,00');
      setTextIf('diferencia', '$ 0,00');
      pintarBadgeEstado(1);
    }
  }

  // Ejecutar ahora sólo si NO hay OrqTabs
  if (!window.OrqTabs) {
    obtenerYActualizarResumen();
    // Reaccionar a cambios de filtros
    document.getElementById('cajaSelect')?.addEventListener('change', obtenerYActualizarResumen, true);
    document.getElementById('fechaGlobal')?.addEventListener('change', obtenerYActualizarResumen, true);
    document.getElementById('turnoSelect')?.addEventListener('change', obtenerYActualizarResumen, true); // <-- TURNO
  }

  // Al cerrar caja, refrescar (tengas o no OrqTabs)
  document.getElementById('btnCerrarCaja')?.addEventListener('click', () => {
    setTimeout(() => {
      if (window.OrqTabs) OrqTabs.reload(TAB_KEY);
      else obtenerYActualizarResumen();
    }, 800);
  });
});
