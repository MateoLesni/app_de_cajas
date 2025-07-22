// static/js/transferencias.js
// Last updated: 2025-06-06 15:33:19
// Current user: pomenuk

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('transferForm');
    let lastSubmitTime = 0;
    const SUBMIT_DELAY = 3000; // 3 segundos entre envíos

    // Función para controlar el tiempo entre envíos
    function canSubmit() {
        const now = Date.now();
        if (now - lastSubmitTime < SUBMIT_DELAY) {
            return false;
        }
        lastSubmitTime = now;
        return true;
    }

    // Inicializar Flatpickr
    flatpickr("#fecha", {
        locale: "es",
        dateFormat: "Y-m-d",
        defaultDate: "today",
        allowInput: true,
        maxDate: "today",
        disableMobile: "true",
        onChange: function(selectedDates, dateStr) {
            // Validar fecha cuando cambia
            validateFechaChange(dateStr);
        }
    });

    // Inicializar Select2
    $('.select2').select2({
        width: '100%',
        language: 'es',
        placeholder: 'Seleccionar...',
        allowClear: true,
        minimumInputLength: 0,
        theme: 'default'
    });

    // Manejar el cambio de zona
    $('#zona').on('change', function() {
        const zona = $(this).val();
        const $etiqueta = $('#etiqueta');
        
        // Limpiar etiquetas
        $etiqueta.empty().append('<option value="">Seleccione una etiqueta</option>');
        
        if (zona && ETIQUETAS_POR_ZONA[zona]) {
            // Habilitar el select de etiquetas
            $etiqueta.prop('disabled', false);
            
            // Agregar las etiquetas correspondientes a la zona
            ETIQUETAS_POR_ZONA[zona].forEach(etiqueta => {
                $etiqueta.append(`<option value="${etiqueta}">${etiqueta}</option>`);
            });
        } else {
            // Si no hay zona seleccionada, deshabilitar el select de etiquetas
            $etiqueta.prop('disabled', true);
        }
        
        // Actualizar Select2
        $etiqueta.trigger('change');
    });

    // Evento change para el campo etiqueta
    $('#etiqueta').on('change', function() {
        const etiqueta = $(this).val();
        const zona = $('#zona').val();
        const fecha = $('#fecha').val();
        const turno = $('#turno').val();
        
        if (zona && etiqueta && !validarEtiquetaZona(etiqueta, zona)) {
            Swal.fire({
                title: 'Error',
                text: 'La etiqueta seleccionada no corresponde a esta zona',
                icon: 'error',
                confirmButtonText: 'Aceptar'
            });
            $(this).val(null).trigger('change');
        } else if (zona && etiqueta && fecha) {
            // Validar fecha cuando cambia la etiqueta
            validateFechaChange(fecha);
            // Si ya hay turno seleccionado, validar también el turno
            if (turno) {
                validateTurnoChange(turno);
            }
        }
    });

    // Evento change para el campo turno
    $('#turno').on('change', function() {
        const turno = $(this).val();
        validateTurnoChange(turno);
    });

    // Función para validar la selección de turno
    async function validateTurnoChange(turno) {
        const zona = $('#zona').val();
        const etiqueta = $('#etiqueta').val();
        const fecha = $('#fecha').val();
        
        // Caso especial para BA04 en Constitución o para turnos NOCHE en general
        if ((turno === 'NOCHE' || turno === 'TGT') && zona && etiqueta && fecha) {
            try {
                // Mostrar indicador de carga pequeño
                const loadingToast = Swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000,
                    timerProgressBar: true,
                    didOpen: (toast) => {
                        toast.addEventListener('mouseenter', Swal.stopTimer)
                        toast.addEventListener('mouseleave', Swal.resumeTimer)
                    }
                });
                
                loadingToast.fire({
                    icon: 'info',
                    title: 'Validando turno...'
                });
                
                const turnoPrevioValido = await validarTurnoPrevio(zona, etiqueta, fecha, turno);
                
                if (!turnoPrevioValido) {
                    let mensaje = 'Primero debe enviar el turno DIA';
                    
                    if (zona === 'CONSTITUCION' && etiqueta === 'BA04') {
                        if (turno === 'TGT') {
                            mensaje = `Primero debe enviar el turno DIA para la etiqueta ${etiqueta} en la fecha ${fecha}`;
                        } else if (turno === 'NOCHE') {
                            // Para NOCHE en BA04, el servidor ya devuelve el mensaje específico
                            // sobre si falta el DIA o el TGT, así que usamos el mensaje del servidor
                            mensaje = `Para la etiqueta ${etiqueta} debe enviar los turnos DIA y TGT antes del turno NOCHE`;
                        }
                    } else {
                        mensaje = `Primero debe enviar el turno DIA para la etiqueta ${etiqueta} en la fecha ${fecha}`;
                    }
                    
                    Swal.fire({
                        title: 'Advertencia',
                        text: mensaje,
                        icon: 'warning',
                        confirmButtonText: 'Entendido'
                    });
                    // No reseteamos el valor, solo mostramos la advertencia
                }
            } catch (error) {
                console.error('Error al validar turno:', error);
            }
        }
    }

    // Función para validar el cambio de fecha
    async function validateFechaChange(fecha) {
        const zona = $('#zona').val();
        const etiqueta = $('#etiqueta').val();
        
        // Solo validar si tenemos todos los datos
        if (zona && etiqueta && fecha) {
            try {
                // Mostrar indicador de carga pequeño
                const loadingToast = Swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000,
                    timerProgressBar: true,
                    didOpen: (toast) => {
                        toast.addEventListener('mouseenter', Swal.stopTimer)
                        toast.addEventListener('mouseleave', Swal.resumeTimer)
                    }
                });
                
                loadingToast.fire({
                    icon: 'info',
                    title: 'Validando fecha...'
                });
                
                const fechaPreviaValida = await validarFechaPrevia(zona, etiqueta, fecha);
                
                if (!fechaPreviaValida) {
                    const fechaObj = new Date(fecha);
                    const diaAnterior = new Date(fechaObj);
                    diaAnterior.setDate(fechaObj.getDate() - 1);
                    // Formatear a YYYY-MM-DD
                    const fechaAnterior = diaAnterior.toISOString().split('T')[0];
                    // Formatear a DD/MM/YYYY para mostrar al usuario
                    const fechaAnteriorFormateada = `${diaAnterior.getDate().toString().padStart(2, '0')}/${(diaAnterior.getMonth() + 1).toString().padStart(2, '0')}/${diaAnterior.getFullYear()}`;
                    
                    Swal.fire({
                        title: 'Advertencia',
                        text: `Primero debe enviar la fecha ${fechaAnteriorFormateada} para la etiqueta ${etiqueta}`,
                        icon: 'warning',
                        confirmButtonText: 'Entendido'
                    });
                    // No reseteamos el valor, solo mostramos la advertencia
                }
            } catch (error) {
                console.error('Error al validar fecha:', error);
            }
        }
    }

    // Función para validar etiqueta según zona
    function validarEtiquetaZona(etiqueta, zona) {
        if (!ETIQUETAS_POR_ZONA[zona] || !ETIQUETAS_POR_ZONA[zona].includes(etiqueta)) {
            return false;
        }
        return true;
    }

    // Función para validar si el turno DIA existe antes de enviar el turno NOCHE o TGT
    async function validarTurnoPrevio(zona, etiqueta, fecha, turno) {
        try {
            const response = await fetch('/api/validar_turno_previo', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ zona, etiqueta, fecha, turno })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Error al validar el turno previo');
            }

            return data.valid;
        } catch (error) {
            console.error('Error al validar turno previo:', error);
            throw error;
        }
    }

    // Función para validar si la fecha anterior existe antes de enviar la fecha actual
    async function validarFechaPrevia(zona, etiqueta, fecha) {
        try {
            const response = await fetch('/api/validar_fecha_previa', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ zona, etiqueta, fecha })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Error al validar la fecha previa');
            }

            return data.valid;
        } catch (error) {
            console.error('Error al validar fecha previa:', error);
            throw error;
        }
    }

    // Función para validar campos requeridos
    function validateForm() {
        const requiredFields = [
            'fecha',
            'etiqueta',
            'zona',
            'comision',
            'turno',
            'fc',
            'estado'
        ];

        let isValid = true;
        let firstInvalidField = null;
        let errorMessages = [];

        requiredFields.forEach(field => {
            const element = document.getElementById(field);
            const value = element.value.trim();

            if (!value) {
                isValid = false;
                element.classList.add('is-invalid');
                if (!firstInvalidField) firstInvalidField = element;
                errorMessages.push(`El campo ${field} es requerido`);
            } else {
                element.classList.remove('is-invalid');
            }
        });

        // Validación específica para FC (debe ser un número positivo)
        const fcValue = document.getElementById('fc').value;
        if (fcValue && (!Number.isInteger(Number(fcValue)) || Number(fcValue) <= 0)) {
            isValid = false;
            document.getElementById('fc').classList.add('is-invalid');
            errorMessages.push('El campo FC debe ser un número entero positivo');
        }

        if (!isValid) {
            Swal.fire({
                title: 'Campos incompletos',
                html: errorMessages.join('<br>'),
                icon: 'warning',
                confirmButtonText: 'Aceptar'
            });
            if (firstInvalidField) {
                firstInvalidField.focus();
            }
        }

        return isValid;
    }

    // Manejador del envío del formulario
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Evitar múltiples envíos
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton.disabled) return;

        // Verificar si ha pasado suficiente tiempo desde el último envío
        if (!canSubmit()) {
            Swal.fire({
                title: 'Por favor espere',
                text: 'Debe esperar unos segundos entre envíos',
                icon: 'warning',
                confirmButtonText: 'Aceptar'
            });
            return;
        }

        if (!validateForm()) {
            return;
        }

        // Obtener valores para validaciones adicionales
        const zona = document.getElementById('zona').value;
        const etiqueta = document.getElementById('etiqueta').value;
        const fecha = document.getElementById('fecha').value;
        const turno = document.getElementById('turno').value;

        // Mostrar mensaje de carga para validaciones
        const validatingLoadingSwal = Swal.fire({
            title: 'Validando datos',
            text: 'Por favor espere...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            // Nueva validación: Verificar la secuencia correcta de turnos
            if (turno === 'NOCHE' || turno === 'TGT') {
                const turnoPrevioValido = await validarTurnoPrevio(zona, etiqueta, fecha, turno);
                if (!turnoPrevioValido) {
                    validatingLoadingSwal.close();
                    
                    let mensaje = '';
                    if (zona === 'CONSTITUCION' && etiqueta === 'BA04') {
                        if (turno === 'TGT') {
                            mensaje = `Primero debe enviar el turno DIA para la etiqueta ${etiqueta} en la fecha ${fecha}`;
                        } else if (turno === 'NOCHE') {
                            mensaje = `Para la etiqueta ${etiqueta} debe enviar los turnos DIA y TGT antes del turno NOCHE`;
                        }
                    } else {
                        mensaje = `Primero debe enviar el turno DIA para la etiqueta ${etiqueta} en la fecha ${fecha}`;
                    }
                    
                    Swal.fire({
                        title: 'Error de validación',
                        text: mensaje,
                        icon: 'error',
                        confirmButtonText: 'Entendido'
                    });
                    return;
                }
            }

            // Nueva validación: Verificar si existe la fecha anterior para esta etiqueta
            const fechaPreviaValida = await validarFechaPrevia(zona, etiqueta, fecha);
            if (!fechaPreviaValida) {
                validatingLoadingSwal.close();
                const fechaObj = new Date(fecha);
                const diaAnterior = new Date(fechaObj);
                diaAnterior.setDate(fechaObj.getDate() - 1);
                // Formatear a YYYY-MM-DD
                const fechaAnterior = diaAnterior.toISOString().split('T')[0];
                // Formatear a DD/MM/YYYY para mostrar al usuario
                const fechaAnteriorFormateada = `${diaAnterior.getDate().toString().padStart(2, '0')}/${(diaAnterior.getMonth() + 1).toString().padStart(2, '0')}/${diaAnterior.getFullYear()}`;
                
                Swal.fire({
                    title: 'Error de validación',
                    text: `Primero debe enviar la fecha ${fechaAnteriorFormateada} para la etiqueta ${etiqueta}`,
                    icon: 'error',
                    confirmButtonText: 'Entendido'
                });
                return;
            }

            // Cerrar el mensaje de validación
            validatingLoadingSwal.close();

            // Deshabilitar el botón para prevenir múltiples envíos
            submitButton.disabled = true;
            submitButton.textContent = 'Procesando...';

            // Mostrar mensaje de carga para el envío
            const loadingSwal = Swal.fire({
                title: 'Procesando',
                text: 'Guardando los datos...',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const formData = new FormData(this);
            const response = await fetch('/submit_transferencia', {
                method: 'POST',
                body: formData
            });

            // Corregir el orden de verificación en transferencias.js
            const data = await response.json();

            // Verificar primero el caso de duplicado
            if (response.status === 409) {
                // Caso especial para duplicados
                const duplicateData = data.duplicateData;
                await Swal.fire({
                    title: 'Registro Duplicado',
                    html: `
                        <div class="duplicate-warning">
                            <p>${data.message}</p>
                            <div class="duplicate-details">
                                <p><strong>Detalles del registro existente:</strong></p>
                                <ul>
                                    <li>Estado: ${duplicateData.estado}</li>
                                    <li>Fecha de creación: ${duplicateData.fecha_creacion}</li>
                                    <li>Usuario: ${duplicateData.usuario}</li>
                                </ul>
                            </div>
                        </div>
                    `,
                    icon: 'warning',
                    confirmButtonText: 'Entendido'
                });
                return;
            } 
            // Luego verificar otros errores
            else if (!response.ok) {
                throw new Error(data.message || 'Error en el servidor');
            }

            if (data.status === 'success') {
                // Mostrar mensaje de éxito y esperar a que el usuario lo cierre
                await Swal.fire({
                    title: '¡Éxito!',
                    text: 'El registro ha sido guardado correctamente',
                    icon: 'success',
                    confirmButtonText: 'Aceptar'
                }).then(() => {
                    // Una vez que el usuario ha visto y cerrado el mensaje, recarga la página
                    window.location.reload();
                });
            }
        } catch (error) {
            console.error('Error:', error);
            await Swal.fire({
                title: 'Error',
                html: `
                    <div class="error-message">
                        <p>${error.message || 'Ha ocurrido un error al procesar el formulario'}</p>
                        ${error.response?.status === 409 ? `
                            <div class="duplicate-details">
                                <p><strong>Detalles del registro existente:</strong></p>
                                <ul>
                                    <li>Estado: ${error.response.data.duplicateData.estado}</li>
                                    <li>Fecha de creación: ${error.response.data.duplicateData.fecha_creacion}</li>
                                    <li>Usuario: ${error.response.data.duplicateData.usuario}</li>
                                </ul>
                            </div>
                        ` : ''}
                    </div>
                `,
                icon: 'error',
                confirmButtonText: 'Aceptar'
            });
        } finally {
            // Restaurar el botón independientemente del resultado
            submitButton.disabled = false;
            submitButton.textContent = 'Guardar';
        }
    });

    // Agregar asterisco rojo en campos requeridos
    document.querySelectorAll('label').forEach(label => {
        const input = document.getElementById(label.getAttribute('for'));
        if (input && input.hasAttribute('required')) {
            label.innerHTML += ' <span class="required">*</span>';
        }
    });

    // Formatear campos numéricos
    function formatNumericInput(input) {
        input.addEventListener('input', function() {
            let value = this.value.replace(/[^0-9]/g, '');
            if (value) {
                value = parseInt(value, 10);
                this.value = value;
            }
        });
    }

    // Aplicar formato a campos numéricos
    formatNumericInput(document.getElementById('fc'));
    formatNumericInput(document.getElementById('pl'));

    // Manejar la tecla Enter
    form.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const inputs = Array.from(form.elements);
            const index = inputs.indexOf(e.target);
            if (index > -1 && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
        }
    });

    // Deshabilitar inicialmente el campo de etiquetas
    $('#etiqueta').prop('disabled', true);
});