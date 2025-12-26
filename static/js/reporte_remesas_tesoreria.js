/**
 * Reporte de Remesas para Tesorería
 * Vista simplificada con filas expandibles y guardado individual
 */

let reporteData = [];
let reporteDataCompleto = []; // Guardamos los datos sin filtrar
let localesDisponibles = [];

/**
 * Cargar reporte desde API
 */
async function cargarReporte() {
  const fechaRetiro = document.getElementById('fechaRetiro').value;

  if (!fechaRetiro) {
    alert('Por favor selecciona una fecha');
    return;
  }

  mostrarLoading(true);

  try {
    // Usar la misma fecha para desde y hasta (un solo día)
    const response = await fetch(`/api/reportes/remesas-matriz?fecha_desde=${fechaRetiro}&fecha_hasta=${fechaRetiro}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al cargar el reporte');
    }

    const data = await response.json();
    procesarYRenderizar(data);

  } catch (error) {
    console.error('Error:', error);
    alert('Error al cargar el reporte: ' + error.message);
    mostrarLoading(false);
    mostrarEmptyState(true);
  }
}

/**
 * Aplicar filtros (sin recargar desde API)
 */
function aplicarFiltros() {
  const filtroLocal = document.getElementById('filtroLocal').value;
  const filtroEstado = document.getElementById('filtroEstado').value;
  const soloDiferencias = document.getElementById('filtroDiferencias').checked;

  // Partir de los datos completos
  reporteData = reporteDataCompleto.filter(fila => {
    // Filtro de local
    if (filtroLocal && fila.local !== filtroLocal) {
      return false;
    }

    // Filtro de estado
    if (filtroEstado) {
      // Si tiene monto real registrado, usar el estado
      // Si no tiene monto real, siempre es 'en_transito'
      const estadoActual = fila.real > 0 ? fila.estado : 'en_transito';
      if (estadoActual !== filtroEstado) {
        return false;
      }
    }

    // Filtro de diferencias
    if (soloDiferencias && fila.dif === 0) {
      return false;
    }

    return true;
  });

  renderizarTabla();
  actualizarContador();

  if (reporteData.length === 0) {
    mostrarEmptyState(true);
    document.getElementById('tablaRemesas').style.display = 'none';
    document.getElementById('contadorResultados').style.display = 'none';
  } else {
    mostrarEmptyState(false);
    document.getElementById('tablaRemesas').style.display = 'table';
    document.getElementById('contadorResultados').style.display = 'block';
  }
}

/**
 * Actualizar contador de resultados
 */
function actualizarContador() {
  const numResultados = reporteData.length;
  const totalDisponibles = reporteDataCompleto.length;

  document.getElementById('numResultados').textContent = numResultados;

  // Mostrar info adicional si hay filtros activos
  const contadorDiv = document.getElementById('contadorResultados');
  if (numResultados < totalDisponibles) {
    contadorDiv.innerHTML = `Mostrando <strong>${numResultados}</strong> de ${totalDisponibles} remesas <span style="color: #9ca3af;">(filtros activos)</span>`;
  } else {
    contadorDiv.innerHTML = `Mostrando <strong>${numResultados}</strong> remesas`;
  }
}

/**
 * Limpiar todos los filtros
 */
function limpiarFiltros() {
  document.getElementById('filtroLocal').value = '';
  document.getElementById('filtroEstado').value = '';
  document.getElementById('filtroDiferencias').checked = false;
  aplicarFiltros();
}

/**
 * Procesar datos de la API y renderizar tabla
 */
function procesarYRenderizar(data) {
  // Procesar locales disponibles
  localesDisponibles = data.locales || [];
  actualizarFiltroLocales();

  // Aplanar la matriz en un array de filas (sin filtrar)
  reporteDataCompleto = [];

  data.locales.forEach(local => {
    data.fechas.forEach(fecha => {
      const celda = data.matriz[local][fecha];

      // Solo incluir si tiene remesas
      if (celda.tiene_remesas) {
        reporteDataCompleto.push({
          local: local,
          fecha: fecha,
          teorico: celda.teorico,
          real: celda.real,
          dif: celda.dif,
          estado: celda.estado,
          observaciones: celda.observaciones,
          remesas: celda.remesas || []
        });
      }
    });
  });

  // Aplicar filtros iniciales
  aplicarFiltros();
  mostrarLoading(false);
}

/**
 * Actualizar select de filtro de locales
 */
function actualizarFiltroLocales() {
  const select = document.getElementById('filtroLocal');
  const valorActual = select.value;

  select.innerHTML = '<option value="">Todos los locales</option>';

  localesDisponibles.forEach(local => {
    const option = document.createElement('option');
    option.value = local;
    option.textContent = local;
    if (local === valorActual) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

/**
 * Renderizar tabla principal
 */
function renderizarTabla() {
  const tbody = document.getElementById('tablaBody');
  tbody.innerHTML = '';

  reporteData.forEach((fila, index) => {
    // Fila resumen (clickeable)
    const filaResumen = document.createElement('tr');
    filaResumen.className = 'fila-resumen';
    filaResumen.dataset.index = index;
    filaResumen.onclick = () => toggleDetalle(index);

    const difClass = fila.dif === 0 ? 'dif-cero' : fila.dif > 0 ? 'dif-positiva' : 'dif-negativa';
    const signo = fila.dif > 0 ? '-' : fila.dif < 0 ? '+' : '';

    filaResumen.innerHTML = `
      <td>
        <span class="icono-expandir">▶</span>
        <strong>${fila.local}</strong>
        <div style="font-size: 12px; color: #6b7280; font-weight: 400; margin-top: 2px;">
          ${formatFecha(fila.fecha)} • ${fila.remesas.length} remesa${fila.remesas.length !== 1 ? 's' : ''}
        </div>
      </td>
      <td style="text-align: right;">$${formatMoney(fila.teorico)}</td>
      <td style="text-align: right;">$${formatMoney(fila.real)}</td>
      <td style="text-align: right;" class="${difClass}">${signo}$${formatMoney(Math.abs(fila.dif))}</td>
      <td style="text-align: center;">${getEstadoBadge(fila.estado, fila.real > 0)}</td>
    `;

    tbody.appendChild(filaResumen);

    // Fila detalle (expandible)
    const filaDetalle = document.createElement('tr');
    filaDetalle.className = 'fila-detalle';
    filaDetalle.dataset.index = index;
    filaDetalle.innerHTML = `
      <td colspan="5">
        <div class="detalle-container">
          ${renderizarTablaDetalle(fila, index)}
        </div>
      </td>
    `;

    tbody.appendChild(filaDetalle);
  });
}

/**
 * Renderizar tabla de detalle de remesas
 */
function renderizarTablaDetalle(fila, filaIndex) {
  let html = `
    <table class="tabla-detalle">
      <thead>
        <tr>
          <th>N° Remesa</th>
          <th>Precinto</th>
          <th>Fecha Caja</th>
          <th>Caja</th>
          <th>Turno</th>
          <th>Retiró</th>
          <th style="text-align: right;">Teórico</th>
          <th style="text-align: right;">Contabilizado</th>
          <th style="text-align: right;">Diferencia</th>
        </tr>
      </thead>
      <tbody>
  `;

  fila.remesas.forEach((remesa, remesaIndex) => {
    const dif = remesa.monto - (remesa.real || 0);
    const difClass = dif === 0 ? 'dif-cero' : dif > 0 ? 'dif-positiva' : 'dif-negativa';
    const signo = dif > 0 ? '-' : dif < 0 ? '+' : '';

    html += `
      <tr>
        <td>${remesa.nro_remesa || '-'}</td>
        <td>${remesa.precinto || '-'}</td>
        <td>${formatFecha(remesa.fecha_caja)}</td>
        <td>${remesa.caja || '-'}</td>
        <td>${remesa.turno || '-'}</td>
        <td style="font-size: 12px;">${remesa.retirada_por || '-'}</td>
        <td style="text-align: right; font-weight: 600;">$${formatMoney(remesa.monto)}</td>
        <td style="text-align: right;">
          <input type="number"
                 class="input-monto"
                 data-fila="${filaIndex}"
                 data-remesa="${remesaIndex}"
                 value="${remesa.real || ''}"
                 placeholder="0.00"
                 step="0.01"
                 onchange="actualizarMontoReal(${filaIndex}, ${remesaIndex}, this.value)">
        </td>
        <td style="text-align: right;" class="${difClass}" id="dif-${filaIndex}-${remesaIndex}">
          ${dif !== 0 ? `${signo}$${formatMoney(Math.abs(dif))}` : '$0.00'}
        </td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
    <button class="btn-guardar" onclick="guardarRemesas(${filaIndex})">
      <i class="fas fa-save"></i> Guardar Cambios
    </button>
  `;

  return html;
}

/**
 * Toggle expandir/colapsar detalle
 */
function toggleDetalle(index) {
  const filaResumen = document.querySelector(`.fila-resumen[data-index="${index}"]`);
  const filaDetalle = document.querySelector(`.fila-detalle[data-index="${index}"]`);

  filaResumen.classList.toggle('expanded');
  filaDetalle.classList.toggle('visible');
}

/**
 * Actualizar monto real de una remesa (solo en memoria)
 */
function actualizarMontoReal(filaIndex, remesaIndex, valor) {
  const remesa = reporteData[filaIndex].remesas[remesaIndex];
  remesa.real = parseFloat(valor) || 0;

  // Actualizar diferencia en la tabla
  const dif = remesa.monto - remesa.real;
  const difEl = document.getElementById(`dif-${filaIndex}-${remesaIndex}`);

  difEl.className = dif === 0 ? 'dif-cero' : dif > 0 ? 'dif-positiva' : 'dif-negativa';
  const signo = dif > 0 ? '-' : dif < 0 ? '+' : '';
  difEl.textContent = dif !== 0 ? `${signo}$${formatMoney(Math.abs(dif))}` : '$0.00';

  // Marcar input como modificado
  const input = document.querySelector(`input[data-fila="${filaIndex}"][data-remesa="${remesaIndex}"]`);
  input.classList.add('modified');

  // Recalcular totales de la fila
  recalcularTotalesFila(filaIndex);
}

/**
 * Recalcular totales de una fila
 */
function recalcularTotalesFila(filaIndex) {
  const fila = reporteData[filaIndex];

  // Sumar todos los reales de las remesas
  fila.real = fila.remesas.reduce((sum, r) => sum + (r.real || 0), 0);
  fila.dif = fila.teorico - fila.real;

  // Actualizar la fila resumen en la tabla
  const filaResumen = document.querySelector(`.fila-resumen[data-index="${filaIndex}"]`);
  const difClass = fila.dif === 0 ? 'dif-cero' : fila.dif > 0 ? 'dif-positiva' : 'dif-negativa';
  const signo = fila.dif > 0 ? '-' : fila.dif < 0 ? '+' : '';

  filaResumen.children[2].textContent = '$' + formatMoney(fila.real);
  filaResumen.children[3].className = difClass;
  filaResumen.children[3].style.textAlign = 'right';
  filaResumen.children[3].textContent = `${signo}$${formatMoney(Math.abs(fila.dif))}`;
}

/**
 * Guardar cambios de todas las remesas de una fila
 */
async function guardarRemesas(filaIndex) {
  const fila = reporteData[filaIndex];
  const btn = event.target;

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

  try {
    // Calcular monto real total
    const montoReal = fila.remesas.reduce((sum, r) => sum + (r.real || 0), 0);
    const montoTeorico = fila.teorico;

    const response = await fetch('/api/tesoreria/registrar-recibido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        local: fila.local,
        fecha_retiro: fila.fecha,
        monto_teorico: montoTeorico,
        monto_real: montoReal,
        observaciones: ''
      })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      alert('✅ Cambios guardados correctamente');

      // Quitar clase modified de todos los inputs
      const inputs = document.querySelectorAll(`input[data-fila="${filaIndex}"]`);
      inputs.forEach(input => input.classList.remove('modified'));

      // Actualizar estado en la fila
      fila.estado = result.estado || 'recibido';
      const filaResumen = document.querySelector(`.fila-resumen[data-index="${filaIndex}"]`);
      filaResumen.children[4].innerHTML = getEstadoBadge(fila.estado, true);

    } else {
      throw new Error(result.msg || 'Error al guardar');
    }

  } catch (error) {
    console.error('Error:', error);
    alert('❌ Error al guardar: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
  }
}

/**
 * Mostrar/ocultar loading
 */
function mostrarLoading(mostrar) {
  document.getElementById('loadingState').style.display = mostrar ? 'block' : 'none';
}

/**
 * Mostrar/ocultar empty state
 */
function mostrarEmptyState(mostrar) {
  document.getElementById('emptyState').style.display = mostrar ? 'block' : 'none';
}

/**
 * Formatear fecha
 */
function formatFecha(fecha) {
  if (!fecha) return '-';
  const d = new Date(fecha + 'T12:00:00');
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const año = d.getFullYear();
  return `${dia}/${mes}/${año}`;
}

/**
 * Formatear dinero
 */
function formatMoney(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '0.00';
  return parseFloat(valor).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Obtener badge de estado
 */
function getEstadoBadge(estado, tieneReal) {
  const badges = {
    'en_transito': '<span style="background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">📦 En Tránsito</span>',
    'recibido': '<span style="background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">✅ Recibido</span>',
    'con_diferencia': '<span style="background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">⚠️ Con Diferencia</span>',
    'auditado': '<span style="background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">✔️ Auditado</span>'
  };

  if (!estado || !tieneReal) {
    return badges['en_transito'];
  }

  return badges[estado] || badges['en_transito'];
}
