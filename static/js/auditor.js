(async function () {
  // Los valores de local y fecha vienen del template (son read-only)
  const displayLocal = document.getElementById("display-local");
  const displayFecha = document.getElementById("display-fecha");
  const btnRecargar = document.getElementById("btn-recargar");

  // Referencias a las 3 tablas
  const tbodyFacturas = document.querySelector("#tabla-facturas tbody");
  const tbodyFormas = document.querySelector("#tabla-formas tbody");
  const tbodyPropinas = document.querySelector("#tabla-propinas tbody");

  // Botones de copiar
  const btnCopiarFacturas = document.getElementById("btn-copiar-facturas");
  const btnCopiarFormas = document.getElementById("btn-copiar-formas");
  const btnCopiarPropinas = document.getElementById("btn-copiar-propinas");

  const statusEl = document.getElementById("status");

  // Obtener valores desde el HTML renderizado
  function getLocal() {
    const value = (displayLocal?.textContent || "").trim();
    console.log('🔍 getLocal() retorna:', value);
    return value;
  }

  function getFecha() {
    const value = (displayFecha?.textContent || "").trim();
    console.log('🔍 getFecha() retorna:', value);
    return value;
  }

  // Debug inicial
  console.log('🔍 auditor.js cargado');
  console.log('🔍 displayLocal element:', displayLocal);
  console.log('🔍 displayFecha element:', displayFecha);
  console.log('🔍 displayLocal.textContent:', displayLocal?.textContent);
  console.log('🔍 displayFecha.textContent:', displayFecha?.textContent);

  // Sin separadores de miles
  function toPlainNumber(n) {
    if (n === null || n === undefined) return "";
    const x = Number(n);
    if (Number.isFinite(x)) {
      return String(Math.round(x));
    }
    const s = String(n).replace(/\./g, "").replace(/,/g, ".");
    const y = Number(s);
    return Number.isFinite(y) ? String(Math.round(y)) : "";
  }

  // ========== TABLA 1: FACTURAS (4 columnas) ==========
  function fillFacturas(rows) {
    tbodyFacturas.innerHTML = "";
    for (const r of rows) {
      const tr = document.createElement("tr");
      const cols = [
        r.tipo || "",
        r.id_comentario || "",
        toPlainNumber(r.importe),
        r.comentario || "",
      ];
      cols.forEach((val, idx) => {
        const td = document.createElement("td");
        td.textContent = val;
        if (idx === 2) td.classList.add("right"); // importe alineado a derecha
        tr.appendChild(td);
      });
      tbodyFacturas.appendChild(tr);
    }
  }

  function buildTSVFacturas(rows) {
    let out = "";
    for (const r of rows) {
      const cols = [
        r.tipo || "",
        r.id_comentario || "",
        toPlainNumber(r.importe),
        r.comentario || "",
      ];
      out += cols.join("\t") + "\r\n";
    }
    return out;
  }

  async function copiarFacturas() {
    const rows = [];
    for (const tr of tbodyFacturas.querySelectorAll("tr")) {
      const tds = tr.querySelectorAll("td");
      rows.push({
        tipo: tds[0]?.textContent || "",
        id_comentario: tds[1]?.textContent || "",
        importe: tds[2]?.textContent || "",
        comentario: tds[3]?.textContent || "",
      });
    }
    const tsv = buildTSVFacturas(rows);
    try {
      await navigator.clipboard.writeText(tsv);
      statusEl.textContent = "Facturas copiadas al portapapeles (TSV 4 columnas).";
    } catch {
      const ta = document.createElement("textarea");
      ta.value = tsv;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      statusEl.textContent = "Facturas copiadas (fallback).";
    }
  }

  // ========== TABLA 2: FORMAS DE PAGO (8 columnas) ==========
  function fillFormas(rows) {
    tbodyFormas.innerHTML = "";
    for (const r of rows) {
      const tr = document.createElement("tr");
      const cols = [
        r.forma_pago || "",
        r.descripcion || "",
        r.tarjeta_credito || "",
        r.plan || "",
        r.cuotas || "",
        r.nro_lote || "",
        r.cheque_cupon || "",
        toPlainNumber(r.pagado),
      ];
      cols.forEach((val, idx) => {
        const td = document.createElement("td");
        td.textContent = val;
        if (idx === 7) td.classList.add("right");
        tr.appendChild(td);
      });
      tbodyFormas.appendChild(tr);
    }
  }

  function buildTSVFormas(rows) {
    let out = "";
    for (const r of rows) {
      const cols = [
        r.forma_pago || "",
        r.descripcion || "",
        r.tarjeta_credito || "",
        r.plan || "",
        r.cuotas || "",
        r.nro_lote || "",
        r.cheque_cupon || "",
        toPlainNumber(r.pagado),
      ];
      out += cols.join("\t") + "\r\n";
    }
    return out;
  }

  async function copiarFormas() {
    const rows = [];
    for (const tr of tbodyFormas.querySelectorAll("tr")) {
      const tds = tr.querySelectorAll("td");
      rows.push({
        forma_pago: tds[0]?.textContent || "",
        descripcion: tds[1]?.textContent || "",
        tarjeta_credito: tds[2]?.textContent || "",
        plan: tds[3]?.textContent || "",
        cuotas: tds[4]?.textContent || "",
        nro_lote: tds[5]?.textContent || "",
        cheque_cupon: tds[6]?.textContent || "",
        pagado: tds[7]?.textContent || "",
      });
    }
    const tsv = buildTSVFormas(rows);
    try {
      await navigator.clipboard.writeText(tsv);
      statusEl.textContent = "Creación de Recibo copiada al portapapeles (TSV 8 columnas).";
    } catch {
      const ta = document.createElement("textarea");
      ta.value = tsv;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      statusEl.textContent = "Creación de Recibo copiada (fallback).";
    }
  }

  // ========== TABLA 3: PROPINAS (3 columnas) - ahora puede tener múltiples filas ==========
  function fillPropinas(rows) {
    tbodyPropinas.innerHTML = "";
    if (!rows || rows.length === 0) return;

    for (const row of rows) {
      const tr = document.createElement("tr");
      const cols = [
        row.cuenta || "",
        row.descripcion || "",
        toPlainNumber(row.monto),
      ];
      cols.forEach((val, idx) => {
        const td = document.createElement("td");
        td.textContent = val;
        if (idx === 2) td.classList.add("right");
        tr.appendChild(td);
      });
      tbodyPropinas.appendChild(tr);
    }
  }

  function buildTSVPropinas(rows) {
    if (!rows || rows.length === 0) return "";
    let out = "";
    for (const row of rows) {
      const cols = [
        row.cuenta || "",
        row.descripcion || "",
        toPlainNumber(row.monto),
      ];
      out += cols.join("\t") + "\r\n";
    }
    return out;
  }

  async function copiarPropinas() {
    const trs = tbodyPropinas.querySelectorAll("tr");
    if (trs.length === 0) {
      statusEl.textContent = "No hay datos de propinas para copiar.";
      return;
    }
    const rows = [];
    for (const tr of trs) {
      const tds = tr.querySelectorAll("td");
      rows.push({
        cuenta: tds[0]?.textContent || "",
        descripcion: tds[1]?.textContent || "",
        monto: tds[2]?.textContent || "",
      });
    }
    const tsv = buildTSVPropinas(rows);
    try {
      await navigator.clipboard.writeText(tsv);
      statusEl.textContent = "Propinas copiadas al portapapeles (TSV 3 columnas).";
    } catch {
      const ta = document.createElement("textarea");
      ta.value = tsv;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      statusEl.textContent = "Propinas copiadas (fallback).";
    }
  }

  // ========== RECARGAR TODO ==========
  async function recargar() {
    const local = getLocal();
    const fecha = getFecha();
    if (!local || !fecha) {
      statusEl.textContent = "Faltan parámetros de local o fecha en la URL.";
      return;
    }
    statusEl.textContent = "Cargando...";

    try {
      // Fetch en paralelo de las 3 tablas
      const [resFacturas, resFormas, resPropinas] = await Promise.all([
        fetch(`/api/auditoria/facturas?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}`),
        fetch(`/api/auditoria/resumen?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}`),
        fetch(`/api/auditoria/propinas?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}`),
      ]);

      const dataFacturas = await resFacturas.json();
      const dataFormas = await resFormas.json();
      const dataPropinas = await resPropinas.json();

      if (!resFacturas.ok) throw new Error(dataFacturas?.msg || "Error al cargar facturas");
      if (!resFormas.ok) throw new Error(dataFormas?.msg || "Error al cargar creación de recibo");
      if (!resPropinas.ok) throw new Error(dataPropinas?.msg || "Error al cargar propinas");

      fillFacturas(dataFacturas.rows || []);
      fillFormas(dataFormas.rows || []);
      fillPropinas(dataPropinas.rows || []);

      const totalFilas = (dataFacturas.rows || []).length + (dataFormas.rows || []).length + (dataPropinas.rows || []).length;
      statusEl.textContent = `Filtrado: ${local} – ${fecha} (${totalFilas} filas en total)`;
    } catch (err) {
      console.error(err);
      statusEl.textContent = "Error al cargar datos.";
      tbodyFacturas.innerHTML = "";
      tbodyFormas.innerHTML = "";
      tbodyPropinas.innerHTML = "";
    }
  }

  // ---- init ----
  btnRecargar.addEventListener("click", recargar);
  btnCopiarFacturas.addEventListener("click", copiarFacturas);
  btnCopiarFormas.addEventListener("click", copiarFormas);
  btnCopiarPropinas.addEventListener("click", copiarPropinas);

  // recarga inicial automática con los valores de la URL
  recargar();
})();
