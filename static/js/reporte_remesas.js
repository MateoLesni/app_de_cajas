// Reportería: Remesas - Carga Individual para Tesorería
(function(){
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = v => fmt.format(Number(v||0));

  let remesasData = []; // Array de todas las remesas

  // Formatear fecha ISO a dd/mm/yyyy
  function formatFecha(isoDate) {
    if (!isoDate) return '-';
    const d = new Date(isoDate + 'T12:00:00'); // Forzar hora local
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

  // Fetch remesas por fecha de retiro
  async function fetchRemesas(fechaRetiro) {
    mostrarLoading(true);
    try {
      const res = await fetch(`/api/tesoreria/remesas-detalle?fecha_retiro=${encodeURIComponent(fechaRetiro)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
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
        <td class="col-real">
          <input type="number"
                 class="input-real"
                 data-index="${index}"
                 value="${remesa.real || ''}"
                 placeholder="¿Cuánto llegó?"
                 step="0.01"
                 onchange="window.actualizarReal(${index}, this.value)">
        </td>
        <td class="col-dif ${difClass}" id="dif-${index}">
          ${dif !== 0 ? `${signo}$${money(Math.abs(dif))}` : '$0.00'}
        </td>
        <td style="text-align: center;">
          <button class="btn-guardar" onclick="window.guardarRemesa(${index})">
            <i class="fas fa-save"></i> Guardar
          </button>
        </td>
      `;

      tbody.appendChild(row);
    });

    mostrarTabla(true);
  }

  // Actualizar monto real (solo en memoria)
  window.actualizarReal = function(index, valor) {
    const remesa = remesasData[index];
    remesa.real = parseFloat(valor) || 0;

    // Actualizar diferencia
    const dif = (remesa.monto || 0) - remesa.real;
    const difEl = $(`#dif-${index}`);

    const difClass = dif === 0 ? 'dif-cero' : dif > 0 ? 'dif-positiva' : 'dif-negativa';
    const signo = dif > 0 ? '-' : dif < 0 ? '+' : '';

    difEl.className = `col-dif ${difClass}`;
    difEl.textContent = dif !== 0 ? `${signo}$${money(Math.abs(dif))}` : '$0.00';

    // Marcar input como modificado
    const input = $(`.input-real[data-index="${index}"]`);
    input.style.borderColor = '#f59e0b';
    input.style.background = '#fef3c7';
  };

  // Guardar una remesa individual
  window.guardarRemesa = async function(index) {
    const remesa = remesasData[index];
    const btn = event.target.closest('.btn-guardar');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
      const res = await fetch('/api/tesoreria/guardar-remesa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          local: remesa.local,
          fecha_retiro: $('#rep-fecha').value,
          nro_remesa: remesa.nro_remesa,
          precinto: remesa.precinto,
          monto_teorico: remesa.monto,
          monto_real: remesa.real || 0
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.msg || 'Error al guardar');
      }

      alert('✅ Guardado correctamente');

      // Quitar estilo de modificado
      const input = $(`.input-real[data-index="${index}"]`);
      input.style.borderColor = '#fbbf24';
      input.style.background = '#fffbeb';

    } catch (error) {
      console.error('Error:', error);
      alert('❌ Error al guardar: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Guardar';
    }
  };

  // Guardar todos los cambios
  async function guardarTodo() {
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            local: remesa.local,
            fecha_retiro: $('#rep-fecha').value,
            nro_remesa: remesa.nro_remesa,
            precinto: remesa.precinto,
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
      // Resetear estilos
      $$('.input-real').forEach(input => {
        input.style.borderColor = '#fbbf24';
        input.style.background = '#fffbeb';
      });
    } else {
      alert(`⚠️ Se guardaron ${exitosos} remesas.\nHubo ${errores} errores.`);
    }
  }

  // Cargar remesas
  async function cargarRemesas() {
    const fecha = $('#rep-fecha').value;
    if (!fecha) {
      alert('Seleccioná una fecha');
      return;
    }

    $('#fecha-label').textContent = `Fecha de retiro: ${formatFecha(fecha)}`;

    remesasData = await fetchRemesas(fecha);
    renderizarTabla();
  }

  // Inicialización
  document.addEventListener('DOMContentLoaded', () => {
    setToday($('#rep-fecha'));
    cargarRemesas();

    $('#rep-buscar')?.addEventListener('click', cargarRemesas);
    $('#rep-fecha')?.addEventListener('change', cargarRemesas);
    $('#btn-guardar-todo')?.addEventListener('click', guardarTodo);
  });
})();
