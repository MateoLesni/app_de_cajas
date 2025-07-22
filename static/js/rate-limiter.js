/**
 * Sistema inteligente para manejar rate limiting - pomenukoka
 * Última actualización: 2025-05-30 13:26:21
 */
class SmartRateLimiter {
    constructor() {
        this.endpoints = {};  // Almacena información sobre endpoints
        this.retryMultiplier = 1.5;  // Factor de multiplicación para backoff exponencial
        this.maxBackoff = 120000;  // Máximo backoff 2 minutos (ms)
        this.retryCount = 0;  // Contador global de reintentos
        this.maxGlobalRetries = 50;  // Reintentos máximos globales antes de mostrar advertencia
        
        console.log("SmartRateLimiter inicializado");
    }
    
    /**
     * Envuelve fetch para manejar errores de tasa y reintento automático
     */
    async fetch(url, options = {}) {
        // Inicializar el endpoint si es la primera vez
        if (!this.endpoints[url]) {
            this.endpoints[url] = {
                lastRequestTime: 0,
                consecutiveErrors: 0,
                backoff: 0
            };
        }
        
        const endpoint = this.endpoints[url];
        
        // Calcular cuánto esperar antes de la próxima solicitud
        const now = Date.now();
        const waitTime = Math.max(0, endpoint.lastRequestTime + endpoint.backoff - now);
        
        if (waitTime > 0) {
            console.log(`Esperando ${waitTime}ms antes de solicitar ${url}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        // Actualizar el tiempo de la última solicitud
        endpoint.lastRequestTime = Date.now();
        
        try {
            const response = await fetch(url, options);
            
            // Verificar si es un error 429
            if (response.status === 429) {
                this.retryCount++;
                
                // Verificar si hemos superado el límite global de reintentos
                if (this.retryCount > this.maxGlobalRetries) {
                    this.showSystemOverloadNotification();
                }
                
                // Obtener el tiempo recomendado para esperar
                let retryAfter = 5;  // 5 segundos por defecto
                try {
                    const data = await response.json();
                    if (data.retryAfter) {
                        retryAfter = data.retryAfter;
                    }
                } catch (e) {
                    // Si no podemos leer el JSON, usamos el encabezado Retry-After
                    if (response.headers.has('Retry-After')) {
                        retryAfter = parseInt(response.headers.get('Retry-After')) || retryAfter;
                    }
                }
                
                // Calcular backoff con retroceso exponencial
                endpoint.consecutiveErrors += 1;
                endpoint.backoff = Math.min(
                    retryAfter * 1000 * Math.pow(this.retryMultiplier, endpoint.consecutiveErrors - 1),
                    this.maxBackoff
                );
                
                // Mostrar notificación al usuario si es notable el retraso
                if (endpoint.backoff > 5000) {
                    this.showRateLimitNotification(Math.round(endpoint.backoff / 1000));
                }
                
                // Reintentar automáticamente (con una copia de options para evitar problemas)
                console.warn(`Rate limit para ${url}. Reintentando en ${endpoint.backoff}ms. Reintento #${endpoint.consecutiveErrors}`);
                const optionsCopy = JSON.parse(JSON.stringify(options || {}));
                return this.fetch(url, optionsCopy);
            }
            
            // Si la llamada fue exitosa, reiniciamos los errores
            endpoint.consecutiveErrors = 0;
            endpoint.backoff = 0;
            
            // Reducir contador global de reintentos
            this.retryCount = Math.max(0, this.retryCount - 1);
            
            // Devolver la respuesta para procesamiento normal
            return response;
            
        } catch (error) {
            // Manejar errores de red
            console.error(`Error de red para ${url}:`, error);
            
            // Incrementar backoff para errores de red también
            endpoint.consecutiveErrors += 1;
            endpoint.backoff = Math.min(
                1000 * Math.pow(this.retryMultiplier, endpoint.consecutiveErrors - 1),
                this.maxBackoff
            );
            
            throw error;
        }
    }
    
