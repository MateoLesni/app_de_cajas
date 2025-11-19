// static/js/mercadopago.js
document.addEventListener("DOMContentLoaded", function () {
  // ---------- Refs ----------
  const form              = document.getElementById("mercadoPagoForm");
  const esTipCheckbox     = document.getElementById("esTip");
  const grupoComprobante  = document.getElementById("grupoComprobante");
  const comprobanteInput  = document.getElementById("mpComprobante");
  const importeInput      = document.getElementById("mpImporte");
  const cajaSelect        = document.getElementById("cajaSelect");
  const turnoSelect       = document.getElementById("turnoSelect");
  const fechaGlobal       = document.getElementById("fechaGlobal");
  const tablaPreview      = document.getElementById("tablaPreviewMercadoPago");
  const btnGuardar        = document.getElementById("btnGuardarMercadoPago");

  // UI Terminales
  const btnMostrarCrear   = document.getElementById("btnMostrarCrearTerminal");
  const divCrearTerminal  = document.getElementById("formCrearTerminal");
  const nuevoTerminalInput= document.getElementById("nuevoTerminal");
  const btnOkCrear        = document.getElementById("btnOkCrearTerminal");
  const btnCancelarCrear  = document.getElementById("btnCancelarCrearTerminal");
  const grupoTerminalAct  = document.getElementById("grupoTerminalActivo");
  const terminalSelect    = document.getElementById("terminalActivo");
  const terminalActivaTxt = document.getElementById("terminalActivaTexto");

  // ---------- Estado / Permisos ----------
  window.cajaCerrada = window.cajaCerrada ?? false;
  const ROLE = parseInt(window.ROLE_LEVEL || 1, 10);
  let localCerrado = false;
  let localAuditado = false;

  function canActUI(){
    // Si el local está auditado, NADIE puede editar
    if (localAuditado) return false;
    if (ROLE >= 3) return true;          // Auditor
    if (ROLE >= 2) return !localCerrado; // Encargado/Adm: local debe estar abierto
    return !window.cajaCerrada;          // Cajero: caja abierta
  }

  // Datos en memoria
  let registrosBD = [];                         // [{id, tipo, terminal, comprobante, importe, fecha}]
  const registrosNuevosPorCaja = {};            // { caja: [ {tipo, terminal, comprobante, importe, fecha, caja} ] }
  const terminalesPorCaja = {};                 // { caja: Set([...]) }
  let idxEdicionActual = -1;

  // ---------- Estilos de tabla (centrado) ----------
  (function ensureStyle(){
    const id = "mp-style";
    if (document.getElementById(id)) return;
    const st = document.createElement("style");
    st.id = id;
    st.textContent = `
      #tablaPreviewMercadoPago th, #tablaPreviewMercadoPago td {
        text-align: center; vertical-align: middle;
      }
    `;
    document.head.appendChild(st);
  })();

  // ---------- Helpers ----------
  function getLocalActual() {
    // Para auditores (nivel 3): lee de #localSelect, fallback a #userLocal
    const localSelect = document.getElementById("localSelect");
    if (localSelect) {
      const val = (localSelect.value || "").trim();
      return val || (document.getElementById("userLocal")?.innerText || "").trim();
    }
    return (document.getElementById("userLocal")?.innerText || "").trim();
  }
  function getCtx() {
    return {
      local: getLocalActual(),
      caja:  cajaSelect?.value || "",
      fecha: fechaGlobal?.value || "",
      turno: turnoSelect?.value || "UNI"
    };
  }

  // Parse robusto: acepta "1.234,56" / "1234.56" / "1,234.56" / "1234"
  function parseMoneda(valor) {
    if (valor == null) return 0;
    let s = String(valor).trim().replace(/\s/g, "");
    // Dejar solo dígitos, puntos y comas
    s = s.replace(/[^\d.,-]/g, "");
    // Detectar último separador como decimal, el resto como miles
    const lastComma = s.lastIndexOf(",");
    const lastDot   = s.lastIndexOf(".");
    const lastSep   = Math.max(lastComma, lastDot);
    let intPart = s, frac = "";
    if (lastSep >= 0) {
      intPart = s.slice(0, lastSep).replace(/[.,]/g, "");
      frac    = s.slice(lastSep + 1).replace(/[.,]/g, "");
    } else {
      intPart = s.replace(/[.,]/g, "");
    }
    const rebuilt = frac ? `${intPart}.${frac}` : intPart;
    const n = parseFloat(rebuilt);
    return isFinite(n) ? n : 0;
  }

  function formatMoneda(valor) {
    return Number(valor || 0).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatearFecha(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth()+1).padStart(2, "0");
    const yy = d.getUTCFullYear();
    return `${dd}/${mm}/${yy}`;
  }

  // ---------- Estado caja/local ----------
  async function refrescarEstadoCaja({ reRender = true } = {}) {
    const { local, caja, fecha, turno } = getCtx();
    if (!caja || !fecha || !turno) {
      window.cajaCerrada = false;
      localCerrado = false;
      localAuditado = false;
      toggleUIByEstado();
      if (reRender) renderTabla();
      return;
    }
    try {
      const [rc, rl, ra] = await Promise.all([
        fetch(`/estado_caja?local=${encodeURIComponent(local)}&caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`),
        fetch(`/estado_local?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`),
        fetch(`/api/estado_auditoria?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}`)
      ]);
      const dc = await rc.json();
      const dl = await rl.json().catch(() => ({ estado: 1 }));
      const da = await ra.json().catch(() => ({ success: false, auditado: false }));
      window.cajaCerrada = ((dc.estado ?? 1) === 0);
      localCerrado       = ((dl.estado ?? 1) === 0);
      localAuditado      = (da.success && da.auditado) || false;
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
    [esTipCheckbox, comprobanteInput, importeInput, terminalSelect, btnGuardar]
      .forEach(el => { if (el) el.disabled = disabled; });
    [btnMostrarCrear, btnOkCrear, btnCancelarCrear, nuevoTerminalInput]
      .forEach(el => { if (el) el.disabled = disabled; });
  }

  document.getElementById('btnCerrarCaja')?.addEventListener('click', () => {
    setTimeout(() => { refrescarEstadoCaja({ reRender: true }); }, 800);
  });

  // ---------- UX: Comprobante visible solo si NO es TIP ----------
  function updateComprobanteVisibility() {
    if (!grupoComprobante) return;
    const isTip = !!esTipCheckbox?.checked;
    grupoComprobante.style.display = isTip ? "none" : "block";
    if (isTip && comprobanteInput) comprobanteInput.value = "";
  }
  esTipCheckbox?.addEventListener("change", updateComprobanteVisibility);
  updateComprobanteVisibility();

  // ---------- Hygiene de Importe ----------
  importeInput?.addEventListener("input", function () {
    // Dejar solo dígitos y un único separador decimal
    this.value = this.value.replace(/[^0-9.,-]/g, '').replace(/(,|\.){2,}/g, '$1');
  });

  // ---------- Crear terminal ----------
  btnMostrarCrear?.addEventListener("click", () => {
    if (!canActUI()) { mostrarAlerta("Sin permisos para crear terminal (caja/local cerrados para tu rol)."); return; }
    if (divCrearTerminal) divCrearTerminal.style.display = "block";
    nuevoTerminalInput?.focus();
  });
  btnCancelarCrear?.addEventListener("click", () => {
    if (nuevoTerminalInput) nuevoTerminalInput.value = "";
    if (divCrearTerminal) divCrearTerminal.style.display = "none";
  });
  btnOkCrear?.addEventListener("click", () => {
    if (!canActUI()) { mostrarAlerta("Sin permisos para crear terminal."); return; }
    const terminal = (nuevoTerminalInput?.value || "").trim();
    const caja = cajaSelect?.value || "";
    if (!terminal || !caja) return;

    (terminalesPorCaja[caja] ||= new Set());
    if (!terminalesPorCaja[caja].has(terminal)) {
      terminalesPorCaja[caja].add(terminal);

      const opt = document.createElement("option");
      opt.value = terminal; opt.textContent = terminal;
      terminalSelect?.appendChild(opt);

      if ((terminalesPorCaja[caja].size || 0) > 1) grupoTerminalAct.style.display = "block";
      if (terminalSelect) terminalSelect.value = terminal;
      if (terminalActivaTxt) terminalActivaTxt.textContent = `Terminal activa: ${terminal}`;
    }
    if (nuevoTerminalInput) nuevoTerminalInput.value = "";
    if (divCrearTerminal) divCrearTerminal.style.display = "none";
  });

  terminalSelect?.addEventListener("change", () => {
    const t = terminalSelect.value;
    if (terminalActivaTxt) terminalActivaTxt.textContent = t ? `Terminal activa: ${t}` : "";
  });

  // ---------- Alta / edición local ----------
  form?.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!canActUI()) { mostrarAlerta("No podés añadir (caja/local cerrados para tu rol)."); return; }

    const { caja, fecha } = getCtx();
    const terminal = (terminalActivaTxt?.textContent || "").replace("Terminal activa: ", "").trim();

    if (!caja) { mostrarAlerta("Seleccioná una caja."); return; }
    if (!fecha) { mostrarAlerta("Seleccioná una fecha válida."); return; }
    if (!terminal || !terminalesPorCaja[caja] || !terminalesPorCaja[caja].has(terminal)) {
      mostrarAlerta("Debe crear y seleccionar una terminal antes de añadir.");
      return;
    }

    const tipo = esTipCheckbox?.checked ? "TIP" : "NORMAL";
    const comprobante = (comprobanteInput?.value || "").trim();
    const importe = parseMoneda(importeInput?.value);

    if (!importe || isNaN(importe)) { mostrarAlerta("Debe ingresar un importe."); return; }
    if (tipo !== "TIP" && !comprobante) { mostrarAlerta("Debe ingresar un comprobante."); return; }

    const nuevo = { tipo, terminal, comprobante: (tipo === "TIP" ? "" : comprobante), importe, fecha, caja };
    (registrosNuevosPorCaja[caja] ||= []);

    if (idxEdicionActual === -1) {
      registrosNuevosPorCaja[caja].push(nuevo);
    } else {
      registrosNuevosPorCaja[caja][idxEdicionActual] = nuevo;
      idxEdicionActual = -1;
    }

    form.reset();
    if (esTipCheckbox) esTipCheckbox.checked = false;
    updateComprobanteVisibility();
    renderTabla();
  });

  // ---------- Render ----------
  function opcionesTerminalSelectHTML(caja, actual) {
    const set = terminalesPorCaja[caja] || new Set();
    let html = "";
    Array.from(set).forEach(t => {
      const sel = (t === actual) ? ' selected' : '';
      html += `<option value="${t}"${sel}>${t}</option>`;
    });
    return html;
  }

  function renderTabla() {
    if (!tablaPreview) return;
    tablaPreview.innerHTML = "";
    const { caja } = getCtx();
    const bloqueada = !canActUI();

    // Registros BD (verde)
    registrosBD.forEach(r => {
      const tr = document.createElement("tr");
      tr.style.backgroundColor = "#d4edda";

      const acciones = bloqueada ? "" : `
        <button class="btn-aceptar-bd" data-id="${r.id}" style="display:none;">✅</button>
        <button class="btn-cancelar-bd" data-id="${r.id}" style="display:none;">❌</button>
        <button class="btn-editar-bd" data-id="${r.id}" title="Editar">✏️</button>
        <button class="btn-borrar-bd" data-id="${r.id}" title="Borrar">🗑️</button>
      `;

      tr.innerHTML = `
        <td>${formatearFecha(r.fecha)}</td>

        <td>
          <span class="text-tipo" data-id="${r.id}">${r.tipo}</span>
          <select class="edit-tipo-bd" data-id="${r.id}" style="display:none;">
            <option value="NORMAL"${r.tipo === 'NORMAL' ? ' selected' : ''}>NORMAL</option>
            <option value="TIP"${r.tipo === 'TIP' ? ' selected' : ''}>TIP</option>
          </select>
        </td>

        <td>
          <span class="text-terminal" data-id="${r.id}">${r.terminal || '-'}</span>
          <select class="edit-terminal-bd" data-id="${r.id}" style="display:none;">
            ${opcionesTerminalSelectHTML(caja, r.terminal)}
          </select>
        </td>

        <td>
          <span class="text-comprobante" data-id="${r.id}">${r.comprobante || '-'}</span>
          <input class="edit-comprobante-bd" data-id="${r.id}" type="text" value="${r.comprobante || ''}" style="display:none; width:120px;">
        </td>

        <td>
          <span class="text-importe" data-id="${r.id}">$${formatMoneda(r.importe)}</span>
          <input class="edit-importe-bd" data-id="${r.id}" type="text" value="${formatMoneda(r.importe)}" style="display:none; width:110px;">
        </td>

        <td>${acciones}</td>
      `;
      tablaPreview.appendChild(tr);
    });

    // Nuevos (memoria)
    const nuevos = registrosNuevosPorCaja[caja] || [];
    nuevos.forEach((r, idx) => {
      const tr = document.createElement("tr");
      const acciones = bloqueada ? "" : `
        <button class="btn-edit-new" data-idx="${idx}" title="Editar">✏️</button>
        <button class="btn-del-new" data-idx="${idx}" title="Eliminar">🗑️</button>
      `;
      tr.innerHTML = `
        <td>${formatearFecha(r.fecha)}</td>
        <td>${r.tipo}</td>
        <td>${r.terminal || '-'}</td>
        <td>${r.comprobante || '-'}</td>
        <td>$${formatMoneda(r.importe)}</td>
        <td>${acciones}</td>
      `;
      tablaPreview.appendChild(tr);
    });
  }

  // ---------- Delegación en la tabla ----------
  tablaPreview?.addEventListener("click", async (e) => {
    const { caja } = getCtx();

    if (!canActUI() && e.target.closest("button")) {
      mostrarAlerta("No podés editar/borrar (caja/local cerrados para tu rol).");
      return;
    }

    // Editar nuevo (memoria)
    if (e.target.classList.contains("btn-edit-new")) {
      const i = parseInt(e.target.dataset.idx);
      const r = (registrosNuevosPorCaja[caja] || [])[i];
      if (!r) return;
      esTipCheckbox.checked = (r.tipo === "TIP");
      updateComprobanteVisibility();
      if (comprobanteInput) comprobanteInput.value = r.comprobante || "";
      if (importeInput)     importeInput.value     = formatMoneda(r.importe);

      if (terminalesPorCaja[caja] && terminalesPorCaja[caja].has(r.terminal)) {
        if (terminalSelect) terminalSelect.value = r.terminal;
        if (terminalActivaTxt) terminalActivaTxt.textContent = `Terminal activa: ${r.terminal}`;
      }
      idxEdicionActual = i;
      return;
    }
    if (e.target.classList.contains("btn-del-new")) {
      const i = parseInt(e.target.dataset.idx);
      (registrosNuevosPorCaja[caja] ||= []).splice(i, 1);
      renderTabla();
      return;
    }

    // Editar BD: activar modo
    if (e.target.classList.contains("btn-editar-bd")) {
      const id = e.target.dataset.id;
      toggleRowEditMode(id, true);
      return;
    }
    // Cancelar edición BD
    if (e.target.classList.contains("btn-cancelar-bd")) {
      const id = e.target.dataset.id;
      toggleRowEditMode(id, false);
      return;
    }
    // Aceptar edición BD -> PUT /mercadopago/:id
    if (e.target.classList.contains("btn-aceptar-bd")) {
      const id = e.target.dataset.id;
      const tipo        = tablaPreview.querySelector(`.edit-tipo-bd[data-id="${id}"]`)?.value || "NORMAL";
      const terminal    = tablaPreview.querySelector(`.edit-terminal-bd[data-id="${id}"]`)?.value || "";
      const comp        = tablaPreview.querySelector(`.edit-comprobante-bd[data-id="${id}"]`)?.value || "";
      const impTxt      = tablaPreview.querySelector(`.edit-importe-bd[data-id="${id}"]`)?.value || "0";
      const importe     = parseMoneda(impTxt);

      try {
        const r = await fetch(`/mercadopago/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo,
            terminal,
            comprobante: (tipo === "TIP" ? "" : comp),
            importe
          })
        });
        if (!r.ok) {
          const txt = await r.text();
          if (r.status === 409) mostrarAlerta("No tenés permisos para actualizar.");
          else mostrarAlerta("Error al actualizar: " + (txt || r.status));
          return;
        }
        const data = await r.json();
        if (data.success) {
          await refrescarEstadoCaja({ reRender: false });
          if (window.OrqTabs) OrqTabs.reload('mercadopago'); else legacyReload();
        } else {
          mostrarAlerta("❌ " + (data.msg || "No se pudo actualizar"));
        }
      } catch {
        mostrarAlerta("❌ Error de red al actualizar");
      }
      return;
    }

    // Borrar BD
    if (e.target.classList.contains("btn-borrar-bd")) {
      const id = e.target.dataset.id;
      if (!confirm("¿Eliminar este registro de Mercado Pago?")) return;
      try {
        const r = await fetch(`/mercadopago/${id}`, { method: "DELETE" });
        if (!r.ok) {
          const txt = await r.text();
          if (r.status === 409) mostrarAlerta("No tenés permisos para borrar.");
          else mostrarAlerta("Error al borrar: " + (txt || r.status));
          return;
        }
        const data = await r.json();
        if (data.success) {
          await refrescarEstadoCaja({ reRender: false });
          if (window.OrqTabs) OrqTabs.reload('mercadopago'); else legacyReload();
        } else {
          mostrarAlerta("❌ " + (data.msg || "No se pudo borrar"));
        }
      } catch {
        mostrarAlerta("❌ Error de red al borrar");
      }
      return;
    }
  });

  function toggleRowEditMode(id, editing) {
    const show = (sel) => { const el = tablaPreview.querySelector(sel); if (el) el.style.display = "inline-block"; };
    const hide = (sel) => { const el = tablaPreview.querySelector(sel); if (el) el.style.display = "none"; };
    const span = (cls) => tablaPreview.querySelector(`.${cls}[data-id="${id}"]`);
    const inp  = (cls) => tablaPreview.querySelector(`.${cls}[data-id="${id}"]`);

    const textTipo   = span("text-tipo");
    const editTipo   = inp("edit-tipo-bd");
    const textTerm   = span("text-terminal");
    const editTerm   = inp("edit-terminal-bd");
    const textComp   = span("text-comprobante");
    const editComp   = inp("edit-comprobante-bd");
    const textImp    = span("text-importe");
    const editImp    = inp("edit-importe-bd");

    if (textTipo) textTipo.style.display = editing ? "none" : "inline";
    if (textTerm) textTerm.style.display = editing ? "none" : "inline";
    if (textComp) textComp.style.display = editing ? "none" : "inline";
    if (textImp)  textImp.style.display  = editing ? "none" : "inline";

    if (editTipo) editTipo.style.display = editing ? "inline-block" : "none";
    if (editTerm) editTerm.style.display = editing ? "inline-block" : "none";
    if (editComp) editComp.style.display = editing ? "inline-block" : "none";
    if (editImp)  editImp.style.display  = editing ? "inline-block" : "none";

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

  // ---------- Guardar lote ----------
  btnGuardar?.addEventListener("click", async function () {
    if (!canActUI()) { mostrarAlerta("No podés guardar (caja/local cerrados para tu rol)."); return; }
    const { caja, fecha, turno } = getCtx();
    if (!fecha) { mostrarAlerta("Debe seleccionar una fecha válida para guardar."); return; }

    const nuevos = registrosNuevosPorCaja[caja] || [];
    if (nuevos.length === 0) { mostrarAlerta("No hay registros nuevos para guardar."); return; }

    try {
      const res = await fetch("/guardar_mercadopago_lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caja, fecha, turno, registros: nuevos })
      });
      if (!res.ok) {
        const txt = await res.text();
        mostrarAlerta("❌ Error al guardar: " + (txt || res.status));
        return;
      }
      const result = await res.json();
      if (result.success) {
        registrosNuevosPorCaja[caja] = [];
        await refrescarEstadoCaja({ reRender: false });
        if (window.OrqTabs) OrqTabs.reload('mercadopago'); else legacyReload();
        mostrarAlerta("✅ Registros guardados correctamente.");
      } else {
        mostrarAlerta("❌ Error: " + (result.msg || "No se pudo guardar"));
      }
    } catch (error) {
      mostrarAlerta("❌ Error de red al guardar");
    }
  });

  // ===================== Render que llama el Orquestador =====================
  window.renderMercadoPago = function (_data, opts = {}) {
    const { caja } = getCtx();

    const map = opts.datasets || {};
    const ep = Object.keys(map).find(k => k.includes('mercadopago_cargadas'));
    const arr = ep
      ? (Array.isArray(map[ep]) ? map[ep] : (map[ep]?.items || map[ep]?.datos || []))
      : [];

    // Normalizamos registrosBD
    registrosBD = (arr || []).map(r => ({
      id: r.id,
      tipo: r.tipo || (r.es_tip ? "TIP" : "NORMAL"),
      terminal: r.terminal || "",
      comprobante: r.comprobante || "",
      importe: (typeof r.importe === "number" ? r.importe : parseMoneda(r.importe)),
      fecha: r.fecha
    }));

    // Re-construimos terminales de la caja con BD
    (terminalesPorCaja[caja] ||= new Set());
    const prevSet = new Set(terminalesPorCaja[caja]);
    terminalesPorCaja[caja] = new Set(prevSet);
    registrosBD.forEach(r => { if (r.terminal) terminalesPorCaja[caja].add(r.terminal); });

    // Poblar select terminal
    terminalSelect.innerHTML = "";
    if ((terminalesPorCaja[caja].size || 0) > 0) {
      Array.from(terminalesPorCaja[caja]).forEach(t => {
        const opt = document.createElement("option");
        opt.value = t; opt.textContent = t;
        terminalSelect.appendChild(opt);
      });
      grupoTerminalAct.style.display = terminalesPorCaja[caja].size > 1 ? "block" : "none";
      const first = terminalSelect.options[0]?.value || "";
      if (terminalSelect) terminalSelect.value = first;
      if (terminalActivaTxt) terminalActivaTxt.textContent = first ? `Terminal activa: ${first}` : "";
    } else {
      grupoTerminalAct.style.display = "none";
      if (terminalActivaTxt) terminalActivaTxt.textContent = "";
    }

    refrescarEstadoCaja({ reRender: false }).finally(() => {
      renderTabla();
    });
  };

  // ===================== Fallback sin orquestador =====================
  async function legacyReload() {
    const { caja, fecha, turno } = getCtx();
    if (!caja || !fecha) return;
    try {
      const res = await fetch(`/mercadopago_cargadas?caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`);
      const result = await res.json();
      const arr = Array.isArray(result) ? result : (result?.datos || result?.items || []);
      registrosBD = (arr || []).map(r => ({
        id: r.id,
        tipo: r.tipo || (r.es_tip ? "TIP" : "NORMAL"),
        terminal: r.terminal || "",
        comprobante: r.comprobante || "",
        importe: (typeof r.importe === "number" ? r.importe : parseMoneda(r.importe)),
        fecha: r.fecha
      }));
      // reconstruir terminales
      (terminalesPorCaja[caja] ||= new Set());
      registrosBD.forEach(r => { if (r.terminal) terminalesPorCaja[caja].add(r.terminal); });

      // select terminal
      terminalSelect.innerHTML = "";
      Array.from(terminalesPorCaja[caja]).forEach(t => {
        const opt = document.createElement("option");
        opt.value = t; opt.textContent = t;
        terminalSelect.appendChild(opt);
      });
      grupoTerminalAct.style.display = terminalesPorCaja[caja].size > 1 ? "block" : "none";
      const first = terminalSelect.options[0]?.value || "";
      if (terminalSelect) terminalSelect.value = first;
      if (terminalActivaTxt) terminalActivaTxt.textContent = first ? `Terminal activa: ${first}` : "";

      renderTabla();
    } catch (e) {
      registrosBD = [];
      renderTabla();
    }
  }

  // ===================== Init =====================
  (async () => {
    await refrescarEstadoCaja({ reRender: false });
    if (!window.OrqTabs) legacyReload();
  })();

  if (!window.OrqTabs) {
    cajaSelect?.addEventListener("change", async () => { idxEdicionActual = -1; await refrescarEstadoCaja({ reRender: false }); legacyReload(); });
    fechaGlobal?.addEventListener("change", async () => { idxEdicionActual = -1; await refrescarEstadoCaja({ reRender: false }); legacyReload(); });
    turnoSelect?.addEventListener("change", async () => { idxEdicionActual = -1; await refrescarEstadoCaja({ reRender: false }); legacyReload(); });
  }
});

// ALERTA FLOTANTE (reuse)
function mostrarAlerta(mensaje, duracion = 3000) {
  const alerta = document.getElementById("alertaFlotante");
  if (!alerta) { alert(mensaje); return; }
  alerta.textContent = mensaje;
  alerta.style.display = "block";
  alerta.classList.add("show");
  setTimeout(() => {
    alerta.classList.remove("show");
    setTimeout(() => { alerta.style.display = "none"; }, 250);
  }, duracion);
}
