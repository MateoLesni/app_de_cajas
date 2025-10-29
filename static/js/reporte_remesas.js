// Reportería: Remesas
(function(){
  const $ = s => document.querySelector(s);

  const fmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const money = v => fmt.format(Math.round(Number(v||0)));

  // --- FECHAS: parseo "YYYY-MM-DD" como fecha LOCAL (evita salto de día por UTC) ---
  function parseISODateAsLocal(iso) {
    if (!iso) return null;
    // Si viene "YYYY-MM-DD"
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [y, m, d] = iso.split('-').map(n => parseInt(n, 10));
      return new Date(y, m - 1, d); // fecha local sin zona
    }
    // Fallback si viene con hora: anclo a fecha local (ignoro hora)
    const dt = new Date(iso);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }
  function formatLocalYMDToEsAR(iso) {
    const d = parseISODateAsLocal(iso);
    return d ? d.toLocaleDateString('es-AR') : (iso || '');
  }

  function setToday(input){
    if(!input || input.value) return;
    const d = new Date();
    const p = n => String(n).padStart(2,'0');
    input.value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }

  async function fetchData(fecha){
    const r = await fetch(`/api/reportes/remesas?fecha=${encodeURIComponent(fecha)}`, {cache:'no-store'});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }

  function buildHeader(isLunes, diaLabel){
    if(isLunes){
      return `
        <tr>
          <th>Fecha Sello</th>
          <th>Locales</th>
          <th>Saldo Anterior</th>
          <th>Viernes</th>
          <th>Sábado</th>
          <th>Domingo</th>
          <th class="ap-col">Total FDS</th>
          <th class="ap-col">Ap Proyectada</th>
          <th>Saldo a retirar</th>
        </tr>`;
    }
    return `
      <tr>
        <th>Fecha Sello</th>
        <th>Locales</th>
        <th>Saldo Anterior</th>
        <th>${diaLabel}</th>
        <th class="ap-col">Ap Proyectada</th>
        <th>Saldo a retirar</th>
      </tr>`;
  }

  function renderTable(data){
    const thead = $("#rep-thead");
    const tbody = $("#rep-tbody");
    const tfoot = $("#rep-tfoot");
    thead.innerHTML = buildHeader(data.is_lunes, data.dia_label);
    tbody.innerHTML = '';
    tfoot.innerHTML = '';

    // Usamos SIEMPRE la fecha seleccionada (o data.fecha si faltara) y la parseamos como LOCAL
    const picked = $("#rep-fecha")?.value || data.fecha;
    const fechaText = formatLocalYMDToEsAR(picked);

    // Badge correcto sin desfase
    $("#rep-badge").textContent = data.is_lunes ? `Lunes (${fechaText})` : `${data.dia_label} (${fechaText})`;

    if(data.is_lunes){
      data.rows.forEach(r=>{
        tbody.insertAdjacentHTML('beforeend', `
          <tr>
            <td>${fechaText}</td>
            <td>${r.local}</td>
            <td class="td-right">${money(r.saldo_anterior)}</td>
            <td class="td-right">${money(r.viernes)}</td>
            <td class="td-right">${money(r.sabado)}</td>
            <td class="td-right">${money(r.domingo)}</td>
            <td class="td-right ap-col">${money(r.total_fds)}</td>
            <td class="td-right ap-col">${money(r.ap_proyectada)}</td>
            <td class="td-right">0</td>
          </tr>
        `);
      });

      const t = data.totals || {};
      tfoot.innerHTML = `
        <tr class="tot-row">
          <td><strong>Total</strong></td>
          <td></td>
          <td class="td-right"><strong>${money(t.saldo_anterior)}</strong></td>
          <td class="td-right"><strong>${money(t.viernes)}</strong></td>
          <td class="td-right"><strong>${money(t.sabado)}</strong></td>
          <td class="td-right"><strong>${money(t.domingo)}</strong></td>
          <td class="td-right ap-col"><strong>${money(t.total_fds)}</strong></td>
          <td class="td-right ap-col"><strong>${money(t.ap_proyectada)}</strong></td>
          <td class="td-right"><strong>0</strong></td>
        </tr>`;
    }else{
      data.rows.forEach(r=>{
        tbody.insertAdjacentHTML('beforeend', `
          <tr>
            <td>${fechaText}</td>
            <td>${r.local}</td>
            <td class="td-right">${money(r.saldo_anterior)}</td>
            <td class="td-right">${money(r.dia)}</td>
            <td class="td-right ap-col">${money(r.ap_proyectada)}</td>
            <td class="td-right">0</td>
          </tr>
        `);
      });

      const t = data.totals || {};
      tfoot.innerHTML = `
        <tr class="tot-row">
          <td><strong>Total</strong></td>
          <td></td>
          <td class="td-right"><strong>${money(t.saldo_anterior)}</strong></td>
          <td class="td-right"><strong>${money(t.dia)}</strong></td>
          <td class="td-right ap-col"><strong>${money(t.ap_proyectada)}</strong></td>
          <td class="td-right"><strong>0</strong></td>
        </tr>`;
    }
  }

  async function actualizar(){
    const fecha = $("#rep-fecha").value;
    if(!fecha) return;
    const data = await fetchData(fecha);
    renderTable(data);
  }

  // Exportar a Excel
  async function exportar(){
    const fecha = $("#rep-fecha").value;
    const url = `/api/reportes/remesas.xlsx?fecha=${encodeURIComponent(fecha)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = ''; // dejar que el server nombre el archivo
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    setToday($("#rep-fecha"));
    actualizar().catch(console.error);

    $("#rep-buscar")?.addEventListener('click', ()=> actualizar().catch(console.error));
    $("#rep-fecha")?.addEventListener('change', ()=> actualizar().catch(console.error));
    $("#rep-excel")?.addEventListener('click', exportar);
  });
})();
