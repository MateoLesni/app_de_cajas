// Last updated: 2025-04-21 14:54:28
// Current user: pomenuken

document.addEventListener('DOMContentLoaded', function() {
    const detalleModal = document.getElementById('detalleModal');
    const pagoModal = document.getElementById('pagoModal');
    const adjuntoModal = document.getElementById('adjuntoModal');
    const closeButtons = document.getElementsByClassName('close');
window.currentRegistroId = null;

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

    // Formatear números como moneda
    function formatCurrency(number) {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 2
        }).format(parseFloat(number) || 0);
    }

    // Formatear fecha
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('es-AR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    // Calcular total de pagos
    function calcularTotalPagos(pagos) {
        if (!pagos || !Array.isArray(pagos)) return 0;
        return pagos.reduce((total, pago) => total + (parseFloat(pago.monto) || 0), 0);
    }

    // Mostrar detalles del registro
    function mostrarDetalles(registro) {
        const detalleContent = document.getElementById('detalleContent');
        const pagosHistorial = document.getElementById('pagosHistorial');
        const archivosList = document.getElementById('archivosList');

        // Mostrar detalles principales en formato vertical
        detalleContent.innerHTML = `
            <div class="detalle-formulario">
                <div class="form-row">
                    <label>Pedido:</label>
                    <div class="valor">${registro.id}</div>
                </div>
                <div class="form-row">
                    <label>Fecha y Hora:</label>
                    <div class="valor">${registro.datetime}</div>
                </div>
                <div class="form-row">
                    <label>Usuario:</label>
                    <div class="valor">${registro.usuario}</div>
                </div>
                <div class="form-row">
                    <label>Cliente:</label>
                    <div class="valor">${registro.cliente}</div>
                </div>
                <div class="form-row section-break">
                    <label>Neto Vta Total:</label>
                    <div class="valor monto">${formatCurrency(registro.netoVta)}</div>
                </div>
                <div class="form-row">
                    <label>IVA:</label>
                    <div class="valor monto">${formatCurrency(registro.iva)}</div>
                </div>
                <div class="form-row section-break">
                    <label>NG:</label>
                    <div class="valor monto">${formatCurrency(registro.ng)}</div>
                </div>
                <div class="form-row">
                    <label>TRENES:</label>
                    <div class="valor monto">${formatCurrency(registro.trenes)}</div>
                </div>
                <div class="form-row total">
                    <label>Total Participación:</label>
                    <div class="valor monto">${formatCurrency(registro.totalParticipacion)}</div>
                </div>
                <div class="form-row">
                    <label>Origen:</label>
                    <div class="valor">${registro.origen}</div>
                </div>
                <div class="form-row">
                    <label>Sin Cargo:</label>
                    <div class="valor">${registro.sinCargo ? 'Sí' : 'No'}</div>
                </div>
                ${registro.medioPago ? `
                <div class="form-row">
                    <label>Medio de Pago:</label>
                    <div class="valor">${registro.medioPago}</div>
                </div>
                ` : ''}
                ${registro.bancoSociedad ? `
                <div class="form-row">
                    <label>Banco Sociedad:</label>
                    <div class="valor">${registro.bancoSociedad}</div>
                </div>
                ` : ''}
                ${registro.observaciones ? `
                <div class="form-row section-break observaciones">
                    <label>Observaciones:</label>
                    <div class="valor">${registro.observaciones}</div>
                </div>
                ` : ''}
            </div>
        `;

        // Mostrar historial de pagos
        const totalPagado = calcularTotalPagos(registro.pagos);
        const saldoPendiente = parseFloat(registro.totalParticipacion || 0) - totalPagado;

        if (registro.pagos && registro.pagos.length > 0) {
            pagosHistorial.innerHTML = `
                <div class="resumen-pagos">
                    <div class="total-pagado">
                        <strong>Total Pagado:</strong> ${formatCurrency(totalPagado)}
                    </div>
                    <div class="saldo-pendiente">
                        <strong>Saldo Pendiente:</strong> ${formatCurrency(saldoPendiente)}
                    </div>
                </div>
                <div class="pagos-grid">
                    ${registro.pagos.map((pago, index) => `
                        <div class="pago-item" data-pago-id="${pago.id || index}">
                            <div class="pago-header">
                                Pago ${index + 1}
                                <div class="pago-actions">
                                    <button class="btn-eliminar-pago" title="Eliminar este pago">
                                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                                            <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div class="pago-content">
                                <p><strong>Fecha:</strong> ${pago.fecha}</p>
                                <p><strong>Comprobante:</strong> ${pago.numeroComprobante || 'No especificado'}</p>
                                <p><strong>Monto:</strong> ${formatCurrency(pago.monto)}</p>
                                <p><strong>NG:</strong> ${formatCurrency(pago.ng)}</p>
                                <p><strong>TRENES:</strong> ${formatCurrency(pago.trenes)}</p>
                                <p><strong>Medio:</strong> ${pago.medioPago}</p>
                                ${pago.bancoSociedad ? `<p><strong>Banco:</strong> ${pago.bancoSociedad}</p>` : ''}
                                <p><strong>Usuario:</strong> ${pago.usuario}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            
            // Agregar event listeners para los botones de eliminar
            document.querySelectorAll('.btn-eliminar-pago').forEach(btn => {
                btn.addEventListener('click', function() {
                    const pagoItem = this.closest('.pago-item');
                    const pagoId = pagoItem.dataset.pagoId;
                    mostrarConfirmacionEliminarPago(registro.id, pagoId);
                });
            });
        } else {
            pagosHistorial.innerHTML = `
                <div class="resumen-pagos">
                    <div class="saldo-pendiente">
                        <strong>Saldo Pendiente:</strong> ${formatCurrency(registro.totalParticipacion)}
                    </div>
                </div>
                <p>No hay pagos registrados</p>
            `;
            mostrarBotonBalanceo(registro);
        }



        // Función para mostrar confirmación de eliminar pago
        function mostrarConfirmacionEliminarPago(registroId, pagoId) {
            // Buscar el registro y el pago
            const registro = registros.find(r => r.id === registroId);
            if (!registro) return;
            
            let pago;
            if (isNaN(pagoId)) {
                // Si es un UUID, buscamos por ID
                pago = registro.pagos.find(p => p.id === pagoId);
            } else {
                // Si es un número, buscamos por índice
                const pagoIndex = parseInt(pagoId);
                pago = registro.pagos[pagoIndex];
            }
            
            if (!pago) return;
            
            // Mostrar diálogo de confirmación
            Swal.fire({
                title: '¿Eliminar pago?',
                html: `
                    <p>¿Está seguro que desea eliminar este pago?</p>
                    <p><small>El pago será convertido en un anticipo disponible.</small></p>
                    <div style="text-align: left; background: #f8f9fa; padding: 15px; border-radius: 5px; margin-top: 15px; border: 1px solid #e9ecef;">
                        <p><strong>Comprobante:</strong> ${pago.numeroComprobante || 'No especificado'}</p>
                        <p><strong>Fecha:</strong> ${pago.fecha}</p>
                        <p><strong>Monto:</strong> ${formatCurrency(pago.monto)}</p>
                        <p><strong>Medio:</strong> ${pago.medioPago}</p>
                    </div>
                `,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#dc3545',
                reverseButtons: true
            }).then((result) => {
                if (result.isConfirmed) {
                    eliminarPago(registroId, pagoId);
                }
            });
        }

    // Función para eliminar un pago
    async function eliminarPago(registroId, pagoId) {
        try {
            Swal.fire({
                title: 'Procesando...',
                text: 'Eliminando pago',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const response = await fetch(`/registro/${registroId}/pago/${pagoId}/eliminar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });
            
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const htmlError = await response.text();
                if (htmlError.includes("<title>Login</title>") || htmlError.includes("login")) {
                    throw new Error('La sesión ha expirado, debe iniciar sesión nuevamente');
                } else {
                    throw new Error('El servidor no respondió con un formato esperado');
                }
            }
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Error al eliminar el pago');
            }
            
            await Swal.fire({
                title: 'Éxito',
                text: 'Pago eliminado correctamente y convertido en anticipo',
                icon: 'success',
                confirmButtonText: 'Aceptar'
            });
            
            window.location.reload();
            
        } catch (error) {
            console.error('Error al eliminar pago:', error);
            Swal.close();
            mostrarAlertaError(error.message || 'Error al eliminar el pago');
            
            if (error.message && error.message.includes('sesión')) {
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            }
        }

    }

    // Reemplaza la sección actual de mostrar archivos adjuntos con este código
    const todosArchivos = [
        ...(registro.archivos || []),
        ...(registro.pagos || []).flatMap(pago => pago.archivos || [])
    ];

    archivosList.innerHTML = todosArchivos.length ? 
        todosArchivos.map(archivo => `
            <div class="archivo-item">
                <span>${archivo}</span>
                <div class="archivo-actions">
                    <a href="/download/${archivo}" class="btn-download">Descargar</a>
                </div>
            </div>
        `).join('') : 
        '<p>No hay archivos adjuntos</p>';
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

    // Función para registrar el pago - MEJORADA CON MANEJO DE ERRORES
    async function registrarPago(registroId, formData) {
        try {
            // Validaciones previas
            const ng = formData.get('ng');
            const trenes = formData.get('trenes');
            const medioPago = formData.get('medioPago');
            const numeroComprobante = formData.get('numeroComprobante');
            
            if (!ng || !trenes || !medioPago || !numeroComprobante) {
                throw new Error('Faltan campos requeridos');
            }

            const datos = new FormData();
            datos.append('ng', parsearMoneda(ng));
            datos.append('trenes', parsearMoneda(trenes));
            datos.append('medioPago', medioPago);
            datos.append('bancoSociedad', formData.get('bancoSociedad') || '');
            datos.append('numeroComprobante', numeroComprobante);

            const fileInput = document.getElementById('fileInput');
            if (fileInput.files.length === 0) {
                throw new Error('Debe adjuntar al menos un archivo');
            }

            for (let file of fileInput.files) {
                datos.append('files[]', file);
            }

            // Verificar que el registro ID no esté vacío
            if (!registroId) {
                throw new Error('ID de registro no válido');
            }

            // Mostrar detalle en consola para depuración
            console.log(`Enviando pago para registro ID: ${registroId}`);
            
            // Realizar la solicitud con mejor manejo de errores
            const response = await fetch(`/registro/${registroId}/pago`, {
                method: 'POST',
                body: datos,
                // Añadir headers para asegurar que no se use caché
                headers: {
                    'Cache-Control': 'no-cache, no-store, max-age=0'
                }
            });

            // Verificar primero el tipo de contenido de la respuesta
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                // Si no es JSON, es probable que sea un error de sesión o un problema del servidor
                const htmlError = await response.text();
                console.error("Error: Respuesta no es JSON", htmlError);
                
                // Comprobar si contiene signos de página de inicio de sesión
                if (htmlError.includes("<title>Login</title>") || htmlError.includes("login")) {
                    throw new Error('La sesión ha expirado, debe iniciar sesión nuevamente');
                } else {
                    throw new Error('El servidor no respondió con un formato esperado. Por favor, inténtelo de nuevo o contacte al administrador.');
                }
            }

            // Ahora sabemos que es JSON, así que podemos analizarlo con seguridad
            const data = await response.json();

            // Manejar respuesta no exitosa
            if (!response.ok) {
                throw new Error(data.message || `Error ${response.status}: ${response.statusText}`);
            }

            return data;
        } catch (error) {
            console.error('Error detallado en registrarPago:', error);
            
            // Si es un error de conexión, mostrar mensaje específico
            if (error.name === 'TypeError' && error.message.includes('NetworkError')) {
                mostrarAlertaError('Error de conexión con el servidor. Verifique su conexión a internet.');
            } else {
                mostrarAlertaError(error.message || 'Error al procesar el pago');
            }
            
            // Si parece un error de sesión, redirigir al login
            if (error.message && error.message.includes('sesión')) {
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            }
            
            throw error;
        }
    }

    // Función para agregar adjuntos a un registro
    async function agregarAdjuntos(registroId, formData) {
        try {
            const fileInput = document.getElementById('fileInputAdjunto');
            if (fileInput.files.length === 0) {
                throw new Error('Debe adjuntar al menos un archivo');
            }

            const datos = new FormData();
            datos.append('observaciones', formData.get('observaciones') || '');

            for (let file of fileInput.files) {
                datos.append('files[]', file);
            }

            // Verificar que el registro ID no esté vacío
            if (!registroId) {
                throw new Error('ID de registro no válido');
            }

            // Mejorar el manejo de errores similar a registrarPago
            const response = await fetch(`/registro/${registroId}/adjuntos`, {
                method: 'POST',
                body: datos,
                headers: {
                    'Cache-Control': 'no-cache, no-store, max-age=0'
                }
            });

            // Verificar primero el tipo de contenido de la respuesta
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                // Si no es JSON, es probable que sea un error de sesión o un problema del servidor
                const htmlError = await response.text();
                console.error("Error: Respuesta no es JSON", htmlError);
                
                if (htmlError.includes("<title>Login</title>") || htmlError.includes("login")) {
                    throw new Error('La sesión ha expirado, debe iniciar sesión nuevamente');
                } else {
                    throw new Error('El servidor no respondió con un formato esperado. Por favor, inténtelo de nuevo.');
                }
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `Error ${response.status}: ${response.statusText}`);
            }

            return data;
        } catch (error) {
            console.error('Error detallado en agregarAdjuntos:', error);
            
            if (error.name === 'TypeError' && error.message.includes('NetworkError')) {
                mostrarAlertaError('Error de conexión con el servidor. Verifique su conexión a internet.');
            } else {
                mostrarAlertaError(error.message || 'Error al agregar archivos adjuntos');
            }
            
            if (error.message && error.message.includes('sesión')) {
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            }
            
            throw error;
        }
    }

    // Función de validación del formulario de pago
    function validarFormularioPago() {
        try {
            const ng = parsearMoneda(document.getElementById('ng').value);
            const trenes = parsearMoneda(document.getElementById('trenes').value);
            const medioPago = document.getElementById('medioPago').value;
            const numeroComprobante = document.getElementById('numeroComprobante').value.trim();
            const fileInput = document.getElementById('fileInput');
            const total = ng + trenes;
    
            // Validaciones básicas
            if (!numeroComprobante) {
                mostrarAlertaError('Debe ingresar un número de comprobante');
                return false;
            }
    
            if (total <= 0) {
                mostrarAlertaError('El monto total debe ser mayor a 0');
                return false;
            }
    
            if (!medioPago) {
                mostrarAlertaError('Debe seleccionar un medio de pago');
                return false;
            }
    
            if (fileInput.files.length === 0) {
                mostrarAlertaError('Debe adjuntar al menos un archivo');
                return false;
            }
    
            // Ya no validamos aquí si el monto excede el saldo pendiente
            // Esa validación se hará más adelante y mostrará un diálogo de confirmación
    
            return true;
        } catch (error) {
            console.error('Error en validación:', error);
            mostrarAlertaError('Error en la validación del formulario');
            return false;
        }
    }

    // Función de validación del formulario de adjuntos
    function validarFormularioAdjuntos() {
        const fileInput = document.getElementById('fileInputAdjunto');
        
        if (fileInput.files.length === 0) {
            mostrarAlertaError('Debe adjuntar al menos un archivo');
            return false;
        }
        
        return true;
    }

    // Función para verificar si hay excedente en un registro
    function verificarExcedente(registro) {
        if (!registro || !registro.pagos) return false;
        
        const totalParticipacion = parseFloat(registro.totalParticipacion || 0);
        const totalPagos = calcularTotalPagos(registro.pagos);
        
        return totalPagos > totalParticipacion;
    }

    // Función para mostrar botón de balanceo si es necesario
    function mostrarBotonBalanceo(registro) {
        const detalleContent = document.getElementById('detalleContent');
        const botonesAcciones = document.querySelector('.modal-actions');
        
        // Eliminar botón existente si hay uno
        const botonExistente = document.getElementById('btnBalancearFactura');
        if (botonExistente) {
            botonExistente.remove();
        }
        
        // Verificar si hay excedente
        if (verificarExcedente(registro)) {
            const totalParticipacion = parseFloat(registro.totalParticipacion || 0);
            const totalPagos = calcularTotalPagos(registro.pagos);
            const excedente = totalPagos - totalParticipacion;
            
            // Crear alerta visual
            const alertaExcedente = document.createElement('div');
            alertaExcedente.className = 'alerta-excedente';
            alertaExcedente.innerHTML = `
                <p><strong>¡Atención!</strong> Esta factura tiene un excedente de pago de ${formatCurrency(excedente)}.</p>
            `;
            
            // Insertar antes del resumen de pagos
            const pagosSection = document.querySelector('.pagos-section');
            const pagosHistorial = document.getElementById('pagosHistorial');
            pagosSection.insertBefore(alertaExcedente, pagosHistorial);
            
            // Crear botón de balanceo
            const botonBalanceo = document.createElement('button');
            botonBalanceo.id = 'btnBalancearFactura';
            botonBalanceo.className = 'btn-balancear';
            botonBalanceo.textContent = 'Balancear Factura';
            botonBalanceo.title = `Crear anticipo con el excedente de ${formatCurrency(excedente)}`;
            
            // Añadir evento al botón
            botonBalanceo.addEventListener('click', function() {
                balancearFactura(registro.id);
            });
            
            // Añadir botón a las acciones
            botonesAcciones.appendChild(botonBalanceo);
        }
    }

    // Función para balancear una factura
    async function balancearFactura(registroId) {
        try {
            Swal.fire({
                title: 'Balanceando factura...',
                text: 'Generando anticipo con el excedente',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
            
            const response = await fetch(`/registro/${registroId}/balancear`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });
            
            // Verificar el tipo de contenido
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const htmlError = await response.text();
                if (htmlError.includes("<title>Login</title>") || htmlError.includes("login")) {
                    throw new Error('La sesión ha expirado, debe iniciar sesión nuevamente');
                } else {
                    throw new Error('El servidor no respondió con un formato esperado');
                }
            }
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Error al balancear la factura');
            }
            
            await Swal.fire({
                title: 'Éxito',
                text: data.message || 'Factura balanceada correctamente. Se ha creado un anticipo con el excedente.',
                icon: 'success',
                confirmButtonText: 'Aceptar'
            });
            
            window.location.reload();
            
        } catch (error) {
            console.error('Error al balancear factura:', error);
            Swal.close();
            mostrarAlertaError(error.message || 'Error al balancear la factura');
            
            if (error.message && error.message.includes('sesión')) {
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            }
        }
    }



    // Event listeners para botones
// Actualización del event listener para los botones "Ver más"
    document.querySelectorAll('.btn-ver-mas').forEach(btn => {
        btn.addEventListener('click', function() {
            // Si estamos en formato tabla, el ID del registro está en el atributo data-id de la fila (tr)
            const registroId = this.closest('tr').dataset.id;
            currentRegistroId = registroId;
            
            const registro = registros.find(r => r.id === registroId);
            if (registro) {
                mostrarDetalles(registro);
                detalleModal.style.display = 'block';
            }
        });
    });

    // Función para formatear fechas para filtros
    function formatearFechaParaFiltro(fechaString) {
        const fecha = new Date(fechaString);
        const año = fecha.getFullYear();
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        const dia = String(fecha.getDate()).padStart(2, '0');
        
        return `${año}-${mes}-${dia}`;
    }

    // Botón nuevo pago
    document.getElementById('btnNuevoPago').addEventListener('click', function() {
        detalleModal.style.display = 'none';
        pagoModal.style.display = 'block';
        document.getElementById('pagoForm').reset();
        document.getElementById('fileList').innerHTML = '';
    });

    // Botón nuevo adjunto
    document.getElementById('btnNuevoAdjunto').addEventListener('click', function() {
        detalleModal.style.display = 'none';
        adjuntoModal.style.display = 'block';
        document.getElementById('adjuntoForm').reset();
        document.getElementById('fileListAdjunto').innerHTML = '';
    });

    // Botón cancelar pago
    document.getElementById('btnCancelarPago').addEventListener('click', function() {
        pagoModal.style.display = 'none';
        detalleModal.style.display = 'block';
    });

    // Botón cancelar adjunto
    document.getElementById('btnCancelarAdjunto').addEventListener('click', function() {
        adjuntoModal.style.display = 'none';
        detalleModal.style.display = 'block';
    });

    // Event listener del formulario de pago
    // Reemplazar el event listener del formulario de pago actual con esta versión:
    document.getElementById('pagoForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!validarFormularioPago()) {
            return;
        }

        const formData = new FormData(this);
        const registroId = currentRegistroId;

        if (!registroId) {
            mostrarAlertaError('ID de registro no válido');
            return;
        }

        try {
            // Verificar si el pago excede el saldo pendiente
            const ng = parsearMoneda(formData.get('ng'));
            const trenes = parsearMoneda(formData.get('trenes'));
            const total = ng + trenes;
            
            const registro = registros.find(r => r.id === registroId);
            if (registro) {
                const totalParticipacion = parseFloat(registro.totalParticipacion || 0);
                const pagosRealizados = calcularTotalPagos(registro.pagos);
                const saldoDisponible = totalParticipacion - pagosRealizados;

                // Si el pago excede el saldo pendiente, mostrar confirmación
                if (total > saldoDisponible && saldoDisponible > 0) {
                    const excedente = total - saldoDisponible;
                    const result = await Swal.fire({
                        title: 'Pago excedente',
                        html: `
                            <p>El monto del pago (${formatCurrency(total)}) supera el saldo pendiente (${formatCurrency(saldoDisponible)}).</p>
                            <p>El excedente de <strong>${formatCurrency(excedente)}</strong> se convertirá en un anticipo disponible para futuras facturas.</p>
                        `,
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Sí, continuar',
                        cancelButtonText: 'Cancelar',
                        confirmButtonColor: '#3085d6',
                        cancelButtonColor: '#d33',
                        reverseButtons: true
                    });

                    if (!result.isConfirmed) {
                        return; // El usuario canceló
                    }
                }
            }

            Swal.fire({
                title: 'Procesando...',
                text: 'Por favor espere',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const result = await registrarPago(registroId, formData);
            
            if (result.status === 'success') {
                // Mensaje personalizado si hay excedente
                let mensaje = 'Pago registrado correctamente';
                if (result.excedente) {
                    mensaje = `Pago registrado correctamente. El excedente de ${formatCurrency(result.excedente)} ha sido convertido en un anticipo.`;
                }
                
                await Swal.fire({
                    title: 'Éxito',
                    text: mensaje,
                    icon: 'success',
                    confirmButtonText: 'Aceptar'
                });
                
                window.location.reload();
            } else {
                throw new Error(result.message || 'Error al procesar el pago');
            }
        } catch (error) {
            console.error('Error al procesar el pago:', error);
            Swal.close(); // Cerrar el diálogo de carga si hay error
        }
    });

    // Event listener del formulario de adjuntos
    document.getElementById('adjuntoForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!validarFormularioAdjuntos()) {
            return;
        }

        const formData = new FormData(this);
        const registroId = currentRegistroId;

        if (!registroId) {
            mostrarAlertaError('ID de registro no válido');
            return;
        }

        try {
            Swal.fire({
                title: 'Procesando...',
                text: 'Por favor espere',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const result = await agregarAdjuntos(registroId, formData);
            
            if (result.status === 'success') {
                await Swal.fire({
                    title: 'Éxito',
                    text: 'Archivos adjuntados correctamente',
                    icon: 'success',
                    confirmButtonText: 'Aceptar'
                });
                window.location.reload();
            } else {
                throw new Error(result.message || 'Error al adjuntar archivos');
            }
        } catch (error) {
            console.error('Error al adjuntar archivos:', error);
            Swal.close(); // Cerrar el diálogo de carga si hay error
            // El error ya se maneja en la función agregarAdjuntos
        }
    });

    // Actualizar el total en tiempo real
    function actualizarTotal() {
        const ng = parsearMoneda(document.getElementById('ng').value);
        const trenes = parsearMoneda(document.getElementById('trenes').value);
        const total = ng + trenes;
        document.getElementById('totalParticipacion').value = formatoMoneda(total);
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

    // Manejo de archivos para el modal de adjuntos
    const dropzoneAdjunto = document.getElementById('dropzoneAdjunto');
    const fileInputAdjunto = document.getElementById('fileInputAdjunto');
    const fileListAdjunto = document.getElementById('fileListAdjunto');

    dropzoneAdjunto.addEventListener('click', () => fileInputAdjunto.click());

    dropzoneAdjunto.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzoneAdjunto.classList.add('dragover');
    });

    dropzoneAdjunto.addEventListener('dragleave', () => {
        dropzoneAdjunto.classList.remove('dragover');
    });

    dropzoneAdjunto.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzoneAdjunto.classList.remove('dragover');
        handleFilesAdjunto(e.dataTransfer.files);
    });

    fileInputAdjunto.addEventListener('change', (e) => {
        handleFilesAdjunto(e.target.files);
    });

    function handleFilesAdjunto(files) {
        fileListAdjunto.innerHTML = Array.from(files)
            .map(file => `
                <div class="file-item">
                    <span>${file.name}</span>
                    <span class="file-size">${(file.size / 1024).toFixed(1)} KB</span>
                </div>
            `).join('');
    }

    // Cerrar modales
    Array.from(closeButtons).forEach(btn => {
        btn.addEventListener('click', function() {
            detalleModal.style.display = 'none';
            pagoModal.style.display = 'none';
            adjuntoModal.style.display = 'none';
            currentRegistroId = null;
        });
    });

    // Cerrar modales al hacer clic fuera
    window.addEventListener('click', (e) => {
        if (e.target === detalleModal) {
            detalleModal.style.display = 'none';
            currentRegistroId = null;
        }
        if (e.target === pagoModal) {
            pagoModal.style.display = 'none';
        }
        if (e.target === adjuntoModal) {
            adjuntoModal.style.display = 'none';
        }
    });

    // Verificar sesión activa al inicio
    async function comprobarSesion() {
        try {
            const response = await fetch('/check-session', {
                method: 'GET',
                headers: { 'Cache-Control': 'no-cache' }
            });
            
            if (!response.ok) {
                // Si no hay sesión activa, redirigir al login
                console.warn('La sesión no está activa, redirigiendo al login...');
                window.location.href = '/login';
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('Error al verificar la sesión:', error);
            return true; // En caso de error de red, asumimos que la sesión está activa
        }
    }
    
    // Verificar sesión al inicio
    comprobarSesion();

    // Inicializar campos de moneda al cargar
    inicializarCamposMoneda();

    document.querySelectorAll('.btn-ver-mas').forEach(btn => {
        btn.addEventListener('click', function() {
            const registroId = this.closest('tr').dataset.id;
            currentRegistroId = registroId;
            
            const registro = registros.find(r => r.id === registroId);
            if (registro) {
                mostrarDetalles(registro);
                mostrarBotonBalanceo(registro); // Añadir esta línea
                detalleModal.style.display = 'block';
            }
        });
    });

    // Exportar funciones de formato para uso global
    window.formatDate = formatDate;
    window.formatCurrency = formatCurrency;
});