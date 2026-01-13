"""
Módulo de Seguridad para Tesorería
====================================

Este módulo implementa múltiples capas de seguridad para proteger
los endpoints críticos de tesorería contra:
- CSRF (Cross-Site Request Forgery)
- Abuso de endpoints (Rate Limiting)
- Acceso no autorizado (Scope Validation)
- Manipulación de datos (Audit Logging)

Autor: Sistema de Tesorería
Fecha: 2026-01-06
"""

import hashlib
import hmac
import secrets
import time
from functools import wraps
from flask import session, request, jsonify
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, List, Tuple, Optional
import logging

logger = logging.getLogger(__name__)

# =====================================================
# 1. CSRF PROTECTION
# =====================================================

class CSRFProtection:
    """
    Protección contra Cross-Site Request Forgery.

    Genera tokens únicos por sesión que deben ser incluidos
    en todos los requests POST/PUT/DELETE.
    """

    SECRET_KEY = None  # Se inicializa desde app.secret_key

    @staticmethod
    def generate_token() -> str:
        """Genera un token CSRF único para la sesión actual."""
        if 'csrf_token' not in session:
            session['csrf_token'] = secrets.token_hex(32)
        return session['csrf_token']

    @staticmethod
    def validate_token(token: str) -> bool:
        """Valida que el token CSRF sea correcto."""
        if not token:
            return False
        session_token = session.get('csrf_token')
        if not session_token:
            return False
        # Comparación segura contra timing attacks
        return hmac.compare_digest(token, session_token)

    @staticmethod
    def get_token_from_request() -> Optional[str]:
        """Extrae el token CSRF del request (header o body)."""
        # Primero intentar desde header
        token = request.headers.get('X-CSRF-Token')
        if token:
            return token

        # Luego desde JSON body
        data = request.get_json(silent=True)
        if data and 'csrf_token' in data:
            return data['csrf_token']

        # Finalmente desde form data
        return request.form.get('csrf_token')


