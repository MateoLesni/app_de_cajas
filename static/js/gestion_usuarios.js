// static/js/gestion_usuarios.js
(function() {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let userLevel = 1; // Se inicializa al cargar
  let userLocal = ''; // Local del usuario logueado

  let localesDisponibles = [];
  let localInputCounter = 0; // Contador para IDs únicos de inputs de locales

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

    // Event listener para agregar locales adicionales
    $('#btnAgregarLocalModal')?.addEventListener('click', agregarLocalInput);

    // Event listener para detectar cambio de rol y mostrar/ocultar selector de múltiples locales
    // SOLO para Auditores (nivel 3) que están creando Encargados
    $('#rol')?.addEventListener('change', function() {
      const multiLocalContainer = $('#multiLocalContainer');
      const localesListModal = $('#localesListModal');

      // Solo mostrar si es Auditor (nivel 3) creando Encargado
      if (userLevel === 3 && this.value === 'encargado') {
        multiLocalContainer.style.display = 'block';
      } else {
        multiLocalContainer.style.display = 'none';
        // Limpiar locales adicionales si cambia de rol
        localesListModal.innerHTML = '';
      }
    });
  }

  function agregarLocalInput() {
    const localesListModal = $('#localesListModal');
    const inputId = `localExtraModal${localInputCounter++}`;

    const localItem = document.createElement('div');
    localItem.className = 'local-item-modal';
    localItem.style.cssText = 'display: flex; gap: 8px; align-items: center;';
    localItem.innerHTML = `
      <select
        id="${inputId}"
        class="local-extra-modal"
        style="flex: 1; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px;"
      >
        <option value="">Seleccione un local adicional</option>
        ${localesDisponibles.map(l => {
          const localNombre = typeof l === 'string' ? l : (l.local || l.nombre || String(l));
          return `<option value="${localNombre}">${localNombre}</option>`;
        }).join('')}
      </select>
      <button type="button" class="btn-remove-local-modal" style="
        padding: 8px 12px;
        border: none;
        background: #dc2626;
        color: white;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
      ">✕</button>
    `;

    localesListModal.appendChild(localItem);

    // Event listener para eliminar
    localItem.querySelector('.btn-remove-local-modal').addEventListener('click', () => {
      localItem.remove();
    });
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
    const multiLocalContainer = $('#multiLocalContainer');
    const localesListModal = $('#localesListModal');

    // Limpiar formulario
    $('#userId').value = userId || '';
    $('#username').value = '';

    // Limpiar locales adicionales
    if (localesListModal) {
      localesListModal.innerHTML = '';
    }

    // Ocultar selector de múltiples locales por defecto
    if (multiLocalContainer) {
      multiLocalContainer.style.display = 'none';
    }

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

    // NUEVO: Verificar si debe mostrar selector de múltiples locales al abrir modal
    // (en caso de que el rol ya esté seleccionado)
    setTimeout(() => {
      const rolActual = rolSelect.value;
      if (userLevel === 3 && rolActual === 'encargado' && multiLocalContainer) {
        multiLocalContainer.style.display = 'block';
      }
    }, 100);
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

    // Recolectar locales adicionales (solo para Encargados creados por Auditores)
    const localesAdicionales = Array.from($$('.local-extra-modal'))
      .map(select => select.value.trim())
      .filter(val => val !== '');

    // Crear lista completa de locales (principal + adicionales)
    const todosLosLocales = [local, ...localesAdicionales];

    // Validar que no haya locales duplicados
    const localesUnicos = new Set(todosLosLocales);
    if (localesUnicos.size !== todosLosLocales.length) {
      alert('⚠️ Hay locales duplicados. Cada local debe ser único.');
      return;
    }

    try {
      const payload = {
        username,
        rol,
        local
      };

      // Solo incluir locales si hay más de uno (para Encargados con múltiples locales)
      if (todosLosLocales.length > 1) {
        payload.locales = todosLosLocales;
      }

      const response = await fetch('/api/usuarios/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.success) {
        const localesMsg = todosLosLocales.length > 1
          ? ` con ${todosLosLocales.length} locales asignados`
          : '';
        alert(`✅ Usuario "${username}" creado correctamente${localesMsg}.\n\n⚠️ IMPORTANTE: El usuario debe ingresar con su nombre de usuario y cualquier contraseña que elija.\nLa contraseña que ingrese la primera vez será su contraseña definitiva.`);
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
