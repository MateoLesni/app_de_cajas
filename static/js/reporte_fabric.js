(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let agrupar = 'dia';

  function fmt(n) {
    if (n == null || isNaN(n)) return '-';
    const v = Number(n);
    return v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function daysAgoISO(n) {
    const d = new Date(); d.setDate(d.getDate() - n);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function toast(msg, kind) {
    const t = $('toast'); t.textContent = msg;
    t.className = 'toast show ' + (kind || '');
    setTimeout(() => t.classList.remove('show'), 3500);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  function fmtPeriodo(iso, g) {
    const p = iso.split('-');
    const dd = p[2], mm = MESES[parseInt(p[1],10)-1], yy = p[0];
    if (g === 'mes') return mm + ' ' + yy;
    if (g === 'semana') return 'Sem. del ' + dd + '-' + mm;
    return dd + '-' + mm + '-' + yy;
  }

  function buildParams() {
    const p = new URLSearchParams();
    p.set('fecha_desde', $('f-desde').value);
    p.set('fecha_hasta', $('f-hasta').value);
    p.set('agrupar', agrupar);
    return p;
  }

  async function ver() {
    if (!$('f-desde').value || !$('f-hasta').value) { toast('Elegí el rango de fechas', 'err'); return; }
    $('tabla-container').innerHTML = '<div class="loading">Cargando...</div>';
    try {
      const res = await fetch('/api/reporte-fabric/data?' + buildParams().toString());
      const j = await res.json();
      if (!j.success) { toast('Error: ' + (j.msg || 'desconocido'), 'err'); $('tabla-container').innerHTML = '<div class="empty">Error</div>'; return; }
      render(j);
    } catch (e) {
      console.error(e);
      toast('Error de red', 'err');
    }
  }

  function render(data) {
    const cont = $('tabla-container');
    if (!data.filas || data.filas.length === 0) {
      cont.innerHTML = '<div class="empty">No hay ventas en el rango elegido.</div>';
      $('kpi').style.display = 'none';
      return;
    }
    const g = data.agrupar;
    const colLabel = g === 'mes' ? 'Mes' : (g === 'semana' ? 'Semana' : 'Fecha');

    let html = '<div class="rf-tablewrap"><table class="rf"><thead><tr>';
    html += '<th class="l">' + colLabel + '</th><th>Venta Total</th><th>Cargas</th>';
    html += '</tr></thead><tbody>';
    data.filas.forEach(f => {
      html += '<tr>';
      html += '<td class="l">' + esc(fmtPeriodo(f.periodo, g)) + '</td>';
      html += '<td>$ ' + fmt(f.venta_total) + '</td>';
      html += '<td>' + f.cargas + '</td>';
      html += '</tr>';
    });
    html += '</tbody><tfoot><tr>';
    html += '<td class="l">TOTAL</td><td>$ ' + fmt(data.total) + '</td><td></td>';
    html += '</tr></tfoot></table></div>';
    cont.innerHTML = html;

    $('kpi').style.display = 'flex';
    $('kpi-total').textContent = '$ ' + fmt(data.total);
    $('kpi-per').textContent = data.filas.length;
    $('kpi-per-l').textContent = (g === 'mes' ? 'Meses' : (g === 'semana' ? 'Semanas' : 'Días'));
  }

  function descargarExcel() {
    if (!$('f-desde').value || !$('f-hasta').value) { toast('Elegí el rango de fechas', 'err'); return; }
    const p = new URLSearchParams();
    p.set('fecha_desde', $('f-desde').value);
    p.set('fecha_hasta', $('f-hasta').value);
    window.location = '/api/reporte-fabric/export?' + p.toString();
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('f-desde').value = daysAgoISO(29);
    $('f-hasta').value = todayISO();

    $('seg').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-g]');
      if (!b) return;
      agrupar = b.getAttribute('data-g');
      document.querySelectorAll('#seg button').forEach(x => x.classList.toggle('active', x === b));
      ver();
    });
    $('btn-ver').addEventListener('click', ver);
    $('btn-excel').addEventListener('click', descargarExcel);

    ver();
  });
})();
