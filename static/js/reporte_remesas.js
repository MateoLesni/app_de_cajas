// Reportería: Remesas - Carga Individual para Tesorería
(function(){
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = v => fmt.format(Number(v||0));

  let remesasData = []; // Array de todas las remesas

  // Obtener CSRF token del meta tag
  function getCSRFToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
  }

  // Formatear input con separador de miles argentino
  function formatearInputArgentino(valor) {
    // Eliminar todo excepto números y coma
    let limpio = valor.replace(/[^\d,]/g, '');

    // Separar parte entera y decimal
    let partes = limpio.split(',');
    let entero = partes[0];
    let decimal = partes[1] || '';

    // Limitar decimales a 2 dígitos
    decimal = decimal.substring(0, 2);

    // Agregar separadores de miles (punto)
    entero = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    // Retornar formateado
    return decimal ? `${entero},${decimal}` : entero;
  }

  // Convertir formato argentino a número para BD
  function parsearNumeroArgentino(valorFormateado) {
    if (!valorFormateado) return 0;
    // Remover puntos (separador de miles) y reemplazar coma por punto (decimal)
    const numero = valorFormateado.replace(/\./g, '').replace(',', '.');
    return parseFloat(numero) || 0;
  }

  // Convertir número a formato argentino para mostrar
  function numeroAFormatoArgentino(numero) {
    if (!numero && numero !== 0) return '';
    // Asegurar 2 decimales
    const numeroConDecimales = parseFloat(numero).toFixed(2);
    return formatearInputArgentino(numeroConDecimales.replace('.', ','));
  }

  // Formatear fecha ISO a dd/mm/yyyy
  function formatFecha(isoDate) {
    if (!isoDate) return '-';

    let d;
    if (typeof isoDate === 'string') {
      // Si es string, puede venir como "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm:ss"
      if (isoDate.includes('T')) {
        d = new Date(isoDate);
      } else {
        d = new Date(isoDate + 'T12:00:00'); // Forzar hora local
      }
    } else if (isoDate instanceof Date) {
      d = isoDate;
    } else {
      return '-';
    }

    // Validar que sea una fecha válida
    if (isNaN(d.getTime())) return '-';

    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const año = d.getFullYear();
    return `${dia}/${mes}/${año}`;
  }

  // Establecer fecha de hoy por defecto
  function setToday(input) {
    if (!input || input.value) return;
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    input.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // Fetch remesas por fecha de sello/apertura
  async function fetchRemesas(fechaSello) {
    mostrarLoading(true);
    try {
      let url = `/api/tesoreria/remesas-detalle?fecha_sello=${encodeURIComponent(fechaSello)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log('Remesas cargadas desde API:', data.remesas);
      return data.remesas || [];
    } catch (error) {
      console.error('Error al cargar remesas:', error);
      alert('Error al cargar remesas: ' + error.message);
      return [];
    } finally {
      mostrarLoading(false);
    }
  }

  // Mostrar/ocultar estados
  function mostrarLoading(mostrar) {
    $('#loading-state').style.display = mostrar ? 'block' : 'none';
    $('#table-container').style.display = mostrar ? 'none' : 'none';
    $('#empty-state').style.display = 'none';
  }

  function mostrarTabla(mostrar) {
    $('#loading-state').style.display = 'none';
    $('#table-container').style.display = mostrar ? 'block' : 'none';
    $('#empty-state').style.display = mostrar ? 'none' : 'block';
  }

  // Renderizar tabla de remesas
  function renderizarTabla() {
    const tbody = $('#remesas-tbody');
    tbody.innerHTML = '';

    if (remesasData.length === 0) {
      mostrarTabla(false);
      return;
    }

    // Ordenar por precinto
    remesasData.sort((a, b) => {
      const precintoA = a.precinto || '';
      const precintoB = b.precinto || '';
      return precintoA.localeCompare(precintoB);
    });

    remesasData.forEach((remesa, index) => {
      const dif = (remesa.monto || 0) - (remesa.real || 0);
      const difClass = dif === 0 ? 'dif-cero' : dif > 0 ? 'dif-positiva' : 'dif-negativa';
      const signo = dif > 0 ? '-' : dif < 0 ? '+' : '';

      const row = document.createElement('tr');
      row.dataset.index = index;
      row.innerHTML = `
        <td class="col-readonly">${formatFecha(remesa.fecha_caja)}</td>
        <td class="col-precinto">${remesa.precinto || '-'}</td>
        <td class="col-remesa">${remesa.nro_remesa || '-'}</td>
        <td class="col-readonly">${remesa.local || '-'}</td>
        <td class="col-readonly">${remesa.caja || '-'}</td>
        <td class="col-readonly">${remesa.turno || '-'}</td>
        <td class="col-monto-teorico">$${money(remesa.monto)}</td>
        <td class="col-real" style="text-align: right; font-weight: 700; font-size: 15px;">
          ${remesa.real > 0 ? '$' + numeroAFormatoArgentino(remesa.real) : '-'}
        </td>
        <td class="col-dif ${difClass}" id="dif-${index}">
          ${dif !== 0 ? `${signo}$${money(Math.abs(dif))}` : '$0.00'}
        </td>
        <td style="text-align: center; color: #9ca3af; font-size: 12px;">
          ${remesa.real > 0 ? '<i class="fas fa-check-circle" style="color: #10b981;"></i> Contabilizado' : '<i class="fas fa-clock" style="color: #f59e0b;"></i> Pendiente'}
        </td>
      `;

      tbody.appendChild(row);
    });

    mostrarTabla(true);
  }

  // =====================================================
  // FUNCIONES DE EDICIÓN DESHABILITADAS
  // =====================================================
  // El Histórico es ahora una vista READ-ONLY.
  // Para editar, usar "Mesa de Trabajo" (/reporteria/remesas-trabajo)
  // =====================================================

  /*
  // Formatear input mientras se escribe - YA NO SE USA
  window.formatearInput = function(index, input) {
    const cursorPos = input.selectionStart;
    const valorAnterior = input.value;
    const valorFormateado = formatearInputArgentino(input.value);

    if (valorFormateado !== valorAnterior) {
      input.value = valorFormateado;
      const diff = valorFormateado.length - valorAnterior.length;
      const newPos = cursorPos + diff;
      input.setSelectionRange(newPos, newPos);
    }

    input.style.borderColor = '#f59e0b';
    input.style.background = '#fef3c7';
  };

  // Actualizar monto real - YA NO SE USA
  window.actualizarReal = function(index, valorFormateado) {
    const remesa = remesasData[index];
    remesa.real = parsearNumeroArgentino(valorFormateado);

    const dif = (remesa.monto || 0) - remesa.real;
    const difEl = $(`#dif-${index}`);

    const difClass = dif === 0 ? 'dif-cero' : dif > 0 ? 'dif-positiva' : 'dif-negativa';
    const signo = dif > 0 ? '-' : dif < 0 ? '+' : '';

    difEl.className = `col-dif ${difClass}`;
    difEl.textContent = dif !== 0 ? `${signo}$${money(Math.abs(dif))}` : '$0.00';

    const input = $(`.input-real[data-index="${index}"]`);
    if (remesa.real > 0 && !valorFormateado.includes(',')) {
      input.value = numeroAFormatoArgentino(remesa.real);
    }
  };

  // Guardar una remesa individual - YA NO SE USA
  window.guardarRemesa_OLD = async function(index) {
    const remesa = remesasData[index];
    const btn = event.target.closest('.btn-guardar');

    // Validar que tenemos el ID de remesa
    if (!remesa.id) {
      alert('❌ Error: Falta ID de remesa');
      console.error('Remesa sin ID:', remesa);
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    const payload = {
      remesa_id: remesa.id,
      local: remesa.local,
      fecha_retiro: $('#rep-fecha').value,
      nro_remesa: remesa.nro_remesa || '',
      precinto: remesa.precinto || '',
      monto_teorico: remesa.monto,
      monto_real: remesa.real || 0
    };

    console.log('Guardando remesa:', payload);

    try {
      const res = await fetch('/api/tesoreria/guardar-remesa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCSRFToken()
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.msg || 'Error al guardar');
      }

      alert('✅ Guardado correctamente');

      const input = $(`.input-real[data-index="${index}"]`);
      input.style.borderColor = '#9ca3af';
      input.style.background = '#e5e7eb';

    } catch (error) {
      console.error('Error:', error);
      alert('❌ Error al guardar: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Guardar';
    }
  };

  // Guardar todos los cambios - YA NO SE USA
  async function guardarTodo_OLD() {
    const modificados = remesasData.filter(r => r.real > 0);

    if (modificados.length === 0) {
      alert('No hay cambios para guardar');
      return;
    }

    if (!confirm(`¿Guardar ${modificados.length} remesa${modificados.length !== 1 ? 's' : ''}?`)) {
      return;
    }

    const btn = $('#btn-guardar-todo');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    let exitosos = 0;
    let errores = 0;

    for (const remesa of modificados) {
      try {
        const res = await fetch('/api/tesoreria/guardar-remesa', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': getCSRFToken()
          },
          body: JSON.stringify({
            remesa_id: remesa.id,
            local: remesa.local,
            fecha_retiro: $('#rep-fecha').value,
            nro_remesa: remesa.nro_remesa || '',
            precinto: remesa.precinto || '',
            monto_teorico: remesa.monto,
            monto_real: remesa.real || 0
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          exitosos++;
        } else {
          errores++;
        }
      } catch (error) {
        console.error('Error:', error);
        errores++;
      }
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Guardar Todos los Cambios';

    if (errores === 0) {
      alert(`✅ Se guardaron ${exitosos} remesas correctamente`);
      $$('.input-real').forEach(input => {
        input.style.borderColor = '#9ca3af';
        input.style.background = '#e5e7eb';
      });
    } else {
      alert(`⚠️ Se guardaron ${exitosos} remesas.\nHubo ${errores} errores.`);
    }
  }
  */

  // Cargar remesas
  async function cargarRemesas() {
    const fechaSello = $('#rep-fecha-sello').value;
    if (!fechaSello) {
      alert('Seleccioná una fecha de sello/apertura');
      return;
    }

    let labelText = `Fecha de sello/apertura: ${formatFecha(fechaSello)}`;
    $('#fecha-label').textContent = labelText;

    remesasData = await fetchRemesas(fechaSello);
    renderizarTabla();

    // Verificar estado de aprobación después de cargar
    verificarEstadoAprobacion();
  }

  /**
   * Verificar estado de aprobación de la fecha (para admin tesorería)
   */
  async function verificarEstadoAprobacion() {
    const fechaSello = $('#rep-fecha-sello').value;
    if (!fechaSello) return;

    const panel = document.getElementById('panelAprobacion');
    if (!panel) return; // No es admin tesorería

    try {
      const res = await fetch(`/api/tesoreria/estado-aprobacion?fecha_sello=${encodeURIComponent(fechaSello)}`);
      const data = await res.json();

      const estadoEl = document.getElementById('estadoAprobacion');
      const btnAprobar = document.getElementById('btnAprobar');
      const btnDesaprobar = document.getElementById('btnDesaprobar');

      if (data.aprobado) {
        estadoEl.innerHTML = `
          <span style="color: #059669; display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-check-circle" style="font-size: 18px;"></i>
            <span>✅ Conciliación aprobada el ${formatFecha(data.fecha_aprobacion)} por ${data.aprobado_por}</span>
          </span>
        `;
        btnAprobar.style.display = 'none';
        btnDesaprobar.style.display = 'inline-block';
      } else {
        estadoEl.innerHTML = `
          <span style="color: #6b7280; display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-clock" style="font-size: 18px;"></i>
            <span>⏳ Conciliación pendiente de aprobación</span>
          </span>
        `;
        btnAprobar.style.display = 'inline-block';
        btnDesaprobar.style.display = 'none';
      }

      panel.style.display = 'block';
    } catch (error) {
      console.error('Error verificando aprobación:', error);
    }
  }

  /**
   * Aprobar conciliación de una fecha
   */
  async function aprobarFecha() {
    const fechaSello = $('#rep-fecha-sello').value;
    if (!fechaSello) return;

    if (!confirm(`¿Confirmar aprobación de la conciliación del ${formatFecha(fechaSello)}?\n\nUna vez aprobada, los tesoreros no podrán modificar los montos reales.`)) {
      return;
    }

    const btn = document.getElementById('btnAprobar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aprobando...';

    try {
      const res = await fetch('/api/tesoreria/aprobar-conciliacion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCSRFToken()
        },
        body: JSON.stringify({ fecha_sello: fechaSello })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.msg || 'Error al aprobar');
      }

      alert('✅ Conciliación aprobada correctamente');
      verificarEstadoAprobacion();
    } catch (error) {
      console.error('Error:', error);
      alert('❌ Error al aprobar: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check-circle"></i> Aprobar Conciliación';
    }
  }

  /**
   * Desaprobar conciliación de una fecha
   */
  async function desaprobarFecha() {
    const fechaSello = $('#rep-fecha-sello').value;
    if (!fechaSello) return;

    const motivo = prompt('Ingresá el motivo de la desaprobación:');
    if (!motivo || motivo.trim() === '') {
      alert('Debe ingresar un motivo');
      return;
    }

    const btn = document.getElementById('btnDesaprobar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Desaprobando...';

    try {
      const res = await fetch('/api/tesoreria/desaprobar-conciliacion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCSRFToken()
        },
        body: JSON.stringify({
          fecha_sello: fechaSello,
          observaciones: motivo.trim()
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.msg || 'Error al desaprobar');
      }

      alert('✅ Conciliación desaprobada correctamente');
      verificarEstadoAprobacion();
    } catch (error) {
      console.error('Error:', error);
      alert('❌ Error al desaprobar: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-times-circle"></i> Desaprobar';
    }
  }

  // Exponer funciones al scope global para que funcionen desde HTML onclick
  window.aprobarFecha = aprobarFecha;
  window.desaprobarFecha = desaprobarFecha;

  // Inicialización
  document.addEventListener('DOMContentLoaded', () => {
    setToday($('#rep-fecha-sello'));
    cargarRemesas();

    $('#rep-buscar')?.addEventListener('click', cargarRemesas);
    $('#rep-fecha-sello')?.addEventListener('change', cargarRemesas);
    // $('#btn-guardar-todo')?.addEventListener('click', guardarTodo); // YA NO EXISTE - Vista READ-ONLY
  });
})();
