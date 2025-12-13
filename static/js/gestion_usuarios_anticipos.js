// static/js/gestion_usuarios_anticipos.js
(function() {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let todosLosLocales = [];
  let usuarios = [];
  let usuarioEditando = null;

  // ===== INICIALIZACIÓN =====
  document.addEventListener('DOMContentLoaded', async () => {
    await loadLocales();
    await loadUsuarios();
    setupEventListeners();
  });

  function setupEventListeners() {
    $('#btnNuevoUsuario')?.addEventListener('click', abrirModalNuevo);
    $('#formNuevoUsuario')?.addEventListener('submit', crearUsuario);
    $('#formAsignarLocal')?.addEventListener('submit', asignarLocal);
  }

  // ===== CARGAR LOCALES =====
  async function loadLocales() {
    try {
      const response = await fetch('/api/locales');
      const data = await response.json();
      const localesRaw = data.locales || [];

      // Normalizar: si son objetos {nombre: "..."}, extraer el nombre
      // Si son strings, dejarlos como están
      todosLosLocales = localesRaw.map(l => {
        if (typeof l === 'string') {
          return l;
        } else if (l && l.nombre) {
          return l.nombre;
        } else if (l && l.local) {
          return l.local;
        } else {
          return String(l);
        }
      });

      console.log('Locales cargados:', todosLosLocales);
    } catch (error) {
      console.error('Error al cargar locales:', error);
      todosLosLocales = [];
    }
  }

  // ===== CARGAR USUARIOS =====
  async function loadUsuarios() {
    try {
      $('#loadingState').style.display = 'block';
      $('#emptyState').style.display = 'none';
      $('#usersTable').style.display = 'none';

      const response = await fetch('/api/usuarios_anticipos/listar');
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.msg || 'Error al cargar usuarios');
      }

      usuarios = data.usuarios || [];
      console.log('Usuarios cargados:', usuarios);

      $('#loadingState').style.display = 'none';

      if (usuarios.length === 0) {
        $('#emptyState').style.display = 'block';
      } else {
        $('#usersTable').style.display = 'table';
        renderUsuarios();
      }
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
      $('#loadingState').style.display = 'none';
      $('#emptyState').style.display = 'block';
      alert('Error al cargar usuarios: ' + error.message);
    }
  }

  // ===== RENDERIZAR TABLA =====
  function renderUsuarios() {
    const tbody = $('#usersTableBody');
    tbody.innerHTML = '';

    usuarios.forEach(usuario => {
      const tr = document.createElement('tr');

      const localesHTML = usuario.locales_asignados && usuario.locales_asignados.length > 0
        ? usuario.locales_asignados.map(local => `
            <span class="locale-tag">
              ${escapeHtml(local)}
              <button class="remove-locale" onclick="quitarLocal('${escapeHtml(usuario.username)}', '${escapeHtml(local)}')" title="Quitar local">×</button>
            </span>
          `).join('')
        : '<span style="color: #9ca3af; font-size: 13px;">Sin locales asignados</span>';

      const fechaCreado = usuario.created_at
        ? new Date(usuario.created_at).toLocaleDateString('es-AR')
        : '-';

      tr.innerHTML = `
        <td>
          <span class="username">${escapeHtml(usuario.username)}</span>
        </td>
        <td>
          <span class="status-badge status-${usuario.status === 'active' ? 'active' : 'inactive'}">
            ${usuario.status === 'active' ? 'Activo' : 'Inactivo'}
          </span>
        </td>
        <td>
          <div class="locales-list">
            ${localesHTML}
            <button class="btn-add-locale" onclick="abrirModalAsignar('${escapeHtml(usuario.username)}')">
              + Agregar
            </button>
          </div>
        </td>
        <td style="color: #6b7280; font-size: 13px;">${fechaCreado}</td>
        <td>
          <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" onclick="resetearPassword('${escapeHtml(usuario.username)}')">
            Reset Pass
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    });
  }

  // ===== MODAL NUEVO USUARIO =====
  function abrirModalNuevo() {
    // Llenar checklist de locales
    const checklist = $('#localesChecklistNuevo');
    checklist.innerHTML = '';

    if (todosLosLocales.length === 0) {
      checklist.innerHTML = '<p style="color: #9ca3af; text-align: center; padding: 20px;">No hay locales disponibles</p>';
    } else {
      todosLosLocales.forEach(local => {
        const div = document.createElement('div');
        div.className = 'locale-checkbox';
        div.innerHTML = `
          <input type="checkbox" id="local_${local}" name="locales" value="${escapeHtml(local)}">
          <label for="local_${local}">${escapeHtml(local)}</label>
        `;
        checklist.appendChild(div);
      });
    }

    $('#modalNuevoUsuario').classList.add('active');
    $('#nuevoUsername').focus();
  }

  window.cerrarModalNuevo = function() {
    $('#modalNuevoUsuario').classList.remove('active');
    $('#formNuevoUsuario').reset();
  };

  // ===== CREAR USUARIO =====
  async function crearUsuario(e) {
    e.preventDefault();

    const username = $('#nuevoUsername').value.trim();

    // Obtener locales seleccionados
    const checkboxes = $$('#localesChecklistNuevo input[name="locales"]:checked');
    const locales = Array.from(checkboxes).map(cb => cb.value);

    if (!username) {
      alert('El nombre de usuario es requerido');
      return;
    }

    if (username.length < 3) {
      alert('El nombre de usuario debe tener al menos 3 caracteres');
      return;
    }

    try {
      const response = await fetch('/api/usuarios_anticipos/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, locales })
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.msg || 'Error al crear usuario');
        return;
      }

      alert(`Usuario ${username} creado correctamente.\n\nEn el primer login, puede usar cualquier contraseña (mínimo 4 caracteres) y esa será su contraseña definitiva.`);
      cerrarModalNuevo();
      await loadUsuarios();
    } catch (error) {
      console.error('Error al crear usuario:', error);
      alert('Error al crear usuario: ' + error.message);
    }
  }

  // ===== MODAL ASIGNAR LOCAL =====
  window.abrirModalAsignar = function(username) {
    usuarioEditando = username;
    $('#asignarUsername').value = username;
    $('#modalAsignarUsername').textContent = username;

    // Llenar select con locales disponibles
    const select = $('#localSelect');
    select.innerHTML = '<option value="">-- Seleccione un local --</option>';

    // Obtener locales ya asignados al usuario
    const usuario = usuarios.find(u => u.username === username);
    const localesAsignados = usuario ? (usuario.locales_asignados || []) : [];

    // Mostrar solo locales no asignados
    todosLosLocales.forEach(local => {
      if (!localesAsignados.includes(local)) {
        const option = document.createElement('option');
        option.value = local;
        option.textContent = local;
        select.appendChild(option);
      }
    });

    if (select.options.length === 1) {
      alert('Este usuario ya tiene todos los locales asignados');
      return;
    }

    $('#modalAsignarLocal').classList.add('active');
    select.focus();
  };

  window.cerrarModalAsignar = function() {
    $('#modalAsignarLocal').classList.remove('active');
    $('#formAsignarLocal').reset();
    usuarioEditando = null;
  };

  // ===== ASIGNAR LOCAL =====
  async function asignarLocal(e) {
    e.preventDefault();

    const username = $('#asignarUsername').value;
    const local = $('#localSelect').value;

    if (!local) {
      alert('Seleccioná un local');
      return;
    }

    try {
      const response = await fetch(`/api/usuarios_anticipos/${encodeURIComponent(username)}/locales/asignar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ local })
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.msg || 'Error al asignar local');
        return;
      }

      alert(`Local "${local}" asignado correctamente a ${username}`);
      cerrarModalAsignar();
      await loadUsuarios();
    } catch (error) {
      console.error('Error al asignar local:', error);
      alert('Error al asignar local: ' + error.message);
    }
  }

  // ===== QUITAR LOCAL =====
  window.quitarLocal = async function(username, local) {
    if (!confirm(`¿Estás seguro de quitar el local "${local}" de ${username}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/usuarios_anticipos/${encodeURIComponent(username)}/locales/${encodeURIComponent(local)}/quitar`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.msg || 'Error al quitar local');
        return;
      }

      alert(`Local "${local}" removido correctamente de ${username}`);
      await loadUsuarios();
    } catch (error) {
      console.error('Error al quitar local:', error);
      alert('Error al quitar local: ' + error.message);
    }
  };

  // ===== RESETEAR PASSWORD =====
  window.resetearPassword = async function(username) {
    if (!confirm(`¿Resetear la contraseña de ${username}?\n\nEn el próximo login, el usuario podrá usar cualquier contraseña (mínimo 4 caracteres) y esa será su nueva contraseña.`)) {
      return;
    }

    try {
      // Hacer un UPDATE para poner password vacío y first_login=0
      const response = await fetch('/api/usuarios_anticipos/resetear_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.msg || 'Error al resetear contraseña');
        return;
      }

      alert(`Contraseña reseteada para ${username}.\n\nEn el próximo login podrá usar cualquier contraseña.`);
    } catch (error) {
      console.error('Error al resetear password:', error);
      alert('Error al resetear contraseña: ' + error.message);
    }
  };

  // ===== UTILIDADES =====
  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  // Exponer funciones globales para onclick
  window.abrirModalAsignar = abrirModalAsignar;
  window.cerrarModalNuevo = cerrarModalNuevo;
  window.cerrarModalAsignar = cerrarModalAsignar;
  window.quitarLocal = quitarLocal;
  window.resetearPassword = resetearPassword;

})();
