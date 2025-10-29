// ventas.js — compatible con el back actualizado (can_edit / with_read_scope / estado='revision')
(function(){
  "use strict";

  // ===== Helpers de DOM/ctx (robustos) =====
  const $ = (s) => document.querySelector(s);

  function getRoleLevel(){
    const v = window.ROLE_LEVEL ?? window.role_level ?? document.body?.dataset?.roleLevel ?? 1;
    const n = parseInt(v, 10);
    return isNaN(n) ? 1 : n;
  }

  function readCaja(){
    const v1 = $('#cajaSelect')?.value?.trim();
    if (v1) return v1;
    const v2 = $('#cajaActual')?.value?.trim();
    if (v2) return v2;
    const v3 = document.body?.dataset?.caja?.trim();
    if (v3) return v3;
    return '';
  }

  function readFecha(){
    const v1 = $('#fechaGlobal')?.value?.trim();
    if (v1 && v1 !== '%Y-%m-%d') return v1;
    const v2 = document.body?.dataset?.fecha?.trim();
    if (v2) return v2;
    return '';
  }

  function readTurno(){
    const v1 = $('#turnoSelect')?.value?.trim();
    if (v1) return v1;
    const v2 = document.body?.dataset?.turno?.trim();
    return v2 || 'UNI';
  }

  function getLocal(){
    const t = $('#userLocal')?.innerText?.trim();
    if (t) return t;
    const d = document.body?.dataset?.local?.trim();
    return d || '';
  }

  function getCtx(){
    return {
      local: getLocal(),
      caja:  readCaja(),
      fecha: readFecha(),
      turno: readTurno(),
      role:  getRoleLevel()
    };
  }

  function normalizeDateLike(d, fallback){
    if (!d || d === '%Y-%m-%d') return fallback || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const dt = new Date(d);
    if (isNaN(dt)) return String(d);
    const y = dt.getUTCFullYear(), m = String(dt.getUTCMonth()+1).padStart(2,'0'), da = String(dt.getUTCDate()).padStart(2,'0');
    return `${y}-${m}-${da}`;
  }

  function parseMoneda(valor){
    if (valor == null) return 0;
    let s = String(valor).trim().replace(/\s/g,'').replace(/[^\d.,-]/g,'');
    let neg = false;
    if (s.startsWith('-')) { neg=true; s=s.slice(1); }
    const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    const lastSep = Math.max(lastComma, lastDot);
    let intPart=s, frac='';
    if (lastSep >= 0){
      intPart = s.slice(0,lastSep).replace(/[.,]/g,'');
      frac    = s.slice(lastSep+1).replace(/[.,]/g,'');
    } else {
      intPart = s.replace(/[.,]/g,'');
    }
    const rebuilt = frac ? `${intPart}.${frac}` : intPart;
    const n = parseFloat(rebuilt);
    const out = isFinite(n) ? n : 0;
    return neg ? -out : out;
  }

  function formatMoneda(n){
    const s = new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', minimumFractionDigits:2, maximumFractionDigits:2 })
                .format(Number(n)||0);
    return s.replace(/\u00A0/g,' ');
  }

  function uiMsg(el, text, color = '#0b7'){
    if (!el) return;
    el.textContent = text || '';
    el.style.color = color;
    if (text) {
      setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 2500);
    }
  }

  // ===== Refs =====
  const ventaTotalInput = $('#ventaTotalSistemaInput');
  const btnGuardarBase  = $('#btnGuardarBase');
  const msgBase         = $('#msgBase');

  const puntoVentaInput = $('#puntoVentaInput');
  const numeroZInput    = $('#numeroZInput');
  const montoZInput     = $('#montoZInput');
  const btnGuardarZ     = $('#btnGuardarZ');
  const msgZ            = $('#msgZ');

  const tablaBaseBody   = $('#tablaPreviewBase');
  const tablaZBody      = $('#tablaPreviewZ');

  // ===== Estilos inyectados (centrado + verde filas de BD) =====
  (function injectStyles(){
    const id = 'ventas-preview-style';
    if (!document.getElementById(id)) {
      const st = document.createElement('style');
      st.id = id;
      st.textContent = `
        #tablaPreviewBase th, #tablaPreviewBase td,
        #tablaPreviewZ th,    #tablaPreviewZ td {
          text-align: center;
          vertical-align: middle;
        }
        #tablaPreviewBase tr.row-ok td { background: #d4edda; }
        #tablaPreviewZ tr.row-ok td    { background: #d4edda; }
      `;
      document.head.appendChild(st);
    }
  })();

  // ===== Estado =====
  let cajaCerrada  = false;
  let localCerrado = false; // para L2
  let _bdBase = null;       // {fecha,caja,venta_total}
  let _bdZ    = [];         // [{id,fecha,caja,punto_venta,numero_z,monto}]

  // ===== Permisos UI según rol/estado =====
  function canActUI(){
    const { role } = getCtx();
    if (role >= 3) return true;            // L3: siempre
    if (role >= 2) return !localCerrado;   // L2: mientras el local esté abierto
    return !cajaCerrada;                   // L1: sólo si la caja está abierta
  }

  async function refrescarEstadoLocal(){
    const { fecha } = getCtx();
    try {
      const r = await fetch(`/estado_local?fecha=${encodeURIComponent(fecha)}`);
      const d = await r.json();
      localCerrado = ((d.estado ?? 1) === 0);
    } catch { localCerrado = false; }
  }

  async function refrescarEstadoCaja(reRender=false){
    const { local, caja, fecha, turno } = getCtx();
    if (!caja || !fecha || !turno) { cajaCerrada=false; toggleUI(); return; }
    try{
      const r = await fetch(`/estado_caja?local=${encodeURIComponent(local)}&caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`);
      const d = await r.json();
      cajaCerrada = ((d.estado ?? 1) === 0);
    }catch{ cajaCerrada=false; }
    await refrescarEstadoLocal();
    toggleUI();
    if (reRender) render();
  }

  function toggleUI(){
    const puede = canActUI();

    // Base: editable sólo si NO hay base aún y puede actuar
    const baseBlocked = !puede || !!_bdBase;
    if (ventaTotalInput) ventaTotalInput.disabled = baseBlocked;
    if (btnGuardarBase)  { btnGuardarBase.disabled  = baseBlocked; btnGuardarBase.classList.toggle('disabled', baseBlocked); }
    if (_bdBase && puede) uiMsg(msgBase, 'Ya existe una venta para esta caja/fecha/turno.', '#b45309');

    // Z: editable si puede actuar
    [puntoVentaInput, numeroZInput, montoZInput, btnGuardarZ].forEach(el => { if (el) el.disabled = !puede; });
    if (btnGuardarZ) btnGuardarZ.classList.toggle('disabled', !puede);
    if (!puede) {
      const { role } = getCtx();
      const motivo = (role>=2 && localCerrado) ? 'Local cerrado' : 'Caja cerrada';
      uiMsg(msgZ, motivo, '#b00020');
      uiMsg(msgBase, motivo, '#b00020');
    }
  }

  // ===== Guardar: Base (Sistema) =====
  btnGuardarBase?.addEventListener('click', async () => {
    const { caja, fecha, turno } = getCtx();
    if (!caja || !fecha) return uiMsg(msgBase, 'Seleccione caja y fecha.', '#b00020');

    await refrescarEstadoCaja(false);
    if (!canActUI()) return uiMsg(msgBase, 'No tenés permisos para guardar (caja/local cerrados para tu rol).', '#b00020');
    if (_bdBase)      return uiMsg(msgBase, 'Ya hay una venta registrada.', '#b45309');

    const venta_total = parseMoneda(ventaTotalInput?.value || '0');
    if (!(venta_total > 0)) return uiMsg(msgBase, 'Ingrese un monto válido.', '#b00020');

    try{
      const r = await fetch('/ventas_base', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ fecha, caja, turno, venta_total })
      });
      const data = await r.json();
      if (data.success){
        uiMsg(msgBase, '✅ Venta guardada');
        if (ventaTotalInput) ventaTotalInput.value = '';
        if (window.OrqTabs?.reload) OrqTabs.reload('ventasTab'); else await fallbackReload();
      }else uiMsg(msgBase, '❌ '+(data.msg||'Error'), '#b00020');
    }catch{ uiMsg(msgBase, '❌ Error de red', '#b00020'); }
  });

  // ===== Guardar: Comprobante Z =====
  btnGuardarZ?.addEventListener('click', async () => {
    const { caja, fecha, turno } = getCtx();
    if (!caja || !fecha) return uiMsg(msgZ, 'Seleccione caja y fecha.', '#b00020');

    await refrescarEstadoCaja(false);
    if (!canActUI()) return uiMsg(msgZ, 'No tenés permisos para guardar (caja/local cerrados para tu rol).', '#b00020');

    const punto_venta = (puntoVentaInput?.value || '').trim();
    const numero_z    = (numeroZInput?.value || '').trim();
    const monto       = parseMoneda(montoZInput?.value || '0');

    if (!punto_venta || !numero_z || !(monto > 0)) {
      return uiMsg(msgZ, 'Complete PV, N° Z y Monto.', '#b00020');
    }

    try{
      const r = await fetch('/ventas_z', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ fecha, caja, turno, punto_venta, numero_z, monto })
      });
      const data = await r.json();
      if (data.success){
        uiMsg(msgZ, '✅ Z guardado');
        if (puntoVentaInput) puntoVentaInput.value='';
        if (numeroZInput)    numeroZInput.value='';
        if (montoZInput)     montoZInput.value='';
        if (window.OrqTabs?.reload) OrqTabs.reload('ventasTab'); else await fallbackReload();
      }else uiMsg(msgZ, '❌ '+(data.msg||'Error'), '#b00020');
    }catch{ uiMsg(msgZ, '❌ Error de red', '#b00020'); }
  });

  // ===== Render de tablas =====
  function render(){
    renderBase();
    renderZ();
    toggleUI();
  }

  function renderBase(){
    if (!tablaBaseBody) return;
    tablaBaseBody.innerHTML = '';
    const { fecha } = getCtx();

    if (_bdBase){
      const tr = document.createElement('tr');
      tr.className = 'row-ok';
      const fechaStr = normalizeDateLike(_bdBase.fecha, fecha);
      const puede = canActUI();
      tr.innerHTML = `
        <td>${fechaStr || ''}</td>
        <td>
          <span class="base-text">${formatMoneda(_bdBase.venta_total || 0)}</span>
          <input class="base-edit" type="text" style="display:none;width:120px" value="${String(_bdBase.venta_total ?? 0).replace('.',',')}">
        </td>
        <td>
          ${puede ? `
            <button type="button" class="btn-icon base-edit-btn" title="Editar">✏️</button>
            <button type="button" class="btn-icon base-acc-btn" style="display:none" title="Aceptar">✅</button>
            <button type="button" class="btn-icon base-cancel-btn" style="display:none" title="Cancelar">❌</button>
            <button type="button" class="btn-icon base-del-btn" title="Borrar">🗑️</button>
          ` : ''}
        </td>
      `;
      tablaBaseBody.appendChild(tr);
    }
  }

  function renderZ(){
    if (!tablaZBody) return;
    tablaZBody.innerHTML = '';
    const { fecha } = getCtx();
    const puede = canActUI();

    (_bdZ || []).forEach(row => {
      const tr = document.createElement('tr');
      tr.className = 'row-ok';
      const fechaStr = normalizeDateLike(row.fecha, fecha);
      tr.innerHTML = `
        <td>${fechaStr || ''}</td>
        <td>
          <span class="z-text-pv">${row.punto_venta || ''}</span>
          <input class="z-edit-pv" type="text" style="display:none;width:80px" value="${row.punto_venta || ''}">
        </td>
        <td>
          <span class="z-text-nz">${row.numero_z || ''}</span>
          <input class="z-edit-nz" type="text" style="display:none;width:80px" value="${row.numero_z || ''}">
        </td>
        <td>
          <span class="z-text-m">${formatMoneda(row.monto || 0)}</span>
          <input class="z-edit-m" type="text" style="display:none;width:120px" value="${String(row.monto ?? 0).replace('.',',')}">
        </td>
        <td>
          ${puede ? `
            <button type="button" class="btn-icon z-edit-btn" data-id="${row.id}" title="Editar">✏️</button>
            <button type="button" class="btn-icon z-acc-btn"  data-id="${row.id}" style="display:none" title="Aceptar">✅</button>
            <button type="button" class="btn-icon z-cancel-btn" data-id="${row.id}" style="display:none" title="Cancelar">❌</button>
            <button type="button" class="btn-icon z-del-btn"  data-id="${row.id}" title="Borrar">🗑️</button>
          ` : ''}
        </td>
      `;
      tablaZBody.appendChild(tr);
    });
  }

  // ===== Delegación de eventos (tablas) =====
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.matches('.base-edit,.z-edit-m,.input-moneda')){
      t.value = t.value.replace(/[^0-9.,-]/g,'').replace(/(,|\.){2,}/g,'$1');
    }
  });

  // Acciones Base
  tablaBaseBody?.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button'); if (!btn) return;
    if (!canActUI()) return;

    const { caja, fecha, turno } = getCtx();
    const tr       = btn.closest('tr');
    const txt      = tr.querySelector('.base-text');
    const inp      = tr.querySelector('.base-edit');
    const btnEd    = tr.querySelector('.base-edit-btn');
    const btnOk    = tr.querySelector('.base-acc-btn');
    const btnNo    = tr.querySelector('.base-cancel-btn');

    if (btn.classList.contains('base-edit-btn')){
      txt.style.display='none'; inp.style.display='inline-block';
      btnEd.style.display='none'; btnOk.style.display='inline-block'; btnNo.style.display='inline-block';
      return;
    }
    if (btn.classList.contains('base-cancel-btn')){
      return (window.OrqTabs?.reload ? OrqTabs.reload('ventasTab') : fallbackReload());
    }
    if (btn.classList.contains('base-acc-btn')){
      const venta_total = parseMoneda(inp.value||'0');
      try{
        const r = await fetch('/ventas_base', {
          method:'PUT', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ fecha, caja, turno, venta_total })
        });
        const data = await r.json();
        if (data.success){
          if (window.OrqTabs?.reload) OrqTabs.reload('ventasTab'); else await fallbackReload();
        } else { alert(data.msg || 'No se pudo actualizar'); }
      }catch{ alert('Error de red'); }
      return;
    }
    if (btn.classList.contains('base-del-btn')){
      if (!confirm('¿Eliminar la venta base de esta fecha/caja/turno?')) return;
      try{
        const r = await fetch('/ventas_base', {
          method:'DELETE', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ fecha, caja, turno })
        });
        const data = await r.json();
        if (data.success){
          if (window.OrqTabs?.reload) OrqTabs.reload('ventasTab'); else await fallbackReload();
        } else { alert(data.msg || 'No se pudo borrar'); }
      }catch{ alert('Error de red'); }
      return;
    }
  });

  // Acciones Z
  tablaZBody?.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button'); if (!btn) return;
    if (!canActUI()) return;

    const tr   = btn.closest('tr');
    const id   = btn.dataset.id;

    const txtPV = tr.querySelector('.z-text-pv');
    const txtNZ = tr.querySelector('.z-text-nz');
    const txtM  = tr.querySelector('.z-text-m');

    const inpPV = tr.querySelector('.z-edit-pv');
    const inpNZ = tr.querySelector('.z-edit-nz');
    const inpM  = tr.querySelector('.z-edit-m');

    const btnEd = tr.querySelector('.z-edit-btn');
    const btnOk = tr.querySelector('.z-acc-btn');
    const btnNo = tr.querySelector('.z-cancel-btn');

    if (btn.classList.contains('z-edit-btn')){
      [txtPV,txtNZ,txtM].forEach(x=>x.style.display='none');
      [inpPV,inpNZ,inpM].forEach(x=>x.style.display='inline-block');
      btnEd.style.display='none'; btnOk.style.display='inline-block'; btnNo.style.display='inline-block';
      return;
    }
    if (btn.classList.contains('z-cancel-btn')){
      return (window.OrqTabs?.reload ? OrqTabs.reload('ventasTab') : fallbackReload());
    }
    if (btn.classList.contains('z-acc-btn')){
      const payload = {
        punto_venta: (inpPV.value||'').trim(),
        numero_z:    (inpNZ.value||'').trim(),
        monto:       parseMoneda(inpM.value||'0')
      };
      if (!payload.punto_venta || !payload.numero_z || !(payload.monto>0)) return alert('PV, N° Z y monto válidos.');
      try{
        const r = await fetch(`/ventas_z/${id}`, {
          method:'PUT', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(payload)
        });
        const data = await r.json();
        if (data.success){
          if (window.OrqTabs?.reload) OrqTabs.reload('ventasTab'); else await fallbackReload();
        } else { alert(data.msg || 'No se pudo actualizar'); }
      }catch{ alert('Error de red'); }
      return;
    }
    if (btn.classList.contains('z-del-btn')){
      if (!confirm('¿Eliminar este comprobante Z?')) return;
      try{
        const r = await fetch(`/ventas_z/${id}`, { method:'DELETE' });
        const data = await r.json();
        if (data.success){
          if (window.OrqTabs?.reload) OrqTabs.reload('ventasTab'); else await fallbackReload();
        } else { alert(data.msg || 'No se pudo borrar'); }
      }catch{ alert('Error de red'); }
      return;
    }
  });

  // ===== API para OrqTabs =====
  window.renderVentas = async function(main, opts){
    const { caja, fecha } = getCtx();
    await refrescarEstadoCaja(false);

    const map      = opts?.datasets || {};
    const baseJson = map['/ventas_cargadas']   || main || {};
    const zJson    = map['/ventas_z_cargadas'] || {};

    const toArray = (x) => Array.isArray(x) ? x : (x?.datos || []);
    const baseRows = toArray(baseJson);
    const zRows    = toArray(zJson);

    const b0 = baseRows[0] || null;
    _bdBase = b0 ? {
      fecha: normalizeDateLike(b0.fecha, fecha),
      caja:  b0.caja,
      venta_total: Number(b0.venta_total || b0.venta_total_sistema || 0)
    } : null;

    _bdZ = zRows
      .map(r => ({
        id: r.id,
        fecha: normalizeDateLike(r.fecha, fecha),
        caja: r.caja,
        punto_venta: r.punto_venta,
        numero_z: r.numero_z,
        monto: Number(r.monto || 0)
      }))
      .filter(r => (!fecha || r.fecha === fecha) && (!caja || r.caja === caja));

    render();
  };

  // ===== Fallback sin orquestador =====
  async function fallbackReload(){
    const { caja, fecha, turno } = getCtx();
    if (!caja || !fecha){ _bdBase=null; _bdZ=[]; return render(); }
    try{
      const [b,z] = await Promise.all([
        fetch(`/ventas_cargadas?caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`).then(r=>r.json()),
        fetch(`/ventas_z_cargadas?caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`).then(r=>r.json())
      ]);
      const toArray = (x) => Array.isArray(x) ? x : (x?.datos || []);
      const baseRows = toArray(b), zRows = toArray(z);
      const b0 = baseRows[0] || null;
      _bdBase = b0 ? { fecha: normalizeDateLike(b0.fecha, fecha), caja:b0.caja, venta_total:Number(b0.venta_total||b0.venta_total_sistema||0) } : null;
      _bdZ = zRows.map(r => ({ id:r.id, fecha:normalizeDateLike(r.fecha,fecha), caja:r.caja, punto_venta:r.punto_venta, numero_z:r.numero_z, monto:Number(r.monto||0) }));
    }catch{ _bdBase=null; _bdZ=[]; }
    render();
  }

  // ===== Init =====
  $('#btnCerrarCaja')?.addEventListener('click', () => {
    setTimeout(() => refrescarEstadoCaja(true), 800);
  });

  if (!window.OrqTabs) {
    $('#turnoSelect')?.addEventListener('change', () => fallbackReload());
    $('#cajaSelect')?.addEventListener('change', () => fallbackReload());
    $('#fechaGlobal')?.addEventListener('change', () => fallbackReload());
    fallbackReload();
  } else {
    (async () => { await refrescarEstadoCaja(false); toggleUI();})();
  }
})();
