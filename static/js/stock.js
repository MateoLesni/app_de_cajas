// static/js/stock.js
// Last updated: 2025-06-27 14:22:38
// Current user: pomenuk

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('stockForm');
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
        disableMobile: "true"
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
        
        if (zona && etiqueta && !validarEtiquetaZona(etiqueta, zona)) {
            Swal.fire({
                title: 'Error',
                text: 'La etiqueta seleccionada no corresponde a esta zona',
                icon: 'error',
                confirmButtonText: 'Aceptar'
            });
            $(this).val(null).trigger('change');
        }
    });

    // Función para validar etiqueta según zona
    function validarEtiquetaZona(etiqueta, zona) {
        if (!ETIQUETAS_POR_ZONA[zona] || !ETIQUETAS_POR_ZONA[zona].includes(etiqueta)) {
            return false;
        }
        return true;
    }

    // Función para validar campos requeridos
    function validateForm() {
        const requiredFields = [
            'fecha',
            'periodo',
            'zona',
            'etiqueta'
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

        // Deshabilitar el botón para prevenir múltiples envíos
        submitButton.disabled = true;
        submitButton.textContent = 'Procesando...';

        // Mostrar mensaje de carga para el envío
        const loadingSwal = Swal.fire({
            title: 'Procesando',
            text: 'Guardando los datos de stock...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            const formData = new FormData(this);
            const response = await fetch('/submit_stock', {
                method: 'POST',
                body: formData
            });

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
                    text: 'El registro de stock ha sido guardado correctamente',
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