// tarjetas.js — integrado con OrqTabs: render controlado por el orquestador (con TURNO)
"use strict";

document.addEventListener("DOMContentLoaded", function () {
  // ---------- Referencias DOM ----------
  const tarjetasTab             = document.getElementById("tarjetas");
  const tarjetaForm             = document.getElementById("tarjetasForm");
  const tarjetaPreview          = document.getElementById("tablaPreviewTarjetas");
  const btnGuardarTarjetas      = document.getElementById("btnGuardarTarjetas");
  const btnAgregarLote          = document.getElementById("btnAgregarLote");
  const inputNuevoLote          = document.getElementById("nuevoLote");
  const selectLote              = document.getElementById("selectLote");
  const cajaSelect              = document.getElementById("cajaSelect");
  const turnoSelect             = document.getElementById("turnoSelect");
  const tarjetaInfoLote         = document.getElementById("infoLoteActivo");
  const labelTarjetasCargadas   = document.getElementById("labelTarjetasCargadas");
  const totalTarjetasPrevias    = document.getElementById("totalCargadasHoy");
  const totalTarjetasNuevas     = document.getElementById("totalNuevas");
  const fechaGlobalInput        = document.getElementById("fechaGlobal");

  // === NUEVO: Rol y flags de estado
  const ROLE = parseInt(window.ROLE_LEVEL || 1, 10);
  window.cajaCerrada = window.cajaCerrada ?? false;
  let localCerrado = false;

  // ---------- Inyección de TERMINAL ----------
  const primerFormGroup = tarjetasTab?.querySelector(".form-group");
  const IDS = {
    grupoCrear: "grupoCrearTerminalTarj",
    btnMostrarCrear: "btnMostrarCrearTerminalTarj",
    formCrear: "formCrearTerminalTarj",
    inputNuevo: "nuevoTerminalTarj",
    btnOkCrear: "btnOkCrearTerminalTarj",
    btnCancelCrear: "btnCancelarCrearTerminalTarj",
    grupoActivo: "grupoTerminalActivoTarj",
    selectActivo: "terminalActivoTarj",
    textoActivo: "terminalActivaTextoTarj",
  };
  if (tarjetasTab && primerFormGroup && !document.getElementById(IDS.selectActivo)) {
    primerFormGroup.insertAdjacentHTML("beforebegin", `
      <div class="form-group" id="${IDS.grupoCrear}">
        <button type="button" class="btn-submit" id="${IDS.btnMostrarCrear}">➕ Crear terminal</button>
        <div id="${IDS.formCrear}" style="display:none; margin-top: 10px;">
          <input type="text" id="${IDS.inputNuevo}" class="form-control" placeholder="Nombre de la terminal" style="margin-bottom: 10px;">
          <button type="button" class="btn-custom btn-save" id="${IDS.btnOkCrear}">✅ Ok</button>
          <button type="button" class="btn-submit" id="${IDS.btnCancelCrear}">❌ Cancelar</button>
        </div>
      </div>
      <div class="form-group" id="${IDS.grupoActivo}" style="display:none;">
        <label for="${IDS.selectActivo}">Terminal activa:</label>
        <select id="${IDS.selectActivo}" class="form-control"></select>
      </div>
      <p id="${IDS.textoActivo}" style="font-weight: bold; margin-bottom: 20px;"></p>
    `);
  }

  // ---------- Referencias de Terminal ----------
  let btnMostrarCrearTerminal = document.getElementById(IDS.btnMostrarCrear);
  let formCrearTerminal       = document.getElementById(IDS.formCrear);
  let inputNuevoTerminal      = document.getElementById(IDS.inputNuevo);
  let btnOkCrearTerminal      = document.getElementById(IDS.btnOkCrear);
  let btnCancelarCrearTerminal= document.getElementById(IDS.btnCancelCrear);
  let grupoTerminalActivo     = document.getElementById(IDS.grupoActivo);
  let selectTerminalActivo    = document.getElementById(IDS.selectActivo);
  let terminalActivaTexto     = document.getElementById(IDS.textoActivo);

  // ---------- Estructuras de datos ----------
  const tarjetasPorCaja = {};
  const tarjetasCargadasHoyPorCaja = {};
  const tipsPorCaja = {};
  const tipsCargadosPorCaja = {};

  const terminalesPorCaja = {};
  const terminalActivoPorCaja = {};
  const lotesPorCajaTerminal = {};
  const loteActivoPorCajaTerminal = {};

  let terminalActivo = null;
  let loteActivo = null;

  // ---------- Helpers ----------
  function getLocalActual() {
    return (document.getElementById("userLocal")?.innerText || "").trim();
  }
  function getCtx() {
    return {
      local: getLocalActual(),
      caja:  cajaSelect?.value || "",
      fecha: fechaGlobalInput?.value || "",
      turno: (turnoSelect?.value || "UNI")
    };
  }
  function fmt(n) {
    const v = parseFloat(n ?? 0);
    return `$${(isNaN(v) ? 0 : v).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
  }
  function parseMonto(texto) {
    if (texto == null) return 0;
    let s = String(texto).trim();
    if (!s) return 0;
    s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // === NUEVO: centraliza si el usuario puede actuar en UI
  function canActUI() {
    if (ROLE >= 3) return true;          // auditor: siempre
    if (ROLE >= 2) return !localCerrado; // encargado: mientras el local NO esté cerrado
    return !window.cajaCerrada;          // cajero: sólo con caja abierta
  }

  // ---------- Listeners robustos para crear terminal ----------
  document.addEventListener("click", (ev) => {
    const t = ev.target;

    if (t?.id === IDS.btnMostrarCrear) {
      if (!canActUI()) { alert("No tenés permisos para crear una terminal (caja/local cerrado para tu rol)."); return; }
      formCrearTerminal = document.getElementById(IDS.formCrear);
      inputNuevoTerminal = document.getElementById(IDS.inputNuevo);
      if (formCrearTerminal) formCrearTerminal.style.display = "block";
      if (inputNuevoTerminal) inputNuevoTerminal.focus();
      return;
    }

    if (t?.id === IDS.btnCancelCrear) {
      formCrearTerminal = document.getElementById(IDS.formCrear);
      inputNuevoTerminal = document.getElementById(IDS.inputNuevo);
      if (inputNuevoTerminal) inputNuevoTerminal.value = "";
      if (formCrearTerminal) formCrearTerminal.style.display = "none";
      return;
    }

    if (t?.id === IDS.btnOkCrear) {
      if (!canActUI()) { alert("No tenés permisos para crear una terminal (caja/local cerrado para tu rol)."); return; }
      inputNuevoTerminal = document.getElementById(IDS.inputNuevo);
      const nuevo = (inputNuevoTerminal?.value || "").trim();
      const caja = cajaSelect?.value || "";
      if (!caja) { alert("Seleccioná una caja primero."); return; }
      if (!nuevo) { alert("Debe ingresar un nombre de terminal"); return; }
      (terminalesPorCaja[caja] ||= []);
      (lotesPorCajaTerminal[caja] ||= {});
      (loteActivoPorCajaTerminal[caja] ||= {});
      if (terminalesPorCaja[caja].includes(nuevo)) { alert("Esa terminal ya existe."); return; }
      terminalesPorCaja[caja].push(nuevo);
      lotesPorCajaTerminal[caja][nuevo] = [];
      if (!terminalActivoPorCaja[caja]) { terminalActivoPorCaja[caja] = nuevo; terminalActivo = nuevo; }
      if (inputNuevoTerminal) inputNuevoTerminal.value = "";
      if (formCrearTerminal) formCrearTerminal.style.display = "none";
      renderTerminales(caja);
      actualizarTerminalActivoDisplay();
      return;
    }
  });

  // ---------- Estado caja/local y UI ----------
  async function refrescarEstadoCaja({ reRender = true } = {}) {
    const { local, caja, fecha, turno } = getCtx();
    if (!caja || !fecha || !turno) {
      window.cajaCerrada = false;
      localCerrado = false;
      toggleUIByEstado();
      return;
    }
    try {
      const [rCaja, rLocal] = await Promise.all([
        fetch(`/estado_caja?local=${encodeURIComponent(local)}&caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`)
          .then(r => r.ok ? r.json() : { estado: 1 }).catch(() => ({ estado: 1 })),
        fetch(`/estado_local?fecha=${encodeURIComponent(fecha)}`)
          .then(r => r.ok ? r.json() : { ok: true, estado: 1 }).catch(() => ({ ok: true, estado: 1 }))
      ]);
      window.cajaCerrada = ((rCaja.estado ?? 1) === 0);
      localCerrado = ((rLocal.estado ?? 1) === 0);
    } catch {
      window.cajaCerrada = false;
      localCerrado = false;
    }
    toggleUIByEstado();
    if (reRender) renderVistaPrevia(cajaSelect.value);
  }

  function toggleUIByEstado() {
    const disabled = !canActUI();

    // refrescar refs dinámicas (por si el DOM cambió)
    btnMostrarCrearTerminal = document.getElementById(IDS.btnMostrarCrear);
    formCrearTerminal       = document.getElementById(IDS.formCrear);
    inputNuevoTerminal      = document.getElementById(IDS.inputNuevo);
    btnOkCrearTerminal      = document.getElementById(IDS.btnOkCrear);
    btnCancelarCrearTerminal= document.getElementById(IDS.btnCancelCrear);
    selectTerminalActivo    = document.getElementById(IDS.selectActivo);

    [btnMostrarCrearTerminal, btnOkCrearTerminal, btnCancelarCrearTerminal, inputNuevoTerminal, selectTerminalActivo,
     btnAgregarLote, inputNuevoLote, selectLote].forEach(el => { if (el) el.disabled = disabled; });

    if (tarjetaForm) {
      tarjetaForm.querySelectorAll("input, button, select, textarea").forEach(el => {
        if (el === btnGuardarTarjetas) return;
        el.disabled = disabled;
      });
    }
    if (btnGuardarTarjetas) btnGuardarTarjetas.disabled = disabled;
  }

  document.getElementById('btnCerrarCaja')?.addEventListener('click', () => {
    setTimeout(() => refrescarEstadoCaja({ reRender: true }), 800);
  });

  // Quitar fila "TIPS" estática y agregar UI de tips por tarjeta
  const tipsRow = tarjetaForm?.querySelector('.tarjeta-row[data-tarjeta="TIPS"]');
  if (tipsRow) tipsRow.remove();

  const tarjetaRows = tarjetaForm?.querySelectorAll(".tarjeta-row") || [];
  tarjetaRows.forEach(row => {
    const tdMonto = row.querySelector("td:last-child");
    if (!tdMonto) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-submit";
    btn.textContent = "➕ Agregar un Tip";
    btn.style.marginLeft = "8px";
    const tipBox = document.createElement("div");
    tipBox.style.display = "none";
    tipBox.style.marginTop = "6px";
    const tipLabel = document.createElement("label");
    tipLabel.textContent = "TIP:";
    tipLabel.style.marginRight = "6px";
    const tipInput = document.createElement("input");
    tipInput.type = "text";
    tipInput.className = "input-tip";
    tipInput.placeholder = "0,00";
    tipInput.style.width = "100px";
    tipInput.dataset.tarjeta = row.dataset.tarjeta;
    btn.addEventListener("click", () => {
      if (!canActUI()) { alert("No tenés permisos para editar TIPS en esta caja/turno."); return; }
      tipBox.style.display = (tipBox.style.display === "none") ? "block" : "none";
    });
    tipBox.appendChild(tipLabel);
    tipBox.appendChild(tipInput);
    tdMonto.appendChild(btn);
    tdMonto.appendChild(tipBox);
  });

  // ---------- Render Terminales/Lotes ----------
  function actualizarTerminalActivoDisplay() {
    let el = document.getElementById(IDS.textoActivo);
    if (el) el.innerText = `Terminal actual: ${terminalActivo || 'Sin terminal'}`;
  }
  function actualizarLoteActivoDisplay() {
    if (tarjetaInfoLote) tarjetaInfoLote.innerText = `Lote actual: ${loteActivo || 'Sin lote'}`;
  }
  function renderTerminales(caja) {
    selectTerminalActivo = document.getElementById(IDS.selectActivo);
    grupoTerminalActivo  = document.getElementById(IDS.grupoActivo);
    if (!selectTerminalActivo || !grupoTerminalActivo) return;

    selectTerminalActivo.innerHTML = "";
    const terminals = terminalesPorCaja[caja] || [];
    if (terminals.length === 0) {
      grupoTerminalActivo.style.display = "none";
      terminalActivo = null;
      terminalActivoPorCaja[caja] = null;
    } else if (terminals.length === 1) {
      grupoTerminalActivo.style.display = "none";
      terminalActivo = terminals[0];
      terminalActivoPorCaja[caja] = terminalActivo;
    } else {
      terminals.forEach(t => {
        const opt = document.createElement("option"); opt.value = t; opt.textContent = t;
        selectTerminalActivo.appendChild(opt);
      });
      grupoTerminalActivo.style.display = "block";
      if (terminalActivoPorCaja[caja] && terminals.includes(terminalActivoPorCaja[caja])) {
        selectTerminalActivo.value = terminalActivoPorCaja[caja];
      } else {
        selectTerminalActivo.value = terminals[0];
        terminalActivoPorCaja[caja] = terminals[0];
      }
      terminalActivo = selectTerminalActivo.value;
    }
    actualizarTerminalActivoDisplay();
    renderLotes(caja);
  }
  function renderLotes(caja) {
    if (!selectLote) return;
    selectLote.innerHTML = "";
    const terminal = terminalActivo;
    const mapa = lotesPorCajaTerminal[caja] || {};
    const lotes = (terminal && mapa[terminal]) ? mapa[terminal] : [];

    if (lotes.length <= 1) {
      selectLote.style.display = "none";
    } else {
      lotes.forEach(l => {
        const opt = document.createElement("option"); opt.value = l; opt.textContent = l;
        selectLote.appendChild(opt);
      });
      selectLote.style.display = "inline-block";
    }

    const lotesActivos = (loteActivoPorCajaTerminal[caja] ||= {});
    if (lotes.length > 1 && lotesActivos[terminal]) {
      selectLote.value = lotesActivos[terminal];
      selectLote.dispatchEvent(new Event("change"));
    } else {
      loteActivo = (lotes.length === 1) ? lotes[0] : (lotesActivos[terminal] || null);
      if (loteActivo && selectLote.style.display !== "none") selectLote.value = loteActivo;
      actualizarLoteActivoDisplay();
    }
    renderVistaPrevia(caja);
  }

  // ---------- Render vista previa ----------
  function renderVistaPrevia(caja) {
    if (!tarjetaPreview) return;
    tarjetaPreview.innerHTML = "";
    let totalCargadas = 0, totalNuevas = 0;

    const previas = tarjetasCargadasHoyPorCaja[caja] || [];
    const nuevas  = tarjetasPorCaja[caja] || [];
    const tipsPrevios = tipsCargadosPorCaja[caja] || [];
    const tipsNuevos  = tipsPorCaja[caja] || [];

    const puedeActuar = canActUI();

    if (previas.length > 0) {
      labelTarjetasCargadas.style.display = "block";
      previas.forEach(t => {
        const fila = document.createElement("tr");
        fila.style.backgroundColor = "#d0f0c0";
        const loteCellText = t.terminal ? `${t.terminal} / ${t.lote}` : `${t.lote}`;
        const accionesHTML = puedeActuar ? `
          <button class="btn-editar-bd" data-id="${t.id}" title="Editar (BD)">✏️</button>
          <button class="btn-borrar-bd" data-id="${t.id}" title="Borrar grupo (BD)">🗑️</button>
        ` : "";

        // 4 columnas: Tarjeta | Terminal/Lote | Monto | TIP
        fila.innerHTML = `
          <td>${t.tarjeta}</td>
          <td>${loteCellText}</td>
          <td>
            <span class="monto-text-bd" data-id="${t.id}">${fmt(t.monto)}</span>
            <input type="text" class="monto-edit-bd" data-id="${t.id}" style="display:none; width: 90px;">
            <button class="btn-aceptar-bd" data-id="${t.id}" style="display:none;">✅</button>
            <button class="btn-cancelar-bd" data-id="${t.id}" style="display:none;">❌</button>
            ${accionesHTML}
          </td>
          <td style="text-align:right">${fmt(t.tip || 0)}</td>
        `;
        tarjetaPreview.appendChild(fila);
        totalCargadas += parseFloat(t.monto || 0);
        totalCargadas += parseFloat(t.tip || 0); // si querés sumar TIP al total cargado
      });
    } else {
      labelTarjetasCargadas.style.display = "none";
    }

    // TIPs ya cargados (por columnas)
    tipsPrevios.forEach(row => {
      const termLot = `${row.terminal} / ${row.lote}`;
      const pairs = [
        ["VISA", row.visa_tips],
        ["VISA DÉBITO", row.visa_debito_tips],
        ["VISA PREPAGO", row.visa_prepago_tips],
        ["MASTERCARD", row.mastercard_tips],
        ["MASTERCARD DÉBITO", row.mastercard_debito_tips],
        ["MASTERCARD PREPAGO", row.mastercard_prepago_tips],
        ["CABAL", row.cabal_tips],
        ["CABAL DÉBITO", row.cabal_debito_tips],
        ["AMEX", row.amex_tips],
        ["MAESTRO", row.maestro_tips],
        ["NARANJA", row.naranja_tips],
        ["DINERS", row.diners_tips],
        ["PAGOS INMEDIATOS", row.pagos_inmediatos_tips],
      ];
      pairs.forEach(([nombre, val]) => {
        const v = parseFloat(val || 0);
        if (v > 0) {
          const tr = document.createElement("tr");
          tr.style.backgroundColor = "#d0f0c0";
          const acciones = puedeActuar ? `
            <button class="btn-editar-tip-bd" data-terminal="${row.terminal}" data-lote="${row.lote}" data-tarjeta="${nombre}" title="Editar TIP">✏️</button>
            <button class="btn-borrar-tip-bd" data-terminal="${row.terminal}" data-lote="${row.lote}" data-tarjeta="${nombre}" title="Borrar grupo (incluye TIPS)">🗑️</button>
          ` : "";
          // 4 columnas: Tarjeta (TIP) | Terminal/Lote | Monto(—) | TIP
          tr.innerHTML = `
            <td>${nombre} (TIP)</td>
            <td>${termLot}</td>
            <td></td>
            <td style="text-align:right">
              <span class="tip-text-bd" data-terminal="${row.terminal}" data-lote="${row.lote}" data-tarjeta="${nombre}">${fmt(v)}</span>
              <input type="text" class="tip-edit-bd" data-terminal="${row.terminal}" data-lote="${row.lote}" data-tarjeta="${nombre}" style="display:none; width: 90px;">
              <button class="btn-aceptar-tip-bd" data-terminal="${row.terminal}" data-lote="${row.lote}" data-tarjeta="${nombre}" style="display:none;">✅</button>
              <button class="btn-cancelar-tip-bd" data-terminal="${row.terminal}" data-lote="${row.lote}" data-tarjeta="${nombre}" style="display:none;">❌</button>
              ${acciones}
            </td>
          `;
          tarjetaPreview.appendChild(tr);
          totalCargadas += v;
        }
      });
    });

    // Nuevas tarjetas (memoria)
    nuevas.forEach((t, index) => {
      const fila = document.createElement("tr");
      const loteCellText = t.terminal ? `${t.terminal} / ${t.lote}` : `${t.lote}`;
      // 4 columnas: Tarjeta | Terminal/Lote | Monto (con acciones) | TIP vacío
      fila.innerHTML = `
        <td>${t.tarjeta}</td>
        <td>${loteCellText}</td>
        <td>
          <span class="monto-text">${fmt(t.monto)}</span>
          <input type="text" class="monto-edit" style="display:none; width: 90px;">
          ${puedeActuar ? `
            <button class="btn-aceptar" style="display:none;">✅</button>
            <button class="btn-cancelar" style="display:none;">❌</button>
            <button class="btn-editar" data-idx="${index}" title="Editar">✏️</button>
            <button class="btn-borrar" data-idx="${index}" title="Poner en 0">🗑️</button>
          ` : ``}
        </td>
        <td></td>
      `;
      tarjetaPreview.appendChild(fila);
      totalNuevas += parseFloat(t.monto || 0);
    });

    // Tips nuevos (memoria)
    tipsNuevos.forEach(t => {
      const tr = document.createElement("tr");
      // 4 columnas: Tarjeta (TIP) | Terminal/Lote | Monto(—) | TIP
      tr.innerHTML = `
        <td>${t.tarjeta} (TIP)</td>
        <td>${t.terminal} / ${t.lote}</td>
        <td></td>
        <td style="text-align:right">${fmt(t.tip || 0)}</td>
      `;
      tarjetaPreview.appendChild(tr);
      totalNuevas += parseFloat(t.tip || 0);
    });

    totalTarjetasPrevias.innerText = fmt(totalCargadas);
    totalTarjetasNuevas.innerText  = fmt(totalNuevas);
  }

  function findTarjetaIdByGrupo(caja, terminal, lote) {
    const lista = tarjetasCargadasHoyPorCaja[caja] || [];
    const it = lista.find(x => String(x.terminal) === String(terminal) && String(x.lote) === String(lote));
    return it ? it.id : null;
  }

  // ---------- Delegación sobre la vista previa ----------
  tarjetaPreview?.addEventListener("click", async (e) => {
    const caja = cajaSelect.value;

    if (!canActUI() && e.target.closest("button")) {
      alert("No tenés permisos para editar/borrar en esta caja/turno.");
      return;
    }

    const nuevas = tarjetasPorCaja[caja] || [];

    // Editar nuevo (memoria)
    if (e.target.classList.contains("btn-editar")) {
      const idx = parseInt(e.target.dataset.idx);
      const td = e.target.closest("td");
      const montoSpan = td.querySelector(".monto-text");
      const input = td.querySelector(".monto-edit");
      const aceptar = td.querySelector(".btn-aceptar");
      const cancelar = td.querySelector(".btn-cancelar");
      input.value = (nuevas[idx].monto ?? 0).toString().replace('.', ',');
      montoSpan.style.display = "none";
      input.style.display = "inline-block";
      if (aceptar) aceptar.style.display = "inline-block";
      if (cancelar) cancelar.style.display = "inline-block";
      e.target.style.display = "none";
      return;
    }
    if (e.target.classList.contains("btn-cancelar")) {
      const td = e.target.closest("td");
      td.querySelector(".monto-text").style.display = "inline";
      td.querySelector(".monto-edit").style.display = "none";
      const aceptar = td.querySelector(".btn-aceptar");
      const cancelar = td.querySelector(".btn-cancelar");
      const editar = td.querySelector(".btn-editar");
      if (aceptar) aceptar.style.display = "none";
      if (cancelar) cancelar.style.display = "none";
      if (editar) editar.style.display = "inline";
      return;
    }
    if (e.target.classList.contains("btn-aceptar")) {
      const tr = e.target.closest("tr");
      const idx = parseInt(tr.querySelector(".btn-editar")?.dataset.idx || "0");
      const input = tr.querySelector(".monto-edit");
      const nuevo = parseMonto(input.value);
      nuevas[idx].monto = nuevo;
      renderVistaPrevia(caja);
      return;
    }
    if (e.target.classList.contains("btn-borrar")) {
      const idx = parseInt(e.target.dataset.idx);
      nuevas[idx].monto = 0;
      renderVistaPrevia(caja);
      return;
    }

    // BD: EDITAR / CANCELAR / ACEPTAR
    if (e.target.classList.contains("btn-editar-bd")) {
      const id = e.target.dataset.id;
      const td = e.target.closest("td");
      const span = td.querySelector(`.monto-text-bd[data-id="${id}"]`);
      const input = td.querySelector(`.monto-edit-bd[data-id="${id}"]`);
      const okBtn = td.querySelector(`.btn-aceptar-bd[data-id="${id}"]`);
      const cancelBtn = td.querySelector(`.btn-cancelar-bd[data-id="${id}"]`);
      const actual = (span?.innerText || "").replace(/[^\d,.-]/g, "");
      if (input) input.value = actual;
      if (span) span.style.display = "none";
      if (input) input.style.display = "inline-block";
      if (okBtn) okBtn.style.display = "inline-block";
      if (cancelBtn) cancelBtn.style.display = "inline-block";
      e.target.style.display = "none";
      return;
    }
    if (e.target.classList.contains("btn-cancelar-bd")) {
      const id = e.target.dataset.id;
      const td = e.target.closest("td");
      const span = td.querySelector(`.monto-text-bd[data-id="${id}"]`);
      const input = td.querySelector(`.monto-edit-bd[data-id="${id}"]`);
      const okBtn = td.querySelector(`.btn-aceptar-bd[data-id="${id}"]`);
      const cancelBtn = td.querySelector(`.btn-cancelar-bd[data-id="${id}"]`);
      const editBtn = td.querySelector(`.btn-editar-bd[data-id="${id}"]`);
      if (span) span.style.display = "inline";
      if (input) input.style.display = "none";
      if (okBtn) okBtn.style.display = "none";
      if (cancelBtn) cancelBtn.style.display = "none";
      if (editBtn) editBtn.style.display = (canActUI() ? "inline" : "none");
      return;
    }
    if (e.target.classList.contains("btn-aceptar-bd")) {
      const id = e.target.dataset.id;
      const td = e.target.closest("td");
      const input = td.querySelector(`.monto-edit-bd[data-id="${id}"]`);
      const nuevo = parseMonto(input?.value || "0");
      fetch(`/tarjetas/${id}`, {
        method:"PUT",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ monto: nuevo })
      })
      .then(async r => {
        if (!r.ok) { const txt = await r.text(); if (r.status===409) alert("No permitido (caja/local cerrados para tu rol)."); else alert("Error al actualizar: "+(txt||r.status)); return null; }
        return r.json();
      })
      .then(async data => {
        if (!data) return;
        if (data.success) {
          await refrescarEstadoCaja({reRender:false});
          if (window.OrqTabs) OrqTabs.reload('tarjetas'); else legacyReload();
        } else {
          alert("❌ " + (data.msg || "No se pudo actualizar"));
        }
      })
      .catch(()=>alert("❌ Error de red"));
      return;
    }

    // Borrar grupo
    if (e.target.classList.contains("btn-borrar-bd")) {
      const id = e.target.dataset.id;
      if (!confirm("Vas a borrar TODO el grupo (fecha, caja, terminal y lote), incluidos los TIPS. ¿Continuar?")) return;
      fetch(`/tarjetas/${id}`, { method:"DELETE" })
      .then(async r => {
        if (!r.ok) { const txt = await r.text(); if (r.status===409) alert("No permitido (caja/local cerrados para tu rol)."); else alert("Error al borrar: "+(txt||r.status)); return null; }
        return r.json();
      })
      .then(async data => {
        if (!data) return;
        if (data.success) {
          await refrescarEstadoCaja({reRender:false});
          if (window.OrqTabs) OrqTabs.reload('tarjetas'); else legacyReload();
        } else {
          alert("❌ " + (data.msg || "Error al borrar"));
        }
      })
      .catch(()=>alert("❌ Error de red"));
      return;
    }

    // TIP BD editar / cancelar / aceptar
    if (e.target.classList.contains("btn-editar-tip-bd")) {
      const { terminal, lote, tarjeta } = e.target.dataset;
      const td = e.target.closest("td");
      const span = td.querySelector(`.tip-text-bd[data-terminal="${terminal}"][data-lote="${lote}"][data-tarjeta="${tarjeta}"]`);
      const input = td.querySelector(`.tip-edit-bd[data-terminal="${terminal}"][data-lote="${lote}"][data-tarjeta="${tarjeta}"]`);
      const okBtn = td.querySelector(`.btn-aceptar-tip-bd[data-terminal="${terminal}"][data-lote="${lote}"][data-tarjeta="${tarjeta}"]`);
      const cancelBtn = td.querySelector(`.btn-cancelar-tip-bd[data-terminal="${terminal}"][data-lote="${lote}"][data-tarjeta="${tarjeta}"]`);
      const actual = (span?.innerText || "").replace(/[^\d,.-]/g, "");
      if (input) input.value = actual;
      if (span) span.style.display = "none";
      if (input) input.style.display = "inline-block";
      if (okBtn) okBtn.style.display = "inline-block";
      if (cancelBtn) cancelBtn.style.display = "inline-block";
      e.target.style.display = "none";
      return;
    }
    if (e.target.classList.contains("btn-cancelar-tip-bd")) {
      const { terminal, lote, tarjeta } = e.target.dataset;
      const td = e.target.closest("td");
      const span = td.querySelector(`.tip-text-bd[data-terminal="${terminal}"][data-lote="${lote}"][data-tarjeta="${tarjeta}"]`);
      const input = td.querySelector(`.tip-edit-bd[data-terminal="${terminal}"][data-lote="${lote}"][data-tarjeta="${tarjeta}"]`);
      const okBtn = td.querySelector(`.btn-aceptar-tip-bd[data-terminal="${terminal}"][data-lote="${lote}"][data-tarjeta="${tarjeta}"]`);
      const cancelBtn = td.querySelector(`.btn-cancelar-tip-bd[data-terminal="${terminal}"][data-lote="${lote}"][data-tarjeta="${tarjeta}"]`);
      const editBtn = td.querySelector(`.btn-editar-tip-bd[data-terminal="${terminal}"][data-lote="${lote}"][data-tarjeta="${tarjeta}"]`);
      if (span) span.style.display = "inline";
      if (input) input.style.display = "none";
      if (okBtn) okBtn.style.display = "none";
      if (cancelBtn) cancelBtn.style.display = "none";
      if (editBtn) editBtn.style.display = (canActUI() ? "inline" : "none");
      return;
    }
    if (e.target.classList.contains("btn-aceptar-tip-bd")) {
      const { terminal, lote, tarjeta } = e.target.dataset;
      const td = e.target.closest("td");
      const input = td.querySelector(`.tip-edit-bd[data-terminal="${terminal}"][data-lote="${lote}"][data-tarjeta="${tarjeta}"]`);
      const nuevoTip = parseMonto(input?.value || "0");
      const { caja, fecha, turno } = getCtx();
      fetch(`/tarjetas/tip`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caja, fecha, turno, terminal, lote, tarjeta, tip: nuevoTip })
      })
      .then(async r => {
        if (!r.ok) { const txt = await r.text(); if (r.status===409) alert("No permitido (caja/local cerrados para tu rol)."); else alert("Error al actualizar TIP: "+(txt||r.status)); return null; }
        return r.json();
      })
      .then(async data => {
        if (!data) return;
        if (data.success) {
          await refrescarEstadoCaja({ reRender:false });
          if (window.OrqTabs) OrqTabs.reload('tarjetas'); else legacyReload();
        } else {
          alert("❌ " + (data.msg || "No se pudo actualizar el TIP"));
        }
      })
      .catch(() => alert("❌ Error de red"));
      return;
    }

    // Borrar grupo desde TIP
    if (e.target.classList.contains("btn-borrar-tip-bd")) {
      const { terminal, lote } = e.target.dataset;
      if (!confirm("Vas a borrar TODO el grupo (fecha, caja, terminal y lote), incluidos los TIPS y tarjetas. ¿Continuar?")) return;
      const id = findTarjetaIdByGrupo(caja, terminal, lote);
      if (!id) { alert("No se encontró un registro de tarjetas para este grupo. (No se pudo borrar)"); return; }
      fetch(`/tarjetas/${id}`, { method:"DELETE" })
      .then(async r => {
        if (!r.ok) { const txt = await r.text(); if (r.status===409) alert("No permitido (caja/local cerrados para tu rol)."); else alert("Error al borrar: "+(txt||r.status)); return null; }
        return r.json();
      })
      .then(async data => {
        if (!data) return;
        if (data.success) {
          await refrescarEstadoCaja({reRender:false});
          if (window.OrqTabs) OrqTabs.reload('tarjetas'); else legacyReload();
        } else {
          alert("❌ " + (data.msg || "Error al borrar"));
        }
      })
      .catch(()=>alert("❌ Error de red"));
      return;
    }
  });

  // ---------- Añadir lote ----------
  btnAgregarLote?.addEventListener("click", () => {
    if (!canActUI()) { alert("No tenés permisos para añadir lote en esta caja/turno."); return; }
    const nuevoLote = (inputNuevoLote.value || "").trim();
    if (!nuevoLote) return alert("Debe ingresar un número de lote");
    const caja = cajaSelect.value;
    if (!terminalActivo) { alert("Primero cree/seleccione una Terminal."); return; }

    (terminalesPorCaja[caja] ||= (terminalActivo ? [terminalActivo] : []));
    (lotesPorCajaTerminal[caja] ||= {});
    (loteActivoPorCajaTerminal[caja] ||= {});
    lotesPorCajaTerminal[caja][terminalActivo] = lotesPorCajaTerminal[caja][terminalActivo] || [];
    (tarjetasCargadasHoyPorCaja[caja] ||= []);
    (tarjetasPorCaja[caja] ||= []);

    const dupBD = (tarjetasCargadasHoyPorCaja[caja] || []).some(t => {
      if (!t.terminal) return t.lote === nuevoLote;
      return t.lote === nuevoLote && t.terminal === terminalActivo;
    });
    if (dupBD) { alert("Ese lote ya existe en los registros guardados para esta terminal."); return; }

    const dupVP = (tarjetasPorCaja[caja] || []).some(t => t.lote === nuevoLote && t.terminal === terminalActivo);
    if (dupVP) { alert("Ese lote ya está en la vista previa para esta terminal."); return; }

    if (!lotesPorCajaTerminal[caja][terminalActivo].includes(nuevoLote)) {
      lotesPorCajaTerminal[caja][terminalActivo].push(nuevoLote);
      renderLotes(caja);
      const act = (loteActivoPorCajaTerminal[caja] ||= {});
      act[terminalActivo] = nuevoLote;
      loteActivo = nuevoLote;
      if (selectLote.style.display !== "none") selectLote.value = nuevoLote;
      actualizarLoteActivoDisplay();
    }
    inputNuevoLote.value = "";
  });

  // ---------- Cambio de Terminal/Lote activos ----------
  selectTerminalActivo?.addEventListener("change", () => {
    const caja = cajaSelect.value;
    terminalActivo = selectTerminalActivo.value;
    terminalActivoPorCaja[caja] = terminalActivo;
    loteActivo = (loteActivoPorCajaTerminal[caja]?.[terminalActivo]) || null;
    actualizarTerminalActivoDisplay();
    renderLotes(caja);
  });
  selectLote?.addEventListener("change", () => {
    const caja = cajaSelect.value;
    const val = selectLote.value || null;
    loteActivo = val;
    (loteActivoPorCajaTerminal[caja] ||= {});
    if (terminalActivo) loteActivoPorCajaTerminal[caja][terminalActivo] = val;
    actualizarLoteActivoDisplay();
  });

  // ---------- Añadir tarjetas + TIPS ----------
  tarjetaForm?.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!canActUI()) { alert("No tenés permisos para añadir en esta caja/turno."); return; }
    const caja = cajaSelect.value;
    if (!terminalActivo) return alert("Debe crear/seleccionar una Terminal primero");
    if (!loteActivo)    return alert("Debe agregar/seleccionar un Lote para la Terminal activa");

    (tarjetasPorCaja[caja] ||= []);
    (tipsPorCaja[caja]     ||= []);

    const yaEnVistaPrevia = (tarjetasPorCaja[caja] || []).some(t => t.lote === loteActivo && t.terminal === terminalActivo);
    const yaEnBD = (tarjetasCargadasHoyPorCaja[caja] || []).some(t => (!t.terminal ? t.lote === loteActivo : t.lote === loteActivo && t.terminal === terminalActivo));
    if (yaEnBD || yaEnVistaPrevia) return alert("Este lote para esta terminal ya fue cargado previamente o está en la vista previa.");

    const tarjetaInputs = tarjetaForm.querySelectorAll(".tarjeta-row");
    tarjetaInputs.forEach(row => {
      const tarjeta = row.dataset.tarjeta;
      const input = row.querySelector(".input-monto");
      let monto = (input?.value || "").trim();
      if (!monto) return;
      monto = parseMonto(monto);
      if (isNaN(monto)) return;
      tarjetasPorCaja[caja].push({ tarjeta, monto, lote: loteActivo, terminal: terminalActivo });
    });

    const tipInputs = tarjetaForm.querySelectorAll(".input-tip");
    tipInputs.forEach(inp => {
      const valRaw = (inp.value || "").trim();
      if (!valRaw) return;
      let tip = parseMonto(valRaw);
      if (isNaN(tip) || tip <= 0) return;
      const tarjeta = inp.dataset.tarjeta;
      tipsPorCaja[caja].push({ tarjeta, tip, lote: loteActivo, terminal: terminalActivo });
      inp.value = "";
    });

    renderVistaPrevia(caja);
    tarjetaForm.reset();
  });

  // ---------- Guardar BD ----------
  btnGuardarTarjetas?.addEventListener("click", async () => {
    const { caja, fecha, turno } = getCtx();
    const tarjetas   = tarjetasPorCaja[caja] || [];
    const tipsNuevos = tipsPorCaja[caja]     || [];

    await refrescarEstadoCaja({ reRender: false });
    if (!canActUI()) { alert("No tenés permisos para guardar en esta caja/turno."); return; }
    if (tarjetas.length === 0 && tipsNuevos.length === 0) return alert("No hay datos para guardar");

    const promises = [];
    if (tarjetas.length > 0) {
      promises.push(fetch("/guardar_tarjetas_lote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caja, fecha, turno, tarjetas })
      }).then(r => r.json()));
    }
    if (tipsNuevos.length > 0) {
      const gruposMap = {};
      tipsNuevos.forEach(t => {
        const key = `${t.terminal}||${t.lote}`;
        if (!gruposMap[key]) gruposMap[key] = { terminal: t.terminal, lote: t.lote, tips: {} };
        gruposMap[key].tips[t.tarjeta] = (gruposMap[key].tips[t.tarjeta] || 0) + (t.tip || 0);
      });
      const grupos = Object.values(gruposMap);
      promises.push(fetch("/guardar_tips_tarjetas_lote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caja, fecha, turno, grupos })
      }).then(r => r.json()));
    }

    Promise.all(promises)
      .then(async results => {
        const ok = results.every(r => r && r.success !== false);
        if (ok) {
          alert("✅ Datos guardados correctamente");
          tarjetasPorCaja[caja] = [];
          tipsPorCaja[caja] = [];
          if (window.OrqTabs) OrqTabs.reload('tarjetas'); else legacyReload();
          await refrescarEstadoCaja({ reRender: false });
        } else {
          const firstErr = results.find(r => !r || r.success === false);
          alert("❌ Error: " + ((firstErr && firstErr.msg) || "No se pudo guardar"));
        }
      })
      .catch(() => alert("❌ Error de red"));
  });

  // ---------- Fallback para recargar sin orquestador ----------
  function legacyReload() {
    const { local, caja, fecha, turno } = getCtx();
    const qTar = fetch(`/tarjetas_cargadas_hoy?caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`)
      .then(r=>r.json()).catch(()=>[]);
    const qTip = fetch(`/tips_tarjetas_cargados?caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`)
      .then(r=>r.json()).catch(()=>[]);
    const qEC = fetch(`/estado_caja?local=${encodeURIComponent(local)}&caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`)
      .then(r=>r.json()).catch(()=>({estado:1}));
    const qEL = fetch(`/estado_local?fecha=${encodeURIComponent(fecha)}`)
      .then(r=>r.json()).catch(()=>({ok:true, estado:1}));

    Promise.all([qTar,qTip,qEC,qEL]).then(([arrTar, arrTip, estCaja, estLocal]) => {
      window.cajaCerrada = ((estCaja?.estado ?? 1) === 0);
      localCerrado = ((estLocal?.estado ?? 1) === 0);
      toggleUIByEstado();
      applyDatasetsFromServer(caja, arrTar, arrTip);
      renderTerminales(caja);
      renderVistaPrevia(caja);
    });
  }

  // ---------- Aplicar datasets del servidor ----------
  function applyDatasetsFromServer(caja, arrTar, arrTip) {
    const normalizados = (arrTar || []).map(d => ({
      id: d.id,
      tarjeta: d.tarjeta,
      lote: d.lote,
      monto: d.monto,
      terminal: d.terminal || null,
      // ⬇️ Guardamos TIP que viene de /tarjetas_cargadas_hoy
      tip: (typeof d.tip !== "undefined") ? parseFloat(d.tip) : 0
    }));
    tarjetasCargadasHoyPorCaja[caja] = normalizados;

    // /tips_tarjetas_cargados ya trae columnas por tarjeta (incluidas las nuevas)
    tipsCargadosPorCaja[caja] = Array.isArray(arrTip) ? arrTip : [];

    const termSet = new Set();
    const lotesMap = {};
    normalizados.forEach(r => {
      const term = r.terminal || '';
      const lote = r.lote || '';
      if (term) { termSet.add(term); (lotesMap[term] ||= new Set()).add(lote); }
      else if (lote) { (lotesMap[""] ||= new Set()).add(lote); }
    });
    (tipsCargadosPorCaja[caja] || []).forEach(row => {
      if (row.terminal) { termSet.add(row.terminal); (lotesMap[row.terminal] ||= new Set()).add(row.lote); }
    });

    terminalesPorCaja[caja] = Array.from(termSet);
    lotesPorCajaTerminal[caja] = {};
    Object.keys(lotesMap).forEach(t => { lotesPorCajaTerminal[caja][t] = Array.from(lotesMap[t]); });

    if (!terminalActivoPorCaja[caja] || !terminalesPorCaja[caja].includes(terminalActivoPorCaja[caja])) {
      terminalActivoPorCaja[caja] = terminalesPorCaja[caja][0] || null;
    }
    terminalActivo = terminalActivoPorCaja[caja] || null;

    const lotesActivos = (loteActivoPorCajaTerminal[caja] ||= {});
    if (terminalActivo) {
      const lotes = lotesPorCajaTerminal[caja][terminalActivo] || [];
      if (!lotes.includes(lotesActivos[terminalActivo])) {
        lotesActivos[terminalActivo] = lotes[0] || null;
      }
      loteActivo = lotesActivos[terminalActivo] || null;
    } else {
      loteActivo = null;
    }
  }

  // ---------- Render que llama el Orquestador ----------
  window.renderTarjetas = function (data, opts = {}) {
    const caja = cajaSelect.value;
    const map = opts.datasets || {};
    const epTar = Object.keys(map).find(k => k.includes('tarjetas_cargadas_hoy')) || Object.keys(map)[0];
    const epTip = Object.keys(map).find(k => k.includes('tips_tarjetas_cargados'));
    const epEC  = Object.keys(map).find(k => k.includes('estado_caja'));
    const epEL  = Object.keys(map).find(k => k.includes('estado_local'));

    const arrTar = Array.isArray(map[epTar]) ? map[epTar] : (Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []));
    const arrTip = epTip ? (Array.isArray(map[epTip]) ? map[epTip] : (map[epTip] && Array.isArray(map[epTip].items) ? map[epTip].items : [])) : [];

    // === NUEVO: sincronizar estado si vino en payload
    if (epEC && map[epEC] && typeof map[epEC] === 'object') {
      const d = map[epEC];
      window.cajaCerrada = ((d.estado ?? 1) === 0);
    }
    if (epEL && map[epEL] && typeof map[epEL] === 'object') {
      const d = map[epEL];
      localCerrado = ((d.estado ?? 1) === 0);
    }
    toggleUIByEstado();

    applyDatasetsFromServer(caja, arrTar, arrTip);
    refrescarEstadoCaja({ reRender: false }).finally(() => {
      renderTerminales(caja);
      renderVistaPrevia(caja);
    });
  };

  // ---------- Init mínimo ----------
  const cajaInicial = cajaSelect.value;
  (tarjetasPorCaja[cajaInicial] ||= []);
  (tarjetasCargadasHoyPorCaja[cajaInicial] ||= []);
  (tipsPorCaja[cajaInicial] ||= []);
  (tipsCargadosPorCaja[cajaInicial] ||= []);
  (terminalesPorCaja[cajaInicial] ||= []);
  (lotesPorCajaTerminal[cajaInicial] ||= {});
  (loteActivoPorCajaTerminal[cajaInicial] ||= {});
  terminalActivoPorCaja[cajaInicial] = terminalesPorCaja[cajaInicial][0] || null;
  terminalActivo = terminalActivoPorCaja[cajaInicial];

  renderTerminales(cajaInicial);
  actualizarTerminalActivoDisplay();
  renderLotes(cajaInicial);

  if (!window.OrqTabs) {
    (async () => {
      await refrescarEstadoCaja({ reRender: false });
      legacyReload();
    })();
    // listeners fallback
    cajaSelect?.addEventListener("change", async () => { await refrescarEstadoCaja({ reRender: false }); legacyReload(); });
    fechaGlobalInput?.addEventListener("change", async () => { await refrescarEstadoCaja({ reRender: false }); legacyReload(); });
    turnoSelect?.addEventListener("change", async () => { await refrescarEstadoCaja({ reRender: false }); legacyReload(); });
  } else {
    // asegurar estado inicial de botones
    toggleUIByEstado();
  }
});
