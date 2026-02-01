// static/js/gestion_anticipos.js
(function() {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const fmt = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (v) => '$' + fmt.format(Number(v ?? 0));

  let localesDisponibles = [];
  let anticiposData = [];
  let mediosPagoDisponibles = [];
  let localTieneMultiplesTurnos = false;  // Se actualiza al cargar cajas del local
  let userProfile = {
    level: 0,
    allowed_locales: [],
    can_edit: false,
    can_delete: false,
    has_full_access: false
  };

  // ===== INICIALIZACIÓN =====
  document.addEventListener('DOMContentLoaded', async () => {
    // No setear filtros por defecto - mostrar todos los anticipos
    // Los usuarios pueden filtrar manualmente según necesiten

    await loadUserProfile();
    await loadLocales();
    await loadMediosPago();
    await loadAnticipos();
    setupEventListeners();
  });

  async function loadUserProfile() {
    try {
      const response = await fetch('/api/mi_perfil_anticipos');
      const data = await response.json();
      if (data.success) {
        userProfile = data;
        console.log('Perfil de usuario cargado:', userProfile);

        // Si es admin_anticipos (nivel 6), agregar links de Gestión de Usuarios
        if (userProfile.level >= 6) {
          const sidebarNav = $('#sidebarNav');
          if (sidebarNav) {
            // Link de Gestión de Usuarios de Anticipos
            const gestionUsuariosLink = document.createElement('a');
            gestionUsuariosLink.className = 'nav-item';
            gestionUsuariosLink.href = '/gestion-usuarios';
            gestionUsuariosLink.innerHTML = '<span class="nav-dot"></span>Gestión de Usuarios';
            sidebarNav.appendChild(gestionUsuariosLink);

            // Link de Gestión de Usuarios de Tesorería
            const gestionTesoreriaLink = document.createElement('a');
            gestionTesoreriaLink.className = 'nav-item';
            gestionTesoreriaLink.href = '/gestion-usuarios-tesoreria';
            gestionTesoreriaLink.innerHTML = '<span class="nav-dot"></span>Usuarios de Tesorería';
            sidebarNav.appendChild(gestionTesoreriaLink);
          }
        }
      }
    } catch (error) {
      console.error('Error al cargar perfil de usuario:', error);
    }
  }

  async function loadLocales() {
    try {
      console.log('🔍 Cargando locales...');
      const response = await fetch('/api/locales');
      console.log('📡 Response status:', response.status, response.statusText);

      const data = await response.json();
      console.log('📦 Data recibida:', data);

      let localesRaw = data.locales || [];

      // Normalizar: si son objetos {nombre: "..."}, extraer el nombre
      let todosLocales = localesRaw.map(l => {
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

      console.log('🏢 Todos los locales:', todosLocales);
      console.log('👤 User profile:', userProfile);

      // Filtrar locales según permisos del usuario
      if (userProfile.has_full_access) {
        // Admin ve todos los locales
        localesDisponibles = todosLocales;
        console.log('✅ Admin - mostrando todos los locales');
      } else if (userProfile.allowed_locales && userProfile.allowed_locales.length > 0) {
        // Usuario con permisos limitados: solo ve sus locales asignados
        localesDisponibles = todosLocales.filter(l => {
          return userProfile.allowed_locales.includes(l);
        });
        console.log('🔒 Usuario limitado - locales filtrados:', localesDisponibles);
      } else {
        // Sin permisos: no ve ningún local
        localesDisponibles = [];
        console.log('❌ Sin permisos - sin locales');
      }

      console.log('📋 Locales disponibles finales:', localesDisponibles);

      // Llenar select de filtro
      const filtroLocal = $('#filtroLocal');
      if (filtroLocal) {
        // Limpiar opciones existentes excepto la primera (placeholder)
        while (filtroLocal.options.length > 1) {
          filtroLocal.remove(1);
        }
        localesDisponibles.forEach(localNombre => {
          const option = document.createElement('option');
          option.value = localNombre;
          option.textContent = localNombre;
          filtroLocal.appendChild(option);
        });
        console.log('✅ Select de filtro actualizado con', localesDisponibles.length, 'locales');
      }

      // Llenar select del modal (solo locales permitidos para crear)
      const localSelect = $('#local');
      if (localSelect) {
        // Limpiar opciones existentes excepto la primera (placeholder)
        while (localSelect.options.length > 1) {
          localSelect.remove(1);
        }
        localesDisponibles.forEach(localNombre => {
          const option = document.createElement('option');
          option.value = localNombre;
          option.textContent = localNombre;
          localSelect.appendChild(option);
        });
        console.log('✅ Select del modal actualizado con', localesDisponibles.length, 'locales');
      }

    } catch (error) {
      console.error('❌ Error al cargar locales:', error);
      localesDisponibles = [];
    }
  }

  async function loadMediosPago() {
    try {
      console.log('🔍 Cargando medios de pago...');
      const response = await fetch('/api/medios_anticipos/activos');
      const data = await response.json();

      if (data.success) {
        mediosPagoDisponibles = data.medios || [];
        console.log('✅ Medios de pago cargados:', mediosPagoDisponibles);

        // Llenar select del modal
        const medioPagoSelect = $('#medioPagoId');
        if (medioPagoSelect) {
          // Limpiar opciones existentes
          medioPagoSelect.innerHTML = '<option value="">-- Seleccionar medio de pago --</option>';

          mediosPagoDisponibles.forEach(medio => {
            const option = document.createElement('option');
            option.value = medio.id;
            option.textContent = medio.nombre;
            medioPagoSelect.appendChild(option);
          });
          console.log('✅ Select de medio de pago actualizado con', mediosPagoDisponibles.length, 'medios');
        }
      } else {
        console.error('❌ Error al cargar medios de pago:', data.msg);
        mediosPagoDisponibles = [];
      }
    } catch (error) {
      console.error('❌ Error al cargar medios de pago:', error);
      mediosPagoDisponibles = [];
    }
  }

  function setupEventListeners() {
    $('#btnNuevoAnticipo')?.addEventListener('click', () => abrirModal());

    // Filtros con debounce para los inputs de texto
    let debounceTimer;
    const debounceFilter = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => loadAnticipos(), 300);
    };

    $('#filtroEstado')?.addEventListener('change', () => loadAnticipos());
    $('#filtroLocal')?.addEventListener('change', () => loadAnticipos());
    $('#filtroDivisa')?.addEventListener('change', () => loadAnticipos());
    $('#filtroFechaDesde')?.addEventListener('change', () => loadAnticipos());
    $('#filtroFechaHasta')?.addEventListener('change', () => loadAnticipos());
    $('#filtroCliente')?.addEventListener('input', debounceFilter);
    $('#filtroUsuario')?.addEventListener('input', debounceFilter);

    // Mostrar/ocultar campos de cotización para divisas extranjeras
    $('#divisa')?.addEventListener('change', function(e) {
      const camposCotizacion = $('#camposUSD'); // Mantener ID por compatibilidad
      const cotizacionInput = $('#cotizacionUSD');

      if (e.target.value !== 'ARS') {
        camposCotizacion.style.display = 'block';
        cotizacionInput.required = true;
        calcularEquivalencia();
      } else {
        camposCotizacion.style.display = 'none';
        cotizacionInput.required = false;
        $('#equivalenciaPesos').style.display = 'none';
      }
    });

    // Calcular equivalencia cuando cambian importe o cotización
    $('#importe')?.addEventListener('input', calcularEquivalencia);
    $('#cotizacionUSD')?.addEventListener('input', calcularEquivalencia);

    // Mostrar/ocultar campo caja según medio de pago
    $('#medioPagoId')?.addEventListener('change', function(e) {
      toggleCajaField();
    });

    // Cargar cajas cuando cambia el local
    $('#local')?.addEventListener('change', function(e) {
      loadCajasForLocal(e.target.value);
    });

    // Preview de imagen al seleccionar archivo
    $('#adjunto')?.addEventListener('change', function(e) {
      const file = e.target.files[0];
      const preview = $('#adjuntoPreview');
      const img = $('#adjuntoImg');

      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
          img.src = e.target.result;
          preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      } else if (file && file.type === 'application/pdf') {
        // Si es PDF, mostrar un ícono o texto
        img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VmNDQ0NCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iNDgiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+UERGJC90ZXh0Pjwvc3ZnPg==';
        preview.style.display = 'block';
      } else {
        preview.style.display = 'none';
      }
    });
  }

  function calcularEquivalencia() {
    const divisa = $('#divisa')?.value;
    const importe = parseFloat($('#importe')?.value || 0);
    const cotizacion = parseFloat($('#cotizacionUSD')?.value || 0);

    if (divisa !== 'ARS' && importe > 0 && cotizacion > 0) {
      const equivalente = importe * cotizacion;
      $('#montoCalculado').textContent = money(equivalente);
      $('#equivalenciaPesos').style.display = 'block';
    } else {
      $('#equivalenciaPesos').style.display = 'none';
    }
  }

  // Mostrar/ocultar campo caja y turno según si el medio de pago es "Efectivo"
  function toggleCajaField() {
    const medioPagoId = $('#medioPagoId')?.value;
    const cajaGroup = $('#cajaGroup');
    const cajaSelect = $('#caja');
    const turnoGroup = $('#turnoGroup');
    const turnoSelect = $('#turno');

    if (!medioPagoId || !cajaGroup || !cajaSelect) return;

    // Buscar el medio de pago seleccionado
    const medioSeleccionado = mediosPagoDisponibles.find(m => m.id == medioPagoId);

    if (medioSeleccionado && medioSeleccionado.es_efectivo === 1) {
      // Mostrar campo caja y hacerlo obligatorio
      cajaGroup.style.display = 'block';
      cajaSelect.required = true;

      // Mostrar campo turno SOLO si el local tiene múltiples turnos
      if (localTieneMultiplesTurnos && turnoGroup && turnoSelect) {
        turnoGroup.style.display = 'block';
        turnoSelect.required = true;
      }
    } else {
      // Ocultar campo caja y quitar obligatoriedad
      cajaGroup.style.display = 'none';
      cajaSelect.required = false;
      cajaSelect.value = ''; // Limpiar selección

      // Ocultar campo turno
      if (turnoGroup && turnoSelect) {
        turnoGroup.style.display = 'none';
        turnoSelect.required = false;
        turnoSelect.value = '';
      }
    }
  }

  // Cargar cajas y turnos disponibles para un local
  async function loadCajasForLocal(local) {
    const cajaSelect = $('#caja');
    const turnoSelect = $('#turno');
    const cajaGroup = $('#cajaGroup');
    const turnoGroup = $('#turnoGroup');

    // Si no hay local seleccionado, limpiar y ocultar campos
    if (!cajaSelect || !local) {
      if (cajaGroup) cajaGroup.style.display = 'none';
      if (turnoGroup) turnoGroup.style.display = 'none';
      if (cajaSelect) cajaSelect.innerHTML = '<option value="">Seleccione una caja</option>';
      if (turnoSelect) turnoSelect.innerHTML = '<option value="">Seleccione un turno</option>';
      localTieneMultiplesTurnos = false;
      return;
    }

    try {
      const response = await fetch(`/api/locales/${encodeURIComponent(local)}/cajas`);
      const data = await response.json();

      if (data.success && data.cajas) {
        // Limpiar opciones actuales de cajas
        cajaSelect.innerHTML = '<option value="">Seleccione una caja</option>';

        // Agregar cajas del local
        data.cajas.forEach(caja => {
          const option = document.createElement('option');
          option.value = caja;
          option.textContent = caja;
          cajaSelect.appendChild(option);
        });

        // Guardar si el local tiene múltiples turnos
        localTieneMultiplesTurnos = data.tiene_multiples_turnos || false;

        // Cargar opciones de turnos
        if (turnoSelect) {
          turnoSelect.innerHTML = '<option value="">Seleccione un turno</option>';

          if (localTieneMultiplesTurnos && data.turnos) {
            data.turnos.forEach(turno => {
              const option = document.createElement('option');
              option.value = turno;
              option.textContent = turno;
              turnoSelect.appendChild(option);
            });
          }
        }

        // Actualizar visibilidad de campos según medio de pago ya seleccionado
        // (solo mostrar si ya tienen Efectivo seleccionado)
        toggleCajaField();
      } else {
        console.error('Error al cargar cajas:', data.msg);
        cajaSelect.innerHTML = '<option value="">Error al cargar cajas</option>';
        if (cajaGroup) cajaGroup.style.display = 'none';
        if (turnoGroup) turnoGroup.style.display = 'none';
        localTieneMultiplesTurnos = false;
      }
    } catch (error) {
      console.error('Error al cargar cajas del local:', error);
      cajaSelect.innerHTML = '<option value="">Error al cargar cajas</option>';
      if (cajaGroup) cajaGroup.style.display = 'none';
      if (turnoGroup) turnoGroup.style.display = 'none';
      localTieneMultiplesTurnos = false;
    }
  }

  // ===== CARGAR ANTICIPOS =====
  async function loadAnticipos() {
    const tbody = $('#anticiposTableBody');
    if (!tbody) return;

    try {
      // Obtener filtros del servidor (backend)
      const estado = $('#filtroEstado')?.value || '';
      const local = $('#filtroLocal')?.value || '';
      const fechaDesde = $('#filtroFechaDesde')?.value || '';
      const fechaHasta = $('#filtroFechaHasta')?.value || '';

      // Construir URL con filtros del servidor
      let url = '/api/anticipos_recibidos/listar?';
      if (estado) url += `estado=${encodeURIComponent(estado)}&`;
      if (local) url += `local=${encodeURIComponent(local)}&`;
      if (fechaDesde) url += `fecha_desde=${encodeURIComponent(fechaDesde)}&`;
      if (fechaHasta) url += `fecha_hasta=${encodeURIComponent(fechaHasta)}&`;

      const response = await fetch(url);
      const data = await response.json();

      if (!data.success) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: #ef4444;">Error al cargar anticipos</td></tr>';
        return;
      }

      anticiposData = data.anticipos || [];

      // Filtros adicionales del lado del cliente
      const filtroCliente = ($('#filtroCliente')?.value || '').toLowerCase();
      const filtroDivisa = $('#filtroDivisa')?.value || '';
      const filtroUsuario = ($('#filtroUsuario')?.value || '').toLowerCase();

      let anticiposFiltrados = anticiposData;

      // Aplicar filtros del cliente
      if (filtroCliente) {
        anticiposFiltrados = anticiposFiltrados.filter(a =>
          (a.cliente || '').toLowerCase().includes(filtroCliente)
        );
      }

      if (filtroDivisa) {
        anticiposFiltrados = anticiposFiltrados.filter(a =>
          (a.divisa || 'ARS') === filtroDivisa
        );
      }

      if (filtroUsuario) {
        anticiposFiltrados = anticiposFiltrados.filter(a =>
          (a.created_by || '').toLowerCase().includes(filtroUsuario)
        );
      }

      // Actualizar estadísticas con datos filtrados
      updateStats(anticiposFiltrados);

      if (anticiposFiltrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: #6b7280;">No hay anticipos para mostrar</td></tr>';
        return;
      }

      tbody.innerHTML = anticiposFiltrados.map(a => {
        const badgeClass = `badge-${a.estado}`;
        const estadoText = {
          'pendiente': 'Pendiente',
          'consumido': 'Consumido',
          'eliminado_global': 'Eliminado'
        }[a.estado] || a.estado;

        // Determinar si puede editar/eliminar según permisos del usuario y estado del anticipo
        const puedeEditar = a.estado === 'pendiente' && userProfile.can_edit;
        const puedeEliminar = a.estado === 'pendiente' && userProfile.can_delete;

        return `
          <tr>
            <td>${formatDate(a.fecha_pago)}</td>
            <td>${formatDate(a.fecha_evento)}</td>
            <td>${a.cliente}</td>
            <td>${a.local}</td>
            <td style="text-align:right; font-weight:600;">
              ${a.divisa !== 'ARS' && a.cotizacion_divisa ? `
                <div style="font-size:13px; color:#059669;">${a.divisa} ${fmt.format(a.importe)}</div>
                <div style="font-size:11px; color:#6b7280;">Tomado: $${fmt.format(a.cotizacion_divisa)}</div>
                <div style="font-size:12px; color:#374151;">${money(a.importe * a.cotizacion_divisa)}</div>
              ` : `
                <span style="font-size:11px; color:#6b7280; display:block;">${a.divisa || 'ARS'}</span>
                ${money(a.importe)}
              `}
            </td>
            <td>${a.medio_pago || '-'}</td>
            <td>${a.created_by || '-'}</td>
            <td><span class="badge ${badgeClass}">${estadoText}</span></td>
            <td>
              ${a.tiene_adjunto ? `<button class="btn-edit" onclick="verAdjunto(${a.id})" title="Ver comprobante">📎</button>` : ''}
              ${puedeEditar ? `<button class="btn-edit" onclick="editarAnticipo(${a.id})" title="Editar fecha">✏️</button>` : ''}
              ${puedeEliminar ? `<button class="btn-delete" onclick="eliminarAnticipo(${a.id}, '${a.cliente}')" title="Eliminar">🗑️</button>` : ''}
              <button class="btn-edit" onclick="verDetalles(${a.id})" title="Ver detalles">👁️</button>
            </td>
          </tr>
        `;
      }).join('');

    } catch (error) {
      console.error('Error al cargar anticipos:', error);
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: #ef4444;">Error de red</td></tr>';
    }
  }

  function updateStats(anticipos) {
    const pendientes = anticipos.filter(a => a.estado === 'pendiente');
    const consumidos = anticipos.filter(a => a.estado === 'consumido');
    const eliminados = anticipos.filter(a => a.estado === 'eliminado_global');

    // Calcular monto pendiente: divisas extranjeras usan cotización, ARS usa importe directo
    const montoPendiente = pendientes.reduce((sum, a) => {
      const importe = parseFloat(a.importe || 0);
      if (a.divisa !== 'ARS' && a.cotizacion_divisa) {
        return sum + (importe * parseFloat(a.cotizacion_divisa));
      }
      return sum + importe;
    }, 0);

    $('#statPendientes').textContent = pendientes.length;
    $('#statConsumidos').textContent = consumidos.length;
    $('#statEliminados').textContent = eliminados.length;
    $('#statMontoPendiente').textContent = money(montoPendiente);
  }

  function toInputDateFormat(dateString) {
    // Convierte cualquier formato de fecha a YYYY-MM-DD para <input type="date">
    if (!dateString || dateString === 'null' || dateString === 'undefined') return '';
    try {
      let dateStr = String(dateString);

      // Si viene con 'T', extraer solo la parte de fecha
      if (dateStr.includes('T')) {
        dateStr = dateStr.split('T')[0];
      }

      // Si viene con espacios, extraer solo la parte de fecha
      if (dateStr.includes(' ')) {
        dateStr = dateStr.split(' ')[0];
      }

      // Verificar que sea un formato válido YYYY-MM-DD
      const parts = dateStr.split('-');
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        return dateStr; // Ya está en formato correcto
      }

      return '';
    } catch {
      return '';
    }
  }

  function formatDate(dateString) {
    if (!dateString || dateString === 'null' || dateString === 'undefined') return '-';
    try {
      // Manejar diferentes formatos de fecha
      let dateStr = String(dateString);

      // Si viene con 'T', extraer solo la parte de fecha
      if (dateStr.includes('T')) {
        dateStr = dateStr.split('T')[0];
      }

      // Si viene con espacios, extraer solo la parte de fecha
      if (dateStr.includes(' ')) {
        dateStr = dateStr.split(' ')[0];
      }

      // Verificar que tengamos una fecha válida en formato YYYY-MM-DD
      const parts = dateStr.split('-');
      if (parts.length !== 3) return '-';

      const [year, month, day] = parts;

      // Validar que las partes sean números válidos
      if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
        return '-';
      }

      return `${day}/${month}/${year}`;
    } catch {
      return '-';
    }
  }

  // ===== MODAL =====
  window.abrirModal = function(anticipoId = null) {
    const modal = $('#modalAnticipo');
    const title = $('#modalTitle');

    // Limpiar formulario
    $('#anticipoId').value = '';
    $('#fechaPago').value = '';
    $('#fechaEvento').value = '';
    $('#cliente').value = '';
    $('#local').value = '';
    $('#caja').value = '';
    $('#importe').value = '';
    $('#numeroTransaccion').value = '';
    $('#observaciones').value = '';
    $('#divisa').value = 'ARS';

    // Resetear medio de pago (dejar en placeholder)
    const medioPagoSelect = $('#medioPagoId');
    if (medioPagoSelect) {
      medioPagoSelect.selectedIndex = 0; // Selecciona "-- Seleccionar medio de pago --"
    }

    // Ocultar campo caja inicialmente (se mostrará si selecciona Efectivo)
    const cajaGroup = $('#cajaGroup');
    if (cajaGroup) cajaGroup.style.display = 'none';

    // Ocultar campo turno inicialmente y limpiar
    const turnoGroup = $('#turnoGroup');
    const turnoSelect = $('#turno');
    if (turnoGroup) turnoGroup.style.display = 'none';
    if (turnoSelect) {
      turnoSelect.value = '';
      turnoSelect.required = false;
    }

    // Limpiar preview de adjunto
    const adjuntoInput = $('#adjunto');
    if (adjuntoInput) adjuntoInput.value = '';
    const preview = $('#adjuntoPreview');
    if (preview) preview.style.display = 'none';

    if (anticipoId) {
      title.textContent = 'Editar Anticipo';
      loadAnticipoData(anticipoId);
    } else {
      title.textContent = 'Nuevo Anticipo';
      // Setear fecha de pago a hoy por defecto
      const today = new Date().toISOString().split('T')[0];
      $('#fechaPago').value = today;
    }

    modal.classList.add('active');
  };

  async function loadAnticipoData(anticipoId) {
    const anticipo = anticiposData.find(a => a.id === anticipoId);
    if (!anticipo) return;

    $('#anticipoId').value = anticipo.id;
    // Formatear fechas para input type="date" (requiere YYYY-MM-DD)
    $('#fechaPago').value = toInputDateFormat(anticipo.fecha_pago);
    $('#fechaEvento').value = toInputDateFormat(anticipo.fecha_evento);
    $('#cliente').value = anticipo.cliente;
    $('#local').value = anticipo.local;
    $('#importe').value = anticipo.importe;
    $('#divisa').value = anticipo.divisa || 'ARS';
    $('#medioPagoId').value = anticipo.medio_pago_id || '';
    $('#numeroTransaccion').value = anticipo.numero_transaccion || '';
    $('#observaciones').value = anticipo.observaciones || '';

    // Cargar cajas del local y setear el valor después
    await loadCajasForLocal(anticipo.local);
    $('#caja').value = anticipo.caja || '';

    // Mostrar/ocultar campo caja según el medio de pago
    toggleCajaField();

    // Solo permitir editar fecha_evento y observaciones si es edición
    $('#fechaPago').disabled = true;
    $('#cliente').disabled = true;
    $('#local').disabled = true;
    $('#caja').disabled = true;
    $('#importe').disabled = true;
    $('#divisa').disabled = true;
    $('#medioPagoId').disabled = true;
    $('#numeroTransaccion').disabled = true;

    // Ocultar el input de adjunto en modo edición (no se puede cambiar)
    const adjuntoGroup = $('#adjunto')?.closest('.form-group');
    if (adjuntoGroup) adjuntoGroup.style.display = 'none';
  }

  window.cerrarModal = function() {
    const modal = $('#modalAnticipo');
    modal?.classList.remove('active');

    // Rehabilitar todos los campos
    $('#fechaPago').disabled = false;
    $('#cliente').disabled = false;
    $('#local').disabled = false;
    $('#caja').disabled = false;
    $('#importe').disabled = false;
    $('#divisa').disabled = false;
    $('#medioPagoId').disabled = false;
    $('#numeroTransaccion').disabled = false;

    // Mostrar el input de adjunto
    const adjuntoGroup = $('#adjunto')?.closest('.form-group');
    if (adjuntoGroup) adjuntoGroup.style.display = '';
  };

  // ===== GUARDAR ANTICIPO =====
  window.guardarAnticipo = async function(event) {
    event.preventDefault();

    const anticipoId = $('#anticipoId').value;
    const isEdit = !!anticipoId;

    // Si es creación, validar y subir adjunto primero
    let adjuntoPath = null;
    if (!isEdit) {
      const adjuntoFile = $('#adjunto').files[0];
      if (!adjuntoFile) {
        alert('⚠️  Debés subir un comprobante del anticipo');
        return;
      }

      // Subir adjunto
      try {
        // IMPORTANTE: Generar ID temporal único para evitar colisiones
        // Usamos timestamp + random para garantizar unicidad entre usuarios concurrentes
        const tempEntityId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const formData = new FormData();
        formData.append('files[]', adjuntoFile);
        formData.append('tab', 'anticipos');
        formData.append('local', $('#local').value);
        formData.append('caja', 'admin');
        formData.append('turno', 'dia');
        formData.append('fecha', $('#fechaPago').value);
        formData.append('entity_type', 'anticipo_recibido_temp'); // marcamos como temporal
        formData.append('entity_id', tempEntityId); // ID único temporal

        const uploadRes = await fetch('/files/upload', {
          method: 'POST',
          body: formData
        });

        const uploadData = await uploadRes.json();
        if (!uploadData.success) {
          alert('❌ Error subiendo comprobante: ' + uploadData.msg);
          return;
        }

        adjuntoPath = uploadData.items[0].path;

        // Guardar el tempEntityId para vinculación posterior (se usará después al crear el objeto data)
        window._tempEntityIdForAnticipo = tempEntityId;
      } catch (error) {
        console.error('Error al subir adjunto:', error);
        alert('❌ Error al subir el comprobante');
        return;
      }
    }

    const data = {
      fecha_pago: $('#fechaPago').value,
      fecha_evento: $('#fechaEvento').value,
      cliente: $('#cliente').value,
      local: $('#local').value,
      importe: $('#importe').value,  // Enviar como string para evitar pérdida de precisión
      divisa: $('#divisa').value,
      medio_pago_id: parseInt($('#medioPagoId').value) || null,
      numero_transaccion: $('#numeroTransaccion').value.trim() || null,
      observaciones: $('#observaciones').value.trim() || null
    };

    // Agregar caja solo si hay un valor seleccionado
    const cajaValue = $('#caja').value;
    if (cajaValue) {
      data.caja = cajaValue;
    }

    // Agregar turno solo si hay un valor seleccionado
    const turnoValue = $('#turno').value;
    if (turnoValue) {
      data.turno = turnoValue;
    }

    // Vincular tempEntityId si existe (para vinculación precisa de imagen)
    if (window._tempEntityIdForAnticipo) {
      data.temp_entity_id = window._tempEntityIdForAnticipo;
      delete window._tempEntityIdForAnticipo; // limpiar para próximo uso
    }

    // Agregar cotización de divisa si no es ARS
    if ($('#divisa').value !== 'ARS') {
      const cotizacionStr = $('#cotizacionUSD').value;
      const cotizacion = parseFloat(cotizacionStr);
      if (!cotizacion || cotizacion <= 0) {
        alert('⚠️  Debés ingresar la cotización de la divisa');
        return;
      }
      data.cotizacion_divisa = cotizacionStr;  // Enviar como string para evitar pérdida de precisión
    }

    // Agregar adjunto si existe
    if (adjuntoPath) {
      data.adjunto_gcs_path = adjuntoPath;
    }

    // Validaciones básicas
    if (!data.fecha_pago || !data.fecha_evento || !data.cliente || !data.local || !data.importe) {
      alert('Por favor completá todos los campos requeridos');
      return;
    }

    // Validar caja solo si el medio de pago es efectivo
    const medioSeleccionado = mediosPagoDisponibles.find(m => m.id == data.medio_pago_id);
    if (medioSeleccionado && medioSeleccionado.es_efectivo === 1 && !data.caja) {
      alert('⚠️  Debés seleccionar la caja que recibió el efectivo');
      return;
    }

    // Validar turno solo si el campo turno está visible y es requerido
    const turnoGroup = $('#turnoGroup');
    const turnoSelect = $('#turno');
    if (turnoGroup && turnoGroup.style.display !== 'none' && turnoSelect.required && !data.turno) {
      alert('⚠️  Debés seleccionar el turno en que se recibió el anticipo');
      return;
    }

    // Validar que el importe sea un número válido mayor a cero
    const importeNum = parseFloat(data.importe);
    if (isNaN(importeNum) || importeNum <= 0) {
      alert('El importe debe ser mayor a cero');
      return;
    }

    try {
      let url, method;
      if (isEdit) {
        url = `/api/anticipos_recibidos/editar/${anticipoId}`;
        method = 'PUT';
        // Solo enviar campos editables
        delete data.fecha_pago;
        delete data.cliente;
        delete data.local;
        delete data.caja;
        delete data.importe;
        delete data.divisa;
        delete data.medio_pago_id;
        delete data.numero_transaccion;
        delete data.adjunto_gcs_path;
      } else {
        url = '/api/anticipos_recibidos/crear';
        method = 'POST';
      }

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (result.success) {
        alert(`✅ ${result.msg}`);
        cerrarModal();
        await loadAnticipos();
      } else {
        alert(`❌ Error: ${result.msg || 'No se pudo guardar el anticipo'}`);
      }
    } catch (error) {
      console.error('Error al guardar anticipo:', error);
      alert('❌ Error de red al guardar anticipo');
    }
  };

  // ===== EDITAR ANTICIPO =====
  window.editarAnticipo = function(anticipoId) {
    abrirModal(anticipoId);
  };

  // ===== ELIMINAR ANTICIPO =====
  window.eliminarAnticipo = async function(anticipoId, cliente) {
    const confirmacion1 = confirm(`⚠️ ¿Estás seguro que querés eliminar el anticipo de "${cliente}"?`);
    if (!confirmacion1) return;

    const confirmacion2 = confirm(`⚠️ ATENCIÓN: Esta acción NO SE PUEDE DESHACER.\n\n¿Confirmas que querés eliminar definitivamente este anticipo?`);
    if (!confirmacion2) return;

    try {
      const response = await fetch(`/api/anticipos_recibidos/eliminar/${anticipoId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ ${data.msg}`);
        await loadAnticipos();
      } else {
        alert(`❌ Error: ${data.msg || 'No se pudo eliminar el anticipo'}`);
      }
    } catch (error) {
      console.error('Error al eliminar anticipo:', error);
      alert('❌ Error de red al eliminar anticipo');
    }
  };

  // ===== VER DETALLES =====
  window.verDetalles = function(anticipoId) {
    const anticipo = anticiposData.find(a => a.id === anticipoId);
    if (!anticipo) return;

    const detalles = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 DETALLES DEL ANTICIPO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cliente: ${anticipo.cliente}
Local: ${anticipo.local}
Importe: ${money(anticipo.importe)}

Fecha de Pago: ${formatDate(anticipo.fecha_pago)}
Fecha de Evento: ${formatDate(anticipo.fecha_evento)}

Medio de Pago: ${anticipo.medio_pago || '-'}
Nº Transacción: ${anticipo.numero_transaccion || '-'}

Estado: ${anticipo.estado}

Observaciones:
${anticipo.observaciones || 'Sin observaciones'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Creado por: ${anticipo.created_by}
Fecha creación: ${formatDateTime(anticipo.created_at)}
${anticipo.updated_by ? `\nÚltima actualización: ${formatDateTime(anticipo.updated_at)} por ${anticipo.updated_by}` : ''}
${anticipo.deleted_by ? `\nEliminado: ${formatDateTime(anticipo.deleted_at)} por ${anticipo.deleted_by}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `;

    alert(detalles);
  };

  function formatDateTime(dateString) {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('es-AR');
    } catch {
      return dateString;
    }
  }

  // ===== VER ADJUNTO =====
  window.verAdjunto = async function(anticipoId) {
    const anticipo = anticiposData.find(a => a.id === anticipoId);
    if (!anticipo) return;

    if (!anticipo.tiene_adjunto) {
      alert('Este anticipo no tiene comprobante adjunto');
      return;
    }

    // Abrir modal visor
    const modal = $('#modalVisorAdjunto');
    const visorImagen = $('#visorImagen');
    const visorPDF = $('#visorPDF');
    const visorLoading = $('#visorLoading');
    const visorTitulo = $('#visorTitulo');

    // Resetear estados
    visorImagen.style.display = 'none';
    visorPDF.style.display = 'none';
    visorLoading.style.display = 'block';
    visorImagen.src = '';
    visorPDF.src = '';

    modal.style.display = 'flex';
    visorTitulo.textContent = `Comprobante - ${anticipo.cliente}`;

    try {
      // Obtener detalles del adjunto desde el servidor
      const response = await fetch(`/files/list?tab=anticipos&local=${encodeURIComponent(anticipo.local)}&fecha=${anticipo.fecha_pago}&scope=month`);
      const data = await response.json();

      if (data.success && data.items && data.items.length > 0) {
        const adjunto = data.items[0];
        const isPDF = adjunto.mime === 'application/pdf' || adjunto.original_name?.toLowerCase().endsWith('.pdf');

        visorLoading.style.display = 'none';

        if (isPDF) {
          // Mostrar PDF en iframe
          visorPDF.src = adjunto.view_url;
          visorPDF.style.display = 'block';
        } else {
          // Mostrar imagen
          visorImagen.src = adjunto.view_url;
          visorImagen.style.display = 'block';
        }
      } else {
        visorLoading.innerHTML = '<div style="color: #ef4444;">❌ No se pudo encontrar el comprobante</div>';
      }
    } catch (error) {
      console.error('Error al obtener adjunto:', error);
      visorLoading.innerHTML = '<div style="color: #ef4444;">❌ Error al cargar el comprobante</div>';
    }
  };

  window.cerrarVisorAdjunto = function() {
    const modal = $('#modalVisorAdjunto');
    modal.style.display = 'none';

    // Limpiar contenido
    $('#visorImagen').src = '';
    $('#visorPDF').src = '';
  };

})();
