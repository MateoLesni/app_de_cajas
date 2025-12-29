// static/js/remesas_no_retiradas.js
(function() {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let remesasData = [];
  let localesData = [];
  let userLevel = 0;
  let remesaEditando = null;

  // ===== INICIALIZACIÓN =====
  document.addEventListener('DOMContentLoaded', async () => {
    await loadLocales();
    await loadRemesas();
    setupEventListeners();
  });

  function setupEventListeners() {
    $('#formMarcarRetirada')?.addEventListener('submit', marcarComoRetirada);
    $('#formEditarRetirada')?.addEventListener('submit', editarRemesa);
  }

  // ===== CARGAR LOCALES (para auditores) =====
  async function loadLocales() {
    try {
      const response = await fetch('/api/locales');
      const data = await response.json();
      const localesRaw = data.locales || [];

      localesData = localesRaw.map(l => {
        if (typeof l === 'string') return l;
        else if (l && l.nombre) return l.nombre;
        else if (l && l.local) return l.local;
        else return String(l);
      });

      console.log('Locales cargados:', localesData);
    } catch (error) {
      console.error('Error al cargar locales:', error);
    }
  }

  // ===== CARGAR REMESAS =====
  async function loadRemesas(filtros = {}) {
    try {
      $('#loadingState').style.display = 'block';
      $('#emptyState').style.display = 'none';
      $('#remesasTable').style.display = 'none';
      $('#alertBox').style.display = 'none';

      // Construir query string
      const params = new URLSearchParams();
      if (filtros.local) params.append('local', filtros.local);
      if (filtros.fecha_desde) params.append('fecha_desde', filtros.fecha_desde);
      if (filtros.fecha_hasta) params.append('fecha_hasta', filtros.fecha_hasta);

      const response = await fetch(`/api/remesas-no-retiradas/listar?${params.toString()}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.msg || 'Error al cargar remesas');
      }

      remesasData = data.remesas || [];
      userLevel = data.user_level || 0;

      console.log('Remesas cargadas:', remesasData.length, 'User level:', userLevel);

      // Mostrar filtros solo para auditores
      if (userLevel >= 3) {
        $('#filtersCard').style.display = 'block';
        $('#localFilterGroup').style.display = 'block';

        // Llenar select de locales
        const select = $('#filtroLocal');
        select.innerHTML = '<option value="">Todos los locales</option>';
        localesData.forEach(local => {
          const option = document.createElement('option');
          option.value = local;
          option.textContent = local;
          select.appendChild(option);
        });
      } else {
        $('#filtersCard').style.display = 'block';
        $('#localFilterGroup').style.display = 'none';
      }

      $('#loadingState').style.display = 'none';

      if (remesasData.length === 0) {
        // ¡Todo en orden!
        $('#emptyState').style.display = 'block';
        $('#alertBox').style.display = 'none';
      } else {
        // Mostrar tabla y alerta
        $('#remesasTable').style.display = 'table';
        renderRemesas();
        showAlert(remesasData.length);
      }
    } catch (error) {
      console.error('Error al cargar remesas:', error);
      $('#loadingState').style.display = 'none';
      $('#emptyState').style.display = 'block';
      alert('Error al cargar remesas: ' + error.message);
    }
  }

  // ===== MOSTRAR ALERTA =====
  function showAlert(count) {
    const alertBox = $('#alertBox');
    const alertTitle = $('#alertTitle');
    const alertMessage = $('#alertMessage');

    if (count === 0) {
      alertBox.classList.add('success');
      alertBox.querySelector('.alert-icon').textContent = '✅';
      alertTitle.textContent = '¡Todo al día!';
      alertMessage.textContent = 'No hay remesas pendientes de retiro';
    } else {
      alertBox.classList.remove('success');
      alertBox.querySelector('.alert-icon').textContent = '⚠️';
      alertTitle.textContent = `${count} Remesa${count > 1 ? 's' : ''} Pendiente${count > 1 ? 's' : ''}`;
      alertMessage.textContent = userLevel >= 3
        ? `Hay ${count} remesa${count > 1 ? 's' : ''} sin retirar en el sistema`
        : `Tenés ${count} remesa${count > 1 ? 's' : ''} pendiente${count > 1 ? 's' : ''} de marcar como retirada`;
    }

    alertBox.style.display = 'flex';
  }

  // ===== RENDERIZAR TABLA =====
  function renderRemesas() {
    const tbody = $('#remesasTableBody');
    tbody.innerHTML = '';

    remesasData.forEach(remesa => {
      const tr = document.createElement('tr');

      const monto = formatMoney(remesa.monto);
      const fecha = formatDate(remesa.fecha);

      // Botones según nivel de usuario
      let accionesHTML = '';
      if (userLevel >= 3) {
        // Auditor: puede marcar como retirada Y editar
        accionesHTML = `
          <button class="btn btn-success" onclick="abrirModalMarcar(${remesa.id})">
            Marcar Retirada
          </button>
        `;
      } else {
        // Encargado: solo puede marcar como retirada
        accionesHTML = `
          <button class="btn btn-success" onclick="abrirModalMarcar(${remesa.id})">
            Marcar Retirada
          </button>
        `;
      }

      tr.innerHTML = `
        <td>${fecha}</td>
        <td>${escapeHtml(remesa.local)}</td>
        <td>${escapeHtml(remesa.caja)}</td>
        <td>${escapeHtml(remesa.turno)}</td>
        <td>${escapeHtml(remesa.nro_remesa || '-')}</td>
        <td>${escapeHtml(remesa.precinto || '-')}</td>
        <td style="font-weight: 700; color: #dc2626;">${monto}</td>
        <td style="font-size: 12px; color: #6b7280;">${escapeHtml(remesa.usuario || '-')}</td>
        <td>${accionesHTML}</td>
      `;

      tbody.appendChild(tr);
    });
  }

  // ===== ABRIR MODAL MARCAR COMO RETIRADA =====
  window.abrirModalMarcar = function(remesaId) {
    const remesa = remesasData.find(r => r.id === remesaId);
    if (!remesa) return;

    remesaEditando = remesa;

    // Llenar datos de la remesa
    $('#detalleFechaCaja').textContent = formatDate(remesa.fecha);
    $('#detalleLocal').textContent = remesa.local;
    $('#detalleCajaTurno').textContent = `${remesa.caja} / ${remesa.turno}`;
    $('#detalleMonto').textContent = formatMoney(remesa.monto);

    // Limpiar y preparar formulario
    $('#remesaId').value = remesaId;
    $('#fechaRetiro').value = ''; // Usuario debe ingresar fecha
    $('#retiradaPor').value = '';

    // Sugerir fecha de hoy por defecto
    const hoy = new Date().toISOString().split('T')[0];
    $('#fechaRetiro').value = hoy;

    $('#modalMarcarRetirada').classList.add('active');
    $('#retiradaPor').focus();
  };

  window.cerrarModalMarcar = function() {
    $('#modalMarcarRetirada').classList.remove('active');
    $('#formMarcarRetirada').reset();
    remesaEditando = null;
  };

  // ===== MARCAR COMO RETIRADA =====
  async function marcarComoRetirada(e) {
    e.preventDefault();

    const remesaId = $('#remesaId').value;
    const fechaRetirada = $('#fechaRetiro').value.trim();
    const retiradaPor = $('#retiradaPor').value.trim();

    if (!fechaRetirada) {
      alert('La fecha de retiro es requerida');
      return;
    }

    if (!retiradaPor) {
      alert('El nombre de quien retira es requerido');
      return;
    }

    // Validar que el nombre tenga al menos 3 caracteres
    if (retiradaPor.length < 3) {
      alert('El nombre debe tener al menos 3 caracteres');
      return;
    }

    try {
      const response = await fetch(`/api/remesas-no-retiradas/${remesaId}/marcar-retirada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha_retirada: fechaRetirada,
          retirada_por: retiradaPor
        })
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.msg || 'Error al marcar remesa como retirada');
        return;
      }

      alert(`✅ Remesa marcada como retirada correctamente.\n\nFecha de retiro: ${formatDate(fechaRetirada)}\nRetirada por: ${retiradaPor}`);
      cerrarModalMarcar();
      await loadRemesas(); // Recargar lista
    } catch (error) {
      console.error('Error al marcar remesa:', error);
      alert('Error al marcar remesa: ' + error.message);
    }
  }

  // ===== ABRIR MODAL EDITAR (Solo auditores) =====
  window.abrirModalEditar = function(remesaId) {
    const remesa = remesasData.find(r => r.id === remesaId);
    if (!remesa) return;

    remesaEditando = remesa;

    $('#editarDetalleRemesa').textContent = `${remesa.local} - ${formatDate(remesa.fecha)} - ${formatMoney(remesa.monto)}`;
    $('#editarRemesaId').value = remesaId;
    $('#editarFechaRetiro').value = remesa.fecha_retirada || '';
    $('#editarRetiradaPor').value = remesa.retirada_por || '';

    $('#modalEditarRetirada').classList.add('active');
    $('#editarFechaRetiro').focus();
  };

  window.cerrarModalEditar = function() {
    $('#modalEditarRetirada').classList.remove('active');
    $('#formEditarRetirada').reset();
    remesaEditando = null;
  };

  // ===== EDITAR REMESA (Solo auditores) =====
  async function editarRemesa(e) {
    e.preventDefault();

    const remesaId = $('#editarRemesaId').value;
    const fechaRetirada = $('#editarFechaRetiro').value.trim();
    const retiradaPor = $('#editarRetiradaPor').value.trim();

    if (!fechaRetirada && !retiradaPor) {
      alert('Debés proporcionar al menos un campo a editar');
      return;
    }

    const body = {};
    if (fechaRetirada) body.fecha_retirada = fechaRetirada;
    if (retiradaPor) body.retirada_por = retiradaPor;

    try {
      const response = await fetch(`/api/remesas-no-retiradas/${remesaId}/editar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.msg || 'Error al editar remesa');
        return;
      }

      alert('✅ Datos de retiro actualizados correctamente');
      cerrarModalEditar();
      await loadRemesas();
    } catch (error) {
      console.error('Error al editar remesa:', error);
      alert('Error al editar remesa: ' + error.message);
    }
  }

  // ===== FILTROS =====
  window.aplicarFiltros = function() {
    const filtros = {
      local: $('#filtroLocal')?.value || '',
      fecha_desde: $('#filtroFechaDesde').value,
      fecha_hasta: $('#filtroFechaHasta').value
    };

    loadRemesas(filtros);
  };

  window.limpiarFiltros = function() {
    if ($('#filtroLocal')) $('#filtroLocal').value = '';
    $('#filtroFechaDesde').value = '';
    $('#filtroFechaHasta').value = '';

    loadRemesas();
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

  function formatMoney(amount) {
    if (!amount && amount !== 0) return '$0,00';
    return `$${Number(amount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  // Cerrar modals al hacer clic fuera
  $('#modalMarcarRetirada')?.addEventListener('click', function(e) {
    if (e.target === this) {
      cerrarModalMarcar();
    }
  });

  $('#modalEditarRetirada')?.addEventListener('click', function(e) {
    if (e.target === this) {
      cerrarModalEditar();
    }
  });

  // Exponer funciones globales
  window.abrirModalMarcar = abrirModalMarcar;
  window.cerrarModalMarcar = cerrarModalMarcar;
  window.abrirModalEditar = abrirModalEditar;
  window.cerrarModalEditar = cerrarModalEditar;
  window.aplicarFiltros = aplicarFiltros;
  window.limpiarFiltros = limpiarFiltros;

})();
