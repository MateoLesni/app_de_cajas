/**
 * remesas_retiradas.js
 * =====================
 * Maneja la visualización de remesas que ya fueron retiradas
 *
 * Funcionalidades:
 * - Encargados nivel 2: ven solo su local, ordenadas descendentemente
 * - Auditores nivel 3+: ven todos los locales con filtros
 */

// Estado global
let remesasData = [];
let roleLevel = 2; // Se actualiza desde el backend

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('📦 Remesas Retiradas - Inicializando...');

  // Obtener información del usuario
  await obtenerInfoUsuario();

  // Configurar filtros según rol
  configurarFiltros();

  // Cargar remesas inicialmente
  await cargarRemesas();

  // Configurar fechas por defecto (últimos 30 días)
  configurarFechasPorDefecto();
});

// =====================================================
// OBTENER INFORMACIÓN DEL USUARIO
// =====================================================

async function obtenerInfoUsuario() {
  try {
    const response = await fetch('/api/user-info');
    const data = await response.json();

    if (data.success) {
      roleLevel = data.role_level || 2;
      console.log(`👤 Usuario: ${data.username} | Nivel: ${roleLevel} | Local: ${data.local || 'N/A'}`);
    }
  } catch (error) {
    console.error('Error al obtener información del usuario:', error);
  }
}

// =====================================================
// CONFIGURAR FILTROS SEGÚN ROL
// =====================================================

function configurarFiltros() {
  const localFilterGroup = document.getElementById('localFilterGroup');

  if (roleLevel >= 3) {
    // Auditores: mostrar filtro de local
    localFilterGroup.style.display = 'block';
    cargarLocales();
  } else {
    // Encargados: ocultar filtro de local (solo ven su propio local)
    localFilterGroup.style.display = 'none';
  }
}

// =====================================================
// CARGAR LOCALES PARA FILTRO (SOLO AUDITORES)
// =====================================================

