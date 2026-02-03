// ==== Cuentas Corrientes: renderer integrado a OrqTabs con permisos L1/L2/L3 ====
// Guardado directo en BD sin buffer local (sin tabla preview)

document.addEventListener("DOMContentLoaded", function () {
  // ----------- refs y key del tab -----------
  const tabKey = "ctasCtesTab";
  const pane = document.getElementById(tabKey);

  const tablaBD = document.getElementById("tablaCtasCtesBD");
  const form = document.getElementById("ctasCtesForm");
  const clienteSelect = document.getElementById("clienteCtaCte");
  const comentarioContainer = document.getElementById("comentarioCtaCteContainer");
  const comentarioInput = document.getElementById("comentarioCtaCte");
  const montoInput = document.getElementById("montoCtaCte");
  const puntoVentaInput = document.getElementById("puntoVentaCtaCte");
  const nroComandaInput = document.getElementById("nroComandaCtaCte");
  const facturadaCheck = document.getElementById("facturadaCtaCte");

  const cajaSelect = document.getElementById("cajaSelect");
  const fechaGlobal = document.getElementById("fechaGlobal");
  const turnoSelect = document.getElementById("turnoSelect");
  const respuestaDiv = document.getElementById("respuestaCtasCtes");

  // ----------- permisos y estado -----------
  const ROLE = parseInt(window.ROLE_LEVEL || 1, 10);
  window.cajaCerrada = window.cajaCerrada ?? false;
  let localCerrado = false;
  let localAuditado = false;

  let ctasCtesBD = [];       // vienen del backend a través de OrqTabs
  let clientesCtaCte = [];   // lista de clientes con cuenta corriente
  let filaEditando = null;   // fila que está en modo edición

  // ----------- cargar clientes -----------
  async function cargarClientes() {
    try {
      const res = await fetch('/api/clientes_cta_cte');
      const data = await res.json();
      if (data.success && data.clientes) {
        clientesCtaCte = data.clientes;
        // Poblar el select
        if (clienteSelect) {
          clienteSelect.innerHTML = '<option value="">-- Seleccionar cliente --</option>';
          clientesCtaCte.forEach(cli => {
            const opt = document.createElement('option');
            opt.value = cli.id;
            opt.textContent = cli.nombre_cliente;
            opt.dataset.codigo = cli.codigo_oppen;
            clienteSelect.appendChild(opt);
          });
        }
      }
    } catch (e) {
      console.error('Error cargando clientes:', e);
    }
  }

  // Cargar clientes al inicio
  cargarClientes();

  // Mostrar/ocultar comentario según cliente seleccionado
  if (clienteSelect) {
    clienteSelect.addEventListener('change', function() {
      const selectedOption = this.options[this.selectedIndex];
      const codigo = selectedOption?.dataset?.codigo || '';

      if (codigo === 'CNGCC') {
        // Es "Otro cliente" - mostrar campo comentario
        comentarioContainer.style.display = 'block';
        comentarioInput.required = true;
      } else {
        comentarioContainer.style.display = 'none';
        comentarioInput.required = false;
        comentarioInput.value = '';
      }
    });
  }

  // ----------- estilos (centrado + overlay) -----------
  (function ensureStyle() {
    if (document.getElementById("ctas-ctes-style")) return;
    const st = document.createElement("style");
    st.id = "ctas-ctes-style";
    st.textContent = `
      #${tabKey} table th, #${tabKey} table td { text-align: center; vertical-align: middle; }
      #${tabKey} { position: relative; }
      #${tabKey} .mod-overlay {
        position:absolute; inset:0; display:none; align-items:center; justify-content:center;
        background: rgba(255,255,255,.6); backdrop-filter: blur(1px); z-index: 5; pointer-events: auto;
      }
      #${tabKey} .mod-spinner {
        padding:10px 14px; border-radius:8px; background:#fff; box-shadow:0 2px 10px rgba(0,0,0,.12); font-weight:600;
      }
      #${tabKey} .btn-editar-bd,
      #${tabKey} .btn-borrar-bd,
      #${tabKey} .btn-guardar-edit,
      #${tabKey} .btn-cancelar-edit { cursor:pointer; margin: 0 2px; }
      #${tabKey} .row-cta-cte.editing { background-color: #fff3cd !important; }
      #${tabKey} .row-cta-cte.editing input,
      #${tabKey} .row-cta-cte.editing select {
        width: 100%;
        padding: 4px 6px;
        border: 1px solid #ced4da;
        border-radius: 4px;
        font-size: 14px;
        box-sizing: border-box;
      }
    `;
    document.head.appendChild(st);
  })();

  function setLoading(on) {
    if (!pane) return;
    let ov = pane.querySelector(":scope > .mod-overlay");
    if (on) {
      if (!ov) {
        ov = document.createElement("div");
        ov.className = "mod-overlay";
        ov.innerHTML = '<div class="mod-spinner">Guardando…</div>';
        pane.appendChild(ov);
      }
      ov.style.display = "flex";
      ov.style.pointerEvents = "auto";
    } else if (ov) {
      ov.style.display = "none";
      ov.style.pointerEvents = "none";
    }
  }

  // ----------- helpers -----------
  const getLocalActual = () => {
    // Para auditores (nivel 3): lee de #localSelect, fallback a #userLocal
    const localSelect = document.getElementById("localSelect");
    if (localSelect) {
      const val = (localSelect.value || "").trim();
      return val || (document.getElementById("userLocal")?.innerText || "").trim();
    }
    return (document.getElementById("userLocal")?.innerText || "").trim();
  };

  const getCtx = () => ({
    local: getLocalActual(),
    caja:  cajaSelect?.value || "",
    fecha: fechaGlobal?.value || "",
    turno: (turnoSelect?.value || "").trim()
  });

  function canActUI() {
    if (localAuditado) return false;
    if (ROLE === 1) return !window.cajaCerrada;
    if (ROLE === 2) return !localCerrado;
    if (ROLE === 3) return true;
    return false;
  }

  function money(val) {
    const n = parseFloat(val) || 0;
    return "$ " + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function getClienteNombre(clienteId) {
    const cli = clientesCtaCte.find(c => c.id == clienteId);
    return cli ? cli.nombre_cliente : '';
  }

  // ----------- render tabla BD -----------
  function renderBD() {
    if (!tablaBD) return;
    const tbody = tablaBD.querySelector("tbody");
    if (!tbody) return;

    if (ctasCtesBD.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#999;">No hay cuentas corrientes guardadas en BD</td></tr>';
      return;
    }

    let html = "";
    ctasCtesBD.forEach(cc => {
      const editable = canActUI();
      const facturadaText = cc.facturada ? 'Sí' : 'No';
      const sernrOppen = cc.sernr_oppen ? `<span style="color: #059669; font-weight: 600;">${cc.sernr_oppen}</span>` : '-';

      html += `<tr data-id="${cc.id}" class="row-cta-cte" style="background-color: #d4edda;">
        <td class="td-cliente">${cc.nombre_cliente}</td>
        <td class="td-comentario" data-value="${cc.comentario || ''}">${cc.comentario || '-'}</td>
        <td class="td-monto" data-value="${cc.monto}">${money(cc.monto)}</td>
        <td class="td-facturada" data-value="${cc.facturada ? 1 : 0}">${facturadaText}</td>
        <td class="td-punto-venta" data-value="${cc.punto_venta || ''}">${cc.punto_venta || '-'}</td>
        <td class="td-nro-comanda" data-value="${cc.nro_comanda || ''}">${cc.nro_comanda || '-'}</td>
        <td class="td-sernr-oppen">${sernrOppen}</td>
        <td class="td-usuario">${cc.usuario || '-'}</td>
        <td class="td-acciones">
          ${editable ? `
            <button type="button" class="btn-editar-bd" data-id="${cc.id}">✏️</button>
            <button type="button" class="btn-borrar-bd" data-id="${cc.id}">🗑️</button>
          ` : ''}
        </td>
      </tr>`;
    });
    tbody.innerHTML = html;
  }

  // ----------- eventos formulario (guardar directo) -----------
  if (form) {
    form.addEventListener("submit", async function(e) {
      e.preventDefault();
      if (!canActUI()) {
        alert("⚠️ No podés modificar (caja/local cerrados o auditados).");
        return;
      }

      const ctx = getCtx();
      if (!ctx.local || !ctx.caja || !ctx.fecha || !ctx.turno) {
        alert("Falta información de caja/fecha/turno. Asegurate de haber seleccionado caja, fecha y turno.");
        return;
      }

      const clienteId = parseInt(clienteSelect.value);
      const monto = parseFloat(montoInput.value);
      const comentario = comentarioInput.value.trim();
      const facturada = facturadaCheck.checked;
      const puntoVenta = puntoVentaInput.value ? parseInt(puntoVentaInput.value) : null;
      const nroComanda = nroComandaInput.value ? parseInt(nroComandaInput.value) : null;

      if (!clienteId || !monto || !nroComanda) {
        alert("Completá todos los campos obligatorios (incluyendo Nro. Comanda)");
        return;
      }

      // Validar: si es CNGCC, comentario obligatorio
      const selectedOption = clienteSelect.options[clienteSelect.selectedIndex];
      const codigo = selectedOption?.dataset?.codigo || '';
      if (codigo === 'CNGCC' && !comentario) {
        alert("Debe ingresar un comentario para 'Otro cliente'");
        return;
      }

      try {
        setLoading(true);
        const res = await fetch('/guardar_ctas_ctes_lote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            local: ctx.local,
            caja: ctx.caja,
            fecha: ctx.fecha,
            turno: ctx.turno,
            items: [{
              cliente_id: clienteId,
              monto,
              comentario,
              facturada,
              punto_venta: puntoVenta,
              nro_comanda: nroComanda
            }]
          })
        });
        const data = await res.json();
        setLoading(false);

        if (data.success) {
          alert("✅ Cuenta corriente guardada");
          form.reset();
          comentarioContainer.style.display = 'none';
          if (window.OrqTabs) window.OrqTabs.reloadActive();
        } else {
          alert("❌ " + (data.msg || "Error al guardar"));
        }
      } catch (err) {
        setLoading(false);
        alert("❌ Error de red");
        console.error(err);
      }
    });
  }

  // ----------- funciones de edición inline -----------
  function iniciarEdicion(row) {
    // Si ya hay otra fila en edición, cancelarla
    if (filaEditando && filaEditando !== row) {
      cancelarEdicion(filaEditando);
    }

    filaEditando = row;
    row.classList.add('editing');

    const tdComentario = row.querySelector('.td-comentario');
    const tdMonto = row.querySelector('.td-monto');
    const tdFacturada = row.querySelector('.td-facturada');
    const tdPuntoVenta = row.querySelector('.td-punto-venta');
    const tdNroComanda = row.querySelector('.td-nro-comanda');
    const tdAcciones = row.querySelector('.td-acciones');

    // Convertir celdas en inputs
    const comentarioVal = tdComentario.dataset.value || '';
    const montoVal = tdMonto.dataset.value || '';
    const facturadaVal = tdFacturada.dataset.value || '0';
    const puntoVentaVal = tdPuntoVenta.dataset.value || '';
    const nroComandaVal = tdNroComanda.dataset.value || '';

    tdComentario.innerHTML = `<input type="text" class="edit-comentario" value="${comentarioVal}" placeholder="Comentario">`;
    tdMonto.innerHTML = `<input type="number" class="edit-monto" value="${montoVal}" step="0.01" required>`;
    tdFacturada.innerHTML = `<select class="edit-facturada">
      <option value="0" ${facturadaVal === '0' ? 'selected' : ''}>No</option>
      <option value="1" ${facturadaVal === '1' ? 'selected' : ''}>Sí</option>
    </select>`;
    tdPuntoVenta.innerHTML = `<input type="number" class="edit-punto-venta" value="${puntoVentaVal}" placeholder="Pto. Venta" min="1" max="9999">`;
    tdNroComanda.innerHTML = `<input type="number" class="edit-nro-comanda" value="${nroComandaVal}" placeholder="Nro. Comanda" required min="1">`;

    // Cambiar botones de acciones
    tdAcciones.innerHTML = `
      <button type="button" class="btn-guardar-edit" data-id="${row.dataset.id}">💾</button>
      <button type="button" class="btn-cancelar-edit">❌</button>
    `;
  }

  function cancelarEdicion(row) {
    if (!row) return;

    const id = parseInt(row.dataset.id);
    const cc = ctasCtesBD.find(c => c.id === id);
    if (!cc) return;

    row.classList.remove('editing');

    const tdComentario = row.querySelector('.td-comentario');
    const tdMonto = row.querySelector('.td-monto');
    const tdFacturada = row.querySelector('.td-facturada');
    const tdPuntoVenta = row.querySelector('.td-punto-venta');
    const tdNroComanda = row.querySelector('.td-nro-comanda');
    const tdAcciones = row.querySelector('.td-acciones');

    // Restaurar valores originales
    tdComentario.innerHTML = cc.comentario || '-';
    tdMonto.innerHTML = money(cc.monto);
    tdFacturada.innerHTML = cc.facturada ? 'Sí' : 'No';
    tdPuntoVenta.innerHTML = cc.punto_venta || '-';
    tdNroComanda.innerHTML = cc.nro_comanda || '-';

    // Restaurar botones
    tdAcciones.innerHTML = `
      <button type="button" class="btn-editar-bd" data-id="${cc.id}">✏️</button>
      <button type="button" class="btn-borrar-bd" data-id="${cc.id}">🗑️</button>
    `;

    filaEditando = null;
  }

  async function guardarEdicion(row) {
    const id = parseInt(row.dataset.id);

    const comentario = row.querySelector('.edit-comentario').value.trim();
    const monto = parseFloat(row.querySelector('.edit-monto').value);
    const facturada = parseInt(row.querySelector('.edit-facturada').value) === 1;
    const puntoVentaVal = row.querySelector('.edit-punto-venta').value.trim();
    const nroComandaVal = row.querySelector('.edit-nro-comanda').value.trim();

    if (!monto || isNaN(monto)) {
      alert("El monto es obligatorio y debe ser un número válido");
      return;
    }

    if (!nroComandaVal || isNaN(parseInt(nroComandaVal))) {
      alert("El Nro. Comanda es obligatorio y debe ser un número");
      return;
    }

    const puntoVenta = puntoVentaVal ? parseInt(puntoVentaVal) : null;
    const nroComanda = parseInt(nroComandaVal);

    try {
      setLoading(true);
      const res = await fetch(`/ctas_ctes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monto,
          comentario,
          punto_venta: puntoVenta,
          nro_comanda: nroComanda,
          facturada
        })
      });
      const data = await res.json();
      setLoading(false);

      if (data.success) {
        alert("✅ Cuenta corriente actualizada");
        filaEditando = null;
        if (window.OrqTabs) window.OrqTabs.reloadActive();
      } else {
        alert("❌ " + (data.msg || "Error al actualizar"));
      }
    } catch (err) {
      setLoading(false);
      alert("❌ Error de red");
      console.error(err);
    }
  }

  // ----------- eventos botones BD -----------
  if (tablaBD) {
    tablaBD.addEventListener("click", async function(e) {
      const btnEdit = e.target.closest(".btn-editar-bd");
      const btnDel = e.target.closest(".btn-borrar-bd");
      const btnGuardar = e.target.closest(".btn-guardar-edit");
      const btnCancelar = e.target.closest(".btn-cancelar-edit");

      if (btnEdit) {
        const row = btnEdit.closest('tr');
        iniciarEdicion(row);
        return;
      }

      if (btnCancelar) {
        const row = btnCancelar.closest('tr');
        cancelarEdicion(row);
        return;
      }

      if (btnGuardar) {
        const row = btnGuardar.closest('tr');
        await guardarEdicion(row);
        return;
      }

      if (btnDel) {
        const id = parseInt(btnDel.dataset.id);
        if (!confirm("¿Eliminar esta cuenta corriente de la BD?")) return;

        try {
          setLoading(true);
          const res = await fetch(`/ctas_ctes/${id}`, { method: 'DELETE' });
          const data = await res.json();
          setLoading(false);

          if (data.success) {
            alert("✅ Cuenta corriente eliminada");
            if (window.OrqTabs) window.OrqTabs.reloadActive();
          } else {
            alert("❌ " + (data.msg || "Error al eliminar"));
          }
        } catch (err) {
          setLoading(false);
          alert("❌ Error de red");
          console.error(err);
        }
      }
    });
  }

  // ----------- renderer para OrqTabs -----------
  window.renderCtasCtes = function(_main, opts = {}) {
    const map = opts.datasets || {};

    // Buscar el endpoint de ctas_ctes_cargadas
    const epCtasCtes = Object.keys(map).find(k => k.includes('/ctas_ctes_cargadas'));
    const payload = epCtasCtes ? map[epCtasCtes] : null;

    if (payload) {
      ctasCtesBD = payload.datos || [];

      // Estados de caja/local
      if (typeof payload.estado_caja !== "undefined") {
        window.cajaCerrada = (parseInt(payload.estado_caja, 10) === 0);
      }
      if (typeof payload.estado_local !== "undefined") {
        localCerrado = (parseInt(payload.estado_local, 10) === 0);
      }
    }

    // Verificar si está auditado
    const ctx = getCtx();
    if (ctx.local && ctx.fecha) {
      fetch(`/local_auditado?local=${encodeURIComponent(ctx.local)}&fecha=${encodeURIComponent(ctx.fecha)}`)
        .then(r => r.json())
        .then(d => {
          localAuditado = (d.auditado === true);
        })
        .catch(() => {});
    }

    renderBD();
  };

  // ----------- init -----------
  renderBD();
});
