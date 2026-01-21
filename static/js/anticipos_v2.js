// ==== Anticipos Recibidos V2: Sistema integrado para cajeros ====
// Muestra anticipos disponibles (pendientes) que pueden ser consumidos o eliminados de la caja
// Muestra anticipos ya consumidos en esta caja

document.addEventListener("DOMContentLoaded", function () {
  const tabKey = "anticipos";
  const pane = document.getElementById("anticiposTab");

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
      #anticiposTab { position: relative; }
      #anticiposTab .anticipos-header {
        background: #f8fafc;
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 20px;
        border-left: 4px solid #2563eb;
      }
      #anticiposTab .anticipos-header h3 {
        margin: 0 0 8px 0;
        color: #1f2937;
        font-size: 18px;
      }
      #anticiposTab .anticipos-header p {
        margin: 0;
        color: #6b7280;
        font-size: 14px;
      }
      #anticiposTab .section {
        margin-bottom: 30px;
      }
      #anticiposTab .section-title {
        font-size: 16px;
        font-weight: 600;
        color: #374151;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 2px solid #e5e7eb;
      }
      #anticiposTab table {
        width: 100%;
        border-collapse: collapse;
        background: white;
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      #anticiposTab table thead {
        background: #f8fafc;
      }
      #anticiposTab table th {
        padding: 12px;
        text-align: left;
        font-weight: 600;
        color: #374151;
        font-size: 13px;
        border-bottom: 2px solid #e5e7eb;
      }
      #anticiposTab table td {
        padding: 12px;
        border-bottom: 1px solid #e5e7eb;
        vertical-align: middle;
      }
      #anticiposTab table tbody tr:hover {
        background: #f9fafb;
      }
      #anticiposTab .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        background: #fef3c7;
        color: #92400e;
      }
      #anticiposTab .badge-disponible {
        background: #fef3c7;
        color: #92400e;
      }
      #anticiposTab .badge-consumido {
        background: #d1fae5;
        color: #065f46;
      }
      #anticiposTab .btn-action {
        padding: 6px 12px;
        border-radius: 6px;
        border: none;
        font-weight: 600;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.2s;
        margin-right: 6px;
      }
      #anticiposTab .btn-consumir {
        background: #059669;
        color: white;
      }
      #anticiposTab .btn-consumir:hover {
        background: #047857;
      }
      #anticiposTab .btn-eliminar {
        background: #dc2626;
        color: white;
      }
      #anticiposTab .btn-eliminar:hover {
        background: #991b1b;
      }
      #anticiposTab .btn-action:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      #anticiposTab .empty-state {
        text-align: center;
        padding: 40px 20px;
        color: #6b7280;
        font-size: 14px;
      }
      #anticiposTab .anticipo-card {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 12px;
      }
      #anticiposTab .anticipo-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 12px;
      }
      #anticiposTab .anticipo-cliente {
        font-weight: 600;
        color: #1f2937;
        font-size: 16px;
      }
      #anticiposTab .anticipo-importe {
        font-size: 20px;
        font-weight: 700;
        color: #059669;
      }
      #anticiposTab .anticipo-detail {
        font-size: 13px;
        color: #6b7280;
        margin-bottom: 4px;
      }
      #anticiposTab .anticipo-observaciones {
        background: #f8fafc;
        padding: 8px;
        border-radius: 4px;
        font-size: 13px;
        color: #374151;
        margin-top: 8px;
        font-style: italic;
      }
      #anticiposTab .mod-overlay {
        position: absolute;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(255,255,255,0.8);
        backdrop-filter: blur(2px);
        z-index: 10;
      }
      #anticiposTab .mod-spinner {
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
    // DESHABILITADO: El orquestador ya maneja el overlay de carga
    // No crear overlay propio para evitar doble carga
    return;
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
    if (!dateString || dateString === 'null' || dateString === 'undefined') return '-';
    try {
      // Manejar diferentes formatos de fecha
      let dateStr = String(dateString);

      // Si viene con 'T', extraer solo la parte de fecha
      if (dateStr.includes('T')) {
        dateStr = dateStr.split('T')[0];
      }

      // Si viene con espacios, extraer solo la parte de fecha
      if (dateStr.includes(' ')) {
        dateStr = dateStr.split(' ')[0];
      }

      // Verificar que tengamos una fecha válida en formato YYYY-MM-DD
      const parts = dateStr.split('-');
      if (parts.length !== 3) return '-';

      const [year, month, day] = parts;

      // Validar que las partes sean números válidos
      if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
        return '-';
      }

      return `${day}/${month}/${year}`;
    } catch {
      return '-';
    }
  }

  function canActUI() {
    if (localAuditado) return false;
    // Auditores pueden siempre
    if (ROLE >= 3) return true;
    // Encargados pueden si el local está abierto (aunque las cajas estén cerradas)
    if (ROLE >= 2) return !localCerrado;
    // Cajeros pueden solo si su caja está abierta
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
      // Construir URLs para ambos endpoints
      const urlDisponibles = `/api/anticipos/disponibles?local=${encodeURIComponent(ctx.local)}&caja=${encodeURIComponent(ctx.caja)}&fecha=${encodeURIComponent(ctx.fecha)}&turno=${encodeURIComponent(ctx.turno)}`;
      const urlConsumidos = `/api/anticipos/consumidos_en_caja?local=${encodeURIComponent(ctx.local)}&caja=${encodeURIComponent(ctx.caja)}&fecha=${encodeURIComponent(ctx.fecha)}&turno=${encodeURIComponent(ctx.turno)}`;

      // Ejecutar ambos fetches EN PARALELO para mayor velocidad
      const [resDisponibles, resConsumidos] = await Promise.all([
        fetch(urlDisponibles),
        fetch(urlConsumidos)
      ]);

      // Procesar respuestas en paralelo
      const [dataDisponibles, dataConsumidos] = await Promise.all([
        resDisponibles.json(),
        resConsumidos.json()
      ]);

      // Actualizar datos disponibles
      if (dataDisponibles.success) {
        anticiposDisponibles = dataDisponibles.disponibles || [];
      } else {
        console.error('Error cargando anticipos disponibles:', dataDisponibles.msg);
        anticiposDisponibles = [];
      }

      // Actualizar datos consumidos
      if (dataConsumidos.success) {
        anticiposConsumidos = dataConsumidos.consumidos || [];
      } else {
        console.error('Error cargando anticipos consumidos:', dataConsumidos.msg);
        anticiposConsumidos = [];
      }

      // Renderizar TODO junto una vez que AMBOS fetches terminaron
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
    // Usar los contenedores del HTML
    const disponiblesContainer = document.getElementById('anticipos-disponibles-lista');
    const consumidosContainer = document.getElementById('anticipos-consumidos-lista');

    if (!disponiblesContainer || !consumidosContainer) {
      console.warn('Contenedores de anticipos no encontrados en el DOM');
      return;
    }

    const puedeActuar = canActUI();

    // Renderizar anticipos disponibles
    let htmlDisponibles = '';
    if (anticiposDisponibles.length === 0) {
      htmlDisponibles = '<div class="empty-state">✅ No hay anticipos pendientes para esta caja y fecha</div>';
    } else {
      anticiposDisponibles.forEach(a => {
        htmlDisponibles += `
          <div class="anticipo-card">
            <div class="anticipo-card-header">
              <div>
                <div class="anticipo-cliente">${a.cliente}</div>
                ${a.created_by ? `<div class="anticipo-detail">Cargado por: <strong>${a.created_by}</strong></div>` : ''}
                <div class="anticipo-detail">Fecha de evento: ${formatDate(a.fecha_evento)}</div>
                <div class="anticipo-detail">Fecha de pago: ${formatDate(a.fecha_pago)}</div>
                ${a.medio_pago ? `<div class="anticipo-detail">Medio de pago: ${a.medio_pago}</div>` : ''}
                ${a.numero_transaccion ? `<div class="anticipo-detail">Nº transacción: ${a.numero_transaccion}</div>` : ''}
              </div>
              <div class="anticipo-importe">
                <div style="font-size:11px; color:#6b7280; text-align:right;">${a.divisa || 'ARS'}</div>
                ${money(a.importe)}
              </div>
            </div>
            ${a.observaciones ? `<div class="anticipo-observaciones">${a.observaciones}</div>` : ''}
            <div style="margin-top: 12px; text-align: right;">
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
    disponiblesContainer.innerHTML = htmlDisponibles;

    // Renderizar anticipos consumidos
    let htmlConsumidos = '';
    if (anticiposConsumidos.length === 0) {
      htmlConsumidos = '<div class="empty-state">No se consumieron anticipos en esta caja</div>';
    } else {
      htmlConsumidos += '<table><thead><tr>';
      htmlConsumidos += '<th>Cliente</th>';
      htmlConsumidos += '<th>Fecha Pago</th>';
      htmlConsumidos += '<th>Importe</th>';
      htmlConsumidos += '<th>Medio Pago</th>';
      htmlConsumidos += '<th>Cargado por</th>';
      htmlConsumidos += '<th>Observaciones</th>';
      htmlConsumidos += '<th style="text-align:center;">Acciones</th>';
      htmlConsumidos += '</tr></thead><tbody>';

      anticiposConsumidos.forEach(a => {
        htmlConsumidos += '<tr>';
        htmlConsumidos += `<td><strong>${a.cliente}</strong></td>`;
        htmlConsumidos += `<td>${formatDate(a.fecha_pago)}</td>`;
        htmlConsumidos += `<td style="text-align:right; font-weight:600;">
          ${a.divisa === 'USD' && a.cotizacion_usd ? `
            <div style="font-size:13px; color:#059669;">USD ${parseFloat(a.importe || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
            <div style="font-size:10px; color:#6b7280;">Tomado: $${parseFloat(a.cotizacion_usd).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
            <div style="font-size:12px; color:#374151;">${money(a.importe_consumido)}</div>
          ` : `
            <span style="font-size:10px; color:#6b7280; display:block;">${a.divisa || 'ARS'}</span>
            ${money(a.importe_consumido)}
          `}
        </td>`;
        htmlConsumidos += `<td>${a.medio_pago || '-'}</td>`;
        htmlConsumidos += `<td>${a.created_by || '-'}</td>`;
        htmlConsumidos += `<td style="font-size:12px; color:#6b7280;">${a.observaciones_consumo || (a.observaciones_anticipo || '-')}</td>`;
        htmlConsumidos += `<td style="text-align:center;">
          <button class="btn-action btn-eliminar"
                  onclick="desconsumirAnticipo(${a.anticipo_id})"
                  ${!puedeActuar ? 'disabled' : ''}
                  style="font-size:11px; padding:4px 8px;"
                  title="Deshacer consumo (error)">
            ↩️ Desconsumir
          </button>
        </td>`;
        htmlConsumidos += '</tr>';
      });

      htmlConsumidos += '</tbody></table>';
    }
    consumidosContainer.innerHTML = htmlConsumidos;
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
        // Recargar datos - usar 'anticiposTab' que es el nombre registrado en OrqTabs
        if (window.OrqTabs) {
          await OrqTabs.reload('anticiposTab');
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

  // FUNCIÓN ELIMINADA: Ya no se permite marcar anticipos como "no vino a esta caja"
  // Los anticipos sin consumir quedarán pendientes y bloquearán el cierre del local

  // Desconsumir anticipo
  window.desconsumirAnticipo = async function(anticipoId) {
    const anticipo = anticiposConsumidos.find(a => a.anticipo_id === anticipoId);
    if (!anticipo) return;

    const confirmacion = confirm(
      `¿Desconsumir el anticipo de "${anticipo.cliente}" por ${money(anticipo.importe_consumido)}?\n\n` +
      `El anticipo volverá a estar disponible para todas las cajas.\n` +
      `Usar solo si se consumió por error.`
    );

    if (!confirmacion) return;

    const ctx = getCtx();

    setLoading(true);

    try {
      const response = await fetch('/api/anticipos/desconsumir', {
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
        // Recargar datos - usar 'anticiposTab' que es el nombre registrado en OrqTabs
        if (window.OrqTabs) {
          await OrqTabs.reload('anticiposTab');
        } else {
          await loadAnticipos();
        }
      } else {
        alert(`❌ Error: ${data.msg || 'No se pudo desconsumir el anticipo'}`);
      }

    } catch (error) {
      console.error('Error desconsumiendo anticipo:', error);
      alert('❌ Error de red al desconsumir anticipo');
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
