// static/js/resumen_local.js
// =====================================================
// Resumen Local (panel numérico + documentos/descargas)
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
  const setText = (id, val) => {
    const el = typeof id === "string" ? document.getElementById(id) : id;
    if (el) el.textContent = val;
  };
  const setTodayIfEmpty = (input) => {
    if (!input || input.value) return;
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    input.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  // ----------------- Iconos (SVG) -----------------
  const ICON_DOWNLOAD = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v10m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  const ICON_ZOOM = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  // ----------------- Copiar -----------------
  function addCopyButton(target, getTextFn) {
    if (!target || target.querySelector(":scope > .copy-btn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.title = "Copiar";
    btn.textContent = "⧉";
    Object.assign(btn.style, {
      marginLeft: "6px", fontSize: "11px", lineHeight: "1",
      padding: "2px 6px", border: "1px solid #cbd5e1", borderRadius: "6px",
      background: "#f8fafc", cursor: "pointer"
    });
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const txt = typeof getTextFn === "function" ? String(getTextFn()) : (target.textContent || "").trim();
      try { await navigator.clipboard.writeText(txt); btn.textContent = "✔"; } catch { btn.textContent = "!"; }
      setTimeout(() => (btn.textContent = "⧉"), 900);
    });
    target.appendChild(btn);
  }
  function setMoneyWithCopy(id, val) {
    const el = typeof id === "string" ? document.getElementById(id) : id;
    if (!el) return;
    const txt = money(val);
    el.textContent = txt; el.dataset.copy = txt; addCopyButton(el, () => txt);
  }

  // ----------------- Acordeones (DATOS) -----------------
  // Habilita/toggle para .sl-section (título) y .sub-acc (filas)
  function wireDataAccordions(root = document) {
    // Secciones principales
    $$(".sl-section.acc .sl-title", root).forEach((title) => {
      title.style.cursor = "pointer";
      title.addEventListener("click", (e) => {
        e.preventDefault();
        const acc = title.closest(".acc");
        if (!acc) return;
        const open = acc.getAttribute("aria-expanded") === "true";
        acc.setAttribute("aria-expanded", open ? "false" : "true");
      });
    });

    // Sub-acordeones (filas con totales, p.ej. Ventas Z / Efectivo / etc.)
    $$(".sub-acc.acc .sl-row", root).forEach((row) => {
      row.style.cursor = "pointer";
      row.addEventListener("click", (e) => {
        // Evita que copiar/otros botones adentro disparen toggle
        if ((e.target && (e.target.closest?.(".copy-btn") || e.target.closest?.("button"))) ) return;
        const acc = row.closest(".acc");
        if (!acc) return;
        const open = acc.getAttribute("aria-expanded") === "true";
        acc.setAttribute("aria-expanded", open ? "false" : "true");
      });
    });
  }

  // ----------------- Ventas Z display -----------------
  function formatZDisplay(it) {
    const back = (it?.z_display || "").toString().trim(); if (back) return back;
    const pv = String(it?.z_pv ?? it?.pv ?? it?.pto_venta ?? it?.punto_venta ?? it?.pv_numero ?? 0).replace(/\D+/g, "");
    const num = String(it?.z_numero ?? it?.numero_z ?? it?.nro_z ?? it?.num_z ?? it?.numero ?? it?.z ?? 0).replace(/\D+/g, "");
    return `${pv.padStart(5, "0")}-${num.padStart(8, "0")}`;
  }

  // ----------------- Panel numérico -----------------
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

    setText("rl-fecha-display", fecha || "—");
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

    // Ventas Z detalle
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
    }

    // Info por medios
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
      "VISA": "rl-tj-visa", "VISA DEBITO": "rl-tj-visa-deb", "VISA PREPAGO": "rl-tj-visa-pre",
      "MASTERCARD": "rl-tj-mc", "MASTERCARD DEBITO": "rl-tj-mc-deb", "MASTERCARD PREPAGO": "rl-tj-mc-pre",
      "CABAL": "rl-tj-cabal", "CABAL DEBITO": "rl-tj-cabal-deb", "AMEX": "rl-tj-amex", "MAESTRO": "rl-tj-maestro",
      "NARANJA": "rl-tj-naranja", "DECIDIR": "rl-tj-decidir", "DINERS": "rl-tj-diners", "PAGOS INMEDIATOS": "rl-tj-pagos-inm"
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
      "VISA": "rl-tip-visa", "VISA DEBITO": "rl-tip-visa-deb", "VISA PREPAGO": "rl-tip-visa-pre",
      "MASTERCARD": "rl-tip-mc", "MASTERCARD DEBITO": "rl-tip-mc-deb", "MASTERCARD PREPAGO": "rl-tip-mc-pre",
      "CABAL": "rl-tip-cabal", "CABAL DEBITO": "rl-tip-cabal-deb", "AMEX": "rl-tip-amex", "MAESTRO": "rl-tip-maestro",
      "NARANJA": "rl-tip-naranja", "DECIDIR": "rl-tip-decidir", "DINERS": "rl-tip-diners", "PAGOS INMEDIATOS": "rl-tip-pagos-inm"
    };
    Object.entries(tipMap).forEach(([marca, id]) => setMoneyWithCopy(id, tbTips[marca] || 0));

    // (re)conectar handlers de acordeones por si el DOM cambió
    wireDataAccordions();
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
      if (btn) { btn.disabled = !abierto; btn.title = abierto ? "Cerrar el Local del día" : "El local ya está cerrado"; }
    } catch { /* noop */ }
  }

  async function cerrarLocal() {
    const fecha = $("#rl-fecha")?.value;
    if (!fecha) { alert("Seleccioná una fecha."); return; }
    if (!confirm(`Esto cerrará el LOCAL para ${fecha}.\n- Bloquea edición para nivel 2.\n- Genera el snapshot para auditoría.\n\n¿Confirmás?`)) return;
    const btn = $("#rl-cerrar-local"); const oldTxt = btn ? btn.textContent : "";
    try {
      if (btn) { btn.disabled = true; btn.textContent = "Cerrando…"; }
      const r = await fetch("/api/cierre_local", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fecha }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.success) {
        if (r.status === 409 && data?.detalle?.length) alert(`No se puede cerrar: hay cajas sin cerrar.\nDetalle: ${data.detalle.join(", ")}`);
        else alert(`Error al cerrar el local: ${data?.msg || r.status}`);
        return;
      }
      alert("✅ Local cerrado y snapshot creado.");
      await updateResumen(); await refreshEstadoLocalBadge();
    } catch { alert("❌ Error de red."); } finally { if (btn) btn.textContent = oldTxt; }
  }

  // ----------------- Documentos / Descargas (IMÁGENES) -----------------
  let _lastGroups = [];
  let _modalCurrentItem = null;

  function ensureGlobalDownloadButton() {
    // Normaliza SIEMPRE el botón azul "Descargar todo" (usa el que ya existe en el HTML: #dl-all)
    const gbtn = document.getElementById("dl-all");
    if (!gbtn) return;
    // Ícono dentro del botón
    const ico = gbtn.querySelector(".ico");
    if (ico && !ico.firstChild) ico.innerHTML = ICON_DOWNLOAD;
    // Handler único
    if (!gbtn.dataset.wired) {
      gbtn.addEventListener("click", downloadAll);
      gbtn.dataset.wired = "1";
    }
  }

  function buildThumbCard(it, groupCtx) {
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

    // Si la imagen ya no existe (404), removemos la tarjeta y actualizamos contador
    img.onerror = () => {
      // remueve tarjeta
      card.remove();
      // resta del contador visual
      if (groupCtx && groupCtx.badge) {
        const n = Math.max(0, (parseInt(groupCtx.badge.textContent || "0", 10) || 0) - 1);
        groupCtx.badge.textContent = String(n);
        // si quedó en 0 y no hay más tarjetas, mostramos "Sin imágenes cargadas"
        if (n === 0 && groupCtx.body) {
          groupCtx.body.innerHTML = "";
          const empty = document.createElement("div");
          empty.className = "muted"; empty.style.padding = "10px";
          empty.textContent = "Sin imágenes cargadas";
          groupCtx.body.appendChild(empty);
        }
      }
    };

    const actions = document.createElement("div");
    actions.className = "thumb-actions";

    const bZoom = document.createElement("button");
    bZoom.className = "icon-btn"; bZoom.title = "Ver";
    bZoom.innerHTML = ICON_ZOOM;
    bZoom.addEventListener("click", (e) => { e.stopPropagation(); openModal(it); });

    const bDown = document.createElement("button");
    bDown.className = "icon-btn"; bDown.title = "Descargar";
    bDown.innerHTML = ICON_DOWNLOAD;
    bDown.addEventListener("click", (e) => { e.stopPropagation(); downloadSingle(it); });

    actions.appendChild(bZoom); actions.appendChild(bDown);
    top.appendChild(img); top.appendChild(actions);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = it.name || "—";

    card.appendChild(top);
    card.appendChild(meta);
    card.appendChild(fallback);
    card.addEventListener("click", () => openModal(it));
    return card;
  }

  function renderDocs(groups) {
    _lastGroups = groups || [];
    const host = document.getElementById("doc-accordions");
    if (host) host.innerHTML = "";
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
    const byKey = {}; (groups || []).forEach((g) => (byKey[g.key] = g));

    order.forEach(([key, label]) => {
      const g = byKey[key] || { key, label, count: 0, items: [] };

      const acc = document.createElement("div");
      acc.className = "doc-acc";
      acc.setAttribute("aria-expanded", "false");

      const hdr = document.createElement("div");
      hdr.className = "doc-row";

      const left = document.createElement("div");
      left.className = "row-left";
      left.appendChild(document.createTextNode(g.label || label));
      const badge = document.createElement("span");
      badge.className = "count"; badge.textContent = String(g.count || 0);
      left.appendChild(badge);

      const actions = document.createElement("div");
      actions.className = "doc-actions";
      const btn = document.createElement("button");
      btn.className = "icon-btn";
      btn.title = "Descargar este acordeón";
      btn.innerHTML = ICON_DOWNLOAD;
      btn.addEventListener("click", (e) => { e.stopPropagation(); downloadGroup(g.key); });
      actions.appendChild(btn);

      hdr.appendChild(left); hdr.appendChild(actions);
      hdr.addEventListener("click", () => {
        const open = acc.getAttribute("aria-expanded") === "true";
        acc.setAttribute("aria-expanded", open ? "false" : "true");
      });

      const body = document.createElement("div");
      body.className = "acc-body";
      if (g.count && (g.items || []).length) {
        const wrap = document.createElement("div"); wrap.className = "thumbs";
        const ctx = { badge, body };
        (g.items || []).forEach((it) => wrap.appendChild(buildThumbCard(it, ctx)));
        body.appendChild(wrap);
      } else {
        const empty = document.createElement("div");
        empty.className = "muted"; empty.style.padding = "10px";
        empty.textContent = "Sin imágenes cargadas";
        body.appendChild(empty);
      }

      acc.appendChild(hdr); acc.appendChild(body);
      host?.appendChild(acc);
    });

    // Botón global de “Descargar todo”
    ensureGlobalDownloadButton();
  }

  // Descargas
  function triggerDownload(href, filename) {
    const a = document.createElement("a");
    a.href = href; if (filename) a.download = filename; a.rel = "noopener";
    document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 40);
  }
  function downloadSingle(item) {
    triggerDownload(item.view_path || item.view_url || "#", item.name || "archivo");
  }
  function downloadGroup(key) {
    const g = (_lastGroups || []).find((x) => x.key === key);
    if (!g || !g.items?.length) return;
    let i = 0; (function tick() { if (i >= g.items.length) return; downloadSingle(g.items[i++]); setTimeout(tick, 150); })();
  }
  function downloadAll() {
    const all = []; (_lastGroups || []).forEach((g) => (g.items || []).forEach((it) => all.push(it)));
    if (!all.length) return;
    let i = 0; (function tick() { if (i >= all.length) return; downloadSingle(all[i++]); setTimeout(tick, 150); })();
  }

  // Modal
  function openModal(it) {
    _modalCurrentItem = it;
    const img = document.getElementById("imgBig");
    img.src = it.view_path || it.view_url || "";
    img.onerror = () => { // si justo ya no existe, cerramos
      closeModal();
    };
    document.getElementById("imgCaption").textContent = it.name || "";
    document.getElementById("imgModal").classList.add("is-open");
    const dlBtn = document.getElementById("imgDownload");
    if (dlBtn && !dlBtn.firstChild) dlBtn.innerHTML = ICON_DOWNLOAD;
  }
  function closeModal() {
    document.getElementById("imgModal").classList.remove("is-open");
    document.getElementById("imgBig").src = "";
    _modalCurrentItem = null;
  }

  // Carga de imágenes
  async function loadMedia() {
    const fecha = document.getElementById("rl-fecha")?.value;
    const local = document.getElementById("rl-local-select")?.value || window.SESSION_LOCAL;
    if (!fecha || !local) return;

    const host = document.getElementById("doc-accordions");
    if (host) host.innerHTML = ""; // limpia para que no se vea markup previo

    const url = new URL("/files/summary_media", location.origin);
    url.searchParams.set("fecha", fecha);
    url.searchParams.set("local", local);
    const r = await fetch(url.toString(), { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) { renderDocs([]); return; }
    const data = await r.json();
    renderDocs(data.groups || []);
  }

  async function refreshAll() {
    const selLocal = document.getElementById("rl-local-select");
    document.getElementById("rl-local-display").textContent = selLocal?.value || window.SESSION_LOCAL;
    await updateResumen().catch(() => {});
    await refreshEstadoLocalBadge().catch(() => {});
    await loadMedia();
    ensureGlobalDownloadButton();
    wireDataAccordions();
  }

  // Boot
  document.addEventListener("DOMContentLoaded", () => {
    setTodayIfEmpty(document.getElementById("rl-fecha"));

    // Sidebar
    const btnSidebar = document.getElementById("toggleSidebar");
    const root = document.querySelector(".layout");
    if (btnSidebar && root) btnSidebar.addEventListener("click", () => root.classList.toggle("sidebar-open"));

    // Listeners
    document.getElementById("rl-actualizar")?.addEventListener("click", () => loadMedia());
    document.getElementById("rl-fecha")?.addEventListener("change", () => refreshAll());
    document.getElementById("rl-cerrar-local")?.addEventListener("click", () => cerrarLocal());
    document.getElementById("imgClose")?.addEventListener("click", closeModal);
    document.getElementById("imgModal")?.addEventListener("click", (e) => { if (e.target.id === "imgModal") closeModal(); });
    document.getElementById("imgDownload")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (_modalCurrentItem) downloadSingle(_modalCurrentItem);
    });

    // Asegurar desde el inicio el botón global, los acordeones y la primera carga
    ensureGlobalDownloadButton();
    wireDataAccordions();
    refreshAll().catch(console.error);
  });
})();
