// static/js/reportes2.js
// Last updated: 2025-03-30 18:48:15
// Current user: pomenuk

document.addEventListener('DOMContentLoaded', function() {
    // Variables globales para almacenar filtros
    let currentFilters = {};

    // Intentar cargar filtros guardados al iniciar la página
    try {
        const savedFilters = localStorage.getItem('pendientesFilters');
        if (savedFilters) {
            currentFilters = JSON.parse(savedFilters);
        }
    } catch (e) {
        console.error('Error cargando filtros guardados:', e);
        localStorage.removeItem('pendientesFilters');
        currentFilters = {};
    }
    
    // Definir todas las zonas disponibles
    const ZONAS_DISPONIBLES = [
        'CONSTITUCION',
        'ZONA SUR',
        'GASTRONOMIA',
        'KIOSCOS',
        'BIMBO',
        'RETIRO',
        'TBA',
        'AMBULANTE',
        'ONCE'
    ];
    
    // Configuración del modal
    const modalElement = document.getElementById('editModal');
    if (modalElement) {
        modalElement.addEventListener('show.bs.modal', function () {
            document.body.style.paddingRight = '0';
        });
        
        modalElement.addEventListener('hidden.bs.modal', function () {
            document.body.style.paddingRight = '0';
            document.body.style.overflow = 'scroll';
        });
    }

    // Inicializar Select2 para el formulario principal
    $('.select2').select2({
        width: '100%',
        language: 'es',
        placeholder: 'Seleccionar...',
        allowClear: true
    });

    // Si hay zona pre-cargada, actualizar las etiquetas disponibles
    if ($('#zona').val()) {
        const zona = $('#zona').val();
        const $etiqueta = $('#etiqueta');
        
        if (zona && ETIQUETAS_POR_ZONA[zona]) {
            // Habilitar el select de etiquetas
            $etiqueta.prop('disabled', false);
            
            // Si no hay etiqueta pre-cargada, cargar todas las opciones
            if (!$etiqueta.val()) {
                // Limpiar etiquetas excepto la opción vacía
                $etiqueta.find('option:not([value=""])').remove();
                
                // Agregar las etiquetas correspondientes a la zona
                ETIQUETAS_POR_ZONA[zona].forEach(etiqueta => {
                    $etiqueta.append(`<option value="${etiqueta}">${etiqueta}</option>`);
                });
                
                // Actualizar Select2
                $etiqueta.trigger('change');
            }
        }
    }

    // Inicializar Flatpickr para campos de fecha
    flatpickr(".flatpickr", {
        locale: "es",
        dateFormat: "Y-m-d",
        allowInput: true,
        maxDate: "today",
        disableMobile: "true"
    });

    // Variables para el gráfico
    let barChart = null;

    // Funciones de utilidad
    function validarEtiquetaZona(etiqueta, zona) {
        if (!etiqueta || !zona) return false;
        if (!ETIQUETAS_POR_ZONA[zona]) return false;
        return ETIQUETAS_POR_ZONA[zona].includes(etiqueta);
    }

    // Función para formatear fecha
    function formatearFecha(fechaStr) {
        try {
            const fecha = new Date(fechaStr + 'T00:00:00');
            return fecha.toLocaleDateString('es-AR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        } catch (e) {
            console.error('Error al formatear fecha:', e);
            return fechaStr;
        }
    }

    // Función para inicializar Select2 en el modal
    function initModalSelect2() {
        const $etiqueta = $('#editEtiqueta');
        const $zona = $('#editZona');

        // Limpiar instancias previas
        if ($etiqueta.data('select2')) $etiqueta.select2('destroy');
        if ($zona.data('select2')) $zona.select2('destroy');

        // Reinicializar el select de zona
        $zona.empty().append('<option value="">Seleccione una zona</option>');
        ZONAS_DISPONIBLES.forEach(zona => {
            $zona.append(new Option(zona, zona, false, false));
        });

        // Inicializar Select2 para zona
        $zona.select2({
            width: '100%',
            language: 'es',
            placeholder: 'Seleccionar zona...',
            allowClear: true,
            dropdownParent: $('#editModal')
        });

        function cargarEtiquetasParaZona(zona, etiquetaSeleccionada = '') {
            $etiqueta.empty().append('<option value="">Seleccione una etiqueta</option>');
            
            if (zona && ETIQUETAS_POR_ZONA[zona]) {
                ETIQUETAS_POR_ZONA[zona].forEach(etiqueta => {
                    $etiqueta.append(new Option(etiqueta, etiqueta, false, etiqueta === etiquetaSeleccionada));
                });
            }

            if ($etiqueta.data('select2')) $etiqueta.select2('destroy');
            
            $etiqueta.select2({
                width: '100%',
                language: 'es',
                placeholder: 'Seleccionar etiqueta...',
                allowClear: true,
                dropdownParent: $('#editModal')
            });

            if (etiquetaSeleccionada) {
                $etiqueta.val(etiquetaSeleccionada).trigger('change');
            }
        }

        // Eventos de cambio
        $zona.on('change', function() {
            const zona = $(this).val();
            const etiquetaActual = $etiqueta.val();
            cargarEtiquetasParaZona(zona, etiquetaActual);

            if (etiquetaActual && zona && !validarEtiquetaZona(etiquetaActual, zona)) {
                $etiqueta.val(null).trigger('change');
                Swal.fire({
                    title: 'Atención',
                    text: 'La etiqueta seleccionada no corresponde a esta zona',
                    icon: 'warning',
                    confirmButtonText: 'Entendido'
                });
            }
        });

        $etiqueta.on('change', function() {
            const etiqueta = $(this).val();
            const zona = $zona.val();
            
            if (zona && etiqueta && !validarEtiquetaZona(etiqueta, zona)) {
                $(this).val(null).trigger('change');
                Swal.fire({
                    title: 'Error',
                    text: 'La etiqueta seleccionada no corresponde a esta zona',
                    icon: 'error',
                    confirmButtonText: 'Entendido'
                });
            }
        });
    }

    // Función para cargar el gráfico de barras
    function loadBarChart(data) {
        const ctx = document.getElementById('zonasBarChart').getContext('2d');
        if (barChart) barChart.destroy();

        barChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(data),
                datasets: [{
                    label: 'Casos por Zona',
                    data: Object.values(data),
                    backgroundColor: [
                        '#4CAF50', '#2196F3', '#FFC107', '#9C27B0',
                        '#F44336', '#00BCD4', '#795548', '#FF9800', '#607D8B'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Casos: ${context.raw}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    }
    
    // Función para restaurar los filtros guardados al formulario
    function restoreFiltersToForm() {
        const form = document.getElementById('searchForm');
        
        // Aplicar cada filtro guardado al formulario
        Object.keys(currentFilters).forEach(key => {
            const input = form.querySelector(`[name="${key}"]`);
            if (input) {
                // Diferentes tipos de inputs requieren diferentes métodos
                if (input.tagName === 'SELECT') {
                    // Para select normal
                    input.value = currentFilters[key];
                    
                    // Para select2, si está inicializado
                    if ($(input).data('select2')) {
                        $(input).val(currentFilters[key]).trigger('change');
                    }
                } else if (input.classList.contains('flatpickr-input') && input._flatpickr) {
                    // Para flatpickr
                    input._flatpickr.setDate(currentFilters[key]);
                } else {
                    // Para inputs normales
                    input.value = currentFilters[key];
                }
            }
        });
        
        console.log('Filtros restaurados:', currentFilters);
    }
    
        // Función para cargar resultados en la tabla
        async function loadResults(filters = {}) {
            try {
                console.log('Iniciando carga de resultados con filtros:', filters);
                const queryParams = new URLSearchParams(filters).toString();
                const response = await fetch(`/api/pendientes/lista?${queryParams}`);
                
                if (!response.ok) {
                    throw new Error('Error al obtener los datos');
                }
    
                const data = await response.json();
                console.log('Datos recibidos:', data);
    
                const tbody = document.querySelector('#resultsTable tbody');
                tbody.innerHTML = '';
    
                if (!data || data.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="13" class="text-center">No se encontraron registros</td>
                        </tr>`;
                    return;
                }
    
                data.forEach(item => {
                    const row = document.createElement('tr');
                    const id = item.id || '';
                    const fecha = item.fecha ? formatearFecha(item.fecha) : '';
                    
                    row.setAttribute('data-id', id);
                    row.innerHTML = `
                        <td>${fecha}</td>
                        <td>${item.usuario || ''}</td>
                        <td>${item.etiqueta || ''}</td>
                        <td>${item.zona || ''}</td>
                        <td>${item.comision || ''}</td>
                        <td>${item.turno || ''}</td>
                        <td>${item.fc || ''}</td>
                        <td>${item.pl || ''}</td>
                        <td>${item.transferencia || ''}</td>
                        <td>${item.boletaRosa || ''}</td>
                        <td>${item.observaciones || ''}</td>
                        <td>
                            <span class="badge ${item.estado === 'PENDIENTE' ? 'bg-warning' : 'bg-success'}">
                                ${item.estado || 'PENDIENTE'}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-sm btn-primary edit-btn" 
                                    data-id="${id}"
                                    data-bs-toggle="modal" 
                                    data-bs-target="#editModal">
                                Editar
                            </button>
                        </td>
                    `;
                    tbody.appendChild(row);
                });
    
                // Agregar event listeners a los botones de editar
                document.querySelectorAll('.edit-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        console.log('Botón editar clickeado:', e.target);
                        console.log('ID del registro:', e.target.dataset.id);
                        openEditModal(e.target.dataset.id);
                    });
                });
    
            } catch (error) {
                console.error('Error cargando resultados:', error);
                Swal.fire({
                    title: 'Error',
                    text: 'Error al cargar los resultados: ' + error.message,
                    icon: 'error'
                });
            }
        }
    
        async function openEditModal(id) {
            try {
                console.log('Intentando abrir modal para ID:', id);
                
                Swal.fire({
                    title: 'Cargando...',
                    text: 'Por favor espere',
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });
    
                const response = await fetch(`/api/pendientes/${id}`);
                const data = await response.json();
    
                if (!response.ok || data.error) {
                    throw new Error(data.error || 'Error al obtener los datos del registro');
                }
    
                console.log('Datos recibidos:', data);
    
                // Resetear el formulario y establecer el ID
                const form = document.getElementById('editForm');
                form.reset();
                document.getElementById('editId').value = id;
    
                // Inicializar el modal
                const modalElement = document.getElementById('editModal');
                console.log('Modal element:', modalElement);
                
                const modal = new bootstrap.Modal(modalElement);
                console.log('Modal instance:', modal);
                
                // Mostrar el modal
                modal.show();
    
                // Cuando el modal se muestre completamente
                modalElement.addEventListener('shown.bs.modal', function onModalShown() {
                    try {
                        // Inicializar Select2 y otros componentes
                        initModalSelect2();
    
                        // Configurar Flatpickr para el campo de fecha
                        const fechaInput = document.getElementById('editFecha');
                        if (fechaInput) {
                            if (fechaInput._flatpickr) {
                                fechaInput._flatpickr.destroy();
                            }
                            
                            flatpickr(fechaInput, {
                                locale: "es",
                                dateFormat: "Y-m-d",
                                defaultDate: data.fecha,
                                allowInput: true,
                                maxDate: "today",
                                disableMobile: "true"
                            });
                        }
    
                        // Establecer valores
                        setTimeout(() => {
                            // Establecer zona primero
                            if (data.zona) {
                                const $zona = $('#editZona');
                                $zona.val(data.zona).trigger('change');
    
                                // Esperar a que la zona se establezca antes de la etiqueta
                                setTimeout(() => {
                                    if (data.etiqueta) {
                                        const $etiqueta = $('#editEtiqueta');
                                        $etiqueta.val(data.etiqueta).trigger('change');
                                    }
                                }, 100);
                            }
    
                            // Establecer otros campos
                            Object.keys(data).forEach(key => {
                                const input = form.querySelector(`[name="${key}"]`);
                                if (input && !['zona', 'etiqueta', 'fecha'].includes(key)) {
                                    if (input.type === 'select-one') {
                                        $(input).val(data[key]).trigger('change');
                                    } else {
                                        input.value = data[key];
                                    }
                                }
                            });
                        }, 100);
    
                        Swal.close();
                    } catch (error) {
                        console.error('Error configurando el modal:', error);
                        Swal.fire({
                            title: 'Error',
                            text: 'Error al configurar el formulario',
                            icon: 'error'
                        });
                    }
    
                    // Remover el listener después de usarlo
                    modalElement.removeEventListener('shown.bs.modal', onModalShown);
                });
    
            } catch (error) {
                console.error('Error abriendo modal:', error);
                Swal.fire({
                    title: 'Error',
                    text: error.message || 'Error al cargar los datos del registro',
                    icon: 'error',
                    confirmButtonText: 'Aceptar'
                });
            }
        }
    
        // Event listeners para el modal
        $('#editModal').on('hidden.bs.modal', function () {
            try {
                // Resetear el formulario
                const form = document.getElementById('editForm');
                form.reset();
                
                // Destruir las instancias de Select2
                ['#editEtiqueta', '#editZona'].forEach(selector => {
                    const $element = $(selector);
                    if ($element.data('select2')) $element.select2('destroy');
                });
                
                // Destruir la instancia de Flatpickr
                const fechaInput = document.getElementById('editFecha');
                if (fechaInput && fechaInput._flatpickr) {
                    fechaInput._flatpickr.destroy();
                }
                
                // Remover clases de validación
                $('.is-invalid').removeClass('is-invalid');
    
                // Limpiar backdrops residuales
                $('.modal-backdrop').remove();
                $('body').removeClass('modal-open');
                $('body').css('padding-right', '');
                
                // Asegurar que el scroll esté habilitado
                document.body.style.overflow = 'auto';
            } catch (error) {
                console.error('Error limpiando el modal:', error);
            }
        });
    
        // Agregar el manejador para el botón de guardar
        document.getElementById('saveEdit').addEventListener('click', async function() {
            try {
                // Validaciones
                const zona = $('#editZona').val();
                const etiqueta = $('#editEtiqueta').val();
                const fecha = $('#editFecha').val();
    
                if (!fecha) {
                    throw new Error('Debe seleccionar una fecha');
                }
    
                if (!zona) {
                    throw new Error('Debe seleccionar una zona');
                }
    
                if (!etiqueta) {
                    throw new Error('Debe seleccionar una etiqueta');
                }
    
                if (!validarEtiquetaZona(etiqueta, zona)) {
                    throw new Error('La etiqueta seleccionada no corresponde a esta zona');
                }
    
                // Mostrar loading
                Swal.fire({
                    title: 'Guardando...',
                    text: 'Por favor espere',
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });
    
                // Preparar datos
                const form = document.getElementById('editForm');
                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());
    
                // Asegurarse de que la fecha esté en el formato correcto
                if (data.fecha) {
                    const fechaObj = new Date(data.fecha + 'T00:00:00');
                    if (isNaN(fechaObj.getTime())) {
                        throw new Error('Fecha inválida');
                    }
                }
    
                // Enviar actualización
                const response = await fetch('/api/pendientes/update', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data)
                });
    
                const result = await response.json();
    
                if (result.status === 'success') {
                    try {
                        // Cerrar modal
                        const modalElement = document.getElementById('editModal');
                        const modalInstance = bootstrap.Modal.getInstance(modalElement);
                        
                        // Ocultar el modal
                        modalInstance.hide();
                        
                        // Limpiar backdrops y clases residuales
                        setTimeout(() => {
                            $('.modal-backdrop').remove();
                            $('body').removeClass('modal-open');
                            $('body').css('padding-right', '');
                            document.body.style.overflow = 'auto';
                        }, 150);
                        
                        // Recargar datos con filtros guardados
                        if (Object.keys(currentFilters).length > 0) {
                            await loadResults(currentFilters);
                        } else {
                            await loadInitialData();
                        }
                
                        // Mostrar mensaje de éxito
                        await Swal.fire({
                            title: '¡Éxito!',
                            text: 'Registro actualizado correctamente',
                            icon: 'success',
                            timer: 2000,
                            showConfirmButton: false
                        });
                    } catch (error) {
                        console.error('Error cerrando el modal:', error);
                    }
                }
            } catch (error) {
                console.error('Error actualizando registro:', error);
                Swal.fire({
                    title: 'Error',
                    text: error.message,
                    icon: 'error',
                    confirmButtonText: 'Aceptar'
                });
            }
        });
    
        // Event listener para el formulario de búsqueda
        document.getElementById('searchForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            const filters = Object.fromEntries(formData.entries());
            
            // Eliminar filtros vacíos
            Object.keys(filters).forEach(key => {
                if (!filters[key]) delete filters[key];
            });
            
            // Guardar filtros actuales
            currentFilters = {...filters};
            localStorage.setItem('pendientesFilters', JSON.stringify(currentFilters));
            
            // Cargar resultados con filtros
            await loadResults(filters);
        });
    
        // Botón para limpiar filtros
        document.addEventListener('click', function(e) {
            if (e.target && e.target.id === 'clearFiltersBtn') {
                // Limpiar filtros de localStorage
                localStorage.removeItem('pendientesFilters');
                currentFilters = {};
                
                // Resetear formulario
                document.getElementById('searchForm').reset();
                
                // Resetear componentes de UI
                $('.select2').val(null).trigger('change');
                
                // Campos de fecha con flatpickr
                const flatpickrInputs = document.querySelectorAll('.flatpickr');
                flatpickrInputs.forEach(input => {
                    if (input._flatpickr) {
                        input._flatpickr.clear();
                    }
                });
                
                // Valor por defecto para el estado
                $('select[name="estado"]').val('PENDIENTE');
                
                // Recargar con datos iniciales sin filtros
                loadInitialData();
                
                // Notificar al usuario
                Swal.fire({
                    title: 'Filtros limpiados',
                    text: 'Se han restablecido todos los filtros',
                    icon: 'info',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        });
    
        // Función para implementar actualizaciones en tiempo real
        function setupEnhancedPolling() {
            // Variables para controlar el polling
            let pollingInterval = 30000; // 30 segundos por defecto
            let pollingTimer;
            let lastUpdate = Date.now();
            let isFirstLoad = true;
            
            // Función para verificar actualizaciones
            async function checkForUpdates() {
                try {
                    // Obtener timestamp del último cambio
                    const response = await fetch(`/api/pendientes/last_update?timestamp=${lastUpdate}`);
                    const data = await response.json();
                    
                    console.log("Polling pendientes:", data); // Para depuración
                    
                    if (data.hasUpdates) {
                        // Actualizar datos
                        if (Object.keys(currentFilters).length > 0) {
                            await loadResults(currentFilters);
                        } else {
                            await loadInitialData();
                        }
                        lastUpdate = Date.now();
                        
                        // Mostrar notificación solo si no es la primera carga
                        if (!isFirstLoad) {
                            showUpdateNotification();
                        }
                        isFirstLoad = false;
                        
                        // Reiniciar el timer con la frecuencia normal
                        startPolling(pollingInterval);
                    }
                } catch (error) {
                    console.error("Error verificando actualizaciones de pendientes:", error);
                }
            }
            
            // Función para mostrar notificación
            function showUpdateNotification() {
                // Crear elemento de notificación
                const notification = document.createElement('div');
                notification.className = 'update-notification';
                notification.innerHTML = `
                    <i class="fas fa-sync-alt"></i>
                    <span>Se han detectado cambios en los casos pendientes</span>
                    <button class="close-btn">&times;</button>
                `;
                document.body.appendChild(notification);
                
                // Animar entrada
                setTimeout(() => notification.classList.add('show'), 10);
                
                // Configurar botón de cierre
                notification.querySelector('.close-btn').addEventListener('click', () => {
                    notification.classList.remove('show');
                    setTimeout(() => notification.remove(), 300);
                });
                
                // Auto-eliminar después de 5 segundos
                setTimeout(() => {
                    if (document.body.contains(notification)) {
                        notification.classList.remove('show');
                        setTimeout(() => notification.remove(), 300);
                    }
                }, 5000);
            }
            
            // Función para iniciar el polling
            function startPolling(interval) {
                // Limpiar timer existente
                if (pollingTimer) clearTimeout(pollingTimer);
                
                // Configurar nuevo timer
                pollingTimer = setTimeout(() => {
                    checkForUpdates();
                }, interval);
            }
            
            // Iniciar el polling inicial
            startPolling(500); // Primera verificación rápida
            
            // Agregar botón de actualización manual
            const refreshBtn = document.createElement('button');
            refreshBtn.className = 'refresh-btn';
            refreshBtn.title = 'Actualizar datos';
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
            document.querySelector('.container').appendChild(refreshBtn);
            
            // Evento para actualización manual
            refreshBtn.addEventListener('click', async function() {
                this.querySelector('i').classList.add('fa-spin');
                
                if (Object.keys(currentFilters).length > 0) {
                    await loadResults(currentFilters);
                } else {
                    await loadInitialData();
                }
                
                lastUpdate = Date.now();
                
                // Quitar animación después de 1 segundo
                setTimeout(() => {
                    this.querySelector('i').classList.remove('fa-spin');
                }, 1000);
                
                // Reiniciar polling
                startPolling(pollingInterval);
            });
            
            // Pausar el polling cuando la página no está visible
            document.addEventListener('visibilitychange', function() {
                if (document.hidden) {
                    // Página no visible, detener polling
                    if (pollingTimer) clearTimeout(pollingTimer);
                } else {
                    // Página visible de nuevo, verificar actualizaciones inmediatamente
                    checkForUpdates();
                }
            });
        }
    
        // Inicializar tooltips
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    
        // Función para cargar datos iniciales
        async function loadInitialData() {
            try {
                const response = await fetch('/api/pendientes/resumen');
                const data = await response.json();
                
                document.getElementById('totalPendientes').textContent = data.total || '0';
                if (data.distribucionZonas) loadBarChart(data.distribucionZonas);
                if (data.filtros) loadFilterOptions(data.filtros);
                
                // Restaurar filtros guardados en la interfaz
                if (Object.keys(currentFilters).length > 0) {
                    restoreFiltersToForm();
                    await loadResults(currentFilters);
                } else {
                    await loadResults();
                }
            } catch (error) {
                console.error('Error cargando datos iniciales:', error);
                showError('Error al cargar los datos iniciales');
            }
        }
    
        // Función para cargar las opciones de los filtros
        function loadFilterOptions(filtros) {
            const selectMappings = {
                usuario: {
                    element: $('select[name="usuario"]'),
                    data: filtros.usuarios || []
                },
                zona: {
                    element: $('select[name="zona"]'),
                    data: ZONAS_DISPONIBLES
                }
            };
    
            Object.entries(selectMappings).forEach(([key, config]) => {
                const { element, data } = config;
                if (element.length) {
                    element.find('option:not([value=""])').remove();
                    data.forEach(option => element.append(new Option(option, option)));
                    element.trigger('change.select2');
                }
            });
    
            $('select[name="estado"]').val('PENDIENTE');
        }
    
        // Función para mostrar errores
        function showError(message) {
            Swal.fire({
                title: 'Error',
                text: message,
                icon: 'error'
            });
        }
    
        // Configurar y activar el polling para actualizaciones en tiempo real
        setupEnhancedPolling();
    
        // Cargar datos iniciales
        loadInitialData();
    });