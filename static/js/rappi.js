// ==== Rappi: permisos L1/L2/L3, importes robustos y tabla centrada ====
// OrqTabs: tabs: { rappiTab: { endpoints: ['/rappi_cargadas'], render: window.renderRappi } }

document.addEventListener("DOMContentLoaded", function () {
  // ------- refs principales -------
  const pane         = document.getElementById("rappiTab");
  const tablaPreview = document.getElementById("tablaPreviewRappi");
  const form         = document.getElementById("rappiForm");
  const cajaSelect   = document.getElementById("cajaSelect");
  const fechaGlobal  = document.getElementById("fechaGlobal");
  const turnoSelect  = document.getElementById("turnoSelect");
  const respuestaDiv = document.getElementById("respuestaRappi");

  const inputTransaccion = document.getElementById("transaccionRappi");
  const inputMonto       = document.getElementById("montoRappi");

  // ------- estado / permisos -------
  window.cajaCerrada = window.cajaCerrada ?? false;
  const ROLE = parseInt(window.ROLE_LEVEL || 1, 10);
  let localCerrado = false;

  function canActUI(){
    if (ROLE >= 3) return true;          // auditor
    if (ROLE >= 2) return !localCerrado; // encargado/adm
    return !window.cajaCerrada;          // cajero
  }

  // ------- buffers -------
  let transaccionesBD = [];     // vienen del backend (vía OrqTabs o fallback)
  let transaccionesNuevas = []; // memoria local antes de guardar
  let idxEdicionActual = -1;

  // ------- estilos (centrado + overlay) -------
  (function ensureStyle() {
    if (document.getElementById("rappi-style")) return;
    const st = document.createElement("style");
    st.id = "rappi-style";
    st.textContent = `
      #rappiTab table th, #rappiTab table td { text-align: center; vertical-align: middle; }
      #rappiTab { position: relative; }
      #rappiTab .mod-overlay {
        position:absolute; inset:0; display:none; align-items:center; justify-content:center;
        background: rgba(255,255,255,.6); backdrop-filter: blur(1px); z-index: 5; pointer-events: auto;
      }
      #rappiTab .mod-spinner {
        padding:10px 14px; border-radius:8px; background:#fff; box-shadow:0 2px 10px rgba(0,0,0,.12); font-weight:600;
      }
      #rappiTab .btn-submit[disabled],
      #rappiTab .btn-custom[disabled] { opacity:.45; cursor:not-allowed; }
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

  // ------- helpers -------
  const getLocalActual = () => (document.getElementById("userLocal")?.innerText || "").trim();
  const getCtx = () => ({
    local: getLocalActual(),
    caja:  cajaSelect?.value || "",
    fecha: fechaGlobal?.value || "",
    turno: (turnoSelect?.value || "").trim() || "UNI"
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

  function formatMoneda(n) {
    return Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatearFechaISO(fechaISO) {
    if (!fechaISO) return "";
    const d = new Date(fechaISO);
    const dd = String(d.getUTCDate()).padStart(2,'0');
    const mm = String(d.getUTCMonth()+1).padStart(2,'0');
    const yy = d.getUTCFullYear();
    return `${dd}/${mm}/${yy}`;
  }

  inputMonto?.addEventListener("input", function () {
    // higiene de input: un solo separador decimal
    this.value = this.value.replace(/[^0-9.,-]/g, '').replace(/(,|\.){2,}/g, '$1');
  });

  // ------- estado caja/local -------
  async function refrescarEstadoCaja({ reRender = true } = {}) {
    const { local, caja, fecha, turno } = getCtx();
    if (!caja || !fecha || !turno) {
      window.cajaCerrada = false;
      localCerrado = false;
      toggleUIByEstado();
      if (reRender) renderizarTabla();
      return;
    }
    try {
      const [rCaja, rLocal] = await Promise.all([
        fetch(`/estado_caja?local=${encodeURIComponent(local)}&caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`)
          .then(r => r.ok ? r.json() : { estado: 1 }),
        fetch(`/estado_local?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`)
          .then(r => r.ok ? r.json() : { estado: 1 })
      ]);
      window.cajaCerrada = ((rCaja.estado ?? 1) === 0);
      localCerrado = ((rLocal.estado ?? 1) === 0);
    } catch {
      window.cajaCerrada = false;
      localCerrado = false;
    }
    toggleUIByEstado();
    if (reRender) renderizarTabla();
  }

  function toggleUIByEstado() {
    const disabled = !canActUI();
    const btnAnadir     = document.getElementById("btnAnadirRappi");
    const btnActualizar = document.getElementById("btnActualizarRappi");
    const btnGuardar    = document.getElementById("guardarRappiBD");

    [btnAnadir, btnActualizar, btnGuardar, inputTransaccion, inputMonto]
      .forEach(el => { if (el) el.disabled = disabled; });

    renderizarTabla(); // oculta/mostrar acciones según permisos
  }

  document.getElementById('btnCerrarCaja')?.addEventListener('click', () => {
    setTimeout(() => { refrescarEstadoCaja({ reRender: true }); }, 800);
  });

  // ------- render tabla -------
  function renderizarTabla() {
    if (!tablaPreview) return;
    tablaPreview.innerHTML = "";
    const bloqueada = !canActUI();
    const todas = [...transaccionesBD, ...transaccionesNuevas];

    todas.forEach((t) => {
      const tr = document.createElement("tr");
      if (t.origen === "bd") tr.style.backgroundColor = "#d4edda";

      let acciones = "";
      if (t.origen === "local") {
        const idxLocal = transaccionesNuevas.indexOf(t);
        acciones = bloqueada ? "" : `
          <button class="btn-edit-new" data-idx-local="${idxLocal}" title="Editar">✏️</button>
          <button class="btn-del-new"  data-idx-local="${idxLocal}" title="Eliminar">🗑️</button>
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
        <td>${formatearFechaISO(t.fecha)}</td>
        <td>
          <span class="text-transaccion" data-id="${t.id ?? ''}">${t.transaccion}</span>
          <input class="edit-transaccion-bd" data-id="${t.id ?? ''}" type="text" value="${t.transaccion || ''}" style="display:none; width:140px;">
        </td>
        <td>
          <span class="text-monto" data-id="${t.id ?? ''}">$${formatMoneda(t.monto)}</span>
          <input class="edit-monto-bd" data-id="${t.id ?? ''}" type="text" value="${formatMoneda(t.monto)}" style="display:none; width:110px;">
        </td>
        <td>${acciones}</td>
      `;
      tablaPreview.appendChild(tr);
    });
  }

  // ------- delegación de eventos -------
  pane?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");

    // bloqueo global por permisos
    if (btn && !canActUI()) {
      const classes = btn.className || "";
      if (classes.includes("btn-") || ["btnAnadirRappi","btnActualizarRappi","guardarRappiBD"].includes(btn.id)) {
        mostrarAlerta("No tenés permisos para esta acción (caja/local cerrados para tu rol).");
        return;
      }
    }

    // Añadir (memoria)
    if (e.target.id === "btnAnadirRappi" || btn?.id === "btnAnadirRappi") {
      const ctx = getCtx();
      const transaccion = (inputTransaccion?.value || "").trim();
      const monto       = parseMoneda(inputMonto?.value || "");

      if (!ctx.caja || !ctx.fecha || !ctx.turno) { mostrarAlerta("Elegí Caja / Fecha / Turno."); return; }
      if (!transaccion) { mostrarAlerta("Ingresá N° Comprobante."); return; }
      if (!(monto > 0)) { mostrarAlerta("Ingresá un Monto válido."); return; }

      const yaExiste = [...transaccionesBD, ...transaccionesNuevas].some(t =>
        t.transaccion === transaccion && t.fecha === ctx.fecha && t.caja === ctx.caja
      );
      if (yaExiste) { mostrarAlerta("Ese comprobante ya existe para la fecha/caja."); return; }

      transaccionesNuevas.push({ transaccion, monto, fecha: ctx.fecha, caja: ctx.caja, origen: "local" });
      renderizarTabla();
      form?.reset();
      idxEdicionActual = -1;
      return;
    }

    // Actualizar (memoria)
    if (e.target.id === "btnActualizarRappi" || btn?.id === "btnActualizarRappi") {
      if (idxEdicionActual < 0 || idxEdicionActual >= transaccionesNuevas.length) return;

      const ctx = getCtx();
      const transaccion = (inputTransaccion?.value || "").trim();
      const monto       = parseMoneda(inputMonto?.value || "");

      if (!transaccion) { mostrarAlerta("Ingresá N° Comprobante."); return; }
      if (!(monto > 0)) { mostrarAlerta("Ingresá un Monto válido."); return; }

      transaccionesNuevas[idxEdicionActual] = { transaccion, monto, fecha: ctx.fecha, caja: ctx.caja, origen: "local" };
      renderizarTabla();
      form?.reset();
      idxEdicionActual = -1;
      return;
    }

    // Guardar lote
    if (e.target.id === "guardarRappiBD" || btn?.id === "guardarRappiBD") {
      if (transaccionesNuevas.length === 0) { respuestaDiv.textContent = "No hay transacciones nuevas para guardar."; return; }
      const ctx = getCtx();
      if (!ctx.caja || !ctx.fecha || !ctx.turno) { mostrarAlerta("Elegí Caja / Fecha / Turno."); return; }

      try {
        setLoading(true);
        const response = await fetch("/guardar_rappi_lote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caja: ctx.caja, fecha: ctx.fecha, turno: ctx.turno,
            transacciones: transaccionesNuevas.map(t => ({ transaccion: t.transaccion, monto: Number(t.monto) }))
          }),
        });
        const result = await response.json();
        if (result.success) {
          respuestaDiv.textContent = "✅ Comprobantes guardados correctamente.";
          transaccionesNuevas = [];
          if (window.OrqTabs) OrqTabs.reload('rappiTab');
        } else {
          respuestaDiv.textContent = "❌ Error: " + (result.msg || "");
        }
      } catch (error) {
        respuestaDiv.textContent = "❌ Error: " + (error.message || "de red");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Tabla: editar/borrar locales
    if (e.target.classList.contains("btn-edit-new")) {
      const i = parseInt(e.target.dataset.idxLocal);
      const t = transaccionesNuevas[i];
      if (!t) return;
      if (inputTransaccion) inputTransaccion.value = t.transaccion;
      if (inputMonto)       inputMonto.value       = formatMoneda(t.monto);
      idxEdicionActual = i;
      return;
    }
    if (e.target.classList.contains("btn-del-new")) {
      const i = parseInt(e.target.dataset.idxLocal);
      if (i >= 0) transaccionesNuevas.splice(i, 1);
      renderizarTabla();
      return;
    }

    // Tabla BD: editar/cancelar/aceptar/borrar
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
        const r = await fetch(`/rappi/${id}`, {
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
          if (window.OrqTabs) OrqTabs.reload('rappiTab');
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
      if (!confirm("¿Eliminar este registro de Rappi?")) return;
      try {
        setLoading(true);
        const r = await fetch(`/rappi/${id}`, { method: "DELETE" });
        if (!r.ok) {
          const txt = await r.text();
          if (r.status === 409) mostrarAlerta("No tenés permisos para borrar.");
          else mostrarAlerta("Error al borrar: " + (txt || r.status));
          return;
        }
        const data = await r.json();
        if (data.success) {
          if (window.OrqTabs) OrqTabs.reload('rappiTab');
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

    const spanTrans = tablaPreview.querySelector(`.text-transaccion[data-id="${id}"]`);
    const inputTrans = tablaPreview.querySelector(`.edit-transaccion-bd[data-id="${id}"]`);
    const spanMonto  = tablaPreview.querySelector(`.text-monto[data-id="${id}"]`);
    const inputMonto = tablaPreview.querySelector(`.edit-monto-bd[data-id="${id}"]`);

    if (spanTrans) spanTrans.style.display = editing ? "none" : "inline";
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

  // ======== RENDERER que llama OrqTabs ========
  window.renderRappi = function (_main, opts = {}) {
    const map = opts.datasets || {};
    const epRappi = Object.keys(map).find(k => k.includes('/rappi_cargadas'));
    const payload = epRappi ? map[epRappi] : null;

    // Cargar BD
    transaccionesBD = [];
    if (payload && (payload.success || Array.isArray(payload))) {
      const ctx = getCtx();
      const arr = Array.isArray(payload) ? payload : (payload.datos || payload.items || []);
      transaccionesBD = (arr || []).map(t => ({
        id: t.id,
        transaccion: t.transaccion,
        monto: (typeof t.monto === "number" ? t.monto : parseMoneda(t.monto)),
        fecha: t.fecha,
        caja: ctx.caja,
        origen: "bd"
      }));
    }

    // Refrescar estado (caja/local) y render
    refrescarEstadoCaja({ reRender: false }).finally(renderizarTabla);
  };

  // ======== Fallback sin OrqTabs (opcional) ========
  if (!window.OrqTabs) {
    (async () => {
      await refrescarEstadoCaja({ reRender: false });
      const { caja, fecha, turno } = getCtx();
      if (caja && fecha) {
        try {
          const r = await fetch(`/rappi_cargadas?caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`);
          const j = await r.json();
          const arr = Array.isArray(j) ? j : (j.datos || j.items || []);
          transaccionesBD = (arr || []).map(t => ({
            id: t.id,
            transaccion: t.transaccion,
            monto: (typeof t.monto === "number" ? t.monto : parseMoneda(t.monto)),
            fecha: t.fecha,
            caja,
            origen: "bd"
          }));
        } catch { transaccionesBD = []; }
      }
      renderizarTabla();
    })();

    cajaSelect?.addEventListener("change", () => refrescarEstadoCaja({ reRender: true }));
    fechaGlobal?.addEventListener("change", () => refrescarEstadoCaja({ reRender: true }));
    turnoSelect?.addEventListener("change", () => refrescarEstadoCaja({ reRender: true }));
  }
});

// ALERTA FLOTANTE (reutilizable)
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
