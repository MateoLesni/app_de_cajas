(function() {
  'use strict';

  const PAGE_SIZE = 100;
  let currentPage = 0;
  let lastCount = 0;

  // --- Helpers ---
  function esc(s) {
    if (s == null) return '';
    const d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function formatFecha(v) {
    if (!v) return '-';
    try {
      var d = new Date(String(v));
      if (isNaN(d.getTime())) return esc(v);
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' }) +
             ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' });
    } catch (e) { return esc(v); }
  }

  function formatFechaCorta(v) {
    if (!v) return '-';
    try {
      var s = String(v);
      // ISO: 2026-02-03
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        var parts = s.substring(0, 10).split('-');
        return parts[2] + '/' + parts[1] + '/' + parts[0];
      }
      // HTTP date: "Tue, 03 Feb 2026 00:00:00 GMT"
      var d = new Date(s);
      if (!isNaN(d.getTime())) {
        var dd = String(d.getUTCDate()).padStart(2, '0');
        var mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        var yy = d.getUTCFullYear();
        return dd + '/' + mm + '/' + yy;
      }
      return esc(v);
    } catch (e) { return esc(v); }
  }

  function formatJSON(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') {
      try { obj = JSON.parse(obj); } catch(e) { return esc(obj); }
    }
    return JSON.stringify(obj, null, 2);
  }

  // --- Buscar ---
  function buildParams() {
    const p = new URLSearchParams();
    const usuario = document.getElementById('filtroUsuario').value.trim();
    const accion = document.getElementById('filtroAccion').value;
    const local = document.getElementById('filtroLocal').value.trim();
    const tabla = document.getElementById('filtroTabla').value.trim();
    const fechaDesde = document.getElementById('filtroFechaDesde').value;
    const fechaHasta = document.getElementById('filtroFechaHasta').value;
    const fechaOp = document.getElementById('filtroFechaOp').value;
    const caja = document.getElementById('filtroCaja').value.trim();

    if (usuario) p.set('usuario', usuario);
    if (accion) p.set('accion', accion);
    if (local) p.set('local', local);
    if (tabla) p.set('tabla', tabla);
    if (fechaDesde) p.set('fecha_desde', fechaDesde + ' 00:00:00');
    if (fechaHasta) p.set('fecha_hasta', fechaHasta + ' 23:59:59');
    if (fechaOp) p.set('fecha_operacion', fechaOp);
    if (caja) p.set('caja', caja);

    p.set('limit', PAGE_SIZE);
    p.set('offset', currentPage * PAGE_SIZE);
    return p;
  }

  async function buscar() {
    const body = document.getElementById('auditBody');
    body.innerHTML = '<tr><td colspan="9" class="empty-msg">Cargando...</td></tr>';

    try {
      const params = buildParams();
      const resp = await fetch('/api/tabla_auditoria?' + params.toString());
      const data = await resp.json();

      if (!data.success) {
        body.innerHTML = '<tr><td colspan="9" class="empty-msg">Error: ' + esc(data.msg) + '</td></tr>';
        return;
      }

      lastCount = data.count || 0;
      document.getElementById('resultCount').textContent =
        lastCount > 0 ? lastCount + ' registro(s) encontrado(s)' + (lastCount >= PAGE_SIZE ? ' (puede haber mas)' : '') : '';

      if (!data.items || data.items.length === 0) {
        body.innerHTML = '<tr><td colspan="9" class="empty-msg">No se encontraron registros con esos filtros</td></tr>';
        updatePagination();
        return;
      }

      let html = '';
      data.items.forEach(function(it, idx) {
        const rowId = 'row_' + idx;
        html += '<tr style="cursor:pointer;" onclick="window._toggleDetail(\'' + rowId + '\')">';
        html += '<td style="font-size:11px;color:#9ca3af;">+</td>';
        html += '<td>' + formatFecha(it.fecha_hora) + '</td>';
        html += '<td>' + esc(it.usuario) + '</td>';
        html += '<td><span class="accion-badge accion-' + esc(it.accion) + '">' + esc(it.accion) + '</span></td>';
        html += '<td>' + esc(it.tabla || '-') + '</td>';
        html += '<td>' + esc(it.local || '-') + '</td>';
        html += '<td>' + esc(it.caja || '-') + '</td>';
        html += '<td>' + formatFechaCorta(it.fecha_operacion) + '</td>';
        html += '<td class="cell-desc" title="' + esc(it.descripcion) + '">' + esc(it.descripcion || '-') + '</td>';
        html += '</tr>';

        // Fila de detalle (oculta)
        html += '<tr class="detail-row" id="' + rowId + '" style="display:none;">';
        html += '<td colspan="9"><div class="detail-content">';
        if (it.datos_anteriores) {
          html += '<div class="detail-block"><h4>Datos Anteriores</h4><pre>' + esc(formatJSON(it.datos_anteriores)) + '</pre></div>';
        }
        if (it.datos_nuevos) {
          html += '<div class="detail-block"><h4>Datos Nuevos</h4><pre>' + esc(formatJSON(it.datos_nuevos)) + '</pre></div>';
        }
        if (it.datos_cambios) {
          html += '<div class="detail-block"><h4>Cambios</h4><pre>' + esc(formatJSON(it.datos_cambios)) + '</pre></div>';
        }
        // Info adicional
        html += '<div class="detail-block"><h4>Info Adicional</h4><pre>';
        html += 'Endpoint: ' + esc(it.endpoint || '-') + '\n';
        html += 'Metodo: ' + esc(it.metodo_http || '-') + '\n';
        html += 'IP: ' + esc(it.usuario_ip || '-') + '\n';
        html += 'Nivel: ' + esc(it.usuario_nivel) + '\n';
        html += 'Registro ID: ' + esc(it.registro_id || '-') + '\n';
        html += 'Turno: ' + esc(it.turno || '-') + '\n';
        html += 'Exito: ' + (it.exito ? 'Si' : 'No');
        if (it.error_mensaje) html += '\nError: ' + esc(it.error_mensaje);
        html += '</pre></div>';
        html += '</div></td></tr>';
      });

      body.innerHTML = html;
      updatePagination();
    } catch (err) {
      body.innerHTML = '<tr><td colspan="9" class="empty-msg">Error de conexion: ' + esc(err.message) + '</td></tr>';
    }
  }

  function updatePagination() {
    const pag = document.getElementById('pagination');
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    const info = document.getElementById('paginaInfo');

    if (lastCount === 0 && currentPage === 0) {
      pag.style.display = 'none';
      return;
    }
    pag.style.display = 'flex';
    btnPrev.disabled = currentPage === 0;
    btnNext.disabled = lastCount < PAGE_SIZE;
    info.textContent = 'Pagina ' + (currentPage + 1);
  }

  // --- Toggle detalle ---
  window._toggleDetail = function(id) {
    const row = document.getElementById(id);
    if (!row) return;
    row.style.display = row.style.display === 'none' ? '' : 'none';
  };

  // --- Limpiar ---
  function limpiar() {
    document.getElementById('filtroUsuario').value = '';
    document.getElementById('filtroAccion').value = '';
    document.getElementById('filtroLocal').value = '';
    document.getElementById('filtroTabla').value = '';
    document.getElementById('filtroFechaDesde').value = '';
    document.getElementById('filtroFechaHasta').value = '';
    document.getElementById('filtroFechaOp').value = '';
    document.getElementById('filtroCaja').value = '';
    currentPage = 0;
  }

  // --- Init ---
  document.getElementById('btnBuscar').addEventListener('click', function() {
    currentPage = 0;
    buscar();
  });

  document.getElementById('btnLimpiar').addEventListener('click', function() {
    limpiar();
    document.getElementById('auditBody').innerHTML =
      '<tr><td colspan="9" class="empty-msg">Usa los filtros para buscar registros de auditoria</td></tr>';
    document.getElementById('resultCount').textContent = '';
    document.getElementById('pagination').style.display = 'none';
  });

  document.getElementById('btnPrev').addEventListener('click', function() {
    if (currentPage > 0) { currentPage--; buscar(); }
  });

  document.getElementById('btnNext').addEventListener('click', function() {
    if (lastCount >= PAGE_SIZE) { currentPage++; buscar(); }
  });

  // Enter en inputs dispara busqueda
  document.querySelectorAll('.filters input').forEach(function(el) {
    el.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { currentPage = 0; buscar(); }
    });
  });

  // Cargar ultimas 100 al entrar
  buscar();

})();
