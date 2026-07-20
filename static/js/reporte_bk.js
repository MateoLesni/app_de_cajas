(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function fmt(n) {
    if (n == null || isNaN(n)) return '-';
    const v = Number(n);
    if (v === 0) return '-';
    return v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function fmtFechaCorta(iso) {
    const p = iso.split('-');
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return p[2] + '-' + meses[parseInt(p[1], 10) - 1];
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

  // ── Locales ──
  async function cargarLocales() {
    try {
      const res = await fetch('/api/reporte-bk/locales');
      const j = await res.json();
      const grid = $('locales-grid');
      if (!j.success) { grid.innerHTML = '<div class="empty">Error cargando locales</div>'; return; }
      grid.innerHTML = (j.locales || []).map(l =>
        `<label><input type="checkbox" class="loc-cb" value="${esc(l)}" checked> ${esc(l)}</label>`
      ).join('');
    } catch (e) {
      $('locales-grid').innerHTML = '<div class="empty">Error de red</div>';
    }
  }

  function localesSeleccionados() {
    return Array.from(document.querySelectorAll('.loc-cb:checked')).map(cb => cb.value);
  }

  function buildParams() {
    const p = new URLSearchParams();
    p.set('fecha_desde', $('f-desde').value);
    p.set('fecha_hasta', $('f-hasta').value);
    const locs = localesSeleccionados();
    // Si están TODOS seleccionados, no mandamos filtro (= todos). Si es un subset, sí.
    const totalCb = document.querySelectorAll('.loc-cb').length;
    if (locs.length > 0 && locs.length < totalCb) {
      locs.forEach(l => p.append('local', l));
    }
    return { params: p, locs, totalCb };
  }

  // ── Generar reporte Qantara ──
  async function generar() {
    if (!$('f-desde').value || !$('f-hasta').value) { toast('Elegí el rango de fechas', 'err'); return; }
    const { params, locs } = buildParams();
    if (locs.length === 0) { toast('Seleccioná al menos un local', 'err'); return; }

    $('reporte-container').innerHTML = '<div class="rb-card"><div class="loading">Generando reporte...</div></div>';

    try {
      const res = await fetch('/api/reporte-bk/data?' + params.toString());
      const j = await res.json();
      if (!j.success) { toast('Error: ' + (j.msg || 'desconocido'), 'err'); $('reporte-container').innerHTML = '<div class="rb-card"><div class="empty">Error</div></div>'; return; }
      render(j);
    } catch (e) {
      console.error(e);
      toast('Error de red', 'err');
    }
  }

  function render(data) {
    const cont = $('reporte-container');
    if (!data.reporte || data.reporte.length === 0) {
      cont.innerHTML = '<div class="rb-card"><div class="empty">No hay movimiento en terminales BK para los filtros elegidos.</div></div>';
      return;
    }

    const dates = data.dates;
    let html = '';

    data.reporte.forEach(bloque => {
      html += '<div class="qantara-block">';
      html += `<div class="qantara-title">Estimación de acreditación Qantara — ${esc(bloque.local)} (${fmtFechaCorta(data.fecha_desde)} al ${fmtFechaCorta(data.fecha_hasta)})</div>`;
      html += '<table class="qt"><thead><tr>';
      html += '<th class="concepto">Concepto</th>';
      dates.forEach(d => { html += '<th>' + fmtFechaCorta(d) + '</th>'; });
      html += '<th class="col-bruto">Bruto</th><th class="col-comision">Comisión</th><th class="col-neto">Neto Estimado</th>';
      html += '</tr></thead><tbody>';

      bloque.filas.forEach(fila => {
        const clase = fila.concepto === 'QR' ? 'row-qr' : '';
        html += `<tr class="${clase}">`;
        html += '<td class="concepto">' + esc(fila.concepto) + '</td>';
        dates.forEach(d => { html += '<td>' + fmt(fila.por_fecha[d]) + '</td>'; });
        html += '<td class="col-bruto">' + fmt(fila.bruto) + '</td>';
        html += '<td class="col-comision">' + fmt(fila.comision) + '</td>';
        html += '<td class="col-neto neto-final">' + fmt(fila.neto) + '</td>';
        html += '</tr>';
      });

      html += '</tbody><tfoot><tr>';
      html += '<td class="concepto">TOTAL</td>';
      dates.forEach(d => { html += '<td>' + fmt(bloque.total.por_fecha[d]) + '</td>'; });
      html += '<td class="col-bruto">' + fmt(bloque.total.bruto) + '</td>';
      html += '<td class="col-comision">' + fmt(bloque.total.comision) + '</td>';
      html += '<td class="col-neto neto-final">' + fmt(bloque.total.neto) + '</td>';
      html += '</tr></tfoot></table>';
      html += '</div>';
    });

    cont.innerHTML = html;
  }

  // ── Excel crudo ──
  function descargarExcel() {
    if (!$('f-desde').value || !$('f-hasta').value) { toast('Elegí el rango de fechas', 'err'); return; }
    const { params, locs } = buildParams();
    if (locs.length === 0) { toast('Seleccioná al menos un local', 'err'); return; }
    window.location = '/api/reporte-bk/export?' + params.toString();
  }

  // ── Init ──
  document.addEventListener('DOMContentLoaded', function () {
    $('f-desde').value = daysAgoISO(6);
    $('f-hasta').value = todayISO();

    $('btn-generar').addEventListener('click', generar);
    $('btn-excel').addEventListener('click', descargarExcel);
    $('btn-all').addEventListener('click', () => { document.querySelectorAll('.loc-cb').forEach(cb => cb.checked = true); });
    $('btn-none').addEventListener('click', () => { document.querySelectorAll('.loc-cb').forEach(cb => cb.checked = false); });

    cargarLocales();
  });
})();