async function cargarLocales() {
  try {
    const response = await fetch('/api/locales-lista');
    const data = await response.json();

    if (data.success && data.locales) {
      const filtroLocal = document.getElementById('filtroLocal');

      data.locales.forEach(local => {
        const option = document.createElement('option');
        option.value = local;
        option.textContent = local;
        filtroLocal.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error al cargar locales:', error);
  }
}

// =====================================================
// CONFIGURAR FECHAS POR DEFECTO (ÚLTIMOS 30 DÍAS)
// =====================================================

function configurarFechasPorDefecto() {
  const hoy = new Date();
  const hace30Dias = new Date();
  hace30Dias.setDate(hoy.getDate() - 30);

  const filtroFechaDesde = document.getElementById('filtroFechaDesde');
  const filtroFechaHasta = document.getElementById('filtroFechaHasta');

  if (filtroFechaDesde) {
    filtroFechaDesde.value = hace30Dias.toISOString().split('T')[0];
  }

  if (filtroFechaHasta) {
    filtroFechaHasta.value = hoy.toISOString().split('T')[0];
  }
}

// =====================================================
// CARGAR REMESAS DESDE LA API
// =====================================================

async function cargarRemesas() {
  mostrarEstado('loading');

  try {
    // Construir query params
    const params = new URLSearchParams();

    // Filtros
    const filtroLocal = document.getElementById('filtroLocal')?.value;
    const filtroFechaDesde = document.getElementById('filtroFechaDesde')?.value;
    const filtroFechaHasta = document.getElementById('filtroFechaHasta')?.value;
    const filtroRetiroDesde = document.getElementById('filtroRetiroDesde')?.value;
    const filtroRetiroHasta = document.getElementById('filtroRetiroHasta')?.value;

    if (filtroLocal) params.append('local', filtroLocal);
    if (filtroFechaDesde) params.append('fecha_desde', filtroFechaDesde);
    if (filtroFechaHasta) params.append('fecha_hasta', filtroFechaHasta);
    if (filtroRetiroDesde) params.append('fecha_retiro_desde', filtroRetiroDesde);
    if (filtroRetiroHasta) params.append('fecha_retiro_hasta', filtroRetiroHasta);

    const url = `/api/remesas-retiradas/listar?${params.toString()}`;
    console.log('🔍 Consultando:', url);

    const response = await fetch(url);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.msg || 'Error al cargar remesas');
    }

    remesasData = data.remesas || [];
    console.log(`✅ ${remesasData.length} remesas retiradas cargadas`);

    // Renderizar tabla y stats
    renderizarTabla();
    renderizarStats();

    if (remesasData.length === 0) {
      mostrarEstado('empty');
    } else {
      mostrarEstado('table');
    }

  } catch (error) {
    console.error('❌ Error al cargar remesas:', error);
    mostrarEstado('empty');
    alert('Error al cargar remesas retiradas: ' + error.message);
  }
}

// =====================================================
// RENDERIZAR TABLA DE REMESAS
// =====================================================

function renderizarTabla() {
  const tbody = document.getElementById('remesasTableBody');
  const tableCount = document.getElementById('tableCount');

  if (!tbody) return;

  // Limpiar tabla
  tbody.innerHTML = '';

  // Actualizar contador
  if (tableCount) {
    tableCount.textContent = `${remesasData.length} remesa${remesasData.length !== 1 ? 's' : ''}`;
  }

  // Renderizar cada remesa (orden descendente por fecha_retirada)
  remesasData.forEach(remesa => {
    const tr = document.createElement('tr');

    // Formatear fechas
    const fechaCaja = formatearFecha(remesa.fecha);
    const fechaRetiro = formatearFecha(remesa.fecha_retirada);

    // Formatear monto
    const montoFormateado = formatearMonto(remesa.monto);

    // Determinar estado
    const estadoBadge = obtenerBadgeEstado(remesa.estado_contable);

    tr.innerHTML = `
      <td class="fecha-destacada">${fechaCaja}</td>
      <td>${remesa.local || '-'}</td>
      <td>${remesa.caja || '-'}</td>
      <td>${remesa.turno || '-'}</td>
      <td style="font-weight: 600; font-family: monospace;">${remesa.nro_remesa || '-'}</td>
      <td style="font-family: monospace; color: #6b7280;">${remesa.precinto || '-'}</td>
      <td class="text-right monto-destacado">${montoFormateado}</td>
      <td class="fecha-destacada">${fechaRetiro}</td>
      <td>${remesa.retirada_por || '-'}</td>
      <td>${estadoBadge}</td>
    `;

    tbody.appendChild(tr);
  });
}

// =====================================================
// RENDERIZAR ESTADÍSTICAS
// =====================================================

function renderizarStats() {
  const statsGrid = document.getElementById('statsGrid');
  const statTotalRemesas = document.getElementById('statTotalRemesas');
  const statMontoTotal = document.getElementById('statMontoTotal');

  if (!statsGrid) return;

  // Calcular totales
  const totalRemesas = remesasData.length;
  const montoTotal = remesasData.reduce((sum, r) => sum + (parseFloat(r.monto) || 0), 0);

  // Actualizar valores
  if (statTotalRemesas) {
    statTotalRemesas.textContent = totalRemesas;
  }

  if (statMontoTotal) {
    statMontoTotal.textContent = formatearMonto(montoTotal);
  }

  // Mostrar/ocultar stats
  if (totalRemesas > 0) {
    statsGrid.style.display = 'grid';
  } else {
    statsGrid.style.display = 'none';
  }
}

// =====================================================
// OBTENER BADGE DE ESTADO
// =====================================================

function obtenerBadgeEstado(estadoContable) {
  if (estadoContable === 'CONTABILIZADA' || estadoContable === 'Contabilizada') {
    return '<span class="badge" style="background: #dbeafe; color: #1e40af;">Contabilizada</span>';
  } else if (estadoContable === 'TRAN') {
    return '<span class="badge badge-retirada">En Tránsito</span>';
  } else {
    return `<span class="badge" style="background: #e5e7eb; color: #6b7280;">${estadoContable || 'Desconocido'}</span>`;
  }
}

// =====================================================
// FORMATEAR FECHA (YYYY-MM-DD → DD/MM/YYYY)
// =====================================================

function formatearFecha(fecha) {
  if (!fecha) return '-';

  try {
    const [year, month, day] = fecha.split('T')[0].split('-');
    return `${day}/${month}/${year}`;
  } catch (e) {
    return fecha;
  }
}

// =====================================================
// FORMATEAR MONTO (1234567.89 → $1.234.567,89)
// =====================================================

function formatearMonto(monto) {
  const numero = parseFloat(monto) || 0;

  return '$ ' + numero.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

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
  cargarRemesas();
}

// =====================================================
// LIMPIAR FILTROS
// =====================================================

function limpiarFiltros() {
  console.log('🧹 Limpiando filtros...');

  // Limpiar campos de filtro
  const filtroLocal = document.getElementById('filtroLocal');
  const filtroFechaDesde = document.getElementById('filtroFechaDesde');
  const filtroFechaHasta = document.getElementById('filtroFechaHasta');
  const filtroRetiroDesde = document.getElementById('filtroRetiroDesde');
  const filtroRetiroHasta = document.getElementById('filtroRetiroHasta');

  if (filtroLocal) filtroLocal.value = '';
  if (filtroFechaDesde) filtroFechaDesde.value = '';
  if (filtroFechaHasta) filtroFechaHasta.value = '';
  if (filtroRetiroDesde) filtroRetiroDesde.value = '';
  if (filtroRetiroHasta) filtroRetiroHasta.value = '';

  // Recargar con fechas por defecto
  configurarFechasPorDefecto();
  cargarRemesas();
}

// =====================================================
// EXPONER FUNCIONES GLOBALES
// =====================================================

window.aplicarFiltros = aplicarFiltros;
window.limpiarFiltros = limpiarFiltros;