    /**
     * Muestra una notificación sobre límite de tasa
     */
    showRateLimitNotification(seconds) {
        // Eliminar notificaciones existentes
        const existingNotification = document.querySelector('.rate-limit-notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        const notification = document.createElement('div');
        notification.className = 'rate-limit-notification';
        notification.innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <span>Reduciendo frecuencia de actualización por ${seconds} segundos para evitar sobrecarga.</span>
            <button class="close-btn">&times;</button>
        `;
        document.body.appendChild(notification);
        
        // Configurar botón de cierre
        notification.querySelector('.close-btn').addEventListener('click', () => {
            notification.remove();
        });
        
        // Auto-eliminar después de 8 segundos
        setTimeout(() => {
            if (document.body.contains(notification)) {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            }
        }, 8000);
    }
    
    /**
     * Muestra una notificación de sobrecarga del sistema
     */
    showSystemOverloadNotification() {
        // Solo mostrar esta notificación una vez
        if (document.querySelector('.system-overload-notification')) return;
        
        const notification = document.createElement('div');
        notification.className = 'system-overload-notification';
        notification.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <span>
                El sistema está sobrecargado con demasiadas solicitudes. 
                <br>Se recomienda refrescar la página o intentar más tarde.
            </span>
            <button class="refresh-btn">Refrescar página</button>
            <button class="close-btn">&times;</button>
        `;
        document.body.appendChild(notification);
        
        // Configurar botones
        notification.querySelector('.refresh-btn').addEventListener('click', () => {
            window.location.reload();
        });
        
        notification.querySelector('.close-btn').addEventListener('click', () => {
            notification.remove();
            
            // Reiniciar el contador global
            this.retryCount = 0;
        });
    }
    
    /**
     * Límpia la información acumulada de endpoints
     */
    reset() {
        this.endpoints = {};
        this.retryCount = 0;
        console.log("SmartRateLimiter reiniciado");
        
        // Informar al usuario
        const notification = document.createElement('div');
        notification.className = 'rate-reset-notification';
        notification.innerHTML = `
            <i class="fas fa-sync-alt"></i>
            <span>Sistema de control de frecuencia reiniciado.</span>
        `;
        document.body.appendChild(notification);
        
        // Auto-eliminar después de 3 segundos
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Crear una instancia global del limitador
window.rateLimiter = new SmartRateLimiter();

// Sobreescribir el fetch para usar nuestro limitador (de manera compatible con promesas y async/await)
const originalFetch = window.fetch;
window.fetch = function(...args) {
    return window.rateLimiter.fetch.apply(window.rateLimiter, args);
};

// Agregar estilos necesarios para las notificaciones
function addRateLimitStyles() {
    if (!document.getElementById('rate-limit-styles')) {
        const style = document.createElement('style');
        style.id = 'rate-limit-styles';
        style.textContent = `
            .rate-limit-notification,
            .rate-reset-notification,
            .system-overload-notification {
                position: fixed;
                top: 70px;
                left: 50%;
                transform: translateX(-50%);
                color: white;
                padding: 10px 20px;
                border-radius: 4px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
                z-index: 2000;
                font-size: 0.9rem;
                display: flex;
                align-items: center;
                animation: slideDown 0.3s forwards;
                max-width: 90%;
            }
            
            .rate-limit-notification {
                background-color: #FF9800;
            }
            
            .rate-reset-notification {
                background-color: #4CAF50;
            }
            
            .system-overload-notification {
                background-color: #F44336;
                flex-direction: column;
                text-align: center;
            }
            
            .system-overload-notification span {
                margin: 10px 0;
            }
            
            .system-overload-notification .refresh-btn {
                background-color: white;
                color: #F44336;
                border: none;
                padding: 5px 15px;
                border-radius: 4px;
                margin: 5px 0;
                cursor: pointer;
                font-weight: 500;
            }
            
            .system-overload-notification .refresh-btn:hover {
                background-color: #f5f5f5;
            }
            
            .rate-limit-notification i,
            .rate-reset-notification i,
            .system-overload-notification i {
                margin-right: 8px;
                font-size: 1.1rem;
            }
            
            .rate-limit-notification .close-btn,
            .rate-reset-notification .close-btn,
            .system-overload-notification .close-btn {
                margin-left: 10px;
                background: none;
                border: none;
                color: white;
                font-size: 16px;
                cursor: pointer;
                opacity: 0.7;
            }
            
            .rate-limit-notification .close-btn:hover,
            .rate-reset-notification .close-btn:hover,
            .system-overload-notification .close-btn:hover {
                opacity: 1;
            }
            
            .rate-limit-notification.fade-out,
            .rate-reset-notification.fade-out,
            .system-overload-notification.fade-out {
                opacity: 0;
                transition: opacity 0.3s;
            }
            
            @keyframes slideDown {
                from { transform: translate(-50%, -20px); opacity: 0; }
                to { transform: translate(-50%, 0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
}

// Agregar los estilos cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', addRateLimitStyles);

// Reiniciar limitador cuando la página se vuelve visible tras estar oculta un tiempo
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && document.visibilityState === 'visible') {
        // Si la página estuvo oculta por más de 1 minuto, reiniciar el limitador
        const hiddenTime = window.hiddenSince ? (Date.now() - window.hiddenSince) : 0;
        if (hiddenTime > 60000) {  // 1 minuto
            window.rateLimiter.reset();
        }
        window.hiddenSince = null;
    } else if (document.hidden) {
        // Registrar cuando la página se oculta
        window.hiddenSince = Date.now();
    }
});