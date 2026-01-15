/**
 * auditoria_remesas.js
 * ====================
 * Maneja la visualización de la auditoría completa de remesas
 *
 * Funcionalidades:
 * - Ver todos los cambios en remesas_trns (INSERT, UPDATE, DELETE)
 * - Filtros: nro_remesa, precinto, local, rango de fechas
 * - Modal para ver detalles de cambios (antes/después)
 */

// Estado global
let auditoriaData = [];

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🔒 Auditoría de Remesas - Inicializando...');

  // Configurar fechas por defecto (últimos 7 días)
  configurarFechasPorDefecto();

  // Cargar auditoría inicialmente
  await cargarAuditoria();
});

// =====================================================
// CONFIGURAR FECHAS POR DEFECTO (ÚLTIMA SEMANA - 7 DÍAS)
// =====================================================

function configurarFechasPorDefecto() {
  const hoy = new Date();
  const hace7Dias = new Date();
  hace7Dias.setDate(hoy.getDate() - 7);

  const filtroFechaDesde = document.getElementById('filtroFechaDesde');
  const filtroFechaHasta = document.getElementById('filtroFechaHasta');

  if (filtroFechaDesde) {
    filtroFechaDesde.value = hace7Dias.toISOString().split('T')[0];
  }

  if (filtroFechaHasta) {
    filtroFechaHasta.value = hoy.toISOString().split('T')[0];
  }
}

// =====================================================
// CARGAR AUDITORÍA DESDE LA API
// =====================================================

async function cargarAuditoria() {
  mostrarEstado('loading');

  try {
    // Construir query params
    const params = new URLSearchParams();

    const filtroNroRemesa = document.getElementById('filtroNroRemesa')?.value.trim();
    const filtroPrecinto = document.getElementById('filtroPrecinto')?.value.trim();
    const filtroLocal = document.getElementById('filtroLocal')?.value.trim();
    const filtroFechaDesde = document.getElementById('filtroFechaDesde')?.value;
    const filtroFechaHasta = document.getElementById('filtroFechaHasta')?.value;

    if (filtroNroRemesa) params.append('nro_remesa', filtroNroRemesa);
    if (filtroPrecinto) params.append('precinto', filtroPrecinto);
    if (filtroLocal) params.append('local', filtroLocal);
    if (filtroFechaDesde) params.append('fecha_desde', filtroFechaDesde);
    if (filtroFechaHasta) params.append('fecha_hasta', filtroFechaHasta);

    const url = `/api/auditoria-remesas/listar?${params.toString()}`;
    console.log('🔍 Consultando:', url);

    const response = await fetch(url);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.msg || 'Error al cargar auditoría');
    }

    auditoriaData = data.registros || [];
    console.log(`✅ ${auditoriaData.length} registros de auditoría cargados`);

    // Renderizar tabla
    renderizarTabla();

    if (auditoriaData.length === 0) {
      mostrarEstado('empty');
    } else {
      mostrarEstado('table');
    }

  } catch (error) {
    console.error('❌ Error al cargar auditoría:', error);
    mostrarEstado('empty');
    alert('Error al cargar auditoría: ' + error.message);
  }
}

// =====================================================
// RENDERIZAR TABLA DE AUDITORÍA
// =====================================================

function renderizarTabla() {
  const tbody = document.getElementById('auditoriaTableBody');
  const countInfo = document.getElementById('countInfo');

  if (!tbody) return;

  // Limpiar tabla
  tbody.innerHTML = '';

  // Actualizar contador
  if (countInfo) {
    if (auditoriaData.length === 0) {
      countInfo.textContent = 'No hay resultados';
    } else if (auditoriaData.length === 1) {
      countInfo.textContent = '1 registro';
    } else {
      countInfo.textContent = `${auditoriaData.length} registros`;
    }
  }

  // Renderizar cada registro
  auditoriaData.forEach(registro => {
    const tr = document.createElement('tr');

    // Formatear fecha/hora
    const fechaHora = formatearFechaHora(registro.fecha_hora);

    // Badge de acción
    const accionBadge = obtenerBadgeAccion(registro.accion);

    // Botón para ver cambios (solo si hay datos)
    const tieneCambios = registro.datos_cambios || registro.datos_anteriores || registro.datos_nuevos;
    const btnVerCambios = tieneCambios
      ? `<button class="btn-ver-cambios" onclick="verCambios(${registro.id})">Ver</button>`
      : '-';

    tr.innerHTML = `
      <td style="font-family: monospace; font-size: 12px; white-space: nowrap;">${fechaHora}</td>
      <td>
        <div style="font-weight: 600;">${registro.usuario || '-'}</div>
        <div style="font-size: 11px; color: #6b7280;">${registro.usuario_email || ''}</div>
      </td>
      <td>${accionBadge}</td>
      <td style="font-family: monospace; font-weight: 600;">#${registro.registro_id || '-'}</td>
      <td style="font-size: 12px; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${registro.descripcion || '-'}
      </td>
      <td style="font-family: monospace; font-size: 11px; color: #6b7280;">${registro.usuario_ip || '-'}</td>
      <td>${btnVerCambios}</td>
    `;

    tbody.appendChild(tr);
  });
}

