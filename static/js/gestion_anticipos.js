// static/js/gestion_anticipos.js
(function() {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const fmt = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (v) => '$' + fmt.format(Number(v ?? 0));

  let localesDisponibles = [];
  let anticiposData = [];

  // ===== INICIALIZACIÓN =====
  document.addEventListener('DOMContentLoaded', async () => {
    await loadLocales();
    await loadAnticipos();
    setupEventListeners();
  });

  async function loadLocales() {
    try {
      const response = await fetch('/api/locales');
      const data = await response.json();
      localesDisponibles = data.locales || [];

      // Llenar select de filtro
      const filtroLocal = $('#filtroLocal');
      localesDisponibles.forEach(l => {
        const localNombre = typeof l === 'string' ? l : (l.local || l.nombre || String(l));
        const option = document.createElement('option');
        option.value = localNombre;
        option.textContent = localNombre;
        filtroLocal.appendChild(option);
      });

      // Llenar select del modal
      const localSelect = $('#local');
      localesDisponibles.forEach(l => {
        const localNombre = typeof l === 'string' ? l : (l.local || l.nombre || String(l));
        const option = document.createElement('option');
        option.value = localNombre;
        option.textContent = localNombre;
        localSelect.appendChild(option);
      });

    } catch (error) {
      console.error('Error al cargar locales:', error);
      localesDisponibles = [];
    }
  }

  function setupEventListeners() {
    $('#btnNuevoAnticipo')?.addEventListener('click', () => abrirModal());

    // Filtros
    $('#filtroEstado')?.addEventListener('change', () => loadAnticipos());
    $('#filtroLocal')?.addEventListener('change', () => loadAnticipos());
    $('#filtroFechaDesde')?.addEventListener('change', () => loadAnticipos());
    $('#filtroFechaHasta')?.addEventListener('change', () => loadAnticipos());
  }

  // ===== CARGAR ANTICIPOS =====
  async function loadAnticipos() {
    const tbody = $('#anticiposTableBody');
    if (!tbody) return;

    try {
      // Obtener filtros
      const estado = $('#filtroEstado')?.value || '';
      const local = $('#filtroLocal')?.value || '';
      const fechaDesde = $('#filtroFechaDesde')?.value || '';
      const fechaHasta = $('#filtroFechaHasta')?.value || '';

      // Construir URL con filtros
      let url = '/api/anticipos_recibidos/listar?';
      if (estado) url += `estado=${encodeURIComponent(estado)}&`;
      if (local) url += `local=${encodeURIComponent(local)}&`;
      if (fechaDesde) url += `fecha_desde=${encodeURIComponent(fechaDesde)}&`;
      if (fechaHasta) url += `fecha_hasta=${encodeURIComponent(fechaHasta)}&`;

      const response = await fetch(url);
      const data = await response.json();

      if (!data.success) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: #ef4444;">Error al cargar anticipos</td></tr>';
        return;
      }

      anticiposData = data.anticipos || [];

      // Actualizar estadísticas
      updateStats(anticiposData);

      if (anticiposData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: #6b7280;">No hay anticipos para mostrar</td></tr>';
        return;
      }

      tbody.innerHTML = anticiposData.map(a => {
        const badgeClass = `badge-${a.estado}`;
        const estadoText = {
          'pendiente': 'Pendiente',
          'consumido': 'Consumido',
          'eliminado_global': 'Eliminado'
        }[a.estado] || a.estado;

        const puedeEditar = a.estado === 'pendiente';
        const puedeEliminar = a.estado === 'pendiente';

        return `
          <tr>
            <td>${formatDate(a.fecha_pago)}</td>
            <td>${formatDate(a.fecha_evento)}</td>
            <td>${a.cliente}</td>
            <td>${a.local}</td>
            <td style="text-align:right; font-weight:600;">
              <span style="font-size:11px; color:#6b7280; display:block;">${a.divisa || 'ARS'}</span>
              ${money(a.importe)}
            </td>
            <td>${a.medio_pago || '-'}</td>
            <td>${a.created_by || '-'}</td>
            <td><span class="badge ${badgeClass}">${estadoText}</span></td>
            <td>
              ${a.tiene_adjunto ? `<button class="btn-edit" onclick="verAdjunto(${a.id})" title="Ver comprobante">📎</button>` : ''}
              ${puedeEditar ? `<button class="btn-edit" onclick="editarAnticipo(${a.id})" title="Editar fecha">✏️</button>` : ''}
              ${puedeEliminar ? `<button class="btn-delete" onclick="eliminarAnticipo(${a.id}, '${a.cliente}')" title="Eliminar">🗑️</button>` : ''}
              <button class="btn-edit" onclick="verDetalles(${a.id})" title="Ver detalles">👁️</button>
            </td>
          </tr>
        `;
      }).join('');

    } catch (error) {
      console.error('Error al cargar anticipos:', error);
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: #ef4444;">Error de red</td></tr>';
    }
  }

  function updateStats(anticipos) {
    const pendientes = anticipos.filter(a => a.estado === 'pendiente');
    const consumidos = anticipos.filter(a => a.estado === 'consumido');
    const eliminados = anticipos.filter(a => a.estado === 'eliminado_global');

    const montoPendiente = pendientes.reduce((sum, a) => sum + parseFloat(a.importe || 0), 0);

    $('#statPendientes').textContent = pendientes.length;
    $('#statConsumidos').textContent = consumidos.length;
    $('#statEliminados').textContent = eliminados.length;
    $('#statMontoPendiente').textContent = money(montoPendiente);
  }

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

  // ===== MODAL =====
  window.abrirModal = function(anticipoId = null) {
    const modal = $('#modalAnticipo');
    const title = $('#modalTitle');

    // Limpiar formulario
    $('#anticipoId').value = '';
    $('#fechaPago').value = '';
    $('#fechaEvento').value = '';
    $('#cliente').value = '';
    $('#local').value = '';
    $('#importe').value = '';
    $('#medioPago').value = '';
    $('#numeroTransaccion').value = '';
    $('#observaciones').value = '';

    if (anticipoId) {
      title.textContent = 'Editar Anticipo';
      loadAnticipoData(anticipoId);
    } else {
      title.textContent = 'Nuevo Anticipo';
      // Setear fecha de pago a hoy por defecto
      const today = new Date().toISOString().split('T')[0];
      $('#fechaPago').value = today;
    }

    modal.classList.add('active');
  };

  async function loadAnticipoData(anticipoId) {
    const anticipo = anticiposData.find(a => a.id === anticipoId);
    if (!anticipo) return;

    $('#anticipoId').value = anticipo.id;
    $('#fechaPago').value = anticipo.fecha_pago;
    $('#fechaEvento').value = anticipo.fecha_evento;
    $('#cliente').value = anticipo.cliente;
    $('#local').value = anticipo.local;
    $('#importe').value = anticipo.importe;
    $('#medioPago').value = anticipo.medio_pago || '';
    $('#numeroTransaccion').value = anticipo.numero_transaccion || '';
    $('#observaciones').value = anticipo.observaciones || '';

    // Solo permitir editar fecha_evento y observaciones si es edición
    $('#fechaPago').disabled = true;
    $('#cliente').disabled = true;
    $('#local').disabled = true;
    $('#importe').disabled = true;
    $('#medioPago').disabled = true;
    $('#numeroTransaccion').disabled = true;
  }

  window.cerrarModal = function() {
    const modal = $('#modalAnticipo');
    modal?.classList.remove('active');

    // Rehabilitar todos los campos
    $('#fechaPago').disabled = false;
    $('#cliente').disabled = false;
    $('#local').disabled = false;
    $('#importe').disabled = false;
    $('#medioPago').disabled = false;
    $('#numeroTransaccion').disabled = false;
  };

  // ===== GUARDAR ANTICIPO =====
  window.guardarAnticipo = async function(event) {
    event.preventDefault();

    const anticipoId = $('#anticipoId').value;
    const isEdit = !!anticipoId;

    // Si es creación, validar y subir adjunto primero
    let adjuntoPath = null;
    if (!isEdit) {
      const adjuntoFile = $('#adjunto').files[0];
      if (!adjuntoFile) {
        alert('⚠️  Debés subir un comprobante del anticipo');
        return;
      }

      // Subir adjunto
      try {
        const formData = new FormData();
        formData.append('files[]', adjuntoFile);
        formData.append('tab', 'anticipos');
        formData.append('local', $('#local').value);
        formData.append('caja', 'admin');
        formData.append('turno', 'dia');
        formData.append('fecha', $('#fechaPago').value);
        formData.append('entity_type', 'anticipo_recibido');
        formData.append('entity_id', '0'); // temporal

        const uploadRes = await fetch('/files/upload', {
          method: 'POST',
          body: formData
        });

        const uploadData = await uploadRes.json();
        if (!uploadData.success) {
          alert('❌ Error subiendo comprobante: ' + uploadData.msg);
          return;
        }

        adjuntoPath = uploadData.items[0].path;
      } catch (error) {
        console.error('Error al subir adjunto:', error);
        alert('❌ Error al subir el comprobante');
        return;
      }
    }

    const data = {
      fecha_pago: $('#fechaPago').value,
      fecha_evento: $('#fechaEvento').value,
      cliente: $('#cliente').value,
      local: $('#local').value,
      importe: parseFloat($('#importe').value),
      divisa: $('#divisa').value,
      medio_pago: $('#medioPago').value.trim() || null,
      numero_transaccion: $('#numeroTransaccion').value.trim() || null,
      observaciones: $('#observaciones').value.trim() || null
    };

    // Agregar adjunto si existe
    if (adjuntoPath) {
      data.adjunto_gcs_path = adjuntoPath;
    }

    // Validaciones
    if (!data.fecha_pago || !data.fecha_evento || !data.cliente || !data.local || !data.importe) {
      alert('Por favor completá todos los campos requeridos');
      return;
    }

    if (data.importe <= 0) {
      alert('El importe debe ser mayor a cero');
      return;
    }

    try {
      let url, method;
      if (isEdit) {
        url = `/api/anticipos_recibidos/editar/${anticipoId}`;
        method = 'PUT';
        // Solo enviar campos editables
        delete data.fecha_pago;
        delete data.cliente;
        delete data.local;
        delete data.importe;
        delete data.divisa;
        delete data.medio_pago;
        delete data.numero_transaccion;
        delete data.adjunto_gcs_path;
      } else {
        url = '/api/anticipos_recibidos/crear';
        method = 'POST';
      }

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (result.success) {
        alert(`✅ ${result.msg}`);
        cerrarModal();
        await loadAnticipos();
      } else {
        alert(`❌ Error: ${result.msg || 'No se pudo guardar el anticipo'}`);
      }
    } catch (error) {
      console.error('Error al guardar anticipo:', error);
      alert('❌ Error de red al guardar anticipo');
    }
  };

  // ===== EDITAR ANTICIPO =====
  window.editarAnticipo = function(anticipoId) {
    abrirModal(anticipoId);
  };

  // ===== ELIMINAR ANTICIPO =====
  window.eliminarAnticipo = async function(anticipoId, cliente) {
    const confirmacion1 = confirm(`⚠️ ¿Estás seguro que querés eliminar el anticipo de "${cliente}"?`);
    if (!confirmacion1) return;

    const confirmacion2 = confirm(`⚠️ ATENCIÓN: Esta acción NO SE PUEDE DESHACER.\n\n¿Confirmas que querés eliminar definitivamente este anticipo?`);
    if (!confirmacion2) return;

    try {
      const response = await fetch(`/api/anticipos_recibidos/eliminar/${anticipoId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ ${data.msg}`);
        await loadAnticipos();
      } else {
        alert(`❌ Error: ${data.msg || 'No se pudo eliminar el anticipo'}`);
      }
    } catch (error) {
      console.error('Error al eliminar anticipo:', error);
      alert('❌ Error de red al eliminar anticipo');
    }
  };

  // ===== VER DETALLES =====
  window.verDetalles = function(anticipoId) {
    const anticipo = anticiposData.find(a => a.id === anticipoId);
    if (!anticipo) return;

    const detalles = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 DETALLES DEL ANTICIPO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cliente: ${anticipo.cliente}
Local: ${anticipo.local}
Importe: ${money(anticipo.importe)}

Fecha de Pago: ${formatDate(anticipo.fecha_pago)}
Fecha de Evento: ${formatDate(anticipo.fecha_evento)}

Medio de Pago: ${anticipo.medio_pago || '-'}
Nº Transacción: ${anticipo.numero_transaccion || '-'}

Estado: ${anticipo.estado}

Observaciones:
${anticipo.observaciones || 'Sin observaciones'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Creado por: ${anticipo.created_by}
Fecha creación: ${formatDateTime(anticipo.created_at)}
${anticipo.updated_by ? `\nÚltima actualización: ${formatDateTime(anticipo.updated_at)} por ${anticipo.updated_by}` : ''}
${anticipo.deleted_by ? `\nEliminado: ${formatDateTime(anticipo.deleted_at)} por ${anticipo.deleted_by}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `;

    alert(detalles);
  };

  function formatDateTime(dateString) {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('es-AR');
    } catch {
      return dateString;
    }
  }

  // ===== VER ADJUNTO =====
  window.verAdjunto = async function(anticipoId) {
    const anticipo = anticiposData.find(a => a.id === anticipoId);
    if (!anticipo) return;

    if (!anticipo.tiene_adjunto) {
      alert('Este anticipo no tiene comprobante adjunto');
      return;
    }

    try {
      // Obtener detalles del adjunto desde el servidor
      const response = await fetch(`/files/list?tab=anticipos&local=${encodeURIComponent(anticipo.local)}&fecha=${anticipo.fecha_pago}&scope=month`);
      const data = await response.json();

      if (data.success && data.items && data.items.length > 0) {
        // Abrir el primer adjunto en nueva ventana
        window.open(data.items[0].view_url, '_blank', 'width=800,height=600');
      } else {
        alert('No se pudo encontrar el comprobante');
      }
    } catch (error) {
      console.error('Error al obtener adjunto:', error);
      alert('❌ Error al cargar el comprobante');
    }
  };

})();
