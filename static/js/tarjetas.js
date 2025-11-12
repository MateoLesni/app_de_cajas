"use strict";

document.addEventListener("DOMContentLoaded", function () {
  // ======= Estilos extras =======
  (function injectStyle() {
    const css = `
      /* tabla base */
      #tablaPreviewTarjetas tr:nth-child(even){ background:#f8fafc; }
      #tablaPreviewTarjetas td { padding:8px 10px; border-bottom:1px solid #e5e7eb; }
      #tablaPreviewTarjetas td.montos { text-align:right; white-space:nowrap; }
      #tablaPreviewTarjetas td.montos .field { display:inline-flex; align-items:center; gap:6px; margin-left:10px; }
      #tablaPreviewTarjetas td.montos input { width:95px; text-align:right; padding:4px 6px; border:1px solid #cbd5e1; border-radius:6px; }

      /* chip y acciones */
      #tablaPreviewTarjetas .chip { font-weight:600; font-size:12px; background:#e2e8f0; border-radius:999px; padding:3px 10px; display:inline-block; }
      #tablaPreviewTarjetas .actions { text-align:right; }
      #tablaPreviewTarjetas .btn { border:none; background:transparent; cursor:pointer; font-size:16px; }
      #tablaPreviewTarjetas .btn[disabled]{ opacity:.35; cursor:not-allowed; }

      /* separador de lote (gris un poco más oscuro) */
      #tablaPreviewTarjetas .group-header { background:#dde7f3; }

      /* fila guardada en BD (verde suave) */
      #tablaPreviewTarjetas tr.saved-row { background:#eaf7ea; }

      .txt-muted{ color:#64748b; }

      /* Botón + Tips azul con letras blancas */
      .btn-tip { margin-left:8px; font-size:12px; padding:4px 10px; border-radius:6px; }
      .btn-submit, .btn-tip { background:#1d79f2; color:#fff; }

      .input-tip { width:95px; text-align:right; padding:4px 6px; border:1px solid #cbd5e1; border-radius:6px; display:none; margin-left:6px; }

      /* Indicador de lote activo */
      #loteActivoDisplay { margin-top:6px; font-size:14px; }
      #loteActivoDisplay b { font-weight:700; }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  })();

  // ---------- DOM ----------
  const tarjetaForm = document.getElementById("tarjetasForm");

  // tbody robusto (o table si no hay tbody)
  const tablaBody =
    document.querySelector("#tablaPreviewTarjetas tbody") ||
    document.getElementById("tablaPreviewTarjetas");

  const btnGuardarTarjetas    = document.getElementById("btnGuardarTarjetas");
  const btnAgregarLote        = document.getElementById("btnAgregarLote");
  const inputNuevoLote        = document.getElementById("nuevoLote");
  const selectLote            = document.getElementById("selectLote");
  const cajaSelect            = document.getElementById("cajaSelect");
  const turnoSelect           = document.getElementById("turnoSelect");
  const fechaGlobalInput      = document.getElementById("fechaGlobal");
  const labelTarjetasCargadas = document.getElementById("labelTarjetasCargadas");
  const totalTarjetasPrevias  = document.getElementById("totalCargadasHoy");
  const totalTarjetasNuevas   = document.getElementById("totalNuevas"); // opcional

  // Selector de Terminal (si no existe)
  (function ensureTerminalSelector() {
    if (document.getElementById("terminalActivoTarj")) return;
    const primerGrupo = document.querySelector('#tarjetas .form-group'); // “Nuevo Lote”
    const cont = document.createElement("div");
    cont.className = "form-group";
    cont.innerHTML = `
      <label for="terminalActivoTarj">Terminal activa:</label>
      <select id="terminalActivoTarj" class="form-control"></select>
    `;
    if (primerGrupo && primerGrupo.parentNode) {
      primerGrupo.parentNode.insertBefore(cont, primerGrupo);
    }
  })();

  // Indicador de Lote activo (si no existe)
  (function ensureLoteDisplay() {
    if (document.getElementById("loteActivoDisplay")) return;
    const ref = selectLote?.parentElement || btnAgregarLote?.parentElement;
    const div = document.createElement("div");
    div.id = "loteActivoDisplay";
    div.textContent = "Lote actual: Sin lote";
    if (ref && ref.parentNode) {
      ref.parentNode.insertBefore(div, ref.nextSibling);
    }
  })();

  const loteDisplay = document.getElementById("loteActivoDisplay");

  // ---------- Estado/rol ----------
  const ROLE = parseInt(window.ROLE_LEVEL || 1, 10);
  window.cajaCerrada = window.cajaCerrada ?? false;
  let localCerrado = false;

  // ---------- Terminal / Lote ----------
  const IDS = { selectActivo:"terminalActivoTarj" };
  let selectTerminalActivo = document.getElementById(IDS.selectActivo);
  let terminalActivo = null;
  let loteActivo     = null;

  // ---------- Estructuras ----------
  const tarjetasCargadasHoyPorCaja   = {}; // dataset BD
  const terminalesPorCaja            = {};
  const lotesPorCajaTerminal         = {};
  const terminalActivoPorCaja        = {};
  const loteActivoPorCajaTerminal    = {};

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
  function canActUI() {
    if (ROLE >= 3) return true;          // auditor
    if (ROLE >= 2) return !localCerrado; // encargado
    return !window.cajaCerrada;          // cajero
  }
  function setLoteDisplay(val) {
    if (!loteDisplay) return;
    if (val) loteDisplay.innerHTML = `Lote actual: <b>${val}</b>`;
    else loteDisplay.textContent = "Lote actual: Sin lote";
  }

  // Todas las tarjetas definidas en el formulario (para saber cuáles “faltan”)
  function getTodasLasTarjetas() {
    const rows = tarjetaForm?.querySelectorAll(".tarjeta-row") || [];
    const set = new Set();
    rows.forEach(r => {
      const t = (r.dataset.tarjeta || "").trim();
      if (t) set.add(t);
    });
    return Array.from(set); // ej. ["VISA","MASTERCARD",...]
  }

  // ---------- Cargar terminales ----------
  function normalizeTerminalList(data) {
    let arr = [];
    if (Array.isArray(data)) arr = data;
    else if (data && Array.isArray(data.items)) arr = data.items;
    else arr = [];
    return arr
      .map(x => (typeof x === "string" ? { terminal: x } : x))
      .filter(x => x && x.terminal);
  }

  async function fetchTerminales(local) {
    try {
      let r = await fetch(`/api/terminales?local=${encodeURIComponent(local)}`);
      if (!r.ok) r = await fetch(`/terminales?local=${encodeURIComponent(local)}`); // fallback
      if (!r.ok) return [];
      const data = await r.json();
      return normalizeTerminalList(data);
    } catch { return []; }
  }

  async function loadTerminalesLocal({ mergeFromToday=true } = {}) {
    const local = getLocalActual();
    const caja  = cajaSelect.value;

    const apiList = await fetchTerminales(local); // [{terminal,...}]
    const nombresApi = apiList.map(x => x.terminal).filter(Boolean);

    let nombresHoy = [];
    if (mergeFromToday) {
      const arr = tarjetasCargadasHoyPorCaja[caja] || [];
      nombresHoy = Array.from(new Set(arr.map(x => x.terminal).filter(Boolean)));
    }

    const merged = Array.from(new Set([...(terminalesPorCaja[caja] || []), ...nombresApi, ...nombresHoy]));
    terminalesPorCaja[caja] = merged;

    renderTerminales(caja);
  }

  // ---------- Estado caja/local ----------
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
    if (reRender) renderTabla(cajaSelect.value);
  }

  function toggleUIByEstado() {
    const disabled = !canActUI();
    [btnAgregarLote, inputNuevoLote, selectLote, selectTerminalActivo].forEach(el => { if (el) el.disabled = disabled; });
    if (tarjetaForm) {
      tarjetaForm.querySelectorAll("input, button, select, textarea").forEach(el => {
        if (el === btnGuardarTarjetas) return;
        el.disabled = disabled;
      });
    }
    if (btnGuardarTarjetas) btnGuardarTarjetas.disabled = disabled;
  }

  // ---------- Render terminales y lotes ----------
  function renderTerminales(caja) {
    selectTerminalActivo = document.getElementById(IDS.selectActivo);
    if (!selectTerminalActivo) return;
    const terminals = terminalesPorCaja[caja] || [];
    selectTerminalActivo.innerHTML = "";
    terminals.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t; opt.textContent = t;
      selectTerminalActivo.appendChild(opt);
    });
    if (!terminalActivoPorCaja[caja] || !terminals.includes(terminalActivoPorCaja[caja])) {
      terminalActivoPorCaja[caja] = terminals[0] || null;
    }
    terminalActivo = terminalActivoPorCaja[caja] || null;
    if (terminalActivo) selectTerminalActivo.value = terminalActivo;
    renderLotes(caja);
  }

  function renderLotes(caja) {
    if (!selectLote) return;
    const terminal = terminalActivo;
    const mapa = lotesPorCajaTerminal[caja] || {};
    const lotes = (terminal && mapa[terminal]) ? mapa[terminal] : [];
    selectLote.innerHTML = "";
    if (lotes.length <= 1) {
      selectLote.style.display = "none";
    } else {
      lotes.forEach(l => {
        const opt = document.createElement("option");
        opt.value = l; opt.textContent = l;
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
      setLoteDisplay(loteActivo);
    }
    renderTabla(caja);
  }

  // ---------- Agrupación ----------
  function sortForRender(arr) {
    return [...arr].sort((a,b) => {
      const k1 = `${a.terminal || ''}||${a.lote || ''}||${a.tarjeta || ''}`.toUpperCase();
      const k2 = `${b.terminal || ''}||${b.lote || ''}||${b.tarjeta || ''}`.toUpperCase();
      return k1.localeCompare(k2);
    });
  }
  function groupByTerminalLote(arr) {
    const map = new Map();
    arr.forEach(r => {
      const key = `${r.terminal || ''}||${r.lote || ''}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return map;
  }

  // ---------- Render principal ----------
  function renderTabla(caja) {
    if (!tablaBody) return;
    tablaBody.innerHTML = "";

    const previas = tarjetasCargadasHoyPorCaja[caja] || [];
    const puedeActuar = canActUI();
    let totalPrevios = 0;

    const ordenados = sortForRender(previas);
    const grupos = groupByTerminalLote(ordenados);

    // Si hay lote activo/terminal activo, aseguramos mostrar también filas "faltantes" en 0
    if (terminalActivo && loteActivo) {
      const key = `${terminalActivo}||${loteActivo}`;
      if (!grupos.has(key)) grupos.set(key, []); // grupo vacío para mostrar faltantes
    }

    if (grupos.size > 0) {
      if (labelTarjetasCargadas) labelTarjetasCargadas.style.display = "block";
      const todasTarjetas = getTodasLasTarjetas();

      grupos.forEach((items, key) => {
        const [terminal, lote] = key.split("||");

        // Encabezado de lote (gris divisor) + texto "Lote"
        const gh = document.createElement("tr");
        gh.className = "group-header";
        gh.innerHTML = `
          <td class="grp">Lote</td>
          <td class="grp"><span class="chip">${terminal || '—'} / ${lote || '—'}</span></td>
          <td class="actions" colspan="2">
            ${puedeActuar ? `<button class="btn btn-borrar-grupo" data-terminal="${terminal}" data-lote="${lote}" title="Borrar grupo completo">🗑️</button>` : `<span class="txt-muted">—</span>`}
          </td>
        `;
        tablaBody.appendChild(gh);

        // Mapa por tarjeta de las que existen en BD
        const porTarjeta = new Map();
        items.forEach(r => porTarjeta.set((r.tarjeta || '').toUpperCase(), r));

        // Conjunto de tarjetas a renderizar = (ya guardadas) ∪ (todas si es el grupo activo para “completar en 0”)
        let tarjetasARender = Array.from(porTarjeta.keys());
        const esGrupoActivo = (terminal === terminalActivo && lote === loteActivo);
        if (esGrupoActivo) {
          const faltantes = todasTarjetas
            .map(t => t.toUpperCase())
            .filter(t => !porTarjeta.has(t));
          tarjetasARender = Array.from(new Set([...tarjetasARender, ...faltantes]));
        }

        // Pintamos todas
        tarjetasARender.forEach(tKey => {
          const r = porTarjeta.get(tKey); // si existe en BD
          const isSaved = !!r;            // para color verde

          const tarjetaName = r ? (r.tarjeta || tKey) : tKey;
          const idAttr = r ? `data-id="${r.id}"` : `data-id=""`;
          const montoVal = r ? parseFloat(r.monto || 0) : 0;
          const tipVal   = r ? parseFloat(r.monto_tip || 0) : 0;

          const tr = document.createElement("tr");
          if (isSaved) tr.classList.add("saved-row"); // verde

          tr.innerHTML = `
            <td>${tarjetaName}</td>
            <td>${(terminal || '—')} / ${(lote || '—')}</td>

            <td class="montos">
              <div class="field" data-type="monto"
                   ${idAttr}
                   data-tarjeta="${tarjetaName}"
                   data-terminal="${terminal || ''}"
                   data-lote="${lote || ''}">
                <span class="view monto-text-bd">${fmt(montoVal)}</span>
                ${puedeActuar ? `
                  <input class="edit monto-edit-bd" type="text" style="display:none" />
                  <button class="btn btn-edit" title="Editar">✏️</button>
                  <button class="btn btn-ok"   style="display:none" title="Guardar">✅</button>
                  <button class="btn btn-cancel" style="display:none" title="Cancelar">❌</button>
                ` : ``}
              </div>
            </td>

            <td class="montos">
              <div class="field" data-type="tip"
                   ${idAttr}
                   data-tarjeta="${tarjetaName}"
                   data-terminal="${terminal || ''}"
                   data-lote="${lote || ''}">
                <span class="view tip-text-bd">${fmt(tipVal)}</span>
                ${puedeActuar ? `
                  <input class="edit tip-edit-bd" type="text" style="display:none" />
                  <button class="btn btn-edit" title="Editar">✏️</button>
                  <button class="btn btn-ok"   style="display:none" title="Guardar">✅</button>
                  <button class="btn btn-cancel" style="display:none" title="Cancelar">❌</button>
                ` : ``}
              </div>
            </td>
          `;
          tablaBody.appendChild(tr);

          totalPrevios += montoVal + tipVal;
        });
      });

    } else {
      if (labelTarjetasCargadas) labelTarjetasCargadas.style.display = "none";
    }

    if (totalTarjetasPrevias) totalTarjetasPrevias.innerText = fmt(totalPrevios);
    if (totalTarjetasNuevas)  totalTarjetasNuevas.innerText  = fmt(0);
  }

  // ---------- Delegación de eventos (borrar/editar/crear) ----------
  tablaBody?.addEventListener("click", function (e) {
    const caja = cajaSelect.value;
    const target = e.target;

    if (target.classList.contains("btn-borrar-grupo")) {
      if (!canActUI()) { alert("No tenés permisos para borrar este grupo."); return; }
      const terminal = target.dataset.terminal || '';
      const lote = target.dataset.lote || '';
      const id = (tarjetasCargadasHoyPorCaja[caja] || []).find(x => String(x.terminal)===String(terminal) && String(x.lote)===String(lote))?.id;
      if (!id) { alert("No se encontró el grupo en BD."); return; }
      if (!confirm("Vas a borrar TODO el grupo (fecha, caja, terminal y lote). ¿Continuar?")) return;

      fetch(`/tarjetas/${id}`, { method:"DELETE" })
        .then(async r => {
          if (!r.ok) { const txt = await r.text(); if (r.status===409) alert("No permitido."); else alert("Error al borrar: "+(txt||r.status)); return null; }
          return r.json();
        })
        .then(async data => {
          if (!data) return;
          if (data.success) {
            await refrescarEstadoCaja({ reRender:false });
            if (window.OrqTabs) OrqTabs.reload('tarjetas'); else legacyReload();
          } else {
            alert("❌ " + (data.msg || "Error al borrar grupo"));
          }
        })
        .catch(()=>alert("❌ Error de red"));
      return;
    }

    const field = target.closest(".field");
    if (!field) return;

    const isMonto = field.dataset.type === "monto";
    const isTip   = field.dataset.type === "tip";
    const id      = (field.dataset.id || "").trim();          // si está vacío => aún no existe en BD
    const tarjeta = field.dataset.tarjeta || "";
    const terminal= field.dataset.terminal || "";
    const lote    = field.dataset.lote || "";

    if (target.classList.contains("btn-edit")) {
      if (!canActUI()) { alert("No tenés permisos para editar."); return; }
      const view = field.querySelector(".view");
      const input = field.querySelector(".edit");
      const ok = field.querySelector(".btn-ok");
      const cancel = field.querySelector(".btn-cancel");
      const actual = (view?.innerText || "").replace(/[^\d,.-]/g, "");
      input.value = actual;
      view.style.display = "none";
      input.style.display = "inline-block";
      ok.style.display = "inline-block";
      cancel.style.display = "inline-block";
      target.style.display = "none";
      return;
    }

    if (target.classList.contains("btn-cancel")) {
      const view = field.querySelector(".view");
      const input = field.querySelector(".edit");
      const ok = field.querySelector(".btn-ok");
      const edit = field.querySelector(".btn-edit");
      view.style.display = "inline";
      input.style.display = "none";
      ok.style.display = "none";
      target.style.display = "none";
      if (edit) edit.style.display = (canActUI() ? "inline" : "none");
      return;
    }

    if (target.classList.contains("btn-ok")) {
      const input = field.querySelector(".edit");
      const nuevo = parseMonto(input?.value || "0");

      if (id) {
        // ----- Actualiza registro existente (PUT)
        const body = {};
        if (isMonto) body.monto = nuevo;
        if (isTip)   body.monto_tip = nuevo;

        fetch(`/tarjetas/${id}`, {
          method:"PUT",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify(body)
        })
        .then(async r => {
          if (!r.ok) { const txt = await r.text(); if (r.status===409) alert("No permitido."); else alert("Error al actualizar: "+(txt||r.status)); return null; }
          return r.json();
        })
        .then(async data => {
          if (!data) return;
          if (data.success) {
            await refrescarEstadoCaja({ reRender:false });
            if (window.OrqTabs) OrqTabs.reload('tarjetas'); else legacyReload();
          } else {
            alert("❌ " + (data.msg || "No se pudo actualizar"));
          }
        })
        .catch(()=>alert("❌ Error de red"));

      } else {
        // ----- No existía registro: crear uno nuevo con el campo editado y el otro en 0
        const { caja, fecha, turno } = getCtx();
        const nuevoRegistro = {
          tarjeta,
          terminal,
          lote,
          monto: isMonto ? nuevo : 0,
          tip:   isTip   ? nuevo : 0
        };
        fetch("/guardar_tarjetas_lote", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ caja, fecha, turno, tarjetas: [nuevoRegistro] })
        })
        .then(r => r.json())
        .then(async data => {
          if (data && data.success) {
            if (window.OrqTabs) OrqTabs.reload('tarjetas'); else legacyReload();
            await refrescarEstadoCaja({ reRender:false });
            loadTerminalesLocal({ mergeFromToday:true });
          } else {
            alert("❌ Error: " + ((data && data.msg) || "No se pudo crear el registro"));
          }
        })
        .catch(()=>alert("❌ Error de red"));
      }
      return;
    }
  });

  // ---------- Añadir lote ----------
  btnAgregarLote?.addEventListener("click", () => {
    if (!canActUI()) { alert("No tenés permisos para añadir lote."); return; }
    const nuevoLote = (inputNuevoLote.value || "").trim();
    if (!nuevoLote) return alert("Debe ingresar un número de lote");
    const caja = cajaSelect.value;
    if (!terminalActivo) { alert("Primero seleccione/cree una Terminal."); return; }

    (lotesPorCajaTerminal[caja] ||= {});
    (loteActivoPorCajaTerminal[caja] ||= {});
    lotesPorCajaTerminal[caja][terminalActivo] = lotesPorCajaTerminal[caja][terminalActivo] || [];

    if (!lotesPorCajaTerminal[caja][terminalActivo].includes(nuevoLote)) {
      lotesPorCajaTerminal[caja][terminalActivo].push(nuevoLote);
    }
    loteActivoPorCajaTerminal[caja][terminalActivo] = nuevoLote;
    loteActivo = nuevoLote;

    renderLotes(caja);
    setLoteDisplay(loteActivo);
    inputNuevoLote.value = "";
  });

  // ---------- Cambio de terminal / lote ----------
  document.getElementById("terminalActivoTarj")?.addEventListener("change", () => {
    const caja = cajaSelect.value;
    terminalActivo = document.getElementById("terminalActivoTarj").value;
    terminalActivoPorCaja[caja] = terminalActivo;
    loteActivo = (loteActivoPorCajaTerminal[caja]?.[terminalActivo]) || null;
    renderLotes(caja);
    setLoteDisplay(loteActivo);
  });
  selectLote?.addEventListener("change", () => {
    const caja = cajaSelect.value;
    const val = selectLote.value || null;
    loteActivo = val;
    (loteActivoPorCajaTerminal[caja] ||= {});
    if (terminalActivo) loteActivoPorCajaTerminal[caja][terminalActivo] = val;
    setLoteDisplay(loteActivo);
  });

  // ---------- “+ Tips” (azul, blanco) ----------
  (function wireTipsButtons() {
    if (!tarjetaForm) return;
    const rows = tarjetaForm.querySelectorAll(".tarjeta-row");
    rows.forEach(row => {
      const montoInp = row.querySelector(".input-monto");
      if (!montoInp) return;

      let btn = row.querySelector(".btn-tip");
      if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-tip btn-submit";
        btn.textContent = "+ Tips";
        montoInp.parentElement.appendChild(btn);
      }

      let tipInp = row.querySelector(".input-tip");
      if (!tipInp) {
        tipInp = document.createElement("input");
        tipInp.type = "text";
        tipInp.placeholder = "0,00";
        tipInp.className = "input-tip";
        montoInp.parentElement.appendChild(tipInp);
      }

      btn.addEventListener("click", () => {
        tipInp.style.display = tipInp.style.display === "none" || !tipInp.style.display ? "inline-block" : "none";
        if (tipInp.style.display !== "none") tipInp.focus();
      });
    });
  })();

  // ---------- Submit: guarda DIRECTO en BD ----------
  tarjetaForm?.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!canActUI()) { alert("No tenés permisos para añadir."); return; }
    const { caja, fecha, turno } = getCtx();
    if (!terminalActivo) return alert("Debe seleccionar una Terminal");
    if (!loteActivo)    return alert("Debe agregar/seleccionar un Lote");

    const tarjetas = [];
    const rows = tarjetaForm.querySelectorAll(".tarjeta-row");
    rows.forEach(row => {
      const tarjeta = row.dataset.tarjeta;
      const montoInp = row.querySelector(".input-monto");
      const tipInp   = row.querySelector(".input-tip");
      let monto = parseMonto(montoInp?.value || "");
      let tip   = parseMonto(tipInp?.value   || "");
      if (isNaN(monto) || (!monto && !tip)) return; // al menos algo
      tarjetas.push({ tarjeta, monto, tip, lote: loteActivo, terminal: terminalActivo });
      if (montoInp) montoInp.value = "";
      if (tipInp)   tipInp.value = "";
    });

    if (tarjetas.length === 0) return alert("No hay datos para guardar");

    fetch("/guardar_tarjetas_lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caja, fecha, turno, tarjetas })
    })
    .then(r => r.json())
    .then(async data => {
      if (data && data.success) {
        if (window.OrqTabs) OrqTabs.reload('tarjetas'); else legacyReload();
        await refrescarEstadoCaja({ reRender:false });
        loadTerminalesLocal({ mergeFromToday:true });
      } else {
        alert("❌ Error: " + ((data && data.msg) || "No se pudo guardar"));
      }
    })
    .catch(()=>alert("❌ Error de red"));
  });

  // Compatibilidad: botón “Guardar Tarjetas” dispara submit del form
  btnGuardarTarjetas?.addEventListener("click", () => {
    tarjetaForm?.requestSubmit?.();
  });

  // ---------- Fallback (sin OrqTabs) ----------
  function legacyReload() {
    const { local, caja, fecha, turno } = getCtx();
    const qTar = fetch(`/tarjetas_cargadas_hoy?caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`)
      .then(r=>r.json()).catch(()=>[]);
    const qEC = fetch(`/estado_caja?local=${encodeURIComponent(local)}&caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`)
      .then(r=>r.json()).catch(()=>({estado:1}));
    const qEL = fetch(`/estado_local?fecha=${encodeURIComponent(fecha)}`)
      .then(r=>r.json()).catch(()=>({ok:true, estado:1}));

    Promise.all([qTar,qEC,qEL]).then(([arrTar, estCaja, estLocal]) => {
      window.cajaCerrada = ((estCaja?.estado ?? 1) === 0);
      localCerrado = ((estLocal?.estado ?? 1) === 0);
      toggleUIByEstado();
      applyFromServer(caja, arrTar);
      renderTerminales(caja);
      renderTabla(caja);
      loadTerminalesLocal({ mergeFromToday:true });
      setLoteDisplay(loteActivo);
    });
  }

  // ---------- Aplicar dataset del servidor ----------
  function applyFromServer(caja, arrTar) {
    const normalizados = (arrTar || []).map(d => ({
      id: d.id,
      tarjeta: d.tarjeta,
      lote: d.lote,
      terminal: d.terminal || null,
      monto: parseFloat(d.monto || 0),
      monto_tip: parseFloat(d.monto_tip || 0)
    }));

    // preservamos anteriores si server viene vacío
    const anteriores = tarjetasCargadasHoyPorCaja[caja] || [];
    tarjetasCargadasHoyPorCaja[caja] = normalizados.length ? normalizados : anteriores;

    // Construimos lotes/terminales sin borrar lo que ya había si viene vacío
    const termSetServer = new Set();
    const lotesMapServer = {};
    (normalizados.length ? normalizados : anteriores).forEach(r => {
      const term = r.terminal || '';
      const lote = r.lote || '';
      if (term) { termSetServer.add(term); (lotesMapServer[term] ||= new Set()).add(lote); }
      else if (lote) { (lotesMapServer[""] ||= new Set()).add(lote); }
    });

    const prevTerms = new Set(terminalesPorCaja[caja] || []);
    const mergedTerms = new Set([...prevTerms, ...termSetServer]);
    terminalesPorCaja[caja] = Array.from(mergedTerms);

    lotesPorCajaTerminal[caja] = lotesPorCajaTerminal[caja] || {};
    Object.keys(lotesMapServer).forEach(t => {
      const arr = Array.from(lotesMapServer[t]);
      lotesPorCajaTerminal[caja][t] = Array.from(new Set([...(lotesPorCajaTerminal[caja][t] || []), ...arr]));
    });

    // Mantener terminal/lote activos válidos
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
    setLoteDisplay(loteActivo);
  }

  // ---------- Hook OrqTabs ----------
  window.renderTarjetas = function (data, opts = {}) {
    const caja = cajaSelect.value;
    const map = opts.datasets || {};
    const epTar = Object.keys(map).find(k => k.includes('tarjetas_cargadas_hoy')) || Object.keys(map)[0];
    const epEC  = Object.keys(map).find(k => k.includes('estado_caja'));
    const epEL  = Object.keys(map).find(k => k.includes('estado_local'));
    const arrTar = Array.isArray(map[epTar]) ? map[epTar] : (Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []));

    if (epEC && map[epEC] && typeof map[epEC] === 'object') {
      window.cajaCerrada = ((map[epEC].estado ?? 1) === 0);
    }
    if (epEL && map[epEL] && typeof map[epEL] === 'object') {
      localCerrado = ((map[epEL].estado ?? 1) === 0);
    }
    toggleUIByEstado();

    applyFromServer(caja, arrTar);
    refrescarEstadoCaja({ reRender: false }).finally(() => {
      renderTerminales(caja);
      renderTabla(caja);
      loadTerminalesLocal({ mergeFromToday:true });
      setLoteDisplay(loteActivo);
    });
  };

  // ---------- Init ----------
  const cajaInicial = cajaSelect.value;
  (tarjetasCargadasHoyPorCaja[cajaInicial] ||= []);
  (terminalesPorCaja[cajaInicial] ||= []);
  (lotesPorCajaTerminal[cajaInicial] ||= {});
  (loteActivoPorCajaTerminal[cajaInicial] ||= {});
  terminalActivoPorCaja[cajaInicial] = terminalesPorCaja[cajaInicial][0] || null;
  terminalActivo = terminalActivoPorCaja[cajaInicial];

  renderTerminales(cajaInicial);
  renderLotes(cajaInicial);

  (async () => {
    await refrescarEstadoCaja({ reRender: false });
    legacyReload();
    loadTerminalesLocal(); // llena el selector desde el endpoint {success, items:[...]}
  })();

  cajaSelect?.addEventListener("change", async () => {
    await refrescarEstadoCaja({ reRender: false });
    legacyReload();
    loadTerminalesLocal();
  });
  fechaGlobalInput?.addEventListener("change", async () => {
    await refrescarEstadoCaja({ reRender: false });
    legacyReload();
  });
  turnoSelect?.addEventListener("change", async () => {
    await refrescarEstadoCaja({ reRender: false });
    legacyReload();
  });
});