// =====================================================
// OBTENER BADGE DE ACCIÓN
// =====================================================

function obtenerBadgeAccion(accion) {
  const accionUpper = (accion || '').toUpperCase();

  if (accionUpper === 'INSERT') {
    return '<span class="badge badge-insert">INSERT</span>';
  } else if (accionUpper === 'UPDATE') {
    return '<span class="badge badge-update">UPDATE</span>';
  } else if (accionUpper === 'DELETE') {
    return '<span class="badge badge-delete">DELETE</span>';
  } else {
    return `<span class="badge" style="background: #e5e7eb; color: #6b7280;">${accion || 'N/A'}</span>`;
  }
}

// =====================================================
// FORMATEAR FECHA/HORA (YYYY-MM-DD HH:MM:SS → DD/MM/YYYY HH:MM:SS)
// =====================================================

function formatearFechaHora(fechaHora) {
  if (!fechaHora) return '-';

  try {
    // Formato esperado: "2026-01-15 14:30:45"
    const partes = fechaHora.split(' ');
    if (partes.length !== 2) return fechaHora;

    const [fecha, hora] = partes;
    const [year, month, day] = fecha.split('-');

    return `${day}/${month}/${year} ${hora}`;
  } catch (e) {
    console.error('Error formateando fecha/hora:', fechaHora, e);
    return fechaHora;
  }
}

// =====================================================
// VER CAMBIOS (MODAL)
// =====================================================

function verCambios(registroId) {
  const registro = auditoriaData.find(r => r.id === registroId);

  if (!registro) {
    alert('Registro no encontrado');
    return;
  }

  const modalBody = document.getElementById('modalCambiosBody');

  if (!modalBody) return;

  // Parsear JSON si están en string
  let datosAnteriores = null;
  let datosNuevos = null;
  let datosCambios = null;

  try {
    datosAnteriores = typeof registro.datos_anteriores === 'string'
      ? JSON.parse(registro.datos_anteriores)
      : registro.datos_anteriores;
  } catch (e) {
    console.error('Error parseando datos_anteriores:', e);
  }

  try {
    datosNuevos = typeof registro.datos_nuevos === 'string'
      ? JSON.parse(registro.datos_nuevos)
      : registro.datos_nuevos;
  } catch (e) {
    console.error('Error parseando datos_nuevos:', e);
  }

  try {
    datosCambios = typeof registro.datos_cambios === 'string'
      ? JSON.parse(registro.datos_cambios)
      : registro.datos_cambios;
  } catch (e) {
    console.error('Error parseando datos_cambios:', e);
  }

  // Construir HTML del modal
  let html = `
    <div class="cambio-item">
      <div class="cambio-label">Fecha/Hora</div>
      <div class="cambio-valor">${formatearFechaHora(registro.fecha_hora)}</div>
    </div>

    <div class="cambio-item">
      <div class="cambio-label">Usuario</div>
      <div class="cambio-valor">${registro.usuario} (${registro.usuario_email || 'N/A'})</div>
    </div>

    <div class="cambio-item">
      <div class="cambio-label">Acción</div>
      <div class="cambio-valor">${registro.accion}</div>
    </div>

    <div class="cambio-item">
      <div class="cambio-label">Remesa ID</div>
      <div class="cambio-valor">#${registro.registro_id}</div>
    </div>

    <div class="cambio-item">
      <div class="cambio-label">Descripción</div>
      <div class="cambio-valor">${registro.descripcion || '-'}</div>
    </div>

    <div class="cambio-item">
      <div class="cambio-label">IP</div>
      <div class="cambio-valor">${registro.usuario_ip || '-'}</div>
    </div>
  `;

  // Mostrar cambios campo por campo si existen
  if (datosCambios && Object.keys(datosCambios).length > 0) {
    html += `<h3 style="margin-top: 24px; margin-bottom: 16px; font-size: 16px; color: #374151;">Cambios Realizados:</h3>`;

    for (const [campo, valores] of Object.entries(datosCambios)) {
      html += `
        <div class="cambio-item">
          <div class="cambio-label">${campo}</div>
          <div class="cambio-valor">
            <div class="cambio-anterior">Anterior: ${JSON.stringify(valores.anterior)}</div>
            <div class="cambio-nuevo">Nuevo: ${JSON.stringify(valores.nuevo)}</div>
          </div>
        </div>
      `;
    }
  } else {
    // Si no hay datos_cambios, mostrar JSON completo
    if (datosAnteriores) {
      html += `
        <h3 style="margin-top: 24px; margin-bottom: 12px; font-size: 16px; color: #374151;">Datos Anteriores:</h3>
        <div class="json-viewer">
          <pre>${JSON.stringify(datosAnteriores, null, 2)}</pre>
        </div>
      `;
    }

    if (datosNuevos) {
      html += `
        <h3 style="margin-top: 16px; margin-bottom: 12px; font-size: 16px; color: #374151;">Datos Nuevos:</h3>
        <div class="json-viewer">
          <pre>${JSON.stringify(datosNuevos, null, 2)}</pre>
        </div>
      `;
    }
  }

  modalBody.innerHTML = html;

  // Mostrar modal
  const modal = document.getElementById('modalVerCambios');
  if (modal) {
    modal.classList.add('active');
  }
}

