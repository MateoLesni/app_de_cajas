/**
 * Reporte Remesas Trabajo - Mesa de Trabajo (Solo TRAN)
 * Vista editable para cargar montos reales de remesas pendientes
 */

let remesasData = [];

// Obtener CSRF token del meta tag
function getCSRFToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.content : '';
}

// Cargar remesas TRAN al inicio
document.addEventListener('DOMContentLoaded', () => {
  cargarRemesasTRAN();

  // Evento para botón refresh
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    cargarRemesasTRAN();
  });

  // Auto-refresh cada 2 minutos
  setInterval(() => {
    cargarRemesasTRAN();
  }, 120000); // 2 minutos
});

/**
 * Carga todas las remesas en estado TRAN
 */
async function cargarRemesasTRAN() {
  const loadingState = document.getElementById('loading-state');
  const emptyState = document.getElementById('empty-state');
  const tableContainer = document.getElementById('table-container');

  try {
    // Mostrar loading
    loadingState.style.display = 'block';
    emptyState.style.display = 'none';
    tableContainer.style.display = 'none';

    const response = await fetch('/api/tesoreria/remesas-tran');
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.msg || 'Error al cargar remesas');
    }

    remesasData = data.remesas || [];

    // Ocultar loading
    loadingState.style.display = 'none';

    if (remesasData.length === 0) {
      // Mostrar empty state
      emptyState.style.display = 'block';
      actualizarEstadisticas(0, 0);
    } else {
      // Mostrar tabla
      tableContainer.style.display = 'block';
      renderizarTabla();
      calcularEstadisticas();
    }

  } catch (error) {
    console.error('Error cargando remesas TRAN:', error);
    loadingState.style.display = 'none';
    alert('Error al cargar remesas: ' + error.message);
  }
}

/**
 * Renderiza la tabla de remesas con inputs y botones de guardar
 */
