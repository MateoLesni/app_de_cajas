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
  const btnGuardar    = document.getElementById("btnGuardarRemesa"); // Cambiado: ahora es singular
  const remesaForm    = document.getElementById("remesaForm");
  const tablaPreview  = document.getElementById("tablaPreviewRemesas");
  const respuestaDiv  = document.getElementById("respuestaRemesa");

  // === NUEVO: rol y flags de estado
  const ROLE = parseInt(window.ROLE_LEVEL || 1, 10);
  window.cajaCerrada = window.cajaCerrada ?? false;
  let localCerrado = false; // (reservado p/uso L2)
  let localAuditado = false;

  // Estado en memoria (solo BD, no hay remesas "locales")
  const todasLasRemesas = {}; // Todas las remesas de la caja/fecha/turno (retiradas y no retiradas)
  let cancelandoEdicion = false;

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
    if (btnGuardar) btnGuardar.style.display = disp;
    // si querés bloquear inputs cuando no puede actuar:
    Array.from(remesaForm?.querySelectorAll('input,select,button') || []).forEach(el => {
      if (el === btnGuardar) return;
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

    // Solo mostramos remesas desde BD (todas las de este turno)
    const todas = (todasLasRemesas[caja] || []).map(r => ({
      ...r,
      // Clasificar según retirada: 0 o vacío = no_retirada, 1 o 'Sí' = retirada
      tipo: (r.retirada === 1 || r.retirada === '1' || r.retirada === 'Sí' || r.retirada === 'Si') ? "bd" : "no_retirada"
    }));

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

      // Formatear monto según divisa
      let montoDisplay = '';
      if (r.divisa === 'USD' && r.monto_usd) {
        const montoUSD = parseFloat(r.monto_usd ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        const totalARS = parseFloat(r.total_conversion ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 0 });
        montoDisplay = `${montoUSD} USD ($${totalARS})`;
      } else {
        montoDisplay = `$${parseFloat(r.monto ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
      }

      fila.innerHTML = `
        <td class="col-fecha">${formatearFecha(r.fecha)}</td>
        <td class="col-nro-remesa" data-field="nro_remesa">${r.nro_remesa ?? ""}</td>
        <td class="col-precinto" data-field="precinto">${r.precinto ?? ""}</td>
        <td class="col-monto" data-field="monto">${montoDisplay}</td>
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
    // Buscar datos completos de la remesa
    const caja = cajaSelect.value;
    const remesa = (todasLasRemesas[caja] || []).find(r => r.id == remesaId);
    const esUSD = remesa && remesa.divisa === 'USD';

    // Guardar valores originales
    const nroRemesaCell = fila.querySelector('.col-nro-remesa');
    const precintoCell = fila.querySelector('.col-precinto');
    const montoCell = fila.querySelector('.col-monto');
    const accionesCell = fila.querySelector('.col-acciones');

    const originalNroRemesa = nroRemesaCell.textContent.trim();
    const originalPrecinto = precintoCell.textContent.trim();
    const originalMontoText = montoCell.textContent.trim();

    // Crear inputs básicos
    nroRemesaCell.innerHTML = `<input type="text" class="input-inline" value="${originalNroRemesa}" style="width: 100%; padding: 4px;">`;
    precintoCell.innerHTML = `<input type="text" class="input-inline" value="${originalPrecinto}" style="width: 100%; padding: 4px;">`;

    // Si es USD, mostrar campos USD con cálculo automático
    if (esUSD) {
      const montoUSD = remesa.monto_usd || 0;
      const cotizacion = remesa.cotizacion_divisa || 0;

      montoCell.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div>
            <div style="font-size: 10px; color: #888; margin-bottom: 2px; font-weight: 500;">Monto en USD</div>
            <input type="number" class="input-inline-usd" value="${montoUSD}" step="1" style="width: 100%; padding: 4px; font-size: 13px; border: 1px solid #ccc; border-radius: 3px;">
          </div>
          <div>
            <div style="font-size: 10px; color: #888; margin-bottom: 2px; font-weight: 500;">Cotización en pesos</div>
            <input type="number" class="input-inline-cotizacion" value="${cotizacion}" step="0.01" style="width: 100%; padding: 4px; font-size: 13px; border: 1px solid #ccc; border-radius: 3px;">
          </div>
          <div>
            <div style="font-size: 10px; color: #888; margin-bottom: 2px; font-weight: 500;">Total convertido</div>
            <input type="text" class="input-inline-total-conv" readonly style="width: 100%; padding: 4px; background-color: #f5f5f5; font-size: 12px; color: #666; border: 1px solid #ddd; border-radius: 3px; cursor: not-allowed;">
          </div>
        </div>
      `;

      // Función para calcular total_conversion en edición inline
      const inputUSD = montoCell.querySelector('.input-inline-usd');
      const inputCotiz = montoCell.querySelector('.input-inline-cotizacion');
      const inputTotal = montoCell.querySelector('.input-inline-total-conv');

      function calcularTotalInline() {
        const usd = parseFloat(inputUSD.value) || 0;
        const cot = parseFloat(inputCotiz.value) || 0;
        if (usd > 0 && cot > 0) {
          const total = usd * cot;
          inputTotal.value = `= $${total.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;
        } else {
          inputTotal.value = '';
        }
      }

      // Calcular inicialmente
      calcularTotalInline();

      // Recalcular cuando cambien los valores
      inputUSD.addEventListener('input', calcularTotalInline);
      inputCotiz.addEventListener('input', calcularTotalInline);

    } else {
      // Si es ARS, mostrar input de monto normal
      const originalMonto = originalMontoText.replace('$', '').replace(/\./g, '').replace(',', '.');
      montoCell.innerHTML = `<input type="number" class="input-inline" value="${originalMonto}" step="0.01" style="width: 100%; padding: 4px;">`;
    }

    // Botones de guardar y cancelar
    accionesCell.innerHTML = `
      <button class="btn-guardar-inline" data-id="${remesaId}" data-tipo="${tipo}" title="Guardar" style="background-color: #28a745; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 16px;">✓</button>
      <button class="btn-cancelar-inline" title="Cancelar" style="background-color: #dc3545; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; margin-left: 4px;">✕</button>
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

      let bodyData = {
        nro_remesa: nuevoNroRemesa,
        precinto: nuevoPrecinto
      };

      // Si es USD, validar y enviar campos USD
      if (esUSD) {
        const inputUSD = montoCell.querySelector('.input-inline-usd');
        const inputCotiz = montoCell.querySelector('.input-inline-cotizacion');
        const nuevoMontoUSD = inputUSD?.value.trim();
        const nuevaCotizacion = inputCotiz?.value.trim();

        if (!nuevoNroRemesa || !nuevoMontoUSD || !nuevaCotizacion) {
          alert("Número de remesa, monto USD y cotización son obligatorios");
          return;
        }

        bodyData.divisa = 'USD';
        bodyData.monto_usd = nuevoMontoUSD;
        bodyData.cotizacion_divisa = nuevaCotizacion;
      } else {
        // Si es ARS, validar y enviar monto normal
        const nuevoMonto = montoCell.querySelector('input')?.value.trim();

        if (!nuevoNroRemesa || !nuevoMonto) {
          alert("Número de remesa y monto son obligatorios");
          return;
        }

        bodyData.monto = nuevoMonto;
      }

      // Hacer PUT request
      try {
        const response = await fetch(`/remesas/${remesaId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyData)
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

  // Los botones "Añadir Remesa" y "Actualizar Remesa" fueron eliminados
  // Ahora solo existe "Guardar Remesa" que guarda directamente en BD

  // ===== NUEVO: Lógica para checkbox "Son dólares" y cálculo automático =====
  const checkboxDolares = document.getElementById("son_dolares");
  const usdFieldsContainer = document.getElementById("usd_fields_container");
  const montoARSContainer = document.getElementById("monto_ars_container");
  const inputMonto = document.getElementById("monto");
  const inputMontoUSD = document.getElementById("monto_usd");
  const inputCotizacion = document.getElementById("cotizacion_divisa");
  const inputTotalConversion = document.getElementById("total_conversion");

  // Mostrar/ocultar campos según checkbox
  checkboxDolares?.addEventListener("change", () => {
    const esDolares = checkboxDolares.checked;

    // Toggle campos USD
    if (usdFieldsContainer) {
      usdFieldsContainer.style.display = esDolares ? "block" : "none";
    }

    // Toggle campo Monto ARS (ocultar si es USD)
    if (montoARSContainer) {
      montoARSContainer.style.display = esDolares ? "none" : "block";
    }

    // Ajustar required
    if (inputMonto) {
      inputMonto.required = !esDolares;
    }

    // Limpiar campos según lo que se desmarca
    if (esDolares) {
      // Si marca USD, limpiar campo ARS
      if (inputMonto) inputMonto.value = "";
    } else {
      // Si desmarca USD, limpiar campos USD
      if (inputMontoUSD) inputMontoUSD.value = "";
      if (inputCotizacion) inputCotizacion.value = "";
      if (inputTotalConversion) inputTotalConversion.value = "";
    }
  });

  // Calcular total_conversion automáticamente
  function calcularTotalConversion() {
    if (!checkboxDolares?.checked) return;

    const montoUSD = parseFloat(inputMontoUSD?.value.replace(/[^\d,-]/g, "").replace(",", ".")) || 0;
    const cotizacion = parseFloat(inputCotizacion?.value.replace(/[^\d,-]/g, "").replace(",", ".")) || 0;

    if (montoUSD > 0 && cotizacion > 0) {
      const total = montoUSD * cotizacion;
      if (inputTotalConversion) {
        inputTotalConversion.value = total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    } else {
      if (inputTotalConversion) inputTotalConversion.value = "";
    }
  }

  // Listeners para recalcular cuando cambian monto_usd o cotizacion
  inputMontoUSD?.addEventListener("input", calcularTotalConversion);
  inputCotizacion?.addEventListener("input", calcularTotalConversion);

  // Guardar remesa directamente en BD
  btnGuardar?.addEventListener("click", async () => {
    if (!canActUI()) { alert("No tenés permisos para guardar en esta caja."); return; }
    if (!fechaGlobal.value) {
      alert("⚠️ Debe seleccionar una fecha antes de guardar remesas.");
      return;
    }
    await refrescarEstadoCaja({ reRender: false });
    if (!canActUI()) { alert("No tenés permisos para guardar en esta caja."); return; }

    const { local, caja, fecha, turno } = getCtx();

    // Leer valores del formulario
    const nro_remesa = document.getElementById("nro_remesa").value.trim();
    const precinto = document.getElementById("precinto").value.trim();
    const monto = document.getElementById("monto").value.trim();
    const retirada = document.getElementById("retirada").value;
    const retirada_por = document.getElementById("retirada_por").value.trim();

    // ===== NUEVO: Leer valores USD =====
    const son_dolares = checkboxDolares?.checked || false;
    const monto_usd = son_dolares ? (inputMontoUSD?.value.trim() || "") : null;
    const cotizacion_divisa = son_dolares ? (inputCotizacion?.value.trim() || "") : null;

    // Validaciones
    if (!nro_remesa) {
      alert("⚠️ Número de remesa es obligatorio.");
      return;
    }

    if (son_dolares) {
      // Si es USD, validar que monto_usd y cotizacion estén presentes
      if (!monto_usd || !cotizacion_divisa) {
        alert("⚠️ Para remesas en USD, debe ingresar el monto en dólares y la cotización.");
        return;
      }
    } else {
      // Si es ARS, validar que monto esté presente
      if (!monto) {
        alert("⚠️ Monto es obligatorio.");
        return;
      }
    }

    // Crear array con una sola remesa
    const remesa = {
      fecha: fecha,
      nro_remesa: nro_remesa,
      precinto: precinto,
      monto: monto,
      retirada: retirada,
      retirada_por: retirada_por,
      // ===== NUEVO: Campos USD =====
      divisa: son_dolares ? "USD" : "ARS",
      monto_usd: son_dolares ? monto_usd : null,
      cotizacion_divisa: son_dolares ? cotizacion_divisa : null
    };

    fetch("/guardar_remesas_lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ local, caja, remesas: [remesa], fecha, turno })
    })
    .then(res => res.json())
    .then(async data => {
      if (data.success) {
        respuestaDiv.innerText = data.msg || "Remesa guardada correctamente.";
        // Limpiar formulario
        remesaForm.reset();
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
  // opts.datasets = { "/remesas_no_retiradas": [...], "/estado_caja": {...} }
  window.renderRemesas = function (_data, opts = {}) {
    const caja = cajaSelect.value;
    syncCajaHidden();

    const map = opts.datasets || {};
    const epNR  = Object.keys(map).find(k => k.includes('remesas_no_retiradas'));
    const epEC  = Object.keys(map).find(k => k.includes('estado_caja'));

    const arrTodas = epNR
      ? (Array.isArray(map[epNR]) ? map[epNR] : (map[epNR]?.items || []))
      : [];

    // Sincronizar estado de caja si vino en el payload del orquestador
    if (epEC && map[epEC] && typeof map[epEC] === 'object') {
      const d = map[epEC];
      window.cajaCerrada = ((d.estado ?? 1) === 0);
    }
    toggleAccionesVisibles(canActUI());

    // Actualizar estructuras locales y render
    todasLasRemesas[caja] = arrTodas || [];
    mostrarVistaPrevia(caja);
  };

  // ===================== Fallback sin orquestador =====================
  function legacyReload() {
    const { local, caja, fecha, turno } = getCtx();
    // UNIFICADO: Solo una query que trae todas las remesas de caja/fecha/turno
    const u1 = `/remesas_no_retiradas?caja=${encodeURIComponent(caja)}&local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`;
    Promise.all([
      fetch(u1).then(r => r.ok ? r.json() : []).catch(()=>[]),
      fetch(`/estado_caja?local=${encodeURIComponent(local)}&caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`)
        .then(r => r.ok ? r.json() : {estado:1}).catch(()=>({estado:1}))
    ]).then(([todas, est]) => {
      window.cajaCerrada = ((est.estado ?? 1) === 0);
      toggleAccionesVisibles(canActUI());
      todasLasRemesas[caja] = todas || [];
      mostrarVistaPrevia(caja);
    });
  }

  // ===================== Init mínimo =====================
  const cajaInicial = cajaSelect.value;
  syncCajaHidden();
  todasLasRemesas[cajaInicial] = todasLasRemesas[cajaInicial] || [];

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
