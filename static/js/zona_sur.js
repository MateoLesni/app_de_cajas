// static/js/zona_sur.js
// Last updated: 2025-06-26 02:58:07
// Current user: pomenuk

document.addEventListener('DOMContentLoaded', function() {
    // Constantes y variables globales
    const ETIQUETAS_ZONA_SUR = [
        "ZT03", "ZT18", "ZT19", "ZT20", "ZI27", "ZI28", "ZI29", "ZI31", "ZI32", "ZI33", 
        "BR04", "ZJ04", "ZJ05", "ZJ06", "ZJ10", "ZJ11", "ZJ14", "ZJ17", "ZI04", "ZI06", 
        "ZI30", "ZT33", "ZT34", "ZI01", "ZI02", "ZI03", "ZI10", "ZI11", "ZI14", "ZI18", 
        "ZI23", "ZF05", "ZF08", "ZF18", "ZF19", "ZF20","ZF22", "CL02"
    ];
    
    // Crear mapeo de etiquetas a turnos permitidos
    const ETIQUETA_TURNOS_MAP = {
        "ZT03": ["UNI"],
        "ZT18": ["DIA", "NOCHE"],
        "ZT19": ["DIA", "NOCHE"],
        "ZT20": ["UNI"],
        "ZI27": ["DIA", "NOCHE"],
        "ZI28": ["UNI"],
        "ZI29": ["UNI"],
        "ZI31": ["UNI"],
        "ZI32": ["UNI"],
        "ZI33": ["UNI"],
        "BR04": ["UNI"],
        "ZJ04": ["UNI"],
        "ZJ05": ["UNI"],
        "ZJ06": ["UNI"],
        "ZJ10": ["UNI"],
        "ZJ11": ["UNI"],
        "ZJ14": ["UNI"],
        "ZJ17": ["UNI"],
        "ZI04": ["UNI"],
        "ZI06": ["UNI"],
        "ZI30": ["UNI"],
        "ZT33": ["UNI"],
        "ZT34": ["UNI"],
        "ZI01": ["DIA", "NOCHE"],
        "ZI02": ["DIA", "NOCHE"],
        "ZI03": ["UNI"],
        "ZI10": ["UNI"],
        "ZI11": ["UNI"],
        "ZI14": ["DIA", "NOCHE"],
        "ZI18": ["DIA", "NOCHE"],
        "ZI23": ["DIA", "NOCHE"],
        "ZF05": ["UNI"],
        "ZF08": ["UNI"],
        "ZF18": ["DIA", "NOCHE"],
        "ZF19": ["DIA", "NOCHE"],
        "ZF20": ["UNI"],
        "ZF22": ["UNI"],
        "CL02": ["UNI"]
    };
    
    let currentControlDate = '';
    let dateFixed = false; // Variable para controlar si la fecha está fijada
    let controlDatePicker; // Declaramos la variable para acceder globalmente
    
    // Inicializar componentes
    initializeComponents();
    
    // Función para inicializar todos los componentes
    function initializeComponents() {
        // Verificar si hay una fecha fijada en localStorage
        const savedDate = localStorage.getItem('zonaSurFixedDate');
        const isFixed = localStorage.getItem('zonaSurDateFixed') === 'true';
        dateFixed = isFixed;
        
        // Inicializar flatpickr para el selector de fecha de control
        controlDatePicker = flatpickr("#controlDate", {
            locale: "es",
            dateFormat: "d/m/Y",
            allowInput: true,
            maxDate: "today",
            onChange: function(selectedDates, dateStr) {
                if (!dateFixed) { // Solo cambiar si no está fijada
                    currentControlDate = dateStr;
                    loadValidationData(dateStr);
                }
            }
        });
        
        // Establecer la fecha inicial (guardada o la actual)
        let initialDate;
        if (isFixed && savedDate) {
            initialDate = savedDate;
            // Mostrar botón como "desfijado"
            updateFixButtonState(true);
        } else {
            // Obtener la fecha actual formateada
            const today = new Date();
            initialDate = today.getDate() + '/' + (today.getMonth() + 1) + '/' + today.getFullYear();
            updateFixButtonState(false);
        }
        
        currentControlDate = initialDate;
        controlDatePicker.setDate(initialDate);
        
        // Deshabilitar el controlDate si está fijado
        if (isFixed) {
            document.getElementById('controlDate').setAttribute('disabled', 'disabled');
        }
        
        // Inicializar flatpickr para el filtro de fecha
        flatpickr("#dateFilter", {
            locale: "es",
            dateFormat: "Y-m-d",
            allowInput: true
        });
        
        // Inicializar Select2 para los selectores
        $('.select2').select2({
            width: '100%',
            placeholder: 'Seleccionar...',
            allowClear: true
        });
        
        // Inicializar Select2 para el filtro de etiquetas
        $('#etiquetaFilter').select2({
            width: '100%',
            placeholder: 'Seleccionar...',
            allowClear: true
        });
        
        // Inicializar tooltips de Bootstrap
        var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
        var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl)
        });
        
        // Event listener para mostrar color seleccionado
        document.getElementById('editRowColor').addEventListener('input', function() {
            this.classList.add('has-color');
        });
        
        // Botón para quitar el color
        document.getElementById('removeColorBtn').addEventListener('click', function() {
            const colorPicker = document.getElementById('editRowColor');
            colorPicker.value = '#ffffff';  // Restablecer a blanco
            colorPicker.classList.remove('has-color');
        });
        
        // Cargar datos iniciales
        loadValidationData(currentControlDate);
        loadUserOptions();
        loadEtiquetaOptions(); // Cargar opciones de etiquetas
        loadTableData();
        
        // Event listeners
        $('#filtersForm').submit(function(e) {
            e.preventDefault();
            loadTableData();
        });
        
        $('#saveEdit').click(saveEditedRecord);
        
        // Botón fijar fecha
        $('#fixDateBtn').click(toggleFixDate);
        
        // Botones para exportar
        $('#exportExcel').click(function() {
            Swal.fire({
                title: 'Exportar a Excel',
                text: 'Esta función estará disponible próximamente',
                icon: 'info'
            });
        });
        
        $('#exportPDF').click(function() {
            Swal.fire({
                title: 'Exportar a PDF',
                text: 'Esta función estará disponible próximamente',
                icon: 'info'
            });
        });
        
        // Agregar listener para el botón de limpiar filtros
        $('#resetFilters').click(function() {
            // Limpiar todos los campos del formulario
            $('#userFilter').val(null).trigger('change');
            $('#dateFilter').val('').trigger('change');
            $('#etiquetaFilter').val(null).trigger('change');
            $('#textSearchFilter').val('');
            
            // Cargar datos con filtros vacíos
            loadTableData();
            
            // Mostrar una notificación
            Swal.fire({
                title: 'Filtros Limpiados',
                text: 'Se han restablecido todos los filtros',
                icon: 'info',
                timer: 1500,
                showConfirmButton: false
            });
        });
        
        // Agregar a initializeComponents() en zona_sur.js y ambulante.js
        function setupEnhancedPolling() {
            // Variables para controlar el polling
            let pollingInterval = 30000; // 30 segundos por defecto
            let pollingTimer;
            let lastUpdate = Date.now();
            let isFirstLoad = true;
            
            // Función para verificar actualizaciones
            async function checkForUpdates() {
                try {
                    // Obtener un hash o timestamp del último cambio
                    const response = await fetch(`/api/zona_sur/last_update?timestamp=${lastUpdate}`);
                    const data = await response.json();
                    
                    if (data.hasUpdates) {
                        // Actualizar datos
                        await loadTableData();
                        await loadValidationData(currentControlDate);
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
                    console.error("Error verificando actualizaciones:", error);
                }
            }
            
            // Función para mostrar notificación
            function showUpdateNotification() {
                // Crear elemento de notificación
                const notification = document.createElement('div');
                notification.className = 'update-notification';
                notification.innerHTML = `
                    <i class="fas fa-sync-alt"></i>
                    <span>Se han detectado cambios en los datos</span>
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
            document.querySelector('.main-content').appendChild(refreshBtn);
            
            // Evento para actualización manual
            refreshBtn.addEventListener('click', async function() {
                this.querySelector('i').classList.add('fa-spin');
                await loadTableData();
                await loadValidationData(currentControlDate);
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
            // Verificación periódica del estado del archivo
            async function checkFileStatus() {
                try {
                    const response = await fetch('/api/zona_sur/file_status');
                    const status = await response.json();
                    
                    let statusElement = document.querySelector('.file-status');
                    if (!statusElement) {
                        statusElement = document.createElement('div');
                        statusElement.className = 'file-status';
                        document.body.appendChild(statusElement);
                    }
                    
                    if (status.records === 0) {
                        statusElement.className = 'file-status error';
                        statusElement.textContent = 'Error: Base de datos vacía';
                    } else if (status.records < 10) { // Umbral arbitrario, ajustar según necesidad
                        statusElement.className = 'file-status warning';
                        statusElement.textContent = `Advertencia: Solo ${status.records} registros`;
                    } else {
                        statusElement.className = 'file-status';
                        statusElement.textContent = `Base de datos OK (${status.records} registros)`;
                        
                        // Ocultar después de 5 segundos si todo está bien
                        setTimeout(() => {
                            statusElement.style.display = 'none';
                        }, 5000);
                    }
                } catch (error) {
                    console.error('Error verificando estado del archivo:', error);
                }
            }

            // Verificar al inicio y cada 5 minutos
            checkFileStatus();
            setInterval(checkFileStatus, 300000); // 5 minutos
        }

        // Llamar a la función para configurar el polling mejorado
        setupEnhancedPolling();
    }
    
    // Función para cargar las opciones de etiquetas
    function loadEtiquetaOptions() {
        try {
            const etiquetaSelect = document.getElementById('etiquetaFilter');
            
            // Limpiar opciones existentes excepto la opción "Todas"
            const allOption = etiquetaSelect.querySelector('option[value=""]');
            etiquetaSelect.innerHTML = '';
            etiquetaSelect.appendChild(allOption);
            
            // Agregar etiquetas desde la constante ETIQUETAS_ZONA_SUR
            ETIQUETAS_ZONA_SUR.forEach(etiqueta => {
                const option = document.createElement('option');
                option.value = etiqueta;
                option.textContent = etiqueta;
                etiquetaSelect.appendChild(option);
            });
            
            // Actualizar Select2
            $(etiquetaSelect).trigger('change');
            
        } catch (error) {
            console.error('Error cargando etiquetas:', error);
        }
    }
    
    // Función para alternar entre fijar y desfijar la fecha
    function toggleFixDate() {
        dateFixed = !dateFixed;
        
        // Guardar el estado en localStorage
        if (dateFixed) {
            localStorage.setItem('zonaSurFixedDate', currentControlDate);
            localStorage.setItem('zonaSurDateFixed', 'true');
            document.getElementById('controlDate').setAttribute('disabled', 'disabled');
        } else {
            localStorage.removeItem('zonaSurFixedDate');
            localStorage.setItem('zonaSurDateFixed', 'false');
            document.getElementById('controlDate').removeAttribute('disabled');
        }
        
        // Actualizar el estado visual del botón
        updateFixButtonState(dateFixed);
        
        // Mostrar mensaje de confirmación
        const message = dateFixed ? 
            'Fecha fijada. Se mantendrá esta fecha aun recargando la página.' : 
            'Fecha desfijada. Ahora puedes cambiar la fecha.';
            
        Swal.fire({
            title: dateFixed ? 'Fecha Fijada' : 'Fecha Desfijada',
            text: message,
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
        });
    }
    
    // Función para actualizar la apariencia del botón según el estado
    function updateFixButtonState(isFixed) {
        const btn = document.getElementById('fixDateBtn');
        
        if (isFixed) {
            btn.classList.remove('btn-outline-primary');
            btn.classList.add('btn-primary');
            btn.innerHTML = '<i class="fas fa-thumbtack"></i> Desfijar Fecha';
            btn.setAttribute('title', 'Desbloquear este campo para poder cambiar la fecha');
        } else {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline-primary');
            btn.innerHTML = '<i class="fas fa-thumbtack"></i> Fijar Fecha';
            btn.setAttribute('title', 'Fijar esta fecha para que no cambie al recargar la página');
        }
        
        // Actualizar tooltip si está inicializado
        try {
            const tooltip = bootstrap.Tooltip.getInstance(btn);
            if (tooltip) {
                tooltip.dispose();
                new bootstrap.Tooltip(btn);
            }
        } catch (e) {
            console.log("Tooltip no inicializado aún");
        }
    }
    // Función para cargar la validación de datos según la fecha
    async function loadValidationData(dateStr) {
        try {
            // Mostrar spinner o indicador de carga
            const validationBody = document.getElementById('validationTableBody');
            validationBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Cargando...</span>
                        </div>
                    </td>
                </tr>
            `;
            
            // Formatear fecha para la API (de dd/mm/yyyy a yyyy-mm-dd)
            const dateParts = dateStr.split('/');
            const formattedDate = `${dateParts[2]}-${padZero(dateParts[1])}-${padZero(dateParts[0])}`;
            
            console.log("Fecha seleccionada:", dateStr);
            console.log("Fecha formateada:", formattedDate);
            
            // Cargar datos de zona_sur sin filtros - para verificar todos los registros
            const zonaSurResponse = await fetch(`/api/zona_sur/data`);
            if (!zonaSurResponse.ok) {
                throw new Error('Error al cargar los datos de zona sur');
            }
            const zonaSurData = await zonaSurResponse.json();
            
            // Cargar TODOS los pendientes, no solo los de zona_sur
            const pendingResponse = await fetch(`/api/pendientes/lista`);
            let pendingData = [];
            if (pendingResponse.ok) {
                pendingData = await pendingResponse.json();
                console.log("Datos de pendientes:", pendingData);
            } else {
                console.warn("No se pudieron cargar los pendientes completos, usando endpoint específico");
                // Intento alternativo con el endpoint específico
                const specificPendingResponse = await fetch(`/api/pendientes/zona_sur?fecha=${formattedDate}`);
                if (specificPendingResponse.ok) {
                    pendingData = await specificPendingResponse.json();
                }
            }
            
            // Filtrar los pendientes por zona sur
            pendingData = pendingData.filter(item => item.zona === 'ZONA SUR');
            
            // Construir filas de la tabla de validación
            let validationRows = '';
            let allRegistered = true; // Variable para verificar si todos los registros están cargados
            let pendingCount = 0;
            let missingCount = 0;
            
            // Recorrer cada etiqueta y sus turnos correspondientes
            for (const etiqueta of ETIQUETAS_ZONA_SUR) {
                const turnos = ETIQUETA_TURNOS_MAP[etiqueta] || ["UNI"]; // Usar los turnos mapeados o UNI por defecto
                
                for (const turno of turnos) {
                    // Buscar registros OK en zona_sur.json
                    const registrosOK = zonaSurData.filter(item => 
                        item.etiqueta === etiqueta && 
                        item.turno === turno &&
                        item.estado === 'OK'
                    );
                    
                    // Verificar si hay algún registro OK para esta fecha
                    let encontradoOK = false;
                    for (const registro of registrosOK) {
                        // Verificar que la fecha coincida (con múltiples formatos)
                        const fechaRegistro = registro.fecha;
                        
                        if (fechaRegistro === formattedDate || 
                            fechaRegistro === `${dateParts[2]}-${parseInt(dateParts[1])}-${parseInt(dateParts[0])}`) {
                            encontradoOK = true;
                            break;
                        }
                        
                        // Verificación con objetos Date para ser más flexible
                        try {
                            const fechaObj1 = new Date(fechaRegistro);
                            const fechaObj2 = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);
                            
                            if (fechaObj1.getFullYear() === fechaObj2.getFullYear() &&
                                fechaObj1.getMonth() === fechaObj2.getMonth() &&
                                fechaObj1.getDate() === fechaObj2.getDate()) {
                                encontradoOK = true;
                                break;
                            }
                        } catch (e) { }
                    }
                    
                    // Si ya está OK, continuar con la siguiente combinación de etiqueta/turno
                    if (encontradoOK) {
                        continue;
                    }
                    
                    // Buscar en pendientes.json
                    const registrosPendientes = pendingData.filter(item => {
                        // Primero verificar etiqueta y turno
                        if (item.etiqueta !== etiqueta || item.turno !== turno) {
                            return false;
                        }
                        
                        // Luego verificar la fecha con varios formatos posibles
                        const fechaItem = item.fecha;
                        
                        // Verificación directa
                        if (fechaItem === formattedDate) {
                            return true;
                        }
                        
                        // Verificación sin leading zeros
                        if (fechaItem === `${dateParts[2]}-${parseInt(dateParts[1])}-${parseInt(dateParts[0])}`) {
                            return true;
                        }
                        
                        // Verificación con objetos Date
                        try {
                            const fechaObj1 = new Date(fechaItem);
                            const fechaObj2 = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);
                            
                            return (fechaObj1.getFullYear() === fechaObj2.getFullYear() &&
                                    fechaObj1.getMonth() === fechaObj2.getMonth() &&
                                    fechaObj1.getDate() === fechaObj2.getDate());
                        } catch (e) {
                            return false;
                        }
                    });
                    
                    console.log(`Registros pendientes para ${etiqueta} ${turno}:`, registrosPendientes);
                    
                    // Determinar el estado para mostrar
                    let estadoHTML = '';
                    
                    if (registrosPendientes.length > 0) {
                        // Si está en pendientes
                        estadoHTML = `<span class="pending-status" style="color: #f39c12; font-size: 0.85rem; font-weight: 500;">PENDIENTE</span>`;
                        allRegistered = false;
                        pendingCount++;
                    } else {
                        // No está cargado
                        estadoHTML = `<span class="missing-status" style="color: #e74c3c; font-size: 0.85rem; font-weight: 500;">FALTA CARGAR</span>`;
                        allRegistered = false;
                        missingCount++;
                    }
                    
                    validationRows += `
                        <tr>
                            <td>${etiqueta}</td>
                            <td>${turno}</td>
                            <td>${dateStr}</td>
                            <td class="text-center">${estadoHTML}</td>
                        </tr>
                    `;
                }
            }
            
            // Verificar si hay filas para mostrar o si todas las etiquetas están cargadas
            if (validationRows === '') {
                if (allRegistered) {
                    validationBody.innerHTML = `
                        <tr>
                            <td colspan="4" class="text-center">
                                <div class="alert alert-success mb-0">
                                    <i class="fas fa-check-circle me-2"></i>
                                    Todas las etiquetas para esta fecha están cargadas correctamente
                                </div>
                            </td>
                        </tr>
                    `;
                } else {
                    validationBody.innerHTML = `
                        <tr>
                            <td colspan="4" class="text-center">No hay datos para mostrar</td>
                        </tr>
                    `;
                }
            } else {
                // Crear un resumen que se mostrará al FINAL de la tabla
                let resumen = '';
                if (pendingCount > 0 && missingCount > 0) {
                    resumen = `
                        <tr class="table-light">
                            <td colspan="4" class="text-center">
                                <small><strong>Se muestran registros pendientes (${pendingCount}) y que faltan cargar (${missingCount})</strong></small>
                            </td>
                        </tr>
                    `;
                } else if (pendingCount > 0) {
                    resumen = `
                        <tr class="table-light">
                            <td colspan="4" class="text-center">
                                <small><strong>Se muestran solo registros pendientes (${pendingCount})</strong></small>
                            </td>
                        </tr>
                    `;
                } else if (missingCount > 0) {
                    resumen = `
                        <tr class="table-light">
                            <td colspan="4" class="text-center">
                                <small><strong>Se muestran solo registros que faltan cargar (${missingCount})</strong></small>
                            </td>
                        </tr>
                    `;
                }
                
                // Colocar el resumen al final de la tabla
                validationBody.innerHTML = validationRows + resumen;
            }
            
        } catch (error) {
            console.error('Error cargando datos de validación:', error);
            showError('Error al cargar los datos de validación');
        }
    }
    
    // Función para cargar las opciones de usuarios
    async function loadUserOptions() {
        try {
            const response = await fetch('/api/zona_sur/users');
            if (!response.ok) {
                throw new Error('Error al cargar usuarios');
            }
            
            const users = await response.json();
            const userSelect = document.getElementById('userFilter');
            
            // Limpiar opciones existentes excepto la opción "Todos"
            const allOption = userSelect.querySelector('option[value=""]');
            userSelect.innerHTML = '';
            userSelect.appendChild(allOption);
            
            // Agregar usuarios
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user;
                option.textContent = user;
                userSelect.appendChild(option);
            });
            
            // Actualizar Select2
            $(userSelect).trigger('change');
            
        } catch (error) {
            console.error('Error cargando usuarios:', error);
        }
    }
    
    // Función para cargar datos de la tabla
    async function loadTableData() {
        try {
            // Obtener filtros
            const usuario = document.getElementById('userFilter').value;
            const fecha = document.getElementById('dateFilter').value;
            const etiqueta = document.getElementById('etiquetaFilter').value;
            const textSearch = document.getElementById('textSearchFilter')?.value?.trim().toLowerCase() || '';
            
            // Construir parámetros de consulta
            const params = new URLSearchParams();
            if (usuario) params.append('usuario', usuario);
            if (fecha) params.append('fecha', fecha);
            // El backend podría no estar procesando el parámetro 'etiqueta', así que lo manejamos en el cliente
            
            // Mostrar indicador de carga
            const tbody = document.getElementById('dataTableBody');
            tbody.innerHTML = `
                <tr class="placeholder-row">
                    <td colspan="13" class="text-center">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Cargando...</span>
                        </div>
                        <p class="mt-2">Cargando datos...</p>
                    </td>
                </tr>
            `;
            
            // Cargar datos de la API
            const response = await fetch(`/api/zona_sur/data?${params.toString()}`);
            
            if (!response.ok) {
                throw new Error('Error al cargar los datos');
            }
            
            let data = await response.json();
            
            // Filtrar por etiqueta en el cliente (ya que el backend podría no soportarlo)
            if (etiqueta) {
                data = data.filter(item => item.etiqueta === etiqueta);
            }
            
            // Aplicar filtro de búsqueda de texto si existe
            if (textSearch) {
                data = data.filter(item => {
                    // Convertir todos los valores a string y a minúsculas para comparación
                    const fc = String(item.fc || '').toLowerCase();
                    const pl = String(item.pl || '').toLowerCase();
                    const transferencia = String(item.transferencia || '').toLowerCase();
                    const boletaRosa = String(item.boletaRosa || '').toLowerCase();
                    const observaciones = String(item.observaciones || '').toLowerCase();
                    
                    // Devolver true si el texto de búsqueda está contenido en algún campo
                    return fc.includes(textSearch) || 
                           pl.includes(textSearch) || 
                           transferencia.includes(textSearch) || 
                           boletaRosa.includes(textSearch) || 
                           observaciones.includes(textSearch);
                });
            }
            
            // Si no hay datos
            if (!data || data.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="13" class="text-center">No se encontraron registros</td>
                    </tr>
                `;
                return;
            }
            
            // Construir filas de la tabla
            let rows = '';
            data.forEach(item => {
                // Formatear fecha para mostrar
                const fecha = formatDate(item.fecha || '');
                
                // Limitar el tamaño del texto de observaciones
                const observaciones = item.observaciones || '';
                const observacionesCortas = observaciones.length > 50 
                    ? observaciones.substring(0, 50) + '...' 
                    : observaciones;
                
                // Estilo para el color de fondo de la fila
                const rowStyle = item.rowColor ? `style="background-color: ${item.rowColor};"` : '';
                
                // Resaltar términos de búsqueda si hay un texto de búsqueda
                let fcDisplay = item.fc || '';
                let plDisplay = item.pl || '';
                let transferenciaDisplay = item.transferencia || '';
                let boletaRosaDisplay = item.boletaRosa || '';
                let observacionesDisplay = observacionesCortas;
                
                if (textSearch) {
                    // Función para resaltar términos de búsqueda
                    const highlightText = (text) => {
                        if (!text) return '';
                        // Escapar el texto para prevenir inyección HTML
                        const escaped = String(text).replace(/&/g, '&amp;')
                                               .replace(/</g, '&lt;')
                                               .replace(/>/g, '&gt;')
                                               .replace(/"/g, '&quot;')
                                               .replace(/'/g, '&#039;');
                        
                        // Resaltar el término de búsqueda
                        return escaped.replace(new RegExp(textSearch, 'gi'), 
                                             '<span class="highlight">$&</span>');
                    };
                    
                    fcDisplay = highlightText(fcDisplay);
                    plDisplay = highlightText(plDisplay);
                    transferenciaDisplay = highlightText(transferenciaDisplay);
                    boletaRosaDisplay = highlightText(boletaRosaDisplay);
                    observacionesDisplay = highlightText(observacionesDisplay);
                }
                
                rows += `
                    <tr data-id="${item.id}" ${rowStyle}>
                        <td class="id-column">${item.id || ''}</td>
                        <td>${fecha}</td>
                        <td>${item.usuario || ''}</td>
                        <td>${item.etiqueta || ''}</td>
                        <td>${item.turno || ''}</td>
                        <td>${item.comision || ''}${item.comision ? '%' : ''}</td>
                        <td>${fcDisplay}</td>
                        <td>${plDisplay}</td>
                        <td>${transferenciaDisplay}</td>
                        <td>${boletaRosaDisplay}</td>
                        <td>
                            <span class="observaciones-text" title="${observaciones}">${observacionesDisplay}</span>
                        </td>
                        <td><span class="badge ${item.estado === 'OK' ? 'bg-success' : 'bg-warning'}">${item.estado || 'PENDIENTE'}</span></td>
                        <td>
                            <button class="btn btn-sm btn-primary edit-btn" data-id="${item.id}">
                                <i class="fas fa-edit"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            // Actualizar la tabla
            tbody.innerHTML = rows;
            
            // Agregar event listeners a los botones
            document.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    openEditModal(this.dataset.id);
                });
            });
            
        } catch (error) {
            console.error('Error cargando datos de la tabla:', error);
            showError('Error al cargar los datos de la tabla');
        }
    }
    
    // Función para abrir el modal de edición
    async function openEditModal(id) {
        try {
            // Mostrar indicador de carga
            Swal.fire({
                title: 'Cargando...',
                text: 'Por favor espere',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
            
            // Cargar datos del registro
            const response = await fetch(`/api/zona_sur/record/${id}`);
            
            if (!response.ok) {
                throw new Error('Error al cargar los datos del registro');
            }
            
            const data = await response.json();
            
            // Llenar el formulario
            document.getElementById('editId').value = id;
            document.getElementById('editUsuario').value = data.usuario || '';
            document.getElementById('editEtiqueta').value = data.etiqueta || '';
            document.getElementById('editTurno').value = data.turno || '';
            document.getElementById('editComision').value = data.comision || '';
            document.getElementById('editFc').value = data.fc || '';
            document.getElementById('editPl').value = data.pl || '';
            document.getElementById('editTransferencia').value = data.transferencia || '';
            document.getElementById('editBoletaRosa').value = data.boletaRosa || '';
            document.getElementById('editObservaciones').value = data.observaciones || '';
            document.getElementById('editEstado').value = data.estado || 'PENDIENTE';
            
            // Cargar el color de la fila, si existe
            const colorPicker = document.getElementById('editRowColor');
            if (data.rowColor) {
                colorPicker.value = data.rowColor;
                colorPicker.classList.add('has-color');
            } else {
                colorPicker.value = '#ffffff'; // Color por defecto (blanco)
                colorPicker.classList.remove('has-color');
            }
            
            // Inicializar flatpickr para la fecha
            const editFecha = document.getElementById('editFecha');
            if (editFecha._flatpickr) {
                editFecha._flatpickr.destroy();
            }
            
            flatpickr(editFecha, {
                locale: "es",
                dateFormat: "Y-m-d",
                allowInput: true,
                defaultDate: data.fecha || ''
            });
            
            // Añadir título con mensaje informativo
            const modalTitle = document.getElementById('editModalLabel');
            modalTitle.innerHTML = 'Editar Estado <small class="text-muted">(solo se puede cambiar el estado)</small>';
            
            // Mostrar el modal
            const editModal = new bootstrap.Modal(document.getElementById('editModal'));
            editModal.show();
            
            // Cerrar el indicador de carga
            Swal.close();
            
        } catch (error) {
            console.error('Error abriendo modal de edición:', error);
            Swal.fire({
                title: 'Error',
                text: 'Error al cargar los datos del registro',
                icon: 'error'
            });
        }
    }
    
    // Función para guardar un registro editado
    async function saveEditedRecord() {
        try {
            // Obtener valores
            const id = document.getElementById('editId').value;
            const estado = document.getElementById('editEstado').value;
            const colorPicker = document.getElementById('editRowColor');
            const rowColor = colorPicker.classList.contains('has-color') ? colorPicker.value : '';
            
            // Mostrar indicador de carga
            Swal.fire({
                title: 'Guardando...',
                text: 'Por favor espere',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
            
            // Recopilar solo los datos esenciales para la actualización
            const data = {
                id: id,
                estado: estado,
                zona: 'ZONA SUR',
                rowColor: rowColor  // Añadir el color de la fila
            };
            
            // Enviar datos a la API
            const response = await fetch('/api/zona_sur/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al guardar los cambios');
            }
            
            // Obtener resultado de la operación
            const result = await response.json();
            
            // Cerrar el modal
            const editModal = bootstrap.Modal.getInstance(document.getElementById('editModal'));
            editModal.hide();
            
            // Recargar datos
            loadValidationData(currentControlDate);
            loadTableData();
            
            // Mostrar mensaje de éxito con detalles adicionales
            let successMessage = 'Registro actualizado correctamente';
            if (estado === 'PENDIENTE') {
                successMessage = 'Registro movido a pendientes correctamente';
            } else {
                successMessage = 'Estado actualizado correctamente';
            }
            
            Swal.fire({
                title: 'Éxito',
                text: successMessage,
                icon: 'success',
                confirmButtonColor: '#3498db'
            });
            
        } catch (error) {
            console.error('Error guardando registro:', error);
            Swal.fire({
                title: 'Error',
                text: error.message,
                icon: 'error'
            });
        }
    }
    
    // Función para confirmar eliminación de un registro
    function confirmDelete(id) {
        Swal.fire({
            title: '¿Estás seguro?',
            text: `¿Deseas eliminar el registro ${id}?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    // Mostrar indicador de carga
                    Swal.fire({
                        title: 'Eliminando...',
                        text: 'Por favor espere',
                        allowOutsideClick: false,
                        didOpen: () => {
                            Swal.showLoading();
                        }
                    });
                    
                    // Enviar solicitud de eliminación
                    const response = await fetch(`/api/zona_sur/delete/${id}`, {
                        method: 'DELETE'
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Error al eliminar el registro');
                    }
                    
                    // Recargar datos
                    loadValidationData(currentControlDate);
                    loadTableData();
                    
                    // Mostrar mensaje de éxito
                    Swal.fire({
                        title: 'Eliminado',
                        text: 'El registro ha sido eliminado correctamente',
                        icon: 'success',
                        confirmButtonColor: '#3498db'
                    });
                    
                } catch (error) {
                    console.error('Error eliminando registro:', error);
                    Swal.fire({
                        title: 'Error',
                        text: error.message,
                        icon: 'error'
                    });
                }
            }
        });
    }
    
    // Función para mostrar errores
    function showError(message) {
        Swal.fire({
            title: 'Error',
            text: message,
            icon: 'error'
        });
    }
    
    // Función para formatear fecha
    function formatDate(dateStr) {
        try {
            // Si ya viene en formato dd/mm/yyyy
            if (dateStr.includes('/')) {
                return dateStr;
            }
            
            // Si viene en formato yyyy-mm-dd
            const date = new Date(dateStr + 'T00:00:00');
            return date.getDate() + '/' + (date.getMonth() + 1) + '/' + date.getFullYear();
        } catch (error) {
            console.error('Error formateando fecha:', error);
            return dateStr;
        }
    }
    
    // Función para agregar ceros a números menores a 10
    function padZero(num) {
        return num < 10 ? '0' + num : num;
    }

    // Añadir al final del evento DOMContentLoaded en zona_sur.js:

// Inicializa el sistema de validación de stock
initStockValidation();

// Función para inicializar la validación de stock
function initStockValidation() {
    // Obtener el mes actual
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // getMonth() devuelve 0-11
    const currentYear = currentDate.getFullYear();
    
    // Cargar el estado de stock para el mes actual
    loadStockStatus(currentYear, currentMonth);
    
    // Agregar event listeners a las celdas de períodos
    document.querySelectorAll('.stock-period-cell').forEach(cell => {
        cell.addEventListener('click', function() {
            const period = this.dataset.period;
            showStockDetails(currentYear, currentMonth, period);
        });
    });
}

// Función para cargar el estado de stock
async function loadStockStatus(year, month) {
    try {
        // Mostrar indicadores de carga en cada celda
        document.querySelectorAll('.stock-period-cell .period-status').forEach(elem => {
            elem.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
        });
        
        // Cargar datos del stock para la zona sur
        const response = await fetch(`/api/stock/status?zona=ZONA SUR&year=${year}&month=${month}`);
        if (!response.ok) {
            throw new Error('Error al cargar datos de stock');
        }
        
        const data = await response.json();
        
        // Actualizar cada celda con el estado correspondiente
        for (const period of ['10', '20', '30']) {
            const cell = document.getElementById(`stock-period-${period}`);
            const status = data[period] || 'missing';
            
            // Limpiar clases existentes
            cell.classList.remove('status-complete', 'status-partial', 'status-missing');
            
            // Añadir clase según el estado
            cell.classList.add(`status-${status}`);
            
            // Actualizar texto e ícono
            let statusHtml = '';
            if (status === 'complete') {
                statusHtml = '<i class="fas fa-check-circle" style="color: #2ecc71;"></i>';
            } else if (status === 'partial') {
                statusHtml = '<i class="fas fa-exclamation-circle" style="color: #f1c40f;"></i>';
            } else {
                statusHtml = '<i class="fas fa-times-circle" style="color: #e74c3c;"></i>';
            }
            
            cell.querySelector('.period-status').innerHTML = statusHtml;
        }
    } catch (error) {
        console.error('Error cargando estado de stock:', error);
        
        // Mostrar error en las celdas
        document.querySelectorAll('.stock-period-cell .period-status').forEach(elem => {
            elem.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i>';
        });
    }
}

    // Función para mostrar detalles del stock de un período
    async function showStockDetails(year, month, period) {
        try {
            // Mostrar indicador de carga
            Swal.fire({
                title: 'Cargando detalles...',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
            
            // Cargar detalles del stock para este período
            const response = await fetch(`/api/stock/details?zona=ZONA SUR&year=${year}&month=${month}&period=${period}`);
            if (!response.ok) {
                throw new Error('Error al cargar detalles del stock');
            }
            
            const data = await response.json();
            
            // Crear un mapa para rastrear todas las etiquetas y su estado
            const etiquetasMap = {};
            
            // Primero, inicializar todas las etiquetas de ETIQUETAS_ZONA_SUR como no registradas
            ETIQUETAS_ZONA_SUR.forEach(etiqueta => {
                etiquetasMap[etiqueta] = {
                    nombre: etiqueta,
                    registrado: false
                };
            });
            
            // Luego, actualizar el estado con la información de la API
            if (data.etiquetas && data.etiquetas.length > 0) {
                data.etiquetas.forEach(etiqueta => {
                    if (etiquetasMap[etiqueta.nombre]) {
                        etiquetasMap[etiqueta.nombre].registrado = etiqueta.registrado;
                    } else {
                        etiquetasMap[etiqueta.nombre] = etiqueta;
                    }
                });
            }
            
            // Convertir el mapa a un array para la presentación
            const etiquetasCompletas = Object.values(etiquetasMap);
            
            // Crear HTML para la lista de etiquetas
            let etiquetasHtml = '';
            
            if (etiquetasCompletas.length === 0) {
                etiquetasHtml = '<p class="text-center">No hay datos de stock para este período.</p>';
            } else {
                etiquetasHtml += '<ul class="stock-etiqueta-list">';
                
                // Ordenar etiquetas alfabéticamente para mejor visualización
                etiquetasCompletas.sort((a, b) => a.nombre.localeCompare(b.nombre));
                
                etiquetasCompletas.forEach(etiqueta => {
                    const statusClass = etiqueta.registrado ? '' : 'missing';
                    const statusText = etiqueta.registrado ? 
                        '<span class="etiqueta-status"><i class="fas fa-check-circle" style="color: #2ecc71;"></i> Registrado</span>' : 
                        '<span class="etiqueta-status status-missing"><i class="fas fa-times-circle"></i> Falta registrar</span>';
                    
                    let buttonHtml = '';
                    if (!etiqueta.registrado) {
                        buttonHtml = `<button class="stock-load-button" onclick="loadStockForm('${etiqueta.nombre}', '${period}', ${month}, ${year})">
                            <i class="fas fa-plus"></i> Cargar
                        </button>`;
                    }
                    
                    etiquetasHtml += `
                        <li class="stock-etiqueta-item ${statusClass}">
                            <span class="etiqueta-name">${etiqueta.nombre}</span>
                            <div class="etiqueta-actions">
                                ${statusText}
                                ${buttonHtml}
                            </div>
                        </li>`;
                });
                
                etiquetasHtml += '</ul>';
            }
            
            // Formatear el título con el mes y año
            const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            const title = `Stock Zona Sur - Período ${period} de ${monthNames[month]} ${year}`;
            
            // Mostrar el modal con los detalles
            Swal.fire({
                title: title,
                html: etiquetasHtml,
                width: '600px',
                customClass: {
                    container: 'stock-detail-modal'
                },
                showCloseButton: true,
                showConfirmButton: false
            });
            
        } catch (error) {
            console.error('Error mostrando detalles del stock:', error);
            
            Swal.fire({
                title: 'Error',
                text: 'No se pudieron cargar los detalles del stock',
                icon: 'error'
            });
        }
    }

    // Función para redirigir al formulario de carga de stock
    function loadStockForm(etiqueta, period, month, year) {
        // Convertir mes a formato con dos dígitos
        const monthFormatted = month.toString().padStart(2, '0');
        // Crear fecha (primer día del mes)
        const fecha = `${year}-${monthFormatted}-01`;
        
        // Redirigir al formulario de stock con parámetros pre-cargados
        window.location.href = `/stock?etiqueta=${etiqueta}&periodo=${period}&fecha=${fecha}&zona=ZONA SUR`;
    }
    // Agregar al principio de zona_sur.js o donde corresponda:

// Función para obtener el mes de control configurado por el administrador
async function getControlMonth() {
    try {
        // Intentar obtener del servidor
        const response = await fetch('/api/stock/control_month');
        if (response.ok) {
            const data = await response.json();
            return {
                year: data.year,
                month: data.month
            };
        }
        
        // Si falla, intentar obtener del localStorage
        const savedYear = localStorage.getItem('stockSelectedYear');
        const savedMonth = localStorage.getItem('stockSelectedMonth');
        
        if (savedYear && savedMonth) {
            return {
                year: parseInt(savedYear),
                month: parseInt(savedMonth)
            };
        }
        
        // Si no hay nada configurado, usar el mes actual
        const now = new Date();
        return {
            year: now.getFullYear(),
            month: now.getMonth() + 1
        };
    } catch (error) {
        console.error('Error obteniendo mes de control:', error);
        // Usar mes actual como fallback
        const now = new Date();
        return {
            year: now.getFullYear(),
            month: now.getMonth() + 1
        };
    }
}

// Modificar la función de loadValidationData en zona_sur.js
async function loadStockValidation() {
    try {
        // Mostrar indicador de carga
        const stockCard = document.querySelector('.stock-status-card');
        if (stockCard) {
            stockCard.querySelector('.card-title').innerHTML = 'VALIDACIÓN DE STOCK <small class="text-muted">(Cargando...)</small>';
            
            // Mostrar indicadores de carga en cada celda
            stockCard.querySelectorAll('.stock-period-cell .period-status').forEach(elem => {
                elem.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
            });
            
            // Obtener el mes de control
            const controlMonth = await getControlMonth();
            
            // Actualizar título con el mes de control
            const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            stockCard.querySelector('.card-title').innerHTML = 
                `VALIDACIÓN DE STOCK <small class="text-muted">(${monthNames[controlMonth.month]} ${controlMonth.year})</small>`;
            
            // Cargar datos del stock para la zona sur y el mes de control
            const response = await fetch(`/api/stock/status?zona=ZONA SUR&year=${controlMonth.year}&month=${controlMonth.month}`);
            if (!response.ok) {
                throw new Error('Error al cargar datos de stock');
            }
            
            const data = await response.json();
            
            // Actualizar cada celda con el estado correspondiente
            for (const period of ['10', '20', '30']) {
                const cell = document.getElementById(`stock-period-${period}`);
                if (!cell) continue;
                
                const status = data[period] || 'missing';
                
                // Limpiar clases existentes
                cell.classList.remove('status-complete', 'status-partial', 'status-missing');
                
                // Añadir clase según el estado
                cell.classList.add(`status-${status}`);
                
                // Actualizar texto e ícono
                let statusHtml = '';
                if (status === 'complete') {
                    statusHtml = '<i class="fas fa-check-circle" style="color: #2ecc71;"></i>';
                } else if (status === 'partial') {
                    statusHtml = '<i class="fas fa-exclamation-circle" style="color: #f1c40f;"></i>';
                } else {
                    statusHtml = '<i class="fas fa-times-circle" style="color: #e74c3c;"></i>';
                }
                
                cell.querySelector('.period-status').innerHTML = statusHtml;
                
                // Actualizar el atributo data-month y data-year para usarlo en los clics
                cell.setAttribute('data-month', controlMonth.month);
                cell.setAttribute('data-year', controlMonth.year);
            }
        }
    } catch (error) {
        console.error('Error cargando estado de stock:', error);
        
        // Mostrar error en las celdas
        const stockCard = document.querySelector('.stock-status-card');
        if (stockCard) {
            stockCard.querySelector('.card-title').innerHTML = 'VALIDACIÓN DE STOCK <small class="text-muted">(Error al cargar)</small>';
            stockCard.querySelectorAll('.stock-period-cell .period-status').forEach(elem => {
                elem.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i>';
            });
        }
    }
}

// Modificar la función initStockValidation en zona_sur.js
function initStockValidation() {
    loadStockValidation();
    
    // Agregar event listeners a las celdas de períodos
    document.querySelectorAll('.stock-period-cell').forEach(cell => {
        cell.addEventListener('click', function() {
            const period = this.dataset.period;
            const year = parseInt(this.dataset.year) || new Date().getFullYear();
            const month = parseInt(this.dataset.month) || new Date().getMonth() + 1;
            
            showStockDetails(year, month, period);
        });
    });
    
    // Actualizar cada 5 minutos
    setInterval(loadStockValidation, 300000);
}
});