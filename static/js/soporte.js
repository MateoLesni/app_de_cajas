/**
 * soporte.js – Panel de Soporte (nivel 10+)
 * Permite: consultar estado, reabrir cajas, reabrir locales, des-auditar locales.
 * Todas las acciones quedan registradas en auditoría.
 */
(function () {
  'use strict';

  // ── DOM refs ───────────────────────────────────────────────────────────
  const selLocal       = document.getElementById('selLocal');
  const inputFecha     = document.getElementById('inputFecha');
  const btnConsultar   = document.getElementById('btnConsultar');
  const panelEstado    = document.getElementById('panelEstado');
  const estadoContenido= document.getElementById('estadoContenido');
  const panelAcciones  = document.getElementById('panelAcciones');
  const botonesAccion  = document.getElementById('botonesAccion');
  const txtMotivo      = document.getElementById('txtMotivo');
  const tablaLogBody   = document.getElementById('tablaLogBody');

  // Estado actual cargado
  let estadoActual = null;

  // ── Init ───────────────────────────────────────────────────────────────
  loadLocales();
  loadRecentLog();

  // Default fecha = hoy
  const hoy = new Date();
  inputFecha.value = hoy.toISOString().slice(0, 10);

  btnConsultar.addEventListener('click', consultarEstado);

  // ── Locales dropdown ───────────────────────────────────────────────────
  async function loadLocales() {
    try {
      const resp = await fetch('/api/locales');
      const data = await resp.json();
      if (data.locales && data.locales.length) {
        data.locales.forEach(function (l) {
          const opt = document.createElement('option');
          opt.value = l;
          opt.textContent = l;
          selLocal.appendChild(opt);
        });
      }
    } catch (err) {
      console.error('Error cargando locales:', err);
    }
  }

  // ── Consultar estado ───────────────────────────────────────────────────
  async function consultarEstado() {
    const local = selLocal.value;
    const fecha = inputFecha.value;
    if (!local || !fecha) {
      alert('Seleccioná un local y una fecha.');
      return;
    }

    btnConsultar.disabled = true;
    btnConsultar.textContent = 'Consultando...';

    try {
      const resp = await fetch('/api/soporte/estado?local=' + encodeURIComponent(local) + '&fecha=' + encodeURIComponent(fecha));
      const data = await resp.json();

      if (!data.success) {
        alert('Error: ' + (data.msg || 'Respuesta inválida'));
        panelEstado.style.display = 'none';
        panelAcciones.style.display = 'none';
        return;
      }

      estadoActual = data;
      estadoActual._local = local;
      estadoActual._fecha = fecha;

      renderEstado(data);
      renderAcciones(data);

      panelEstado.style.display = '';
      panelAcciones.style.display = '';
    } catch (err) {
      console.error('Error consultando estado:', err);
      alert('Error de conexión al consultar estado.');
    } finally {
      btnConsultar.disabled = false;
      btnConsultar.textContent = 'Consultar Estado';
    }
  }

  // ── Render estado ──────────────────────────────────────────────────────
  function renderEstado(data) {
    let html = '';

    // Auditoría
    html += '<h4>Auditoría</h4>';
    if (data.auditado) {
      const ai = data.auditoria_info || {};
      html += '<span class="estado-badge estado-auditado">AUDITADO</span>';
      if (ai.auditado_por) html += '<p class="estado-info">Auditado por: <strong>' + esc(ai.auditado_por) + '</strong></p>';
      if (ai.fecha_auditoria) html += '<p class="estado-info">Fecha: ' + esc(ai.fecha_auditoria) + '</p>';
      if (ai.observaciones) html += '<p class="estado-info">Observaciones: ' + esc(ai.observaciones) + '</p>';
    } else {
      html += '<span class="estado-badge estado-no-auditado">NO AUDITADO</span>';
    }

    // Cierre local
    html += '<h4>Cierre de Local</h4>';
    if (data.local_cerrado) {
      const ci = data.cierre_local || {};
      html += '<span class="estado-badge estado-cerrada">LOCAL CERRADO</span>';
      if (ci.closed_by) html += '<p class="estado-info">Cerrado por: <strong>' + esc(ci.closed_by) + '</strong></p>';
      if (ci.closed_at) html += '<p class="estado-info">Fecha cierre: ' + esc(ci.closed_at) + '</p>';
    } else {
      html += '<span class="estado-badge estado-abierta">LOCAL ABIERTO</span>';
    }

    // Cajas
    html += '<h4>Cajas</h4>';
    if (data.cajas && data.cajas.length) {
      html += '<table class="cajas-table"><thead><tr>' +
              '<th>Caja</th><th>Turno</th><th>Estado</th><th>Cerrada por</th><th>Cerrada en</th><th>Observación</th>' +
              '</tr></thead><tbody>';
      data.cajas.forEach(function (c) {
        var abierta = c.estado === 1;
        html += '<tr>' +
                '<td>' + esc(c.caja) + '</td>' +
                '<td>' + esc(c.turno) + '</td>' +
                '<td><span class="estado-badge ' + (abierta ? 'estado-abierta' : 'estado-cerrada') + '">' +
                  (abierta ? 'ABIERTA' : 'CERRADA') + '</span></td>' +
                '<td>' + esc(c.cerrada_por || '-') + '</td>' +
                '<td>' + esc(c.cerrada_en || '-') + '</td>' +
                '<td>' + esc(c.observacion || '-') + '</td>' +
                '</tr>';
      });
      html += '</tbody></table>';
    } else {
      html += '<p class="empty-msg">No hay cajas registradas para esta fecha.</p>';
    }

    estadoContenido.innerHTML = html;
  }

  // ── Render acciones ────────────────────────────────────────────────────
  function renderAcciones(data) {
    let html = '';

    // Orden de reversión: 1) des-auditar, 2) reabrir local, 3) reabrir cajas
    if (data.auditado) {
      html += '<div class="acciones-group">';
      html += '<h4>Paso 1: Des-auditar local</h4>';
      html += '<button class="btn-danger" onclick="window._soporteDesauditar()">Des-auditar Local</button>';
      html += '<p class="estado-info">Se debe des-auditar primero antes de poder reabrir el local o cajas.</p>';
      html += '</div>';
    } else {
      // Si no auditado, mostrar acciones de local y cajas
      if (data.local_cerrado) {
        html += '<div class="acciones-group">';
        html += '<h4>Reabrir Local</h4>';
        html += '<button class="btn-warning" onclick="window._soporteReabrirLocal()">Reabrir Local</button>';
        html += '<p class="estado-info">Reabre el local para permitir modificaciones.</p>';
        html += '</div>';
      }

      // Cajas cerradas
      var cajasCerradas = (data.cajas || []).filter(function (c) { return c.estado === 0; });
      if (cajasCerradas.length) {
        html += '<div class="acciones-group">';
        html += '<h4>Reabrir Cajas</h4>';
        cajasCerradas.forEach(function (c) {
          html += '<button class="btn-warning" onclick="window._soporteReabrirCaja(\'' +
                  esc(c.caja) + '\',\'' + esc(c.turno) + '\')">' +
                  'Reabrir Caja ' + esc(c.caja) + ' / Turno ' + esc(c.turno) +
                  '</button>';
        });
        html += '</div>';
      }
    }

    if (!html) {
      html = '<p class="empty-msg">No hay acciones disponibles. Todo está abierto y sin auditar.</p>';
    }

    botonesAccion.innerHTML = html;
  }

  // ── Acciones ───────────────────────────────────────────────────────────

  window._soporteDesauditar = async function () {
    if (!estadoActual) return;
    var motivo = txtMotivo.value.trim();
    if (!motivo) { alert('Ingresá un motivo antes de ejecutar la acción.'); txtMotivo.focus(); return; }
    if (!confirm('¿Des-auditar el local ' + estadoActual._local + ' para ' + estadoActual._fecha + '?\n\nNOTA: La sincronización con Oppen NO será revertida.\n\nMotivo: ' + motivo)) return;

    try {
      var resp = await fetch('/api/soporte/desauditar_local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ local: estadoActual._local, fecha: estadoActual._fecha, motivo: motivo })
      });
      var data = await resp.json();
      alert(data.msg || (data.success ? 'OK' : 'Error'));
      if (data.success) {
        txtMotivo.value = '';
        consultarEstado();
        loadRecentLog();
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión.');
    }
  };

  window._soporteReabrirLocal = async function () {
    if (!estadoActual) return;
    var motivo = txtMotivo.value.trim();
    if (!motivo) { alert('Ingresá un motivo antes de ejecutar la acción.'); txtMotivo.focus(); return; }
    if (!confirm('¿Reabrir el local ' + estadoActual._local + ' para ' + estadoActual._fecha + '?\n\nMotivo: ' + motivo)) return;

    try {
      var resp = await fetch('/api/soporte/reabrir_local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ local: estadoActual._local, fecha: estadoActual._fecha, motivo: motivo })
      });
      var data = await resp.json();
      alert(data.msg || (data.success ? 'OK' : 'Error'));
      if (data.success) {
        txtMotivo.value = '';
        consultarEstado();
        loadRecentLog();
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión.');
    }
  };

  window._soporteReabrirCaja = async function (caja, turno) {
    if (!estadoActual) return;
    var motivo = txtMotivo.value.trim();
    if (!motivo) { alert('Ingresá un motivo antes de ejecutar la acción.'); txtMotivo.focus(); return; }
    if (!confirm('¿Reabrir la caja ' + caja + ' / turno ' + turno + ' de ' + estadoActual._local + ' para ' + estadoActual._fecha + '?\n\nMotivo: ' + motivo)) return;

    try {
      var resp = await fetch('/api/soporte/reabrir_caja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ local: estadoActual._local, caja: caja, fecha: estadoActual._fecha, turno: turno, motivo: motivo })
      });
      var data = await resp.json();
      alert(data.msg || (data.success ? 'OK' : 'Error'));
      if (data.success) {
        txtMotivo.value = '';
        consultarEstado();
        loadRecentLog();
      }
    } catch (err) {
      console.error(err);
      alert('Error de conexión.');
    }
  };

  // ── Log reciente ───────────────────────────────────────────────────────
  async function loadRecentLog() {
    try {
      var resp = await fetch('/api/tabla_auditoria?accion=REOPEN_BOX&limit=50');
      var d1 = await resp.json();

      var resp2 = await fetch('/api/tabla_auditoria?accion=REOPEN_LOCAL&limit=50');
      var d2 = await resp2.json();

      var resp3 = await fetch('/api/tabla_auditoria?accion=UNAUDIT_LOCAL&limit=50');
      var d3 = await resp3.json();

      var items = []
        .concat(d1.items || [])
        .concat(d2.items || [])
        .concat(d3.items || []);

      // Ordenar por fecha desc
      items.sort(function (a, b) {
        return (b.fecha || '').localeCompare(a.fecha || '');
      });

      // Limitar a 50
      items = items.slice(0, 50);

      if (!items.length) {
        tablaLogBody.innerHTML = '<tr><td colspan="6" class="empty-msg">No hay acciones de soporte registradas.</td></tr>';
        return;
      }

      var html = '';
      items.forEach(function (it) {
        var ctx = {};
        try { ctx = JSON.parse(it.contexto || '{}'); } catch (e) { /* ignore */ }

        html += '<tr>' +
                '<td>' + esc(it.fecha || '') + '</td>' +
                '<td><span class="accion-badge accion-' + esc(it.accion || '') + '">' + esc(it.accion || '') + '</span></td>' +
                '<td>' + esc(ctx.local || it.local || '-') + '</td>' +
                '<td>' + esc(ctx.fecha_operacion || '-') + '</td>' +
                '<td>' + esc(it.descripcion || '-') + '</td>' +
                '<td>' + esc(it.usuario || '-') + '</td>' +
                '</tr>';
      });
      tablaLogBody.innerHTML = html;
    } catch (err) {
      console.error('Error cargando log:', err);
      tablaLogBody.innerHTML = '<tr><td colspan="6" class="empty-msg">Error al cargar el log.</td></tr>';
    }
  }

  // ── Utils ──────────────────────────────────────────────────────────────
  function esc(text) {
    if (text == null) return '';
    var s = String(text);
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }

})();
