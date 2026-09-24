// static/js/gestion_anticipos.js
// Vista unica de anticipos (auditor / anticipos / admin_anticipos):
// paginado y filtros server-side, visor de comprobantes inline, estado Oppen.
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const fmtNum = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (v, divisa = 'ARS') => {
    const n = Number(v ?? 0);
    const s = fmtNum.format(Math.abs(n));
    const sym = divisa === 'ARS' || !divisa ? '$' : divisa + ' ';
    return (n < 0 ? '-' : '') + sym + s;
  };
  const moneyShort = (v) => {
    const n = Number(v ?? 0);
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1).replace('.', ',') + ' M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + ' k';
    return money(n);
  };

  const DIVISAS_NOMBRE = { ARS: 'ARS', USD: 'USD', EUR: 'EUR', BRL: 'BRL', CLP: 'CLP', UYU: 'UYU' };

  // ===== estado =====
  const state = {
    page: 1,
    perPage: 25,
    sort: 'fecha_evento',
    dir: 'desc',
    filters: {},
    total: 0,
    pages: 1,
  };
  let profile = { level: 0, allowed_locales: [], can_delete: false, can_consume: false, has_full_access: false };
  let locales = [];
  let medios = [];
  let rows = [];
  let localTieneMultiplesTurnos = false;
  let reqSeq = 0;

  // ===== helpers =====
  function esc(t) {
    return String(t ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  }
  function fmtDate(s) {
    if (!s) return '–';
    const d = String(s).slice(0, 10).split('-');
    return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : String(s);
  }
  function fmtDateTime(s) {
    if (!s) return '–';
    const str = String(s);
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
    const d = new Date(str);
    return isNaN(d) ? str : d.toLocaleString('es-AR');
  }
  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  async function api(url, opts = {}) {
    const o = { credentials: 'same-origin', ...opts };
    if (o.json !== undefined) {
      o.method = o.method || 'POST';
      o.headers = { 'Content-Type': 'application/json', ...(o.headers || {}) };
      o.body = JSON.stringify(o.json);
      delete o.json;
    }
    const r = await fetch(url, o);
    let data = null;
    try { data = await r.json(); } catch (_) { data = null; }
    if (!data) throw new Error(`Respuesta inválida del servidor (HTTP ${r.status})`);
    if (!r.ok && data.success === undefined) throw new Error(data.msg || `HTTP ${r.status}`);
    return data;
  }
  function toast(msg, type = '', ms = 4500) {
    const box = $('#antToasts');
    if (!box) { alert(msg); return; }
    const el = document.createElement('div');
    el.className = 'ant-toast ' + type;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, ms);
  }
  function viewUrl(a) { return a.adjunto_url || (a.adjunto_path ? `/files/view?id=${encodeURIComponent(a.adjunto_path)}` : null); }
  function downloadUrl(a) { return a.adjunto_path ? `/files/download?id=${encodeURIComponent(a.adjunto_path)}` : null; }
  function isPdf(a) {
    const m = (a.adjunto_mime || '').toLowerCase();
    return m === 'application/pdf' || (a.adjunto_path || '').toLowerCase().endsWith('.pdf');
  }
  function importeArs(a) {
    if (a.importe_ars !== undefined && a.importe_ars !== null) return Number(a.importe_ars);
    if (a.divisa && a.divisa !== 'ARS' && a.cotizacion_divisa) return Number(a.importe) * Number(a.cotizacion_divisa);
    return Number(a.importe);
  }

  // ===== init =====
  document.addEventListener('DOMContentLoaded', async () => {
    await loadProfile();
    await Promise.all([loadLocales(), loadMedios()]);
    bindUI();
    await loadAnticipos();
  });

  async function loadProfile() {
    try {
      const d = await api('/api/mi_perfil_anticipos');
      if (d.success) profile = d;
    } catch (e) { console.error('perfil', e); }

    if (profile.level >= 6) {
      const nav = $('#sidebarNav');
      if (nav) {
        nav.insertAdjacentHTML('beforeend',
          '<a class="nav-item" href="/gestion-usuarios"><span class="nav-dot"></span>Gestión de Usuarios</a>' +
          '<a class="nav-item" href="/gestion-usuarios-tesoreria"><span class="nav-dot"></span>Usuarios de Tesorería</a>');
      }
    }
    if (profile.level >= 3) {
      const b = $('#btnPaymodes');
      if (b) b.style.display = '';
    }
  }

  async function loadLocales() {
    try {
      const d = await api('/api/locales');
      const raw = d.locales || [];
      const all = raw.map((l) => (typeof l === 'string' ? l : (l?.nombre || l?.local || String(l))));
      if (profile.has_full_access || (profile.level >= 3 && profile.level !== 4)) locales = all;
      else if (profile.allowed_locales?.length) locales = all.filter((l) => profile.allowed_locales.includes(l));
      else locales = [];
      locales.sort((a, b) => a.localeCompare(b, 'es'));

      const fill = (sel, placeholder) => {
        if (!sel) return;
        sel.innerHTML = `<option value="">${placeholder}</option>` + locales.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
      };
      fill($('#fLocal'), 'Todos');
      fill($('#local'), 'Seleccione un local');
    } catch (e) { console.error('locales', e); }
  }

  async function loadMedios() {
    try {
      const d = await api('/api/medios_anticipos/activos');
      medios = d.medios || [];
      const opts = medios.map((m) => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('');
      const fm = $('#fMedio'); if (fm) fm.innerHTML = '<option value="">Todos</option>' + opts;
      const mp = $('#medioPagoId'); if (mp) mp.innerHTML = '<option value="">Seleccione un medio</option>' + opts;
    } catch (e) { console.error('medios', e); }
  }

  // ===== UI bindings =====
  function bindUI() {
    const reload = () => { state.page = 1; loadAnticipos(); };
    const reloadDeb = debounce(reload, 350);
    $$('[data-filter]').forEach((el) => {
      const key = el.dataset.filter;
      const handler = () => {
        const v = (el.value || '').trim();
        if (v) state.filters[key] = v; else delete state.filters[key];
        (el.tagName === 'INPUT' && el.type !== 'date') ? reloadDeb() : reload();
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    });
    $('#btnLimpiar')?.addEventListener('click', () => {
      state.filters = {};
      $$('[data-filter]').forEach((el) => { el.value = ''; });
      reload();
    });
    $('#btnMasFiltros')?.addEventListener('click', () => {
      const ex = $('#filtrosExtra');
      ex.classList.toggle('is-hidden');
      $('#btnMasFiltros').textContent = ex.classList.contains('is-hidden') ? 'Más filtros ▾' : 'Menos filtros ▴';
    });
    $('#btnRecargar')?.addEventListener('click', () => loadAnticipos());
    $('#btnNuevoAnticipo')?.addEventListener('click', () => abrirModal());
    $('#btnPaymodes')?.addEventListener('click', abrirPaymodes);
    $('#pagPerPage')?.addEventListener('change', (e) => { state.perPage = parseInt(e.target.value) || 25; state.page = 1; loadAnticipos(); });

    $$('.ant-stat[data-stat-estado], .ant-stat[data-stat-oppen]').forEach((card) => {
      card.addEventListener('click', () => {
        const key = card.dataset.statEstado ? 'estado' : 'oppen';
        const val = card.dataset.statEstado || card.dataset.statOppen;
        const el = $(`[data-filter="${key}"]`);
        const isSame = state.filters[key] === val;
        if (isSame) { delete state.filters[key]; if (el) el.value = ''; }
        else { state.filters[key] = val; if (el) el.value = val; }
        reload();
      });
    });

    $$('#antTable th.sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (state.sort === col) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        else { state.sort = col; state.dir = col === 'cliente' || col === 'local' ? 'asc' : 'desc'; }
        loadAnticipos();
      });
    });

    // formulario
    $('#divisa')?.addEventListener('change', toggleDivisa);
    $('#importe')?.addEventListener('input', calcEquivalencia);
    $('#cotizacionUSD')?.addEventListener('input', calcEquivalencia);
    $('#medioPagoId')?.addEventListener('change', toggleCajaFields);
    $('#local')?.addEventListener('change', async () => { await loadCajasForLocal($('#local').value); toggleCajaFields(); });
    $('#adjunto')?.addEventListener('change', previewNuevoAdjunto);

    ['#modalAnticipo', '#modalDetalle', '#modalVisor', '#modalPaymodes'].forEach((id) => {
      $(id)?.addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('active'); });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if ($('#modalVisor')?.classList.contains('active')) return cerrarVisor();
      if ($('#modalDetalle')?.classList.contains('active')) return cerrarDetalle();
      if ($('#modalPaymodes')?.classList.contains('active')) return cerrarPaymodes();
    });
  }

  // ===== listado =====
  async function loadAnticipos() {
    const tbody = $('#anticiposTableBody');
    if (!tbody) return;
    const seq = ++reqSeq;
    tbody.innerHTML = '<tr><td colspan="10"><div class="ant-loading"><div class="ant-spinner"></div><div>Cargando anticipos…</div></div></td></tr>';

    const p = new URLSearchParams({ page: state.page, per_page: state.perPage, sort: state.sort, dir: state.dir });
    Object.entries(state.filters).forEach(([k, v]) => p.append(k, v));

    try {
      const d = await api('/api/anticipos_recibidos/listar?' + p.toString());
      if (seq !== reqSeq) return;
      if (!d.success) throw new Error(d.msg || 'Error al cargar');
      rows = d.anticipos || [];
      state.total = d.total ?? rows.length;
      state.pages = d.pages ?? 1;
      state.page = d.page ?? state.page;
      renderStats(d.stats || {});
      renderTable();
      renderPagination();
      renderChips();
      renderSortHeaders();
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="10"><div class="ant-empty"><h3>No se pudieron cargar los anticipos</h3><p>${esc(e.message)}</p></div></td></tr>`;
    }
  }

  function renderStats(s) {
    const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    set('#statPendientes', s.pendientes ?? '–');
    set('#statConsumidos', s.consumidos ?? '–');
    set('#statEliminados', s.eliminados ?? '–');
    set('#statOppenOk', s.oppen_ok ?? '–');
    set('#statOppenError', s.oppen_error ?? '–');
    set('#statMontoPendiente', s.monto_pendiente !== undefined ? money(s.monto_pendiente) + ' en ARS' : '');
    set('#statMontoConsumido', s.monto_consumido !== undefined ? money(s.monto_consumido) + ' en ARS' : '');
    $$('.ant-stat').forEach((c) => {
      const active = (c.dataset.statEstado && state.filters.estado === c.dataset.statEstado) ||
                     (c.dataset.statOppen && state.filters.oppen === c.dataset.statOppen);
      c.classList.toggle('is-active', !!active);
    });
  }

  function estadoBadge(a) {
    const map = {
      pendiente: '<span class="badge badge-pendiente">Pendiente</span>',
      consumido: '<span class="badge badge-consumido">Consumido</span>',
      eliminado_global: '<span class="badge badge-eliminado">Eliminado</span>',
    };
    return map[a.estado] || `<span class="badge badge-oppen-none">${esc(a.estado)}</span>`;
  }
  function oppenBadge(a) {
    if (a.oppen_onaccnr) return `<span class="badge badge-oppen-ok" title="Recibo Oppen ${esc(a.oppen_sernr || '')}">N° ${esc(a.oppen_onaccnr)}</span>`;
    if (a.estado === 'eliminado_global') return '<span class="badge badge-oppen-none">–</span>';
    if (a.oppen_estado === 'error') return `<span class="badge badge-oppen-err" title="${esc(a.oppen_error || 'Error al enviar')}">⚠ Error</span>`;
    return '<span class="badge badge-oppen-none">Sin enviar</span>';
  }
  function thumbCell(a) {
    if (!a.tiene_adjunto) return '<span class="ant-muted">–</span>';
    if (isPdf(a)) return `<div class="ant-thumb-pdf" onclick="verComprobante(${a.id})" title="Ver PDF">PDF</div>`;
    return `<img class="ant-thumb" loading="lazy" src="${esc(viewUrl(a))}" alt="Comprobante" onclick="verComprobante(${a.id})" onerror="antThumbErr(this, ${a.id})">`;
  }
  window.antThumbErr = function (img, id) {
    const d = document.createElement('div');
    d.className = 'ant-thumb-pdf';
    d.title = 'Ver comprobante';
    d.textContent = 'IMG';
    d.onclick = () => verComprobante(id);
    img.replaceWith(d);
  };
  function perms(a) {
    const lvl = profile.level || 0;
    const activo = a.estado !== 'eliminado_global';
    return {
      edit: lvl >= 3 && a.estado === 'pendiente',
      del: !!profile.can_delete && activo && (a.estado === 'pendiente' || lvl >= 6),
      oppen: lvl >= 3 && activo && !a.oppen_onaccnr,
    };
  }

  function renderTable() {
    const tbody = $('#anticiposTableBody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="10"><div class="ant-empty"><div style="font-size:30px">🗂️</div><h3>Sin anticipos</h3><p>No hay anticipos que coincidan con los filtros aplicados.</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((a) => {
      const pm = perms(a);
      const divisa = a.divisa || 'ARS';
      const importeHtml = divisa === 'ARS'
        ? `<strong>${money(a.importe)}</strong>`
        : `<strong>${money(a.importe, divisa)}</strong><span class="badge badge-divisa">${esc(divisa)}</span><div class="ant-muted">≈ ${money(importeArs(a))}</div>`;
      const sub = [`ID ${a.id}`, a.created_by ? `por ${a.created_by}` : '', a.caja ? a.caja + (a.turno ? ' · ' + a.turno : '') : ''].filter(Boolean).join(' · ');
      return `
        <tr class="${a.estado === 'eliminado_global' ? 'is-eliminado' : ''}" data-id="${a.id}">
          <td class="ant-fecha" title="Evento: ${fmtDate(a.fecha_evento)} · Pago: ${fmtDate(a.fecha_pago)}">${fmtDate(a.fecha_evento)}<small>pago ${fmtDate(a.fecha_pago)}</small></td>
          <td><div class="ant-cliente" title="${esc(a.cliente)}">${esc(a.cliente)}</div><div class="ant-muted" title="${esc(fmtDateTime(a.created_at))}">${esc(sub)}</div></td>
          <td>${esc(a.local)}</td>
          <td class="num">${importeHtml}</td>
          <td>${esc(a.medio_pago || '–')}</td>
          <td class="mono" title="${esc(a.numero_transaccion || '')}">${a.numero_transaccion ? esc(a.numero_transaccion) : '<span class="ant-muted">–</span>'}</td>
          <td>${oppenBadge(a)}</td>
          <td>${estadoBadge(a)}</td>
          <td>${thumbCell(a)}</td>
          <td class="col-acciones">
            <div class="ant-actions">
              <button class="ant-ico" title="Ver detalle" onclick="verDetalle(${a.id})">👁</button>
              ${pm.edit ? `<button class="ant-ico" title="Editar" onclick="editarAnticipo(${a.id})">✏️</button>` : ''}
              ${pm.oppen ? `<button class="ant-ico oppen" title="${a.oppen_estado === 'error' ? 'Reintentar envío a Oppen' : 'Enviar a Oppen'}" onclick="enviarOppen(${a.id})">${a.oppen_estado === 'error' ? '↻ Oppen' : '→ Oppen'}</button>` : ''}
              ${pm.del ? `<button class="ant-ico danger" title="Eliminar" onclick="eliminarAnticipo(${a.id})">🗑</button>` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  function renderPagination() {
    const info = $('#pagInfo');
    const pager = $('#pager');
    if (!info || !pager) return;
    const from = state.total ? (state.page - 1) * state.perPage + 1 : 0;
    const to = Math.min(state.page * state.perPage, state.total);
    info.textContent = state.total ? `Mostrando ${from}–${to} de ${state.total} anticipos` : 'Sin resultados';
    $('#pagPerPage').value = String(state.perPage);

    const pages = [];
    const P = state.pages, c = state.page;
    const push = (n) => { if (!pages.includes(n) && n >= 1 && n <= P) pages.push(n); };
    push(1); push(2); push(c - 1); push(c); push(c + 1); push(P - 1); push(P);
    pages.sort((a, b) => a - b);
    let html = `<button ${c <= 1 ? 'disabled' : ''} onclick="irPagina(${c - 1})" title="Anterior">‹</button>`;
    let prev = 0;
    pages.forEach((n) => {
      if (n - prev > 1) html += '<span style="padding:0 4px;color:#9ca3af">…</span>';
      html += `<button class="${n === c ? 'is-current' : ''}" onclick="irPagina(${n})">${n}</button>`;
      prev = n;
    });
    html += `<button ${c >= P ? 'disabled' : ''} onclick="irPagina(${c + 1})" title="Siguiente">›</button>`;
    pager.innerHTML = html;
  }
  window.irPagina = function (n) {
    if (n < 1 || n > state.pages || n === state.page) return;
    state.page = n;
    loadAnticipos();
    $('.ant-table-wrap')?.scrollTo({ top: 0 });
  };

  const FILTER_LABELS = {
    q: 'Buscar', estado: 'Estado', oppen: 'Oppen', local: 'Local', medio_pago_id: 'Medio', cliente: 'Cliente',
    nro_transaccion: 'N° trans.', nro_anticipo: 'N° Oppen', usuario: 'Usuario', divisa: 'Divisa',
    fecha_desde: 'Evento desde', fecha_hasta: 'Evento hasta', pago_desde: 'Pago desde', pago_hasta: 'Pago hasta',
  };
  function renderChips() {
    const box = $('#chipsFiltros');
    if (!box) return;
    box.innerHTML = Object.entries(state.filters).map(([k, v]) => {
      let label = v;
      if (k === 'medio_pago_id') label = medios.find((m) => String(m.id) === String(v))?.nombre || v;
      if (k === 'estado') label = { pendiente: 'Pendiente', consumido: 'Consumido', eliminado_global: 'Eliminado' }[v] || v;
      if (k === 'oppen') label = { creado: 'Creado', pendiente: 'Sin enviar', error: 'Con error' }[v] || v;
      if (k.startsWith('fecha') || k.startsWith('pago_')) label = fmtDate(v);
      return `<span class="ant-chip">${esc(FILTER_LABELS[k] || k)}: ${esc(label)} <button title="Quitar" onclick="quitarFiltro('${k}')">×</button></span>`;
    }).join('');
  }
  window.quitarFiltro = function (k) {
    delete state.filters[k];
    const el = $(`[data-filter="${k}"]`); if (el) el.value = '';
    state.page = 1;
    loadAnticipos();
  };
  function renderSortHeaders() {
    $$('#antTable th.sortable').forEach((th) => {
      const on = th.dataset.sort === state.sort;
      th.classList.toggle('sorted', on);
      th.dataset.arrow = on ? (state.dir === 'asc' ? '▲' : '▼') : '';
    });
  }

  // ===== detalle =====
  window.verDetalle = function (id) {
    const a = rows.find((r) => r.id === id);
    if (!a) return;
    const divisa = a.divisa || 'ARS';
    const item = (l, v, full = false) => `<div class="detail-item${full ? ' full' : ''}"><span class="detail-label">${l}</span><span class="detail-value">${v}</span></div>`;

    let oppenHtml;
    if (a.oppen_onaccnr) {
      oppenHtml = item('N° anticipo (OnAccNr)', `<span class="badge badge-oppen-ok">N° ${esc(a.oppen_onaccnr)}</span>`) +
        item('Recibo Oppen', esc(a.oppen_sernr || '–')) +
        item('Enviado', esc(fmtDateTime(a.oppen_enviado_at))) +
        (a.oppen_consumo_sernr ? item('Consumido en recibo Oppen', esc(a.oppen_consumo_sernr)) : item('Consumo en Oppen', a.estado === 'consumido' ? 'Pendiente de auditar la caja' : '–'));
    } else if (a.oppen_estado === 'error') {
      oppenHtml = item('Estado', '<span class="badge badge-oppen-err">⚠ Error al enviar</span>') +
        item('Último intento', esc(fmtDateTime(a.oppen_enviado_at))) +
        item('Detalle del error', `<span style="color:#991b1b">${esc(a.oppen_error || '–')}</span>`, true);
    } else {
      oppenHtml = item('Estado', '<span class="badge badge-oppen-none">Sin enviar</span>') +
        item('Nota', a.estado === 'eliminado_global' ? 'Anticipo eliminado, no se envía.' : 'Se crea en Oppen al dar de alta el anticipo. Podés enviarlo manualmente con “Enviar a Oppen”.', true);
    }

    const hasAdj = !!a.tiene_adjunto;
    $('#detalleTitulo').textContent = `Anticipo ID ${a.id} · ${a.cliente}`;
    $('#detalleBody').innerHTML = `
      <div class="detail-layout">
        <div>
          <div class="detail-grid">
            ${item('Estado', estadoBadge(a))}
            ${item('Local', esc(a.local))}
            ${item('Cliente', esc(a.cliente))}
            ${item('Fecha de pago', fmtDate(a.fecha_pago))}
            ${item('Fecha del evento', fmtDate(a.fecha_evento))}
            ${item('Importe', `${money(a.importe, divisa)}${divisa !== 'ARS' ? ` <span class="badge badge-divisa">${esc(divisa)}</span>` : ''}`)}
            ${divisa !== 'ARS' ? item('Cotización', `${money(a.cotizacion_divisa)} por ${esc(divisa)}`) + item('Equivalente en ARS', `<b style="color:#059669">${money(importeArs(a))}</b>`) : ''}
            ${item('Medio de pago', esc(a.medio_pago || '–'))}
            ${item('N° transacción', `<span class="mono">${esc(a.numero_transaccion || '–')}</span>`)}
            ${a.caja ? item('Caja / turno', `${esc(a.caja)}${a.turno ? ' · ' + esc(a.turno) : ''}`) : ''}
            ${item('Cargado por', `${esc(a.created_by || '–')}<div class="ant-muted">${esc(fmtDateTime(a.created_at))}</div>`)}
            ${a.updated_by ? item('Última edición', `${esc(a.updated_by)}<div class="ant-muted">${esc(fmtDateTime(a.updated_at))}</div>`) : ''}
            ${a.observaciones ? item('Observaciones', esc(a.observaciones), true) : ''}
          </div>

          ${a.estado === 'consumido' ? `
          <div class="detail-section"><h3>Consumo en caja</h3><div class="detail-grid">
            ${item('Fecha', fmtDate(a.fecha_consumo))}
            ${item('Caja', esc(a.caja_consumo || '–'))}
            ${item('Veces consumido', esc(a.n_consumos || 1))}
          </div></div>` : ''}

          ${a.estado === 'eliminado_global' ? `
          <div class="detail-section"><h3>Eliminación</h3><div class="detail-grid">
            ${item('Eliminado por', esc(a.deleted_by || '–'))}
            ${item('Fecha', esc(fmtDateTime(a.deleted_at)))}
            ${item('Motivo', `<span style="color:#991b1b;font-weight:600">${esc(a.motivo_eliminacion || '–')}</span>`, true)}
          </div></div>` : ''}

          <div class="detail-section"><h3>Oppen</h3><div class="detail-grid">${oppenHtml}</div></div>
        </div>
        <div>
          <div class="detail-label" style="margin-bottom:6px">Comprobante</div>
          <div class="ant-preview" id="detallePreview">${hasAdj ? '<div class="ant-loading"><div class="ant-spinner"></div></div>' : '<span class="ant-muted">Sin comprobante adjunto</span>'}</div>
          ${hasAdj ? `<div class="ant-preview-actions">
            <button class="ant-btn ant-btn-ghost ant-btn-sm" onclick="verComprobante(${a.id})">🔍 Ampliar</button>
            <a class="ant-btn ant-btn-ghost ant-btn-sm" href="${esc(viewUrl(a))}" target="_blank" rel="noopener">↗ Abrir</a>
            <a class="ant-btn ant-btn-ghost ant-btn-sm" href="${esc(downloadUrl(a))}">⬇ Descargar</a>
          </div>` : ''}
        </div>
      </div>`;

    const pm = perms(a);
    $('#detalleFooter').innerHTML = `
      ${pm.oppen ? `<button class="ant-btn ant-btn-ghost" onclick="enviarOppen(${a.id}, true)">🔁 ${a.oppen_estado === 'error' ? 'Reintentar envío a Oppen' : 'Enviar a Oppen'}</button>` : ''}
      ${pm.edit ? `<button class="ant-btn ant-btn-ghost" onclick="cerrarDetalle(); editarAnticipo(${a.id})">✏️ Editar</button>` : ''}
      ${pm.del ? `<button class="ant-btn ant-btn-danger" onclick="eliminarAnticipo(${a.id})">🗑 Eliminar</button>` : ''}
      <button class="ant-btn ant-btn-primary" onclick="cerrarDetalle()">Cerrar</button>`;
    $('#modalDetalle').classList.add('active');

    if (hasAdj) renderAttachment($('#detallePreview'), a, { compact: true });
  };
  window.cerrarDetalle = function () { $('#modalDetalle')?.classList.remove('active'); };

  // ===== comprobante: render robusto (imagen / PDF / fallback) =====
  // Carga el archivo via fetch para conocer el content-type real; si el navegador no
  // puede mostrarlo (p.ej. HEIC) ofrece abrir/descargar en vez de un icono roto.
  const objectUrls = new Set();
  function revokeObjectUrls() { objectUrls.forEach((u) => URL.revokeObjectURL(u)); objectUrls.clear(); }

  async function renderAttachment(container, a, { compact = false } = {}) {
    const url = viewUrl(a);
    const dl = downloadUrl(a);
    if (!container || !url) return;
    const fallback = (msg) => {
      container.innerHTML = `<div class="${compact ? '' : 'ant-visor-fallback'}" style="text-align:center;padding:20px;color:${compact ? '#6b7280' : '#e5e7eb'}">
        <div style="font-size:36px">📎</div>
        <div style="margin:8px 0 12px">${esc(msg)}</div>
        <a class="ant-btn ant-btn-ghost ant-btn-sm" href="${esc(url)}" target="_blank" rel="noopener">↗ Abrir en pestaña</a>
        <a class="ant-btn ant-btn-primary ant-btn-sm" href="${esc(dl)}">⬇ Descargar</a>
      </div>`;
    };
    const showImg = (src) => {
      const img = document.createElement('img');
      img.alt = 'Comprobante';
      img.src = src;
      if (compact) img.onclick = () => verComprobante(a.id);
      img.onerror = () => fallback('El navegador no puede mostrar este formato de imagen (por ejemplo HEIC de iPhone).');
      container.innerHTML = '';
      container.appendChild(img);
    };
    const showPdf = (src) => {
      container.innerHTML = `<iframe src="${esc(src)}#toolbar=1" title="Comprobante PDF"></iframe>`;
    };

    try {
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      const blob = await r.blob();
      const type = (blob.type || ct).toLowerCase();
      const obj = URL.createObjectURL(blob);
      objectUrls.add(obj);
      if (type.startsWith('image/')) return showImg(obj);
      if (type === 'application/pdf' || isPdf(a)) return showPdf(obj);
      // tipo desconocido: probar como imagen igual (octet-stream de JPG mal tipado)
      const probe = new Image();
      probe.onload = () => showImg(obj);
      probe.onerror = () => fallback('No se puede previsualizar este archivo.');
      probe.src = obj;
    } catch (e) {
      // CORS / redirect a URL firmada: dejar que el navegador lo cargue directo
      console.warn('fetch comprobante falló, fallback directo', e);
      if (isPdf(a)) showPdf(url); else showImg(url);
    }
  }

  window.verComprobante = function (id) {
    const a = rows.find((r) => r.id === id);
    if (!a || !a.tiene_adjunto) { toast('Este anticipo no tiene comprobante adjunto', 'warn'); return; }
    $('#visorTitulo').textContent = `Comprobante · ${a.cliente} · ${fmtDate(a.fecha_pago)}`;
    $('#visorAbrir').href = viewUrl(a);
    $('#visorDescargar').href = downloadUrl(a);
    const body = $('#visorBody');
    body.innerHTML = '<div class="ant-loading" style="color:#e5e7eb"><div class="ant-spinner"></div></div>';
    $('#modalVisor').classList.add('active');
    renderAttachment(body, a, { compact: false });
  };
  window.cerrarVisor = function () {
    $('#modalVisor')?.classList.remove('active');
    const body = $('#visorBody'); if (body) body.innerHTML = '';
  };

  // ===== Oppen =====
  window.enviarOppen = async function (id, fromDetalle = false) {
    const a = rows.find((r) => r.id === id);
    if (!a) return;
    if (!confirm(`¿Enviar el anticipo de "${a.cliente}" (${money(importeArs(a))}) a Oppen?\n\nSe crea un recibo de anticipo (OnAccount). No se puede editar después: solo corregir con contra-recibo.`)) return;
    try {
      const d = await api(`/api/anticipos/${id}/enviar_oppen`, { json: {} });
      if (d.success) toast(d.already ? `Ya estaba en Oppen: N° ${d.onaccnr}` : `✅ Creado en Oppen: anticipo N° ${d.onaccnr} (recibo ${d.sernr})`, 'ok', 7000);
      else toast(`⚠️ ${d.msg || 'No se pudo enviar a Oppen'}`, d.skipped ? 'warn' : 'err', 8000);
    } catch (e) {
      toast('❌ ' + e.message, 'err');
    }
    if (fromDetalle) cerrarDetalle();
    await loadAnticipos();
  };

  // ===== PayModes (default por medio + override por local) =====
  let pmLocalActual = '';
  async function abrirPaymodes() {
    const sel = $('#pmLocal');
    if (sel.options.length <= 1) {
      sel.innerHTML = '<option value="">Default (todos los locales)</option>' + locales.map((l) => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
      sel.addEventListener('change', () => { pmLocalActual = sel.value; renderPaymodes(); });
    }
    sel.value = pmLocalActual;
    $('#modalPaymodes').classList.add('active');
    await renderPaymodes();
  }
  async function renderPaymodes() {
    const head = $('#paymodesHead'), tb = $('#paymodesBody'), res = $('#paymodesResumen');
    tb.innerHTML = '<tr><td colspan="4"><div class="ant-loading"><div class="ant-spinner"></div></div></td></tr>';
    let d;
    try {
      d = await api('/api/medios_anticipos/paymodes?local=' + encodeURIComponent(pmLocalActual));
      if (!d.success) throw new Error(d.msg);
    } catch (e) { tb.innerHTML = `<tr><td colspan="4" style="color:#991b1b">${esc(e.message)}</td></tr>`; return; }
    const ms = d.medios || [];
    const porLocal = !!pmLocalActual;
    head.innerHTML = porLocal
      ? `<tr><th>Medio</th><th>Default</th><th>Código para ${esc(pmLocalActual)}</th><th></th></tr>`
      : '<tr><th>Medio</th><th>PayMode default</th><th>Locales con código propio</th><th></th></tr>';
    tb.innerHTML = ms.map((m) => {
      const def = m.paymode_oppen || d.default_global || 'INTERC';
      if (!porLocal) {
        return `<tr>
          <td><b>${esc(m.nombre)}</b>${Number(m.es_efectivo) === 1 ? ' <span class="ant-muted">(efectivo)</span>' : ''}</td>
          <td><input type="text" id="pm_${m.id}" value="${esc(def)}" maxlength="30"></td>
          <td class="ant-muted">${m.n_overrides ? `${m.n_overrides} local(es)` : '–'}</td>
          <td><button class="ant-btn ant-btn-primary ant-btn-sm" onclick="guardarPaymode(${m.id})">Guardar</button></td>
        </tr>`;
      }
      const ov = m.paymode_local || '';
      return `<tr>
        <td><b>${esc(m.nombre)}</b></td>
        <td class="ant-pm-default">${esc(def)}</td>
        <td><input type="text" id="pm_${m.id}" class="${ov ? 'is-override' : ''}" value="${esc(ov)}" placeholder="usa default" maxlength="30"></td>
        <td style="white-space:nowrap">
          <button class="ant-btn ant-btn-primary ant-btn-sm" onclick="guardarPaymode(${m.id})">Guardar</button>
          ${ov ? `<button class="ant-btn ant-btn-ghost ant-btn-sm" title="Volver al default" onclick="quitarPaymodeLocal(${m.id})">Quitar</button>` : ''}
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="4" class="ant-muted">Sin medios activos</td></tr>';

    const ovs = d.overrides || [];
    res.innerHTML = ovs.length
      ? '<b>Códigos por local configurados:</b> ' + ovs.map((o) => `${esc(o.local)} · ${esc(o.medio)} → <b>${esc(o.paymode_oppen)}</b>`).join(' &nbsp;|&nbsp; ')
      : 'Ningún local tiene códigos propios: todos usan el default de cada medio.';
  }
  window.cerrarPaymodes = function () { $('#modalPaymodes')?.classList.remove('active'); };
  window.guardarPaymode = async function (id) {
    const v = ($(`#pm_${id}`)?.value || '').trim().toUpperCase();
    if (!v && !pmLocalActual) { toast('Ingresá un código', 'warn'); return; }
    if (!v && pmLocalActual) return quitarPaymodeLocal(id);
    try {
      const d = await api(`/api/medios_anticipos/${id}/paymode_oppen`, { method: 'PUT', json: { paymode_oppen: v, local: pmLocalActual || null } });
      if (d.success) { toast('✅ ' + (d.msg || 'Guardado'), 'ok'); await renderPaymodes(); await loadMedios(); }
      else toast('❌ ' + (d.msg || 'No se pudo guardar'), 'err');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  };
  window.quitarPaymodeLocal = async function (id) {
    if (!pmLocalActual) return;
    try {
      const d = await api(`/api/medios_anticipos/${id}/paymode_oppen`, { method: 'PUT', json: { paymode_oppen: '', local: pmLocalActual } });
      if (d.success) { toast(d.msg || 'Quitado', 'ok'); await renderPaymodes(); }
      else toast('❌ ' + (d.msg || 'No se pudo quitar'), 'err');
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  };

  // ===== formulario crear / editar =====
  function setNota(html, cls = 'info') { $('#modalNota').innerHTML = html ? `<div class="ant-note ${cls}">${html}</div>` : ''; }

  function toggleDivisa() {
    const esArs = ($('#divisa').value || 'ARS') === 'ARS';
    $('#camposUSD').style.display = esArs ? 'none' : 'block';
    $('#cotizacionUSD').required = !esArs;
    if (esArs) $('#cotizacionUSD').value = '';
    calcEquivalencia();
  }
  function calcEquivalencia() {
    const divisa = $('#divisa').value || 'ARS';
    const imp = parseFloat($('#importe').value) || 0;
    const cot = parseFloat($('#cotizacionUSD').value) || 0;
    $('#montoCalculado').textContent = divisa !== 'ARS' && imp > 0 && cot > 0 ? money(imp * cot) : '–';
  }
  function medioSeleccionadoEsEfectivo() {
    const m = medios.find((x) => String(x.id) === String($('#medioPagoId').value));
    return !!(m && Number(m.es_efectivo) === 1);
  }
  function toggleCajaFields() {
    const isEdit = !!$('#anticipoId').value;
    const ef = medioSeleccionadoEsEfectivo() && !isEdit;
    const show = (id, on, req) => {
      const g = $(id); if (!g) return;
      g.style.display = on ? '' : 'none';
      const input = g.querySelector('input, select');
      if (input) { input.required = !!(on && req); if (!on) input.value = ''; }
    };
    show('#cajaGroup', ef, true);
    show('#turnoGroup', ef && localTieneMultiplesTurnos, true);
    show('#nroRemesaGroup', ef, true);
    show('#precintoGroup', ef, true);
  }
  async function loadCajasForLocal(local) {
    const cajaSel = $('#caja'), turnoSel = $('#turno');
    cajaSel.innerHTML = '<option value="">Seleccione una caja</option>';
    turnoSel.innerHTML = '<option value="">Seleccione un turno</option>';
    localTieneMultiplesTurnos = false;
    if (!local) return;
    try {
      const d = await api(`/api/locales/${encodeURIComponent(local)}/cajas`);
      if (d.success && d.cajas) {
        cajaSel.innerHTML += d.cajas.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
        localTieneMultiplesTurnos = !!d.tiene_multiples_turnos;
        if (localTieneMultiplesTurnos && d.turnos) turnoSel.innerHTML += d.turnos.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
      }
    } catch (e) { console.error('cajas', e); }
  }
  function previewNuevoAdjunto() {
    const f = $('#adjunto').files?.[0];
    const box = $('#adjuntoPreview');
    if (!f) { if (!$('#anticipoId').value) { box.style.display = 'none'; box.innerHTML = ''; } return; }
    box.style.display = 'block';
    if (f.type.startsWith('image/') && !/heic|heif/i.test(f.type + f.name)) {
      const u = URL.createObjectURL(f);
      box.innerHTML = `<img src="${u}" style="max-width:220px;max-height:220px;border-radius:8px;border:1px solid #e5e7eb" alt="Vista previa"><div class="ant-muted">${esc(f.name)} · ${(f.size / 1024).toFixed(0)} KB</div>`;
    } else {
      box.innerHTML = `<div class="ant-note info" style="margin:0">📎 ${esc(f.name)} · ${(f.size / 1024).toFixed(0)} KB</div>`;
    }
  }

  window.abrirModal = async function (id = null) {
    const form = $('#formAnticipo');
    form.reset();
    $('#anticipoId').value = id || '';
    $('#adjuntoPreview').innerHTML = ''; $('#adjuntoPreview').style.display = 'none';
    setNota('');
    delete window._deleteCurrentAdjunto;
    const adjInput = $('#adjunto');
    const isEdit = !!id;

    $('#modalTitle').textContent = isEdit ? `Editar anticipo ID ${id}` : 'Nuevo anticipo';
    adjInput.required = !isEdit;
    ['#importe', '#divisa', '#cotizacionUSD', '#medioPagoId', '#local'].forEach((s) => { $(s).disabled = false; });

    if (!isEdit) {
      const hoy = new Date();
      $('#fechaPago').value = hoy.toISOString().slice(0, 10);
      $('#divisa').value = 'ARS';
      if (locales.length === 1) { $('#local').value = locales[0]; await loadCajasForLocal(locales[0]); }
      if (profile.level >= 3) setNota('Al guardar, el anticipo se envía a <b>Oppen</b> y se guarda su N° de anticipo. Si Oppen falla, queda igual cargado acá y se puede reintentar.', 'info');
    } else {
      const a = rows.find((r) => r.id === id);
      if (!a) return;
      $('#fechaPago').value = (a.fecha_pago || '').slice(0, 10);
      $('#fechaEvento').value = (a.fecha_evento || '').slice(0, 10);
      $('#cliente').value = a.cliente || '';
      $('#local').value = a.local || '';
      $('#medioPagoId').value = a.medio_pago_id || '';
      $('#importe').value = a.importe ?? '';
      $('#divisa').value = a.divisa || 'ARS';
      $('#cotizacionUSD').value = a.cotizacion_divisa ?? '';
      $('#numeroTransaccion').value = a.numero_transaccion || '';
      $('#observaciones').value = a.observaciones || '';
      $('#local').disabled = true;
      const bloqueaMonto = !!a.oppen_onaccnr || Number(a.es_efectivo) === 1;
      if (bloqueaMonto) {
        ['#importe', '#divisa', '#cotizacionUSD', '#medioPagoId'].forEach((s) => { $(s).disabled = true; });
        setNota(a.oppen_onaccnr
          ? `Este anticipo ya está en Oppen (N° ${esc(a.oppen_onaccnr)}): no se puede cambiar importe, divisa, cotización ni medio de pago. Solo datos descriptivos y comprobante.`
          : 'Anticipo en efectivo con remesa espejo en la caja: no se puede cambiar importe, divisa ni medio de pago. Solo datos descriptivos y comprobante.', 'warn');
      }
      if (a.tiene_adjunto) mostrarAdjuntoActual(a);
    }
    toggleDivisa();
    toggleCajaFields();
    $('#modalAnticipo').classList.add('active');
    setTimeout(() => $('#cliente')?.focus(), 50);
  };
  window.cerrarModal = function () {
    $('#modalAnticipo')?.classList.remove('active');
    ['#importe', '#divisa', '#cotizacionUSD', '#medioPagoId', '#local'].forEach((s) => { $(s).disabled = false; });
  };
  window.editarAnticipo = function (id) { abrirModal(id); };

  function mostrarAdjuntoActual(a) {
    const box = $('#adjuntoPreview');
    box.style.display = 'block';
    const thumb = isPdf(a) ? '<div class="ant-thumb-pdf" style="width:64px;height:64px;font-size:12px">PDF</div>'
      : `<img src="${esc(viewUrl(a))}" style="max-width:160px;max-height:160px;border-radius:8px;border:1px solid #e5e7eb" alt="Comprobante actual" onerror="this.style.display='none'">`;
    box.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <div style="cursor:zoom-in" onclick="verComprobante(${a.id})">${thumb}</div>
        <div>
          <div style="font-size:13px;color:#059669;font-weight:600">📎 Comprobante actual</div>
          <div class="ant-muted" style="margin:4px 0 8px">Subí otro archivo arriba para reemplazarlo.</div>
          <button type="button" class="ant-btn ant-btn-danger ant-btn-sm" id="btnQuitarAdjunto">🗑 Quitar comprobante</button>
        </div>
      </div>`;
    $('#btnQuitarAdjunto').onclick = () => {
      if (!confirm('¿Quitar el comprobante actual? Tendrás que subir uno nuevo antes de guardar.')) return;
      window._deleteCurrentAdjunto = true;
      $('#adjunto').required = true;
      box.innerHTML = '<div class="ant-note warn" style="margin:0">⚠️ El comprobante actual se quitará al guardar. Subí uno nuevo.</div>';
    };
  }

  async function subirAdjunto(file) {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const fd = new FormData();
    fd.append('files[]', file);
    fd.append('tab', 'anticipos');
    fd.append('local', $('#local').value);
    fd.append('caja', 'admin');
    fd.append('turno', 'dia');
    fd.append('fecha', $('#fechaPago').value);
    fd.append('entity_type', 'anticipo_recibido_temp');
    fd.append('entity_id', tempId);
    const r = await fetch('/files/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
    const d = await r.json();
    if (!d.success) throw new Error(d.msg || 'Error subiendo comprobante');
    const it = (d.items || [])[0] || {};
    return { path: it.gcs_path || it.path, tempId };
  }

  window.guardarAnticipo = async function (ev) {
    ev.preventDefault();
    const id = $('#anticipoId').value;
    const isEdit = !!id;
    const btn = $('#btnGuardar');
    const file = $('#adjunto').files?.[0];

    const data = {
      fecha_pago: $('#fechaPago').value,
      fecha_evento: $('#fechaEvento').value,
      cliente: $('#cliente').value.trim(),
      local: $('#local').value,
      importe: $('#importe').value,
      divisa: $('#divisa').value || 'ARS',
      medio_pago_id: parseInt($('#medioPagoId').value) || null,
      numero_transaccion: $('#numeroTransaccion').value.trim() || null,
      observaciones: $('#observaciones').value.trim() || null,
    };
    if (!data.fecha_pago || !data.fecha_evento || !data.cliente || !data.local || !data.importe) { toast('Completá los campos obligatorios', 'warn'); return; }
    if (!(parseFloat(data.importe) > 0)) { toast('El importe debe ser mayor a cero', 'warn'); return; }
    if (data.divisa !== 'ARS') {
      const cot = parseFloat($('#cotizacionUSD').value);
      if (!(cot > 0)) { toast('Ingresá la cotización de la divisa', 'warn'); return; }
      data.cotizacion_divisa = $('#cotizacionUSD').value;
    }
    if (!isEdit) {
      if (!data.medio_pago_id) { toast('Seleccioná el medio de pago', 'warn'); return; }
      if (!file) { toast('Subí el comprobante del anticipo', 'warn'); return; }
      if (medioSeleccionadoEsEfectivo()) {
        data.caja = $('#caja').value; data.nro_remesa = $('#nroRemesa').value.trim(); data.precinto = $('#precinto').value.trim();
        if (localTieneMultiplesTurnos) data.turno = $('#turno').value;
        if (!data.caja) { toast('Seleccioná la caja que recibió el efectivo', 'warn'); return; }
        if (localTieneMultiplesTurnos && !data.turno) { toast('Seleccioná el turno', 'warn'); return; }
        if (!data.nro_remesa || !data.precinto) { toast('Ingresá N° de remesa y N° de precinto', 'warn'); return; }
      }
    } else {
      if (window._deleteCurrentAdjunto && !file) { toast('Quitaste el comprobante: subí uno nuevo antes de guardar', 'warn'); return; }
      if (window._deleteCurrentAdjunto) data.delete_adjunto = true;
      ['importe', 'divisa', 'medio_pago_id', 'cotizacion_divisa'].forEach((k) => { if ($('#importe').disabled) delete data[k]; });
    }

    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      if (file) {
        btn.textContent = 'Subiendo comprobante…';
        const up = await subirAdjunto(file);
        data.adjunto_gcs_path = up.path;
        data.temp_entity_id = up.tempId;
        btn.textContent = 'Guardando…';
      }
      const d = isEdit
        ? await api(`/api/anticipos_recibidos/editar/${id}`, { method: 'PUT', json: data })
        : await api('/api/anticipos_recibidos/crear', { json: data });
      if (!d.success) { toast('❌ ' + (d.msg || 'No se pudo guardar'), 'err', 8000); return; }
      if (!isEdit && d.oppen && !d.oppen.skipped) {
        if (d.oppen.success) toast(`✅ Anticipo creado. Oppen: N° ${d.oppen.onaccnr} (recibo ${d.oppen.sernr})`, 'ok', 8000);
        else toast(`Anticipo creado, pero no se pudo enviar a Oppen: ${d.oppen.message}. Podés reintentar desde el listado.`, 'warn', 10000);
      } else {
        toast('✅ ' + (d.msg || 'Guardado'), 'ok');
      }
      delete window._deleteCurrentAdjunto;
      cerrarModal();
      await loadAnticipos();
    } catch (e) {
      toast('❌ ' + e.message, 'err', 8000);
    } finally {
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  };

  // ===== eliminar =====
  window.eliminarAnticipo = async function (id) {
    const a = rows.find((r) => r.id === id);
    if (!a) return;
    const extra = a.oppen_onaccnr ? `\n\nATENCIÓN: ya está en Oppen (N° ${a.oppen_onaccnr}). Eliminarlo acá NO lo anula en Oppen: hay que hacer un contra-recibo.` : '';
    const motivo = prompt(`Motivo para eliminar el anticipo de "${a.cliente}" (${money(importeArs(a))}):${extra}`);
    if (motivo === null) return;
    if (motivo.trim().length < 5) { toast('El motivo debe tener al menos 5 caracteres', 'warn'); return; }
    try {
      const d = await api(`/api/anticipos_recibidos/eliminar/${id}`, { method: 'DELETE', json: { motivo: motivo.trim() } });
      if (d.success) { toast('🗑 ' + (d.msg || 'Anticipo eliminado'), 'ok'); cerrarDetalle(); await loadAnticipos(); }
      else toast('❌ ' + (d.msg || 'No se pudo eliminar'), 'err', 8000);
    } catch (e) { toast('❌ ' + e.message, 'err'); }
  };

  window.addEventListener('beforeunload', revokeObjectUrls);
})();
