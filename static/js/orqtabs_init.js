// static/js/orqtabs_init.js
document.addEventListener('DOMContentLoaded', () => {
  // funciones de render expuestas por tus otros .js
  const renderVentas      = (d,o) => window.renderVentas      && window.renderVentas(d,o);
  const renderMercadoPago = (d,o) => window.renderMercadoPago && window.renderMercadoPago(d,o);
  const renderTarjetas    = (d,o) => window.renderTarjetas    && window.renderTarjetas(d,o);
  const renderRappi       = (d,o) => window.renderRappi       && window.renderRappi(d,o);
  const renderPedidosYa   = (d,o) => window.renderPedidosYa   && window.renderPedidosYa(d,o);
  const renderRemesas     = (d,o) => window.renderRemesas     && window.renderRemesas(d,o);
  const renderGastos      = (d,o) => window.renderGastos      && window.renderGastos(d,o);

  // (opcionales) UI helpers
  const toggleSpinner = (tabKey, on) => {
    const pane = document.getElementById(tabKey);
    if (pane) pane.setAttribute('data-loading', on ? '1' : '0');
  };
  const showToastError = (tabKey, msg) => {
    const div = document.getElementById('alertaFlotante');
    if (!div) { console.error(`(${tabKey})`, msg); return; }
    div.textContent = `(${tabKey}) ${msg}`;
    div.style.display = 'block';
    div.classList.add('show');
    setTimeout(()=>{div.classList.remove('show'); div.style.display='none';}, 2500);
  };

  // ⚠️ Asegurate de tener orquestador-tabs.js cargado antes de este archivo
  if (!window.OrqTabs || !OrqTabs.init) {
    console.error('OrqTabs no está definido. ¿Cargaste static/js/orquestador-tabs.js antes?');
    return;
  }

  OrqTabs.init({
    selLocal:'#userLocal',
    selCaja:'#cajaSelect',
    selFecha:'#fechaGlobal',
    tabSelector: '.tab-btn',
    showLoading: toggleSpinner,
    showError:   showToastError,
    tabs: {
      ventasTab:      { endpoints: ['/ventas_cargadas','/ventas_z_cargadas'], render: renderVentas },
      mercadopago:    { endpoints: ['/mercadopago_cargadas'], render: renderMercadoPago },
      tarjetas:       { endpoints: ['/tarjetas_cargadas_hoy'], render: renderTarjetas },
      rappiTab:       { endpoints: ['/rappi_cargadas'], render: renderRappi },
      pedidosyaTab:   { endpoints: ['/pedidosya_cargadas'], render: renderPedidosYa },
      remesas:        { endpoints: ['/remesas_no_retiradas','/remesas_hoy'], render: renderRemesas },
      gastos:         { endpoints: ['/gastos_cargadas'], render: renderGastos },
      'cierre-caja-container': { endpoints: ['/api/cierre/resumen','/estado_caja'], render: (d,o)=>window.renderResumenCaja && window.renderResumenCaja(d,o) },
    }
  });

  // Disparo inicial para la pestaña marcada como .active
  const activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn) activeBtn.dispatchEvent(new Event('shown.bs.tab'));
});
