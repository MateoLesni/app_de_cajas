document.addEventListener('DOMContentLoaded', function() {
    // ===== Inicialización de fecha =====
    function actualizarFecha() {
        const now = new Date();
        const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
        const fechaFormateada = now.toLocaleDateString('es-AR', options);
        document.getElementById('currentDate').textContent = fechaFormateada;
    }
    actualizarFecha();

    // ===== Funciones para manejar valores monetarios =====
    function formatMoneda(valor) {
        // Si es vacío o null, devolver 0,00
        if (valor === null || valor === undefined || valor === '') {
            return '0,00';
        }

        // Convertir a número si es string
        let number = typeof valor === 'number' ? valor : parseFloat(
            valor.toString()
                .replace(/\./g, '')  // Eliminar puntos de miles
                .replace(/,/g, '.') // Convertir comas a puntos para cálculos
        ) || 0;

        // Formatear según locale argentino
        return number.toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function parseMoneda(valor) {
        if (!valor) return 0;
        
        // Eliminar puntos de miles y convertir comas a puntos para cálculos
        const cleaned = valor.toString()
            .replace(/\./g, '')
            .replace(/,/g, '.');
        
        return parseFloat(cleaned) || 0;
    }

    // ===== Cálculos automáticos =====
    // Nueva función para calcular Discovery (Total Venta Vinson - Vta Z)
    function calcularDiscovery() {
        const ventaZ = parseMoneda(document.getElementById('ventaZ').value || document.getElementById('totalVtaZ').textContent);
        const ventaVinson = parseMoneda(document.getElementById('ventaVinson').value || document.getElementById('totalVentaVinson').textContent);
        
        // Discovery = Total Venta Vinson - Venta Z
        const discovery = Math.max(0, ventaVinson - ventaZ);
        
        // Actualizar en el resumen si existe el elemento
        const discoveryElement = document.getElementById('discovery');
        if (discoveryElement) {
            discoveryElement.textContent = formatMoneda(discovery);
        }
        
        return discovery;
    }
    
    // Actualizar el total cobrado sumando todos los medios de pago
    function actualizarTotalCobrado() {
        // Sumar todos los medios de pago
        const efectivo = parseMoneda(document.getElementById('efectivo').textContent);
        const tarjeta = parseMoneda(document.getElementById('tarjeta').textContent);
        const pedidosYa = parseMoneda(document.getElementById('pedidosYa').textContent);
        const rappi = parseMoneda(document.getElementById('rappi').textContent);
        const pagos = parseMoneda(document.getElementById('pagos').textContent);
        const mercadoPago = parseMoneda(document.getElementById('mercadoPago').textContent);
        const clubAhumado = parseMoneda(document.getElementById('clubAhumado').textContent);
        
        const total = efectivo + tarjeta + pedidosYa + rappi + pagos + mercadoPago + clubAhumado;
        
        // Actualizar el elemento en pantalla
        const totalCobradoElement = document.getElementById('totalCobrado');
        if (totalCobradoElement) {
            totalCobradoElement.textContent = formatMoneda(total);
        }
        
        // Actualizar también la diferencia
        actualizarDiferencia();
        
        return total;
    }
    
    // Función para actualizar la diferencia y aplicar estilos
    function actualizarDiferencia() {
        // Obtener valores actuales
        const totalVentaVinson = parseMoneda(document.getElementById('totalVentaVinson').textContent);
        const totalCobrado = parseMoneda(document.getElementById('totalCobrado').textContent);
        
        // Calcular diferencia
        const diferencia = totalVentaVinson - totalCobrado;
        
        // Actualizar elemento en pantalla
        const diferenciaElement = document.getElementById('diferencia');
        if (diferenciaElement) {
            diferenciaElement.textContent = formatMoneda(diferencia);
            
            // Aplicar estilo según si es negativo o positivo
            if (diferencia < 0) {
                diferenciaElement.classList.add('negative-amount');
            } else {
                diferenciaElement.classList.remove('negative-amount');
            }
        }
        
        return diferencia;
    }
    
    function calcularMercadoPagoNeto() {
        const importe = parseMoneda(document.getElementById('mpImporte').value);
        const comision = parseFloat(document.getElementById('mpComision').value) || 0;
        
        const descuento = importe * (comision / 100);
        const neto = importe - descuento;
        
        document.getElementById('mpNeto').value = formatMoneda(neto);
    }

    // Inicializar campos de moneda
    document.querySelectorAll('.currency-input').forEach(input => {
        // Manejar foco
        input.addEventListener('focus', function() {
            const numericValue = parseMoneda(this.value);
            if (numericValue === 0 && this.value === formatMoneda(0)) {
                this.value = '';
            }
        });
        
        // Manejar entrada
        input.addEventListener('input', function() {
            // Permitir solo dígitos y una coma
            let value = this.value.replace(/[^\d,]/g, '');
            
            // Asegurar solo una coma
            const commaCount = (value.match(/,/g) || []).length;
            if (commaCount > 1) {
                const firstCommaPos = value.indexOf(',');
                value = value.substring(0, firstCommaPos + 1) + 
                        value.substring(firstCommaPos + 1).replace(/,/g, '');
            }
            
            this.value = value;
            
            // Si es un campo específico, realizar cálculos automáticos
            if (this.id === 'ventaZ' || this.id === 'ventaVinson') {
                calcularDiscovery();
                actualizarDiferencia();
            }
            
            if (this.id === 'mpImporte' || document.getElementById('mpComision')) {
                calcularMercadoPagoNeto();
            }
        });
        
        // Al perder foco, formatear correctamente
        input.addEventListener('blur', function() {
            const numericValue = parseMoneda(this.value);
            this.value = formatMoneda(numericValue);
        });
        
        // Inicializar con formato
        if (input.value) {
            input.value = formatMoneda(input.value);
        } else {
            input.value = formatMoneda(0);
        }
    });

    // ===== Sistema de Pestañas =====
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Remover clase active de todos los botones y panes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            // Agregar clase active al botón seleccionado
            this.classList.add('active');
            
            // Activar el panel correspondiente
            const tabId = this.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // ===== Modal de Confirmación =====
    const modal = document.getElementById('confirmationModal');
    const btnConfirm = document.getElementById('btnConfirm');
    const btnCancel = document.getElementById('btnCancel');
    const modalMessage = document.getElementById('modalMessage');
    
    function mostrarModal(mensaje, onConfirm) {
        modalMessage.textContent = mensaje;
        modal.style.display = 'flex';
        
        // Configurar el botón de confirmar
        btnConfirm.onclick = function() {
            if (typeof onConfirm === 'function') {
                onConfirm();
            }
            cerrarModal();
        };
    }
    
    function cerrarModal() {
        modal.style.display = 'none';
    }
    
    btnCancel.addEventListener('click', cerrarModal);
    
    // Cerrar modal haciendo click fuera de él
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            cerrarModal();
        }
    });

    // ===== Manejo de Formularios =====
    
    // Formulario de Ventas
    const ventasForm = document.getElementById('ventasForm');
    if (ventasForm) {
        ventasForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Obtener datos del formulario con los nuevos campos
            const formData = {
                ventaZ: parseMoneda(document.getElementById('ventaZ').value),
                ventaVinson: parseMoneda(document.getElementById('ventaVinson').value),
                ventaPixel: parseMoneda(document.getElementById('ventaPixel').value)
            };
            
            // Mostrar modal de confirmación
            mostrarModal('¿Confirma el registro de ventas?', function() {
                // Enviar datos al servidor
                fetch('/api/ventas/registrar', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formData)
                })
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        // Actualizar resumen con los nuevos campos
                        document.getElementById('totalVtaZ').textContent = formatMoneda(formData.ventaZ);
                        document.getElementById('totalVentaVinson').textContent = formatMoneda(formData.ventaVinson);
                        document.getElementById('totalVtaPixel').textContent = formatMoneda(formData.ventaPixel);
                        
                        // Calcular y actualizar discovery
                        calcularDiscovery();
                        
                        // Actualizar total cobrado y diferencia
                        actualizarTotalCobrado();
                        
                        // Mostrar mensaje de éxito
                        alert('Registro guardado correctamente');
                    } else {
                        alert('Error: ' + data.message);
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    alert('Error al procesar la solicitud');
                });
            });
        });
    }

    // Formulario de MercadoPago
    const mercadoPagoForm = document.getElementById('mercadoPagoForm');
    if (mercadoPagoForm) {
        // Inicializar cálculo
        calcularMercadoPagoNeto();
        
        mercadoPagoForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Obtener datos del formulario
            const formData = {
                importe: parseMoneda(document.getElementById('mpImporte').value),
                comision: parseFloat(document.getElementById('mpComision').value) || 0,
                neto: parseMoneda(document.getElementById('mpNeto').value)
            };
            
            // Mostrar modal de confirmación
            mostrarModal('¿Confirma el registro de MercadoPago?', function() {
                // Enviar datos al servidor
                fetch('/api/mercadopago/registrar', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formData)
                })
                .then(response => response.json())
                .then(data => {
                    if (data.status === 'success') {
                        // Actualizar resumen
                        document.getElementById('mercadoPago').textContent = formatMoneda(formData.importe);
                        
                        // Recalcular total cobrado
                        actualizarTotalCobrado();
                        
                        // Mostrar mensaje de éxito
                        alert('Registro guardado correctamente');
                    } else {
                        alert('Error: ' + data.message);
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    alert('Error al procesar la solicitud');
                });
            });
        });
        
        // Actualizar cálculo al cambiar comisión
        document.getElementById('mpComision').addEventListener('change', calcularMercadoPagoNeto);
    }

    // ===== API para cargar datos iniciales =====
    function cargarDatosIniciales() {
        // Cargar datos resumidos desde el servidor
        fetch('/api/resumenes/obtener')
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    // Actualizar tablas de resumen
                    const resumen = data.data;
                    
                    // Resumen de ventas con los nuevos campos
                    if (resumen.ventas) {
                        document.getElementById('totalVtaZ').textContent = formatMoneda(resumen.ventas.ventaZ || 0);
                        document.getElementById('totalVentaVinson').textContent = formatMoneda(resumen.ventas.ventaVinson || 0);
                        document.getElementById('totalVtaPixel').textContent = formatMoneda(resumen.ventas.ventaPixel || 0);
                        
                        // Calcular Discovery después de cargar los otros valores
                        calcularDiscovery();
                        
                        // Actualizar total cobrado
                        if (resumen.ventas.totalCobrado) {
                            document.getElementById('totalCobrado').textContent = formatMoneda(resumen.ventas.totalCobrado);
                        } else {
                            actualizarTotalCobrado();
                        }
                        
                        // Actualizar y aplicar estilo a diferencia
                        actualizarDiferencia();
                    }
                    
                    // Resumen de tarjetas
                    if (resumen.tarjetas) {
                        document.getElementById('visa').textContent = formatMoneda(resumen.tarjetas.visa || 0);
                        document.getElementById('visaDebito').textContent = formatMoneda(resumen.tarjetas.visaDebito || 0);
                        document.getElementById('mastercard').textContent = formatMoneda(resumen.tarjetas.mastercard || 0);
                        document.getElementById('mastercardDebito').textContent = formatMoneda(resumen.tarjetas.mastercardDebito || 0);
                        document.getElementById('cabal').textContent = formatMoneda(resumen.tarjetas.cabal || 0);
                        document.getElementById('cabalDebito').textContent = formatMoneda(resumen.tarjetas.cabalDebito || 0);
                        document.getElementById('amex').textContent = formatMoneda(resumen.tarjetas.amex || 0);
                        document.getElementById('maestro').textContent = formatMoneda(resumen.tarjetas.maestro || 0);
                        document.getElementById('pagosInmediatos').textContent = formatMoneda(resumen.tarjetas.pagosInmediatos || 0);
                        document.getElementById('otros').textContent = formatMoneda(resumen.tarjetas.otros || 0);
                        document.getElementById('totalTarjetas').textContent = formatMoneda(resumen.tarjetas.total || 0);
                    }
                    
                    // Medios de pago
                    if (resumen.mediosPago) {
                        document.getElementById('efectivo').textContent = formatMoneda(resumen.mediosPago.efectivo || 0);
                        document.getElementById('tarjeta').textContent = formatMoneda(resumen.mediosPago.tarjeta || 0);
                        document.getElementById('pedidosYa').textContent = formatMoneda(resumen.mediosPago.pedidosYa || 0);
                        document.getElementById('rappi').textContent = formatMoneda(resumen.mediosPago.rappi || 0);
                        document.getElementById('pagos').textContent = formatMoneda(resumen.mediosPago.pagos || 0);
                        document.getElementById('mercadoPago').textContent = formatMoneda(resumen.mediosPago.mercadoPago || 0);
                        document.getElementById('clubAhumado').textContent = formatMoneda(resumen.mediosPago.clubAhumado || 0);
                    }
                }
            })
            .catch(error => {
                console.error('Error cargando datos iniciales:', error);
            });
    }
    
    // Cargar datos al iniciar
    cargarDatosIniciales();
});

