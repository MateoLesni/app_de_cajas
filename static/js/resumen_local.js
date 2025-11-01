// static/js/resumen_local.js
// =====================================================
// Resumen Local (por día): acordeones + fetch + render
// + Botón Cerrar Local (snapshot en backend, sin "turno")
// Endpoints esperados:
//   GET  /api/resumen_local?local=...&fecha=YYYY-MM-DD
//   GET  /estado_local?fecha=YYYY-MM-DD           -> {estado: 1|0}
//   POST /api/cierre_local  body:{fecha: 'YYYY-MM-DD'} -> {success:true}
// =====================================================
(function () {
  // ---------- Utils ----------
  const fmt = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const money = (v) => fmt.format(Number(v || 0));

  const $ = (sel) => document.querySelector(sel);
  const $all = (sel) => Array.from(document.querySelectorAll(sel));

  function setText(id, val, allowMissing = true) {
    const el = typeof id === "string" ? document.getElementById(id) : id;
    if (!el) {
      if (!allowMissing) console.warn("setText: missing", id);
      return;
    }
    el.textContent = val;
  }

  function nowTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function setTodayIfEmpty(input) {
    if (!input) return;
    if (input.value) return;
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    input.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // ---------- Copy helpers ----------
  function getCopyTextFromElement(el) {
    if (!el) return "";
    if (el.dataset && el.dataset.copy) return String(el.dataset.copy);
    const clone = el.cloneNode(true);
    const btns = clone.querySelectorAll?.(".copy-btn");
    if (btns && btns.length) btns.forEach((b) => b.remove());
    return (clone.textContent || "").trim();
  }

  function addCopyButton(targetElement, getTextFn) {
    if (!targetElement) return;
    const existing = targetElement.querySelector(":scope > .copy-btn");
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
        const text =
          typeof getTextFn === "function"
            ? String(getTextFn())
            : getCopyTextFromElement(targetElement);
        await navigator.clipboard.writeText(text);
        btn.textContent = "✔";
        setTimeout(() => (btn.textContent = "⧉"), 900);
      } catch {
        btn.textContent = "!";
        setTimeout(() => (btn.textContent = "⧉"), 900);
      }
    });

    targetElement.appendChild(btn);
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

  // ---------- Z display formatter (PV 5 dígitos – Número 8 dígitos) ----------
  function formatZDisplay(it) {
    // Si el back ya trae z_display correcto, lo usamos
    const fromBack = (it && (it.z_display || "")).toString().trim();
    if (fromBack) return fromBack;

    // Intentamos encontrar PV y Número desde múltiples campos posibles
    const pvRaw =
      it?.z_pv ??
      it?.pv ??
      it?.pto_venta ??
      it?.punto_venta ??
      it?.pv_numero ??
      it?.puntoVenta ??
      0;

    const numRaw =
      it?.z_numero ??
      it?.numero_z ??
      it?.nro_z ??
      it?.num_z ??
      it?.numero ??
      it?.z ??
      0;

    const pv = String(pvRaw ?? 0).replace(/\D+/g, "");
    const num = String(numRaw ?? 0).replace(/\D+/g, "");

    const pv5 = pv.padStart(5, "0");
    const n8 = num.padStart(8, "0");

    return `${pv5}-${n8}`;
  }

  // ---------- Render ----------
  function renderResumen(data) {
    try {
      // Meta/top
      const inFecha = document.getElementById("rl-fecha");
      setText("rl-fecha-display", inFecha?.value || "—");
      setText("rl-hora-display", nowTime());
      setText("rl-updated-at", new Date().toLocaleString("es-AR"));

      // ===== RESUMEN =====
      const r = data?.resumen || {};
      setMoneyWithCopy("rl-venta-total", r.venta_total);
      setMoneyWithCopy("rl-total-cobrado", r.total_cobrado);
      setMoneyWithCopy("rl-diferencia", r.diferencia);

      const diffEl = document.getElementById("rl-diferencia");
      if (diffEl) {
        if (Number(r.diferencia || 0) < 0) diffEl.classList.add("negative-amount");
        else diffEl.classList.remove("negative-amount");
      }

      // ===== VENTAS =====
      const v = data?.ventas || {};
      setMoneyWithCopy("rl-vz-total", v.vta_z_total);
      setMoneyWithCopy("rl-vz-total-foot", v.vta_z_total);
      setMoneyWithCopy("rl-discovery", v.discovery);

      // Detalle Ventas Z
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

            // Siempre 00000-00000000 como en el Excel oficial
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

      // ===== INFORMACIÓN =====
      const info = data?.info || {};

      // Efectivo
      setMoneyWithCopy("rl-cash", info?.efectivo?.total);
      setMoneyWithCopy("rl-remesas", info?.efectivo?.remesas);
      setMoneyWithCopy("rl-cash-neto", info?.efectivo?.neto_efectivo);

      // Si usás totales por retiradas/no retiradas
      setMoneyWithCopy("rl-remesas-ret-total", info?.efectivo?.retiradas_total);
      setMoneyWithCopy("rl-remesas-no-ret-total", info?.efectivo?.no_retiradas_total);

      // Tarjeta + breakdown (VENTAS por tarjeta)
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

      // Mercado Pago
      setMoneyWithCopy("rl-mp", info?.mercadopago?.total);
      setMoneyWithCopy("rl-mp-tips", info?.mercadopago?.tips);

      // Rappi
      setMoneyWithCopy("rl-rappi", info?.rappi?.total);
      setMoneyWithCopy("rl-rappi-det", info?.rappi?.total);

      // PedidosYa
      setMoneyWithCopy("rl-pedidosya", info?.pedidosya?.total);
      setMoneyWithCopy("rl-pedidosya-det", info?.pedidosya?.total);

      // Gastos
      setMoneyWithCopy("rl-gastos", info?.gastos?.total);
      setMoneyWithCopy("rl-g-caja", info?.gastos?.caja_chica);
      setMoneyWithCopy("rl-g-otros", info?.gastos?.otros);
      setMoneyWithCopy("rl-g-total", info?.gastos?.total);

      // Cuenta Corriente
      setMoneyWithCopy("rl-cta-cte", info?.cuenta_cte?.total);
      setMoneyWithCopy("rl-cta-cte-det", info?.cuenta_cte?.total);

      // TIPs (totales + detalle por tarjeta + MP)
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

      // Copy en labels dentro de tablas
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

  // ---------- Fetch ----------
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

  // ---------- Boot ----------
  document.addEventListener("DOMContentLoaded", () => {
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
      btnSidebar.addEventListener("click", () =>
        root.classList.toggle("sidebar-open")
      );
    }

    bindGeneralAccordions();
    bindSubAccordions();

    document.getElementById("rl-actualizar")?.addEventListener("click", () => updateResumen().catch(console.error));
    document.getElementById("rl-fecha")?.addEventListener("change", () => updateResumen().catch(console.error));
    document.getElementById("rl-cerrar-local")?.addEventListener("click", cerrarLocal);

    updateResumen().catch(console.error);
    document.getElementById("rl-imprimir")?.addEventListener("click", () => window.print());
  });
})();
