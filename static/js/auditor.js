(async function () {
  // Los valores de local y fecha vienen del template (son read-only)
  const displayLocal = document.getElementById("display-local");
  const displayFecha = document.getElementById("display-fecha");
  const btnRecargar = document.getElementById("btn-recargar");
  const btnCopiar = document.getElementById("btn-copiar");
  const tbody = document.querySelector("#tabla tbody");
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

  // Sin separadores de miles en "Pagado"
  function toPlainNumber(n) {
    if (n === null || n === undefined) return "";
    const x = Number(n);
    if (Number.isFinite(x)) {
      // Si querés decimales, cambia a toFixed(2); por ahora entero como venías pegando.
      return String(Math.round(x));
    }
    const s = String(n).replace(/\./g, "").replace(/,/g, ".");
    const y = Number(s);
    return Number.isFinite(y) ? String(Math.round(y)) : "";
  }

  function fillTable(rows) {
    tbody.innerHTML = "";
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
      tbody.appendChild(tr);
    }
  }

  function buildTSV(rows) {
    // 8 columnas exactas: tabs entre columnas, CRLF al final de cada fila
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

  async function recargar() {
    const local = getLocal();
    const fecha = getFecha();
    if (!local || !fecha) {
      statusEl.textContent = "Faltan parámetros de local o fecha en la URL.";
      return;
    }
    statusEl.textContent = "Cargando...";
    try {
      const url = `/api/auditoria/resumen?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al cargar datos");
      fillTable(data.rows || []);
      statusEl.textContent = `Filtrado: ${local} – ${fecha} (${(data.rows||[]).length} filas)`;
    } catch (err) {
      console.error(err);
      statusEl.textContent = "Error al cargar datos.";
      tbody.innerHTML = "";
    }
  }

  async function copiar() {
    // Lee las filas visibles de la tabla para copiar EXACTO lo mostrado
    const rows = [];
    for (const tr of tbody.querySelectorAll("tr")) {
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
    const tsv = buildTSV(rows);
    try {
      await navigator.clipboard.writeText(tsv);
      statusEl.textContent = "Copiado al portapapeles (TSV 8 columnas). Pegalo en el software.";
    } catch {
      // Fallback para navegadores que bloquean clipboard
      const ta = document.createElement("textarea");
      ta.value = tsv;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      statusEl.textContent = "Copiado (fallback).";
    }
  }

  // ---- init ----
  // eventos
  btnRecargar.addEventListener("click", recargar);
  btnCopiar.addEventListener("click", copiar);

  // recarga inicial automática con los valores de la URL
  recargar();
})();
