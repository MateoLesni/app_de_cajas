(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let chartInstance = null;

  // ── Helpers ──
  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '$ -';
    return '$ ' + Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function fmtFecha(iso) {
    if (!iso) return '-';
    const parts = iso.split('-');
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }
  function fmtFechaLarga(iso) {
    if (!iso) return '-';
    const parts = iso.split('-');
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function daysAgoISO(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function toast(msg, kind) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast show ' + (kind || '');
    setTimeout(() => el.classList.remove('show'), 3000);
  }

  // ── Presets ──
  function applyPreset(preset) {
    const hoy = new Date();
    const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);

    let desde, hasta;
    if (preset === 'ayer') {
      desde = daysAgoISO(1);
      hasta = daysAgoISO(1);
    } else if (preset === '7') {
      desde = daysAgoISO(6);
      hasta = todayISO();
    } else if (preset === '30') {
      desde = daysAgoISO(29);
      hasta = todayISO();
    } else if (preset === '90') {
      desde = daysAgoISO(89);
      hasta = todayISO();
    } else if (preset === 'mes_actual') {
      const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      desde = primero.toISOString().slice(0,10);
      hasta = todayISO();
    } else if (preset === 'mes_pasado') {
      const primeroMesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      const ultimoMesPasado = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
      desde = primeroMesPasado.toISOString().slice(0,10);
      hasta = ultimoMesPasado.toISOString().slice(0,10);
    } else if (preset === 'anual') {
      desde = hoy.getFullYear() + '-01-01';
      hasta = todayISO();
    }

    if (desde) $('f-desde').value = desde;
    if (hasta) $('f-hasta').value = hasta;
    cargarDatos();
  }

  // ── Cargar datos ──
  async function cargarDatos() {
    const desde = $('f-desde').value;
    const hasta = $('f-hasta').value;
    const agrupacion = $('f-agrupacion').value;

    if (!desde || !hasta) return;

    $('tabla-body').innerHTML = '<tr><td colspan="3" class="loading">Cargando...</td></tr>';

    try {
      const url = `/api/dashboard-ribs/data?fecha_desde=${desde}&fecha_hasta=${hasta}&agrupacion=${agrupacion}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.success) {
        toast('Error: ' + (data.msg || 'desconocido'), 'err');
        return;
      }

      renderHero(data);
      renderKPIs(data);
      renderChart(data.serie, data.rango.agrupacion);
      renderTabla(data.serie, data.rango.total);
    } catch (e) {
      console.error(e);
      toast('Error de red', 'err');
    }
  }

  // ── Render Hero ──
  function renderHero(data) {
    $('hero-fecha').textContent = fmtFechaLarga(data.ayer.fecha);
    $('hero-monto').textContent = fmtMoney(data.ayer.total);

    const comp = data.comparativos;
    const pct = comp.pct_vs_semana_pasada_dia;
    const delta = comp.delta_vs_semana_pasada_dia;

    let compHtml = '';
    if (pct !== null && pct !== undefined) {
      const isPos = pct >= 0;
      const cls = isPos ? 'delta-pos' : 'delta-neg';
      const signo = isPos ? '+' : '';
      compHtml = `vs mismo día semana pasada (${fmtMoney(comp.venta_semana_pasada_mismo_dia)}): ` +
        `<span class="${cls}">${signo}${pct.toFixed(1)}% (${signo}${fmtMoney(delta)})</span>`;
    } else {
      compHtml = 'Sin datos para comparativo semanal';
    }
    $('hero-comparativo').innerHTML = compHtml;
  }

  // ── Render KPIs ──
  function renderKPIs(data) {
    const comp = data.comparativos;
    const r = data.rango;

    $('kpi-ultimos7').textContent = fmtMoney(comp.venta_ultimos_7);
    if (comp.pct_vs_semana_anterior !== null && comp.pct_vs_semana_anterior !== undefined) {
      const isPos = comp.pct_vs_semana_anterior >= 0;
      const signo = isPos ? '+' : '';
      const cls = isPos ? 'delta-pos' : 'delta-neg';
      $('kpi-ultimos7-sub').innerHTML =
        `<span class="${cls}" style="color:${isPos?'#4ade80':'#f87171'}">${signo}${comp.pct_vs_semana_anterior.toFixed(1)}%</span> vs semana anterior`;
    } else {
      $('kpi-ultimos7-sub').textContent = '';
    }

    $('kpi-promedio').textContent = fmtMoney(r.promedio_dia);
    $('kpi-promedio-sub').textContent = `${r.dias_con_venta} días con venta de ${r.dias_totales}`;

    $('kpi-total').textContent = fmtMoney(r.total);
    $('kpi-total-sub').textContent = `Del ${fmtFecha(r.fecha_desde)} al ${fmtFecha(r.fecha_hasta)}`;

    if (r.dia_pico && r.dia_valle) {
      $('kpi-piquevalle').innerHTML =
        `<div style="color:#4ade80">↑ ${fmtFecha(r.dia_pico.fecha)}: ${fmtMoney(r.dia_pico.total)}</div>` +
        `<div style="color:#f87171">↓ ${fmtFecha(r.dia_valle.fecha)}: ${fmtMoney(r.dia_valle.total)}</div>`;
    } else {
      $('kpi-piquevalle').textContent = 'Sin datos';
    }
  }

  // ── Render Chart ──
  function renderChart(serie, agrupacion) {
    const ctx = $('ventasChart').getContext('2d');
    const labels = serie.map(x => {
      if (agrupacion === 'mes') {
        const parts = x.fecha.split('-');
        return `${parts[1]}/${parts[0]}`;
      } else if (agrupacion === 'semana') {
        return 'Sem ' + fmtFecha(x.fecha);
      } else {
        return fmtFecha(x.fecha);
      }
    });
    const valores = serie.map(x => x.total);

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
      type: (agrupacion === 'dia' && serie.length > 30) ? 'line' : 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Venta',
          data: valores,
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
          borderColor: '#3b82f6',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => fmtMoney(ctx.parsed.y)
            }
          }
        },
        scales: {
          x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
          y: {
            ticks: {
              color: '#94a3b8',
              callback: (v) => '$ ' + (v/1000000).toFixed(1) + 'M'
            },
            grid: { color: '#334155' }
          }
        }
      }
    });
  }

  // ── Render Tabla ──
  function renderTabla(serie, totalRango) {
    if (!serie.length) {
      $('tabla-body').innerHTML = '<tr><td colspan="3" class="loading">Sin datos</td></tr>';
      return;
    }
    // Ordenar descendente por fecha para ver los últimos primero
    const rows = serie.slice().reverse();
    let html = '';
    for (const r of rows) {
      const pct = totalRango > 0 ? (r.total / totalRango * 100) : 0;
      html += `<tr>`;
      html += `<td>${fmtFecha(r.fecha)}</td>`;
      html += `<td class="col-monto">${fmtMoney(r.total)}</td>`;
      html += `<td class="col-monto">${pct.toFixed(1)}%</td>`;
      html += `</tr>`;
    }
    $('tabla-body').innerHTML = html;
  }

  // ── Export ──
  function exportarCSV() {
    const desde = $('f-desde').value;
    const hasta = $('f-hasta').value;
    if (!desde || !hasta) return toast('Seleccioná el rango primero', 'err');
    window.location = `/api/dashboard-ribs/export?fecha_desde=${desde}&fecha_hasta=${hasta}`;
  }

  // ── Init ──
  document.addEventListener('DOMContentLoaded', function () {
    // Default: últimos 30 días
    $('f-desde').value = daysAgoISO(29);
    $('f-hasta').value = todayISO();
    $('f-agrupacion').value = 'dia';

    $('btn-actualizar').addEventListener('click', cargarDatos);
    $('btn-export').addEventListener('click', exportarCSV);
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
    });

    cargarDatos();
  });
})();
