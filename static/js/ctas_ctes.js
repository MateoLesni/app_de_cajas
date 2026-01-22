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
      #${tabKey} .btn-borrar-bd { cursor:pointer; }
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
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#999;">No hay cuentas corrientes guardadas en BD</td></tr>';
      return;
    }

    let html = "";
    ctasCtesBD.forEach(cc => {
      const editable = canActUI();
      const facturadaText = cc.facturada ? 'Sí' : 'No';

      html += `<tr data-id="${cc.id}" style="background-color: #d4edda;">
        <td>${cc.nombre_cliente}</td>
        <td>${cc.comentario || '-'}</td>
        <td>${money(cc.monto)}</td>
        <td>${facturadaText}</td>
        <td>${cc.usuario || '-'}</td>
        <td>
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

      if (!clienteId || !monto) {
        alert("Completá todos los campos obligatorios");
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
            items: [{ cliente_id: clienteId, monto, comentario, facturada }]
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

  // ----------- eventos botones BD -----------
  if (tablaBD) {
    tablaBD.addEventListener("click", async function(e) {
      const btnEdit = e.target.closest(".btn-editar-bd");
      const btnDel = e.target.closest(".btn-borrar-bd");

      if (btnEdit) {
        const id = parseInt(btnEdit.dataset.id);
        const cc = ctasCtesBD.find(c => c.id === id);
        if (!cc) return;

        const nuevoMonto = prompt("Nuevo monto:", cc.monto);
        if (!nuevoMonto) return;

        const nuevoComentario = prompt("Nuevo comentario:", cc.comentario || '');
        const facturada = confirm("¿Está facturada?");

        try {
          setLoading(true);
          const res = await fetch(`/ctas_ctes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              monto: parseFloat(nuevoMonto),
              comentario: nuevoComentario,
              facturada: facturada
            })
          });
          const data = await res.json();
          setLoading(false);

          if (data.success) {
            alert("✅ Cuenta corriente actualizada");
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
