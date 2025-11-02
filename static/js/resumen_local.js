// static/js/resumen_local.js
// =====================================================
// Resumen Local (por día): acordeones + fetch + render
// + Botón Cerrar Local (snapshot en backend, sin "turno")
// + Panel de Documentos con preview, descarga por imagen,
//   descarga por acordeón y descarga global.
// Endpoints:
//   GET  /api/resumen_local?local=...&fecha=YYYY-MM-DD
//   GET  /estado_local?fecha=YYYY-MM-DD
//   POST /api/cierre_local {fecha}
//   GET  /files/summary_media?local=...&fecha=YYYY-MM-DD
//   GET  /files/view?id=<blob_name>
// =====================================================
(function () {
  // ---------- Utils ----------
  const fmt = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (v) => fmt.format(Number(v || 0));
  const $ = (sel) => document.querySelector(sel);
  const $all = (sel) => Array.from(document.querySelectorAll(sel));
  const ROLE_LEVEL = Number(window.ROLE_LEVEL || 1);
  const SESSION_LOCAL = (window.SESSION_LOCAL || "").trim();

  function setText(id, val, allowMissing = true) {
    const el = typeof id === "string" ? document.getElementById(id) : id;
    if (!el) { if (!allowMissing) console.warn("setText: missing", id); return; }
    el.textContent = val;
  }
  function nowTime() {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function setTodayIfEmpty(input) {
    if (!input || input.value) return;
    const d = new Date(), p = (n) => String(n).padStart(2,"0");
    input.value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }

  // ---------- Copiar ----------
  function getCopyTextFromElement(el) {
    if (!el) return "";
    if (el.dataset && el.dataset.copy) return String(el.dataset.copy);
    const clone = el.cloneNode(true);
    const btns = clone.querySelectorAll?.(".copy-btn");
    if (btns && btns.length) btns.forEach((b) => b.remove());
    return (clone.textContent || "").trim();
  }
  function addCopyButton(target, getTextFn) {
    if (!target) return;
    const existing = target.querySelector(":scope > .copy-btn");
    if (existing) return existing;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-btn";
    btn.style.marginLeft = "6px";
    btn.style.fontSize = "11px";
    btn.style.lineHeight = "1";
    btn.style.padding = "2px 6px";
    btn.style.border = "1px solid #cbd5e1";
    btn.style.borderRadius = "6px";
    btn.style.background = "#f8fafc";
    btn.style.cursor = "pointer";
    btn.title = "Copiar";
    btn.textContent = "⧉";
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        const text = typeof getTextFn === "function" ? String(getTextFn()) : getCopyTextFromElement(target);
        await navigator.clipboard.writeText(text);
        btn.textContent = "✔";
        setTimeout(() => (btn.textContent = "⧉"), 900);
      } catch {
        btn.textContent = "!";
        setTimeout(() => (btn.textContent = "⧉"), 900);
      }
    });
    target.appendChild(btn);
    return btn;
  }
  function setMoneyWithCopy(id, val) {
    const el = typeof id === "string" ? document.getElementById(id) : id;
    if (!el) return;
    const txt = money(val);
    el.textContent = txt;
    el.dataset.copy = txt;
    addCopyButton(el);
  }

  // ---------- Acordeones ----------
  function toggleAria(el) {
    if (!el) return;
    const isOpen = el.getAttribute("aria-expanded") === "true";
    el.setAttribute("aria-expanded", isOpen ? "false" : "true");
  }
  function bindGeneralAccordions() {
    $all(".sl-section.acc").forEach((section) => {
      const head = section.querySelector(".sl-title");
      if (!head) return;
      head.addEventListener("click", () => toggleAria(section));
    });
  }
  function bindSubAccordions() {
    $all(".sub-acc.acc").forEach((sub) => {
      const row = sub.querySelector(".sl-row");
      if (!row) return;
      if (!sub.hasAttribute("aria-expanded")) sub.setAttribute("aria-expanded", "false");
      row.addEventListener("click", () => toggleAria(sub));
    });
  }
  function addCopyToLabelCellsWithin(container) {
    if (!container) return;
    const rows = container.querySelectorAll("tbody tr, tr:not(:has(th))");
    rows.forEach((tr) => {
      const td = tr.querySelector("td:first-child");
      if (!td) return;
      const baseText = getCopyTextFromElement(td);
      if (!baseText) return;
      addCopyButton(td, () => baseText);
    });
  }

  // ---------- Z display ----------
  function formatZDisplay(it) {
    const fromBack = (it && (it.z_display || "")).toString().trim();
    if (fromBack) return fromBack;
    const pvRaw = it?.z_pv ?? it?.pv ?? it?.pto_venta ?? it?.punto_venta ?? it?.pv_numero ?? it?.puntoVenta ?? 0;
    const numRaw = it?.z_numero ?? it?.numero_z ?? it?.nro_z ?? it?.num_z ?? it?.numero ?? it?.z ?? 0;
    const pv = String(pvRaw ?? 0).replace(/\D+/g, "");
    const num = String(numRaw ?? 0).replace(/\D+/g, "");
    return `${pv.padStart(5,"0")}-${num.padStart(8,"0")}`;
  }

  // ---------- Render Resumen ----------
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
      const diffEl = document.getElementById("rl-diferencia");
      if (diffEl) {
        if (Number(r.diferencia || 0) < 0) diffEl.classList.add("negative-amount");
        else diffEl.classList.remove("negative-amount");
      }

      const v = data?.ventas || {};
      setMoneyWithCopy("rl-vz-total", v.vta_z_total);
      setMoneyWithCopy("rl-vz-total-foot", v.vta_z_total);
      setMoneyWithCopy("rl-discovery", v.discovery);

      const tbVz = document.getElementById("rl-vz-items");
      if (tbVz) {
        tbVz.innerHTML = "";
        const items = Array.isArray(v.z_items) ? v.z_items : [];
        if (!items.length) {
          const tr = document.createElement("tr");
          tr.className = "muted";
          const td = document.createElement("td");
          td.colSpan = 2;
          td.textContent = "Sin ventas z cargadas";
          tr.appendChild(td);
          tbVz.appendChild(tr);
        } else {
          items.forEach((it) => {
            const tr = document.createElement("tr");
            const display = formatZDisplay(it);
            const tdName = document.createElement("td");
            tdName.textContent = display;
            tdName.dataset.copy = display;
            addCopyButton(tdName);
            const tdAmt = document.createElement("td");
            tdAmt.className = "r";
            const amtTxt = money(it?.monto || 0);
            tdAmt.textContent = amtTxt;
            tdAmt.dataset.copy = amtTxt;
            addCopyButton(tdAmt);
            tr.appendChild(tdName);
            tr.appendChild(tdAmt);
            tbVz.appendChild(tr);
          });
        }
        const vzFoot = document.getElementById("rl-vz-total-foot");
        if (vzFoot) addCopyButton(vzFoot);
        addCopyToLabelCellsWithin(tbVz.closest("table"));
      }

      const info = data?.info || {};
      setMoneyWithCopy("rl-cash", info?.efectivo?.total);
      setMoneyWithCopy("rl-remesas", info?.efectivo?.remesas);
      setMoneyWithCopy("rl-cash-neto", info?.efectivo?.neto_efectivo);
      setMoneyWithCopy("rl-remesas-ret-total", info?.efectivo?.retiradas_total);
      setMoneyWithCopy("rl-remesas-no-ret-total", info?.efectivo?.no_retiradas_total);

      setMoneyWithCopy("rl-card", info?.tarjeta?.total);
      const bk = info?.tarjeta?.breakdown || {};
      setMoneyWithCopy("rl-tj-visa", bk["VISA"]);
      setMoneyWithCopy("rl-tj-visa-deb", bk["VISA DEBITO"]);
      setMoneyWithCopy("rl-tj-visa-pre", bk["VISA PREPAGO"]);
      setMoneyWithCopy("rl-tj-mc", bk["MASTERCARD"]);
      setMoneyWithCopy("rl-tj-mc-deb", bk["MASTERCARD DEBITO"]);
      setMoneyWithCopy("rl-tj-mc-pre", bk["MASTERCARD PREPAGO"]);
      setMoneyWithCopy("rl-tj-cabal", bk["CABAL"]);
      setMoneyWithCopy("rl-tj-cabal-deb", bk["CABAL DEBITO"]);
      setMoneyWithCopy("rl-tj-amex", bk["AMEX"]);
      setMoneyWithCopy("rl-tj-maestro", bk["MAESTRO"]);
      setMoneyWithCopy("rl-tj-naranja", bk["NARANJA"]);
      setMoneyWithCopy("rl-tj-decidir", bk["DECIDIR"]);
      setMoneyWithCopy("rl-tj-diners", bk["DINERS"]);
      setMoneyWithCopy("rl-tj-pagos-inm", bk["PAGOS INMEDIATOS"]);
      setMoneyWithCopy("rl-card-total", info?.tarjeta?.total);

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

      setMoneyWithCopy("rl-tips", info?.tips?.total);
      setMoneyWithCopy("rl-tips-det", info?.tips?.total);
      setMoneyWithCopy("rl-tips-mp", info?.tips?.mp);
      setMoneyWithCopy("rl-tips-tarjetas", info?.tips?.tarjetas);
      const tbTipsBreakdown = info?.tips?.breakdown || {};
      const tipIdMap = {
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
      Object.entries(tipIdMap).forEach(([marca, id]) => {
        setMoneyWithCopy(id, tbTipsBreakdown[marca] || 0);
      });

      addCopyToLabelCellsWithin(document.getElementById("rl-tj-visa")?.closest("table"));
      addCopyToLabelCellsWithin(document.getElementById("rl-mp-tips")?.closest("table"));
      ["rl-rappi-det", "rl-pedidosya-det", "rl-g-total", "rl-cta-cte-det", "rl-tips-det"].forEach((id) => {
        const tbl = document.getElementById(id)?.closest("table");
        if (tbl) addCopyToLabelCellsWithin(tbl);
      });

    } catch (e) {
      console.error("renderResumen error:", e);
    }
  }

  // ---------- Fetch Resumen ----------
  async function fetchResumenLocal(params) {
    const url = `/api/resumen_local?local=${encodeURIComponent(params.local || "")}&fecha=${encodeURIComponent(params.fecha || "")}`;
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`HTTP ${r.status} ${txt}`);
    }
    return await r.json();
  }
  async function updateResumen() {
    const local = ($("#rl-local-display")?.textContent || "").trim();
    const fecha = $("#rl-fecha")?.value;
    if (!local || !fecha) return;
    const data = await fetchResumenLocal({ local, fecha });
    renderResumen(data);
    await refreshEstadoLocalBadge();
  }

  // ========= Estado del LOCAL + botón de cierre =========
  async function refreshEstadoLocalBadge() {
    const fecha = $("#rl-fecha")?.value;
    const badge = $("#rl-badge-estado");
    const btn   = $("#rl-cerrar-local");
    if (!fecha) return;
    try {
      const url = `/estado_local?fecha=${encodeURIComponent(fecha)}`;
      const r = await fetch(url, { cache: "no-store" });
      const d = r.ok ? await r.json() : { ok:false };
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
    if (!confirm(`Esto cerrará el LOCAL para ${fecha}.\n- Bloquea edición para nivel 2.\n- Genera el snapshot para auditoría.\n\n¿Confirmás?`)) {
      return;
    }
    const btn = $("#rl-cerrar-local");
    const oldTxt = btn ? btn.textContent : "";
    try {
      if (btn) { btn.disabled = true; btn.textContent = "Cerrando…"; }
      const r = await fetch("/api/cierre_local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.success) {
        if (r.status === 409 && data?.detalle?.length) {
          alert(`No se puede cerrar: hay cajas sin cerrar.\nDetalle: ${data.detalle.join(", ")}`);
        } else {
          alert(`Error al cerrar el local: ${data?.msg || r.status}`);
        }
        return;
      }
      alert("✅ Local cerrado y snapshot creado.");
      await updateResumen();
      await refreshEstadoLocalBadge();
    } catch (e) {
      console.error(e);
      alert("❌ Error de red.");
    } finally {
      if (btn) { btn.textContent = oldTxt; }
    }
  }

  // ---------- Helpers DOM para Documentos ----------
  function el(tag, attrs={}, ...children){
    const n = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if (k==='class') n.className=v;
      else if (k.startsWith('on') && typeof v==='function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k,v);
    });
    children.forEach(c=> n.appendChild(typeof c==='string' ? document.createTextNode(c) : c));
    return n;
  }

  async function loadLocalesIfNeeded(){
    const sel = document.getElementById('rl-local-select');
    if (!sel) return; // nivel < 3
    sel.innerHTML = '<option>Cargando…</option>';
    try {
      const res = await fetch('/api/locales_options', {credentials:'same-origin', cache:'no-store'});
      const data = await res.json();
      const locales = (data && data.locales) || [SESSION_LOCAL];
      sel.innerHTML='';
      locales.forEach(l=>{
        const opt = el('option', {value:l}, l);
        if (l === SESSION_LOCAL) opt.selected = true;
        sel.appendChild(opt);
      });
      document.getElementById('rl-local-display').textContent = sel.value || SESSION_LOCAL;
    } catch {
      sel.innerHTML='';
      const opt = el('option', {value:SESSION_LOCAL}, SESSION_LOCAL);
      opt.selected = true; sel.appendChild(opt);
    }
  }

  function downloadUrl(url, filename){
    const a = document.createElement('a');
    a.href = url;
    if (filename) a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>a.remove(), 0);
  }
  async function bulkDownload(items){
    // descarga una por una; si luego querés ZIP lo hacemos desde back o con JSZip
    for (const it of items) {
      const url = it.view_url || it.view_path;
      downloadUrl(url, it.name || 'archivo');
      await new Promise(r => setTimeout(r, 150)); // pequeña espera para no saturar
    }
  }

  // ---------- Render Documentos ----------
  function renderDocs(groups){
    const host = document.getElementById('doc-accordions');
    host.innerHTML = '';
    const order = [
      ['remesas','Remesas'],
      ['ventas_z','Ventas Z'],
      ['mercadopago','Mercado Pago'],
      ['tarjeta','Tarjeta'],
      ['rappi','Rappi'],
      ['pedidosya','PedidosYa'],
      ['gastos','Gastos'],
      ['cuenta_cte','Cuenta Cte.'],
    ];
    const byKey = {}; (groups||[]).forEach(g=>byKey[g.key]=g);

    // botón global "Todo" (en el header de la card)
    ensureGlobalDownload(groups);

    order.forEach(([key,label])=>{
      const g = byKey[key] || {label, count:0, items:[]};
      const acc = el('div', {'class':'doc-acc', 'aria-expanded':'false'});

      // header con contador y botón de descarga del acordeón
      const hdrLeft  = el('span', {}, g.label || label);
      const hdrRight = el('span', {'class':'count'}, String(g.count||0));
      const btnAccDownload = el('button', {
        class: 'btn btn-ghost',
        title: 'Descargar este grupo',
        onclick: (e) => { e.stopPropagation(); bulkDownload(g.items || []); }
      }, '💾');

      const hdr = el('div', {'class':'doc-row', onclick:()=>toggle(acc)},
        el('span', {}, hdrLeft, ' '),
        el('span', {}, hdrRight, ' ', btnAccDownload)
      );

      // body
      const body = el('div', {'class':'acc-body'},
        (g.count ? buildThumbs(g.items) : el('div', {'class':'muted', style:'padding:10px;'}, 'Sin imágenes cargadas'))
      );

      acc.appendChild(hdr);
      acc.appendChild(body);
      host.appendChild(acc);
    });

    function toggle(acc){ acc.setAttribute('aria-expanded', acc.getAttribute('aria-expanded')==='true'?'false':'true'); }

    function buildThumbs(items){
      const wrap = el('div', {'class':'thumbs'});
      (items||[]).forEach(it=>{
        const src = it.view_url || it.view_path;       // Fallback clave
        const card = el('div', {'class':'thumb'});

        const img  = el('img', {src: src, alt: it.name || 'imagen'});
        img.addEventListener('click', ()=> openModal(it));
        card.appendChild(img);

        const bar  = el('div', {'class':'meta'});
        const name = el('span', {}, it.name || '—');

        const actions = el('span', {style:'float:right; display:flex; gap:8px;'});
        const btnZoom = el('button', {class:'btn-ghost', title:'Ver', onclick:()=>openModal(it)}, '🔍');
        const btnDown = el('a', {href: src, download: it.name || 'archivo', title:'Descargar'}, '💾');

        actions.appendChild(btnZoom);
        actions.appendChild(btnDown);

        bar.appendChild(name);
        bar.appendChild(actions);

        card.appendChild(bar);
        wrap.appendChild(card);
      });
      return wrap;
    }
  }

  function ensureGlobalDownload(groups){
    // busca/crea el botón “Todo” en el header de la card de Documentos
    const head = document.querySelector('.doc-card .doc-head');
    if (!head) return;
    let btn = head.querySelector('#btn-download-all');
    if (!btn) {
      btn = el('button', { id:'btn-download-all', class:'btn btn-ghost', title:'Descargar todas' }, 'Todo');
      head.appendChild(btn);
    }
    btn.onclick = async () => {
      const allItems = [];
      (groups||[]).forEach(g => (g.items||[]).forEach(it => allItems.push(it)));
      if (!allItems.length) { alert('No hay imágenes para descargar.'); return; }
      await bulkDownload(allItems);
    };
  }

  // ---------- Modal ----------
  function openModal(it){
    const src = it.view_url || it.view_path;          // Fallback en modal
    document.getElementById('imgBig').src = src;
    document.getElementById('imgCaption').textContent = it.name || '';
    document.getElementById('imgModal').classList.add('is-open');
  }
  function closeModal(){
    document.getElementById('imgModal').classList.remove('is-open');
    document.getElementById('imgBig').src = '';
  }
  document.getElementById('imgClose')?.addEventListener('click', closeModal);
  document.getElementById('imgModal')?.addEventListener('click', e => { if (e.target.id==='imgModal') closeModal(); });

  // ---------- Fetch Documentos ----------
  async function loadMedia(){
    const fecha = document.getElementById('rl-fecha').value;
    const local = (document.getElementById('rl-local-select')?.value) || SESSION_LOCAL;
    if (!fecha || !local) return;
    const url = new URL('/files/summary_media', location.origin);
    url.searchParams.set('fecha', fecha);
    url.searchParams.set('local', local);
    const r = await fetch(url.toString(), {credentials:'same-origin', cache:'no-store'});
    if (!r.ok){ renderDocs([]); return; }
    const data = await r.json();
    renderDocs(data.groups || []);
  }

  // ---------- Refresh All ----------
  async function refreshAll(){
    const selectedLocal = (document.getElementById('rl-local-select')?.value) || SESSION_LOCAL;
    document.getElementById('rl-local-display').textContent = selectedLocal;
    document.getElementById('rl-actualizar')?.dispatchEvent(new Event('click')); // actualiza panel izquierdo
    await loadMedia(); // panel derecho
  }

  // ---------- Boot ----------
  document.addEventListener("DOMContentLoaded", async () => {
    const inFecha = document.getElementById("rl-fecha");
    setTodayIfEmpty(inFecha);

    const topDate = document.getElementById("currentDate");
    if (topDate) topDate.textContent = new Date().toLocaleDateString("es-AR");
    setText("rl-fecha-display", inFecha?.value || "—");
    setText("rl-hora-display", nowTime());
    setText("rl-updated-at", new Date().toLocaleString("es-AR"));

    const btnSidebar = document.getElementById("toggleSidebar");
    const root = document.querySelector(".layout");
    if (btnSidebar && root) {
      btnSidebar.addEventListener("click", () => root.classList.toggle("sidebar-open"));
    }

    bindGeneralAccordions();
    bindSubAccordions();

    // listeners resumen numérico
    document.getElementById("rl-actualizar")?.addEventListener("click", () => updateResumen().catch(console.error));
    document.getElementById("rl-fecha")?.addEventListener("change", () => refreshAll().catch(console.error));
    document.getElementById("rl-cerrar-local")?.addEventListener("click", cerrarLocal);
    document.getElementById("rl-imprimir")?.addEventListener("click", () => window.print());

    // locales (solo nivel 3)
    await loadLocalesIfNeeded();

    // primera carga
    await updateResumen().catch(console.error);
    await loadMedia();

    // si cambia local (nivel 3) refrescamos ambos paneles
    const sel = document.getElementById('rl-local-select');
    if (sel) sel.addEventListener('change', () => refreshAll().catch(console.error));
  });
})();
