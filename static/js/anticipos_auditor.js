// static/js/anticipos_auditor.js
(function() {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let anticiposData = [];
  let localesData = [];

  // ===== INICIALIZACIÓN =====
  document.addEventListener('DOMContentLoaded', async () => {
    await loadLocales();
    await loadAnticipos();
  });

  // ===== CARGAR LOCALES =====
  async function loadLocales() {
    try {
      const response = await fetch('/api/locales');
      const data = await response.json();
      const localesRaw = data.locales || [];

      // Normalizar: si son objetos {nombre: "..."}, extraer el nombre
      localesData = localesRaw.map(l => {
        if (typeof l === 'string') return l;
        else if (l && l.nombre) return l.nombre;
        else if (l && l.local) return l.local;
        else return String(l);
      });

      const select = $('#filtroLocal');
      localesData.forEach(local => {
        const option = document.createElement('option');
        option.value = local;
        option.textContent = local;
        select.appendChild(option);
      });

      console.log('Locales cargados:', localesData);
    } catch (error) {
      console.error('Error al cargar locales:', error);
    }
  }

  // ===== CARGAR ANTICIPOS =====
  async function loadAnticipos(filtros = {}) {
    try {
      $('#loadingState').style.display = 'block';
      $('#emptyState').style.display = 'none';
      $('#anticiposTable').style.display = 'none';

      // Construir query string con filtros
      const params = new URLSearchParams();
      if (filtros.local) params.append('local', filtros.local);
      if (filtros.estado) params.append('estado', filtros.estado);
      if (filtros.fecha_evento_desde) params.append('fecha_desde', filtros.fecha_evento_desde);
      if (filtros.fecha_evento_hasta) params.append('fecha_hasta', filtros.fecha_evento_hasta);

      const response = await fetch(`/api/anticipos_auditor/listar?${params.toString()}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.msg || 'Error al cargar anticipos');
      }

      anticiposData = data.anticipos || [];
      console.log('Anticipos cargados:', anticiposData.length);

      // Aplicar filtros del frontend (cliente, fechas de pago)
      let anticiposFiltrados = [...anticiposData];

      if (filtros.cliente) {
        const clienteBusqueda = filtros.cliente.toLowerCase();
        anticiposFiltrados = anticiposFiltrados.filter(a =>
          a.cliente.toLowerCase().includes(clienteBusqueda)
        );
      }

      if (filtros.fecha_pago_desde) {
        anticiposFiltrados = anticiposFiltrados.filter(a =>
          a.fecha_pago >= filtros.fecha_pago_desde
        );
      }

      if (filtros.fecha_pago_hasta) {
        anticiposFiltrados = anticiposFiltrados.filter(a =>
          a.fecha_pago <= filtros.fecha_pago_hasta
        );
      }

      $('#loadingState').style.display = 'none';

      if (anticiposFiltrados.length === 0) {
        $('#emptyState').style.display = 'block';
      } else {
        $('#anticiposTable').style.display = 'table';
        renderAnticipos(anticiposFiltrados);
      }
    } catch (error) {
      console.error('Error al cargar anticipos:', error);
      $('#loadingState').style.display = 'none';
      $('#emptyState').style.display = 'block';
      alert('Error al cargar anticipos: ' + error.message);
    }
  }

  // ===== RENDERIZAR TABLA =====
  function renderAnticipos(anticipos) {
    const tbody = $('#anticiposTableBody');
    tbody.innerHTML = '';

    anticipos.forEach(anticipo => {
      const tr = document.createElement('tr');

      const estadoBadge = getEstadoBadge(anticipo);
      const importe = formatMoney(anticipo.importe);
      const divisaBadge = anticipo.divisa && anticipo.divisa !== 'ARS'
        ? `<span class="divisa-badge">${escapeHtml(anticipo.divisa)}</span>`
        : '';

      tr.innerHTML = `
        <td>${formatDate(anticipo.fecha_pago)}</td>
        <td>${formatDate(anticipo.fecha_evento)}</td>
        <td>${escapeHtml(anticipo.cliente)}</td>
        <td>${escapeHtml(anticipo.local)}</td>
        <td>${importe} ${divisaBadge}</td>
        <td>${estadoBadge}</td>
        <td>${escapeHtml(anticipo.created_by || '-')}</td>
        <td>
          <button class="btn-ver" onclick="verDetalle(${anticipo.id})">
            Ver Detalle
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    });
  }

  // ===== VER DETALLE =====
  window.verDetalle = async function(anticipoId) {
    const anticipo = anticiposData.find(a => a.id === anticipoId);
    if (!anticipo) return;

    const modalBody = $('#modalDetalleBody');

    const estadoBadge = getEstadoBadge(anticipo);
    const divisaBadge = anticipo.divisa && anticipo.divisa !== 'ARS'
      ? `<span class="divisa-badge">${escapeHtml(anticipo.divisa)}</span>`
      : '';

    modalBody.innerHTML = `
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">Fecha de Pago</span>
          <span class="detail-value">${formatDate(anticipo.fecha_pago)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Fecha del Evento</span>
          <span class="detail-value">${formatDate(anticipo.fecha_evento)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Cliente</span>
          <span class="detail-value">${escapeHtml(anticipo.cliente)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Local</span>
          <span class="detail-value">${escapeHtml(anticipo.local)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Importe</span>
          <span class="detail-value">${formatMoney(anticipo.importe)} ${divisaBadge}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Estado</span>
          <span class="detail-value">${estadoBadge}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Medio de Pago</span>
          <span class="detail-value">${escapeHtml(anticipo.medio_pago || '-')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">N° Transacción</span>
          <span class="detail-value">${escapeHtml(anticipo.numero_transaccion || '-')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Usuario que Cargó</span>
          <span class="detail-value">${escapeHtml(anticipo.created_by || '-')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Fecha de Creación</span>
          <span class="detail-value">${formatDateTime(anticipo.created_at)}</span>
        </div>
        ${anticipo.observaciones ? `
          <div class="detail-item" style="grid-column: 1 / -1;">
            <span class="detail-label">Observaciones</span>
            <span class="detail-value">${escapeHtml(anticipo.observaciones)}</span>
          </div>
        ` : ''}
      </div>
    `;

    // Cargar adjuntos si existen
    if (anticipo.tiene_adjunto) {
      await loadAdjuntos(anticipo, modalBody);
    }

    $('#modalDetalle').classList.add('active');
  };

  // ===== CARGAR ADJUNTOS =====
  async function loadAdjuntos(anticipo, modalBody) {
    try {
      const response = await fetch(`/files/list?tab=anticipos&local=${encodeURIComponent(anticipo.local)}&fecha=${anticipo.fecha_pago}&scope=month`);
      const data = await response.json();

      if (data.success && data.files && data.files.length > 0) {
        // Filtrar solo las que corresponden a este anticipo
        const adjuntos = data.files.filter(f =>
          f.entity_type === 'anticipo_recibido' && f.entity_id === anticipo.id
        );

        if (adjuntos.length > 0) {
          const adjuntosHTML = `
            <div class="adjuntos-section">
              <h3>Comprobantes Adjuntos (${adjuntos.length})</h3>
              <div class="adjuntos-grid">
                ${adjuntos.map(adj => `
                  <div class="adjunto-item" onclick="verAdjunto('${escapeHtml(adj.url)}')">
                    <img src="${escapeHtml(adj.url)}" alt="Comprobante" onerror="this.src='/static/img/file-icon.png'">
                    <div class="adjunto-info">
                      ${escapeHtml(adj.filename || 'Comprobante')}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
          modalBody.innerHTML += adjuntosHTML;
        }
      }
    } catch (error) {
      console.error('Error al cargar adjuntos:', error);
    }
  }

  // ===== VER ADJUNTO =====
  window.verAdjunto = function(url) {
    window.open(url, '_blank');
  };

  // ===== CERRAR MODAL =====
  window.cerrarModalDetalle = function() {
    $('#modalDetalle').classList.remove('active');
  };

  // ===== FILTROS =====
  window.aplicarFiltros = function() {
    const filtros = {
      local: $('#filtroLocal').value,
      cliente: $('#filtroCliente').value.trim(),
      fecha_evento_desde: $('#filtroFechaEventoDesde').value,
      fecha_evento_hasta: $('#filtroFechaEventoHasta').value,
      fecha_pago_desde: $('#filtroFechaPagoDesde').value,
      fecha_pago_hasta: $('#filtroFechaPagoHasta').value,
      estado: $('#filtroEstado').value
    };

    loadAnticipos(filtros);
  };

  window.limpiarFiltros = function() {
    $('#filtroLocal').value = '';
    $('#filtroCliente').value = '';
    $('#filtroFechaEventoDesde').value = '';
    $('#filtroFechaEventoHasta').value = '';
    $('#filtroFechaPagoDesde').value = '';
    $('#filtroFechaPagoHasta').value = '';
    $('#filtroEstado').value = '';

    loadAnticipos();
  };

  // ===== UTILIDADES =====
  function formatDate(dateString) {
    if (!dateString || dateString === 'null' || dateString === 'undefined') return '-';
    try {
      let dateStr = String(dateString);
      if (dateStr.includes('T')) dateStr = dateStr.split('T')[0];
      if (dateStr.includes(' ')) dateStr = dateStr.split(' ')[0];

      const parts = dateStr.split('-');
      if (parts.length !== 3) return '-';

      const [year, month, day] = parts;
      if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) return '-';

      return `${day}/${month}/${year}`;
    } catch {
      return '-';
    }
  }

  function formatDateTime(dateString) {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('es-AR');
    } catch {
      return dateString;
    }
  }

  function formatMoney(amount) {
    if (!amount && amount !== 0) return '$0,00';
    return `$${Number(amount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function getEstadoBadge(anticipo) {
    const estado = anticipo.estado || 'pendiente';
    const estadoReal = anticipo.fue_consumido > 0 ? 'consumido' : estado;

    const badges = {
      'pendiente': '<span class="badge badge-pendiente">Pendiente</span>',
      'consumido': '<span class="badge badge-consumido">Consumido</span>',
      'eliminado_global': '<span class="badge badge-eliminado">Eliminado</span>'
    };

    return badges[estadoReal] || badges['pendiente'];
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  // Cerrar modal al hacer clic fuera
  $('#modalDetalle')?.addEventListener('click', function(e) {
    if (e.target === this) {
      cerrarModalDetalle();
    }
  });

})();
