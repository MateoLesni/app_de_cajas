// static/js/fecha_hoy_index.js
(function() {
  console.log('[fecha_hoy_index] Script iniciado');

  // Detectar si estamos en vista de auditor ANTES de cualquier otra cosa
  const esAuditor = () => document.getElementById('localSelect') !== null;

  // Variables globales para tracking
  let ultimoCambioManual = 0;
  let vigilanteActivo = null;

  // DESACTIVADO: El vigilante causaba conflictos
  // En su lugar, usamos restauración basada en eventos específicos
  function iniciarVigilante() {
    // Vigilante desactivado - usando enfoque basado en eventos
    return;
  }

  // Función principal que restaura los valores
  function restaurarContexto() {
    console.log('[fecha_hoy_index] Ejecutando restaurarContexto()');

    // Si es auditor, no hacer nada (tiene su propia lógica de persistencia)
    if (esAuditor()) {
      console.log('[fecha_hoy_index] Vista de auditor detectada, usando lógica propia');
      const topDate = document.getElementById('currentDate');
      if (topDate) topDate.textContent = new Date().toLocaleDateString('es-AR');
      return;
    }

    // ========== FECHA ==========
    const f = document.getElementById('fechaGlobal');
    if (f) {
      const fechaGuardada = localStorage.getItem('fechaGlobal');

      if (fechaGuardada) {
        // Si hay una fecha guardada en localStorage, restaurarla
        f.value = fechaGuardada;
        console.log('[fecha_hoy_index] Fecha restaurada desde localStorage:', fechaGuardada);
      } else {
        // Si NO hay fecha guardada, poner fecha de hoy PERO NO guardarla en localStorage
        // El usuario debe cambiar la fecha explícitamente para que se persista
        if (!f.value) {
          const now = new Date();
          const localISO = new Date(now.getTime() - now.getTimezoneOffset()*60000)
            .toISOString().slice(0,10);
          f.value = localISO;
          console.log('[fecha_hoy_index] Mostrando fecha de hoy (sin persistir):', localISO);
        }
      }
    }

    // ========== CAJA ==========
    const cajaSelect = document.getElementById('cajaSelect');
    if (cajaSelect) {
      // Intentar restaurar la caja guardada
      const cajaGuardada = localStorage.getItem('cajaSelect');

      if (cajaGuardada) {
        // Verificar que la opción existe antes de seleccionarla
        const opcionExiste = Array.from(cajaSelect.options).some(opt => opt.value === cajaGuardada);
        if (opcionExiste) {
          cajaSelect.value = cajaGuardada;
          console.log('[fecha_hoy_index] Caja restaurada:', cajaGuardada);
        }
      }
    }

    // ========== TURNO ==========
    const turnoSelect = document.getElementById('turnoSelect');
    if (turnoSelect) {
      // Intentar restaurar el turno guardado
      const turnoGuardado = localStorage.getItem('turnoSelect');

      if (turnoGuardado) {
        // Verificar que la opción existe antes de seleccionarla
        const opcionExiste = Array.from(turnoSelect.options).some(opt => opt.value === turnoGuardado);
        if (opcionExiste) {
          turnoSelect.value = turnoGuardado;
          console.log('[fecha_hoy_index] Turno restaurado:', turnoGuardado);
        }
      }
    }

    // ========== FECHA DEL DÍA EN EL HEADER ==========
    const topDate = document.getElementById('currentDate');
    if (topDate) topDate.textContent = new Date().toLocaleDateString('es-AR');
  }

  // Función para registrar listeners de cambio
  function registrarListeners() {
    console.log('[fecha_hoy_index] Registrando listeners');

    if (esAuditor()) return; // Auditor tiene su propia lógica

    // PRIMERO: Iniciar el vigilante que restaurará valores automáticamente
    iniciarVigilante();

    const f = document.getElementById('fechaGlobal');
    if (f && !f.dataset.listenerRegistrado) {
      console.log('[fecha_hoy_index] Registrando listeners para fechaGlobal');

      // Escuchar eventos de interacción del usuario
      ['focus', 'mousedown', 'touchstart', 'click'].forEach(evType => {
        f.addEventListener(evType, () => {
          ultimoCambioManual = Date.now();
          console.log('[fecha_hoy_index] Evento de interacción:', evType);
        }, { passive: true });
      });

      // Función para guardar el valor
      const guardarFecha = function(eventName) {
        ultimoCambioManual = Date.now();
        const nuevaFecha = this.value;
        console.log('[fecha_hoy_index] Evento disparado:', eventName, '| Nuevo valor:', nuevaFecha);
        if (nuevaFecha) {
          localStorage.setItem('fechaGlobal', nuevaFecha);
          console.log('[fecha_hoy_index] ✅ Fecha guardada en localStorage:', nuevaFecha);
        }
      };

      // Capturar TODOS los eventos posibles que dispara un input type="date"
      f.addEventListener('input', function(e) { guardarFecha.call(this, 'input'); }, false);
      f.addEventListener('change', function(e) { guardarFecha.call(this, 'change'); }, false);
      f.addEventListener('blur', function(e) { guardarFecha.call(this, 'blur'); }, false);

      // Usar CAPTURING phase para asegurar que se ejecute antes que otros handlers
      f.addEventListener('change', function(e) {
        console.log('[fecha_hoy_index] CAPTURING change event');
        guardarFecha.call(this, 'change-capture');
      }, true);

      f.dataset.listenerRegistrado = 'true';
      console.log('[fecha_hoy_index] Listeners registrados exitosamente');
    }

    const cajaSelect = document.getElementById('cajaSelect');
    if (cajaSelect && !cajaSelect.dataset.listenerRegistrado) {
      ['focus', 'mousedown', 'touchstart'].forEach(evType => {
        cajaSelect.addEventListener(evType, () => {
          ultimoCambioManual = Date.now();
        }, { passive: true });
      });

      cajaSelect.addEventListener('change', function() {
        ultimoCambioManual = Date.now();
        const nuevaCaja = this.value;
        if (nuevaCaja) {
          localStorage.setItem('cajaSelect', nuevaCaja);
          console.log('[fecha_hoy_index] Caja guardada:', nuevaCaja);
        }
      });
      cajaSelect.dataset.listenerRegistrado = 'true';
    }

    const turnoSelect = document.getElementById('turnoSelect');
    if (turnoSelect && !turnoSelect.dataset.listenerRegistrado) {
      ['focus', 'mousedown', 'touchstart'].forEach(evType => {
        turnoSelect.addEventListener(evType, () => {
          ultimoCambioManual = Date.now();
        }, { passive: true });
      });

      turnoSelect.addEventListener('change', function() {
        ultimoCambioManual = Date.now();
        const nuevoTurno = this.value;
        if (nuevoTurno) {
          localStorage.setItem('turnoSelect', nuevoTurno);
          console.log('[fecha_hoy_index] Turno guardado:', nuevoTurno);
        }
      });
      turnoSelect.dataset.listenerRegistrado = 'true';
    }
  }

  // Ejecutar al cargar el DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      console.log('[fecha_hoy_index] DOMContentLoaded disparado');
      restaurarContexto();
      registrarListeners();
    });
  } else {
    // DOM ya cargado, ejecutar inmediatamente
    console.log('[fecha_hoy_index] DOM ya cargado, ejecutando inmediatamente');
    restaurarContexto();
    registrarListeners();
  }

  // CLAVE: Restaurar cuando cambian de tab (evento del orquestador)
  document.addEventListener('orq:tab-shown', function(e) {
    console.log('[fecha_hoy_index] Tab mostrado:', e.detail?.tabKey);
    // Restaurar MÚLTIPLES VECES con diferentes delays para asegurar que prevalece
    setTimeout(restaurarContexto, 0);
    setTimeout(restaurarContexto, 50);
    setTimeout(restaurarContexto, 100);
    setTimeout(restaurarContexto, 200);
  });

  // También restaurar cuando la pestaña vuelve a ser visible
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
      console.log('[fecha_hoy_index] Pestaña visible, restaurando contexto');
      setTimeout(restaurarContexto, 0);
      setTimeout(restaurarContexto, 100);
    }
  });

  // Restaurar cuando la ventana recupera el foco
  window.addEventListener('focus', function() {
    console.log('[fecha_hoy_index] Ventana enfocada, restaurando contexto');
    setTimeout(restaurarContexto, 0);
    setTimeout(restaurarContexto, 100);
  });

})();
