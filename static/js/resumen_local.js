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

  function setMoney(id, val) { setText(id, money(val)); }

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
      setMoney("rl-venta-total", r.venta_total);
      setMoney("rl-total-cobrado", r.total_cobrado);
      setMoney("rl-diferencia", r.diferencia);

      const diffEl = document.getElementById("rl-diferencia");
      if (diffEl) {
        if (Number(r.diferencia || 0) < 0) diffEl.classList.add("negative-amount");
        else diffEl.classList.remove("negative-amount");
      }

      // ===== VENTAS =====
      const v = data?.ventas || {};
      setMoney("rl-vta-z", v.vta_z_total);
      setMoney("rl-discovery", v.discovery);

      // ===== INFORMACIÓN =====
      const info = data?.info || {};

      // Efectivo
      setMoney("rl-cash", info?.efectivo?.total);
      setMoney("rl-remesas", info?.efectivo?.remesas);
      setMoney("rl-cash-neto", info?.efectivo?.neto_efectivo);

      // Tarjeta + breakdown
      setMoney("rl-card", info?.tarjeta?.total);
      const bk = info?.tarjeta?.breakdown || {};
      setMoney("rl-tj-visa", bk["VISA"]);
      setMoney("rl-tj-visa-deb", bk["VISA DEBITO"]);
      setMoney("rl-tj-mc", bk["MASTERCARD"]);
      setMoney("rl-tj-mc-deb", bk["MASTERCARD DEBITO"]);
      setMoney("rl-tj-cabal", bk["CABAL"]);
      setMoney("rl-tj-cabal-deb", bk["CABAL DEBITO"]);
      setMoney("rl-tj-amex", bk["AMEX"]);
      setMoney("rl-tj-maestro", bk["MAESTRO"]);
      setMoney("rl-tj-pagos-inm", bk["PAGOS INMEDIATOS"]);
      setMoney("rl-card-total", info?.tarjeta?.total);

      // MP
      setMoney("rl-mp", info?.mercadopago?.total);
      setMoney("rl-mp-tips", info?.mercadopago?.tips);

      // Rappi
      setMoney("rl-rappi", info?.rappi?.total);
      setMoney("rl-rappi-det", info?.rappi?.total);

      // PedidosYa
      setMoney("rl-pedidosya", info?.pedidosya?.total);
      setMoney("rl-pedidosya-det", info?.pedidosya?.total);

      // Gastos
      setMoney("rl-gastos", info?.gastos?.total);
      setMoney("rl-g-caja", info?.gastos?.caja_chica);
      setMoney("rl-g-otros", info?.gastos?.otros);
      setMoney("rl-g-total", info?.gastos?.total);

      // Cuenta Corriente
      setMoney("rl-cta-cte", info?.cuenta_cte?.total);
      setMoney("rl-cta-cte-det", info?.cuenta_cte?.total);

      // TIPs
      setMoney("rl-tips", info?.tips?.total);
      setMoney("rl-tips-det", info?.tips?.total);
    } catch (e) {
      console.error("renderResumen error:", e);
    }
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
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
    await refreshEstadoLocalBadge(); // badge + botón cerrar
  }

  // ========= Estado del LOCAL + botón de cierre =========
  async function refreshEstadoLocalBadge() {
    const fecha = $("#rl-fecha")?.value;
    const local = ($("#rl-local-display")?.textContent || "").trim();
    const badge = $("#rl-badge-estado");
    const btn   = $("#rl-cerrar-local");

    if (!fecha || !local) return;

    try {
      const url = `/estado_local?fecha=${encodeURIComponent(fecha)}`;
      const r = await fetch(url, { cache: "no-store" });
      const d = r.ok ? await r.json() : { ok:false };
      // d.estado: 1=abierto, 0=cerrado
      const abierto = (d?.estado ?? 1) === 1;

      if (badge) {
        badge.style.display = "inline-block";
        badge.textContent = abierto ? "Local ABIERTO" : "Local CERRADO";
        badge.classList.toggle("sl-badge-open", abierto);
        badge.classList.toggle("sl-badge-closed", !abierto);
      }
      if (btn) {
        btn.disabled = !abierto; // solo habilitado si aún está abierto
        btn.title = abierto ? "Cerrar el Local del día" : "El local ya está cerrado";
      }
    } catch {
      // si falla, no rompemos la UI
    }
  }

  async function cerrarLocal() {
    const fecha = $("#rl-fecha")?.value;
    if (!fecha) {
      alert("Seleccioná una fecha.");
      return;
    }

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
      await updateResumen();            // refresca datos
      await refreshEstadoLocalBadge();  // deshabilita botón/actualiza badge
    } catch (e) {
      console.error(e);
      alert("❌ Error de red.");
    } finally {
      if (btn) { btn.textContent = oldTxt; }
    }
  }

  // ---------- Boot ----------
  document.addEventListener("DOMContentLoaded", () => {
    // Fecha por defecto, top bar, hora
    const inFecha = document.getElementById("rl-fecha");
    setTodayIfEmpty(inFecha);

    const topDate = document.getElementById("currentDate");
    if (topDate) topDate.textContent = new Date().toLocaleDateString("es-AR");
    setText("rl-fecha-display", inFecha?.value || "—");
    setText("rl-hora-display", nowTime());
    setText("rl-updated-at", new Date().toLocaleString("es-AR"));

    // Sidebar toggle
    const btnSidebar = document.getElementById("toggleSidebar");
    const root = document.querySelector(".layout");
    if (btnSidebar && root) {
      btnSidebar.addEventListener("click", () =>
        root.classList.toggle("sidebar-open")
      );
    }

    // Acordeones
    bindGeneralAccordions();
    bindSubAccordions();

    // Eventos
    document.getElementById("rl-actualizar")?.addEventListener("click", () => updateResumen().catch(console.error));
    document.getElementById("rl-fecha")?.addEventListener("change", () => updateResumen().catch(console.error));
    document.getElementById("rl-cerrar-local")?.addEventListener("click", cerrarLocal);

    // Carga inicial
    updateResumen().catch(console.error);

    // Imprimir
    document.getElementById("rl-imprimir")?.addEventListener("click", () => window.print());
  });
})();
