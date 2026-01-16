// ===== Sistema de Pestañas =====
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

tabButtons.forEach(button => {
  button.addEventListener('click', function() {
    // Remover clase active de todos los botones y panes
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabPanes.forEach(pane => pane.classList.remove('active'));

    // Agregar clase active al botón seleccionado
    this.classList.add('active');

    // Activar el panel correspondiente
    const tabId = this.getAttribute('data-tab');
    const pane = document.getElementById(tabId);
    if (pane) pane.classList.add('active');

    // Importante: emitir evento tipo Bootstrap para que el orquestador lo capte
    const ev = new CustomEvent('shown.bs.tab', { bubbles: true, detail: { tabKey: tabId } });
    this.dispatchEvent(ev);
    // (Opcional) emitir un evento descriptivo por si tenés otros listeners
    document.dispatchEvent(new CustomEvent('orq:tab-shown', { detail: { tabKey: tabId } }));
  });
});

// ===== Modal de Confirmación =====
const modal = document.getElementById('confirmationModal');
const btnConfirm = document.getElementById('btnConfirm');
const btnCancel = document.getElementById('btnCancel');
const modalMessage = document.getElementById('modalMessage');

function mostrarModal(mensaje, onConfirm) {
  modalMessage.textContent = mensaje;
  modal.style.display = 'flex';
  btnConfirm.onclick = function() {
    if (typeof onConfirm === 'function') onConfirm();
    cerrarModal();
  };
}
function cerrarModal() { modal.style.display = 'none'; }
btnCancel?.addEventListener('click', cerrarModal);
window.addEventListener('click', function(event) {
  if (event.target === modal) cerrarModal();
});

// ===== Pequeño helper (ajeno a Remesas) =====
document.addEventListener("DOMContentLoaded", () => {
  function actualizarTotalTarjetas() {
    const inputs = document.querySelectorAll(".tarjeta-monto");
    let total = 0;
    inputs.forEach(input => {
      const valor = parseFloat((input.value || '').replace(",", "."));
      if (!isNaN(valor)) total += valor;
    });
    const formatter = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 2
    });
    const totalEl = document.getElementById("totalTarjetasMonto");
    if (totalEl) totalEl.textContent = formatter.format(total);
  }
  document.querySelectorAll(".tarjeta-monto").forEach(input => {
    input.addEventListener("input", actualizarTotalTarjetas);
  });
});

// ======================================================================
// Remesas (integrado con OrqTabs)
// ======================================================================