// REMESAS ---------------------------------------------------------------------------------------------------  //
document.addEventListener("DOMContentLoaded", () => {
    // 1. Completar fecha actual
    const hoy = new Date().toISOString().split("T")[0];
    document.getElementById("fecha").value = hoy;

    // 2. Cargar número de cajas (esto lo podrías guardar en sesión o localStorage)
    const cantidadCajas = localStorage.getItem("cajas") || 5; // por defecto 5
    const selectCaja = document.getElementById("caja");
    for (let i = 1; i <= cantidadCajas; i++) {
        const option = document.createElement("option");
        option.value = i;
        option.textContent = `Caja ${i}`;
        selectCaja.appendChild(option);
    }

    // 3. Capturar envío del formulario
    const remesaForm = document.getElementById("remesaForm");
    remesaForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const formData = new FormData(remesaForm);

        fetch("/guardar-remesa", {
            method: "POST",
            body: formData
        })
        .then(resp => resp.json())
        .then(data => {
            if (data.success) {
                document.getElementById("respuestaRemesa").innerHTML = `<span style="color:green;">✅ ${data.msg}</span>`;
                remesaForm.reset();
                document.getElementById("fecha").value = hoy;
            } else {
                document.getElementById("respuestaRemesa").innerHTML = `<span style="color:red;">❌ Error al guardar remesa</span>`;
            }
        })
        .catch(err => {
            document.getElementById("respuestaRemesa").innerHTML = `<span style="color:red;">❌ Error de red</span>`;
            console.error(err);
        });
    });
});

////