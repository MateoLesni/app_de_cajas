// ==== Anticipos Consumidos: renderer integrado a OrqTabs con permisos L1/L2/L3 ====
// Requiere que la vista principal haya seteado window.ROLE_LEVEL (int).
// En la inicialización del Orquestador, registrá el tab con:
// tabs: { anticipos: { endpoints: ['/anticipos_cargados'], render: window.renderAnticipos } }

document.addEventListener("DOMContentLoaded", function () {
  // ----------- refs y key del tab -----------
  const tabKey = document.getElementById("anticipos") ? "anticipos" :
                 (document.getElementById("anticiposTab") ? "anticiposTab" : "anticipos");
  const pane   = document.getElementById(tabKey);

  const tablaPreview   = document.getElementById("tablaPreviewAnticipos");
  const form           = document.getElementById("anticiposForm");
  const fechaAnticipoInput = document.getElementById("fechaAnticipoRecibido");
  const medioPagoInput = document.getElementById("medioPagoAnticipo");
  const comentarioInput = document.getElementById("comentarioAnticipo");
  const montoInput     = document.getElementById("montoAnticipos");

  const cajaSelect     = document.getElementById("cajaSelect");
  const fechaGlobal    = document.getElementById("fechaGlobal");
  const turnoSelect    = document.getElementById("turnoSelect");
  const respuestaDiv   = document.getElementById("respuestaAnticipos");

  // ----------- permisos y estado -----------
  const ROLE = parseInt(window.ROLE_LEVEL || 1, 10);
  window.cajaCerrada = window.cajaCerrada ?? false;
  let localCerrado = false;
  let localAuditado = false;

  let anticiposBD = [];       // vienen del backend a través de OrqTabs
  let anticiposLocal = [];    // buffer local antes de guardar
  let idxEdicionActual = -1;

  // ----------- estilos (centrado + overlay) -----------
  (function ensureStyle() {
    if (document.getElementById("anticipos-style")) return;
    const st = document.createElement("style");
    st.id = "anticipos-style";
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
      #${tabKey} .btn-edit-local,
      #${tabKey} .btn-del-local,
      #${tabKey} .btn-aceptar-bd,
      #${tabKey} .btn-cancelar-bd,
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
        ov.innerHTML = '<div class="mod-spinner">Cargando…</div>';
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

  function parseMoneda(v) { return parseFloat(String(v ?? "").replace(/\./g, "").replace(",", ".")) || 0; }
  function formatearMoneda(v) { return parseFloat(v || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function formatearFechaISO(fechaISO) {
    if (!fechaISO) return "";
    const d = new Date(fechaISO);
    const dd = String(d.getUTCDate()).padStart(2,'0');
    const mm = String(d.getUTCMonth()+1).padStart(2,'0');
    const yy = d.getUTCFullYear();
    return `${dd}/${mm}/${yy}`;
  }

  function canActUI() {
    // Si el local está auditado, NADIE puede editar
    if (localAuditado) return false;
    if (ROLE >= 3) return true;          // auditor
    if (ROLE >= 2) return !localCerrado; // encargado
    return !window.cajaCerrada;          // cajero
  }

  async function refrescarEstadoCajaLocal({ reRender = true } = {}) {
    const { local, caja, fecha, turno } = getCtx();
    if (!local || !caja || !fecha || !turno) {
      window.cajaCerrada = false;
      localCerrado = false;
      localAuditado = false;
      toggleUIByEstado();
      if (reRender) renderTabla();
      return;
    }
    try {
      const [rCaja, rLocal, rAudit] = await Promise.all([
        fetch(`/estado_caja?local=${encodeURIComponent(local)}&caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`)
          .then(r => r.ok ? r.json() : { estado: 1 }).catch(() => ({ estado: 1 })),
        fetch(`/estado_local?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}`)
          .then(r => r.ok ? r.json() : { ok: true, estado: 1 }).catch(() => ({ ok: true, estado: 1 })),
        fetch(`/api/estado_auditoria?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}`)
          .then(r => r.ok ? r.json() : { success: false, auditado: false }).catch(() => ({ success: false, auditado: false }))
      ]);
      window.cajaCerrada = ((rCaja.estado ?? 1) === 0);
      localCerrado = ((rLocal.estado ?? 1) === 0);
      localAuditado = (rAudit.success && rAudit.auditado) || false;
      console.log('🔍 ANTICIPOS estado actualizado - cajaCerrada:', window.cajaCerrada, 'localCerrado:', localCerrado, 'localAuditado:', localAuditado);
    } catch {
      window.cajaCerrada = false;
      localCerrado = false;
      localAuditado = false;
    }
    toggleUIByEstado();
    if (reRender) renderTabla();
  }

  function toggleUIByEstado() {
    const disabled = !canActUI();
    ["btnAnadirAnticipos","btnActualizarAnticipos","guardarAnticiposBD"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = disabled;
    });
    [fechaAnticipoInput, medioPagoInput, comentarioInput, montoInput].forEach(el => { if (el) el.disabled = disabled; });
    renderTabla();
  }

  function limpiarFormulario() {
    form?.reset();
    idxEdicionActual = -1;
    const btnAnadir     = document.getElementById("btnAnadirAnticipos");
    const btnActualizar = document.getElementById("btnActualizarAnticipos");
    if (btnAnadir)     btnAnadir.style.display = "inline-block";
    if (btnActualizar) btnActualizar.style.display = "none";
    // Limpiar el hidden input
    const idxEdicion = document.getElementById("idxEdicionAnticipos");
    if (idxEdicion) idxEdicion.value = "-1";
  }

  // ----------- render tabla -----------
  function renderTabla() {
    if (!tablaPreview) return;
    tablaPreview.innerHTML = "";

    const bloqueada = !canActUI();
    console.log('🔍 ANTICIPOS renderTabla - localAuditado:', localAuditado, 'bloqueada:', bloqueada, 'canActUI():', canActUI());
    const todas = [...anticiposBD, ...anticiposLocal];

    todas.forEach((a) => {
      const tr = document.createElement("tr");
      if (a.origen === "bd") tr.style.backgroundColor = "#d4edda";

      let acciones = "";
      if (a.origen === "local") {
        const i = anticiposLocal.indexOf(a);
        acciones = bloqueada ? "" : `
          <button class="btn-edit-local" data-idx="${i}" title="Editar">✏️</button>
          <button class="btn-del-local" data-idx="${i}" title="Eliminar">🗑️</button>
        `;
      } else {
        // Para BD: botones de editar/borrar
        acciones = bloqueada ? "" : `
          <button class="btn-aceptar-bd" data-id="${a.id}" style="display:none;">✅</button>
          <button class="btn-cancelar-bd" data-id="${a.id}" style="display:none;">❌</button>
          <button class="btn-editar-bd" data-id="${a.id}" title="Editar">✏️</button>
          <button class="btn-borrar-bd" data-id="${a.id}" title="Borrar">🗑️</button>
        `;
      }

      tr.innerHTML = `
        <td>
          <span class="text-fecha" data-id="${a.id ?? ''}">${formatearFechaISO(a.fecha_anticipo_recibido)}</span>
          ${a.origen === "bd" ? `<input class="edit-fecha-bd" data-id="${a.id ?? ''}" type="date" value="${a.fecha_anticipo_recibido}" style="display:none; width:140px;">` : ""}
        </td>
        <td>
          <span class="text-medio" data-id="${a.id ?? ''}">${a.medio_pago || "-"}</span>
          ${a.origen === "bd" ? `<select class="edit-medio-bd" data-id="${a.id ?? ''}" style="display:none; width:140px;">
            <option value="MercadoPago" ${a.medio_pago === "MercadoPago" ? "selected" : ""}>MercadoPago</option>
            <option value="Efectivo" ${a.medio_pago === "Efectivo" ? "selected" : ""}>Efectivo</option>
            <option value="Banco" ${a.medio_pago === "Banco" ? "selected" : ""}>Banco</option>
          </select>` : ""}
        </td>
        <td>
          <span class="text-comentario" data-id="${a.id ?? ''}">${a.comentario || ""}</span>
          ${a.origen === "bd" ? `<input class="edit-comentario-bd" data-id="${a.id ?? ''}" type="text" value="${a.comentario || ""}" style="display:none; width:200px;">` : ""}
        </td>
        <td>
          <span class="text-monto" data-id="${a.id ?? ''}">$${formatearMoneda(a.monto)}</span>
          ${a.origen === "bd" ? `<input class="edit-monto-bd" data-id="${a.id ?? ''}" type="text" value="${formatearMoneda(a.monto)}" style="display:none; width:110px;">` : ""}
        </td>
        <td>${acciones}</td>
      `;
      tablaPreview.appendChild(tr);
    });
  }

  // ----------- delegación de eventos en el pane -----------
  pane?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");

    // bloqueo si no puede actuar
    if (btn && !canActUI()) {
      if (btn.className?.includes("btn-") || ["btnAnadirAnticipos","btnActualizarAnticipos","guardarAnticiposBD"].includes(btn.id)) {
        mostrarAlerta("No tenés permisos para esta acción (caja/local cerrados para tu rol).");
        return;
      }
    }

    // Añadir (local)
    if (e.target.id === "btnAnadirAnticipos" || btn?.id === "btnAnadirAnticipos") {
      const ctx  = getCtx();
      const fechaAnticipo = (fechaAnticipoInput?.value || "").trim();
      const medioPago = (medioPagoInput?.value || "").trim();
      const comentario = (comentarioInput?.value || "").trim();
      const monto = (montoInput?.value || "").trim();

      if (!ctx.caja || !ctx.fecha || !ctx.turno) { mostrarAlerta("Elegí Caja / Fecha / Turno."); return; }
      if (!fechaAnticipo) { mostrarAlerta("Completá la fecha del anticipo recibido."); return; }
      if (!medioPago) { mostrarAlerta("Seleccioná el medio de pago."); return; }
      if (!monto) { mostrarAlerta("Ingresá el monto."); return; }

      anticiposLocal.push({
        fecha_anticipo_recibido: fechaAnticipo,
        medio_pago: medioPago,
        comentario,
        monto,
        fecha: ctx.fecha,
        caja: ctx.caja,
        origen: "local"
      });
      renderTabla();
      limpiarFormulario();
      return;
    }

    // Actualizar (local)
    if (e.target.id === "btnActualizarAnticipos" || btn?.id === "btnActualizarAnticipos") {
      if (idxEdicionActual < 0 || idxEdicionActual >= anticiposLocal.length) return;
      const ctx  = getCtx();
      const fechaAnticipo = (fechaAnticipoInput?.value || "").trim();
      const medioPago = (medioPagoInput?.value || "").trim();
      const comentario = (comentarioInput?.value || "").trim();
      const monto = (montoInput?.value || "").trim();

      anticiposLocal[idxEdicionActual] = {
        fecha_anticipo_recibido: fechaAnticipo,
        medio_pago: medioPago,
        comentario,
        monto,
        fecha: ctx.fecha,
        caja: ctx.caja,
        origen: "local"
      };
      renderTabla();
      limpiarFormulario();
      return;
    }

    // Guardar lote
    if (e.target.id === "guardarAnticiposBD" || btn?.id === "guardarAnticiposBD") {
      if (anticiposLocal.length === 0) { respuestaDiv.textContent = "No hay anticipos nuevos para guardar."; return; }
      const ctx = getCtx();
      if (!ctx.caja || !ctx.fecha || !ctx.turno) { mostrarAlerta("Elegí Caja / Fecha / Turno."); return; }

      try {
        setLoading(true);
        const r = await fetch("/guardar_anticipos_lote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            local: ctx.local, caja: ctx.caja, fecha: ctx.fecha, turno: ctx.turno,
            transacciones: anticiposLocal.map(a => ({
              fecha_anticipo_recibido: a.fecha_anticipo_recibido,
              medio_pago: a.medio_pago,
              comentario: a.comentario,
              monto: a.monto
            }))
          })
        });
        const data = await r.json();
        if (data.success) {
          respuestaDiv.textContent = "✅ Anticipos guardados correctamente.";
          anticiposLocal = [];
          window.OrqTabs?.reload(tabKey);
        } else {
          respuestaDiv.textContent = "❌ " + (data.msg || "Error al guardar");
        }
      } catch (e2) {
        respuestaDiv.textContent = "❌ Error de red al guardar";
      } finally {
        setLoading(false);
      }
      return;
    }

    // Local: editar/borrar
    if (e.target.classList.contains("btn-edit-local")) {
      const i = parseInt(e.target.dataset.idx);
      const a = anticiposLocal[i];
      if (!a) return;
      fechaAnticipoInput.value = a.fecha_anticipo_recibido;
      medioPagoInput.value = a.medio_pago;
      comentarioInput.value = a.comentario || "";
      montoInput.value = a.monto;
      idxEdicionActual = i;
      const addBtn = document.getElementById("btnAnadirAnticipos");
      const updBtn = document.getElementById("btnActualizarAnticipos");
      if (addBtn) addBtn.style.display = "none";
      if (updBtn) updBtn.style.display = "inline-block";
      return;
    }

    if (e.target.classList.contains("btn-del-local")) {
      const i = parseInt(e.target.dataset.idx);
      anticiposLocal.splice(i,1);
      renderTabla();
      limpiarFormulario();
      return;
    }

    // BD: editar (modo inline)
    if (e.target.classList.contains("btn-editar-bd")) {
      const id = e.target.dataset.id;
      const tr = e.target.closest("tr");
      // Ocultar texto, mostrar inputs
      tr.querySelectorAll(".text-fecha, .text-medio, .text-comentario, .text-monto").forEach(s => s.style.display = "none");
      tr.querySelectorAll(".edit-fecha-bd, .edit-medio-bd, .edit-comentario-bd, .edit-monto-bd").forEach(inp => inp.style.display = "inline-block");
      // Ocultar editar/borrar, mostrar aceptar/cancelar
      tr.querySelectorAll(".btn-editar-bd, .btn-borrar-bd").forEach(b => b.style.display = "none");
      tr.querySelectorAll(".btn-aceptar-bd, .btn-cancelar-bd").forEach(b => b.style.display = "inline");
      return;
    }

    // BD: cancelar edición
    if (e.target.classList.contains("btn-cancelar-bd")) {
      const tr = e.target.closest("tr");
      tr.querySelectorAll(".text-fecha, .text-medio, .text-comentario, .text-monto").forEach(s => s.style.display = "inline");
      tr.querySelectorAll(".edit-fecha-bd, .edit-medio-bd, .edit-comentario-bd, .edit-monto-bd").forEach(inp => inp.style.display = "none");
      tr.querySelectorAll(".btn-editar-bd, .btn-borrar-bd").forEach(b => b.style.display = "inline");
      tr.querySelectorAll(".btn-aceptar-bd, .btn-cancelar-bd").forEach(b => b.style.display = "none");
      return;
    }

    // BD: aceptar edición
    if (e.target.classList.contains("btn-aceptar-bd")) {
      const id = e.target.dataset.id;
      const tr = e.target.closest("tr");
      const fechaAnticipo = tr.querySelector(".edit-fecha-bd")?.value || "";
      const medioPago = tr.querySelector(".edit-medio-bd")?.value || "";
      const comentario = tr.querySelector(".edit-comentario-bd")?.value || "";
      const montoStr = tr.querySelector(".edit-monto-bd")?.value || "0";
      const monto = parseMoneda(montoStr);

      try {
        setLoading(true);
        const r = await fetch(`/anticipos/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fecha_anticipo_recibido: fechaAnticipo, medio_pago: medioPago, comentario, monto })
        });
        const data = await r.json();
        if (data.success) {
          respuestaDiv.textContent = "✅ Anticipo actualizado correctamente.";
          window.OrqTabs?.reload(tabKey);
        } else {
          respuestaDiv.textContent = "❌ " + (data.msg || "Error al actualizar");
        }
      } catch (e2) {
        respuestaDiv.textContent = "❌ Error de red al actualizar";
      } finally {
        setLoading(false);
      }
      return;
    }

    // BD: borrar
    if (e.target.classList.contains("btn-borrar-bd")) {
      const id = e.target.dataset.id;
      if (!confirm("¿Eliminar este anticipo?")) return;
      try {
        setLoading(true);
        const r = await fetch(`/anticipos/${id}`, { method: "DELETE" });
        const data = await r.json();
        if (data.success) {
          respuestaDiv.textContent = "✅ Anticipo eliminado.";
          window.OrqTabs?.reload(tabKey);
        } else {
          respuestaDiv.textContent = "❌ " + (data.msg || "Error al eliminar");
        }
      } catch (e2) {
        respuestaDiv.textContent = "❌ Error de red al eliminar";
      } finally {
        setLoading(false);
      }
      return;
    }
  });

  // ----------- renderer para OrqTabs -----------
  window.renderAnticipos = async function (datasetMap) {
    console.log("🔍 ANTICIPOS renderAnticipos llamado con:", datasetMap);
    const payload = datasetMap?.['/anticipos_cargados'] || null;
    if (!payload || !payload.success) {
      anticiposBD = [];
      renderTabla();
      return;
    }

    // Actualizar estados de la UI
    if (payload && typeof payload.estado_caja !== "undefined") {
      window.cajaCerrada = (parseInt(payload.estado_caja, 10) === 0);
    }
    if (payload && typeof payload.estado_local !== "undefined") {
      localCerrado = (parseInt(payload.estado_local, 10) === 0);
    }

    if (!payload || typeof payload.estado_caja === "undefined" || typeof payload.estado_local === "undefined") {
      await refrescarEstadoCajaLocal({ reRender: false });
    } else {
      toggleUIByEstado();
    }

    anticiposBD = (payload.datos || []).map(a => ({ ...a, origen: "bd" }));
    renderTabla();
  };

  // Listeners del cambio de caja/fecha/turno
  cajaSelect?.addEventListener("change", () => refrescarEstadoCajaLocal());
  fechaGlobal?.addEventListener("change", () => refrescarEstadoCajaLocal());
  turnoSelect?.addEventListener("change", () => refrescarEstadoCajaLocal());

  // Si existe localSelect (para auditor)
  const localSelectEl = document.getElementById("localSelect");
  if (localSelectEl) {
    localSelectEl.addEventListener("change", () => refrescarEstadoCajaLocal());
  }

  // Initial load
  refrescarEstadoCajaLocal();
});
