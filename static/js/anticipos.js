// Script unificado para la funcionalidad de anticipos
document.addEventListener('DOMContentLoaded', function() {
    // Declaraciones e inicializaciones
    let anticipoSeleccionado = null;
    const anticipoModal = document.getElementById('anticipoModal');
    const confirmarAnticipoModal = document.getElementById('confirmarAnticipoModal');
    const anticiposList = document.getElementById('anticiposList');
    
    // Verificar y obtener el elemento loader
    let loaderElement = document.querySelector('#anticipoModal .loader');
    
    // Si no existe el loader, lo creamos dinámicamente
    if (!loaderElement) {
        console.log("Creando elemento loader dinámicamente");
        loaderElement = document.createElement('div');
        loaderElement.className = 'loader';
        loaderElement.textContent = 'Cargando anticipos disponibles...';
        
        // Insertarlo en el contenedor de anticipos
        const container = document.querySelector('.anticipos-container');
        if (container) {
            container.insertBefore(loaderElement, anticiposList);
        }
    }
    
    console.log("Loader element:", loaderElement);

    // SOLUCIÓN: Definir las funciones de formato que faltan
    // Si ya existen globalmente, usamos esas. Si no, definimos nuestras propias versiones
    const formatDateFn = window.formatDate || function(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString('es-AR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };
    
    const formatCurrencyFn = window.formatCurrency || function(number) {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 2
        }).format(parseFloat(number) || 0);
    };

    // Función para mostrar alertas de error
    function mostrarAlertaError(mensaje) {
        Swal.fire({
            title: 'Error',
            text: mensaje,
            icon: 'error',
            confirmButtonText: 'Aceptar'
        });
    }

    // Función para mostrar el modal de confirmación
    function mostrarConfirmacionAnticipo(pago) {
        const anticipoDetalles = document.getElementById('anticipoDetalles');
        
        anticipoDetalles.innerHTML = `
            <p><strong>Cliente:</strong> ${pago.cliente}</p>
            <p><strong>Fecha:</strong> ${formatDateFn(pago.fecha)}</p>
            <p><strong>Comprobante:</strong> ${pago.numeroComprobante || 'N/A'}</p>
            <p><strong>Monto Total:</strong> ${formatCurrencyFn(pago.monto)}</p>
            <p><strong>NG:</strong> ${formatCurrencyFn(pago.ng)}</p>
            <p><strong>TRENES:</strong> ${formatCurrencyFn(pago.trenes)}</p>
            <p><strong>Medio de Pago:</strong> ${pago.medioPago}</p>
        `;
        
        anticipoModal.style.display = 'none';
        confirmarAnticipoModal.style.display = 'block';
    }

    // Evento para el botón "Agregar Anticipo"
    const btnAgregarAnticipo = document.getElementById('btnAgregarAnticipo');
    if (btnAgregarAnticipo) {
        btnAgregarAnticipo.addEventListener('click', async function() {
            console.log("Botón Agregar Anticipo clickeado");
            const detalleModal = document.getElementById('detalleModal');
            
            if (detalleModal) detalleModal.style.display = 'none';
            anticipoModal.style.display = 'block';
            
            // Buscar el registro actual
            const registroId = window.currentRegistroId;
            if (!registroId) {
                mostrarAlertaError('No se pudo encontrar información del registro actual');
                return;
            }
            
            const registro = registros.find(r => r.id === registroId);
            if (!registro) {
                mostrarAlertaError('No se pudo encontrar información del registro actual');
                return;
            }
            
            const clienteRegistro = registro.cliente;
            console.log("Cliente del registro:", clienteRegistro);
            
            // Mostrar loader
            if (loaderElement) loaderElement.style.display = 'block';
            if (anticiposList) anticiposList.innerHTML = '';
            
            try {
                // Intentar cargar los pagos no vinculados desde el servidor
                const response = await fetch(`/pagos-no-vinculados?cliente=${encodeURIComponent(clienteRegistro)}`);
                const data = await response.json();
                
                console.log("Datos recuperados del servidor:", data);
                
                if (data.status === 'success' && Array.isArray(data.pagos)) {
                    const anticiposCliente = data.pagos.filter(pago => 
                        pago.cliente.toLowerCase() === clienteRegistro.toLowerCase()
                    );
                    
                    if (anticiposCliente.length === 0) {
                        anticiposList.innerHTML = '<div class="no-anticipos">No hay anticipos disponibles para este cliente</div>';
                    } else {
                        // Ordenar por fecha (más recientes primero)
                        anticiposCliente.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                        
                        // Generar HTML para cada anticipo - CORREGIDO USANDO LAS FUNCIONES DE FORMATO LOCALES
                        anticiposList.innerHTML = anticiposCliente.map(pago => `
                            <div class="anticipo-item" data-id="${pago.id}">
                                <div class="anticipo-details">
                                    <div class="anticipo-cliente">${pago.cliente}</div>
                                    <div class="anticipo-fecha">Fecha: ${formatDateFn(pago.fecha)}</div>
                                    <div class="anticipo-monto">Monto: ${formatCurrencyFn(pago.monto)}</div>
                                    <div class="anticipo-medio">Medio: ${pago.medioPago} | N° Comprobante: ${pago.numeroComprobante || 'N/A'}</div>
                                </div>
                                <button class="anticipo-seleccionar" data-id="${pago.id}">Seleccionar</button>
                            </div>
                        `).join('');
                        
                        // Agregar event listeners para selección
                        document.querySelectorAll('.anticipo-seleccionar').forEach(btn => {
                            btn.addEventListener('click', function() {
                                const pagoId = this.dataset.id;
                                const pago = anticiposCliente.find(p => p.id === pagoId);
                                
                                if (!pago) {
                                    mostrarAlertaError('No se pudo encontrar información del anticipo seleccionado');
                                    return;
                                }
                                
                                console.log("Anticipo seleccionado:", pago);
                                anticipoSeleccionado = pago;
                                mostrarConfirmacionAnticipo(pago);
                            });
                        });
                        
                        console.log("Anticipos mostrados:", anticiposCliente.length);
                    }
                } else {
                    anticiposList.innerHTML = '<div class="no-anticipos">Error al cargar anticipos</div>';
                    console.error("Formato de respuesta incorrecto:", data);
                }
            } catch (error) {
                console.error("Error al cargar anticipos:", error);
                anticiposList.innerHTML = '<div class="no-anticipos">Error al cargar anticipos. Intente nuevamente.</div>';
            } finally {
                if (loaderElement) loaderElement.style.display = 'none';
            }
        });
    }

    // Event listener para el botón de confirmar anticipo
    const btnConfirmarAnticipo = document.getElementById('btnConfirmarAnticipo');
    if (btnConfirmarAnticipo) {
        btnConfirmarAnticipo.addEventListener('click', async function() {
            if (!anticipoSeleccionado || !window.currentRegistroId) {
                mostrarAlertaError('Información del anticipo o registro no válida');
                confirmarAnticipoModal.style.display = 'none';
                return;
            }
            
            try {
                // Mostrar indicador de carga
                Swal.fire({
                    title: 'Procesando...',
                    text: 'Por favor espere',
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });
                
                console.log("Enviando solicitud para vincular anticipo:", {
                    registroId: window.currentRegistroId,
                    pagoId: anticipoSeleccionado.id
                });
                
                // Enviar solicitud para vincular el anticipo
                const response = await fetch(`/registro/${window.currentRegistroId}/vincular-anticipo`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache, no-store, max-age=0'
                    },
                    body: JSON.stringify({
                        pagoId: anticipoSeleccionado.id
                    })
                });
                
                // Verificar el tipo de respuesta
                const contentType = response.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                    const htmlError = await response.text();
                    console.error("Error: Respuesta no es JSON", htmlError);
                    
                    if (htmlError.includes("<title>Login</title>") || htmlError.includes("login")) {
                        throw new Error('La sesión ha expirado, debe iniciar sesión nuevamente');
                    } else {
                        throw new Error('El servidor no respondió con un formato esperado');
                    }
                }
                
                const data = await response.json();
                console.log("Respuesta del servidor:", data);
                
                if (!response.ok) {
                    throw new Error(data.message || `Error ${response.status}: ${response.statusText}`);
                }
                
                // Mostrar mensaje de éxito
                await Swal.fire({
                    title: 'Éxito',
                    text: 'Anticipo aplicado correctamente al registro',
                    icon: 'success',
                    confirmButtonText: 'Aceptar'
                });
                
                // Recargar la página para ver los cambios
                window.location.reload();
                
            } catch (error) {
                console.error('Error al vincular anticipo:', error);
                Swal.close();
                mostrarAlertaError(error.message || 'Error al aplicar anticipo');
                
                if (error.message && error.message.includes('sesión')) {
                    setTimeout(() => {
                        window.location.href = '/login';
                    }, 2000);
                }
            }
        });
    }

    // Botones para cancelar
    const btnCancelarAnticipo = document.getElementById('btnCancelarAnticipo');
    if (btnCancelarAnticipo) {
        btnCancelarAnticipo.addEventListener('click', function() {
            anticipoModal.style.display = 'none';
            document.getElementById('detalleModal').style.display = 'block';
        });
    }

    const btnCancelarConfirmacion = document.getElementById('btnCancelarConfirmacion');
    if (btnCancelarConfirmacion) {
        btnCancelarConfirmacion.addEventListener('click', function() {
            confirmarAnticipoModal.style.display = 'none';
            anticipoModal.style.display = 'block';
        });
    }

    // Actualizar eventos para cerrar modales
    document.querySelectorAll('#anticipoModal .close, #confirmarAnticipoModal .close').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            modal.style.display = 'none';
            document.getElementById('detalleModal').style.display = 'block';
        });
    });

    // Click fuera de los modales
    window.addEventListener('click', (e) => {
        if (e.target === anticipoModal) {
            anticipoModal.style.display = 'none';
            document.getElementById('detalleModal').style.display = 'block';
        }
        if (e.target === confirmarAnticipoModal) {
            confirmarAnticipoModal.style.display = 'none';
            anticipoModal.style.display = 'block';
        }
    });

    // Estilos para los modales de anticipos
    document.head.insertAdjacentHTML('beforeend', `
    <style>
    /* Estilos para los componentes de anticipos */
    .anticipos-container {
        padding: 15px 0;
    }

    .anticipos-list {
        margin-top: 15px;
    }

    .anticipo-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 15px;
        background-color: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 5px;
        margin-bottom: 10px;
        transition: all 0.2s ease;
    }

    .anticipo-item:hover {
        background-color: #e9ecef;
        border-color: #dee2e6;
        transform: translateY(-2px);
    }

    .anticipo-details {
        flex-grow: 1;
    }

    .anticipo-cliente {
        font-weight: 600;
        margin-bottom: 3px;
    }

    .anticipo-fecha {
        color: #6c757d;
        font-size: 0.85em;
        margin-bottom: 5px;
    }

    .anticipo-monto {
        font-weight: 600;
        color: #28a745;
    }

    .anticipo-medio {
        color: #6c757d;
        font-size: 0.9em;
    }

    .anticipo-seleccionar {
        margin-left: 10px;
        background-color: #007bff;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .anticipo-seleccionar:hover {
        background-color: #0069d9;
    }

    .no-anticipos {
        text-align: center;
        padding: 20px 0;
        color: #6c757d;
    }

    .anticipo-detalle {
        background-color: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 5px;
        padding: 15px;
        margin: 15px 0;
    }

    .anticipo-detalle p {
        margin: 8px 0;
    }

    .btn-confirm {
        background-color: #28a745;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
    }

    .btn-confirm:hover {
        background-color: #218838;
    }

    .btn-agregar-anticipo {
        background-color: #8e44ad;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }

    .btn-agregar-anticipo:hover {
        background-color: #6a3386;
    }

    .modal-small {
        max-width: 500px;
    }

    .loader {
        text-align: center;
        padding: 20px 0;
        color: #6c757d;
    }
    </style>
    `);

    console.log("Script de anticipos con formato arreglado cargado correctamente");
});