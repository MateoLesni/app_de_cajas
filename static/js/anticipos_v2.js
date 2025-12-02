// ==== Anticipos Recibidos V2: Sistema integrado para cajeros ====
// Muestra anticipos disponibles (pendientes) que pueden ser consumidos o eliminados de la caja
// Muestra anticipos ya consumidos en esta caja

document.addEventListener("DOMContentLoaded", function () {
  const tabKey = "anticipos";
  const pane = document.getElementById(tabKey);

  const cajaSelect = document.getElementById("cajaSelect");
  const fechaGlobal = document.getElementById("fechaGlobal");
  const turnoSelect = document.getElementById("turnoSelect");

  // Permisos y estado
  const ROLE = parseInt(window.ROLE_LEVEL || 1, 10);
  window.cajaCerrada = window.cajaCerrada ?? false;
  let localCerrado = false;
  let localAuditado = false;

  let anticiposDisponibles = [];
  let anticiposConsumidos = [];

  // Estilos
  (function ensureStyle() {
    if (document.getElementById("anticipos-v2-style")) return;
    const st = document.createElement("style");
    st.id = "anticipos-v2-style";
    st.textContent = `
      #${tabKey} { position: relative; }
      #${tabKey} .anticipos-header {
        background: #f8fafc;
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 20px;
        border-left: 4px solid #2563eb;
      }
      #${tabKey} .anticipos-header h3 {
        margin: 0 0 8px 0;
        color: #1f2937;
        font-size: 18px;
      }
      #${tabKey} .anticipos-header p {
        margin: 0;
        color: #6b7280;
        font-size: 14px;
      }
      #${tabKey} .section {
        margin-bottom: 30px;
      }
      #${tabKey} .section-title {
        font-size: 16px;
        font-weight: 600;
        color: #374151;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 2px solid #e5e7eb;
      }
      #${tabKey} table {
        width: 100%;
        border-collapse: collapse;
        background: white;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      #${tabKey} table thead {
        background: #f8fafc;
      }
      #${tabKey} table th {
        padding: 12px;
        text-align: left;
        font-weight: 600;
        color: #374151;
        font-size: 13px;
        border-bottom: 2px solid #e5e7eb;
      }
      #${tabKey} table td {
        padding: 12px;
        border-bottom: 1px solid #e5e7eb;
        vertical-align: middle;
      }
      #${tabKey} table tbody tr:hover {
        background: #f9fafb;
      }
      #${tabKey} .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        background: #fef3c7;
        color: #92400e;
      }
      #${tabKey} .badge-disponible {
        background: #fef3c7;
        color: #92400e;
      }
      #${tabKey} .badge-consumido {
        background: #d1fae5;
        color: #065f46;
      }
      #${tabKey} .btn-action {
        padding: 6px 12px;
        border-radius: 6px;
        border: none;
        font-weight: 600;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.2s;
        margin-right: 6px;
      }
      #${tabKey} .btn-consumir {
        background: #059669;
        color: white;
      }
      #${tabKey} .btn-consumir:hover {
        background: #047857;
      }
      #${tabKey} .btn-eliminar {
        background: #dc2626;
        color: white;
      }
      #${tabKey} .btn-eliminar:hover {
        background: #991b1b;
      }
      #${tabKey} .btn-action:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      #${tabKey} .empty-state {
        text-align: center;
        padding: 40px 20px;
        color: #6b7280;
        font-size: 14px;
      }
      #${tabKey} .anticipo-card {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 12px;
      }
      #${tabKey} .anticipo-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 12px;
      }
      #${tabKey} .anticipo-cliente {
        font-weight: 600;
        color: #1f2937;
        font-size: 16px;
      }
      #${tabKey} .anticipo-importe {
        font-size: 20px;
        font-weight: 700;
        color: #059669;
      }
      #${tabKey} .anticipo-detail {
        font-size: 13px;
        color: #6b7280;
        margin-bottom: 4px;
      }
      #${tabKey} .anticipo-observaciones {
        background: #f8fafc;
        padding: 8px;
        border-radius: 4px;
        font-size: 13px;
        color: #374151;
        margin-top: 8px;
        font-style: italic;
      }
      #${tabKey} .mod-overlay {
        position: absolute;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(255,255,255,0.8);
        backdrop-filter: blur(2px);
        z-index: 10;
      }
      #${tabKey} .mod-spinner {
        padding: 16px 24px;
        border-radius: 8px;
        background: white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-weight: 600;
        color: #1f2937;
      }
    `;
    document.head.appendChild(st);
  })();

  function setLoading(on) {
    if (!pane) return;
    let ov = pane.querySelector(":scope > .mod-overlay");
    if (on) {
      if (!ov) {
        ov = document.createElement("div");
        ov.className = "mod-overlay";
        ov.innerHTML = '<div class="mod-spinner">⏳ Cargando anticipos...</div>';
        pane.appendChild(ov);
      }
      ov.style.display = "flex";
    } else if (ov) {
      ov.style.display = "none";
    }
  }

  // Helpers
  const getLocalActual = () => {
    const localSelect = document.getElementById("localSelect");
    if (localSelect) {
      const val = (localSelect.value || "").trim();
      return val || (document.getElementById("userLocal")?.innerText || "").trim();
    }
    return (document.getElementById("userLocal")?.innerText || "").trim();
  };

  const getCtx = () => ({
    local: getLocalActual(),
    caja: cajaSelect?.value || "",
    fecha: fechaGlobal?.value || "",
    turno: (turnoSelect?.value || "").trim()
  });

  const fmt = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (v) => '$' + fmt.format(Number(v ?? 0));

  function formatDate(dateString) {
    if (!dateString) return '-';
    try {
      const [year, month, day] = dateString.split('T')[0].split('-');
      return `${day}/${month}/${year}`;
    } catch {
      return dateString;
    }
  }

  function canActUI() {
    if (localAuditado) return false;
    if (ROLE >= 3) return true;
    if (ROLE >= 2) return !localCerrado;
    return !window.cajaCerrada;
  }

  async function refrescarEstadoCajaLocal({ reRender = true } = {}) {
    const { local, caja, fecha, turno } = getCtx();
    if (!local || !caja || !fecha || !turno) {
      window.cajaCerrada = false;
      localCerrado = false;
      localAuditado = false;
      toggleUIByEstado();
      if (reRender) renderAnticipos();
      return;
    }
    try {
      const [rCaja, rLocal, rAudit] = await Promise.all([
        fetch(`/estado_caja?local=${encodeURIComponent(local)}&caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`)
          .then(r => r.ok ? r.json() : { estado: 1 }).catch(() => ({ estado: 1 })),
        fetch(`/estado_local?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}`)
          .then(r => r.ok ? r.json() : { ok: true, estado: 1 }).catch(() => ({ ok: true, estado: 1 })),
        fetch(`/api/estado_auditoria?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}`)
          .then(r => r.ok ? r.json() : { success: false, auditado: false }).catch(() => ({ success: false, auditado: false }))
      ]);
      window.cajaCerrada = ((rCaja.estado ?? 1) === 0);
      localCerrado = ((rLocal.estado ?? 1) === 0);
      localAuditado = (rAudit.success && rAudit.auditado) || false;
      console.log('🔍 ANTICIPOS V2 estado actualizado - cajaCerrada:', window.cajaCerrada, 'localCerrado:', localCerrado, 'localAuditado:', localAuditado);
    } catch {
      window.cajaCerrada = false;
      localCerrado = false;
      localAuditado = false;
    }
    toggleUIByEstado();
    if (reRender) renderAnticipos();
  }

  function toggleUIByEstado() {
    renderAnticipos();
  }

  // Cargar anticipos disponibles y consumidos
  async function loadAnticipos() {
    const ctx = getCtx();
    if (!ctx.local || !ctx.caja || !ctx.fecha || !ctx.turno) {
      anticiposDisponibles = [];
      anticiposConsumidos = [];
      renderAnticipos();
      return;
    }

    setLoading(true);

    try {
      // Cargar anticipos disponibles
      const urlDisponibles = `/api/anticipos/disponibles?local=${encodeURIComponent(ctx.local)}&caja=${encodeURIComponent(ctx.caja)}&fecha=${encodeURIComponent(ctx.fecha)}&turno=${encodeURIComponent(ctx.turno)}`;
      const resDisponibles = await fetch(urlDisponibles);
      const dataDisponibles = await resDisponibles.json();

      if (dataDisponibles.success) {
        anticiposDisponibles = dataDisponibles.disponibles || [];
      } else {
        console.error('Error cargando anticipos disponibles:', dataDisponibles.msg);
        anticiposDisponibles = [];
      }

      // Cargar anticipos consumidos en esta caja
      const urlConsumidos = `/api/anticipos/consumidos_en_caja?local=${encodeURIComponent(ctx.local)}&caja=${encodeURIComponent(ctx.caja)}&fecha=${encodeURIComponent(ctx.fecha)}&turno=${encodeURIComponent(ctx.turno)}`;
      const resConsumidos = await fetch(urlConsumidos);
      const dataConsumidos = await resConsumidos.json();

      if (dataConsumidos.success) {
        anticiposConsumidos = dataConsumidos.consumidos || [];
      } else {
        console.error('Error cargando anticipos consumidos:', dataConsumidos.msg);
        anticiposConsumidos = [];
      }

      renderAnticipos();

    } catch (error) {
      console.error('Error cargando anticipos:', error);
      alert('❌ Error cargando anticipos. Por favor, intentá nuevamente.');
    } finally {
      setLoading(false);
    }
  }

  // Renderizar anticipos
  function renderAnticipos() {
    const container = pane?.querySelector('.anticipos-content');
    if (!container) {
      // Si no existe el container, crear la estructura
      if (!pane) return;
      pane.innerHTML = `
        <div class="anticipos-header">
          <h3>💳 Anticipos Recibidos</h3>
          <p>Los anticipos son señas recibidas que deben consumirse cuando el cliente viene al local.</p>
        </div>
        <div class="anticipos-content"></div>
      `;
      return renderAnticipos(); // Llamar de nuevo para renderizar
    }

    const puedeActuar = canActUI();

    let html = '';

    // Sección: Anticipos Disponibles
    html += '<div class="section">';
    html += '<div class="section-title">📋 Anticipos Disponibles para Consumir</div>';

    if (anticiposDisponibles.length === 0) {
      html += '<div class="empty-state">✅ No hay anticipos pendientes para esta caja y fecha</div>';
    } else {
      anticiposDisponibles.forEach(a => {
        html += `
          <div class="anticipo-card">
            <div class="anticipo-card-header">
              <div>
                <div class="anticipo-cliente">${a.cliente}</div>
                <div class="anticipo-detail">Fecha de evento: ${formatDate(a.fecha_evento)}</div>
                <div class="anticipo-detail">Fecha de pago: ${formatDate(a.fecha_pago)}</div>
                ${a.medio_pago ? `<div class="anticipo-detail">Medio de pago: ${a.medio_pago}</div>` : ''}
                ${a.numero_transaccion ? `<div class="anticipo-detail">Nº transacción: ${a.numero_transaccion}</div>` : ''}
              </div>
              <div class="anticipo-importe">${money(a.importe)}</div>
            </div>
            ${a.observaciones ? `<div class="anticipo-observaciones">${a.observaciones}</div>` : ''}
            <div style="margin-top: 12px; text-align: right;">
              <button class="btn-action btn-eliminar"
                      onclick="eliminarDeCaja(${a.id})"
                      ${!puedeActuar ? 'disabled' : ''}
                      title="Cliente no vino a esta caja">
                ❌ No vino a esta caja
              </button>
              <button class="btn-action btn-consumir"
                      onclick="consumirAnticipo(${a.id})"
                      ${!puedeActuar ? 'disabled' : ''}
                      title="Cliente consumió en esta caja">
                ✅ Consumir Anticipo
              </button>
            </div>
          </div>
        `;
      });
    }
    html += '</div>';

    // Sección: Anticipos Consumidos en esta caja
    html += '<div class="section">';
    html += '<div class="section-title">✅ Anticipos Consumidos en esta Caja</div>';

    if (anticiposConsumidos.length === 0) {
      html += '<div class="empty-state">No se consumieron anticipos en esta caja</div>';
    } else {
      html += '<table><thead><tr>';
      html += '<th>Cliente</th>';
      html += '<th>Fecha Pago</th>';
      html += '<th>Importe</th>';
      html += '<th>Medio Pago</th>';
      html += '<th>Nº Transacción</th>';
      html += '<th>Observaciones</th>';
      html += '</tr></thead><tbody>';

      anticiposConsumidos.forEach(a => {
        html += '<tr>';
        html += `<td><strong>${a.cliente}</strong></td>`;
        html += `<td>${formatDate(a.fecha_pago)}</td>`;
        html += `<td style="text-align:right; font-weight:600;">${money(a.importe_consumido)}</td>`;
        html += `<td>${a.medio_pago || '-'}</td>`;
        html += `<td>${a.numero_transaccion || '-'}</td>`;
        html += `<td style="font-size:12px; color:#6b7280;">${a.observaciones_consumo || (a.observaciones_anticipo || '-')}</td>`;
        html += '</tr>';
      });

      html += '</tbody></table>';
    }
    html += '</div>';

    container.innerHTML = html;
  }

  // Consumir anticipo
  window.consumirAnticipo = async function(anticipoId) {
    const anticipo = anticiposDisponibles.find(a => a.id === anticipoId);
    if (!anticipo) return;

    const confirmacion = confirm(
      `¿Confirmar que el cliente "${anticipo.cliente}" consumió su anticipo de ${money(anticipo.importe)} en esta caja?\n\n` +
      `Este monto se registrará como cobrado en esta caja.`
    );

    if (!confirmacion) return;

    // Opcional: pedir observaciones
    const observaciones = prompt(
      `Anticipo de ${anticipo.cliente} - ${money(anticipo.importe)}\n\n` +
      `Podés agregar observaciones (opcional):\n` +
      `Por ejemplo: "Mesa 5", "Evento privado", etc.`
    );

    const ctx = getCtx();

    setLoading(true);

    try {
      const response = await fetch('/api/anticipos/consumir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          local: ctx.local,
          caja: ctx.caja,
          fecha: ctx.fecha,
          turno: ctx.turno,
          anticipo_id: anticipoId,
          observaciones_consumo: observaciones || null
        })
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ ${data.msg}`);
        // Recargar datos
        if (window.OrqTabs) {
          OrqTabs.reload('anticipos');
        } else {
          await loadAnticipos();
        }
      } else {
        alert(`❌ Error: ${data.msg || 'No se pudo consumir el anticipo'}`);
      }

    } catch (error) {
      console.error('Error consumiendo anticipo:', error);
      alert('❌ Error de red al consumir anticipo');
    } finally {
      setLoading(false);
    }
  };

  // Eliminar de caja
  window.eliminarDeCaja = async function(anticipoId) {
    const anticipo = anticiposDisponibles.find(a => a.id === anticipoId);
    if (!anticipo) return;

    const confirmacion = confirm(
      `¿Confirmar que el cliente "${anticipo.cliente}" NO vino a esta caja?\n\n` +
      `El anticipo seguirá disponible para otras cajas del local.`
    );

    if (!confirmacion) return;

    const ctx = getCtx();

    setLoading(true);

    try {
      const response = await fetch('/api/anticipos/eliminar_de_caja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          local: ctx.local,
          caja: ctx.caja,
          fecha: ctx.fecha,
          turno: ctx.turno,
          anticipo_id: anticipoId
        })
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ ${data.msg}`);
        // Recargar datos
        if (window.OrqTabs) {
          OrqTabs.reload('anticipos');
        } else {
          await loadAnticipos();
        }
      } else {
        alert(`❌ Error: ${data.msg || 'No se pudo eliminar el anticipo de esta caja'}`);
      }

    } catch (error) {
      console.error('Error eliminando anticipo de caja:', error);
      alert('❌ Error de red al eliminar anticipo');
    } finally {
      setLoading(false);
    }
  };

  // Función de renderizado para OrqTabs
  window.renderAnticipos = async function(data, opts = {}) {
    console.log('🔍 ANTICIPOS V2 renderAnticipos llamado desde OrqTabs', data, opts);

    // Actualizar estado de caja/local
    const map = opts.datasets || {};
    const epEC = Object.keys(map).find(k => k.includes('estado_caja'));
    const epEL = Object.keys(map).find(k => k.includes('estado_local'));

    if (epEC && map[epEC] && typeof map[epEC] === 'object') {
      window.cajaCerrada = ((map[epEC].estado ?? 1) === 0);
    }
    if (epEL && map[epEL] && typeof map[epEL] === 'object') {
      localCerrado = ((map[epEL].estado ?? 1) === 0);
    }

    await refrescarEstadoCajaLocal({ reRender: false });
    await loadAnticipos();
  };

  // Event listeners
  cajaSelect?.addEventListener("change", () => loadAnticipos());
  fechaGlobal?.addEventListener("change", () => loadAnticipos());
  turnoSelect?.addEventListener("change", () => loadAnticipos());

  // Cargar inicialmente
  loadAnticipos();
});