def csrf_protected(f):
    """
    Decorador para proteger endpoints contra CSRF.

    Uso:
        @app.route('/api/tesoreria/guardar-remesa', methods=['POST'])
        @login_required
        @csrf_protected
        def guardar_remesa():
            ...
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method in ['POST', 'PUT', 'DELETE', 'PATCH']:
            token = CSRFProtection.get_token_from_request()
            if not CSRFProtection.validate_token(token):
                logger.warning(f"🚨 CSRF validation failed for {request.path} from {request.remote_addr}")
                return jsonify(
                    success=False,
                    msg='Token de seguridad inválido. Por favor, recarga la página.',
                    error_code='CSRF_INVALID'
                ), 403
        return f(*args, **kwargs)
    return decorated


# =====================================================
# 2. RATE LIMITING
# =====================================================

class RateLimiter:
    """
    Sistema de rate limiting para prevenir abuso de endpoints.

    Implementa el algoritmo de Token Bucket:
    - Cada usuario tiene un "balde" de tokens
    - Cada request consume un token
    - Los tokens se recargan con el tiempo
    """

    def __init__(self):
        # { (user_id, endpoint): [timestamps] }
        self.request_log: Dict[Tuple[int, str], List[float]] = defaultdict(list)
        self.cleanup_interval = 300  # Limpiar cada 5 minutos
        self.last_cleanup = time.time()

    def is_allowed(self, user_id: int, endpoint: str, max_requests: int, window_seconds: int) -> Tuple[bool, Optional[int]]:
        """
        Verifica si el usuario puede hacer un request.

        Args:
            user_id: ID del usuario
            endpoint: Endpoint al que se está accediendo
            max_requests: Número máximo de requests permitidos
            window_seconds: Ventana de tiempo en segundos

        Returns:
            (permitido: bool, tiempo_espera: int | None)
        """
        now = time.time()
        key = (user_id, endpoint)

        # Limpiar requests antiguos
        cutoff = now - window_seconds
        self.request_log[key] = [ts for ts in self.request_log[key] if ts > cutoff]

        # Verificar si se excedió el límite
        if len(self.request_log[key]) >= max_requests:
            # Calcular tiempo de espera hasta que expire el request más antiguo
            oldest = self.request_log[key][0]
            wait_time = int(oldest + window_seconds - now) + 1
            return False, wait_time

        # Registrar este request
        self.request_log[key].append(now)

        # Cleanup periódico
        if now - self.last_cleanup > self.cleanup_interval:
            self._cleanup()
            self.last_cleanup = now

        return True, None

    def _cleanup(self):
        """Limpia entradas antiguas del log."""
        now = time.time()
        keys_to_delete = []

        for key, timestamps in self.request_log.items():
            # Si no hay requests en los últimos 10 minutos, eliminar
            if not timestamps or (now - timestamps[-1]) > 600:
                keys_to_delete.append(key)

        for key in keys_to_delete:
            del self.request_log[key]


# Instancia global del rate limiter
rate_limiter = RateLimiter()


def rate_limited(max_requests: int = 30, window_seconds: int = 60):
    """
    Decorador para aplicar rate limiting a un endpoint.

    Args:
        max_requests: Máximo de requests permitidos
        window_seconds: Ventana de tiempo en segundos

    Uso:
        @app.route('/api/tesoreria/guardar-remesa', methods=['POST'])
        @login_required
        @rate_limited(max_requests=30, window_seconds=60)  # 30 requests por minuto
        def guardar_remesa():
            ...
    """
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user_id = session.get('user_id')
            if not user_id:
                return jsonify(success=False, msg='No autenticado'), 401

            endpoint = request.endpoint or request.path
            allowed, wait_time = rate_limiter.is_allowed(user_id, endpoint, max_requests, window_seconds)

            if not allowed:
                logger.warning(
                    f"🚨 Rate limit exceeded for user {user_id} on {endpoint}. "
                    f"IP: {request.remote_addr}"
                )
                return jsonify(
                    success=False,
                    msg=f'Demasiadas solicitudes. Por favor, espera {wait_time} segundos.',
                    error_code='RATE_LIMIT_EXCEEDED',
                    wait_time=wait_time
                ), 429

            return f(*args, **kwargs)
        return decorated
    return decorator


# =====================================================
# 3. SCOPE VALIDATION - ELIMINADO
# =====================================================
# Nota: Los tesoreros pueden acceder a TODOS los locales.
# No se implementa validación de scope por local.
# Solo se verifica que el usuario esté autenticado (via @login_required)
# y tenga el nivel de rol adecuado (via @role_min_required)


# =====================================================
# 4. AUDIT LOGGING
# =====================================================

class AuditLogger:
    """
    Sistema de logging de auditoría para cambios en remesas.

    Registra TODOS los cambios en monto_real con:
    - Quién hizo el cambio
    - Cuándo
    - Qué cambió (valor anterior → valor nuevo)
    - Desde qué IP
    """

    @staticmethod
    def log_remesa_change(conn, remesa_id: int, field: str, old_value, new_value, user_id: int):
        """
        Registra un cambio en una remesa.

        Args:
            conn: Conexión a BD
            remesa_id: ID de la remesa modificada
            field: Campo modificado (ej: 'monto_real', 'estado_contable')
            old_value: Valor anterior
            new_value: Valor nuevo
            user_id: ID del usuario que hizo el cambio
        """
        try:
            cur = conn.cursor()

            # Obtener username
            cur.execute("SELECT username FROM users WHERE id = %s", (user_id,))
            user_row = cur.fetchone()
            username = user_row[0] if user_row else 'UNKNOWN'

            # Obtener IP del request
            ip_address = request.remote_addr if request else 'SYSTEM'

            # Insertar en tabla de auditoría
            cur.execute("""
                INSERT INTO tesoreria_audit_log
                    (remesa_id, field_changed, old_value, new_value, changed_by_user_id, changed_by_username, ip_address, changed_at)
                VALUES
                    (%s, %s, %s, %s, %s, %s, %s, NOW())
            """, (remesa_id, field, str(old_value), str(new_value), user_id, username, ip_address))

            conn.commit()
            cur.close()

            logger.info(
                f"📝 Audit: User {username} ({user_id}) changed remesa {remesa_id} "
                f"field '{field}' from {old_value} to {new_value} from IP {ip_address}"
            )

        except Exception as e:
            logger.error(f"❌ Error logging audit: {e}")
            # No fallar el request principal si falla el audit log

    @staticmethod
    def log_estado_change(conn, remesa_id: int, old_estado: str, new_estado: str, user_id: int):
        """Wrapper específico para cambios de estado."""
        AuditLogger.log_remesa_change(conn, remesa_id, 'estado_contable', old_estado, new_estado, user_id)


# =====================================================
# 5. SQL para tabla de auditoría
# =====================================================

SQL_CREATE_AUDIT_TABLE = """
-- Tabla de auditoría para cambios en remesas
CREATE TABLE IF NOT EXISTS tesoreria_audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    remesa_id INT NOT NULL,
    field_changed VARCHAR(50) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by_user_id INT NOT NULL,
    changed_by_username VARCHAR(100) NOT NULL,
    ip_address VARCHAR(50),
    changed_at DATETIME NOT NULL,

    INDEX idx_remesa (remesa_id),
    INDEX idx_user (changed_by_user_id),
    INDEX idx_fecha (changed_at),
    INDEX idx_field (field_changed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Log de auditoría para todos los cambios en remesas de tesorería';
"""


# =====================================================
# 6. HELPER: Decorador combinado para máxima seguridad
# =====================================================

def tesoreria_secured(max_requests: int = 30, window_seconds: int = 60):
    """
    Decorador combinado que aplica capas de seguridad.

    Aplica en orden:
    1. Login required (debe estar aplicado antes)
    2. CSRF protection
    3. Rate limiting

    Uso:
        @app.route('/api/tesoreria/guardar-remesa', methods=['POST'])
        @login_required
        @tesoreria_secured(max_requests=30, window_seconds=60)
        def guardar_remesa():
            ...
    """
    def decorator(f):
        # Aplicar decoradores en orden
        secured_func = f
        secured_func = rate_limited(max_requests, window_seconds)(secured_func)
        secured_func = csrf_protected(secured_func)
        return secured_func
    return decorator


# =====================================================
# 7. Inicialización
# =====================================================

def init_security(app):
    """
    Inicializa el sistema de seguridad.

    Debe llamarse desde app.py al inicio:
        from modules.tesoreria_security import init_security
        init_security(app)
    """
    CSRFProtection.SECRET_KEY = app.secret_key

    # Registrar el generador de tokens en el contexto de Jinja2
    @app.context_processor
    def inject_csrf_token():
        return dict(csrf_token=CSRFProtection.generate_token)

    logger.info("✅ Tesorería Security Module initialized")
