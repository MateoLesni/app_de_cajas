// static/js/resumen_local.js
// =====================================================
// Resumen Local (numéricos + documentos) con guardia anti-doble init
// Endpoints usados:
//   GET  /api/resumen_local?local=...&fecha=YYYY-MM-DD
//   GET  /estado_local?fecha=YYYY-MM-DD
//   POST /api/cierre_local {fecha}
//   GET  /files/summary_media?local=...&fecha=YYYY-MM-DD
//   GET  /files/view?id=...
// =====================================================
(function () {
  // ---- EVITA DOBLE INICIALIZACIÓN ----
  if (window.__RL_INITED__) return;
  window.__RL_INITED__ = true;

  // ----------------- Estado del Toggle -----------------
  // Para nivel 2: "operacion" (por defecto cuando local cerrado) = tablas snap_ (lo que envió el encargado)
  //               Si local abierto: no usa botón, consulta tablas normales (dataSource = null)
  // Para nivel 3: "admin" (por defecto) = tablas normales (datos de auditoría)
  let dataSource = null; // Se inicializa en DOMContentLoaded según el nivel
  let localCerrado = false; // Estado del local (se actualiza en cada refresh)

  // ----------------- Estado de Carga y Sincronización -----------------
  let isLoading = false;  // Flag para evitar múltiples cargas simultáneas
  let lastSuccessfulLoad = null;  // Timestamp de última carga exitosa
  let loadAttempts = 0;  // Contador de intentos para detectar problemas persistentes

  // ----------------- Utils -----------------
  const fmt = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (v) => fmt.format(Number(v ?? 0));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const nowTime = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const setText = (id, val) => {
    const el = typeof id === "string" ? document.getElementById(id) : id;
    if (el) el.textContent = val;
  };
  const setTodayIfEmpty = (input) => {
    if (!input || input.value) return;
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    const fechaHoy = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    input.value = fechaHoy;
    // Guardar también en localStorage para que persista
    if (input.id === 'rl-fecha') {
      localStorage.setItem('rl_fecha_selected', fechaHoy);
      console.log('📅 setTodayIfEmpty: Fecha establecida y guardada:', fechaHoy);
    }
  };

  // copy helpers
  function getCopyTextFromElement(el) {
    if (!el) return "";
    if (el.dataset?.copy) return String(el.dataset.copy);
    const clone = el.cloneNode(true);
    clone.querySelectorAll?.(".copy-btn")?.forEach((b) => b.remove());
    return (clone.textContent || "").trim();
  }
  function addCopyButton(target, getTextFn) {
    if (!target || target.querySelector(":scope > .copy-btn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    Object.assign(btn.style, {
      marginLeft: "6px", fontSize: "11px", lineHeight: "1",
      padding: "2px 6px", border: "1px solid #cbd5e1", borderRadius: "6px",
      background: "#f8fafc", cursor: "pointer"
    });
    btn.title = "Copiar";
    btn.textContent = "⧉";
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        const txt = typeof getTextFn === "function" ? String(getTextFn()) : getCopyTextFromElement(target);
        await navigator.clipboard.writeText(txt);
        btn.textContent = "✔";
      } catch { btn.textContent = "!"; }
      setTimeout(() => (btn.textContent = "⧉"), 900);
    });
    target.appendChild(btn);
  }
  function setMoneyWithCopy(id, val) {
    const el = typeof id === "string" ? document.getElementById(id) : id;
    if (!el) return;
    const txt = money(val);
    el.textContent = txt;
    el.dataset.copy = txt;
    addCopyButton(el, () => txt);
  }

  // ----------------- Acordeones numéricos -----------------
  function toggleAria(el) { if (!el) return; el.setAttribute("aria-expanded", el.getAttribute("aria-expanded") === "true" ? "false" : "true"); }
  function bindGeneralAccordions() { $$(".sl-section.acc").forEach((s) => s.querySelector(".sl-title")?.addEventListener("click", () => toggleAria(s))); }
  function bindSubAccordions() {
    $$(".sub-acc.acc").forEach((sub) => {
      const row = sub.querySelector(".sl-row");
      if (!sub.hasAttribute("aria-expanded")) sub.setAttribute("aria-expanded", "false");
      row?.addEventListener("click", () => toggleAria(sub));
    });
  }

  // ----------------- Ventas Z formatter -----------------
  function formatZDisplay(it) {
    const back = (it?.z_display || "").toString().trim();
    if (back) return back;
    const pv = String(it?.z_pv ?? it?.pv ?? it?.pto_venta ?? it?.punto_venta ?? it?.pv_numero ?? 0).replace(/\D+/g, "");
    const num = String(it?.z_numero ?? it?.numero_z ?? it?.nro_z ?? it?.num_z ?? it?.numero ?? it?.z ?? 0).replace(/\D+/g, "");
    return `${pv.padStart(5, "0")}-${num.padStart(8, "0")}`;
  }

  // ----------------- RENDER: panel numérico -----------------
  function addCopyToLabelCellsWithin(container) {
    if (!container) return;
    container.querySelectorAll("tbody tr").forEach((tr) => {
      const td = tr.querySelector("td:first-child");
      if (td) addCopyButton(td, () => getCopyTextFromElement(td));
    });
  }

  function renderResumen(data) {
    // meta
    const inFecha = $("#rl-fecha");
    setText("rl-fecha-display", inFecha?.value || "—");
    setText("rl-hora-display", nowTime());

    // N° Recibo Oppen (solo si existe)
    const reciboWrapper = $("#rl-recibo-oppen-wrapper");
    if (reciboWrapper) {
      if (data.sernr_recibo_oppen) {
        setText("rl-recibo-oppen", data.sernr_recibo_oppen);
        reciboWrapper.style.display = "";
      } else {
        reciboWrapper.style.display = "none";
      }
    }

    // Mostrar timestamp del servidor y fuente de datos para transparencia
    const serverTime = data.server_timestamp ? new Date(data.server_timestamp).toLocaleString("es-AR") : "—";
    const dataSource = data.data_source === "snap" ? "Snapshot (Operación)" : "Datos en vivo (Administración)";
    setText("rl-updated-at", `${serverTime} | ${dataSource}`);

    // --- RESUMEN ---
    const r = data?.resumen || {};
    setMoneyWithCopy("rl-venta-total", r.venta_total);
    setMoneyWithCopy("rl-total-cobrado", r.total_cobrado);
    setMoneyWithCopy("rl-diferencia", r.diferencia);
    $("#rl-diferencia")?.classList.toggle("negative-amount", Number(r.diferencia ?? 0) < 0);

    // --- DIFERENCIAS DETALLADAS (Acordeón) ---
    const divDescargos = $("#rl-diferencias-descargos");
    if (divDescargos) {
      divDescargos.innerHTML = "";
      const diferencias = Array.isArray(r.diferencias_detalle) ? r.diferencias_detalle : [];

      if (!diferencias.length) {
        divDescargos.innerHTML = '<div style="padding: 12px 14px; color: #6b7280; font-style: italic;">Sin diferencias</div>';
      } else {
        // Detectar nivel de usuario y estado del local
        const btnToggle = $("#rl-toggle-source");
        const userLevel = btnToggle ? parseInt(btnToggle.getAttribute("data-role-level") || "1") : 1;
        const canEdit = userLevel === 2 && !localCerrado;

        diferencias.forEach((item, idx) => {
          const difTxt = money(item.diferencia ?? 0);
          const descargo = (item.descargo || '').trim();

          const bloque = document.createElement("div");
          bloque.className = "diferencia-bloque";
          bloque.style.cssText = "padding: 10px 14px; margin-bottom: 8px; background: #eef1f5; border-left: 3px solid #6c757d; border-radius: 4px; position: relative;";

          // Título con diferencia
          const titulo = document.createElement("div");
          titulo.style.cssText = "font-weight: 600; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;";

          const tituloTexto = document.createElement("span");
          tituloTexto.innerHTML = `${item.caja} - ${item.turno}: <span style="color: ${Number(item.diferencia ?? 0) < 0 ? '#b91c1c' : '#059669'};">(Diferencia: ${difTxt})</span>`;
          titulo.appendChild(tituloTexto);

          // Lápiz editable solo para nivel 2 con local abierto
          if (canEdit) {
            const btnEdit = document.createElement("button");
            btnEdit.innerHTML = "✏️";
            btnEdit.style.cssText = "background: none; border: none; cursor: pointer; font-size: 16px; padding: 2px 6px; opacity: 0.7; transition: opacity 0.2s;";
            btnEdit.title = "Editar observación";
            btnEdit.onmouseover = () => btnEdit.style.opacity = "1";
            btnEdit.onmouseout = () => btnEdit.style.opacity = "0.7";
            btnEdit.onclick = () => editarObservacionDiferencia(item.caja, item.turno, descargo);
            titulo.appendChild(btnEdit);
          }

          bloque.appendChild(titulo);

          // Descargo
          const descargoDiv = document.createElement("div");
          descargoDiv.style.cssText = "color: #495057; font-style: italic; font-size: 13px; line-height: 1.5;";
          descargoDiv.textContent = descargo || "Sin observación";
          descargoDiv.id = `descargo-${item.caja}-${item.turno}`.replace(/\s+/g, '-');
          bloque.appendChild(descargoDiv);

          divDescargos.appendChild(bloque);
        });
      }
    }

    // --- FACTURAS (Ventas Z, A, B) ---
    const index = data?.index || {};
    const facturas = data?.info?.facturas || {};

    // Ventas Z
    setMoneyWithCopy("rl-vz-total", index.vta_z_total);
    setMoneyWithCopy("rl-vz-total-foot", index.vta_z_total);
    setMoneyWithCopy("rl-discovery", index.discovery);

    const tbVz = $("#rl-vz-items");
    if (tbVz) {
      tbVz.innerHTML = "";
      const items = Array.isArray(index.z_items) ? index.z_items : [];
      if (!items.length) {
        const tr = document.createElement("tr"); tr.className = "muted";
        const td = document.createElement("td"); td.colSpan = 2; td.textContent = "Sin ventas z cargadas";
        tr.appendChild(td); tbVz.appendChild(tr);
      } else {
        items.forEach((it) => {
          const tr = document.createElement("tr");
          let display = formatZDisplay(it);
          if (it.sernr_oppen) display += ` (N\u00b0 Oppen: ${it.sernr_oppen})`;
          const tdName = document.createElement("td");
          tdName.textContent = display; tdName.dataset.copy = display; addCopyButton(tdName, () => display);
          const tdAmt = document.createElement("td");
          const amtTxt = money(it?.monto ?? 0);
          tdAmt.className = "r"; tdAmt.textContent = amtTxt; tdAmt.dataset.copy = amtTxt; addCopyButton(tdAmt, () => amtTxt);
          tr.appendChild(tdName); tr.appendChild(tdAmt); tbVz.appendChild(tr);
        });
      }
      const vzTbl = tbVz.closest("table"); if (vzTbl) addCopyToLabelCellsWithin(vzTbl);
      const vzFoot = $("#rl-vz-total-foot"); if (vzFoot) addCopyButton(vzFoot, () => vzFoot.textContent || "");
    }

    // Facturas A
    setMoneyWithCopy("rl-fa-total", facturas.a);
    setMoneyWithCopy("rl-fa-total-foot", facturas.a);

    const tbFa = $("#rl-fa-items");
    if (tbFa) {
      tbFa.innerHTML = "";
      const itemsA = Array.isArray(facturas.a_items) ? facturas.a_items : [];
      if (!itemsA.length) {
        const tr = document.createElement("tr"); tr.className = "muted";
        const td = document.createElement("td"); td.colSpan = 2; td.textContent = "Sin facturas A cargadas";
        tr.appendChild(td); tbFa.appendChild(tr);
      } else {
        itemsA.forEach((it) => {
          const tr = document.createElement("tr");
          let display = formatZDisplay(it);
          if (it.sernr_oppen) display += ` (N\u00b0 Oppen: ${it.sernr_oppen})`;
          const tdName = document.createElement("td");
          tdName.textContent = display; tdName.dataset.copy = display; addCopyButton(tdName, () => display);
          const tdAmt = document.createElement("td");
          const amtTxt = money(it?.monto ?? 0);
          tdAmt.className = "r"; tdAmt.textContent = amtTxt; tdAmt.dataset.copy = amtTxt; addCopyButton(tdAmt, () => amtTxt);
          tr.appendChild(tdName); tr.appendChild(tdAmt); tbFa.appendChild(tr);
        });
      }
      const faTbl = tbFa.closest("table"); if (faTbl) addCopyToLabelCellsWithin(faTbl);
      const faFoot = $("#rl-fa-total-foot"); if (faFoot) addCopyButton(faFoot, () => faFoot.textContent || "");
    }

    // Facturas B
    setMoneyWithCopy("rl-fb-total", facturas.b);
    setMoneyWithCopy("rl-fb-total-foot", facturas.b);

    const tbFb = $("#rl-fb-items");
    if (tbFb) {
      tbFb.innerHTML = "";
      const itemsB = Array.isArray(facturas.b_items) ? facturas.b_items : [];
      if (!itemsB.length) {
        const tr = document.createElement("tr"); tr.className = "muted";
        const td = document.createElement("td"); td.colSpan = 2; td.textContent = "Sin facturas B cargadas";
        tr.appendChild(td); tbFb.appendChild(tr);
      } else {
        itemsB.forEach((it) => {
          const tr = document.createElement("tr");
          let display = formatZDisplay(it);
          if (it.sernr_oppen) display += ` (N\u00b0 Oppen: ${it.sernr_oppen})`;
          const tdName = document.createElement("td");
          tdName.textContent = display; tdName.dataset.copy = display; addCopyButton(tdName, () => display);
          const tdAmt = document.createElement("td");
          const amtTxt = money(it?.monto ?? 0);
          tdAmt.className = "r"; tdAmt.textContent = amtTxt; tdAmt.dataset.copy = amtTxt; addCopyButton(tdAmt, () => amtTxt);
          tr.appendChild(tdName); tr.appendChild(tdAmt); tbFb.appendChild(tr);
        });
      }
      const fbTbl = tbFb.closest("table"); if (fbTbl) addCopyToLabelCellsWithin(fbTbl);
      const fbFoot = $("#rl-fb-total-foot"); if (fbFoot) addCopyButton(fbFoot, () => fbFoot.textContent || "");
    }

    // --- VENTAS POR MEDIO ---
    const info = data?.info || {};

    // Efectivo
    const ef = info?.efectivo || {};
    setMoneyWithCopy("rl-cash", Number(ef.total ?? 0));
    setMoneyWithCopy("rl-remesas", Number(ef.remesas ?? 0));
    setMoneyWithCopy("rl-cash-neto", Number(ef.neto_efectivo ?? 0));

    // Combinar todas las remesas (retiradas + no retiradas) y ordenar
    const todasRemesas = [...(ef.retiradas || []), ...(ef.no_retiradas || [])];
    // Ordenar por número de remesa
    todasRemesas.sort((a, b) => {
      const numA = parseInt(a.nro_remesa) || 0;
      const numB = parseInt(b.nro_remesa) || 0;
      return numA - numB;
    });
    renderRemesasTable("rl-remesas-items", todasRemesas);

    // Tarjetas
    const tj = info?.tarjeta || {};
    setMoneyWithCopy("rl-card", Number(tj.total ?? 0));
    const bk = tj.breakdown || {};
    const idMap = {
      "VISA": "rl-tj-visa",
      "VISA DEBITO": "rl-tj-visa-deb",
      "VISA DÉBITO": "rl-tj-visa-deb",
      "VISA PREPAGO": "rl-tj-visa-pre",
      "MASTERCARD": "rl-tj-mc",
      "MASTERCARD DEBITO": "rl-tj-mc-deb",
      "MASTERCARD DÉBITO": "rl-tj-mc-deb",
      "MASTERCARD PREPAGO": "rl-tj-mc-pre",
      "CABAL": "rl-tj-cabal",
      "CABAL DEBITO": "rl-tj-cabal-deb",
      "CABAL DÉBITO": "rl-tj-cabal-deb",
      "AMEX": "rl-tj-amex",
      "MAESTRO": "rl-tj-maestro",
      "NARANJA": "rl-tj-naranja",
      "DECIDIR": "rl-tj-decidir",
      "DINERS": "rl-tj-diners",
      "PAGOS INMEDIATOS": "rl-tj-pagos-inm",
    };
    // limpia todo y luego setea reales
    Object.values(idMap).forEach((id) => setMoneyWithCopy(id, 0));
    Object.entries(bk).forEach(([marca, val]) => {
      const id = idMap[marca] || null;
      if (id) setMoneyWithCopy(id, Number(val ?? 0));
    });
    setMoneyWithCopy("rl-card-total", Number(tj.total ?? 0));

    // Otros medios
    const mp = info?.mercadopago || {};
    setMoneyWithCopy("rl-mp", Number(mp.total ?? 0));
    setMoneyWithCopy("rl-mp-tips", Number(mp.tips ?? 0));

    const rp = info?.rappi || {};
    setMoneyWithCopy("rl-rappi", Number(rp.total ?? 0));
    setMoneyWithCopy("rl-rappi-det", Number(rp.total ?? 0));

    const py = info?.pedidosya || {};
    setMoneyWithCopy("rl-pedidosya", Number(py.total ?? 0));
    setMoneyWithCopy("rl-pedidosya-det", Number(py.total ?? 0));

    const gg = info?.gastos || {};
    setMoneyWithCopy("rl-gastos", Number(gg.total ?? 0));
    setMoneyWithCopy("rl-g-caja", Number(gg.caja_chica ?? 0));
    setMoneyWithCopy("rl-g-otros", Number(gg.otros ?? 0));
    setMoneyWithCopy("rl-g-total", Number(gg.total ?? 0));

    const cc = info?.cuenta_cte || {};
    setMoneyWithCopy("rl-cta-cte", Number(cc.total ?? 0));
    setMoneyWithCopy("rl-cta-cte-foot", Number(cc.total ?? 0));

    // Renderizar items de Cuenta Corriente (CC viejas + nuevas)
    const tbCc = $("#rl-cc-items");
    if (tbCc) {
      tbCc.innerHTML = "";
      const ccItems = [
        ...(Array.isArray(cc.cc_items) ? cc.cc_items : []),
        ...(Array.isArray(cc.cc_nuevas_items) ? cc.cc_nuevas_items : [])
      ];
      if (!ccItems.length) {
        const tr = document.createElement("tr"); tr.className = "muted";
        const td = document.createElement("td"); td.colSpan = 2; td.textContent = "Sin cuentas corrientes cargadas";
        tr.appendChild(td); tbCc.appendChild(tr);
      } else {
        ccItems.forEach((it) => {
          const tr = document.createElement("tr");
          let display = formatZDisplay(it);
          if (it.sernr_oppen) display += ` (N° Oppen: ${it.sernr_oppen})`;
          if (it.cliente) display += ` - ${it.cliente}`;
          const tdName = document.createElement("td");
          tdName.textContent = display; tdName.dataset.copy = display; addCopyButton(tdName, () => display);
          const tdAmt = document.createElement("td");
          const amtTxt = money(it?.monto ?? 0);
          tdAmt.className = "r"; tdAmt.textContent = amtTxt; tdAmt.dataset.copy = amtTxt; addCopyButton(tdAmt, () => amtTxt);
          tr.appendChild(tdName); tr.appendChild(tdAmt); tbCc.appendChild(tr);
        });
      }
      const ccTbl = tbCc.closest("table"); if (ccTbl) addCopyToLabelCellsWithin(ccTbl);
      const ccFoot = $("#rl-cta-cte-foot"); if (ccFoot) addCopyButton(ccFoot, () => ccFoot.textContent || "");
    }

    // Anticipos
    const ant = info?.anticipos || {};
    setMoneyWithCopy("rl-anticipos", Number(ant.total ?? 0));

    // Renderizar detalle de anticipos
    const anticiposItems = ant.items || [];
    const anticiposDetalleTable = document.getElementById("rl-anticipos-detalle");
    if (anticiposDetalleTable) {
      if (anticiposItems.length === 0) {
        anticiposDetalleTable.innerHTML = '<tr><td colspan="2" style="text-align:center; color:#6b7280;">No hay anticipos consumidos</td></tr>';
      } else {
        let html = '';
        anticiposItems.forEach(item => {
          const comentario = item.comentario || '-';
          const caja = item.caja || '-';
          const monto = money(Number(item.monto || 0));
          html += `<tr><td>${comentario} (Caja: ${caja})</td><td class="r">${monto}</td></tr>`;
        });
        html += `<tr class="sl-total"><td>Total Anticipos</td><td class="r">${money(Number(ant.total ?? 0))}</td></tr>`;
        anticiposDetalleTable.innerHTML = html;
      }
    }

    // Anticipos recibidos efectivo
    const antEf = info?.anticipos_efectivo || {};
    const antEfVal = Number(antEf.total ?? 0);
    const elAntEf = document.getElementById("rl-anticipos-efectivo");
    if (elAntEf) {
      elAntEf.textContent = antEfVal > 0 ? '-' + money(antEfVal) : money(0);
      elAntEf.dataset.copy = elAntEf.textContent;
    }

    // Tips
    const tips = info?.tips || {};
    setMoneyWithCopy("rl-tips", Number(tips.total ?? 0));
    setMoneyWithCopy("rl-tips-det", Number(tips.total ?? 0));
    setMoneyWithCopy("rl-tips-mp", Number(tips.mp ?? 0));
    setMoneyWithCopy("rl-tips-tarjetas", Number(tips.tarjetas ?? 0));
    const tbTips = tips.breakdown || {};
    const tipMap = {
      "VISA": "rl-tip-visa",
      "VISA DEBITO": "rl-tip-visa-deb",
      "VISA DÉBITO": "rl-tip-visa-deb",
      "VISA PREPAGO": "rl-tip-visa-pre",
      "MASTERCARD": "rl-tip-mc",
      "MASTERCARD DEBITO": "rl-tip-mc-deb",
      "MASTERCARD DÉBITO": "rl-tip-mc-deb",
      "MASTERCARD PREPAGO": "rl-tip-mc-pre",
      "CABAL": "rl-tip-cabal",
      "CABAL DEBITO": "rl-tip-cabal-deb",
      "CABAL DÉBITO": "rl-tip-cabal-deb",
      "AMEX": "rl-tip-amex",
      "MAESTRO": "rl-tip-maestro",
      "NARANJA": "rl-tip-naranja",
      "DECIDIR": "rl-tip-decidir",
      "DINERS": "rl-tip-diners",
      "PAGOS INMEDIATOS": "rl-tip-pagos-inm",
    };
    Object.values(tipMap).forEach((id) => setMoneyWithCopy(id, 0));
    Object.entries(tbTips).forEach(([marca, val]) => {
      const id = tipMap[marca] || null;
      if (id) setMoneyWithCopy(id, Number(val ?? 0));
    });

    // copy en labels
    ["rl-tj-visa", "rl-mp-tips", "rl-rappi-det", "rl-pedidosya-det", "rl-g-total", "rl-cta-cte-det", "rl-tips-det"]
      .map((id) => document.getElementById(id)?.closest("table"))
      .forEach((tbl) => { if (tbl) addCopyToLabelCellsWithin(tbl); });
  }

  // ----------------- Loading State Management -----------------
  function showLoadingOverlay(message = "Cargando datos del cierre...") {
    let overlay = $("#rl-loading-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "rl-loading-overlay";
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.85); z-index: 10000;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        color: white; font-size: 18px; font-weight: 600;
      `;
      overlay.innerHTML = `
        <div style="text-align: center;">
          <div class="spinner" style="
            border: 4px solid rgba(255,255,255,0.3);
            border-top: 4px solid white;
            border-radius: 50%; width: 50px; height: 50px;
            animation: spin 1s linear infinite; margin: 0 auto 20px;
          "></div>
          <div id="rl-loading-message">${message}</div>
          <div id="rl-loading-detail" style="font-size: 14px; color: #cbd5e1; margin-top: 8px;"></div>
        </div>
        <style>
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      `;
      document.body.appendChild(overlay);
    }
    const msg = overlay.querySelector("#rl-loading-message");
    if (msg) msg.textContent = message;
    overlay.style.display = "flex";
    return overlay;
  }

  function updateLoadingDetail(detail) {
    const el = $("#rl-loading-detail");
    if (el) el.textContent = detail;
  }

  function hideLoadingOverlay() {
    const overlay = $("#rl-loading-overlay");
    if (overlay) overlay.style.display = "none";
  }

  function showErrorAlert(message, canRetry = true) {
    const html = canRetry
      ? `${message}\n\n¿Desea reintentar la carga?`
      : message;

    if (canRetry) {
      if (confirm(html)) {
        refreshAll();
      }
    } else {
      alert(html);
    }
  }

  // ----------------- Fetch & estado local -----------------
  async function fetchResumenLocal(params) {
    updateLoadingDetail("Consultando resumen de cierres...");
    let url = `/api/resumen_local?local=${encodeURIComponent(params.local || "")}&fecha=${encodeURIComponent(params.fecha || "")}`;
    // Solo agregar 'source' si dataSource tiene valor (nivel 2 con local cerrado o nivel 3)
    if (dataSource) {
      url += `&source=${encodeURIComponent(dataSource)}`;
    }

    // Agregar timestamp único para forzar bypass de cualquier caché
    url += `&_t=${Date.now()}`;

    const r = await fetch(url, {
      cache: "no-store",
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

    if (!r.ok) {
      const errorText = await r.text().catch(() => "");
      throw new Error(`Error HTTP ${r.status}: ${errorText || "Error del servidor"}`);
    }

    const data = await r.json();

    // Validar que los datos tienen la estructura esperada
    if (!data || typeof data !== 'object') {
      throw new Error("Respuesta inválida del servidor: datos corruptos");
    }

    if (!data.resumen || !data.info) {
      throw new Error("Respuesta incompleta del servidor: faltan secciones críticas");
    }

    // Actualizar estado del local
    localCerrado = data.local_cerrado || false;

    // Agregar timestamp de carga
    data._loadedAt = new Date().toISOString();

    return data;
  }

  async function updateResumen() {
    // PRIORIDAD: leer del select, no del display (para evitar valores obsoletos)
    const selLocal = $("#rl-local-select");

    // Si existe el select, SOLO usar su valor (no usar SESSION_LOCAL como fallback)
    // Solo usar SESSION_LOCAL si NO existe el select (nivel 2 sin select)
    let local;
    if (selLocal) {
      local = (selLocal.value || "").trim();
    } else {
      local = (window.SESSION_LOCAL || "").trim();
    }

    const fecha = $("#rl-fecha")?.value;

    console.log('[updateResumen] Parámetros:', { local, fecha, tieneSelect: !!selLocal });

    // Validar que local y fecha existen
    if (!local || !fecha) {
      throw new Error("Falta seleccionar local o fecha");
    }

    // Validar que la fecha tiene formato válido (YYYY-MM-DD)
    const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!fechaRegex.test(fecha)) {
      console.warn('⚠️ Fecha inválida detectada:', fecha);
      throw new Error("Fecha inválida. Por favor, seleccione una fecha correcta.");
    }

    updateLoadingDetail("Obteniendo datos del cierre...");
    const data = await fetchResumenLocal({ local, fecha });

    updateLoadingDetail("Renderizando resumen...");
    renderResumen(data);

    updateLoadingDetail("Actualizando estado del local...");
    await refreshEstadoLocalBadge();

    updateToggleButtonVisibility(); // Actualizar visibilidad del botón según estado del local

    // Actualizar timestamp de última carga exitosa
    lastSuccessfulLoad = new Date();
    setText("rl-updated-at", lastSuccessfulLoad.toLocaleString("es-AR"));

    return data;
  }

  async function refreshEstadoLocalBadge() {
    const fecha = $("#rl-fecha")?.value;
    const selLocal = $("#rl-local-select");

    // Si existe el select, SOLO usar su valor (no usar SESSION_LOCAL como fallback)
    const local = selLocal ? (selLocal.value || "").trim() : (window.SESSION_LOCAL || "").trim();
    const badge = $("#rl-badge-estado");
    const btn = $("#rl-cerrar-local");

    if (!fecha || !local) {
      console.warn('[refreshEstadoLocalBadge] Faltan parámetros:', { fecha, local });
      return;
    }

    try {
      // Agregar timestamp para evitar caché
      const url = `/estado_local?fecha=${encodeURIComponent(fecha)}&local=${encodeURIComponent(local)}&_t=${Date.now()}`;
      console.log('[refreshEstadoLocalBadge] Consultando estado:', { fecha, local, url });

      const r = await fetch(url, {
        cache: "no-store",
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      const d = r.ok ? await r.json() : { ok: false };
      console.log('[refreshEstadoLocalBadge] Respuesta:', d);

      const abierto = (d?.estado ?? 1) === 1;
      console.log('[refreshEstadoLocalBadge] Estado interpretado:', { estado: d?.estado, abierto });

      if (badge) {
        badge.style.display = "inline-block";
        badge.textContent = abierto ? "ABIERTO" : "CERRADO";
        badge.classList.remove("sl-badge-open", "sl-badge-closed"); // Limpiar primero
        badge.classList.add(abierto ? "sl-badge-open" : "sl-badge-closed");
      }
      if (btn) {
        btn.disabled = !abierto;
        btn.title = abierto ? "Cerrar el Local del día" : "El local ya está cerrado";
      }
    } catch (error) {
      console.error('[refreshEstadoLocalBadge] Error:', error);
    }
  }

  async function cerrarLocal() {
    const fecha = $("#rl-fecha")?.value;
    if (!fecha) { alert("Seleccioná una fecha."); return; }
    if (!confirm(`Esto cerrará el LOCAL para ${fecha}.\n- Bloquea edición para nivel 2.\n- Genera el snapshot para auditoría.\n\n¿Confirmás?`)) return;
    const btn = $("#rl-cerrar-local");
    const oldTxt = btn ? btn.textContent : "";
    try {
      if (btn) { btn.disabled = true; btn.textContent = "Cerrando…"; }
      const r = await fetch("/api/cierre_local", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fecha })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.success) {
        if (r.status === 409 && data?.detalle?.length) alert(`No se puede cerrar: hay cajas sin cerrar.\nDetalle: ${data.detalle.join(", ")}`);
        else alert(`Error al cerrar el local: ${data?.msg || r.status}`);
        return;
      }
      alert("✅ Local cerrado y snapshot creado.");
      await updateResumen(); await refreshEstadoLocalBadge();
    } catch { alert("❌ Error de red."); }
    finally { if (btn) btn.textContent = oldTxt; }
  }

  // =====================================================
  //                DOCUMENTOS / IMÁGENES
  // =====================================================
  const ICON_DOWNLOAD = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v10m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICON_ZOOM = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  let _lastGroups = [];
  let _modalCurrentItem = null;

  function normalizeKey(raw) {
    const k = String(raw || "").toLowerCase();
    const map = { tarjetas: "tarjeta", tarjeta: "tarjeta", "ventas z": "ventas_z", ventasz: "ventas_z", mp: "mercadopago" };
    return map[k] || k;
  }
  function uniqueItems(items) {
    const seen = new Set();
    return (items || []).filter((it) => {
      const key = it.id || it.path || it.view_path || it.view_url || it.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function ensureGlobalDownloadButton() {
    const pill = document.getElementById("dl-all") || document.getElementById("doc-download-all");
    if (!pill) return;
    const ico = pill.querySelector(".ico");
    if (ico && !ico.firstChild) ico.innerHTML = ICON_DOWNLOAD;
    pill.title = "Descargar todas las imágenes";
    pill.onclick = downloadAll;
  }

  function buildThumbCard(it) {
    const card = document.createElement("div"); card.className = "thumb";
    const top = document.createElement("div"); top.className = "thumb-top";
    const img = document.createElement("img"); img.loading = "lazy"; img.decoding = "async"; img.alt = it.name || "imagen"; img.src = it.view_path || it.view_url || "";
    const fallback = document.createElement("div"); fallback.className = "media-fallback"; fallback.textContent = it.name || "Archivo";
    img.onerror = () => { img.style.display = "none"; fallback.style.display = "block"; };
    const actions = document.createElement("div"); actions.className = "thumb-actions";
    const bZoom = document.createElement("button"); bZoom.className = "icon-btn"; bZoom.title = "Ver"; bZoom.innerHTML = ICON_ZOOM; bZoom.addEventListener("click", (e) => { e.stopPropagation(); openModal(it); });
    const bDown = document.createElement("button"); bDown.className = "icon-btn"; bDown.title = "Descargar"; bDown.innerHTML = ICON_DOWNLOAD; bDown.addEventListener("click", (e) => { e.stopPropagation(); downloadSingle(it); });
    actions.appendChild(bZoom); actions.appendChild(bDown);
    top.appendChild(img); top.appendChild(actions);
    const meta = document.createElement("div"); meta.className = "meta"; meta.textContent = it.name || "—";
    card.appendChild(top); card.appendChild(meta); card.appendChild(fallback);
    card.addEventListener("click", () => openModal(it));
    return card;
  }

  function renderDocs(groups) {
    _lastGroups = [];
    const host = document.getElementById("doc-accordions");
    if (host) host.innerHTML = "";

    const byKey = {};
    (groups || []).forEach((g) => {
      const key = normalizeKey(g.key);
      const label = g.label || g.key;
      const clean = uniqueItems(g.items || []);
      if (!byKey[key]) byKey[key] = { key, label, items: [] };
      byKey[key].items = byKey[key].items.concat(clean);
    });

    const order = [
      ["remesas", "Remesas"],
      ["ventas_z", "Ventas Z"],
      ["facturas", "Facturas"],
      ["mercadopago", "Mercado Pago"],
      ["tarjeta", "Tarjeta"],
      ["rappi", "Rappi"],
      ["pedidosya", "PedidosYa"],
      ["gastos", "Gastos"],
      ["ctas_ctes", "Cuenta Cte."],  // Corregido: era 'cuenta_cte', ahora 'ctas_ctes' para coincidir con el tab real
    ];

    order.forEach(([key, fallbackLabel]) => {
      const g = byKey[key] || { key, label: fallbackLabel, items: [] };
      const count = (g.items || []).length;

      const acc = document.createElement("div"); acc.className = "doc-acc"; acc.setAttribute("aria-expanded", "false");
      const hdr = document.createElement("div"); hdr.className = "doc-row";
      const left = document.createElement("div"); left.className = "row-left";
      left.appendChild(document.createTextNode(g.label || fallbackLabel));
      const badge = document.createElement("span"); badge.className = "count"; badge.textContent = String(count);
      left.appendChild(badge);
      const actions = document.createElement("div"); actions.className = "doc-actions";
      const btn = document.createElement("button"); btn.className = "icon-btn"; btn.title = "Descargar este acordeón"; btn.innerHTML = ICON_DOWNLOAD;
      btn.addEventListener("click", (e) => { e.stopPropagation(); downloadGroup(key); });
      actions.appendChild(btn);
      hdr.appendChild(left); hdr.appendChild(actions);
      hdr.addEventListener("click", () => acc.setAttribute("aria-expanded", acc.getAttribute("aria-expanded") === "true" ? "false" : "true"));

      const body = document.createElement("div"); body.className = "acc-body";
      if (count) {
        const wrap = document.createElement("div"); wrap.className = "thumbs";
        g.items.forEach((it) => wrap.appendChild(buildThumbCard(it)));
        body.appendChild(wrap);
      } else {
        const empty = document.createElement("div"); empty.className = "muted"; empty.style.padding = "10px"; empty.textContent = "Sin imágenes cargadas";
        body.appendChild(empty);
      }

      acc.appendChild(hdr); acc.appendChild(body);
      host?.appendChild(acc);
      _lastGroups.push({ key, items: g.items || [] });
    });

    ensureGlobalDownloadButton();
  }

  function triggerDownload(href, filename) { const a = document.createElement("a"); a.href = href; if (filename) a.download = filename; a.rel = "noopener"; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 40); }
  function downloadSingle(item) { triggerDownload(item.view_path || item.view_url || "#", item.name || "archivo"); }
  function downloadGroup(key) { const g = (_lastGroups || []).find((x) => x.key === key); if (!g || !g.items?.length) return; let i = 0; (function tick() { if (i >= g.items.length) return; downloadSingle(g.items[i++]); setTimeout(tick, 150); })(); }
  function downloadAll() { const all = []; (_lastGroups || []).forEach((g) => (g.items || []).forEach((it) => all.push(it))); let i = 0; (function tick() { if (i >= all.length) return; downloadSingle(all[i++]); setTimeout(tick, 150); })(); }

  function openModal(it) {
    _modalCurrentItem = it;
    const img = document.getElementById("imgBig"); if (img) img.src = it.view_path || it.view_url || "";
    setText("imgCaption", it.name || "");
    document.getElementById("imgModal")?.classList.add("is-open");
    const b = document.getElementById("imgDownload"); if (b && !b.firstChild) b.innerHTML = ICON_DOWNLOAD;
  }
  function closeModal() { document.getElementById("imgModal")?.classList.remove("is-open"); const img = document.getElementById("imgBig"); if (img) img.src = ""; _modalCurrentItem = null; }

  async function loadMedia() {
    updateLoadingDetail("Cargando documentos e imágenes...");
    const fecha = $("#rl-fecha")?.value;
    const local = $("#rl-local-select")?.value || window.SESSION_LOCAL;

    // Validar que fecha y local existen
    if (!fecha || !local) {
      throw new Error("Falta fecha o local para cargar medios");
    }

    // Validar formato de fecha (YYYY-MM-DD)
    const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!fechaRegex.test(fecha)) {
      console.warn('⚠️ Fecha inválida al cargar medios:', fecha);
      renderDocs([]); // Renderizar vacío si fecha inválida
      return; // Salir silenciosamente
    }

    const url = new URL("/files/summary_media", location.origin);
    url.searchParams.set("fecha", fecha);
    url.searchParams.set("local", local);
    url.searchParams.set("_t", Date.now()); // Bypass cache

    const r = await fetch(url.toString(), {
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    if (!r.ok) {
      console.warn(`Error cargando medios: HTTP ${r.status}`);
      renderDocs([]); // Renderizar vacío en caso de error (no crítico)
      return;
    }

    const data = await r.json();
    renderDocs(data.groups || []);
  }

  async function refreshAll() {
    // Evitar cargas simultáneas
    if (isLoading) {
      console.warn("Ya hay una carga en progreso, ignorando solicitud duplicada");
      return;
    }

    isLoading = true;
    loadAttempts++;

    try {
      showLoadingOverlay("Cargando datos del cierre...");

      // Obtener el local del select (fuente de verdad)
      const selLocal = $("#rl-local-select");
      // Si existe el select, SOLO usar su valor (no usar SESSION_LOCAL como fallback)
      const local = selLocal ? (selLocal.value || "").trim() : (window.SESSION_LOCAL || "").trim();

      // Actualizar el display para que refleje el local que vamos a usar
      const display = $("#rl-local-display");
      if (display) {
        display.textContent = local;
      }

      console.log('[refreshAll] Local a usar:', local);

      updateLoadingDetail("Validando parámetros...");

      // Paso 1: Actualizar resumen numérico (CRÍTICO - no puede fallar)
      try {
        await updateResumen();
      } catch (error) {
        console.error("Error crítico al actualizar resumen:", error);
        hideLoadingOverlay();

        // Si el error es por datos faltantes o inválidos, NO mostrar alerta molesta
        // Solo registrar en console (el usuario debe seleccionar valores válidos)
        const errorMsg = error.message || "";
        if (errorMsg.includes("Fecha inválida") ||
            errorMsg.includes("Falta seleccionar") ||
            errorMsg.includes("local o fecha")) {
          console.warn("⚠️ No se puede cargar datos:", errorMsg, "- Esperando que el usuario seleccione valores válidos.");
          return; // Salir silenciosamente sin mostrar alerta
        }

        // Para otros errores (red, servidor, etc), sí mostrar alerta
        showErrorAlert(
          `❌ ERROR CRÍTICO al cargar datos del cierre:\n\n${error.message}\n\nPor favor, verifique su conexión e intente nuevamente.`,
          true
        );
        throw error; // Re-throw para detener el flujo
      }

      // Paso 2: Cargar medios (no crítico - puede fallar sin detener)
      try {
        await loadMedia();
      } catch (error) {
        console.error("Error no crítico al cargar medios:", error);
        renderDocs([]); // Renderizar vacío, continuar con el resto
      }

      // Paso 3: Asegurar botón de descarga
      ensureGlobalDownloadButton();

      // Paso 4: Actualizar botones de auditoría (solo para nivel 3)
      if (window.ROLE_LEVEL >= 3 && window.actualizarBotonesAuditoria) {
        try {
          await window.actualizarBotonesAuditoria();
        } catch (error) {
          console.error("Error al actualizar botones de auditoría:", error);
        }
      }

      // Paso 5: Cargar anticipos (solo para nivel 3+)
      if (window.ROLE_LEVEL >= 3) {
        try {
          await cargarAnticipos();
        } catch (error) {
          console.error("Error al cargar anticipos:", error);
        }
      }

      // Éxito total
      loadAttempts = 0; // Reset contador
      updateLoadingDetail("✅ Datos cargados correctamente");

      // Pequeño delay para que el usuario vea el mensaje de éxito
      await new Promise(resolve => setTimeout(resolve, 300));

    } catch (error) {
      console.error("Error en refreshAll:", error);

      // Si hay múltiples intentos fallidos consecutivos, alertar
      if (loadAttempts >= 3) {
        alert(
          `⚠️ ADVERTENCIA: Han fallado ${loadAttempts} intentos de carga consecutivos.\n\n` +
          `Esto puede indicar un problema de conexión o del servidor.\n\n` +
          `Por favor, contacte al administrador del sistema si el problema persiste.`
        );
      }

    } finally {
      isLoading = false;
      hideLoadingOverlay();
    }
  }

  // ----------------- Toggle Source (Niveles 2 y 3) -----------------
  function updateToggleUI() {
    // Actualizar el botón según el estado actual
    const btn = $("#rl-toggle-source");
    const label = $("#rl-toggle-label");

    if (dataSource === "admin") {
      if (label) label.textContent = "📊 Administración";
      if (btn) btn.style.backgroundColor = "#6366f1"; // Índigo
    } else {
      if (label) label.textContent = "🏭 Operación";
      if (btn) btn.style.backgroundColor = "#10b981"; // Verde
    }
  }

  function toggleDataSource() {
    // Alternar entre "admin" y "operacion"
    dataSource = (dataSource === "admin") ? "operacion" : "admin";
    updateToggleUI();
    // Recargar datos con la nueva fuente
    refreshAll();
  }

  function updateToggleButtonVisibility() {
    // Controlar visibilidad del botón según nivel y estado del local
    const btn = $("#rl-toggle-source");
    if (!btn) return;

    const roleLevel = parseInt(btn.getAttribute("data-role-level") || "3");

    if (roleLevel === 2) {
      // Nivel 2: solo mostrar botón si el local está cerrado
      if (localCerrado) {
        btn.style.display = "block";
        // Asegurar que dataSource tenga valor (operacion por defecto)
        if (!dataSource) {
          dataSource = "operacion";
          updateToggleUI();
        }
      } else {
        // Local abierto: ocultar botón y usar tablas normales
        btn.style.display = "none";
        dataSource = null; // No enviar parámetro source
      }
    } else {
      // Nivel 3+: siempre mostrar el botón
      btn.style.display = "block";
    }
  }

  function initializeToggleState() {
    // Inicializar estado según el nivel del usuario
    const btn = $("#rl-toggle-source");
    if (!btn) return; // No hay botón toggle (nivel 1)

    const roleLevel = parseInt(btn.getAttribute("data-role-level") || "3");

    if (roleLevel === 2) {
      // Nivel 2 (encargado): se configurará en updateToggleButtonVisibility según estado del local
      // Por ahora, inicializar como null hasta obtener el estado del local
      dataSource = null;
    } else {
      // Nivel 3+ (auditor): por defecto en "admin" (ve datos de auditoría)
      dataSource = "admin";
      updateToggleUI();
    }
  }

  // ----------------- Boot -----------------
  document.addEventListener("DOMContentLoaded", async () => {
    setTodayIfEmpty($("#rl-fecha"));
    const btnSidebar = $("#toggleSidebar");
    const root = document.querySelector(".layout");
    if (btnSidebar && root) btnSidebar.addEventListener("click", () => root.classList.toggle("sidebar-open"));

    bindGeneralAccordions();
    bindSubAccordions();

    // Inicializar estado del toggle ANTES de hacer el primer fetch
    initializeToggleState();

    $("#rl-actualizar")?.addEventListener("click", () => refreshAll());
    $("#rl-fecha")?.addEventListener("change", () => refreshAll());
    $("#rl-cerrar-local")?.addEventListener("click", () => cerrarLocal());
    $("#rl-toggle-source")?.addEventListener("click", () => toggleDataSource());

    $("#imgClose")?.addEventListener("click", closeModal);
    $("#imgModal")?.addEventListener("click", (e) => { if (e.target.id === "imgModal") closeModal(); });
    $("#imgDownload")?.addEventListener("click", (e) => { e.stopPropagation(); if (_modalCurrentItem) downloadSingle(_modalCurrentItem); });

    ensureGlobalDownloadButton();

    // ESPERAR a que el select de locales tenga un valor antes de cargar datos
    const selLocal = $("#rl-local-select");
    if (selLocal) {
      // Esperar hasta que el select tenga opciones y un valor seleccionado
      let intentos = 0;
      const maxIntentos = 50; // 5 segundos máximo
      while (intentos < maxIntentos && (!selLocal.value || selLocal.value === "")) {
        await new Promise(resolve => setTimeout(resolve, 100));
        intentos++;
      }

      if (selLocal.value && selLocal.value !== "") {
        console.log('✅ Local cargado correctamente:', selLocal.value, '- Procediendo a cargar datos');
        refreshAll().catch(console.error);
      } else {
        console.warn('⚠️ No se pudo cargar el local automáticamente. El usuario debe seleccionar manualmente.');
      }
    } else {
      // Si no hay select (nivel 2), usar SESSION_LOCAL directamente
      refreshAll().catch(console.error);
    }

    $("#rl-imprimir")?.addEventListener("click", () => window.print());
  });

  // ========= EDITAR OBSERVACIÓN DE DIFERENCIA =========
  window.editarObservacionDiferencia = async function(caja, turno, observacionActual) {
    const fecha = $("#rl-fecha")?.value;
    if (!fecha) {
      alert("No se pudo obtener la fecha.");
      return;
    }

    const nuevaObs = prompt(`Editar observación para ${caja} - ${turno}:`, observacionActual || "");
    if (nuevaObs === null) return; // Canceló

    try {
      const response = await fetch("/api/actualizar_observacion_diferencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: fecha,
          caja: caja,
          turno: turno,
          observacion: nuevaObs.trim()
        })
      });

      const data = await response.json();

      if (data.success) {
        // Actualizar el DOM directamente
        const descargoId = `descargo-${caja}-${turno}`.replace(/\s+/g, '-');
        const descargoDiv = document.getElementById(descargoId);
        if (descargoDiv) {
          descargoDiv.textContent = nuevaObs.trim() || "Sin observación";
        }
        alert("✅ Observación actualizada correctamente");
      } else {
        alert(`❌ Error: ${data.msg || "No se pudo actualizar la observación"}`);
      }
    } catch (error) {
      console.error("Error al actualizar observación:", error);
      alert("❌ Error de red al actualizar la observación");
    }
  };

  // Exponer refreshAll globalmente para que el HTML pueda llamarla
  window.refreshAll = refreshAll;

  // ===== CARGA INICIAL AUTOMÁTICA =====
  // Función para verificar si el contexto está listo y cargar datos
  async function checkAndLoadInitialData() {
    const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;

    // Obtener valores del contexto
    const localDisplay = $("#rl-local-display")?.textContent?.trim();
    const localSelect = $("#rl-local-select")?.value?.trim();
    const fechaInput = $("#rl-fecha")?.value?.trim();

    const local = localSelect || localDisplay; // PRIORIDAD al select sobre el display
    const fecha = fechaInput;

    console.log('[resumen_local.js] Verificando contexto:', {
      localSelect,
      localDisplay,
      localFinal: local,
      fecha
    });

    // Validar que tenemos contexto válido
    if (local && fecha && fechaRegex.test(fecha)) {
      console.log('[resumen_local.js] ✅ Contexto válido detectado, cargando datos automáticamente');

      // Asegurar que rl-local-display tenga el valor correcto
      const display = $("#rl-local-display");
      if (display) {
        display.textContent = local;
        console.log('[resumen_local.js] Display actualizado a:', local);
      }

      // Cargar todos los datos automáticamente
      try {
        await refreshAll();
      } catch (error) {
        console.error('[resumen_local.js] Error al cargar datos iniciales:', error);
      }

      return true;
    } else {
      console.log('[resumen_local.js] ⚠️ Contexto incompleto:', {
        local,
        fecha,
        fechaValida: fechaRegex.test(fecha || '')
      });
      return false;
    }
  }

  // ========= CARGAR ANTICIPOS =========
  async function cargarAnticipos() {
    const loadingDiv = $("#rl-anticipos-loading");
    const emptyDiv = $("#rl-anticipos-empty");
    const table = $("#rl-anticipos-table");
    const tbody = $("#rl-anticipos-items");
    const totalSpan = $("#rl-anticipos-total");

    // Mostrar loading
    if (loadingDiv) loadingDiv.style.display = "block";
    if (emptyDiv) emptyDiv.style.display = "none";
    if (table) table.style.display = "none";

    try {
      const selLocal = $("#rl-local-select");
      const local = selLocal ? (selLocal.value || "").trim() : (window.SESSION_LOCAL || "").trim();
      const fecha = $("#rl-fecha")?.value;

      if (!local || !fecha) {
        console.warn("⚠️ No se puede cargar anticipos: falta local o fecha");
        if (loadingDiv) loadingDiv.style.display = "none";
        if (emptyDiv) {
          emptyDiv.textContent = "Seleccione un local y fecha para ver anticipos";
          emptyDiv.style.display = "block";
        }
        return;
      }

      // Llamar al API con filtros
      const params = new URLSearchParams({
        local: local,
        fecha_desde: fecha,
        fecha_hasta: fecha,
        estado: "consumido" // Solo mostrar anticipos consumidos
      });

      const response = await fetch(`/api/anticipos_recibidos/listar?${params.toString()}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.msg || "Error al cargar anticipos");
      }

      const anticipos = data.anticipos || [];

      // Ocultar loading
      if (loadingDiv) loadingDiv.style.display = "none";

      if (anticipos.length === 0) {
        if (emptyDiv) emptyDiv.style.display = "block";
        return;
      }

      // Renderizar anticipos
      if (tbody) {
        tbody.innerHTML = "";
        let total = 0;

        anticipos.forEach(anticipo => {
          const tr = document.createElement("tr");

          // Formatear fecha
          const fechaEvento = anticipo.fecha_evento ? anticipo.fecha_evento.split('T')[0] : '-';

          // Calcular importe en ARS
          const divisa = anticipo.divisa || 'ARS';
          const tipoCambio = parseFloat(anticipo.tipo_cambio_fecha) || 1;
          const importe = parseFloat(anticipo.importe) || 0;
          const importeARS = divisa === 'ARS' ? importe : importe * tipoCambio;

          total += importeARS;

          // Estado badge
          const estadoBadge = anticipo.fue_consumido > 0
            ? '<span style="background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">Consumido</span>'
            : '<span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">Pendiente</span>';

          tr.innerHTML = `
            <td>${fechaEvento}</td>
            <td>${anticipo.cliente || '-'}</td>
            <td>${anticipo.medio_pago || '-'}</td>
            <td class="r">$ ${importeARS.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td>${estadoBadge}</td>
          `;

          tbody.appendChild(tr);
        });

        // Actualizar total
        if (totalSpan) {
          totalSpan.textContent = `$ ${total.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        }
      }

      // Mostrar tabla
      if (table) table.style.display = "table";

    } catch (error) {
      console.error("Error al cargar anticipos:", error);
      if (loadingDiv) loadingDiv.style.display = "none";
      if (emptyDiv) {
        emptyDiv.textContent = "Error al cargar anticipos: " + error.message;
        emptyDiv.style.display = "block";
      }
    }
  }

  // Ejecutar cuando el DOM esté listo
  document.addEventListener('DOMContentLoaded', async () => {
    console.log('[resumen_local.js] DOMContentLoaded - Iniciando verificación de contexto');

    // Intentar cargar inmediatamente
    let loaded = await checkAndLoadInitialData();

    // Si no se pudo cargar, reintentar después de un delay
    if (!loaded) {
      console.log('[resumen_local.js] Reintentando después de 200ms...');
      setTimeout(async () => {
        loaded = await checkAndLoadInitialData();

        // Si aún no se pudo, un último intento después de 500ms más
        if (!loaded) {
          console.log('[resumen_local.js] Reintentando después de 500ms adicionales...');
          setTimeout(checkAndLoadInitialData, 500);
        }
      }, 200);
    }
  });

  /**
   * Renderiza la tabla de remesas (retiradas o no retiradas)
   * @param {string} tbodyId - ID del tbody donde renderizar
   * @param {Array} remesas - Array de remesas a mostrar
   */
  function renderRemesasTable(tbodyId, remesas) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    // Limpiar contenido previo
    tbody.innerHTML = '';

    if (!remesas || remesas.length === 0) {
      tbody.innerHTML = '<tr class="muted"><td colspan="4">Sin remesas…</td></tr>';
      return;
    }

    // Renderizar cada remesa
    remesas.forEach(remesa => {
      const tr = document.createElement('tr');

      // Nro Remesa
      const tdRemesa = document.createElement('td');
      tdRemesa.style.textAlign = 'center';
      tdRemesa.textContent = remesa.nro_remesa || '—';
      tr.appendChild(tdRemesa);

      // Nro Precinto
      const tdPrecinto = document.createElement('td');
      tdPrecinto.style.textAlign = 'center';
      tdPrecinto.textContent = remesa.precinto || '—';
      tr.appendChild(tdPrecinto);

      // Monto (con formato especial para USD)
      const tdMonto = document.createElement('td');
      tdMonto.style.textAlign = 'center';

      if (remesa.divisa === 'USD' && remesa.monto_usd) {
        const montoUSD = parseFloat(remesa.monto_usd || 0).toLocaleString('es-AR', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        });
        const totalARS = parseFloat(remesa.total_conversion || 0).toLocaleString('es-AR', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        });
        tdMonto.innerHTML = `${montoUSD} USD<br><span class="muted" style="font-size: 0.85em;">($${totalARS})</span>`;
      } else {
        const montoARS = parseFloat(remesa.monto || 0).toLocaleString('es-AR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
        tdMonto.textContent = `$${montoARS}`;
      }
      tr.appendChild(tdMonto);

      // Estado
      const tdEstado = document.createElement('td');
      tdEstado.style.textAlign = 'center';
      tdEstado.textContent = remesa.retirada === 1 ? 'Retirada' : 'No Retirada';
      tr.appendChild(tdEstado);

      tbody.appendChild(tr);
    });
  }
})();
