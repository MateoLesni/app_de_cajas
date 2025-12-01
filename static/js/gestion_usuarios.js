// static/js/gestion_usuarios.js
(function() {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let userLevel = 1; // Se inicializa al cargar
  let userLocal = ''; // Local del usuario logueado

  let localesDisponibles = [];

  // ===== INICIALIZACIÓN =====
  document.addEventListener('DOMContentLoaded', async () => {
    await loadUserLevel();
    await loadLocales();
    await loadUsers();
    setupEventListeners();
  });

  async function loadUserLevel() {
    try {
      const response = await fetch('/api/mi_nivel');
      const data = await response.json();
      userLevel = data.level || 1;
      userLocal = data.local || '';
    } catch (error) {
      console.error('Error al obtener nivel de usuario:', error);
      userLevel = 1;
      userLocal = '';
    }
  }

  async function loadLocales() {
    try {
      const response = await fetch('/api/locales');
      const data = await response.json();
      localesDisponibles = data.locales || [];
      console.log('📍 Locales cargados:', localesDisponibles);
    } catch (error) {
      console.error('Error al cargar locales:', error);
      localesDisponibles = [];
    }
  }

  function setupEventListeners() {
    $('#btnNuevoUsuario')?.addEventListener('click', () => abrirModal());
  }

  // ===== CARGAR USUARIOS =====
  async function loadUsers() {
    const tbody = $('#usersTableBody');
    if (!tbody) return;

    try {
      const response = await fetch('/api/usuarios/listar');
      const data = await response.json();

      if (!data.success || !Array.isArray(data.users)) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: #ef4444;">Error al cargar usuarios</td></tr>';
        return;
      }

      const users = data.users;

      if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: #6b7280;">No hay usuarios para mostrar</td></tr>';
        return;
      }

      tbody.innerHTML = users.map(u => {
        const badgeClass = `badge-nivel-${u.role_level || 1}`;
        const roleName = getRoleName(u.role);
        const estado = u.first_login ? '<span style="color: #059669;">✓ Activo</span>' : '<span style="color: #dc2626;">⚠ Primer login pendiente</span>';

        return `
          <tr>
            <td>${u.username}</td>
            <td><span class="badge ${badgeClass}">${roleName}</span></td>
            <td>${u.local || '-'}</td>
            <td>${estado}</td>
            <td>
              <button class="btn-edit" onclick="editarUsuario('${u.id}')" title="Editar">✏️</button>
              <button class="btn-edit" onclick="eliminarUsuario('${u.id}', '${u.username}')" title="Eliminar" style="color: #dc2626;">🗑️</button>
            </td>
          </tr>
        `;
      }).join('');

    } catch (error) {
      console.error('Error al cargar usuarios:', error);
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: #ef4444;">Error de red</td></tr>';
    }
  }

  function getRoleName(role) {
    const MAP = {
      'cajero': 'Cajero',
      'encargado': 'Encargado',
      'auditor': 'Auditor',
      'jefe_auditor': 'Jefe Auditor'
    };
    return MAP[role] || role;
  }

  // ===== MODAL =====
  window.abrirModal = function(userId = null) {
    const modal = $('#modalUsuario');
    const title = $('#modalTitle');
    const rolSelect = $('#rol');
    const localSelect = $('#local');
    const localGroup = localSelect.closest('.form-group');

    // Limpiar formulario
    $('#userId').value = userId || '';
    $('#username').value = '';

    // Configurar roles disponibles según nivel
    rolSelect.innerHTML = getRolesOptions();

    // LÓGICA DE LOCALES:
    // - Nivel 2 (encargado): Solo su local (no dropdown, campo deshabilitado)
    // - Nivel 3 (auditor): Dropdown con todos los locales para crear encargados
    // - Nivel 4+ (jefe_auditor): No requiere local (se asigna "OFICINA CENTRAL" automáticamente)

    if (userLevel === 2) {
      // Encargado: solo su local, campo deshabilitado
      localSelect.innerHTML = `<option value="${userLocal}" selected>${userLocal}</option>`;
      localSelect.disabled = true;
      localSelect.required = true;
      localGroup.style.display = 'block';
    } else if (userLevel === 3) {
      // Auditor: dropdown con todos los locales para crear encargados
      console.log('🔍 Construyendo opciones de locales para auditor:', localesDisponibles);

      const opciones = localesDisponibles.map(l => {
        // Manejar tanto strings como objetos
        const localNombre = typeof l === 'string' ? l : (l.local || l.nombre || String(l));
        return `<option value="${localNombre}">${localNombre}</option>`;
      }).join('');

      localSelect.innerHTML = '<option value="">Seleccione un local</option>' + opciones;
      localSelect.disabled = false;
      localSelect.required = true;
      localGroup.style.display = 'block';
    } else if (userLevel >= 4) {
      // Jefe Auditor: crear auditores sin selección de local (se asigna automáticamente)
      localSelect.innerHTML = '<option value="OFICINA CENTRAL" selected>OFICINA CENTRAL (asignado automáticamente)</option>';
      localSelect.disabled = true;
      localSelect.required = false;
      localGroup.style.display = 'block';
    } else {
      // Nivel 1 o sin permisos: no debería llegar aquí
      localSelect.innerHTML = '<option value="">Sin acceso</option>';
      localSelect.disabled = true;
      localSelect.required = false;
      localGroup.style.display = 'none';
    }

    if (userId) {
      title.textContent = 'Editar Usuario';
      // TODO: Cargar datos del usuario
    } else {
      title.textContent = 'Nuevo Usuario';
    }

    modal.classList.add('active');
  };

  window.cerrarModal = function() {
    $('#modalUsuario')?.classList.remove('active');
  };

  function getRolesOptions() {
    // Nivel 2 (encargado) puede crear cajeros (nivel 1)
    // Nivel 3 (auditor) puede crear encargados (nivel 2)
    // Nivel 4+ (jefe_auditor) puede crear auditores (nivel 3)

    if (userLevel === 2) {
      return '<option value="cajero">Cajero</option>';
    } else if (userLevel === 3) {
      return '<option value="encargado">Encargado</option>';
    } else if (userLevel >= 4) {
      return '<option value="auditor">Auditor</option>';
    }

    return '<option value="">Sin permisos</option>';
  }

  // ===== GUARDAR USUARIO =====
  window.guardarUsuario = async function(event) {
    event.preventDefault();

    const username = $('#username').value.trim();
    const rol = $('#rol').value;
    const local = $('#local').value;

    // Validación: username y rol siempre requeridos
    if (!username || !rol) {
      alert('Por favor completá todos los campos requeridos');
      return;
    }

    // Validación de local: solo requerido para cajeros y encargados
    // Los auditores se crean con "OFICINA CENTRAL" automáticamente
    if (rol !== 'auditor' && !local) {
      alert('Por favor seleccioná un local');
      return;
    }

    try {
      const response = await fetch('/api/usuarios/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, rol, local })
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ Usuario "${username}" creado correctamente.\n\n⚠️ IMPORTANTE: El usuario debe ingresar con su nombre de usuario y cualquier contraseña que elija.\nLa contraseña que ingrese la primera vez será su contraseña definitiva.`);
        cerrarModal();
        await loadUsers();
      } else {
        alert(`❌ Error: ${data.msg || 'No se pudo crear el usuario'}`);
      }
    } catch (error) {
      console.error('Error al guardar usuario:', error);
      alert('❌ Error de red al guardar usuario');
    }
  };

  // ===== EDITAR USUARIO =====
  window.editarUsuario = function(userId) {
    alert('Funcionalidad de edición en desarrollo');
    // TODO: Implementar edición
  };

  // ===== ELIMINAR USUARIO =====
  window.eliminarUsuario = async function(userId, username) {
    // Doble confirmación para evitar eliminaciones accidentales
    const confirmacion1 = confirm(`⚠️ ¿Estás seguro que querés eliminar al usuario "${username}"?`);
    if (!confirmacion1) return;

    const confirmacion2 = confirm(`⚠️ ATENCIÓN: Esta acción NO SE PUEDE DESHACER.\n\n¿Confirmas que querés eliminar definitivamente al usuario "${username}"?`);
    if (!confirmacion2) return;

    try {
      const response = await fetch(`/api/usuarios/eliminar/${userId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ ${data.msg}`);
        await loadUsers(); // Recargar lista
      } else {
        alert(`❌ Error: ${data.msg || 'No se pudo eliminar el usuario'}`);
      }
    } catch (error) {
      console.error('Error al eliminar usuario:', error);
      alert('❌ Error de red al eliminar usuario');
    }
  };

})();
