/* static/js/adjuntador.js
   Uploader + galería (GCS) con confirmación y botón de borrar (🗑) por imagen.
   El backend SIEMPRE revalida con can_edit. Este archivo solo maneja la visibilidad del botón.
*/
(() => {
  // ----------------------- Config API -----------------------
  const API_BASE = (window.ADJ_BASE || "/files").replace(/\/+$/, "");
  const API = {
    upload:         `${API_BASE}/upload`,
    list:           `${API_BASE}/list`,
    byEntity:       `${API_BASE}/by-entity`,
    uploadToEntity: `${API_BASE}/upload-to-entity`,
    deleteItem:     `${API_BASE}/item`
  };

  // Visibilidad del botón borrar en UI (el servidor revalida permisos).
  // ¡Dinámico! así podemos togglear con eventos (caja abierta/cerrada).
  const CAN_DELETE = () => !!window.ADJ_ALLOW_DELETE;

  // ----------------------- Utils ----------------------------
  const $all = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const esc  = s => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const slug = s => (s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"") || "x";

  const toast = (msg) => {
    const el = document.getElementById('alertaFlotante');
    if (!el) { console.log("[toast]", msg); return; }
    el.textContent = msg;
    el.style.display = 'block';
    el.classList.add('show');
    setTimeout(()=>{ el.classList.remove('show'); el.style.display='none'; }, 1800);
  };

  // ----------------------- HTTP -----------------------------
  async function listImages({tab, local, caja, turno, fecha}, scope='day') {
    const params = new URLSearchParams({ tab, local, fecha, scope });
    if (scope === 'day') {
      params.set('caja', caja);
      params.set('turno', turno);
    }
    const r = await fetch(`${API.list}?${params.toString()}`, { credentials: 'same-origin' });
    const data = await r.json();
    if (!data?.success) throw new Error(data?.msg || 'No se pudo listar');
    return data.items || [];
  }

  async function uploadImagesDay(ctx, files) {
    const fd = new FormData();
    fd.append('tab',   ctx.tab);
    fd.append('local', ctx.local);
    fd.append('caja',  ctx.caja);
    fd.append('turno', ctx.turno);
    fd.append('fecha', ctx.fecha);
    files.forEach(f => fd.append('files[]', f, f.name));
    const r = await fetch(API.upload, { method: 'POST', body: fd, credentials: 'same-origin' });
    const data = await r.json();
    if (!data?.success) throw new Error(data?.msg || 'No se pudo subir');
    return data.items || [];
  }

  async function listByEntity(entityType, entityId) {
    const q = new URLSearchParams({ entity_type: entityType, entity_id: String(entityId) });
    const r = await fetch(`${API.byEntity}?${q.toString()}`, { credentials: 'same-origin' });
    const data = await r.json();
    if (!data?.success) throw new Error(data?.msg || 'No se pudo listar adjuntos');
    return data.items || [];
  }

  async function uploadToEntity(entityType, entityId, files) {
    const fd = new FormData();
    fd.append('entity_type', entityType);
    fd.append('entity_id', String(entityId));
    files.forEach(f => fd.append('files[]', f, f.name));
    const r = await fetch(API.uploadToEntity, { method: 'POST', body: fd, credentials: 'same-origin' });
    const data = await r.json();
    if (!data?.success) throw new Error(data?.msg || 'No se pudo subir adjuntos');
    return data.items || [];
  }

  async function deleteItem(itemId) {
    const r = await fetch(`${API.deleteItem}?id=${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    const data = await r.json();
    if (!data?.success) throw new Error(data?.msg || 'No se pudo borrar');
    return true;
  }

  // ----------------------- Lightbox -------------------------
  function ensureLightbox() {
    if (document.getElementById('adj-lightbox')) return;
    const div = document.createElement('div');
    div.id = 'adj-lightbox';
    div.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,.8);
      display:none; align-items:center; justify-content:center; z-index:9999;
    `;
    div.innerHTML = `
      <div style="max-width:95vw; max-height:95vh;">
        <img id="adj-lightbox-img" alt="" style="max-width:95vw; max-height:95vh; display:block"/>
      </div>
    `;
    div.addEventListener('click', () => { div.style.display = 'none'; });
    document.body.appendChild(div);
  }
  function openLightbox(url) {
    ensureLightbox();
    const box = document.getElementById('adj-lightbox');
    const img = document.getElementById('adj-lightbox-img');
    img.src = url;
    box.style.display = 'flex';
  }

  // ----------------------- Uploader (por pestaña/día) -------
  function mountUploader(container) {
    if (!container || container.__mounted) return;
    container.__mounted = true;

    const title = container.dataset.title || 'Adjuntar imágenes';
    const tabForThis = tabSlugFromContainer(container);

    container.innerHTML = `
      <div class="iu-wrap" style="border:1px dashed #cbd5e1;border-radius:12px;padding:12px;background:#fafafa">
        <div class="iu-header" style="display:flex;align-items:center;gap:8px;justify-content:space-between;flex-wrap:wrap">
          <span class="iu-title" style="font-weight:600">${esc(title)}</span>
          <span class="iu-chip" style="font-size:12px;background:#eef2ff;color:#3730a3;border-radius:999px;padding:4px 10px"></span>
          <div class="iu-actions" style="display:flex;gap:8px">
            <button type="button" class="iu-btn iu-select" style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:6px 10px;cursor:pointer">Seleccionar</button>
            <button type="button" class="iu-btn iu-upload" style="border:1px solid #0ea5e9;background:#0ea5e9;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;display:none">Subir imágenes</button>
            <button type="button" class="iu-btn iu-clear"  style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;display:none">Limpiar</button>
          </div>
        </div>
        <div class="iu-dropzone" tabindex="0" style="border:2px dashed #94a3b8;border-radius:12px;padding:16px;text-align:center;color:#475569;background:#fff">Soltá imágenes aquí o usá “Seleccionar”</div>
        <input class="iu-file" type="file" accept="image/*" multiple style="display:none">
        <div class="iu-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;margin-top:10px"></div>
      </div>
      <div class="iu-remote" style="margin-top:12px">
        <div style="display:flex;align-items:center;gap:8px;margin:6px 0">
          <strong>Imágenes cargadas:</strong>
          <button type="button" class="iu-refresh" style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:4px 10px;cursor:pointer">↻ Actualizar</button>
        </div>
        <div class="iu-remote-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px"></div>
      </div>
    `;

    container._queue = [];
    container.dataset.tab = tabForThis;

    const chip   = container.querySelector('.iu-chip');
    const dz     = container.querySelector('.iu-dropzone');
    const fileI  = container.querySelector('.iu-file');
    const btnSel = container.querySelector('.iu-select');
    const btnUp  = container.querySelector('.iu-upload');
    const btnClr = container.querySelector('.iu-clear');
    const grid   = container.querySelector('.iu-grid');

    function updateChip() {
      const c = {
        caja:  document.getElementById('cajaSelect')?.value || '',
        turno: document.getElementById('turnoSelect')?.value || '',
        fecha: document.getElementById('fechaGlobal')?.value || ''
      };
      chip.textContent = [c.caja||'Sin caja', c.turno||'', c.fecha||''].filter(Boolean).join(' · ');
    }

    function redrawQueue() {
      grid.innerHTML = '';
      container._queue.forEach((file, idx) => {
        const card = document.createElement('div');
        card.className = 'iu-thumb';
        card.style.cssText = 'position:relative;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#fff';
        const img  = document.createElement('img');
        img.style.cssText = 'display:block;width:100%;height:100px;object-fit:cover';
        const name = document.createElement('span');
        name.className='iu-name';
        name.textContent = file.name;
        name.style.cssText = 'display:block;font-size:12px;padding:6px 8px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        const rm   = document.createElement('button');
        rm.type='button';
        rm.innerHTML='&times;';
        rm.title='Quitar';
        rm.style.cssText='position:absolute;top:6px;right:6px;border:none;background:#ef4444;color:#fff;border-radius:999px;width:22px;height:22px;line-height:22px;cursor:pointer';
        rm.addEventListener('click', () => {
          container._queue.splice(idx,1);
          redrawQueue();
          toggleActions();
        });
        const url = URL.createObjectURL(file);
        img.src = url;
        card.appendChild(img);
        card.appendChild(name);
        card.appendChild(rm);
        grid.appendChild(card);
      });
    }

    function toggleActions() {
      const has = container._queue.length > 0;
      btnUp.style.display  = has ? 'inline-block' : 'none';
      btnClr.style.display = has ? 'inline-block' : 'none';
    }

    function addFiles(files) {
      const imgs = Array.from(files||[]).filter(f => /^image\//.test(f.type));
      if (!imgs.length) return;
      container._queue.push(...imgs);
      redrawQueue();
      toggleActions();
    }

    // Drag & drop
    ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.style.background='#eff6ff'; dz.style.borderColor='#60a5fa'; }));
    ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.style.background='#fff'; dz.style.borderColor='#94a3b8'; }));
    dz.addEventListener('drop', e => addFiles(e.dataTransfer?.files));

    // Botones
    btnSel.addEventListener('click', () => fileI.click());
    fileI.addEventListener('change', e => { addFiles(e.target.files); fileI.value=''; });
    btnClr.addEventListener('click', () => { container._queue = []; redrawQueue(); toggleActions(); });

    btnUp.addEventListener('click', async () => {
      // Para auditores (nivel 3): lee de #localSelect, fallback a #userLocal
      const getLocal = () => {
        const localSelect = document.getElementById('localSelect');
        if (localSelect) {
          const val = (localSelect.value || '').trim();
          return val || (document.getElementById('userLocal')?.innerText || '').trim();
        }
        return (document.getElementById('userLocal')?.innerText || '').trim();
      };
      const ctx = {
        local: getLocal(),
        caja:  document.getElementById('cajaSelect')?.value || '',
        turno: document.getElementById('turnoSelect')?.value || '',
        fecha: document.getElementById('fechaGlobal')?.value || '',
        tab:   container.dataset.tab || tabForThis
      };
      console.log(`[Adjuntador] Subir imágenes - tab: ${ctx.tab}, local: ${ctx.local}, caja: ${ctx.caja}, turno: ${ctx.turno}, fecha: ${ctx.fecha}`);
      if (!ctx.local || !ctx.caja || !ctx.turno || !ctx.fecha) {
        toast('Completa Local/Caja/Turno/Fecha');
        return;
      }
      if (!container._queue.length) return;
      btnUp.disabled = true; btnUp.textContent = 'Subiendo...';
      try {
        await uploadImagesDay(ctx, container._queue);
        toast('✔ Imágenes subidas');
        container._queue = [];
        redrawQueue(); toggleActions();
        await refreshTabGallery(container);
      } catch (e) {
        console.error(e);
        toast(e.message || 'Error al subir');
      } finally {
        btnUp.disabled = false; btnUp.textContent = 'Subir imágenes';
      }
    });

    container.querySelector('.iu-refresh')?.addEventListener('click', () => refreshTabGallery(container));

    // Inicial
    updateChip();
    container.__updateChip = updateChip;
    refreshVisibility(container);
  }

  function refreshVisibility(container) {
    const pane = container.closest('.tab-pane');
    const isActive = pane?.classList.contains('active');
    if (isActive) refreshTabGallery(container);
  }

  async function refreshTabGallery(container) {
    const rgrid  = container.querySelector('.iu-remote-grid');
    if (!rgrid) return;
    rgrid.innerHTML = '<div style="grid-column:1/-1;color:#64748b">Cargando...</div>';
    // Para auditores (nivel 3): lee de #localSelect, fallback a #userLocal
    const getLocal = () => {
      const localSelect = document.getElementById('localSelect');
      if (localSelect) {
        const val = (localSelect.value || '').trim();
        return val || (document.getElementById('userLocal')?.innerText || '').trim();
      }
      return (document.getElementById('userLocal')?.innerText || '').trim();
    };
    const ctx = {
      tab:   container.dataset.tab || tabSlugFromContainer(container),
      local: getLocal(),
      caja:  document.getElementById('cajaSelect')?.value || '',
      turno: document.getElementById('turnoSelect')?.value || '',
      fecha: document.getElementById('fechaGlobal')?.value || ''
    };
    console.log(`[Adjuntador] refreshTabGallery - tab: ${ctx.tab}, local: ${ctx.local}, caja: ${ctx.caja}, turno: ${ctx.turno}, fecha: ${ctx.fecha}`);
    if (!ctx.local || !ctx.caja || !ctx.turno || !ctx.fecha) {
      rgrid.innerHTML = '<div style="grid-column:1/-1;color:#64748b">Seleccioná Local/Caja/Turno/Fecha</div>';
      return;
    }
    try {
      const items = await listImages(ctx, 'day');
      if (!items.length) {
        rgrid.innerHTML = '<div style="grid-column:1/-1;color:#64748b">Sin imágenes</div>';
        return;
      }
      rgrid.innerHTML = '';
      items.forEach(it => {
        const card = document.createElement('div');
        card.className = 'iu-thumb-remote';
        card.style.cssText='position:relative;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#fff';
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.src = it.view_url;
        img.alt = it.name || '';
        img.style.cssText='display:block;width:100%;height:100px;object-fit:cover;cursor:pointer';
        img.addEventListener('click', () => openLightbox(it.view_url));
        card.appendChild(img);

        // Botón borrar visible solo si CAN_DELETE() === true
        if (CAN_DELETE()) {
          const btnDel = document.createElement('button');
          btnDel.type='button';
          btnDel.title='Eliminar';
          btnDel.setAttribute('aria-label', 'Eliminar imagen');
          btnDel.innerHTML='🗑';
          btnDel.style.cssText=`
            position:absolute;top:6px;right:6px;
            border:none;background:#ef4444;color:#fff;
            border-radius:999px;width:26px;height:26px;
            cursor:pointer;display:flex;align-items:center;justify-content:center;
            box-shadow:0 1px 4px rgba(0,0,0,.25);
            z-index:10;
          `;
          btnDel.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            if (!confirm('¿Eliminar imagen? Esta acción puede estar restringida por caja/rol.')) return;
            try {
              await deleteItem(it.id);           // el back valida can_edit
              card.remove();
              toast('✔ Imagen eliminada');
            } catch (e) {
              toast(e.message || 'No se pudo borrar');
            }
          });
          card.appendChild(btnDel);
        }

        rgrid.appendChild(card);
      });
    } catch (e) {
      console.error('No se pudo refrescar galería', e);
      rgrid.innerHTML = '<div style="grid-column:1/-1;color:#ef4444">No se pudo cargar la galería</div>';
    }
  }

  // ----------------------- Integración con filtros/tabs -------
  function wireGlobalEvents() {
    // refrescar chip en cada uploader cuando cambian filtros
    ['cajaSelect','turnoSelect','fechaGlobal','localSelect'].forEach(id=>{
      const el = document.getElementById(id);
      el?.addEventListener('change', () => {
        $all('.img-uploader').forEach(c => c.__updateChip && c.__updateChip());
        refreshActiveGallery();
      });
    });

    // Cambios de pestaña (tu HTML despacha 'shown.bs.tab')
    $all('.tab-btn').forEach(b=>{
      b.addEventListener('shown.bs.tab', () => refreshActiveGallery());
    });

    // Eventos de tu app para abrir/cerrar caja
    document.addEventListener('caja:cerrada', () => {
      window.ADJ_ALLOW_DELETE = false;     // ocultar icono
      refreshActiveGallery();
    });
    document.addEventListener('caja:abierta', () => {
      window.ADJ_ALLOW_DELETE = true;      // mostrar icono
      refreshActiveGallery();
    });
  }

  function refreshActiveGallery() {
    const pane = document.querySelector('.tab-pane.active');
    if (!pane) return;
    const cont = pane.querySelector('.img-uploader');
    if (cont) refreshTabGallery(cont);
  }

  // ----------------------- Bootstrap ------------------------
  document.addEventListener('DOMContentLoaded', () => {
    // Montar un uploader por cada contenedor .img-uploader
    $all('.img-uploader').forEach(mountUploader);
    // Cablear cambios globales (caja/turno/fecha y tabs)
    wireGlobalEvents();
    // Cargar galería de la pestaña activa
    refreshActiveGallery();
  });

  // ----------------------- Helpers DOM finales ---------------
  function tabSlugFromContainer(container) {
    const ds = container.dataset;
    if (ds.tab) return ds.tab;
    const id = container.id || "";
    if (id.startsWith("uploader-")) {
      return id.replace(/^uploader-/, "").replace(/-/g, "_"); // ventas-z => ventas_z
    }
    const pane = container.closest('.tab-pane');
    if (pane?.id) {
      const map = {
        'ventasTab': 'ventas_z',
        'mercadopago':'mercadopago',
        'tarjetas':'tarjetas',
        'remesas':'remesas',
        'rappiTab':'rappi',
        'pedidosyaTab':'pedidosya',
        'gastos':'gastos',
        'ctasCtesTab':'ctas_ctes'
      };
      return map[pane.id] || slug(pane.id);
    }
    return 'misc';
  }
})();
