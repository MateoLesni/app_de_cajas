// Last updated: 2025-04-21 20:19:26
// Current user: pomenuk

document.addEventListener('DOMContentLoaded', function() {
    const pagoModal = document.getElementById('pagoModal');
    const closeButtons = document.getElementsByClassName('close');
    
    // Inicializar DateRangePicker
    $('#dateRange').daterangepicker({
        locale: {
            format: 'DD/MM/YYYY',
            applyLabel: 'Aplicar',
            cancelLabel: 'Cancelar',
            fromLabel: 'Desde',
            toLabel: 'Hasta',
            customRangeLabel: 'Rango personalizado',
            daysOfWeek: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'],
            monthNames: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
        },
        startDate: moment().subtract(29, 'days'),
        endDate: moment(),
        ranges: {
           'Hoy': [moment(), moment()],
           'Ayer': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
           'Últimos 7 días': [moment().subtract(6, 'days'), moment()],
           'Últimos 30 días': [moment().subtract(29, 'days'), moment()],
           'Este mes': [moment().startOf('month'), moment().endOf('month')],
           'Mes anterior': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
        }
    });

    // Formatear y parsear moneda - PARA TODOS LOS INPUTS DE MONEDA
    function formatoMoneda(valor) {
        // Si el valor está vacío, devolvemos una cadena vacía
        if (!valor && valor !== 0) return '';

        // Convertir a número para trabajar con él
        let number = 0;
        
        if (typeof valor === 'number') {
            number = valor;
        } else {
            // Para entrada de usuario, primero limpiamos cualquier formato existente
            // Eliminar puntos de miles y convertir comas a puntos para decimales
            const cleaned = valor.toString()
                            .replace(/\./g, '')  // Quitar puntos de miles
                            .replace(/,/g, '.'); // Reemplazar comas por puntos para decimales
            
            number = parseFloat(cleaned) || 0;
        }
        
        // Usar toLocaleString para formatear correctamente según el locale argentino
        // pero mantener el formato simple sin separador de miles para números pequeños
        if (number < 1000) {
            // Para números menores a 1000, no usar separador de miles
            return number.toFixed(2).replace('.', ',');
        } else {
            // Para números grandes, usar formato completo
            return number.toLocaleString('es-AR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }
    }

    function parsearMoneda(valor) {
        if (!valor) return 0;
        
        // Eliminar puntos de miles y convertir comas a puntos para el cálculo
        const cleaned = valor.toString()
                        .replace(/\./g, '')  // Eliminar puntos de miles
                        .replace(/,/g, '.'); // Convertir comas a puntos para decimales
        
        return parseFloat(cleaned) || 0;
    }

    // Aplicar formato a todos los inputs de moneda
    function inicializarCamposMoneda() {
        document.querySelectorAll('.currency-input').forEach(input => {
            // Almacenar valor numérico actual
            input.dataset.numericValue = '0';
            
            input.addEventListener('focus', function() {
                // Al recibir el foco, mostrar el valor sin formato para facilitar edición
                const numericValue = parsearMoneda(this.value);
                if (numericValue === 0 && this.value === formatoMoneda(0)) {
                    this.value = '';  // Si es cero, limpiar para facilitar la entrada
                }
            });
            
            input.addEventListener('input', function(e) {
                // Mantener la posición del cursor
                const cursorPos = this.selectionStart;
                const originalLength = this.value.length;
                
                // Al escribir, permitir solo dígitos y una coma
                let value = this.value.replace(/[^\d,]/g, '');
                
                // Asegurar solo una coma
                const commaCount = (value.match(/,/g) || []).length;
                if (commaCount > 1) {
                    const firstCommaPos = value.indexOf(',');
                    value = value.substring(0, firstCommaPos + 1) + 
                            value.substring(firstCommaPos + 1).replace(/,/g, '');
                }
                
                this.value = value;
                
                // Guardar el valor numérico para cálculos
                this.dataset.numericValue = parsearMoneda(value).toString();
                
                // Recalcular total si es un campo relevante
                if (['ng', 'trenes'].includes(this.id)) {
                    actualizarTotal();
                }
            });
            
            input.addEventListener('blur', function() {
                // Al perder foco, aplicar formato completo
                const numericValue = parsearMoneda(this.value);
                this.value = formatoMoneda(numericValue);
            });
            
            // Inicializar con formato
            if (input.value) {
                input.value = formatoMoneda(input.value);
            }
        });
    }

    // Función para formatear moneda
    function formatCurrency(number) {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 2
        }).format(parseFloat(number) || 0);
    }

    // Función para formatear fecha
    function formatDate(dateString) {
        return moment(dateString).format('DD/MM/YYYY HH:mm');
    }

    // Función para calcular el total en el formulario de pago
    function actualizarTotal() {
        const ng = parsearMoneda(document.getElementById('ng').value);
        const trenes = parsearMoneda(document.getElementById('trenes').value);
        const total = ng + trenes;
        document.getElementById('totalParticipacion').value = formatoMoneda(total);
    }

    // Función para filtrar registros y pagos no vinculados
    function filtrarRegistros() {
        const dateRange = $('#dateRange').val().split(' - ');
        const startDate = moment(dateRange[0], 'DD/MM/YYYY').startOf('day');
        const endDate = moment(dateRange[1], 'DD/MM/YYYY').endOf('day');
        const cliente = document.getElementById('cliente').value.toLowerCase().trim();
        const origen = document.getElementById('origen').value;
        const medioPago = document.getElementById('medioPago').value;
        const saldoMin = parseFloat(document.getElementById('saldoMin').value) || 0;
        const saldoMax = parseFloat(document.getElementById('saldoMax').value) || Infinity;
        const tipoPago = document.getElementById('tipoPago') ? document.getElementById('tipoPago').value : '';
    
        // Verificar que pagosNoVinculados existe y es un array
        if (typeof pagosNoVinculados === 'undefined') {
            console.error("La variable pagosNoVinculados no está definida");
            return registros; // Devolver solo los registros normales si no hay pagos no vinculados
        }
    
        // Filtrar registros normales (facturas)
        let registrosFiltrados = [];
        if (tipoPago !== 'no_vinculados') {
            registrosFiltrados = registros.filter(registro => {
                try {
                    const fecha = moment(registro.datetime);
                    const saldoPendiente = parseFloat(registro.saldoPendiente) || 0;
                    const ultimoMedioPago = registro.pagos && registro.pagos.length > 0 
                        ? registro.pagos[registro.pagos.length - 1].medioPago 
                        : '';
    
                    // IMPORTANTE: Agregar esta condición para excluir registros CERRADOS con saldo 0
                    if (registro.estado === 'CERRADO' && saldoPendiente === 0) {
                        console.log(`Excluyendo registro ${registro.id} - CERRADO con saldo 0`);
                        return false;
                    }
    
                    return fecha.isBetween(startDate, endDate, 'day', '[]') &&
                           (!cliente || registro.cliente.toLowerCase().includes(cliente)) &&
                           (!origen || registro.origen === origen) &&
                           (!medioPago || ultimoMedioPago === medioPago) &&
                           saldoPendiente >= saldoMin &&
                           saldoPendiente <= saldoMax;
                } catch (error) {
                    console.error("Error al filtrar registro:", error, registro);
                    return false;
                }
            });
        }
    
        // Filtrar pagos no vinculados y convertirlos a formato similar para mostrar en tabla
        let pagosNoVinculadosFiltrados = [];
        if (tipoPago !== 'vinculados' && Array.isArray(pagosNoVinculados)) {
            pagosNoVinculadosFiltrados = pagosNoVinculados.filter(pago => {
                try {
                    const fecha = moment(pago.fecha);
                    return fecha.isBetween(startDate, endDate, 'day', '[]') &&
                           (!cliente || pago.cliente.toLowerCase().includes(cliente.toLowerCase())) &&
                           (!medioPago || pago.medioPago === medioPago);
                } catch (error) {
                    console.error("Error al filtrar pago no vinculado:", error, pago);
                    return false;
                }
            }).map(pago => ({
                id: `NV-${pago.id}`, // Prefijo NV para No Vinculado
                datetime: pago.fecha,
                cliente: pago.cliente,
                origen: 'N/A',
                netoVta: 0,
                iva: 0,
                ng: pago.ng,
                trenes: pago.trenes,
                totalParticipacion: pago.monto,
                saldoPendiente: 0,
                estado: 'PAGADO',
                pagos: [pago],
                noVinculado: true // Marcar como no vinculado para identificarlo
            }));
        }
    
        // Combinar ambos resultados
        return [...registrosFiltrados, ...pagosNoVinculadosFiltrados];
    }

    // Función para calcular totales y actualizar las cards
    // Función para calcular totales y actualizar las cards - CORREGIDA
    // Función para calcular totales y actualizar las cards - CORREGIDA
    function actualizarCards(registrosFiltrados) {
        // 1. Calcular total facturación (suma de totalParticipacion de registros normales)
        const totalFacturacion = registrosFiltrados
            .filter(registro => !registro.noVinculado)
            .reduce((total, registro) => total + (parseFloat(registro.totalParticipacion) || 0), 0);

        // 2. Calcular total pagos (suma de todos los montos de pagos + pagos no vinculados)
        let totalPagos = 0;
        
        // Pagos vinculados a registros
        registrosFiltrados.filter(registro => !registro.noVinculado).forEach(registro => {
            if (registro.pagos && Array.isArray(registro.pagos)) {
                totalPagos += registro.pagos.reduce((subtotal, pago) => 
                    subtotal + (parseFloat(pago.monto) || 0), 0);
            }
        });
        
        // Pagos no vinculados
        registrosFiltrados.filter(registro => registro.noVinculado).forEach(registro => {
            totalPagos += parseFloat(registro.totalParticipacion || 0);
        });

        // 3. Calcular saldo pendiente total como la DIFERENCIA entre facturación y pagos
        // PERMITIENDO VALORES NEGATIVOS
        const saldoPendienteTotal = totalFacturacion - totalPagos;

        // Actualizar las cards con los nuevos valores
        document.getElementById('total-facturacion').textContent = formatCurrency(totalFacturacion);
        document.getElementById('total-pagos').textContent = formatCurrency(totalPagos);
        document.getElementById('saldo-total').textContent = formatCurrency(saldoPendienteTotal);

        // Actualizar con colores según los valores
        document.getElementById('total-facturacion').classList.add('text-success');
        document.getElementById('total-pagos').classList.add('text-primary');
        document.getElementById('saldo-total').classList.add('text-danger');

        // Actualizar también el resumen al final de la tabla
        const totalSaldoPendienteElement = document.getElementById('totalSaldoPendiente');
        if (totalSaldoPendienteElement) {
            totalSaldoPendienteElement.textContent = formatCurrency(saldoPendienteTotal);
        }
        
        // Registrar para depuración
        console.log('Totales actualizados:', {
            totalFacturacion: formatCurrency(totalFacturacion),
            totalPagos: formatCurrency(totalPagos),
            saldoPendienteTotal: formatCurrency(saldoPendienteTotal)
        });
    }

    // Función para actualizar la tabla con totales
    function actualizarTabla(registrosFiltrados) {
        const tbody = document.querySelector('#resultsTable tbody');
        tbody.innerHTML = '';

        // Variables para los totales
        let totalSaldoPendiente = 0;

        registrosFiltrados.forEach(registro => {
            const saldoPendiente = parseFloat(registro.saldoPendiente) || 0;
            
            // Solo sumar saldo pendiente de registros normales (no pagos no vinculados)
            if (!registro.noVinculado) {
                totalSaldoPendiente += saldoPendiente;
            }
            
            const tr = document.createElement('tr');
            
            // Aplicar clase especial para pagos no vinculados
            if (registro.noVinculado) {
                tr.classList.add('no-vinculado');
            }
            
            tr.innerHTML = `
                <td>${formatDate(registro.datetime)}</td>
                <td>${registro.id}</td>
                <td>${registro.cliente}</td>
                <td>${registro.origen}</td>
                <td>${formatCurrency(registro.netoVta)}</td>
                <td>${formatCurrency(registro.ng)}</td>
                <td>${formatCurrency(registro.trenes)}</td>
                <td>${formatCurrency(registro.totalParticipacion)}</td>
                <td>${formatCurrency(saldoPendiente)}</td>
                <td>${registro.noVinculado ? 'PAGO NV' : (registro.estado || 'PENDIENTE')}</td>
                <td>${registro.pagos && registro.pagos.length > 0 ? registro.pagos[registro.pagos.length - 1].medioPago : '-'}</td>
            `;
            tbody.appendChild(tr);
        });

        // Actualizar el resumen de resultados
        const resultsSummary = document.getElementById('resultsSummary');
        const totalRegistrosElement = document.getElementById('totalRegistros');
        const totalSaldoPendienteElement = document.getElementById('totalSaldoPendiente');
        
        if (registrosFiltrados.length > 0) {
            totalRegistrosElement.textContent = registrosFiltrados.length;
            totalSaldoPendienteElement.textContent = formatCurrency(totalSaldoPendiente);
            resultsSummary.style.display = 'flex';
        } else {
            resultsSummary.style.display = 'none';
        }

        // Actualizar las cards con los datos filtrados
        actualizarCards(registrosFiltrados);
    }

    // Función para exportar a Excel
    function exportarExcel(registrosFiltrados) {
        const wb = XLSX.utils.book_new();
        
        // Preparar datos para Excel
        const datos = registrosFiltrados.map(registro => {
            const esNoVinculado = registro.noVinculado;
            return {
                'Fecha': formatDate(registro.datetime),
                'N° Pedido': registro.id,
                'Cliente': registro.cliente,
                'Origen': registro.origen,
                'Neto Vta': parseFloat(registro.netoVta),
                'NG': parseFloat(registro.ng),
                'TRENES': parseFloat(registro.trenes),
                'Total Participación': parseFloat(registro.totalParticipacion),
                'Saldo Pendiente': parseFloat(registro.saldoPendiente),
                'Estado': esNoVinculado ? 'PAGO NV' : (registro.estado || 'PENDIENTE'),
                'Medio de Pago': registro.pagos && registro.pagos.length > 0 ? 
                    registro.pagos[registro.pagos.length - 1].medioPago : '-',
                'Tipo': esNoVinculado ? 'No Vinculado' : 'Vinculado'
            };
        });

    // Dentro de la función exportarExcel
    // Reemplazar las líneas donde calculamos el saldo pendiente con:

    // Calcular totales para Excel
    const totalParticipacion = registrosFiltrados
    .filter(r => !r.noVinculado)
    .reduce((total, r) => total + (parseFloat(r.totalParticipacion) || 0), 0);

    // Calcular total pagos
    let totalPagos = 0;

    // Pagos vinculados a registros
    registrosFiltrados.filter(r => !r.noVinculado).forEach(r => {
    if (r.pagos && Array.isArray(r.pagos)) {
        const pagosTotales = r.pagos.reduce((subtotal, pago) => 
            subtotal + (parseFloat(pago.monto) || 0), 0);
        totalPagos += pagosTotales;
    }
    });

    // Pagos no vinculados
    registrosFiltrados.filter(r => r.noVinculado).forEach(r => {
    totalPagos += parseFloat(r.totalParticipacion || 0);
    });

    // Calcular saldo pendiente como la diferencia entre facturación y pagos
    // PERMITIENDO VALORES NEGATIVOS
    const totalSaldoPendiente = totalParticipacion - totalPagos;

        // Agregar una fila en blanco y luego los totales
        datos.push({});
        datos.push({
            'Fecha': '',
            'N° Pedido': '',
            'Cliente': '',
            'Origen': '',
            'Neto Vta': '',
            'NG': '',
            'TRENES': '',
            'Total Participación': 'TOTAL REGISTROS:',
            'Saldo Pendiente': registrosFiltrados.length,
            'Estado': '',
            'Medio de Pago': '',
            'Tipo': ''
        });
        datos.push({
            'Fecha': '',
            'N° Pedido': '',
            'Cliente': '',
            'Origen': '',
            'Neto Vta': '',
            'NG': '',
            'TRENES': '',
            'Total Participación': 'TOTAL FACTURACIÓN:',
            'Saldo Pendiente': totalParticipacion,
            'Estado': '',
            'Medio de Pago': '',
            'Tipo': ''
        });
        datos.push({
            'Fecha': '',
            'N° Pedido': '',
            'Cliente': '',
            'Origen': '',
            'Neto Vta': '',
            'NG': '',
            'TRENES': '',
            'Total Participación': 'TOTAL PAGOS:',
            'Saldo Pendiente': totalPagos,
            'Estado': '',
            'Medio de Pago': '',
            'Tipo': ''
        });
        datos.push({
            'Fecha': '',
            'N° Pedido': '',
            'Cliente': '',
            'Origen': '',
            'Neto Vta': '',
            'NG': '',
            'TRENES': '',
            'Total Participación': 'SALDO PENDIENTE:',
            'Saldo Pendiente': saldoPendienteCalculado,
            'Estado': '',
            'Medio de Pago': '',
            'Tipo': ''
        });

        const ws = XLSX.utils.json_to_sheet(datos);

        // Configurar ancho de columnas
        const wscols = [
            {wch: 16}, // Fecha
            {wch: 12}, // N° Pedido
            {wch: 30}, // Cliente
            {wch: 15}, // Origen
            {wch: 12}, // Neto Vta
            {wch: 12}, // NG
            {wch: 12}, // TRENES
            {wch: 18}, // Total Participación
            {wch: 15}, // Saldo Pendiente
            {wch: 10}, // Estado
            {wch: 15},  // Medio de Pago
            {wch: 12}   // Tipo
        ];
        ws['!cols'] = wscols;

        XLSX.utils.book_append_sheet(wb, ws, "Reporte");
        
        // Generar el archivo
        const fechaActual = moment().format('YYYYMMDD_HHmmss');
        XLSX.writeFile(wb, `Reporte_${fechaActual}.xlsx`);
    }

    // Función para mostrar alerta de error
    function mostrarAlertaError(mensaje) {
        Swal.fire({
            title: 'Error',
            text: mensaje,
            icon: 'error',
            confirmButtonText: 'Aceptar',
            customClass: {
                popup: 'alert-popup'
            }
        });
    }

    // Función para mostrar alerta de éxito
    function mostrarAlertaExito(mensaje) {
        Swal.fire({
            title: 'Éxito',
            text: mensaje,
            icon: 'success',
            confirmButtonText: 'Aceptar',
            customClass: {
                popup: 'alert-popup'
            }
        });
    }

    // Función para validar y enviar un pago no vinculado
    async function enviarPagoNoVinculado(formData) {
        try {
            // Validar datos del formulario
            const ng = parsearMoneda(document.getElementById('ng').value);
            const trenes = parsearMoneda(document.getElementById('trenes').value);
            const medioPago = document.getElementById('medioPagoPago').value;
            const cliente = document.getElementById('clientePago').value;
            const numeroComprobante = document.getElementById('numeroComprobante').value.trim();
            const total = ng + trenes;

            if (!numeroComprobante || !cliente || !medioPago || total <= 0) {
                throw new Error('Faltan campos requeridos o el monto total debe ser mayor a 0');
            }

            const fileInput = document.getElementById('fileInput');
            if (fileInput.files.length === 0) {
                throw new Error('Debe adjuntar al menos un archivo');
            }

            // Crear el FormData para enviar
            const datos = new FormData();
            datos.append('ng', ng);
            datos.append('trenes', trenes);
            datos.append('medioPago', medioPago);
            datos.append('cliente', cliente);
            datos.append('bancoSociedad', document.getElementById('bancoSociedad').value || '');
            datos.append('numeroComprobante', numeroComprobante);
            datos.append('observaciones', document.getElementById('observacionesPago').value || '');

            // Agregar archivos
            for (let file of fileInput.files) {
                datos.append('files[]', file);
            }

            // Enviar solicitud al servidor
            const response = await fetch('/pago-no-vinculado', {
                method: 'POST',
                body: datos,
                headers: {
                    'Cache-Control': 'no-cache, no-store, max-age=0'
                }
            });

            // Verificar tipo de contenido
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const htmlError = await response.text();
                console.error('Error: Respuesta no es JSON', htmlError);
                
                if (htmlError.includes('<title>Login</title>') || htmlError.includes('login')) {
                    throw new Error('La sesión ha expirado, debe iniciar sesión nuevamente');
                } else {
                    throw new Error('El servidor no respondió con un formato esperado');
                }
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `Error ${response.status}: ${response.statusText}`);
            }

            return data;
        } catch (error) {
            console.error('Error al procesar el pago:', error);
            
            if (error.name === 'TypeError' && error.message.includes('NetworkError')) {
                mostrarAlertaError('Error de conexión con el servidor. Verifique su conexión a internet.');
            } else {
                mostrarAlertaError(error.message || 'Error al procesar el pago');
            }
            
            if (error.message && error.message.includes('sesión')) {
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            }
            
            throw error;
        }
    }

    // Manejo de archivos
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    function handleFiles(files) {
        fileList.innerHTML = Array.from(files)
            .map(file => `
                <div class="file-item">
                    <span>${file.name}</span>
                    <span class="file-size">${(file.size / 1024).toFixed(1)} KB</span>
                </div>
            `).join('');
    }

    // Event listeners
    document.getElementById('btnFiltrar').addEventListener('click', function() {
        const registrosFiltrados = filtrarRegistros();
        actualizarTabla(registrosFiltrados);
    });

    document.getElementById('btnExportar').addEventListener('click', function() {
        const registrosFiltrados = filtrarRegistros();
        exportarExcel(registrosFiltrados);
    });

    // Botón agregar pago
    document.getElementById('btnAgregarPago').addEventListener('click', function() {
        document.getElementById('pagoForm').reset();
        document.getElementById('fileList').innerHTML = '';
        pagoModal.style.display = 'block';
    });

    // Botón cancelar pago
    document.getElementById('btnCancelarPago').addEventListener('click', function() {
        pagoModal.style.display = 'none';
    });

    // Event listener para el formulario de pago
    document.getElementById('pagoForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        try {
            Swal.fire({
                title: 'Procesando...',
                text: 'Por favor espere',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const result = await enviarPagoNoVinculado(new FormData(this));
            
            if (result.status === 'success') {
                await mostrarAlertaExito('Pago registrado correctamente');
                pagoModal.style.display = 'none';
                
                // Agregar el nuevo pago a la lista local para actualizar la UI
                if (result.data && result.data.pago) {
                    pagosNoVinculados.push(result.data.pago);
                }
                
                // Recalcular y actualizar la tabla
                const registrosFiltrados = filtrarRegistros();
                actualizarTabla(registrosFiltrados);
            } else {
                throw new Error(result.message || 'Error al procesar el pago');
            }
        } catch (error) {
            console.error('Error al procesar el pago:', error);
            Swal.close();
        }
    });

    // Cerrar modales
    Array.from(closeButtons).forEach(btn => {
        btn.addEventListener('click', function() {
            pagoModal.style.display = 'none';
        });
    });

    // Cerrar modal al hacer clic fuera
    window.addEventListener('click', (e) => {
        if (e.target === pagoModal) {
            pagoModal.style.display = 'none';
        }
    });

    inicializarCamposMoneda();
    const todosLosRegistros = filtrarRegistros();
    console.log("Total registros filtrados al inicio:", todosLosRegistros.length);
    actualizarTabla(todosLosRegistros);
});