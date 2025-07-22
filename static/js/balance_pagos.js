// Funciones para el balanceo de pagos excedentes

// Función para verificar si hay excedente en un registro
function verificarExcedente(registro) {
    if (!registro || !registro.pagos) return false;
    
    const totalParticipacion = parseFloat(registro.totalParticipacion || 0);
    const totalPagos = calcularTotalPagos(registro.pagos);
    
    return (totalPagos - totalParticipacion) > 0.01;
}

// Función para mostrar botón de balanceo si es necesario
function mostrarBotonBalanceo(registro) {
    const botonesAcciones = document.querySelector('.modal-actions');
    
    // Eliminar botón existente y alerta si hay
    const botonExistente = document.getElementById('btnBalancearFactura');
    const alertaExistente = document.querySelector('.alerta-excedente');
    
    if (botonExistente) botonExistente.remove();
    if (alertaExistente) alertaExistente.remove();
    
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