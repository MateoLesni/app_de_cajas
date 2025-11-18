// ==== Gastos: renderer integrado a OrqTabs con permisos L1/L2/L3 ====
// Requiere que la vista principal haya seteado window.ROLE_LEVEL (int).
// En la inicialización del Orquestador, registrá el tab con:
// tabs: { gastos: { endpoints: ['/gastos_cargadas'], render: window.renderGastos } }

document.addEventListener("DOMContentLoaded", function () {
  // ----------- refs y key del tab -----------
  const tabKey = document.getElementById("gastos") ? "gastos" :
                 (document.getElementById("gastosTab") ? "gastosTab" : "gastos");
  const pane   = document.getElementById(tabKey);

  const tablaPreview   = document.getElementById("tablaPreviewGastos");
  const form           = document.getElementById("gastosForm");
  const tipoInput      = document.getElementById("tipoGasto");
  const montoInput     = document.getElementById("montoGastos");
  const obsInput       = document.getElementById("obsGastos"); // si no existe, no pasa nada

  const cajaSelect     = document.getElementById("cajaSelect");
  const fechaGlobal    = document.getElementById("fechaGlobal");
  const turnoSelect    = document.getElementById("turnoSelect");
  const respuestaDiv   = document.getElementById("respuestaGastos");

  // ----------- permisos y estado -----------
  const ROLE = parseInt(window.ROLE_LEVEL || 1, 10);
  window.cajaCerrada = window.cajaCerrada ?? false;
  let localCerrado = false;
  let localAuditado = false;

  let gastosBD = [];       // vienen del backend a través de OrqTabs
  let gastosLocal = [];    // buffer local antes de guardar
  let idxEdicionActual = -1;
  let tiposGastos = {};    // mapeo código -> descripción

  // ----------- cargar tipos de gastos -----------
  async function cargarTiposGastos() {
    try {
      const res = await fetch('/api/tipos_gastos');
      const data = await res.json();
      if (data.success && data.tipos) {
        tiposGastos = data.tipos;
        // Poblar el select
        if (tipoInput) {
          tipoInput.innerHTML = '<option value="">-- Seleccionar tipo de gasto --</option>';
          Object.entries(tiposGastos).forEach(([codigo, descripcion]) => {
            const opt = document.createElement('option');
            opt.value = codigo;
            opt.textContent = descripcion;
            tipoInput.appendChild(opt);
          });
        }
      }
    } catch (e) {
      console.error('Error cargando tipos de gastos:', e);
    }
  }

  // Cargar tipos al inicio
  cargarTiposGastos();

  // ----------- estilos (centrado + overlay) -----------
  (function ensureStyle() {
    if (document.getElementById("gastos-style")) return;
    const st = document.createElement("style");
    st.id = "gastos-style";
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
  const getLocalActual = () => (document.getElementById("userLocal")?.innerText || "").trim();
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

  // Obtener descripción de un código de gasto (si no existe, retorna el código)
  function getDescripcionGasto(codigo) {
    return tiposGastos[codigo] || codigo;
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
      console.log('🔍 GASTOS estado actualizado - cajaCerrada:', window.cajaCerrada, 'localCerrado:', localCerrado, 'localAuditado:', localAuditado);
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
    ["btnAnadirGastos","btnActualizarGastos","guardarGastosBD"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = disabled;
    });
    [tipoInput, montoInput, (obsInput || null)].forEach(el => { if (el) el.disabled = disabled; });
    renderTabla();
  }

  function limpiarFormulario() {
    form?.reset();
    idxEdicionActual = -1;
    const btnAnadir     = document.getElementById("btnAnadirGastos");
    const btnActualizar = document.getElementById("btnActualizarGastos");
    if (btnAnadir)     btnAnadir.style.display = "inline-block";
    if (btnActualizar) btnActualizar.style.display = "none";
  }

  // ----------- render tabla -----------
  function renderTabla() {
    if (!tablaPreview) return;
    tablaPreview.innerHTML = "";

    const bloqueada = !canActUI();
    console.log('🔍 GASTOS renderTabla - localAuditado:', localAuditado, 'bloqueada:', bloqueada, 'canActUI():', canActUI());
    const todas = [...gastosBD, ...gastosLocal];

    todas.forEach((g) => {
      const tr = document.createElement("tr");
      if (g.origen === "bd") tr.style.backgroundColor = "#d4edda";

      let acciones = "";
      if (g.origen === "local") {
        const i = gastosLocal.indexOf(g);
        acciones = bloqueada ? "" : `
          <button class="btn-edit-local" data-idx="${i}" title="Editar">✏️</button>
          <button class="btn-del-local" data-idx="${i}" title="Eliminar">🗑️</button>
        `;
      } else {
        // Para BD: no se generan inputs en ACCIONES; sólo botones
        acciones = bloqueada ? "" : `
          <button class="btn-aceptar-bd" data-id="${g.id}" style="display:none;">✅</button>
          <button class="btn-cancelar-bd" data-id="${g.id}" style="display:none;">❌</button>
          <button class="btn-editar-bd" data-id="${g.id}" title="Editar">✏️</button>
          <button class="btn-borrar-bd" data-id="${g.id}" title="Borrar">🗑️</button>
        `;
      }

      // OBSERVACIONES: en filas de BD no ponemos input para el lápiz (pedido)
      const tdObs = (g.origen === "bd")
        ? `<span class="text-obs" data-id="${g.id ?? ''}">${g.observaciones || ""}</span>`
        : `<span class="text-obs-local">${g.observaciones || ""}</span>`;

      // Crear select de tipos para edición (si es de BD)
      let selectTipos = '';
      if (g.origen === "bd") {
        selectTipos = '<select class="edit-tipo-bd" data-id="' + (g.id ?? '') + '" style="display:none; width:200px;">';
        Object.entries(tiposGastos).forEach(([codigo, descripcion]) => {
          const selected = codigo === g.tipo ? ' selected' : '';
          selectTipos += `<option value="${codigo}"${selected}>${descripcion}</option>`;
        });
        selectTipos += '</select>';
      }

      tr.innerHTML = `
        <td>${formatearFechaISO(g.fecha)}</td>
        <td>
          <span class="text-tipo" data-id="${g.id ?? ''}">${getDescripcionGasto(g.tipo) || "-"}</span>
          ${selectTipos}
        </td>
        <td>
          <span class="text-monto" data-id="${g.id ?? ''}">$${formatearMoneda(g.monto)}</span>
          ${g.origen === "bd" ? `<input class="edit-monto-bd" data-id="${g.id ?? ''}" type="text" value="${formatearMoneda(g.monto)}" style="display:none; width:110px;">` : ""}
        </td>
        <td>${tdObs}</td>
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
      if (btn.className?.includes("btn-") || ["btnAnadirGastos","btnActualizarGastos","guardarGastosBD"].includes(btn.id)) {
        mostrarAlerta("No tenés permisos para esta acción (caja/local cerrados para tu rol).");
        return;
      }
    }

    // Añadir (local)
    if (e.target.id === "btnAnadirGastos" || btn?.id === "btnAnadirGastos") {
      const ctx  = getCtx();
      const tipo = (tipoInput?.value || "").trim();
      const monto = (montoInput?.value || "").trim();
      const obs   = (obsInput?.value || "").trim();

      if (!ctx.caja || !ctx.fecha || !ctx.turno) { mostrarAlerta("Elegí Caja / Fecha / Turno."); return; }
      if (!tipo)  { mostrarAlerta("Completá el tipo de gasto."); return; }
      if (!monto) { mostrarAlerta("Ingresá el monto."); return; }

      gastosLocal.push({ tipo, monto, observaciones: obs, fecha: ctx.fecha, caja: ctx.caja, origen: "local" });
      renderTabla();
      limpiarFormulario();
      return;
    }

    // Actualizar (local)
    if (e.target.id === "btnActualizarGastos" || btn?.id === "btnActualizarGastos") {
      if (idxEdicionActual < 0 || idxEdicionActual >= gastosLocal.length) return;
      const ctx  = getCtx();
      const tipo = (tipoInput?.value || "").trim();
      const monto = (montoInput?.value || "").trim();
      const obs   = (obsInput?.value || "").trim();

      gastosLocal[idxEdicionActual] = { tipo, monto, observaciones: obs, fecha: ctx.fecha, caja: ctx.caja, origen: "local" };
      renderTabla();
      limpiarFormulario();
      return;
    }

    // Guardar lote
    if (e.target.id === "guardarGastosBD" || btn?.id === "guardarGastosBD") {
      if (gastosLocal.length === 0) { respuestaDiv.textContent = "No hay gastos nuevos para guardar."; return; }
      const ctx = getCtx();
      if (!ctx.caja || !ctx.fecha || !ctx.turno) { mostrarAlerta("Elegí Caja / Fecha / Turno."); return; }

      try {
        setLoading(true);
        const r = await fetch("/guardar_gastos_lote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caja: ctx.caja, fecha: ctx.fecha, turno: ctx.turno,
            transacciones: gastosLocal.map(g => ({
              tipo: g.tipo, monto: g.monto, observaciones: g.observaciones
            }))
          })
        });
        const data = await r.json();
        if (data.success) {
          respuestaDiv.textContent = "✅ Gastos guardados correctamente.";
          gastosLocal = [];
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
      const g = gastosLocal[i];
      if (!g) return;
      tipoInput.value  = g.tipo;
      montoInput.value = g.monto;
      if (obsInput) obsInput.value = g.observaciones || "";
      idxEdicionActual = i;
      const addBtn = document.getElementById("btnAnadirGastos");
      const updBtn = document.getElementById("btnActualizarGastos");
      if (addBtn) addBtn.style.display = "none";
      if (updBtn) updBtn.style.display = "inline-block";
      return;
    }
    if (e.target.classList.contains("btn-del-local")) {
      const i = parseInt(e.target.dataset.idx);
      if (i >= 0) gastosLocal.splice(i, 1);
      renderTabla();
      return;
    }

    // BD: editar / aceptar / cancelar / borrar
    if (e.target.classList.contains("btn-editar-bd")) { toggleRowEditMode(e.target.dataset.id, true);  return; }
    if (e.target.classList.contains("btn-cancelar-bd")){ toggleRowEditMode(e.target.dataset.id, false); return; }

    if (e.target.classList.contains("btn-aceptar-bd")) {
      const id = e.target.dataset.id;
      const tipoIn  = tablaPreview.querySelector(`.edit-tipo-bd[data-id="${id}"]`);
      const montoIn = tablaPreview.querySelector(`.edit-monto-bd[data-id="${id}"]`);
      const spanObs = tablaPreview.querySelector(`.text-obs[data-id="${id}"]`);
      const tipo  = (tipoIn?.value || "").trim();
      const monto = parseMoneda(montoIn?.value || "0");
      const observaciones = (spanObs?.textContent || "").trim(); // OBS no editable con lápiz

      try {
        setLoading(true);
        const r = await fetch(`/gastos/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo, monto, observaciones })
        });
        if (!r.ok) {
          const txt = await r.text();
          if (r.status === 409) mostrarAlerta("No tenés permisos (caja/local cerrados para tu rol).");
          else mostrarAlerta("Error al actualizar: " + (txt || r.status));
          return;
        }
        const data = await r.json();
        if (data.success) window.OrqTabs?.reload(tabKey);
        else mostrarAlerta("❌ " + (data.msg || "No se pudo actualizar"));
      } catch {
        mostrarAlerta("❌ Error de red al actualizar");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (e.target.classList.contains("btn-borrar-bd")) {
      const id = e.target.dataset.id;
      if (!confirm("¿Eliminar este gasto?")) return;
      try {
        setLoading(true);
        const r = await fetch(`/gastos/${id}`, { method: "DELETE" });
        if (!r.ok) {
          const txt = await r.text();
          if (r.status === 409) mostrarAlerta("No tenés permisos (caja/local cerrados para tu rol).");
          else mostrarAlerta("Error al borrar: " + (txt || r.status));
          return;
        }
        const data = await r.json();
        if (data.success) window.OrqTabs?.reload(tabKey);
        else mostrarAlerta("❌ " + (data.msg || "No se pudo borrar"));
      } catch {
        mostrarAlerta("❌ Error de red al borrar");
      } finally {
        setLoading(false);
      }
      return;
    }
  });

  function toggleRowEditMode(id, editing) {
    const show = (sel) => { const el = tablaPreview.querySelector(sel); if (el) el.style.display = "inline-block"; };
    const hide = (sel) => { const el = tablaPreview.querySelector(sel); if (el) el.style.display = "none"; };

    const spanTipo = tablaPreview.querySelector(`.text-tipo[data-id="${id}"]`);
    const inTipo   = tablaPreview.querySelector(`.edit-tipo-bd[data-id="${id}"]`);
    const spanMonto = tablaPreview.querySelector(`.text-monto[data-id="${id}"]`);
    const inMonto   = tablaPreview.querySelector(`.edit-monto-bd[data-id="${id}"]`);

    if (spanTipo)  spanTipo.style.display  = editing ? "none" : "inline";
    if (inTipo)    inTipo.style.display    = editing ? "inline-block" : "none";
    if (spanMonto) spanMonto.style.display = editing ? "none" : "inline";
    if (inMonto)   inMonto.style.display   = editing ? "inline-block" : "none";

    if (editing) {
      show(`.btn-aceptar-bd[data-id="${id}"]`);
      show(`.btn-cancelar-bd[data-id="${id}"]`);
      hide(`.btn-editar-bd[data-id="${id}"]`);
      hide(`.btn-borrar-bd[data-id="${id}"]`);
    } else {
      hide(`.btn-aceptar-bd[data-id="${id}"]`);
      hide(`.btn-cancelar-bd[data-id="${id}"]`);
      show(`.btn-editar-bd[data-id="${id}"]`);
      show(`.btn-borrar-bd[data-id="${id}"]`);
    }
  }

  // ======== RENDERER que llama OrqTabs ========
  window.renderGastos = async function (_main, opts = {}) {
    const map = opts.datasets || {};

    // 1) Estado de caja/local si vino en el payload de /gastos_cargadas
    const epGastos = Object.keys(map).find(k => k.includes('/gastos_cargadas'));
    const payload  = epGastos ? map[epGastos] : null;

    if (payload && typeof payload.estado_caja !== "undefined") {
      window.cajaCerrada = (parseInt(payload.estado_caja, 10) === 0);
    }
    if (payload && typeof payload.estado_local !== "undefined") {
      localCerrado = (parseInt(payload.estado_local, 10) === 0);
    }

    // Si no vino estado, lo pedimos explícitamente (como tarjetas.js)
    if (!payload || typeof payload.estado_caja === "undefined" || typeof payload.estado_local === "undefined") {
      await refrescarEstadoCajaLocal({ reRender: false });
    } else {
      toggleUIByEstado();
    }

    // 2) Datos de gastos
    gastosBD = [];
    if (payload && payload.success) {
      const ctx = getCtx();
      gastosBD = (payload.datos || []).map(t => ({
        id: t.id,
        fecha: t.fecha,
        caja: ctx.caja,
        tipo: t.tipo,
        monto: t.monto,
        observaciones: t.observaciones || "",
        origen: "bd"
      }));
    }

    renderTabla();
  };

  // === listeners clave para refrescar estado si no usás OrqTabs ===
  if (!window.OrqTabs) {
    (async () => {
      await refrescarEstadoCajaLocal({ reRender: false });
      // cargar gastos manualmente
      const { caja, fecha, turno } = getCtx();
      if (caja && fecha && turno) {
        try {
          const r = await fetch(`/gastos_cargadas?caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`);
          const data = await r.json();
          window.renderGastos(null, { datasets: { '/gastos_cargadas': data } });
        } catch {}
      }
    })();

    cajaSelect?.addEventListener("change", () => refrescarEstadoCajaLocal({ reRender: true }));
    fechaGlobal?.addEventListener("change", () => refrescarEstadoCajaLocal({ reRender: true }));
    turnoSelect?.addEventListener("change", () => refrescarEstadoCajaLocal({ reRender: true }));
  }
});

// Toast simple reutilizable
function mostrarAlerta(mensaje, duracion = 4000) {
  const alerta = document.getElementById("alertaFlotante");
  if (!alerta) { alert(mensaje); return; }
  alerta.textContent = mensaje;
  alerta.style.display = "block";
  alerta.classList.add("show");
  setTimeout(() => {
    alerta.classList.remove("show");
    setTimeout(() => { alerta.style.display = "none"; }, 300);
  }, duracion);
}
