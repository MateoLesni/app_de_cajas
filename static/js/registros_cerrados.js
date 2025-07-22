document.addEventListener('DOMContentLoaded', function() {
    const detalleModal = document.getElementById('detalleModal');
    const eliminarPagoModal = document.getElementById('eliminarPagoModal');
    const closeButtons = document.getElementsByClassName('close');
    let currentRegistroId = null;
    let currentPagoId = null;

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

    // Mostrar mensaje de alerta
    function mostrarAlerta(titulo, mensaje, tipo = 'success') {
        Swal.fire({
            title: titulo,
            text: mensaje,
            icon: tipo,
            confirmButtonText: 'Aceptar'
        });
    }

    // Mostrar error
    function mostrarError(mensaje) {
        Swal.fire({
            title: 'Error',
            text: mensaje,
            icon: 'error',
            confirmButtonText: 'Aceptar'
        });
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
                <div class="form-row">
                    <label>Neto Vta Total:</label>
                    <div class="valor monto">${formatCurrency(registro.netoVta)}</div>
                </div>
                <div class="form-row">
                    <label>IVA:</label>
                    <div class="valor monto">${formatCurrency(registro.iva)}</div>
                </div>
                <div class="form-row">
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
                <div class="form-row observaciones">
                    <label>Observaciones:</label>
                    <div class="valor">${registro.observaciones}</div>
                </div>
                ` : ''}
                <div class="form-row estado-cerrado">
                    <label>Estado:</label>
                    <div class="valor"><span class="badge badge-closed">CERRADO</span></div>
                </div>
            </div>
        `;

        // Mostrar historial de pagos
        const totalPagado = calcularTotalPagos(registro.pagos);

        if (registro.pagos && registro.pagos.length > 0) {
            pagosHistorial.innerHTML = `
                <div class="resumen-pagos">
                    <div class="total-pagado">
                        <strong>Total Pagado:</strong> ${formatCurrency(totalPagado)}
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
                    const pagoIndex = parseInt(pagoId);
                    
                    // Obtener detalles del pago (ya sea por ID o por índice)
                    const pago = registro.pagos.find((p, i) => p.id === pagoId || i === pagoIndex);
                    
                    if (pago) {
                        mostrarConfirmacionEliminarPago(registro.id, pago, pagoId);
                    }
                });
            });
        } else {
            pagosHistorial.innerHTML = '<p>No hay pagos registrados</p>';
        }

    // Reemplaza la sección de mostrar archivos adjuntos con este código
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

    // Mostrar confirmación de eliminar pago
    function mostrarConfirmacionEliminarPago(registroId, pago, pagoId) {
        currentRegistroId = registroId;
        currentPagoId = pagoId;
        
        const pagoDetalles = document.getElementById('pagoDetalles');
        pagoDetalles.innerHTML = `
            <p><strong>Comprobante:</strong> ${pago.numeroComprobante || 'No especificado'}</p>
            <p><strong>Fecha:</strong> ${pago.fecha}</p>
            <p><strong>Monto:</strong> ${formatCurrency(pago.monto)}</p>
            <p><strong>Medio:</strong> ${pago.medioPago}</p>
        `;
        
        eliminarPagoModal.style.display = 'block';
    }

    // Reabrir un registro cerrado
    async function reabrirRegistro(registroId) {
        try {
            Swal.fire({
                title: 'Procesando...',
                text: 'Reabriendo factura',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const response = await fetch(`/registro/${registroId}/reabrir`, {
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
                throw new Error(data.message || 'Error al reabrir la factura');
            }
            
            await Swal.fire({
                title: 'Éxito',
                text: 'Factura reabierta correctamente',
                icon: 'success',
                confirmButtonText: 'Aceptar'
            });
            
            window.location.href = '/registros';
            
        } catch (error) {
            console.error('Error al reabrir registro:', error);
            Swal.close();
            mostrarError(error.message || 'Error al reabrir la factura');
            
            if (error.message && error.message.includes('sesión')) {
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            }
        }
    }

    // Eliminar un pago
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
            mostrarError(error.message || 'Error al eliminar el pago');
            
            if (error.message && error.message.includes('sesión')) {
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            }
        }
    }

    // Event listeners para los botones "Ver más"
    document.querySelectorAll('.btn-ver-mas').forEach(btn => {
        btn.addEventListener('click', function() {
            const registroId = this.closest('tr').dataset.id;
            currentRegistroId = registroId;
            
            const registro = registros.find(r => r.id === registroId);
            if (registro) {
                mostrarDetalles(registro);
                detalleModal.style.display = 'block';
            }
        });
    });

    // Botón para reabrir factura
    const btnReopenRegistro = document.getElementById('btnReopenRegistro');
    if (btnReopenRegistro) {
        btnReopenRegistro.addEventListener('click', function() {
            if (!currentRegistroId) {
                mostrarError('ID de registro no válido');
                return;
            }
            
            Swal.fire({
                title: '¿Reabrir factura?',
                text: 'Esta acción cambiará el estado de la factura a pendiente',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, reabrir',
                cancelButtonText: 'Cancelar',
                reverseButtons: true
            }).then((result) => {
                if (result.isConfirmed) {
                    reabrirRegistro(currentRegistroId);
                }
            });
        });
    }

    // Botón para confirmar eliminación de pago
    const btnConfirmarEliminar = document.getElementById('btnConfirmarEliminar');
    if (btnConfirmarEliminar) {
        btnConfirmarEliminar.addEventListener('click', function() {
            if (!currentRegistroId || !currentPagoId) {
                mostrarError('Información del pago no válida');
                eliminarPagoModal.style.display = 'none';
                return;
            }
            
            eliminarPago(currentRegistroId, currentPagoId);
        });
    }

    // Botón para cancelar eliminación
    const btnCancelarEliminar = document.getElementById('btnCancelarEliminar');
    if (btnCancelarEliminar) {
        btnCancelarEliminar.addEventListener('click', function() {
            eliminarPagoModal.style.display = 'none';
        });
    }

    // Cerrar modales
    Array.from(closeButtons).forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            modal.style.display = 'none';
        });
    });

    // Cerrar modales al hacer clic fuera
    window.addEventListener('click', (e) => {
        if (e.target === detalleModal) {
            detalleModal.style.display = 'none';
        }
        if (e.target === eliminarPagoModal) {
            eliminarPagoModal.style.display = 'none';
        }
    });
});