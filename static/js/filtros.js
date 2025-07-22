// Script para manejar los filtros y su funcionamiento
document.addEventListener('DOMContentLoaded', function() {
    // Toggle para expandir/contraer filtros
    const toggleFiltros = document.getElementById('toggleFiltros');
    const filtrosBody = document.querySelector('.filtros-body');
    
    // Inicialmente expandido
    let filtrosExpandidos = true;
    
    if (toggleFiltros) {
        toggleFiltros.addEventListener('click', function() {
            filtrosExpandidos = !filtrosExpandidos;
            
            if (filtrosExpandidos) {
                filtrosBody.classList.remove('collapsed');
                toggleFiltros.innerHTML = '<i class="fas fa-chevron-up"></i>';
            } else {
                filtrosBody.classList.add('collapsed');
                toggleFiltros.innerHTML = '<i class="fas fa-chevron-down"></i>';
            }
        });
    }
    
    // Cargar opciones de cliente y origen
    cargarOpcionesFiltros();
    
    // Event listeners para botones de filtro
    const btnAplicarFiltros = document.getElementById('btnAplicarFiltros');
    const btnLimpiarFiltros = document.getElementById('btnLimpiarFiltros');
    
    if (btnAplicarFiltros) {
        btnAplicarFiltros.addEventListener('click', aplicarFiltros);
    }
    
    if (btnLimpiarFiltros) {
        btnLimpiarFiltros.addEventListener('click', limpiarFiltros);
    }
    
    // Botón de exportar a Excel
    const btnExportExcel = document.getElementById('btnExportExcel');
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', exportarAExcel);
    }
});

// Función para cargar las opciones de filtros
function cargarOpcionesFiltros() {
    // Solo ejecutar si estamos en la página correcta
    if (!registros) return;
    
    const filtroCliente = document.getElementById('filtroCliente');
    const filtroOrigen = document.getElementById('filtroOrigen');
    
    if (filtroCliente) {
        // Obtener clientes únicos
        const clientes = [...new Set(registros.map(r => r.cliente))].sort();
        
        // Añadir opciones
        clientes.forEach(cliente => {
            const option = document.createElement('option');
            option.value = cliente;
            option.textContent = cliente;
            filtroCliente.appendChild(option);
        });
    }
    
    if (filtroOrigen) {
        // Obtener orígenes únicos
        const origenes = [...new Set(registros.map(r => r.origen))].sort();
        
        // Añadir opciones
        origenes.forEach(origen => {
            const option = document.createElement('option');
            option.value = origen;
            option.textContent = origen;
            filtroOrigen.appendChild(option);
        });
    }
}

// Función para aplicar filtros
function aplicarFiltros() {
    const filtroCliente = document.getElementById('filtroCliente').value;
    const filtroFechaDesde = document.getElementById('filtroFechaDesde').value;
    const filtroFechaHasta = document.getElementById('filtroFechaHasta').value;
    const filtroOrigen = document.getElementById('filtroOrigen').value;
    const filtroTexto = document.getElementById('filtroTexto').value.toLowerCase();
    
    const table = document.getElementById('registrosTable');
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        if (row.classList.contains('no-records')) return;
        
        const cliente = row.cells[2].textContent;
        const fecha = new Date(row.cells[1].textContent);
        const origen = row.getAttribute('data-origen') || ''; // Por si tenemos este atributo
        const observaciones = row.cells[7].textContent.toLowerCase();
        
        // Aplicar filtros
        let mostrar = true;
        
        if (filtroCliente && cliente !== filtroCliente) {
            mostrar = false;
        }
        
        if (filtroFechaDesde) {
            const fechaDesde = new Date(filtroFechaDesde);
            if (fecha < fechaDesde) {
                mostrar = false;
            }
        }
        
        if (filtroFechaHasta) {
            const fechaHasta = new Date(filtroFechaHasta);
            fechaHasta.setHours(23, 59, 59); // Final del día
            if (fecha > fechaHasta) {
                mostrar = false;
            }
        }
        
        if (filtroOrigen && origen !== filtroOrigen) {
            mostrar = false;
        }
        
        if (filtroTexto && !observaciones.includes(filtroTexto)) {
            mostrar = false;
        }
        
        // Mostrar u ocultar la fila
        row.style.display = mostrar ? '' : 'none';
    });
    
    // Mostrar mensaje si no hay resultados
    const rowsVisibles = [...rows].filter(row => row.style.display !== 'none');
    const tbody = table.querySelector('tbody');
    const noResultsRow = tbody.querySelector('.no-results');
    
    if (rowsVisibles.length === 0 && !noResultsRow) {
        const tr = document.createElement('tr');
        tr.className = 'no-records no-results';
        tr.innerHTML = `
            <td colspan="10">
                <div class="no-registros">
                    <i class="fas fa-search"></i>
                    <p>No se encontraron resultados con los filtros aplicados</p>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    } else if (rowsVisibles.length > 0 && noResultsRow) {
        noResultsRow.remove();
    }
}

// Función para limpiar filtros
function limpiarFiltros() {
    // Resetear valores de los filtros
    document.getElementById('filtroCliente').value = '';
    document.getElementById('filtroFechaDesde').value = '';
    document.getElementById('filtroFechaHasta').value = '';
    document.getElementById('filtroOrigen').value = '';
    document.getElementById('filtroTexto').value = '';
    
    // Mostrar todas las filas
    const table = document.getElementById('registrosTable');
    const rows = table.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        if (!row.classList.contains('no-results')) {
            row.style.display = '';
        }
    });
    
    // Eliminar fila de "no hay resultados" si existe
    const noResultsRow = table.querySelector('.no-results');
    if (noResultsRow) {
        noResultsRow.remove();
    }
}

// Función para exportar a Excel
function exportarAExcel() {
    // Verificar que existe la tabla
    const table = document.getElementById('registrosTable');
    if (!table) return;
    
    // Crear un workbook de Excel
    const wb = XLSX.utils.book_new();
    
    // Obtener solo las filas visibles
    const rows = [...table.querySelectorAll('tbody tr')].filter(row => 
        row.style.display !== 'none' && !row.classList.contains('no-records')
    );
    
    // Crear una tabla temporal solo con las filas visibles
    const tempTable = document.createElement('table');
    const headerRow = table.querySelector('thead tr').cloneNode(true);
    
    tempTable.appendChild(document.createElement('thead')).appendChild(headerRow);
    const tempBody = tempTable.appendChild(document.createElement('tbody'));
    
    rows.forEach(row => {
        tempBody.appendChild(row.cloneNode(true));
    });
    
    // Convertir la tabla a worksheet
    const ws = XLSX.utils.table_to_sheet(tempTable);
    
    // Añadir el worksheet al workbook
    XLSX.utils.book_append_sheet(wb, ws, "Facturas Cerradas");
    
    // Generar el archivo XLSX
    const fechaHoy = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Facturas_Cerradas_${fechaHoy}.xlsx`);
}