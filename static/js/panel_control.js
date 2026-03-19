(function () {
  'use strict';

  // ── Elementos DOM ──
  var inputDesde = document.getElementById('inputDesde');
  var inputHasta = document.getElementById('inputHasta');
  var btnRefresh = document.getElementById('btnRefresh');
  var gridHead = document.getElementById('gridHead');
  var gridBody = document.getElementById('gridBody');
  var anomaliasBody = document.getElementById('anomaliasBody');
  var anomaliasCount = document.getElementById('anomaliasCount');

  var kpiAuditados = document.getElementById('kpiAuditados');
  var kpiAprobados = document.getElementById('kpiAprobados');
  var kpiSinAprobar = document.getElementById('kpiSinAprobar');

  // ── Labels ──
  var STATUS_LABELS = {
    auditado: 'Auditado',
    aprobado: 'Aprobado',
    sin_aprobar: 'Sin aprobar'
  };

  // ── Helpers ──
  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '-';
    return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function fmtDate(isoStr) {
    var parts = isoStr.split('-');
    return parts[2] + '/' + parts[1];
  }

  function fmtDateFull(isoStr) {
    var parts = isoStr.split('-');
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function daysAgoISO(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  var DIAS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
  function dayName(isoStr) {
    var parts = isoStr.split('-');
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return DIAS[d.getDay()];
  }

  // ── Init ──
  inputHasta.value = todayISO();
  inputDesde.value = daysAgoISO(6);
  btnRefresh.addEventListener('click', loadGrid);
  loadGrid();

  // ── Carga de datos ──
  function loadGrid() {
    btnRefresh.disabled = true;
    btnRefresh.textContent = 'Cargando...';

    var desde = inputDesde.value || daysAgoISO(6);
    var hasta = inputHasta.value || todayISO();

    fetch('/api/panel-control/grid?fecha_desde=' + desde + '&fecha_hasta=' + hasta)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) {
          gridBody.innerHTML = '<tr><td colspan="99" class="empty-msg">Error: ' + data.error + '</td></tr>';
          return;
        }
        renderKPIs(data.resumen);
        renderGrid(data.dates, data.grid);
        renderAnomalias(data.anomalias);
      })
      .catch(function (err) {
        gridBody.innerHTML = '<tr><td colspan="99" class="empty-msg">Error de conexion</td></tr>';
        console.error(err);
      })
      .finally(function () {
        btnRefresh.disabled = false;
        btnRefresh.textContent = 'Actualizar';
      });
  }

  // ── Render KPIs ──
  function renderKPIs(resumen) {
    if (!resumen) return;
    kpiAuditados.textContent = resumen.auditados || 0;
    kpiAprobados.textContent = resumen.aprobados || 0;
    kpiSinAprobar.textContent = resumen.sin_aprobar || 0;
  }

  // ── Render Grilla ──
  function renderGrid(dates, grid) {
    // Header
    var headHtml = '<tr><th class="col-local">Local</th>';
    for (var i = 0; i < dates.length; i++) {
      headHtml += '<th>' + dayName(dates[i]) + '<br>' + fmtDate(dates[i]) + '</th>';
    }
    headHtml += '</tr>';
    gridHead.innerHTML = headHtml;

    // Body
    if (!grid || grid.length === 0) {
      gridBody.innerHTML = '<tr><td colspan="' + (dates.length + 1) + '" class="empty-msg">Sin datos</td></tr>';
      return;
    }

    var bodyHtml = '';
    for (var g = 0; g < grid.length; g++) {
      var row = grid[g];
      bodyHtml += '<tr>';
      bodyHtml += '<td class="local-name">' + escHtml(row.local) + '</td>';

      for (var d = 0; d < dates.length; d++) {
        var fecha_s = dates[d];
        var celda = (row.celdas && row.celdas[fecha_s]) || { status: 'sin_aprobar', venta_total: 0, diferencia: 0 };
        var status = celda.status;
        var venta = celda.venta_total || 0;
        var dif = celda.diferencia || 0;

        var label = STATUS_LABELS[status] || status;
        var title = row.local + ' - ' + fmtDateFull(fecha_s) +
          '\nEstado: ' + label +
          '\nVenta: $' + fmtMoney(venta);
        if (dif !== 0) {
          title += '\nDiferencia: $' + fmtMoney(dif);
        }

        // Contenido de la celda
        var cellContent = '';
        if (venta > 0) {
          if (venta >= 1000000) {
            cellContent = (venta / 1000000).toFixed(1) + 'M';
          } else if (venta >= 1000) {
            cellContent = (venta / 1000).toFixed(0) + 'K';
          } else {
            cellContent = fmtMoney(venta);
          }
        } else {
          cellContent = '-';
        }

        bodyHtml += '<td class="cell cell-' + status + '"' +
          ' title="' + escAttr(title) + '"' +
          ' data-local="' + escAttr(row.local) + '"' +
          ' data-fecha="' + fecha_s + '"' +
          ' onclick="window.__pcNav(this)">' +
          cellContent + '</td>';
      }
      bodyHtml += '</tr>';
    }
    gridBody.innerHTML = bodyHtml;
  }

  // Navegacion al hacer click en celda
  window.__pcNav = function (el) {
    var local = el.getAttribute('data-local');
    var fecha = el.getAttribute('data-fecha');
    if (local && fecha) {
      window.open('/resumen-local?local=' + encodeURIComponent(local) + '&fecha=' + fecha, '_blank');
    }
  };

  // ── Render Anomalias ──
  function renderAnomalias(anomalias) {
    anomaliasCount.textContent = anomalias ? anomalias.length : 0;

    if (!anomalias || anomalias.length === 0) {
      anomaliasBody.innerHTML = '<tr><td colspan="7" class="empty-msg">No se detectaron anomalias</td></tr>';
      return;
    }

    var html = '';
    for (var i = 0; i < anomalias.length; i++) {
      var a = anomalias[i];
      var tipos = (a.tipos || []).join(', ');
      html += '<tr>';
      html += '<td><strong>' + escHtml(a.local) + '</strong></td>';
      html += '<td>' + fmtDateFull(a.fecha) + '</td>';
      html += '<td>' + escHtml(tipos) + '</td>';
      html += '<td>$' + fmtMoney(a.venta_total) + '</td>';
      html += '<td>$' + fmtMoney(a.promedio_30d) + '</td>';
      html += '<td>$' + fmtMoney(a.diferencia) + '</td>';
      html += '<td><button class="btn-ver" onclick="window.open(\'/resumen-local?local=' +
        encodeURIComponent(a.local) + '&fecha=' + a.fecha + '\',\'_blank\')">Ver</button></td>';
      html += '</tr>';
    }
    anomaliasBody.innerHTML = html;
  }

  // ── Escape helpers ──
  function escHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escAttr(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
  }

})();
