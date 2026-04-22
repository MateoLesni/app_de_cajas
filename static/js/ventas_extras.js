(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const tbody = $('tbody');
  const totalsEl = $('totals');

  let LOCALES = [];
  let CURRENT_ITEMS = [];

  function fmt(n) {
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
  }
  function fmtFecha(s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d)) return s;
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function fmtFechaHora(s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d)) return s;
    return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function toast(msg, kind) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast show ' + (kind || '');
    setTimeout(() => t.classList.remove('show'), 3000);
  }

  async function fetchLocales() {
    try {
      const res = await fetch('/api/ventas-extras/locales');
      const j = await res.json();
      if (j.success) {
        LOCALES = j.locales || [];
        const fSel = $('f-local');
        const formSel = $('form-local');
        fSel.innerHTML = '<option value="">Todos</option>' + LOCALES.map(l => `<option value="${l}">${l}</option>`).join('');
        formSel.innerHTML = '<option value="">Seleccionar local</option>' + LOCALES.map(l => `<option value="${l}">${l}</option>`).join('');
      }
    } catch (e) { console.error(e); }
  }

  async function load() {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">Cargando...</td></tr>';
    const params = new URLSearchParams({
      local: $('f-local').value || '',
      fecha_desde: $('f-desde').value || '',
      fecha_hasta: $('f-hasta').value || '',
      estado: $('f-estado').value || 'activo',
    });
    try {
      const res = await fetch('/api/ventas-extras?' + params.toString());
      const j = await res.json();
      if (!j.success) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty">Error: ${j.msg || 'desconocido'}</td></tr>`;
        return;
      }
      CURRENT_ITEMS = j.items || [];
      render(CURRENT_ITEMS, j.total || 0);
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="8" class="empty">Error de red</td></tr>`;
    }
  }

  function render(items, total) {
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">Sin registros</td></tr>';
      totalsEl.innerHTML = '';
      return;
    }

    let sumPos = 0, sumNeg = 0;
    items.filter(i => i.estado === 'activo').forEach(i => {
      if (i.monto > 0) sumPos += i.monto;
      else sumNeg += i.monto;
    });

    totalsEl.innerHTML = `
      <span class="ve-total-pill">${items.length} registros</span>
      <span class="ve-total-pill">Suma positiva: $ ${fmt(sumPos)}</span>
      <span class="ve-total-pill danger">Suma negativa: $ ${fmt(sumNeg)}</span>
      <span class="ve-total-pill ${total < 0 ? 'danger' : ''}">Neto activos: $ ${fmt(total)}</span>
    `;

    tbody.innerHTML = items.map(i => {
      const isDel = i.estado === 'eliminado';
      const tooltip = isDel
        ? `Eliminado por ${i.deleted_by} el ${fmtFechaHora(i.deleted_at)}\nMotivo: ${i.motivo_eliminacion || ''}`
        : (i.updated_at ? `Editado por ${i.updated_by} el ${fmtFechaHora(i.updated_at)}\nMotivo: ${i.motivo_edicion || ''}` : '');
      return `
        <tr ${isDel ? 'style="opacity:.6;"' : ''}>
          <td>${escapeHtml(i.local)}</td>
          <td>${fmtFecha(i.fecha)}</td>
          <td class="col-monto ${i.monto >= 0 ? 'monto-pos' : 'monto-neg'}">$ ${fmt(i.monto)}</td>
          <td>${escapeHtml(i.motivo)}</td>
          <td>${escapeHtml(i.usuario)}</td>
          <td title="${escapeHtml(tooltip)}">${fmtFechaHora(i.created_at)}</td>
          <td>${isDel ? '<span class="badge-eliminado">Eliminado</span>' : '<span style="color:#2e7d32; font-weight:600;">Activo</span>'}</td>
          <td>
            ${isDel ? '' : `
              <button class="btn btn-warning btn-sm" data-edit="${i.id}">Editar</button>
              <button class="btn btn-danger btn-sm" data-del="${i.id}">Eliminar</button>
            `}
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openForm(parseInt(b.dataset.edit))));
    tbody.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => openDelete(parseInt(b.dataset.del))));
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // Modal Form
  function openForm(id) {
    console.log('[ventas-extras] openForm called with id:', id);
    try {
      const isEdit = !!id;
      const titleEl = $('modal-title');
      const fieldEdEl = $('field-motivo-edicion');
      const formMotEdEl = $('form-motivo-edicion');
      const idEl = $('form-id');
      const localEl = $('form-local');
      const fechaEl = $('form-fecha');
      const montoEl = $('form-monto');
      const motivoEl = $('form-motivo');
      const modalEl = $('modal-form');

      if (!modalEl) {
        console.error('[ventas-extras] modal-form no encontrado en DOM');
        return;
      }

      if (titleEl) titleEl.textContent = isEdit ? 'Editar ajuste' : 'Nuevo ajuste';
      if (fieldEdEl) fieldEdEl.style.display = isEdit ? 'block' : 'none';
      if (formMotEdEl) formMotEdEl.value = '';

      if (isEdit) {
        const item = CURRENT_ITEMS.find(i => i.id === id);
        if (!item) { console.warn('item no encontrado', id); return; }
        if (idEl) idEl.value = item.id;
        if (localEl) localEl.value = item.local;
        if (fechaEl) fechaEl.value = item.fecha;
        if (montoEl) montoEl.value = item.monto;
        if (motivoEl) motivoEl.value = item.motivo;
      } else {
        if (idEl) idEl.value = '';
        if (localEl) localEl.value = '';
        if (fechaEl) fechaEl.value = new Date().toISOString().slice(0, 10);
        if (montoEl) montoEl.value = '';
        if (motivoEl) motivoEl.value = '';
      }
      modalEl.classList.add('show');
      console.log('[ventas-extras] modal abierto');
    } catch (e) {
      console.error('[ventas-extras] Error en openForm:', e);
    }
  }
  function closeForm() { $('modal-form').classList.remove('show'); }

  async function saveForm() {
    const id = $('form-id').value;
    const payload = {
      local: $('form-local').value.trim(),
      fecha: $('form-fecha').value,
      monto: $('form-monto').value,
      motivo: $('form-motivo').value.trim(),
    };
    if (id) payload.motivo_edicion = $('form-motivo-edicion').value.trim();

    if (!payload.local) return toast('Seleccioná un local', 'err');
    if (!payload.fecha) return toast('Ingresá la fecha', 'err');
    if (!payload.motivo) return toast('Ingresá el motivo', 'err');
    if (!payload.monto || parseFloat(payload.monto) === 0) return toast('Monto inválido', 'err');
    if (id && !payload.motivo_edicion) return toast('Ingresá el motivo de edición', 'err');

    const url = id ? `/api/ventas-extras/${id}` : '/api/ventas-extras';
    const method = id ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (j.success) {
        toast(j.msg || 'Guardado', 'ok');
        closeForm();
        load();
      } else {
        toast(j.msg || 'Error al guardar', 'err');
      }
    } catch (e) {
      console.error(e);
      toast('Error de red', 'err');
    }
  }

  // Modal Delete
  function openDelete(id) {
    const item = CURRENT_ITEMS.find(i => i.id === id);
    if (!item) return;
    $('del-id').value = id;
    $('del-info').textContent = `${item.local} - ${fmtFecha(item.fecha)} - $ ${fmt(item.monto)}`;
    $('form-motivo-eliminacion').value = '';
    $('modal-delete').classList.add('show');
  }
  function closeDelete() { $('modal-delete').classList.remove('show'); }

  async function confirmDelete() {
    const id = $('del-id').value;
    const motivo = $('form-motivo-eliminacion').value.trim();
    if (!motivo) return toast('Ingresá el motivo de eliminación', 'err');
    try {
      const res = await fetch(`/api/ventas-extras/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo_eliminacion: motivo }),
      });
      const j = await res.json();
      if (j.success) {
        toast(j.msg || 'Eliminado', 'ok');
        closeDelete();
        load();
      } else {
        toast(j.msg || 'Error', 'err');
      }
    } catch (e) {
      console.error(e);
      toast('Error de red', 'err');
    }
  }

  // Wire up
  $('btn-refresh').addEventListener('click', load);
  $('btn-nuevo').addEventListener('click', () => openForm(null));
  $('btn-cancel-form').addEventListener('click', closeForm);
  $('btn-save-form').addEventListener('click', saveForm);
  $('btn-cancel-del').addEventListener('click', closeDelete);
  $('btn-confirm-del').addEventListener('click', confirmDelete);

  // Cerrar modales con click en fondo
  document.querySelectorAll('.modal-bg').forEach(bg => {
    bg.addEventListener('click', (e) => { if (e.target === bg) bg.classList.remove('show'); });
  });

  // Init
  fetchLocales().then(load);
})();
