(() => {
  const form = document.getElementById('createUserForm');
  const msg  = document.getElementById('formMsg');
  const btnReset = document.getElementById('btnReset');
  const roleSelect = document.getElementById('role');
  const multiLocalFieldset = document.getElementById('multiLocalFieldset');
  const localesList = document.getElementById('localesList');
  const btnAgregarLocal = document.getElementById('btnAgregarLocal');

  // Contador para IDs únicos de inputs
  let localInputCounter = 0;

  function setMsg(text, ok=false){
    msg.textContent = text || '';
    msg.className = 'msg ' + (ok ? 'ok' : 'err');
  }

  // Mostrar/ocultar selector de múltiples locales según el rol
  roleSelect?.addEventListener('change', () => {
    const role = roleSelect.value;
    // Solo mostrar para Encargados
    if (role === 'encargado') {
      multiLocalFieldset.style.display = 'block';
    } else {
      multiLocalFieldset.style.display = 'none';
      // Limpiar locales adicionales si cambia de rol
      localesList.innerHTML = '';
    }
  });

  // Agregar un input para local adicional
  btnAgregarLocal?.addEventListener('click', () => {
    const inputId = `localExtra${localInputCounter++}`;
    const localItem = document.createElement('div');
    localItem.className = 'local-item';
    localItem.style.cssText = 'display: flex; gap: 8px; align-items: center;';
    localItem.innerHTML = `
      <input
        type="text"
        id="${inputId}"
        class="local-extra"
        placeholder="Nombre del local adicional"
        style="flex: 1; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px;"
      />
      <button type="button" class="btn-remove-local" style="
        padding: 8px 12px;
        border: none;
        background: #dc2626;
        color: white;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 600;
      ">✕</button>
    `;
    localesList.appendChild(localItem);

    // Event listener para eliminar
    localItem.querySelector('.btn-remove-local').addEventListener('click', () => {
      localItem.remove();
    });
  });

  btnReset?.addEventListener('click', () => {
    form.reset();
    localesList.innerHTML = '';
    multiLocalFieldset.style.display = 'none';
    setMsg('');
  });

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    setMsg('');

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const role     = document.getElementById('role').value;
    const status   = document.getElementById('status').value;
    const local    = document.getElementById('local').value.trim();
    const society  = document.getElementById('society').value.trim();

    const pages = Array.from(document.querySelectorAll('.page-chk:checked')).map(x => x.value);

    // Recolectar locales adicionales
    const localesAdicionales = Array.from(document.querySelectorAll('.local-extra'))
      .map(input => input.value.trim())
      .filter(val => val !== '');

    // Crear lista completa de locales (principal + adicionales)
    const todosLosLocales = [local, ...localesAdicionales];

    if (!username || !password || !role || !local || !society) {
      return setMsg('Completá todos los campos obligatorios.');
    }
    if (password.length < 4) return setMsg('La contraseña debe tener al menos 4 caracteres.');

    // Validar que no haya locales duplicados
    const localesUnicos = new Set(todosLosLocales);
    if (localesUnicos.size !== todosLosLocales.length) {
      return setMsg('⚠️ Hay locales duplicados. Cada local debe ser único.');
    }

    try{
      const payload = {
        username,
        password,
        role,
        status,
        local,
        society,
        pages,
        // NUEVO: Enviar lista de todos los locales
        locales: todosLosLocales
      };

      const r = await fetch('/api/users', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      const data = await r.json().catch(()=>({}));
      if (!r.ok || !data.success) {
        return setMsg(data.msg || `Error HTTP ${r.status}`);
      }
      setMsg('✅ Usuario creado correctamente' + (localesAdicionales.length > 0 ? ` con ${todosLosLocales.length} locales asignados` : ''), true);
      form.reset();
      localesList.innerHTML = '';
      multiLocalFieldset.style.display = 'none';
    }catch(e){
      setMsg('Error de red. Intentá de nuevo.');
    }
  });

  // Inicializar: ocultar selector de múltiples locales por defecto
  if (multiLocalFieldset) {
    multiLocalFieldset.style.display = 'none';
  }
})();
