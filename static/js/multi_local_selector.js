/**
 * Multi-Local Selector para Encargados
 * Permite a los encargados con múltiples locales seleccionar el local activo
 */

(function() {
    'use strict';

    // Función para obtener el local de la URL
    function getLocalFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('local') || '';
    }

    // Función para cargar y mostrar el selector de locales
    async function initLocalSelector() {
        try {
            // Obtener locales del usuario
            const response = await fetch('/api/user/locales');
            const data = await response.json();

            if (!data.ok || !data.locales || data.locales.length <= 1) {
                // Si tiene 0 o 1 local, no mostrar selector
                return;
            }

            // Crear el selector si tiene múltiples locales
            createLocalSelector(data.locales, data.current_local);

        } catch (error) {
            console.error('Error cargando locales del usuario:', error);
        }
    }

    // Crear el HTML del selector
    function createLocalSelector(locales, currentLocal) {
        // Buscar un lugar donde insertar el selector (cerca de la fecha)
        const mainContent = document.querySelector('.main-content') || document.querySelector('main') || document.body;

        if (!mainContent) {
            console.warn('No se encontró contenedor para selector de local');
            return;
        }

        // Crear contenedor del selector
        const selectorContainer = document.createElement('div');
        selectorContainer.id = 'localSelectorContainer';
        selectorContainer.style.cssText = `
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 16px;
            margin: 16px 0;
            box-shadow: 0 2px 8px rgba(2,6,23,.08);
        `;

        selectorContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <label for="localSelector" style="font-weight: 600; color: #334155; min-width: 60px;">
                    🏪 Local:
                </label>
                <select id="localSelector" style="
                    flex: 1;
                    padding: 10px 12px;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    background: #ffffff;
                    cursor: pointer;
                    transition: all 0.2s;
                    max-width: 300px;
                ">
                    ${locales.map(local => `
                        <option value="${local}" ${local === currentLocal ? 'selected' : ''}>
                            ${local}
                        </option>
                    `).join('')}
                </select>
                <span id="localSelectorHint" style="
                    font-size: 12px;
                    color: #64748b;
                    font-style: italic;
                ">
                    ${locales.length} locales disponibles
                </span>
            </div>
        `;

        // Insertar al inicio del main content
        mainContent.insertBefore(selectorContainer, mainContent.firstChild);

        // Agregar event listener para cambio de local
        const selector = document.getElementById('localSelector');
        selector.addEventListener('change', function() {
            const nuevoLocal = this.value;
            const url = new URL(window.location);
            url.searchParams.set('local', nuevoLocal);
            window.location.href = url.toString();
        });

        // Hover effect
        selector.addEventListener('mouseenter', function() {
            this.style.borderColor = '#0ea5e9';
            this.style.boxShadow = '0 0 0 3px rgba(14, 165, 233, 0.1)';
        });

        selector.addEventListener('mouseleave', function() {
            this.style.borderColor = '#e2e8f0';
            this.style.boxShadow = 'none';
        });
    }

    // Función auxiliar para asegurar que las solicitudes AJAX incluyan el parámetro local
    function ensureLocalParam() {
        const local = getLocalFromURL();
        return local;
    }

    // Exponer función para que otros scripts puedan obtener el local actual
    window.getCurrentLocal = getLocalFromURL;

    // Inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLocalSelector);
    } else {
        initLocalSelector();
    }

})();
