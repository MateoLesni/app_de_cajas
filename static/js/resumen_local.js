// static/js/resumen_local.js
// =====================================================
// Resumen Local (panel numérico + documentos/descargas)
// Endpoints:
//   GET  /api/resumen_local?local=...&fecha=YYYY-MM-DD
//   GET  /estado_local?fecha=YYYY-MM-DD           -> {estado: 1|0}
//   POST /api/cierre_local  body:{fecha:'YYYY-MM-DD'} -> {success:true}
//   GET  /files/summary_media?local=...&fecha=YYYY-MM-DD
//   GET  /files/view?id=<path>
// =====================================================
(function () {
  // ----------------- Utils -----------------
  const fmt = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (v) => fmt.format(Number(v || 0));
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const nowTime = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const setText = (id, val, allowMissing = true) => {
    const el = typeof id === "string" ? document.getElementById(id) : id;
    if (!el) { if (!allowMissing) console.warn("setText: missing", id); return; }
    el.textContent = val;
  };

  const setTodayIfEmpty = (input) => {
    if (!input || input.value) return;
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    input.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  // ----------------- Copy helpers -----------------
  function getCopyTextFromElement(el) {
    if (!el) return "";
    if (el.dataset && el.dataset.copy) return String(el.dataset.copy);
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

  // ----------------- Acordeones (numéricos) -----------------
  function toggleAria(el) {
    if (!el) return;
    el.setAttribute("aria-expanded", el.getAttribute("aria-expanded") === "true" ? "false" : "true");
  }
  function bindGeneralAccordions() {
    $$(".sl-section.acc").forEach((section) => {
      const head = section.querySelector(".sl-title");
      if (head) head.addEventListener("click", () => toggleAria(section));
    });
  }
  function bindSubAccordions() {
    $$(".sub-acc.acc").forEach((sub) => {
      const row = sub.querySelector(".sl-row");
      if (row) {
        if (!sub.hasAttribute("aria-expanded")) sub.setAttribute("aria-expanded", "false");
        row.addEventListener("click", () => toggleAria(sub));
      }
    });
  }

  // ----------------- Ventas Z display -----------------
  function formatZDisplay(it) {
    const back = (it?.z_display || "").toString().trim();
    if (back) return back;
    const pv = String(it?.z_pv ?? it?.pv ?? it?.pto_venta ?? it?.punto_venta ?? it?.pv_numero ?? 0).replace(/\D+/g, "");
    const num = String(it?.z_numero ?? it?.numero_z ?? it?.nro_z ?? it?.num_z ?? it?.numero ?? it?.z ?? 0).replace(/\D+/g, "");
    return `${pv.padStart(5, "0")}-${num.padStart(8, "0")}`;
  }

  // ----------------- Render (panel numérico) -----------------
  function renderResumen(data) {
    try {
      const inFecha = document.getElementById("rl-fecha");
      setText("rl-fecha-display", inFecha?.value || "—");
      setText("rl-hora-display", nowTime());
      setText("rl-updated-at", new Date().toLocaleString("es-AR"));

      const r = data?.resumen || {};
      setMoneyWithCopy("rl-venta-total", r.venta_total);
      setMoneyWithCopy("rl-total-cobrado", r.total_cobrado);
      setMoneyWithCopy("rl-diferencia", r.diferencia);
      const diffEl = $("#rl-diferencia");
      if (diffEl) diffEl.classList.toggle("negative-amount", Number(r.diferencia || 0) < 0);

      const v = data?.ventas || {};
      setMoneyWithCopy("rl-vz-total", v.vta_z_total);
      setMoneyWithCopy("rl-vz-total-foot", v.vta_z_total);
      setMoneyWithCopy("rl-discovery", v.discovery);

      const tbVz = $("#rl-vz-items");
      if (tbVz) {
        tbVz.innerHTML = "";
        const items = Array.isArray(v.z_items) ? v.z_items : [];
        if (!items.length) {
          const tr = document.createElement("tr"); tr.className = "muted";
          const td = document.createElement("td"); td.colSpan = 2; td.textContent = "Sin ventas z cargadas";
          tr.appendChild(td); tbVz.appendChild(tr);
        } else {
          items.forEach((it) => {
            const tr = document.createElement("tr");
            const display = formatZDisplay(it);
            const tdName = document.createElement("td");
            tdName.textContent = display; tdName.dataset.copy = display; addCopyButton(tdName, () => display);
            const tdAmt = document.createElement("td");
            const amtTxt = money(it?.monto || 0);
            tdAmt.className = "r"; tdAmt.textContent = amtTxt; tdAmt.dataset.copy = amtTxt; addCopyButton(tdAmt, () => amtTxt);
            tr.appendChild(tdName); tr.appendChild(tdAmt); tbVz.appendChild(tr);
          });
        }
        const vzFoot = $("#rl-vz-total-foot"); if (vzFoot) addCopyButton(vzFoot);
        const vzTbl = tbVz.closest("table"); if (vzTbl) addCopyToLabelCellsWithin(vzTbl);
      }

      const info = data?.info || {};
      // Efectivo
      setMoneyWithCopy("rl-cash", info?.efectivo?.total);
      setMoneyWithCopy("rl-remesas", info?.efectivo?.remesas);
      setMoneyWithCopy("rl-cash-neto", info?.efectivo?.neto_efectivo);
      setMoneyWithCopy("rl-remesas-ret-total", info?.efectivo?.retiradas_total);
      setMoneyWithCopy("rl-remesas-no-ret-total", info?.efectivo?.no_retiradas_total);
      // Tarjetas
      setMoneyWithCopy("rl-card", info?.tarjeta?.total);
      const bk = info?.tarjeta?.breakdown || {};
      const idMap = {
        "VISA": "rl-tj-visa",
        "VISA DEBITO": "rl-tj-visa-deb",
        "VISA PREPAGO": "rl-tj-visa-pre",
        "MASTERCARD": "rl-tj-mc",
        "MASTERCARD DEBITO": "rl-tj-mc-deb",
        "MASTERCARD PREPAGO": "rl-tj-mc-pre",
        "CABAL": "rl-tj-cabal",
        "CABAL DEBITO": "rl-tj-cabal-deb",
        "AMEX": "rl-tj-amex",
        "MAESTRO": "rl-tj-maestro",
        "NARANJA": "rl-tj-naranja",
        "DECIDIR": "rl-tj-decidir",
        "DINERS": "rl-tj-diners",
        "PAGOS INMEDIATOS": "rl-tj-pagos-inm",
      };
      Object.entries(idMap).forEach(([marca, id]) => setMoneyWithCopy(id, bk[marca] || 0));
      setMoneyWithCopy("rl-card-total", info?.tarjeta?.total);
      // Otros medios
      setMoneyWithCopy("rl-mp", info?.mercadopago?.total);
      setMoneyWithCopy("rl-mp-tips", info?.mercadopago?.tips);
      setMoneyWithCopy("rl-rappi", info?.rappi?.total);
      setMoneyWithCopy("rl-rappi-det", info?.rappi?.total);
      setMoneyWithCopy("rl-pedidosya", info?.pedidosya?.total);
      setMoneyWithCopy("rl-pedidosya-det", info?.pedidosya?.total);
      setMoneyWithCopy("rl-gastos", info?.gastos?.total);
      setMoneyWithCopy("rl-g-caja", info?.gastos?.caja_chica);
      setMoneyWithCopy("rl-g-otros", info?.gastos?.otros);
      setMoneyWithCopy("rl-g-total", info?.gastos?.total);
      setMoneyWithCopy("rl-cta-cte", info?.cuenta_cte?.total);
      setMoneyWithCopy("rl-cta-cte-det", info?.cuenta_cte?.total);
      // Tips
      setMoneyWithCopy("rl-tips", info?.tips?.total);
      setMoneyWithCopy("rl-tips-det", info?.tips?.total);
      setMoneyWithCopy("rl-tips-mp", info?.tips?.mp);
      setMoneyWithCopy("rl-tips-tarjetas", info?.tips?.tarjetas);
      const tbTips = info?.tips?.breakdown || {};
      const tipMap = {
        "VISA": "rl-tip-visa",
        "VISA DEBITO": "rl-tip-visa-deb",
        "VISA PREPAGO": "rl-tip-visa-pre",
        "MASTERCARD": "rl-tip-mc",
        "MASTERCARD DEBITO": "rl-tip-mc-deb",
        "MASTERCARD PREPAGO": "rl-tip-mc-pre",
        "CABAL": "rl-tip-cabal",
        "CABAL DEBITO": "rl-tip-cabal-deb",
        "AMEX": "rl-tip-amex",
        "MAESTRO": "rl-tip-maestro",
        "NARANJA": "rl-tip-naranja",
        "DECIDIR": "rl-tip-decidir",
        "DINERS": "rl-tip-diners",
        "PAGOS INMEDIATOS": "rl-tip-pagos-inm",
      };
      Object.entries(tipMap).forEach(([marca, id]) => setMoneyWithCopy(id, tbTips[marca] || 0));

      // Copy en labels de varias tablas
      ["rl-tj-visa", "rl-mp-tips", "rl-rappi-det", "rl-pedidosya-det", "rl-g-total", "rl-cta-cte-det", "rl-tips-det"]
        .map((id) => document.getElementById(id)?.closest("table"))
        .forEach((tbl) => { if (tbl) addCopyToLabelCellsWithin(tbl); });

    } catch (e) { console.error("renderResumen error:", e); }
  }

  // ----------------- Fetch resumen -----------------
  async function fetchResumenLocal(params) {
    const url = `/api/resumen_local?local=${encodeURIComponent(params.local || "")}&fecha=${encodeURIComponent(params.fecha || "")}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  async function updateResumen() {
    const local = ($("#rl-local-display")?.textContent || "").trim();
    const fecha = $("#rl-fecha")?.value;
    if (!local || !fecha) return;
    const data = await fetchResumenLocal({ local, fecha });
    renderResumen(data);
    await refreshEstadoLocalBadge();
  }

  // ----------------- Estado Local -----------------
  async function refreshEstadoLocalBadge() {
    const fecha = $("#rl-fecha")?.value;
    const badge = $("#rl-badge-estado");
    const btn = $("#rl-cerrar-local");
    if (!fecha) return;
    try {
      const r = await fetch(`/estado_local?fecha=${encodeURIComponent(fecha)}`, { cache: "no-store" });
      const d = r.ok ? await r.json() : { ok: false };
      const abierto = (d?.estado ?? 1) === 1;
      if (badge) {
        badge.style.display = "inline-block";
        badge.textContent = abierto ? "Local ABIERTO" : "Local CERRADO";
        badge.classList.toggle("sl-badge-open", abierto);
        badge.classList.toggle("sl-badge-closed", !abierto);
      }
      if (btn) {
        btn.disabled = !abierto;
        btn.title = abierto ? "Cerrar el Local del día" : "El local ya está cerrado";
      }
    } catch { /* noop */ }
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
        if (r.status === 409 && data?.detalle?.length)
          alert(`No se puede cerrar: hay cajas sin cerrar.\nDetalle: ${data.detalle.join(", ")}`);
        else alert(`Error al cerrar el local: ${data?.msg || r.status}`);
        return;
      }
      alert("✅ Local cerrado y snapshot creado.");
      await updateResumen();
      await refreshEstadoLocalBadge();
    } catch { alert("❌ Error de red."); }
    finally { if (btn) btn.textContent = oldTxt; }
  }

  // =====================================================
  //                DOCUMENTOS / IMÁGENES
  // =====================================================
  const ICON_DOWNLOAD = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3v10m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  const ICON_ZOOM = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  let _lastGroups = [];   // para descargas
  let _modalCurrentItem = null;

  // Normaliza claves que llegan del back y evita duplicados
  function normalizeKey(raw) {
    const k = String(raw || "").toLowerCase();
    const map = {
      tarjetas: "tarjeta",
      tarjeta: "tarjeta",
      ventasz: "ventas_z",
      "ventas z": "ventas_z",
      mp: "mercadopago"
    };
    return map[k] || k;
  }
  function uniqueItems(items) {
    const seen = new Set();
    return (items || []).filter(it => {
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
    const card = document.createElement("div");
    card.className = "thumb";

    const top = document.createElement("div");
    top.className = "thumb-top";

    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = it.name || "imagen";
    img.src = it.view_path || it.view_url || "";

    const fallback = document.createElement("div");
    fallback.className = "media-fallback";
    fallback.textContent = it.name || "Archivo";

    img.onerror = () => { img.style.display = "none"; fallback.style.display = "block"; };

    const actions = document.createElement("div");
    actions.className = "thumb-actions";

    const bZoom = document.createElement("button");
    bZoom.className = "icon-btn";
    bZoom.title = "Ver";
    bZoom.innerHTML = ICON_ZOOM;
    bZoom.addEventListener("click", (e) => { e.stopPropagation(); openModal(it); });

    const bDown = document.createElement("button");
    bDown.className = "icon-btn";
    bDown.title = "Descargar";
    bDown.innerHTML = ICON_DOWNLOAD;
    bDown.addEventListener("click", (e) => { e.stopPropagation(); downloadSingle(it); });

    actions.appendChild(bZoom); actions.appendChild(bDown);
    top.appendChild(img); top.appendChild(actions);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = it.name || "—";

    card.appendChild(top); card.appendChild(meta); card.appendChild(fallback);
    card.addEventListener("click", () => openModal(it));
    return card;
  }

  function renderDocs(groups) {
    _lastGroups = []; // reset
    const host = document.getElementById("doc-accordions");
    if (host) host.innerHTML = "";

    // Merge por clave canónica y de-dupe
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
      ["mercadopago", "Mercado Pago"],
      ["tarjeta", "Tarjeta"],
      ["rappi", "Rappi"],
      ["pedidosya", "PedidosYa"],
      ["gastos", "Gastos"],
      ["cuenta_cte", "Cuenta Cte."],
    ];

    order.forEach(([key, fallbackLabel]) => {
      const g = byKey[key] || { key, label: fallbackLabel, items: [] };
      const count = (g.items || []).length;

      const acc = document.createElement("div");
      acc.className = "doc-acc";
      acc.setAttribute("aria-expanded", "false");

      const hdr = document.createElement("div");
      hdr.className = "doc-row";

      const left = document.createElement("div");
      left.className = "row-left";
      left.appendChild(document.createTextNode(g.label || fallbackLabel));

      const badge = document.createElement("span");
      badge.className = "count";
      badge.textContent = String(count);
      left.appendChild(badge);

      const actions = document.createElement("div");
      actions.className = "doc-actions";
      const btn = document.createElement("button");
      btn.className = "icon-btn";
      btn.title = "Descargar este acordeón";
      btn.innerHTML = ICON_DOWNLOAD;
      btn.addEventListener("click", (e) => { e.stopPropagation(); downloadGroup(key); });
      actions.appendChild(btn);

      hdr.appendChild(left); hdr.appendChild(actions);
      hdr.addEventListener("click", () => {
        acc.setAttribute("aria-expanded", acc.getAttribute("aria-expanded") === "true" ? "false" : "true");
      });

      const body = document.createElement("div");
      body.className = "acc-body";

      if (count) {
        const wrap = document.createElement("div");
        wrap.className = "thumbs";
        g.items.forEach((it) => wrap.appendChild(buildThumbCard(it)));
        body.appendChild(wrap);
      } else {
        const empty = document.createElement("div");
        empty.className = "muted";
        empty.style.padding = "10px";
        empty.textContent = "Sin imágenes cargadas";
        body.appendChild(empty);
      }

      acc.appendChild(hdr); acc.appendChild(body);
      host?.appendChild(acc);

      _lastGroups.push({ key, items: g.items || [] }); // para descargas globales
    });

    ensureGlobalDownloadButton();
  }

  // Descargas / modal
  function triggerDownload(href, filename) {
    const a = document.createElement("a");
    a.href = href; if (filename) a.download = filename; a.rel = "noopener";
    document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 40);
  }
  function downloadSingle(item) { triggerDownload(item.view_path || item.view_url || "#", item.name || "archivo"); }
  function downloadGroup(key) {
    const g = (_lastGroups || []).find((x) => x.key === key);
    if (!g || !g.items?.length) return;
    let i = 0; (function tick() { if (i >= g.items.length) return; downloadSingle(g.items[i++]); setTimeout(tick, 150); })();
  }
  function downloadAll() {
    const all = []; (_lastGroups || []).forEach((g) => (g.items || []).forEach((it) => all.push(it)));
    let i = 0; (function tick() { if (i >= all.length) return; downloadSingle(all[i++]); setTimeout(tick, 150); })();
  }

  function openModal(it) {
    _modalCurrentItem = it;
    const img = document.getElementById("imgBig");
    if (img) img.src = it.view_path || it.view_url || "";
    setText("imgCaption", it.name || "");
    document.getElementById("imgModal")?.classList.add("is-open");
    const b = document.getElementById("imgDownload");
    if (b && !b.firstChild) b.innerHTML = ICON_DOWNLOAD;
  }
  function closeModal() {
    document.getElementById("imgModal")?.classList.remove("is-open");
    const img = document.getElementById("imgBig"); if (img) img.src = "";
    _modalCurrentItem = null;
  }

  async function loadMedia() {
    const fecha = document.getElementById("rl-fecha")?.value;
    const local = (document.getElementById("rl-local-select")?.value) || window.SESSION_LOCAL;
    if (!fecha || !local) return;
    const url = new URL("/files/summary_media", location.origin);
    url.searchParams.set("fecha", fecha);
    url.searchParams.set("local", local);
    const r = await fetch(url.toString(), { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) { renderDocs([]); return; }
    const data = await r.json();
    renderDocs(data.groups || []);
  }

  // ----------------- Refresh conjunto -----------------
  async function refreshAll() {
    const selLocal = document.getElementById("rl-local-select");
    document.getElementById("rl-local-display").textContent = selLocal?.value || window.SESSION_LOCAL;
    await updateResumen().catch(() => {});
    await loadMedia().catch(() => {});
    ensureGlobalDownloadButton();
  }

  // ----------------- Boot -----------------
  document.addEventListener("DOMContentLoaded", () => {
    setTodayIfEmpty(document.getElementById("rl-fecha"));

    // Sidebar
    const btnSidebar = document.getElementById("toggleSidebar");
    const root = document.querySelector(".layout");
    if (btnSidebar && root) btnSidebar.addEventListener("click", () => root.classList.toggle("sidebar-open"));

    // Acordeones numéricos
    bindGeneralAccordions();
    bindSubAccordions();

    // Listeners
    document.getElementById("rl-actualizar")?.addEventListener("click", () => refreshAll());
    document.getElementById("rl-fecha")?.addEventListener("change", () => refreshAll());
    document.getElementById("rl-cerrar-local")?.addEventListener("click", () => cerrarLocal());

    // Modal
    document.getElementById("imgClose")?.addEventListener("click", closeModal);
    document.getElementById("imgModal")?.addEventListener("click", (e) => { if (e.target.id === "imgModal") closeModal(); });
    document.getElementById("imgDownload")?.addEventListener("click", (e) => {
      e.stopPropagation(); if (_modalCurrentItem) downloadSingle(_modalCurrentItem);
    });

    // Botón global "Todo"
    ensureGlobalDownloadButton();

    // Primera carga
    refreshAll().catch(console.error);

    // Imprimir
    document.getElementById("rl-imprimir")?.addEventListener("click", () => window.print());
  });
})();
