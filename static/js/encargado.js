// encargado.js — Adaptador de Nivel 2 (encargado/administrativo)
(function(){
  // 1) Forzar que el front no bloquee por "caja cerrada".
  //    El backend valida con can_edit() y cortará si el LOCAL está cerrado.
  try {
    let _shadow = false;
    Object.defineProperty(window, 'cajaCerrada', {
      configurable: true,
      get(){ return false; },
      set(v){ _shadow = !!v; }  // ignoramos
    });
  } catch(e){ /* no-op */ }

  function getCtx(){
    return {
      local: (document.getElementById('userLocal')?.innerText || '').trim(),
      fecha: document.getElementById('fechaGlobal')?.value || '',
      turno: document.getElementById('turnoSelect')?.value || '',
      caja:  document.getElementById('cajaSelect')?.value || ''
    };
  }

  async function refreshBadgeLocal(){
    const {local, fecha, turno} = getCtx();
    if(!local || !fecha || !turno) return;
    try{
      const r = await fetch(`/estado_local?fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`);
      const d = await r.json();
      const badge = document.getElementById('badgeEstadoLocal');
      if(!badge) return;
      if (d.ok && (d.estado ?? 1) === 1) {
        badge.textContent = 'Abierto';
        badge.classList.add('badge-abierta');
        badge.classList.remove('badge-cerrada');
      } else {
        badge.textContent = 'Cerrado';
        badge.classList.add('badge-cerrada');
        badge.classList.remove('badge-abierta');
      }
    }catch(e){ /* noop */ }
  }

  // 2) Reconfigurar OrqTabs para que consuma /enc/... (solo cajas cerradas)
  //    Conservamos el resto tal cual.
  window.addEventListener('DOMContentLoaded', () => {
    if (!window.OrqTabs) return;

    // Re-init con endpoints /enc/...
    OrqTabs.init({
      selLocal:'#userLocal', selCaja:'#cajaSelect', selFecha:'#fechaGlobal',
      tabSelector: '.tab-btn',
      showLoading: (k,on)=>{
        const pane = document.getElementById(k);
        if (pane) pane.setAttribute('data-loading', on ? '1' : '0');
      },
      showError:   (k,msg)=>{ console.warn(`[Nivel2:${k}]`, msg); },
      tabs: {
        ventasTab: { endpoints: ['/ventas_cargadas','/ventas_z_cargadas'], render: (d,o)=>window.renderVentas && window.renderVentas(d,o) },
        mercadopago: { endpoints: ['/mercadopago_cargadas'], render: (d,o)=>window.renderMercadoPago && window.renderMercadoPago(d,o) },
        tarjetas:    { endpoints: ['/tarjetas_cargadas_hoy','/tips_tarjetas_cargados'], render: (d,o)=>window.renderTarjetas && window.renderTarjetas(d,o) },
        rappiTab:    { endpoints: ['/rappi_cargadas'], render: (d,o)=>window.renderRappi && window.renderRappi(d,o) },
        pedidosyaTab:{ endpoints: ['/pedidosya_cargadas'], render: (d,o)=>window.renderPedidosYa && window.renderPedidosYa(d,o) },
        remesas:     { endpoints: ['/remesas_no_retiradas','/remesas_hoy'], render: (d,o)=>window.renderRemesas && window.renderRemesas(d,o) },
        gastos:      { endpoints: ['/gastos_cargadas'], render: (d,o)=>window.renderGastos && window.renderGastos(d,o) },
        'cierre-caja-container': { endpoints: ['/api/cierre/resumen','/estado_caja'], render: (d,o)=>window.renderResumenCaja && window.renderResumenCaja(d,o) },
        'resumenGlobal': { endpoints: ['/estado_local'], render: ()=>refreshBadgeLocal() }
      }
    });

    // Disparar carga inicial en la pestaña activa
    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn) activeBtn.dispatchEvent(new Event('shown.bs.tab'));
    refreshBadgeLocal();
  });

  // 3) Botón "Enviar Cierre de Local"
  window.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnCerrarLocal');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const {local, fecha, turno} = getCtx();
      if(!local || !fecha || !turno){ alert('Seleccioná Fecha y Turno.'); return; }

      if(!confirm(`Vas a cerrar el LOCAL ${local} del ${fecha} (${turno}).\nEsto pasará todo a estado "ok" y bloqueará edición para nivel 2.\n\n¿Confirmás?`)) return;

      try{
        const r = await fetch('/api/cierre_local', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ fecha, turno })
        });
        const data = await r.json();
        if (data.success){
          alert('🏁 Cierre de local enviado con éxito');
          refreshBadgeLocal();
          if (window.OrqTabs) OrqTabs.reloadActive();
        }else{
          alert(data.msg || 'No se pudo cerrar el local');
        }
      }catch(e){
        alert('Error de red');
      }
    });
  });

})();