document.addEventListener("DOMContentLoaded", function () {
  const fechaGlobal   = document.getElementById("fechaGlobal");
  const cajaSelect    = document.getElementById("cajaSelect");
  const turnoSelect   = document.getElementById("turnoSelect");
  const cajaHidden    = document.getElementById("cajaActual");
  const btnGuardar    = document.getElementById("btnGuardarRemesas");
  const btnAnadir     = document.getElementById("btnAnadirRemesa");
  const btnActualizar = document.getElementById("btnActualizarRemesa");
  const remesaForm    = document.getElementById("remesaForm");
  const tablaPreview  = document.getElementById("tablaPreviewRemesas");
  const respuestaDiv  = document.getElementById("respuestaRemesa");

  // === NUEVO: rol y flags de estado
  const ROLE = parseInt(window.ROLE_LEVEL || 1, 10);
  window.cajaCerrada = window.cajaCerrada ?? false;
  let localCerrado = false; // (reservado p/uso L2)
  let localAuditado = false;

  // Estado en memoria
  const remesasPorCaja       = {}; // nuevas en memoria
  const remesasNoRetiradas   = {}; // BD (sin fecha)
  const remesasHoy           = {}; // BD (de la fecha)
  let idxEdicionActual = null;
  let cancelandoEdicion = false;
  let editBDId = null;

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
      turno: (turnoSelect?.value || "").trim()
    };
  }
  function syncCajaHidden() { if (cajaHidden) cajaHidden.value = cajaSelect?.value || ""; }

  // === NUEVO: centraliza si el usuario puede actuar en UI
  function canActUI() {
    // Si el local está auditado, NADIE puede editar
    if (localAuditado) return false;
    if (ROLE >= 3) return true;           // auditor: siempre
    if (ROLE >= 2) return !localCerrado;  // encargado: mientras el local NO esté cerrado
    return !window.cajaCerrada;           // cajero: sólo con caja abierta
  }

  // === NUEVO: muestra/oculta botones de acción del formulario
  function toggleAccionesVisibles(on) {
    const disp = on ? 'inline-block' : 'none';
    if (btnAnadir)     btnAnadir.style.display     = disp;
    if (btnActualizar) btnActualizar.style.display = on && editBDId ? 'inline-block' : 'none';
    if (btnGuardar)    btnGuardar.style.display    = disp;
    // si querés bloquear inputs cuando no puede actuar:
    Array.from(remesaForm?.querySelectorAll('input,select,button') || []).forEach(el => {
      if (el === btnAnadir || el === btnActualizar || el === btnGuardar) return;
      el.disabled = !on;
    });
  }

  async function refrescarEstadoCaja({reRender=true} = {}) {
    const { local, caja, fecha, turno } = getCtx();
    if (!caja || !fecha || !turno) {
      window.cajaCerrada = false;
      localCerrado = false;
      localAuditado = false;
      toggleAccionesVisibles(canActUI());
      return;
    }
    try {
      const [rCaja, rLocal, rAudit] = await Promise.all([
        fetch(`/estado_caja?local=${encodeURIComponent(local)}&caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`),
        fetch(`/estado_local?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}`),
        fetch(`/api/estado_auditoria?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}`)
      ]);
      const dCaja = await rCaja.json();
      const dLocal = await rLocal.json().catch(() => ({ estado: 1 }));
      const dAudit = await rAudit.json().catch(() => ({ success: false, auditado: false }));
      window.cajaCerrada = ((dCaja.estado ?? 1) === 0);
      localCerrado = ((dLocal.estado ?? 1) === 0);
      localAuditado = (dAudit.success && dAudit.auditado) || false;
      console.log('🔍 REMESAS estado actualizado - cajaCerrada:', window.cajaCerrada, 'localCerrado:', localCerrado, 'localAuditado:', localAuditado);
    } catch {
      window.cajaCerrada = false;
      localCerrado = false;
      localAuditado = false;
    }
    toggleAccionesVisibles(canActUI());
    if (reRender) mostrarVistaPrevia(cajaSelect.value);
  }

  document.getElementById('btnCerrarCaja')?.addEventListener('click', () => {
    setTimeout(() => refrescarEstadoCaja({reRender:true}), 800);
  });

  function formatearFecha(fecha) {
    if (!fecha) return "";
    try {
      const date = new Date(fecha);
      const dia = String(date.getUTCDate()).padStart(2, '0');
      const mes = String(date.getUTCMonth() + 1).padStart(2, '0');
      const anio = date.getUTCFullYear();
      return `${dia}/${mes}/${anio}`;
    } catch { return fecha; }
  }

  function mostrarVistaPrevia(caja) {
    if (!tablaPreview) return;
    tablaPreview.innerHTML = "";

    const remesasLocales = remesasPorCaja[caja] || [];
    const todas = [
      ...(remesasNoRetiradas[caja] || []).map(r => ({ ...r, tipo: "no_retirada" })), // siempre visibles
      ...(remesasHoy[caja] || []).map(r => ({ ...r, tipo: "bd" })),                  // BD del día
      ...remesasLocales.map((r, idx) => ({ ...r, tipo: "local", idx }))              // en memoria
    ];

    const puedeActuar = canActUI();
    console.log('🔍 REMESAS mostrarVistaPrevia - localAuditado:', localAuditado, 'puedeActuar:', puedeActuar, 'canActUI():', canActUI());

    todas.forEach(r => {
      const fila = document.createElement("tr");
      if (r.tipo === "no_retirada") fila.style.backgroundColor = "#f8d7da"; // rojo claro
      else if (r.tipo === "bd") fila.classList.add("fila-hoy");

      const retiradaPor = r.retirada_por || "";
      let acciones = "";

      // === NUEVO: sólo pintamos acciones si puede actuar
      if (puedeActuar) {
        if (r.tipo === "no_retirada") {
          // Remesas NO RETIRADAS: Lápiz para editar datos (no para marcar retiro) + botón eliminar
          const esMismaCaja = (r.caja === caja);
          const cajaEstaAbierta = !window.cajaCerrada;

          // NIVEL 1 (cajero): Solo si es su caja Y está abierta
          if (ROLE === 1) {
            if (esMismaCaja && cajaEstaAbierta) {
              acciones = `
                <button class="btn-editar-inline" data-id="${r.id}" data-tipo="no_retirada" title="Editar">✏️</button>
                <button class="btn-borrar-bd" data-id="${r.id}" title="Borrar">🗑️</button>
              `;
            }
          }
          // NIVEL 2+ (encargado/auditor): Puede editar y eliminar
          else {
            if (esMismaCaja && !localCerrado) {
              acciones = `
                <button class="btn-editar-inline" data-id="${r.id}" data-tipo="no_retirada" title="Editar">✏️</button>
                <button class="btn-borrar-bd" data-id="${r.id}" title="Borrar">🗑️</button>
              `;
            }
          }
        } else if (r.tipo === "local") {
          acciones = `
            <button class="btn-editar-local" data-idx="${r.idx}" data-tipo="local" title="Editar">✏️</button>
            <button class="btn-borrar-local" data-idx="${r.idx}" data-tipo="local" title="Borrar">🗑️</button>
          `;
        } else if (r.tipo === "bd") {
          // Remesas YA RETIRADAS del día (desde BD)
          const esMismaCaja = (r.caja === caja);
          const cajaEstaAbierta = !window.cajaCerrada;

          // NIVEL 1 (cajero): Solo puede borrar si es su caja Y está abierta
          if (ROLE === 1) {
            // Editar inline: siempre disponible si es su caja y está abierta
            if (esMismaCaja && cajaEstaAbierta) {
              acciones = `
                <button class="btn-editar-inline" data-id="${r.id}" data-tipo="bd" title="Editar">✏️</button>
                <button class="btn-borrar-bd" data-id="${r.id}" title="Borrar">🗑️</button>
              `;
            }
          }
          // NIVEL 2+ (encargado/auditor): puede editar y borrar aunque la caja esté cerrada (mientras el local esté abierto)
          else {
            acciones = `<button class="btn-editar-inline" data-id="${r.id}" data-tipo="bd" title="Editar">✏️</button>`;
            if (esMismaCaja && !localCerrado) {
              acciones += ` <button class="btn-borrar-bd" data-id="${r.id}" title="Borrar">🗑️</button>`;
            }
          }
        }
      }

      // Agregar data-id y data-tipo a la fila para edición inline
      if (r.id) {
        fila.setAttribute('data-remesa-id', r.id);
        fila.setAttribute('data-remesa-tipo', r.tipo);
      }

      fila.innerHTML = `
        <td class="col-fecha">${formatearFecha(r.fecha)}</td>
        <td class="col-nro-remesa" data-field="nro_remesa">${r.nro_remesa ?? ""}</td>
        <td class="col-precinto" data-field="precinto">${r.precinto ?? ""}</td>
        <td class="col-monto" data-field="monto">$${parseFloat(r.monto ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
        <td class="col-retirada">${r.retirada || ""}</td>
        <td class="col-retirada-por">${retiradaPor}</td>
        <td class="col-acciones">${acciones}</td>
      `;
      tablaPreview.appendChild(fila);
    });

    // refuerza visibilidad de botones del formulario
    toggleAccionesVisibles(puedeActuar);
  }

  // === Función para hacer una fila editable inline ===
  function hacerFilaEditable(fila, remesaId, tipo) {
    // Guardar valores originales
    const nroRemesaCell = fila.querySelector('.col-nro-remesa');
    const precintoCell = fila.querySelector('.col-precinto');
    const montoCell = fila.querySelector('.col-monto');
    const accionesCell = fila.querySelector('.col-acciones');

    const originalNroRemesa = nroRemesaCell.textContent.trim();
    const originalPrecinto = precintoCell.textContent.trim();
    const originalMontoText = montoCell.textContent.trim();
    // Quitar el símbolo $ y los separadores de miles
    const originalMonto = originalMontoText.replace('$', '').replace(/\./g, '').replace(',', '.');

    // Crear inputs
    nroRemesaCell.innerHTML = `<input type="text" class="input-inline" value="${originalNroRemesa}" style="width: 100%; padding: 4px;">`;
    precintoCell.innerHTML = `<input type="text" class="input-inline" value="${originalPrecinto}" style="width: 100%; padding: 4px;">`;
    montoCell.innerHTML = `<input type="number" class="input-inline" value="${originalMonto}" step="0.01" style="width: 100%; padding: 4px;">`;

    // Botones de guardar y cancelar
    accionesCell.innerHTML = `
      <button class="btn-guardar-inline" data-id="${remesaId}" data-tipo="${tipo}" title="Guardar">💾</button>
      <button class="btn-cancelar-inline" title="Cancelar">❌</button>
    `;

    // Focus en el primer input
    nroRemesaCell.querySelector('input').focus();

    // Función para restaurar valores originales
    function restaurarFila() {
      nroRemesaCell.textContent = originalNroRemesa;
      precintoCell.textContent = originalPrecinto;
      montoCell.innerHTML = originalMontoText;
      // Restaurar botones de acción originales
      const puedeActuar = canActUI();
      if (puedeActuar) {
        if (tipo === 'no_retirada' || tipo === 'bd') {
          accionesCell.innerHTML = `
            <button class="btn-editar-inline" data-id="${remesaId}" data-tipo="${tipo}" title="Editar">✏️</button>
            <button class="btn-borrar-bd" data-id="${remesaId}" title="Borrar">🗑️</button>
          `;
        }
      } else {
        accionesCell.innerHTML = '';
      }
    }

    // Handler para cancelar
    const btnCancelar = accionesCell.querySelector('.btn-cancelar-inline');
    btnCancelar.addEventListener('click', restaurarFila);

    // Handler para guardar
    const btnGuardar = accionesCell.querySelector('.btn-guardar-inline');
    btnGuardar.addEventListener('click', async () => {
      const nuevoNroRemesa = nroRemesaCell.querySelector('input').value.trim();
      const nuevoPrecinto = precintoCell.querySelector('input').value.trim();
      const nuevoMonto = montoCell.querySelector('input').value.trim();

      if (!nuevoNroRemesa || !nuevoMonto) {
        alert("Número de remesa y monto son obligatorios");
        return;
      }

      // Hacer PUT request
      try {
        const response = await fetch(`/remesas/${remesaId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nro_remesa: nuevoNroRemesa,
            precinto: nuevoPrecinto,
            monto: nuevoMonto
          })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          alert("✅ Remesa actualizada");
          // Recargar la tabla
          await refrescarEstadoCaja({ reRender: false });
          if (window.OrqTabs) OrqTabs.reload('remesas');
          else legacyReload();
        } else {
          alert("❌ " + (data.msg || "Error al actualizar"));
          restaurarFila();
        }
      } catch (error) {
        console.error("Error al actualizar remesa:", error);
        alert("❌ Error de red");
        restaurarFila();
      }
    });
  }

  // === Listeners de la tabla ===
  tablaPreview?.addEventListener("click", async (e) => {
    const caja = cajaSelect.value;

    // === NUEVO: si no puede actuar, ignora cualquier botón
    if (!canActUI() && e.target.closest("button")) {
      alert("No tenés permisos para editar/borrar en esta caja.");
      return;
    }

    // LOCAL (en memoria) editar/borrar
    if (e.target.classList.contains("btn-editar-local")) {
      const idx = parseInt(e.target.dataset.idx);
      const remesa = (remesasPorCaja[caja] || [])[idx];
      if (!remesa) return;
      idxEdicionActual = idx;
      document.getElementById("nro_remesa").value   = remesa.nro_remesa;
      document.getElementById("precinto").value     = remesa.precinto;
      document.getElementById("monto").value        = remesa.monto;
      document.getElementById("retirada").value     = remesa.retirada;
      document.getElementById("retirada_por").value = remesa.retirada_por;
      toggleAccionesVisibles(canActUI());
      return;
    }
    if (e.target.classList.contains("btn-borrar-local")) {
      const idx = parseInt(e.target.dataset.idx);
      (remesasPorCaja[caja] ||= []).splice(idx, 1);
      mostrarVistaPrevia(caja);
      return;
    }

    // EDITAR INLINE: remesas BD o no retiradas
    if (e.target.classList.contains("btn-editar-inline")) {
      const id = e.target.dataset.id;
      const tipo = e.target.dataset.tipo;
      const fila = tablaPreview.querySelector(`tr[data-remesa-id="${id}"][data-remesa-tipo="${tipo}"]`);
      if (!fila) { alert("No se encontró la fila."); return; }

      // Hacer la fila editable
      hacerFilaEditable(fila, id, tipo);
      return;
    }

    // BD: BORRAR
    if (e.target.classList.contains("btn-borrar-bd")) {
      const id = e.target.dataset.id;
      if (!confirm("¿Seguro que querés borrar esta remesa?")) return;
      fetch(`/remesas/${id}`, { method: "DELETE" })
      .then(async r => {
        if (!r.ok) {
          const txt = await r.text();
          if (r.status === 409) alert("Caja/Local cerrados para tu rol: no se puede borrar.");
          else alert("Error al borrar: " + (txt || r.status));
          return null;
        }
        return r.json();
      })
      .then(async data => {
        if (!data) return;
        if (data.success) {
          alert("✅ Remesa borrada");
          await refrescarEstadoCaja({ reRender: false });
          if (window.OrqTabs) OrqTabs.reload('remesas');
          else legacyReload();
        } else {
          alert("❌ " + (data.msg || "Error al borrar"));
        }
      })
      .catch(() => alert("❌ Error de red"));
      return;
    }
  });

  // Actualizar remesa en BD (botón "Actualizar Remesa")
  btnActualizar?.addEventListener("click", async () => {
    if (!editBDId) { alert("No hay una remesa de BD seleccionada para actualizar."); return; }
    if (!canActUI()) { alert("No tenés permisos para actualizar en esta caja."); return; }

    const payload = {
      nro_remesa:   document.getElementById("nro_remesa").value.trim(),
      precinto:     document.getElementById("precinto").value.trim(),
      monto:        document.getElementById("monto").value.trim(), // backend normaliza
      retirada:     document.getElementById("retirada").value,
      retirada_por: document.getElementById("retirada_por").value.trim()
    };

    fetch(`/remesas/${editBDId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    .then(async r => {
      if (!r.ok) {
        const txt = await r.text();
        if (r.status === 409) alert("Caja/Local cerrados para tu rol: no se puede actualizar.");
        else alert("Error al actualizar: " + (txt || r.status));
        return null;
      }
      return r.json();
    })
    .then(async data => {
      if (!data) return;
      if (data.success) {
        alert("✅ Remesa actualizada");
        editBDId = null;
        remesaForm.reset();
        btnActualizar.style.display = "none";
        btnAnadir.style.display = canActUI() ? "inline-block" : "none";
        await refrescarEstadoCaja({ reRender: false });
        if (window.OrqTabs) OrqTabs.reload('remesas');
        else legacyReload();
      } else {
        alert("❌ " + (data.msg || "No se pudo actualizar"));
      }
    })
    .catch(() => alert("❌ Error de red"));
  });

  // Añadir remesa (memoria)
  btnAnadir?.addEventListener("click", async () => {
    if (!canActUI()) { alert("No tenés permisos para añadir en esta caja."); return; }
    if (!fechaGlobal.value) {
      alert("⚠️ Debe seleccionar una fecha antes de añadir una remesa.");
      return;
    }
    await refrescarEstadoCaja({ reRender: false });
    if (!canActUI()) { alert("No tenés permisos para añadir en esta caja."); return; }

    const caja = cajaSelect.value;
    const nuevaRemesa = {
      fecha: fechaGlobal.value,
      nro_remesa: document.getElementById("nro_remesa").value,
      precinto: document.getElementById("precinto").value,
      monto: document.getElementById("monto").value,
      retirada: document.getElementById("retirada").value,
      retirada_por: document.getElementById("retirada_por").value,
      tipo: "local"
    };
    (remesasPorCaja[caja] ||= []);
    if (idxEdicionActual !== null) {
      remesasPorCaja[caja][idxEdicionActual] = nuevaRemesa;
      idxEdicionActual = null;
    } else {
      remesasPorCaja[caja].push(nuevaRemesa);
    }
    remesaForm.reset();
    mostrarVistaPrevia(caja);
  });

  // Guardar en BD
  btnGuardar?.addEventListener("click", async () => {
    if (!canActUI()) { alert("No tenés permisos para guardar en esta caja."); return; }
    if (!fechaGlobal.value) {
      alert("⚠️ Debe seleccionar una fecha antes de guardar remesas.");
      return;
    }
    await refrescarEstadoCaja({ reRender: false });
    if (!canActUI()) { alert("No tenés permisos para guardar en esta caja."); return; }

    const { local, caja, fecha, turno } = getCtx();
    const nuevas = remesasPorCaja[caja] || [];
    if (nuevas.length === 0) { respuestaDiv.innerText = "No hay remesas nuevas para guardar."; return; }

    fetch("/guardar_remesas_lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ local, caja, remesas: nuevas, fecha, turno })
    })
    .then(res => res.json())
    .then(async data => {
      if (data.success) {
        respuestaDiv.innerText = data.msg || "Remesas guardadas correctamente.";
        remesasPorCaja[caja] = [];
        await refrescarEstadoCaja({ reRender: false });
        if (window.OrqTabs) OrqTabs.reload('remesas');
        else legacyReload();
      } else {
        respuestaDiv.innerText = "❌ Error: " + (data.msg || "");
      }
    })
    .catch(err => {
      console.error("Error:", err);
      respuestaDiv.innerText = "❌ Error de red.";
    });
  });

  // ===================== Render que llama el Orquestador =====================
  // opts.datasets = { "/remesas_no_retiradas": [...], "/remesas_hoy": [...], "/estado_caja": {...} }
  window.renderRemesas = function (_data, opts = {}) {
    const caja = cajaSelect.value;
    syncCajaHidden();

    const map = opts.datasets || {};
    const epNR  = Object.keys(map).find(k => k.includes('remesas_no_retiradas'));
    const epHoy = Object.keys(map).find(k => k.includes('remesas_hoy'));
    const epEC  = Object.keys(map).find(k => k.includes('estado_caja')); // ← NUEVO

    const arrNoRet = epNR
      ? (Array.isArray(map[epNR]) ? map[epNR] : (map[epNR]?.items || []))
      : [];
    const arrHoy   = epHoy
      ? (Array.isArray(map[epHoy]) ? map[epHoy] : (map[epHoy]?.items || []))
      : [];

    // === NUEVO: sincronizar estado de caja si vino en el payload del orquestador
    if (epEC && map[epEC] && typeof map[epEC] === 'object') {
      const d = map[epEC];
      window.cajaCerrada = ((d.estado ?? 1) === 0);
    }
    toggleAccionesVisibles(canActUI());

    // Actualizar estructuras locales y render
    remesasNoRetiradas[caja] = arrNoRet || [];
    remesasHoy[caja]         = arrHoy   || [];
    mostrarVistaPrevia(caja);
  };

  // ===================== Fallback sin orquestador =====================
  function legacyReload() {
    const { local, caja, fecha, turno } = getCtx();
    // CAMBIO: Ahora pasamos fecha a remesas_no_retiradas para que solo muestre las de la fecha actual
    const u1 = `/remesas_no_retiradas?caja=${encodeURIComponent(caja)}&local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`;
    const u2 = `/remesas_hoy?caja=${encodeURIComponent(caja)}${fecha ? `&fecha=${encodeURIComponent(fecha)}` : ''}&local=${encodeURIComponent(local)}&turno=${encodeURIComponent(turno)}`;
    Promise.all([
      fetch(u1).then(r => r.ok ? r.json() : []).catch(()=>[]),
      fetch(u2).then(r => r.ok ? r.json() : []).catch(()=>[]),
      fetch(`/estado_caja?local=${encodeURIComponent(local)}&caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`)
        .then(r => r.ok ? r.json() : {estado:1}).catch(()=>({estado:1}))
    ]).then(([noRet, hoy, est]) => {
      window.cajaCerrada = ((est.estado ?? 1) === 0);
      toggleAccionesVisibles(canActUI());
      remesasNoRetiradas[caja] = noRet || [];
      remesasHoy[caja]         = hoy   || [];
      mostrarVistaPrevia(caja);
    });
  }

  // ===================== Init mínimo =====================
  const cajaInicial = cajaSelect.value;
  syncCajaHidden();
  remesasPorCaja[cajaInicial]     = remesasPorCaja[cajaInicial] || [];
  remesasNoRetiradas[cajaInicial] = remesasNoRetiradas[cajaInicial] || [];
  remesasHoy[cajaInicial]         = remesasHoy[cajaInicial] || [];

  if (!window.OrqTabs) {
    (async () => {
      await refrescarEstadoCaja({ reRender: false });
      legacyReload();
    })();
  } else {
    // aseguramos estado inicial de botones
    toggleAccionesVisibles(canActUI());
  }
});
