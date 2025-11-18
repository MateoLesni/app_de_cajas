// ventas.js — selector de tipo (Z/A/B/CC) + “Número de Factura” fijo y Monto en misma fila
(function(){
  "use strict";

  // ===== Helpers =====
  const $ = (s) => document.querySelector(s);

  function getRoleLevel(){
    const v = window.ROLE_LEVEL ?? window.role_level ?? document.body?.dataset?.roleLevel ?? 1;
    const n = parseInt(v, 10);
    return isNaN(n) ? 1 : n;
  }
  function readCaja(){ return $('#cajaSelect')?.value?.trim() || $('#cajaActual')?.value?.trim() || document.body?.dataset?.caja?.trim() || ''; }
  function readFecha(){
    const v1 = $('#fechaGlobal')?.value?.trim();
    return (v1 && v1 !== '%Y-%m-%d') ? v1 : (document.body?.dataset?.fecha?.trim() || '');
  }
  function readTurno(){ return $('#turnoSelect')?.value?.trim() || document.body?.dataset?.turno?.trim() || 'UNI'; }
  function getLocal(){ return $('#userLocal')?.innerText?.trim() || document.body?.dataset?.local?.trim() || ''; }
  function getCtx(){ return { local:getLocal(), caja:readCaja(), fecha:readFecha(), turno:readTurno(), role:getRoleLevel() }; }

  function normalizeDateLike(d, fallback){
    if (!d || d === '%Y-%m-%d') return fallback || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const dt=new Date(d); if (isNaN(dt)) return String(d);
    const y=dt.getUTCFullYear(), m=String(dt.getUTCMonth()+1).padStart(2,'0'), da=String(dt.getUTCDate()).padStart(2,'0');
    return `${y}-${m}-${da}`;
  }
  function parseMoneda(valor){
    if (valor == null) return 0;
    let s=String(valor).trim().replace(/\s/g,'').replace(/[^\d.,-]/g,''), neg=false;
    if (s.startsWith('-')) { neg=true; s=s.slice(1); }
    const lastSep=Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    let intPart=s, frac='';
    if (lastSep>=0){ intPart=s.slice(0,lastSep).replace(/[.,]/g,''); frac=s.slice(lastSep+1).replace(/[.,]/g,''); }
    else { intPart=s.replace(/[.,]/g,''); }
    const n=parseFloat(frac ? `${intPart}.${frac}` : intPart);
    return neg ? -(isFinite(n)?n:0) : (isFinite(n)?n:0);
  }
  function formatMoneda(n){
    const s = new Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', minimumFractionDigits:2 }).format(Number(n)||0);
    return s.replace(/\u00A0/g,' ');
  }
  function uiMsg(el, text, color='#0b7'){
    if (!el) return; el.textContent = text || ''; el.style.color = color;
    if (text) setTimeout(()=>{ if (el.textContent===text) el.textContent=''; }, 2500);
  }

  // ===== Refs =====
  // Base
  const ventaTotalInput = $('#ventaTotalSistemaInput');
  const btnGuardarBase  = $('#btnGuardarBase');
  const msgBase         = $('#msgBase');

  // Facturas
  const tipoSelect      = $('#tipoFacturaSelect');
  const puntoVentaInput = $('#puntoVentaInput');
  const numeroDocInput  = $('#numeroDocInput');
  const numeroDocLabel  = $('#numeroDocLabel'); // cambia según tipo
  const comentarioGroup = $('#comentarioGroup');
  const comentarioInput = $('#comentarioInput');
  const montoDocInput   = $('#montoDocInput');
  const btnGuardarFac   = $('#btnGuardarFactura');
  const msgFactura      = $('#msgFactura');

  // Tablas
  const tablaBaseBody   = $('#tablaPreviewBase');
  const tablaFactBody   = $('#tablaPreviewFacturas');
  const thNumDoc        = $('#thNumDoc');

  // Estilos de tablas / centrado
  (function injectStyles(){
    const id='ventas-preview-style';
    if (document.getElementById(id)) return;
    const st=document.createElement('style'); st.id=id;
    st.textContent = `
      #tablaPreviewBase th, #tablaPreviewBase td,
      #tablaPreviewFacturas th, #tablaPreviewFacturas td {
        text-align:center; vertical-align:middle;
      }
      #tablaPreviewBase tr.row-ok td,
      #tablaPreviewFacturas tr.row-ok td { background:#d4edda; }
    `;
    document.head.appendChild(st);
  })();

  // Función para actualizar UI según tipo seleccionado
  function updateTipoUI() {
    const tipo = tipoSelect?.value?.toUpperCase() || 'Z';
    const grid = $('#facturasGrid');

    if (tipo === 'CC') {
      if (numeroDocLabel) numeroDocLabel.textContent = 'N° de Comanda';
      if (comentarioGroup) comentarioGroup.style.display = '';
      // Cambiar a grid de 5 columnas cuando se muestra comentario
      if (grid) {
        grid.classList.remove('grid-4');
        grid.classList.add('grid-5');
      }
    } else {
      if (numeroDocLabel) numeroDocLabel.textContent = 'Número de Factura';
      if (comentarioGroup) comentarioGroup.style.display = 'none';
      if (comentarioInput) comentarioInput.value = '';
      // Volver a grid de 4 columnas
      if (grid) {
        grid.classList.remove('grid-5');
        grid.classList.add('grid-4');
      }
    }
  }

  // Event listener para cambio de tipo
  tipoSelect?.addEventListener('change', updateTipoUI);

  // Inicializar UI según tipo por defecto
  updateTipoUI();

  // ===== Estado / permisos =====
  let cajaCerrada=false, localCerrado=false, localAuditado=false;
  let _bdBase=null;
  let _bdFact=[]; // {id,tipo,fecha,caja,punto_venta,nro_factura,comentario,monto}

  function canActUI(){
    const {role}=getCtx();
    // Si el local está auditado, NADIE puede editar
    if (localAuditado) return false;
    if (role>=3) return true;
    if (role>=2) return !localCerrado;
    return !cajaCerrada;
  }
  async function refrescarEstadoLocal(){
    const { local, fecha } = getCtx();
    try{
      const [rLocal, rAudit] = await Promise.all([
        fetch(`/estado_local?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}`),
        fetch(`/api/estado_auditoria?local=${encodeURIComponent(local)}&fecha=${encodeURIComponent(fecha)}`)
      ]);
      const dLocal = await rLocal.json(); localCerrado=((dLocal.estado??1)===0);
      const dAudit = await rAudit.json().catch(()=>({success:false,auditado:false}));
      localAuditado = (dAudit.success && dAudit.auditado) || false;
    }catch{ localCerrado=false; localAuditado=false; }
  }
  async function refrescarEstadoCaja(reRender=false){
    const { local,caja,fecha,turno }=getCtx();
    if (!caja||!fecha||!turno){ cajaCerrada=false; localAuditado=false; toggleUI(); return; }
    try{
      const r=await fetch(`/estado_caja?local=${encodeURIComponent(local)}&caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`);
      const d=await r.json(); cajaCerrada=((d.estado??1)===0);
    }catch{ cajaCerrada=false; }
    await refrescarEstadoLocal();
    toggleUI(); if (reRender) render();
  }
  function toggleUI(){
    const puede=canActUI();
    // Base bloquea si ya existe
    const baseBlocked=!puede || !!_bdBase;
    if (ventaTotalInput) ventaTotalInput.disabled=baseBlocked;
    if (btnGuardarBase){ btnGuardarBase.disabled=baseBlocked; btnGuardarBase.classList.toggle('disabled', baseBlocked); }
    if (_bdBase && puede) uiMsg(msgBase,'Ya existe una venta base para esta fecha/caja/turno.','#b45309');

    // Facturas
    [tipoSelect,puntoVentaInput,numeroDocInput,comentarioInput,montoDocInput,btnGuardarFac].forEach(el=>{ if(el) el.disabled=!puede; });
    if (btnGuardarFac) btnGuardarFac.classList.toggle('disabled', !puede);
    if (!puede){
      const {role}=getCtx(); const motivo=(role>=2 && localCerrado)?'Local cerrado':'Caja cerrada';
      uiMsg(msgBase,motivo,'#b00020'); uiMsg(msgFactura,motivo,'#b00020');
    }
  }

  // ===== Guardar: Base (Sistema) =====
  btnGuardarBase?.addEventListener('click', async ()=>{
    const { local,caja,fecha,turno }=getCtx();
    if (!caja||!fecha) return uiMsg(msgBase,'Seleccione caja y fecha.','#b00020');
    await refrescarEstadoCaja(false);
    if (!canActUI()) return uiMsg(msgBase,'No tenés permisos para guardar.','#b00020');
    if (_bdBase) return uiMsg(msgBase,'Ya hay una venta registrada.','#b45309');

    const venta_total=parseMoneda(ventaTotalInput?.value||'0');
    if (!(venta_total>0)) return uiMsg(msgBase,'Ingrese un monto válido.','#b00020');

    try{
      const r=await fetch('/ventas_base',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({local,fecha,caja,turno,venta_total})});
      const data=await r.json();
      if (data.success){
        uiMsg(msgBase,'✅ Venta guardada'); if (ventaTotalInput) ventaTotalInput.value='';
        if (window.OrqTabs?.reload) OrqTabs.reload('ventasTab'); else await fallbackReload();
      }else uiMsg(msgBase,'❌ '+(data.msg||'Error'),'#b00020');
    }catch{ uiMsg(msgBase,'❌ Error de red','#b00020'); }
  });

  // ===== Guardar: Factura =====
  btnGuardarFac?.addEventListener('click', async ()=>{
    const { local,caja,fecha,turno }=getCtx();
    if (!caja||!fecha) return uiMsg(msgFactura,'Seleccione caja y fecha.','#b00020');

    await refrescarEstadoCaja(false);
    if (!canActUI()) return uiMsg(msgFactura,'No tenés permisos para guardar.','#b00020');

    const tipo=(tipoSelect?.value||'Z').toUpperCase();
    const punto_venta=(puntoVentaInput?.value||'').trim();
    const nro_factura=(numeroDocInput?.value||'').trim();
    const comentario=(comentarioInput?.value||'').trim();
    const monto=parseMoneda(montoDocInput?.value||'0');

    if (!punto_venta || !nro_factura || !(monto>0)) {
      const label = tipo === 'CC' ? 'Número de Comanda' : 'Número de Factura';
      return uiMsg(msgFactura,`Complete Punto de venta, ${label} y Monto.`,'#b00020');
    }

    try{
      const payload = { local, fecha, caja, turno, tipo, punto_venta, nro_factura, monto };
      if (comentario) payload.comentario = comentario;

      const r=await fetch('/facturas',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const data=await r.json();
      if (data.success){
        uiMsg(msgFactura,'✅ Comprobante guardado');
        if (puntoVentaInput) puntoVentaInput.value='';
        if (numeroDocInput)  numeroDocInput.value='';
        if (comentarioInput) comentarioInput.value='';
        if (montoDocInput)   montoDocInput.value='';
        if (window.OrqTabs?.reload) OrqTabs.reload('ventasTab'); else await fallbackReload();
      }else uiMsg(msgFactura,'❌ '+(data.msg||'Error'),'#b00020');
    }catch{ uiMsg(msgFactura,'❌ Error de red','#b00020'); }
  });

  // ===== Render =====
  function render(){ renderBase(); renderFacturas(); toggleUI(); }

  function renderBase(){
    if (!tablaBaseBody) return; tablaBaseBody.innerHTML='';
    const {fecha}=getCtx();
    if (_bdBase){
      const tr=document.createElement('tr'); tr.className='row-ok';
      const fechaStr=normalizeDateLike(_bdBase.fecha,fecha);
      const puede=canActUI();
      tr.innerHTML = `
        <td>${fechaStr||''}</td>
        <td>
          <span class="base-text">${formatMoneda(_bdBase.venta_total||0)}</span>
          <input class="base-edit" type="text" style="display:none;width:120px" value="${String(_bdBase.venta_total??0).replace('.',',')}">
        </td>
        <td>
          ${puede?`
            <button type="button" class="btn-icon base-edit-btn" title="Editar">✏️</button>
            <button type="button" class="btn-icon base-acc-btn"  style="display:none" title="Aceptar">✅</button>
            <button type="button" class="btn-icon base-cancel-btn" style="display:none" title="Cancelar">❌</button>
            <button type="button" class="btn-icon base-del-btn"  title="Borrar">🗑️</button>
          `:''}
        </td>
      `;
      tablaBaseBody.appendChild(tr);
    }
  }

  function renderFacturas(){
    if (!tablaFactBody) return; tablaFactBody.innerHTML='';
    const {fecha}=getCtx(); const puede=canActUI();
    (_bdFact||[]).forEach(row=>{
      const tr=document.createElement('tr'); tr.className='row-ok';
      const fechaStr=normalizeDateLike(row.fecha,fecha);
      tr.innerHTML = `
        <td>${fechaStr||''}</td>
        <td><span class="f-text-tipo">${row.tipo||''}</span></td>
        <td>
          <span class="f-text-pv">${row.punto_venta||''}</span>
          <input class="f-edit-pv" type="text" style="display:none;width:80px" value="${row.punto_venta||''}">
        </td>
        <td>
          <span class="f-text-num">${row.nro_factura||''}</span>
          <input class="f-edit-num" type="text" style="display:none;width:100px" value="${row.nro_factura||''}">
        </td>
        <td>
          <span class="f-text-com">${row.comentario||'-'}</span>
          <input class="f-edit-com" type="text" style="display:none;width:120px" value="${row.comentario||''}">
        </td>
        <td>
          <span class="f-text-m">${formatMoneda(row.monto||0)}</span>
          <input class="f-edit-m" type="text" style="display:none;width:120px" value="${String(row.monto??0).replace('.',',')}">
        </td>
        <td>
          ${puede?`
            <button type="button" class="btn-icon f-edit-btn" data-id="${row.id}" title="Editar">✏️</button>
            <button type="button" class="btn-icon f-acc-btn"  data-id="${row.id}" style="display:none" title="Aceptar">✅</button>
            <button type="button" class="btn-icon f-cancel-btn" data-id="${row.id}" style="display:none" title="Cancelar">❌</button>
            <button type="button" class="btn-icon f-del-btn"  data-id="${row.id}" title="Borrar">🗑️</button>
          `:''}
        </td>
      `;
      tablaFactBody.appendChild(tr);
    });
  }

  // ===== Máscaras =====
  document.addEventListener('input', (ev)=>{
    const t=ev.target;
    if (t.matches('.base-edit,.f-edit-m,.input-moneda')){
      t.value=t.value.replace(/[^0-9.,-]/g,'').replace(/(,|\.){2,}/g,'$1');
    }
  });

  // ===== Acciones Base =====
  tablaBaseBody?.addEventListener('click', async (ev)=>{
    const btn=ev.target.closest('button'); if(!btn) return;
    if(!canActUI()) return;
    const {local,caja,fecha,turno}=getCtx();
    const tr=btn.closest('tr'), txt=tr.querySelector('.base-text'), inp=tr.querySelector('.base-edit');
    const btnEd=tr.querySelector('.base-edit-btn'), btnOk=tr.querySelector('.base-acc-btn'), btnNo=tr.querySelector('.base-cancel-btn');

    if (btn.classList.contains('base-edit-btn')){
      txt.style.display='none'; inp.style.display='inline-block';
      btnEd.style.display='none'; btnOk.style.display='inline-block'; btnNo.style.display='inline-block'; return;
    }
    if (btn.classList.contains('base-cancel-btn')){
      return (window.OrqTabs?.reload ? OrqTabs.reload('ventasTab') : fallbackReload());
    }
    if (btn.classList.contains('base-acc-btn')){
      const venta_total=parseMoneda(inp.value||'0');
      try{
        const r=await fetch('/ventas_base',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({local,fecha,caja,turno,venta_total})});
        const data=await r.json();
        if (data.success){ if (window.OrqTabs?.reload) OrqTabs.reload('ventasTab'); else await fallbackReload(); }
        else alert(data.msg||'No se pudo actualizar');
      }catch{ alert('Error de red'); }
      return;
    }
    if (btn.classList.contains('base-del-btn')){
      if (!confirm('¿Eliminar la venta base de esta fecha/caja/turno?')) return;
      try{
        const r=await fetch('/ventas_base',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({local,fecha,caja,turno})});
        const data=await r.json();
        if (data.success){ if (window.OrqTabs?.reload) OrqTabs.reload('ventasTab'); else await fallbackReload(); }
        else alert(data.msg||'No se pudo borrar');
      }catch{ alert('Error de red'); }
      return;
    }
  });

  // ===== Acciones Facturas =====
  tablaFactBody?.addEventListener('click', async (ev)=>{
    const btn=ev.target.closest('button'); if(!btn) return;
    if(!canActUI()) return;

    const tr=btn.closest('tr'); const id=btn.dataset.id;
    const txtPV=tr.querySelector('.f-text-pv'), txtNum=tr.querySelector('.f-text-num'), txtCom=tr.querySelector('.f-text-com'), txtM=tr.querySelector('.f-text-m');
    const inpPV=tr.querySelector('.f-edit-pv'), inpNum=tr.querySelector('.f-edit-num'), inpCom=tr.querySelector('.f-edit-com'), inpM=tr.querySelector('.f-edit-m');
    const btnEd=tr.querySelector('.f-edit-btn'), btnOk=tr.querySelector('.f-acc-btn'), btnNo=tr.querySelector('.f-cancel-btn');

    if (btn.classList.contains('f-edit-btn')){
      [txtPV,txtNum,txtCom,txtM].forEach(x=>x.style.display='none');
      [inpPV,inpNum,inpCom,inpM].forEach(x=>x.style.display='inline-block');
      btnEd.style.display='none'; btnOk.style.display='inline-block'; btnNo.style.display='inline-block'; return;
    }
    if (btn.classList.contains('f-cancel-btn')){
      return (window.OrqTabs?.reload ? OrqTabs.reload('ventasTab') : fallbackReload());
    }
    if (btn.classList.contains('f-acc-btn')){
      const payload={
        punto_venta:(inpPV.value||'').trim(),
        nro_factura:(inpNum.value||'').trim(),
        comentario:(inpCom.value||'').trim(),
        monto:parseMoneda(inpM.value||'0')
      };
      if (!payload.punto_venta || !payload.nro_factura || !(payload.monto>0)) return alert('Punto de venta, Número de Factura/Comanda y monto válidos.');
      try{
        const r=await fetch(`/facturas/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const data=await r.json();
        if (data.success){ if (window.OrqTabs?.reload) OrqTabs.reload('ventasTab'); else await fallbackReload(); }
        else alert(data.msg||'No se pudo actualizar');
      }catch{ alert('Error de red'); }
      return;
    }
    if (btn.classList.contains('f-del-btn')){
      if (!confirm('¿Eliminar este comprobante?')) return;
      try{
        const r=await fetch(`/facturas/${id}`,{method:'DELETE'});
        const data=await r.json();
        if (data.success){ if (window.OrqTabs?.reload) OrqTabs.reload('ventasTab'); else await fallbackReload(); }
        else alert(data.msg||'No se pudo borrar');
      }catch{ alert('Error de red'); }
      return;
    }
  });

  // ===== OrqTabs hook =====
  window.renderVentas = async function(main, opts){
    const { caja,fecha }=getCtx();
    await refrescarEstadoCaja(false);

    const map=opts?.datasets||{};
    const baseJson = map['/ventas_cargadas']   || main || {};
    const facJson  = map['/facturas_cargadas'] || {};

    const toArray=(x)=>Array.isArray(x)?x:(x?.datos||[]);
    const baseRows=toArray(baseJson);
    const facRows =toArray(facJson);

    const b0 = baseRows[0] || null;
    _bdBase = b0 ? { fecha:normalizeDateLike(b0.fecha,fecha), caja:b0.caja, venta_total:Number(b0.venta_total||b0.venta_total_sistema||0) } : null;

    _bdFact = facRows.map(r=>({
      id:r.id,
      fecha:normalizeDateLike(r.fecha,fecha),
      caja:r.caja,
      tipo:(r.tipo||'').toUpperCase(),
      punto_venta:r.punto_venta,
      nro_factura:r.nro_factura,
      comentario:r.comentario||'',
      monto:Number(r.monto||0)
    })).filter(r => (!fecha || r.fecha===fecha) && (!caja || r.caja===caja));

    render();
  };

  // ===== Fallback sin orquestador =====
  async function fallbackReload(){
    const { local,caja,fecha,turno }=getCtx();
    if (!caja||!fecha){ _bdBase=null; _bdFact=[]; return render(); }
    try{
      const [b,f]=await Promise.all([
        fetch(`/ventas_cargadas?local=${encodeURIComponent(local)}&caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`).then(r=>r.json()),
        fetch(`/facturas_cargadas?local=${encodeURIComponent(local)}&caja=${encodeURIComponent(caja)}&fecha=${encodeURIComponent(fecha)}&turno=${encodeURIComponent(turno)}`).then(r=>r.json())
      ]);
      const toArray=(x)=>Array.isArray(x)?x:(x?.datos||[]);
      const baseRows=toArray(b), facRows=toArray(f);
      const b0=baseRows[0]||null;
      _bdBase = b0 ? { fecha:normalizeDateLike(b0.fecha,fecha), caja:b0.caja, venta_total:Number(b0.venta_total||b0.venta_total_sistema||0) } : null;
      _bdFact = facRows.map(r=>({
        id:r.id, fecha:normalizeDateLike(r.fecha,fecha), caja:r.caja,
        tipo:(r.tipo||'').toUpperCase(), punto_venta:r.punto_venta,
        nro_factura:r.nro_factura, comentario:r.comentario||'', monto:Number(r.monto||0)
      }));
    }catch{ _bdBase=null; _bdFact=[]; }
    render();
  }

  // ===== Init =====
  $('#btnCerrarCaja')?.addEventListener('click', ()=>{ setTimeout(()=>refrescarEstadoCaja(true),800); });
  if (!window.OrqTabs){
    $('#turnoSelect')?.addEventListener('change', ()=>fallbackReload());
    $('#cajaSelect')?.addEventListener('change', ()=>fallbackReload());
    $('#fechaGlobal')?.addEventListener('change', ()=>fallbackReload());
    fallbackReload();
  } else {
    (async ()=>{ await refrescarEstadoCaja(false); toggleUI(); })();
  }
})();