function renderizarTabla() {
  const tbody = document.getElementById('remesas-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  remesasData.forEach((remesa, index) => {
    const tr = document.createElement('tr');
    tr.dataset.remesaId = remesa.id;

    // Debug log para remesa 956/438410
    if (remesa.id === 956 || remesa.nro_remesa === '438410') {
      console.log('🔍 DEBUG Remesa 956/438410 en frontend:', {
        id: remesa.id,
        nro_remesa: remesa.nro_remesa,
        fecha: remesa.fecha,
        fecha_retirada: remesa.fecha_retirada,
        local: remesa.local
      });
    }

    // Formatear fechas
    const fechaRemesa = formatearFecha(remesa.fecha);
    const fechaRetiro = formatearFecha(remesa.fecha_retirada);

    // Formatear montos
    const montoTeoricoStr = formatearMontoArgentino(remesa.monto_teorico || 0);
    const montoReal = remesa.monto_real || 0;

    tr.innerHTML = `
      <td class="col-readonly">${fechaRemesa}</td>
      <td class="col-readonly">${fechaRetiro}</td>
      <td class="col-precinto col-gray-bg">${remesa.precinto || '-'}</td>
      <td class="col-remesa col-gray-bg">${remesa.nro_remesa || '-'}</td>
      <td class="col-readonly"><strong>${remesa.local}</strong></td>
      <td class="col-monto">${montoTeoricoStr}</td>
      <td class="col-gray-bg" style="text-align: center;">
        <input type="text"
               class="input-real"
               data-index="${index}"
               value="${formatearMontoInput(montoReal)}"
               placeholder="0,00"
               onfocus="if(this.value==='0,00')this.value=''"
               oninput="window.formatearInputTrabajo(${index}, this)"
               onkeypress="if(event.key==='Enter'){event.preventDefault();window.guardarRemesaTrabajo(${index})}">
      </td>
      <td class="col-actions">
        <button class="btn-guardar" onclick="window.guardarRemesaTrabajo(${index})">
          <i class="fas fa-save"></i> Guardar
        </button>
        <button class="btn-devolver" onclick="window.devolverALocal(${remesa.id})" title="Devolver a estado Local">
          <i class="fas fa-undo"></i>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

/**
 * Formatea monto para el input (formato argentino)
 */
function formatearMontoInput(monto) {
  const numero = parseFloat(monto) || 0;
  if (numero === 0) return '0,00';

  return numero.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Formatea el input mientras el usuario escribe (formato argentino)
 */
window.formatearInputTrabajo = function(index, input) {
  let valor = input.value;

  // Eliminar todo excepto dígitos, punto y coma
  valor = valor.replace(/[^\d.,]/g, '');

  // Reemplazar punto por coma (formato argentino)
  valor = valor.replace(/\./g, ',');

  // Asegurar solo una coma decimal
  const partes = valor.split(',');
  if (partes.length > 2) {
    valor = partes[0] + ',' + partes.slice(1).join('');
  }

  // Limitar decimales a 2
  if (partes.length === 2 && partes[1].length > 2) {
    valor = partes[0] + ',' + partes[1].substring(0, 2);
  }

  input.value = valor;

  // Actualizar en memoria (sin guardar aún)
  if (remesasData[index]) {
    const numeroParseado = parseFloat(valor.replace(/\./g, '').replace(',', '.')) || 0;
    remesasData[index].monto_real = numeroParseado;
  }
};

/**
 * Guarda una remesa individual
 */
window.guardarRemesaTrabajo = async function(index) {
  const remesa = remesasData[index];
  if (!remesa) return;

  const input = document.querySelector(`input[data-index="${index}"]`);
  const btn = input?.closest('tr').querySelector('.btn-guardar');

  if (!input) return;

  // Obtener valor del input
  let valorInput = input.value.trim();
  if (!valorInput || valorInput === '') valorInput = '0,00';

  // Convertir formato argentino a número
  const montoReal = parseFloat(valorInput.replace(/\./g, '').replace(',', '.')) || 0;

  // Validar que sea un monto válido
  if (montoReal <= 0) {
    alert('Por favor, ingresa un monto válido mayor a 0');
    input.focus();
    return;
  }

  // Deshabilitar botón y mostrar loading
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
  }

  try {
    const payload = {
      remesa_id: remesa.id,
      local: remesa.local,
      fecha_retiro: remesa.fecha_retirada,
      nro_remesa: remesa.nro_remesa || '',
      precinto: remesa.precinto || '',
      monto_teorico: remesa.monto_teorico,
      monto_real: montoReal
    };

    const response = await fetch('/api/tesoreria/guardar-remesa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCSRFToken()
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.msg || 'Error al guardar');
    }

    // Éxito - recargar lista de remesas TRAN
    await cargarRemesasTRAN();

  } catch (error) {
    console.error('Error guardando remesa:', error);
    alert('❌ Error al guardar: ' + error.message);

    // Restaurar botón
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Guardar';
    }
  }
};

/**
 * Calcula y actualiza estadísticas
 */
function calcularEstadisticas() {
  const total = remesasData.length;
  const montoTotal = remesasData.reduce((sum, r) => sum + (parseFloat(r.monto_teorico) || 0), 0);

  actualizarEstadisticas(total, montoTotal);
}

/**
 * Actualiza las cards de estadísticas
 */
function actualizarEstadisticas(total, monto) {
  const statTotal = document.getElementById('stat-total');
  const statMonto = document.getElementById('stat-monto');
  const statUpdate = document.getElementById('stat-update');

  if (statTotal) {
    statTotal.textContent = total.toLocaleString('es-AR');
  }

  if (statMonto) {
    statMonto.textContent = formatearMontoArgentino(monto);
  }

  if (statUpdate) {
    const now = new Date();
    statUpdate.textContent = now.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
}

/**
 * Formatea fecha YYYY-MM-DD o ISO a DD/MM/YYYY
 * IMPORTANTE: Parsea la fecha correctamente sin problemas de zona horaria
 */
function formatearFecha(fecha) {
  if (!fecha) return '-';

  try {
    // Si es formato YYYY-MM-DD, parsearlo directamente sin Date() para evitar problemas de timezone
    const fechaStr = String(fecha);

    // Si tiene formato ISO o YYYY-MM-DD
    if (fechaStr.includes('-')) {
      const partes = fechaStr.split('T')[0].split('-'); // Obtener solo la parte de fecha
      if (partes.length === 3) {
        const [year, month, day] = partes;
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
      }
    }

    // Fallback: usar Date() si no es formato estándar
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return fecha;

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    return `${day}/${month}/${year}`;
  } catch (e) {
    return fecha;
  }
}

/**
 * Devuelve una remesa de TRAN a estado Local
 */
window.devolverALocal = async function(remesaId) {
  if (!confirm('¿Estás seguro de devolver esta remesa a estado Local?\n\nEsto significa que la remesa no llegó físicamente y debe volver a ser marcada como "retirada" cuando llegue.')) {
    return;
  }

  const motivo = prompt('Ingresá el motivo de la devolución (opcional):');

  try {
    const response = await fetch(`/api/tesoreria/devolver-a-local/${remesaId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCSRFToken()
      },
      body: JSON.stringify({ motivo: motivo || 'Remesa no recibida físicamente' })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.msg || 'Error al devolver remesa');
    }

    alert('✅ Remesa devuelta a estado Local correctamente');
    await cargarRemesasTRAN(); // Recargar lista

  } catch (error) {
    console.error('Error devolviendo remesa:', error);
    alert('❌ Error al devolver remesa: ' + error.message);
  }
};

/**
 * Formatea monto en formato argentino: 1.234.567,89
 */
function formatearMontoArgentino(monto) {
  const numero = parseFloat(monto) || 0;

  // Formatear con separadores argentinos
  return '$ ' + numero.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