// =====================================================
// CERRAR MODAL
// =====================================================

function cerrarModal() {
  const modal = document.getElementById('modalVerCambios');
  if (modal) {
    modal.classList.remove('active');
  }
}

// Cerrar modal al hacer clic fuera
document.addEventListener('click', (e) => {
  const modal = document.getElementById('modalVerCambios');
  if (modal && e.target === modal) {
    cerrarModal();
  }
});

// =====================================================
// MOSTRAR ESTADO (loading/empty/table)
// =====================================================

function mostrarEstado(estado) {
  const loadingState = document.getElementById('loadingState');
  const emptyState = document.getElementById('emptyState');
  const tableContainer = document.getElementById('tableContainer');

  loadingState.style.display = estado === 'loading' ? 'block' : 'none';
  emptyState.style.display = estado === 'empty' ? 'block' : 'none';
  tableContainer.style.display = estado === 'table' ? 'block' : 'none';
}

// =====================================================
// APLICAR FILTROS
// =====================================================

function aplicarFiltros() {
  console.log('🔍 Aplicando filtros...');
  cargarAuditoria();
}

// =====================================================
// LIMPIAR FILTROS
// =====================================================

function limpiarFiltros() {
  console.log('🧹 Limpiando filtros...');

  // Limpiar campos de filtro
  const filtroNroRemesa = document.getElementById('filtroNroRemesa');
  const filtroPrecinto = document.getElementById('filtroPrecinto');
  const filtroLocal = document.getElementById('filtroLocal');
  const filtroFechaDesde = document.getElementById('filtroFechaDesde');
  const filtroFechaHasta = document.getElementById('filtroFechaHasta');

  if (filtroNroRemesa) filtroNroRemesa.value = '';
  if (filtroPrecinto) filtroPrecinto.value = '';
  if (filtroLocal) filtroLocal.value = '';
  if (filtroFechaDesde) filtroFechaDesde.value = '';
  if (filtroFechaHasta) filtroFechaHasta.value = '';

  // Recargar con fechas por defecto
  configurarFechasPorDefecto();
  cargarAuditoria();
}

// =====================================================
// EXPONER FUNCIONES GLOBALES
// =====================================================

window.aplicarFiltros = aplicarFiltros;
window.limpiarFiltros = limpiarFiltros;
window.verCambios = verCambios;
window.cerrarModal = cerrarModal;
