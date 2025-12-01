// ==== PedidosYa: permisos L1/L2/L3, importes robustos y tabla centrada ====
// OrqTabs: tabs: { pedidosyaTab: { endpoints: ['/pedidosya_cargadas'], render: window.renderPedidosYa } }

document.addEventListener("DOMContentLoaded", function () {
  const paneKey = "pedidosyaTab";
  const pane    = document.getElementById(paneKey);

  const btnAnadir     = document.getElementById("btnAnadirPedidosYa");
  const btnActualizar = document.getElementById("btnActualizarPedidosYa");
  const btnGuardar    = document.getElementById("guardarPedidosYaBD");
  const tablaPreview  = document.getElementById("tablaPreviewPedidosYa");
  const form          = document.getElementById("pedidosyaForm");
  const respuestaDiv  = document.getElementById("respuestaPedidosYa");

  const inputTransaccion = document.getElementById("transaccionPedidosYa");
  const inputMonto       = document.getElementById("montoPedidosYa");

  const selCaja   = document.getElementById("cajaSelect");
  const selFecha  = document.getElementById("fechaGlobal");
  const selTurno  = document.getElementById("turnoSelect");

  // ===== estado / permisos =====
  window.cajaCerrada = window.cajaCerrada ?? false;
  const ROLE = parseInt(window.ROLE_LEVEL || 1, 10);
  let localCerrado = false;
  let localAuditado = false;

  function canActUI(){
    // Si el local está auditado, NADIE puede editar
    if (localAuditado) return false;
    if (ROLE >= 3) return true;          // L3: siempre
    if (ROLE >= 2) return !localCerrado; // L2: mientras el local esté abierto
    return !window.cajaCerrada;          // L1: sólo con caja abierta
  }

  // ===== memoria =====
  let transaccionesBD = [];      // [{id, transaccion, monto, fecha, caja, turno, origen:'bd'}]
  let transaccionesNuevas = [];  // [{transaccion, monto, fecha, caja, turno, origen:'local'}]
  let idxEdicionActual = -1;

  // ===== helpers =====
  const getLocal = () => {
    // Para auditores (nivel 3): lee de #localSelect, fallback a #userLocal
    const localSelect = document.getElementById("localSelect");
    if (localSelect) {
      const val = (localSelect.value || "").trim();
      return val || (document.getElementById("userLocal")?.innerText || "").trim();
    }
    return (document.getElementById("userLocal")?.innerText || "").trim();
  };
  const getCtx = () => ({
    local: getLocal(),
    caja:  selCaja?.value || "",
    fecha: selFecha?.value || "",
    turno: (selTurno?.value || "").trim() || "UNI"
  });

  // Parse robusto (acepta 1.234,56 / 1,234.56 / 1234.56 / 1234)
  function parseMoneda(v) {
    if (v == null) return 0;
    let s = String(v).trim().replace(/\s/g, "").replace(/[^\d.,-]/g, "");
    const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
    const lastSep = Math.max(lastComma, lastDot);
    let intPart = s, frac = "";
    if (lastSep >= 0) {
      intPart = s.slice(0, lastSep).replace(/[.,]/g, "");
      frac    = s.slice(lastSep+1).replace(/[.,]/g, "");
    } else {
      intPart = s.replace(/[.,]/g, "");
    }
    const rebuilt = frac ? `${intPart}.${frac}` : intPart;
    const n = parseFloat(rebuilt);
    return isFinite(n) ? n : 0;
  }
  const fmtMon   = v => Number(v || 0).toLocaleString("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtF     = f => { if(!f) return ""; const d=new Date(f); const dd=String(d.getUTCDate()).padStart(2,'0'); const mm=String(d.getUTCMonth()+1).padStart(2,'0'); const yy=d.getUTCFullYear(); return `${dd}/${mm}/${yy}`; };

  inputMonto?.addEventListener("input", function () {
    // higiene: mantener sólo dígitos y un separador decimal
    this.value = this.value.replace(/[^0-9.,-]/g, '').replace(/(,|\.){2,}/g, '$1');
  });

  // ===== estilo: celdas centradas + overlay =====
  (function ensureStyle(){
    if (document.getElementById("py-style")) return;
    const st = document.createElement("style");
    st.id = "py-style";
    st.textContent = `
      #${paneKey} table th, #${paneKey} table td { text-align:center; vertical-align:middle; }
      #${paneKey} { position: relative; }
      #${paneKey} .mod-overlay {
        position:absolute; inset:0; display:none; align-items:center; justify-content:center;
        background: rgba(255,255,255,.6); backdrop-filter: blur(1px); z-index: 5; pointer-events: auto;
      }
      #${paneKey} .mod-spinner {
        padding:10px 14px; border-radius:8px; background:#fff; box-shadow:0 2px 10px rgba(0,0,0,.12); font-weight:600;
      }
      #${paneKey} .btn-submit[disabled],
      #${paneKey} .btn-custom[disabled] { opacity:.45; cursor:not-allowed; }
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

  // ===== estado caja/local =====
  async function refrescarEstadoCaja({ reRender = true } = {}) {
    const { local, caja, fecha, turno } = getCtx();
    if (!caja || !fecha || !turno) {
      window.cajaCerrada = false;
      localCerrado = false;
      localAuditado = false;
      toggleUI();
      if (reRender) renderizarTabla();
      return;
    }
    try {
      const [rCaja, rLocal, rAudit] = await Promise.all([
        fetch(`/estado_caja?local=${encodeURIComponent(local)}&caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`)
          .then(r => r.ok ? r.json() : { estado: 1 }),
        fetch(`/estado_local?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`)
          .then(r => r.ok ? r.json() : { estado: 1 }),
        fetch(`/api/estado_auditoria?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}`)
          .then(r => r.ok ? r.json() : { success: false, auditado: false })
      ]);
      window.cajaCerrada = ((rCaja.estado ?? 1) === 0);
      localCerrado = ((rLocal.estado ?? 1) === 0);
      localAuditado = (rAudit.success && rAudit.auditado) || false;
    } catch {
      window.cajaCerrada = false;
      localCerrado = false;
      localAuditado = false;
    }
    toggleUI();
    if (reRender) renderizarTabla();
  }

  function toggleUI() {
    const dis = !canActUI();
    [btnAnadir, btnActualizar, btnGuardar, inputTransaccion, inputMonto]
      .forEach(el => { if (el) el.disabled = dis; });
    renderizarTabla(); // para mostrar/ocultar íconos según permisos
  }

  function limpiarFormulario() {
    form?.reset();
    idxEdicionActual = -1;
    if (btnAnadir)     btnAnadir.style.display = "inline-block";
    if (btnActualizar) btnActualizar.style.display = "none";
  }

  document.getElementById('btnCerrarCaja')?.addEventListener('click', () => {
    setTimeout(() => { refrescarEstadoCaja({ reRender: true }); }, 800);
  });

  // ===== render tabla =====
  function renderizarTabla() {
    if (!tablaPreview) return;
    tablaPreview.innerHTML = "";

    const bloqueada = !canActUI();
    const todas = [...transaccionesBD, ...transaccionesNuevas];

    todas.forEach((t) => {
      const tr = document.createElement("tr");
      if (t.origen === "bd") tr.style.backgroundColor = "#d4edda"; // guardado

      let acciones = "";
      if (t.origen === "local") {
        const idxLocal = transaccionesNuevas.indexOf(t);
        acciones = bloqueada ? "" : `
          <button class="btn-edit-new" data-idx="${idxLocal}" title="Editar">✏️</button>
          <button class="btn-del-new"  data-idx="${idxLocal}" title="Eliminar">🗑️</button>
        `;
      } else {
        acciones = bloqueada ? "" : `
          <button class="btn-aceptar-bd"  data-id="${t.id}" style="display:none;">✅</button>
          <button class="btn-cancelar-bd" data-id="${t.id}" style="display:none;">❌</button>
          <button class="btn-editar-bd"   data-id="${t.id}" title="Editar">✏️</button>
          <button class="btn-borrar-bd"   data-id="${t.id}" title="Borrar">🗑️</button>
        `;
      }

      tr.innerHTML = `
        <td>${fmtF(t.fecha)}</td>
        <td>
          <span class="text-transaccion" data-id="${t.id ?? ''}">${t.transaccion}</span>
          <input class="edit-transaccion-bd" data-id="${t.id ?? ''}" type="text" value="${t.transaccion || ''}" style="display:none; width:140px;">
        </td>
        <td>
          <span class="text-monto" data-id="${t.id ?? ''}">$${fmtMon(t.monto)}</span>
          <input class="edit-monto-bd" data-id="${t.id ?? ''}" type="text" value="${fmtMon(t.monto)}" style="display:none; width:110px;">
        </td>
        <td>${acciones}</td>
      `;
      tablaPreview.appendChild(tr);
    });
  }

  // ===== delegación de eventos =====
  pane?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");

    // bloqueo global si no puede actuar
    if (btn && !canActUI()) {
      const classes = btn.className || "";
      if (classes.includes("btn-") || [btnAnadir?.id, btnActualizar?.id, btnGuardar?.id].includes(btn.id)) {
        mostrarAlerta("No tenés permisos para esta acción (caja/local cerrados para tu rol).");
        return;
      }
    }

    // Local: añadir
    if (btn?.id === "btnAnadirPedidosYa") {
      const { caja, fecha, turno } = getCtx();
      const transaccion = (inputTransaccion?.value || "").trim();
      const monto = parseMoneda(inputMonto?.value || "");

      if (!transaccion) { mostrarAlerta("Ingresá N° Comprobante."); return; }
      if (!(monto > 0)) { mostrarAlerta("Ingresá un Monto válido."); return; }
      if (!fecha || !caja) { mostrarAlerta("Elegí Fecha y Caja."); return; }

      const yaExiste = [...transaccionesBD, ...transaccionesNuevas].some(t =>
        t.transaccion === transaccion && t.fecha === fecha && t.caja === caja && (t.turno || "UNI") === (turno || "UNI")
      );
      if (yaExiste) { mostrarAlerta("Ese comprobante ya existe para la fecha/caja/turno."); return; }

      transaccionesNuevas.push({ transaccion, monto, fecha, caja, turno, origen: "local" });
      renderizarTabla();
      limpiarFormulario();
      return;
    }

    // Local: actualizar
    if (btn?.id === "btnActualizarPedidosYa") {
      if (idxEdicionActual < 0 || idxEdicionActual >= transaccionesNuevas.length) return;

      const { caja, fecha, turno } = getCtx();
      const transaccion = (inputTransaccion?.value || "").trim();
      const monto = parseMoneda(inputMonto?.value || "");
      if (!transaccion || !(monto > 0)) { mostrarAlerta("Comprobante y monto válidos."); return; }

      transaccionesNuevas[idxEdicionActual] = { transaccion, monto, fecha, caja, turno, origen: "local" };
      renderizarTabla();
      limpiarFormulario();
      return;
    }

    // Guardar lote
    if (btn?.id === "guardarPedidosYaBD") {
      if (transaccionesNuevas.length === 0) { respuestaDiv.textContent = "No hay transacciones nuevas para guardar."; return; }
      const { local, caja, fecha, turno } = getCtx();

      try {
        setLoading(true);
        const r = await fetch("/guardar_pedidosya_lote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            local, caja, fecha, turno,
            transacciones: transaccionesNuevas.map(t => ({ transaccion: t.transaccion, monto: Number(t.monto) }))
          }),
        });
        const data = await r.json();
        if (data.success) {
          respuestaDiv.textContent = "✅ Comprobantes guardados correctamente.";
          transaccionesNuevas = [];
          if (window.OrqTabs) OrqTabs.reload(paneKey);
        } else {
          respuestaDiv.textContent = "❌ Error: " + (data.msg || "desconocido");
        }
      } catch (err) {
        respuestaDiv.textContent = "❌ Error: " + (err.message || "de red");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Tabla: eventos (BD / local)
    if (e.target.classList.contains("btn-edit-new")) {
      const i = parseInt(e.target.dataset.idx, 10);
      const t = transaccionesNuevas[i];
      if (!t) return;
      inputTransaccion.value = t.transaccion;
      inputMonto.value       = fmtMon(t.monto);
      idxEdicionActual = i;
      if (btnAnadir)     btnAnadir.style.display = "none";
      if (btnActualizar) btnActualizar.style.display = "inline-block";
      return;
    }

    if (e.target.classList.contains("btn-del-new")) {
      const i = parseInt(e.target.dataset.idx, 10);
      if (i >= 0) transaccionesNuevas.splice(i, 1);
      renderizarTabla();
      return;
    }

    if (e.target.classList.contains("btn-editar-bd")) { toggleRowEditMode(e.target.dataset.id, true);  return; }
    if (e.target.classList.contains("btn-cancelar-bd")){ toggleRowEditMode(e.target.dataset.id, false); return; }

    if (e.target.classList.contains("btn-aceptar-bd")) {
      const id = e.target.dataset.id;
      const transInput = tablaPreview.querySelector(`.edit-transaccion-bd[data-id="${id}"]`);
      const montoInput = tablaPreview.querySelector(`.edit-monto-bd[data-id="${id}"]`);
      const transaccion = (transInput?.value || "").trim();
      const monto = parseMoneda(montoInput?.value || "0");

      try {
        setLoading(true);
        const r = await fetch(`/pedidosya/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transaccion, monto })
        });
        if (!r.ok) {
          const txt = await r.text();
          if (r.status === 409) mostrarAlerta("No tenés permisos para actualizar.");
          else mostrarAlerta("Error al actualizar: " + (txt || r.status));
          return;
        }
        const data = await r.json();
        if (data.success) {
          if (window.OrqTabs) OrqTabs.reload(paneKey);
        } else {
          mostrarAlerta("❌ " + (data.msg || "No se pudo actualizar"));
        }
      } catch {
        mostrarAlerta("❌ Error de red al actualizar");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (e.target.classList.contains("btn-borrar-bd")) {
      const id = e.target.dataset.id;
      if (!confirm("¿Eliminar este registro de PedidosYa?")) return;
      try {
        setLoading(true);
        const r = await fetch(`/pedidosya/${id}`, { method: "DELETE" });
        if (!r.ok) {
          const txt = await r.text();
          if (r.status === 409) mostrarAlerta("No tenés permisos para borrar.");
          else mostrarAlerta("Error al borrar: " + (txt || r.status));
          return;
        }
        const data = await r.json();
        if (data.success) {
          if (window.OrqTabs) OrqTabs.reload(paneKey);
        } else {
          mostrarAlerta("❌ " + (data.msg || "No se pudo borrar"));
        }
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

    const spanTrans  = tablaPreview.querySelector(`.text-transaccion[data-id="${id}"]`);
    const inputTrans = tablaPreview.querySelector(`.edit-transaccion-bd[data-id="${id}"]`);
    const spanMonto  = tablaPreview.querySelector(`.text-monto[data-id="${id}"]`);
    const inputMonto = tablaPreview.querySelector(`.edit-monto-bd[data-id="${id}"]`);

    if (spanTrans)  spanTrans.style.display  = editing ? "none" : "inline";
    if (inputTrans) inputTrans.style.display = editing ? "inline-block" : "none";
    if (spanMonto)  spanMonto.style.display  = editing ? "none" : "inline";
    if (inputMonto) inputMonto.style.display = editing ? "inline-block" : "none";

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

  // ===== RENDER que invoca OrqTabs =====
  // opts.datasets esperado: { "/pedidosya_cargadas": {...} }
  window.renderPedidosYa = function (_data, opts = {}) {
    const map = opts.datasets || {};
    const epPY = Object.keys(map).find(k => k.includes('/pedidosya_cargadas'));
    const payload = epPY ? map[epPY] : null;

    transaccionesBD = [];
    if (payload && (payload.success || Array.isArray(payload))) {
      const { caja } = getCtx();
      const arr = Array.isArray(payload) ? payload : (payload.datos || payload.items || []);
      transaccionesBD = (arr || []).map(t => ({
        id: t.id,
        transaccion: t.transaccion,
        monto: (typeof t.monto === "number" ? t.monto : parseMoneda(t.monto)),
        fecha: t.fecha,
        turno: t.turno,
        caja,
        origen: "bd"
      }));
    }

    // al cambiar dataset, vaciar "nuevos"
    transaccionesNuevas = [];

    // refrescar estado (caja/local) y render
    refrescarEstadoCaja({ reRender: false }).finally(renderizarTabla);
  };

  // ===== Fallback sin OrqTabs =====
  if (!window.OrqTabs) {
    (async () => {
      await refrescarEstadoCaja({ reRender: false });
      const { caja, fecha, turno } = getCtx();
      if (caja && fecha) {
        try {
          const r = await fetch(`/pedidosya_cargadas?caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`);
          const j = await r.json();
          const arr = Array.isArray(j) ? j : (j.datos || j.items || []);
          transaccionesBD = (arr || []).map(t => ({
            id: t.id,
            transaccion: t.transaccion,
            monto: (typeof t.monto === "number" ? t.monto : parseMoneda(t.monto)),
            fecha: t.fecha,
            turno: t.turno,
            caja,
            origen: "bd"
          }));
        } catch { transaccionesBD = []; }
      }
      renderizarTabla();
    })();

    selCaja?.addEventListener("change", () => refrescarEstadoCaja({ reRender: true }));
    selFecha?.addEventListener("change", () => refrescarEstadoCaja({ reRender: true }));
    selTurno?.addEventListener("change", () => refrescarEstadoCaja({ reRender: true }));
  }
});

// ===== alerta flotante reutilizable =====
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
