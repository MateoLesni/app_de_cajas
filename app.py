# app.py
# Last updated: 2025-04-04
# Current user: pomenuk

# ========================================================================
# ===== IMPORTACIONES =====
# ========================================================================
from flask import Flask, g, redirect, url_for, request, render_template, flash, jsonify, session, Response, stream_with_context, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from functools import wraps
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from apscheduler.schedulers.background import BackgroundScheduler
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from waitress import serve
import glob
import atexit
import json
import subprocess
import shutil
import bcrypt
import os
import sys
import uuid
import time
import threading
import pickle
from itsdangerous import TimestampSigner
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename
import pytz
import time
from collections import defaultdict
import psutil
import time
import platform
import concurrent.futures
from datetime import timedelta
import random

# ========================================================================
# ===== CONFIGURACIÓN INICIAL DE LA APLICACIÓN =====
# ========================================================================
app = Flask(__name__)
app.secret_key = '8V#n*aQHYUt@7MdGBY0wE8f'  # Cambiar en producción
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///registros.db'
app.config['SESSION_COOKIE_SECURE'] = False  # Cambiar a True solo en producción con HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=3)  # Aumentar a 3 días
app.config['DATA_FOLDER'] = 'c:\\Users\\PROPIETARIO\\Downloads\\01.Proyectos\\form-project\\data'
db = SQLAlchemy(app)


# Crear el limitador y configurarlo
limiter = Limiter(
    key_func=get_remote_address,  # Obtiene la IP del cliente
    app=app,
    default_limits=["100 per minute"],  # Límite global predeterminado
    storage_uri="memory://",  # Para producción, considera "redis://localhost:6379/0"
    strategy="fixed-window",  # Otras opciones: "moving-window", "fixed-window-elastic-expiry"
    headers_enabled=True,  # Añadir headers X-RateLimit-*
    swallow_errors=True,  # No fallar si hay problemas de límites
)

# Configuración específica por ruta
ROUTE_LIMITS = {
    "/api/dashboard": "3000 per minute",
    "/api/pendientes": "3000 per minute", 
    "/api/kioscos/last_update": "2000 per minute",
    "/api/once/last_update": "2000 per minute",
    "/api/gastronomia/last_update": "2000 per minute",
    "/api/retiro/last_update": "2000 per minute",
    "/api/ambulante/last_update": "2000 per minute",
    "/api/bimbo/last_update": "2000 per minute",
    "/api/constitucion/last_update": "20000 per minute",
    "/api/tba/last_update": "2000 per minute",
    "/api/zona_sur/last_update": "2000 per minute",
    "/api/file_status": "500 per minute",
    "/api/validar_turno_previo": "500 per minute",
    "/api/validar_fecha_previa": "500 per minute",
    "/api/stock/status": "500 per minute",
    "/api/stock/details": "500 per minute",
    "/api/zonas/lista": "500 per minute",
    "/api/stock/set_control_month": "500 per minute",
    "/api/stock/control_month": "500 per minute"
}

# Manejador personalizado para errores 429 (demasiadas solicitudes)
@app.errorhandler(429)
def ratelimit_handler(e):
    username = session.get('username', 'anónimo')
    ip = get_remote_address()
    print(f"Límite de tasa excedido por {username} (IP: {ip}) en {request.path}")
    
    return jsonify({
        "error": "Demasiadas solicitudes. Por favor, espera antes de intentarlo de nuevo.",
        "retryAfter": 60
    }), 429

# Función de utilidad para aplicar límites dinámicamente
def dynamic_limit():
    """Determina el límite basado en la ruta actual"""
    for prefix, limit in ROUTE_LIMITS.items():
        if request.path.startswith(prefix):
            return limit
    return "100 per minute"  # Valor predeterminado

# Aplicar límites a todas las rutas de API automáticamente
@app.before_request
def limit_api_routes():
    if request.path.startswith('/api/'):
        # El límite se aplicará en el procesamiento del request
        # No necesitamos devolver nada aquí
        endpoint_limit = dynamic_limit()
        limiter.limit(endpoint_limit)(lambda: None)()


# Variables globales para control de actualizaciones
last_zona_sur_update = time.time()
last_ambulante_update = time.time()
last_pendientes_update = time.time()
last_constitucion_update = time.time()
last_bimbo_update = time.time()
last_tba_update = time.time()
last_kioscos_update = time.time()
last_once_update = time.time()
last_gastronomia_update = time.time()
last_retiro_update = time.time()

# ========================================================================
# ===== DECORADORES DE ACCESO =====
# ========================================================================
# Agregamos este decorador para proteger las rutas basadas en el acceso a páginas
def page_access_required(page_name):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not user_has_page_access(page_name):
                flash('No tienes permiso para acceder a esta página')
                return redirect(url_for('index'))
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'role' not in session or session['role'] != 'admin':

            flash('Acceso no autorizado')
        return redirect(url_for('index'))
        return f(*args, **kwargs)
        return decorated_function
        return f(*args, **kwargs)
        return decorated_function
    def admin_required(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'role' not in session or session['role'] != 'admin':
                flash('Acceso no autorizado')
            return redirect(url_for('index'))
            return f(*args, **kwargs)
            return decorated_function
            return f(*args, **kwargs)
            return decorated_function

# Funciones de autenticación
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        print(f"======== CHECKING LOGIN REQUIRED ========")
        print(f"Session data: {session}")
        print(f"Username in session: {session.get('username')}")
        if 'username' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'role' not in session or session['role'] != 'admin':
            flash('Acceso no autorizado')
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated_function

def load_json_file(filepath, default=None):
    """
    Carga datos desde un archivo JSON con medidas de seguridad adicionales
    """
    if default is None:
        default = []

    # Verificar si el archivo existe
    if not os.path.exists(filepath):
        print(f"ADVERTENCIA: El archivo {filepath} no existe. Creando archivo nuevo.")
        # Crear directorio si no existe
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        # Crear archivo vacío
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(default, f)
        return default

    # Verificar que el archivo tenga contenido y no esté dañado
    try:
        file_size = os.path.getsize(filepath)
        if file_size == 0:
            print(f"ADVERTENCIA: El archivo {filepath} está vacío. Usando datos por defecto.")
            return default

        # Intentar cargar el archivo
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        # Verificar que sea una lista
        if not isinstance(data, list):
            print(f"ERROR: El archivo {filepath} no contiene una lista. Usando copia de seguridad.")
            return load_json_backup(filepath, default)
            
        return data
    except json.JSONDecodeError:
        print(f"ERROR: El archivo {filepath} está corrupto. Usando copia de seguridad.")
        return load_json_backup(filepath, default)
    except Exception as e:
        print(f"ERROR cargando {filepath}: {str(e)}. Usando copia de seguridad.")
        return load_json_backup(filepath, default)

def load_json_backup(filepath, default=None):
    """
    Intenta cargar una copia de seguridad del archivo
    """
    if default is None:
        default = []
        
    backup_filepath = f"{filepath}.backup"
    if os.path.exists(backup_filepath):
        try:
            with open(backup_filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, list):
                print(f"RECUPERACIÓN: Se cargó correctamente la copia de seguridad de {filepath}")
                # Restaurar el archivo original con la copia de seguridad
                shutil.copy2(backup_filepath, filepath)
                return data
        except:
            pass
    
    # Si no hay backup o falló al cargar, intentar con versiones anteriores
    for i in range(1, 6):  # Intentar hasta 5 backups anteriores
        old_backup = f"{filepath}.backup.{i}"
        if os.path.exists(old_backup):
            try:
                with open(old_backup, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if isinstance(data, list):
                    print(f"RECUPERACIÓN: Se cargó correctamente la copia de seguridad {i} de {filepath}")
                    shutil.copy2(old_backup, filepath)
                    return data
            except:
                continue
    
    print(f"ERROR: No se pudo recuperar ninguna copia de seguridad para {filepath}. Usando datos por defecto.")
    return default

def save_json_file(filepath, data):
    """
    Guarda datos en un archivo JSON con sistema de backup optimizado
    """
    try:
        # Validar que data sea una lista
        if not isinstance(data, list):
            print(f"ERROR: Intentando guardar datos que no son una lista en {filepath}")
            return False
        
        # Crear directorio si no existe
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        # Solo crear backup cada 10 minutos (600 segundos)
        backup_interval = 600  # segundos entre backups
        backup_file = f"{filepath}.backup"
        
        should_backup = False
        
        # Verificar si existe backup y si ha pasado tiempo suficiente
        if os.path.exists(backup_file):
            last_backup_time = os.path.getmtime(backup_file)
            current_time = time.time()
            should_backup = (current_time - last_backup_time) > backup_interval
        else:
            # Si no existe backup, crearlo
            should_backup = True
        
        # Crear backup si es necesario
        if should_backup:
            # Solo mantener 3 versiones (reducido de 5)
            for i in range(2, 0, -1):
                old_backup = f"{filepath}.backup.{i}"
                new_backup = f"{filepath}.backup.{i+1}"
                if os.path.exists(old_backup):
                    shutil.copy2(old_backup, new_backup)
            
            # Si existe un backup actual, moverlo a .backup.1
            if os.path.exists(backup_file):
                shutil.copy2(backup_file, f"{filepath}.backup.1")
            
            # Si existe el archivo original, hacer backup
            if os.path.exists(filepath):
                shutil.copy2(filepath, backup_file)
        
        # Guardar directamente al archivo (sin archivo temporal)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        return True
        
    except Exception as e:
        print(f"ERROR guardando {filepath}: {str(e)}")
        return False

# ========================================================================
# ===== CONFIGURACIÓN DE DIRECTORIOS Y ARCHIVOS =====
# ========================================================================

# Configuración de directorios
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
REGISTROS_FILE = os.path.join(DATA_DIR, 'registros.json')
NOTES_DIR = os.path.join(DATA_DIR, 'notes')
os.makedirs(NOTES_DIR, exist_ok=True)
AVATAR_FOLDER = os.path.join(BASE_DIR, 'static', 'avatars')
os.makedirs(AVATAR_FOLDER, exist_ok=True)

# Definir las rutas de los archivos JSON para cada zona
ZONAS_JSON = {
    'CONSTITUCION': os.path.join(DATA_DIR, 'constitucion.json'),
    'ZONA SUR': os.path.join(DATA_DIR, 'zona_sur.json'),
    'GASTRONOMIA': os.path.join(DATA_DIR, 'gastronomia.json'),
    'KIOSCOS': os.path.join(DATA_DIR, 'kioscos.json'),
    'BIMBO': os.path.join(DATA_DIR, 'bimbo.json'),
    'RETIRO': os.path.join(DATA_DIR, 'retiro.json'),
    'TBA': os.path.join(DATA_DIR, 'tba.json'),
    'AMBULANTE': os.path.join(DATA_DIR, 'ambulante.json'),
    'ONCE': os.path.join(DATA_DIR, 'once.json')
}

STOCK_FILE = os.path.join(DATA_DIR, 'stock.json')
PENDIENTES_FILE = os.path.join(DATA_DIR, 'pendientes.json')
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'xlsx', 'xls', 'doc', 'docx'}

# Asegurar que existan los directorios necesarios
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Zona horaria para Argentina
TIMEZONE = pytz.timezone('America/Argentina/Buenos_Aires')

# Archivo para almacenar usuarios
USERS_FILE = os.path.join(DATA_DIR, 'users.json')
# ========================================================================
# ===== FUNCIONES DE UTILIDAD GENERAL =====
# ========================================================================
def get_current_datetime():
    return datetime.now(TIMEZONE).strftime('%Y%m%d%H%M%S')

def format_datetime(dt_str):
    try:
        dt = datetime.strptime(dt_str, '%Y%m%d%H%M%S')
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    except:
        return dt_str

def formatCurrency(amount):
    """Formatea un número como moneda en formato argentino ($ con dos decimales)"""
    return f"$ {amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def allowed_image_file(filename):
    """Verifica si el archivo es una imagen permitida."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in {'jpg', 'jpeg', 'png', 'gif'}

def format_datetime_for_display(datetime_str):
    """Formatea la fecha y hora para mostrar en la interfaz."""
    if not datetime_str:
        return None
    try:
        dt = datetime.fromisoformat(datetime_str)
        return dt.strftime('%d/%m/%Y %H:%M:%S')
    except Exception:
        return datetime_str

# ========================================================================
# ===== FUNCIONES DE MANEJO DE USUARIOS =====
# ========================================================================
def load_users():
    try:
        if os.path.exists(USERS_FILE):
            with open(USERS_FILE, 'r') as f:
                return json.load(f)
        return []
    except Exception as e:
        print(f"Error loading users: {str(e)}")
        return []

def save_users(users):
    try:
        with open(USERS_FILE, 'w') as f:
            json.dump(users, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving users: {str(e)}")
        return False

def user_has_page_access(page_name):
    # Si el usuario es admin o supervisor, tiene acceso completo
    if 'role' in session and session['role'] in ['admin', 'supervisor']:
        return True
    
    # Si es usuario normal, verificar las páginas permitidas
    user_pages = session.get('pages', [])
    return page_name in user_pages

# ========================================================================
# ===== FUNCIONES DE MANEJO DE ARCHIVOS JSON =====
# ========================================================================

def save_json_file(filepath, data):
    try:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving JSON file {filepath}: {str(e)}")
        return False

def get_user_notes_file(username):
    """Obtiene la ruta al archivo de notas del usuario."""
    # Sanitizamos el nombre de usuario para evitar problemas de seguridad
    safe_username = secure_filename(username.lower())
    return os.path.join(NOTES_DIR, f"{safe_username}_notes.json")

# ========================================================================
# ===== FUNCIONES DE MANEJO DE REGISTROS =====
# ========================================================================
def get_registros():
    try:
        if not os.path.exists(REGISTROS_FILE):
            return []
            
        with open(REGISTROS_FILE, 'r', encoding='utf-8') as f:
            registros = json.load(f)
            for registro in registros:
                if 'estado' not in registro:
                    registro['estado'] = 'PENDIENTE'
                
                if registro.get('totalParticipacion') is None:
                    registro['totalParticipacion'] = str(
                        float(registro.get('ng', 0)) + float(registro.get('trenes', 0))
                    )
                
                total_participacion = float(registro['totalParticipacion'])
                pagos = registro.get('pagos', [])
                total_pagado = sum(float(pago.get('monto', 0)) for pago in pagos)
                registro['saldoPendiente'] = round(total_participacion - total_pagado, 2)
                
            print(f"Registros cargados exitosamente desde {REGISTROS_FILE}. Total: {len(registros)}")
            return registros
    except Exception as e:
        print(f"Error leyendo registros: {str(e)}")
        return []

def save_registros(registros):
    try:
        with open(REGISTROS_FILE, 'w', encoding='utf-8') as f:
            json.dump(registros, f, indent=2, ensure_ascii=False)
        print(f"Registros guardados exitosamente en {REGISTROS_FILE}. Total: {len(registros)}")
    except Exception as e:
        print(f"Error guardando registros: {str(e)}")
        raise

def calcular_saldo(registro):
    try:
        total_participacion = float(registro.get('totalParticipacion', 0))
        pagos = registro.get('pagos', [])
        total_pagado = sum(float(pago.get('monto', 0)) for pago in pagos)
        return round(total_participacion - total_pagado, 2)
    except Exception as e:
        print(f"Error en calcular_saldo: {str(e)}")
        return 0

def migrar_registros():
    try:
        old_file = os.path.join(BASE_DIR, 'registros.json')
        if os.path.exists(old_file):
            with open(old_file, 'r', encoding='utf-8') as f:
                old_registros = json.load(f)

            if os.path.exists(REGISTROS_FILE):
                with open(REGISTROS_FILE, 'r', encoding='utf-8') as f:
                    current_registros = json.load(f)
                
                existing_ids = {r['id'] for r in current_registros}
                new_registros = [r for r in old_registros if r['id'] not in existing_ids]
                current_registros.extend(new_registros)
                
                save_json_file(REGISTROS_FILE, current_registros)
            else:
                save_json_file(REGISTROS_FILE, old_registros)
            
            os.remove(old_file)
            print("Migración completada exitosamente")
    except Exception as e:
        print(f"Error en la migración: {str(e)}")

# ========================================================================
# ===== RUTAS DE AUTENTICACIÓN =====
# ========================================================================
@app.route('/login', methods=['GET', 'POST'])
def login():
    # CÓDIGO DE DEBUGGING
    print("========== DEBUG LOGIN ==========")
    print(f"Contenido del archivo {USERS_FILE}:")
    try:
        with open(USERS_FILE, 'r') as f:
            print(f.read())
    except Exception as e:
        print(f"Error leyendo archivo: {e}")
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        if not username or not password:
            flash('Por favor complete todos los campos')
            return render_template('login.html', error='Por favor complete todos los campos')

        try:
            users = load_users()
            user = next((u for u in users if u['username'].lower() == username.lower()), None)
            
            if user and bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
                session['username'] = user['username']
                session['role'] = user['role']
                session['local'] = user['local']
                session['society'] = user['society']
                session['permissions'] = user['permissions']
                session['pages'] = user.get('pages', [])  # Guardar páginas accesibles en la sesión
                
                # Actualizar último acceso
                user['lastAccess'] = datetime.now(TIMEZONE).isoformat()
                save_users(users)
                
                return redirect(url_for('index'))
            
            flash('Usuario o contraseña incorrectos')
            return render_template('login.html', error='Usuario o contraseña incorrectos')
            
        except Exception as e:
            print(f"Error en login: {str(e)}")
            flash('Error en el sistema')
            return render_template('login.html', error='Error en el sistema')
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    # Eliminar el usuario de la lista de sesiones activas si existe
    username = session.get('username')
    session_id = session.get('session_id')
    
    if username and session_id:
        # Remover de sesiones activas
        with session_lock:
            if session_id in active_sessions:
                del active_sessions[session_id]
    
    # Limpiar la sesión
    session.clear()
    
    # Redireccionar al login
    return redirect(url_for('login'))

# ========================================================================
# ===== RUTAS DE API PARA USUARIOS =====
# ========================================================================
@app.route('/api/users', methods=['POST'])
@login_required
@page_access_required('usuarios')
def create_user():
    if session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        data = request.get_json()
        users = load_users()
        
        # Verificar si el usuario ya existe
        if any(user['username'] == data['username'] for user in users):
            return jsonify({
                'status': 'error',
                'message': 'El usuario ya existe'
            }), 400
        
        # Hash de la contraseña
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(data['password'].encode('utf-8'), salt)
        
        # Usar UUID para generar ID único - CAMBIO CLAVE
        import uuid
        
        new_user = {
            'id': str(uuid.uuid4()),  # ID único garantizado
            'username': data['username'],
            'password': hashed.decode('utf-8'),
            'role': data['role'],
            'local': data['local'],
            'society': data['society'],
            'pages': data.get('pages', []),
            'permissions': data.get('permissions', []),
            'status': 'active',
            'lastAccess': None,
            'created_at': datetime.now(TIMEZONE).isoformat()
        }
        
        users.append(new_user)
        save_users(users)
        
        return jsonify({
            'status': 'success',
            'message': 'Usuario creado exitosamente'
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/users/<user_id>', methods=['PUT'])
@login_required
def update_user(user_id):
    if session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        data = request.get_json()
        users = load_users()
        
        # Depuración para identificar problemas
        print(f"Actualizando usuario con ID: {user_id}")
        print(f"IDs de usuarios disponibles: {[user['id'] for user in users]}")
        
        # Usar comparación estricta de strings para IDs
        user_index = None
        for index, user in enumerate(users):
            if str(user['id']).strip() == str(user_id).strip():
                user_index = index
                break
        
        if user_index is None:
            return jsonify({
                'status': 'error',
                'message': f'Usuario con ID {user_id} no encontrado'
            }), 404
        
        # Guardar el nombre de usuario antes de la actualización para registro
        old_username = users[user_index]['username']
        print(f"Actualizando usuario: {old_username} (ID: {user_id})")
        
        # Actualizar datos del usuario
        users[user_index].update({
            'username': data['username'],
            'role': data['role'],
            'local': data['local'],
            'society': data['society'],
            'pages': data.get('pages', []),
            'permissions': data.get('permissions', []),
            'status': data.get('status', 'active'),
            'updated_at': datetime.now(TIMEZONE).isoformat()
        })
        
        # Actualizar contraseña solo si se proporciona una nueva
        if data.get('password'):
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw(data['password'].encode('utf-8'), salt)
            users[user_index]['password'] = hashed.decode('utf-8')
        
        save_users(users)
        
        # Actualizar la sesión si el usuario está modificando sus propios datos
        if session.get('username') == users[user_index]['username']:
            session['role'] = users[user_index]['role']
            session['local'] = users[user_index]['local']
            session['society'] = users[user_index]['society']
            session['pages'] = users[user_index].get('pages', [])
            session['permissions'] = users[user_index].get('permissions', [])
        
        return jsonify({
            'status': 'success',
            'message': f'Usuario {old_username} actualizado exitosamente'
        })
        
    except Exception as e:
        print(f"Error updating user: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/users', methods=['GET'])
@login_required
def get_users():
    """Obtiene la lista de todos los usuarios."""
    # Verificación de permisos dentro de la función
    if not user_has_page_access('usuarios') and session.get('role') != 'admin':
        return jsonify({'error': 'No tienes permiso para acceder a esta función'}), 403
    
    try:
        users = load_users()
        simplified_users = [{
            'id': user['id'],
            'username': user['username'],
            'role': user['role'],
            'status': user.get('status', 'active'),
            'lastAccess': user.get('lastAccess', None),
            'pages': user.get('pages', []),
            'permissions': user.get('permissions', [])
        } for user in users]
        return jsonify(simplified_users)
    except Exception as e:
        print(f"Error en get_users: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/users/<user_id>', methods=['GET'])
@login_required
def get_user(user_id):
    """Obtiene un usuario específico por ID."""
    # Verificación de permisos dentro de la función
    if not user_has_page_access('usuarios') and session.get('role') != 'admin':
        return jsonify({'error': 'No tienes permiso para acceder a esta función'}), 403
    
    try:
        users = load_users()
        
        # Depuración para ver todos los IDs
        print(f"Buscando usuario con ID: {user_id}")
        print(f"IDs disponibles: {[user['id'] for user in users]}")
        
        # Mejorar la búsqueda para ser más estricta con la comparación de IDs
        user = None
        for u in users:
            if str(u['id']).strip() == str(user_id).strip():
                user = u
                break
        
        if user is None:
            return jsonify({
                'status': 'error',
                'message': f'Usuario con ID {user_id} no encontrado'
            }), 404
        
        print(f"Usuario encontrado: {user['username']}")
        
        # Filtrar información sensible
        simplified_user = {
            'id': user['id'],
            'username': user['username'],
            'role': user['role'],
            'status': user.get('status', 'active'),
            'pages': user.get('pages', []),
            'permissions': user.get('permissions', [])
        }
        
        return jsonify(simplified_user)
        
    except Exception as e:
        print(f"Error en get_user: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/users/<user_id>', methods=['DELETE'])
@login_required
@page_access_required('usuarios')
def delete_user(user_id):
    if session.get('role') != 'admin':
        return jsonify({'error': 'Unauthorized'}), 401
    
    try:
        # Evitar que un usuario se elimine a sí mismo
        if str(session.get('user_id')) == str(user_id):
            return jsonify({
                'status': 'error',
                'message': 'No puedes eliminar tu propio usuario'
            }), 400
        
        users = load_users()
        
        # Encontrar el usuario a eliminar
        user_to_delete = None
        for user in users:
            if str(user['id']).strip() == str(user_id).strip():
                user_to_delete = user
                break
                
        if not user_to_delete:
            return jsonify({
                'status': 'error',
                'message': f'Usuario con ID {user_id} no encontrado'
            }), 404
        
        # Guardar el nombre para el mensaje
        username = user_to_delete['username']
        
        # Eliminar el usuario
        users = [user for user in users if str(user['id']).strip() != str(user_id).strip()]
        save_users(users)
        
        return jsonify({
            'status': 'success',
            'message': f'Usuario {username} eliminado exitosamente'
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

def create_demo_user():
    """Crea un usuario demo con acceso solo al monitor del sistema"""
    try:
        users = load_users()
        
        # Verificar si existe el usuario demo
        if any(user['username'].lower() == 'demo' for user in users):
            print("Usuario demo ya existe")
            return  # El usuario ya existe
        
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw('demo123'.encode('utf-8'), salt)
        
        demo_user = {
            'id': str(uuid.uuid4()),
            'username': 'demo',
            'password': hashed.decode('utf-8'),
            'role': 'demo',
            'pages': ['system_monitor'],  # Solo acceso al monitor de sistema
            'permissions': ['view_system_stats'],
            'status': 'active',
            'lastAccess': None,
            'created_at': datetime.now(TIMEZONE).isoformat()
        }
        
        users.append(demo_user)
        save_users(users)
        print("Usuario demo creado exitosamente")
    except Exception as e:
        print(f"Error creando usuario demo: {str(e)}")

    
# ========================================================================
# ===== RUTAS DEL DASHBOARD Y RUTA PRINCIPAL =====
# ========================================================================
@app.route('/')
@login_required
def index():
    current_time = datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
    
    # Obtener información del usuario
    username = session.get('username')
    users = load_users()
    user = next((u for u in users if u['username'] == username), None)
    
    # Verificar si el usuario solo tiene acceso al monitor del sistema
    pages = session.get('pages', [])
    if pages == ['system_monitor']:
        return redirect(url_for('admin_system_dashboard'))
    
    # Información básica del usuario para la plantilla
    user_info = None
    if user:
        user_info = {
            'avatar_url': user.get('avatar_url') or url_for('static', filename='images/default_avatar.png')
        }
    
    if session.get('role') == 'admin':
        return render_template('dashboard.html', 
                             current_time=current_time,
                             user_info=user_info,
                             now=int(time.time()))  # Para evitar caché de imagen
    
    if pages:
        # Mapeo de páginas a rutas
        page_routes = {
            'transferencias': 'transferencias',
            'reportes2': 'casos_pendientes',
            'registros': 'registros',
            'index': 'nuevo_registro',
            'registros_cerrados': 'registros_cerrados',
            'reportes': 'reportes',
            'usuarios': 'usuarios',
            'zonas': 'zonas',
            'system_monitor': 'admin_system_dashboard'
        }
        
        # Redirigir a la primera página accesible
        first_page = pages[0]
        if first_page in page_routes:
            return redirect(url_for(page_routes[first_page]))
    
    return render_template('dashboard.html', 
                         current_time=current_time,
                         user_info=user_info,
                         now=int(time.time()))  # Para evitar caché de imagen

@app.context_processor
def utility_processor():
    return dict(user_has_page_access=user_has_page_access)

@app.route('/usuarios')
@login_required
@page_access_required('usuarios')
def usuarios():
    return render_template('usuarios.html')

@app.route('/api/dashboard/counts')
def get_dashboard_counts():
    if 'username' not in session:
        return jsonify({'error': 'No autorizado'}), 401
    
    current_user = session['username']
    today = datetime.now(TIMEZONE).date()
    
    try:
        # Cargar datos de pendientes.json y de todos los archivos de zona
        pendientes = load_json_file(PENDIENTES_FILE)
        
        # Lista para almacenar todos los registros del usuario actual
        all_registros = []
        
        # 1. Procesar registros de pendientes.json
        for r in pendientes:
            if r.get('usuario', '').upper() == current_user.upper():
                all_registros.append(r)
        
        # 2. Procesar registros de cada archivo de zona
        for zona, zona_file in ZONAS_JSON.items():
            zona_data = load_json_file(zona_file)
            for r in zona_data:
                if r.get('usuario', '').upper() == current_user.upper():
                    # Asegurarse de que tenga un estado OK si viene de un archivo de zona
                    if not r.get('estado'):
                        r['estado'] = 'OK'
                    all_registros.append(r)
        
        # Filtrar registros del día actual
        today_registros = []
        for r in all_registros:
            # Buscar en diferentes campos de fecha
            fecha_obj = None
            
            # Intentar con varios campos de fecha y formatos
            for field in ['fecha_creacion', 'fecha', 'fecha_actualizacion']:
                fecha_str = r.get(field)
                if fecha_str and isinstance(fecha_str, str) and fecha_str.strip():
                    for fmt in ['%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%d/%m/%Y']:
                        try:
                            fecha_obj = datetime.strptime(fecha_str, fmt).date()
                            break
                        except ValueError:
                            continue
                if fecha_obj:
                    break
            
            # Si encontramos una fecha válida y es hoy, agregar a los registros de hoy
            if fecha_obj and fecha_obj == today:
                today_registros.append(r)
        
        # Impresión para depuración
        print(f"Total registros del usuario: {len(all_registros)}")
        print(f"Registros de hoy: {len(today_registros)}")
        
        # Calcular contadores para hoy (normalizando los estados)
        today_total = len(today_registros)
        today_pending = len([r for r in today_registros if str(r.get('estado', '')).upper() == 'PENDIENTE'])
        today_completed = len([r for r in today_registros if str(r.get('estado', '')).upper() == 'OK'])
        
        # Imprimir para depuración
        print(f"Hoy - Total: {today_total}, Pendientes: {today_pending}, Completados: {today_completed}")
        
        # Contar TODOS los pendientes por zona (independiente de la fecha)
        zone_counts = {}
        total_pending = 0
        for registro in all_registros:
            if str(registro.get('estado', '')).upper() == 'PENDIENTE':
                zona = registro.get('zona', 'Sin Zona')
                zone_counts[zona] = zone_counts.get(zona, 0) + 1
                total_pending += 1
        
        return jsonify({
            'today_total': today_total,
            'today_pending': today_pending,
            'today_completed': today_completed,
            'total_pending': total_pending,
            'pending_by_zone': zone_counts,
            'total_processed': today_total,
            'timestamp': datetime.now(TIMEZONE).isoformat()
        })
    
    except Exception as e:
        print(f"Error en get_dashboard_counts: {str(e)}")
        import traceback
        traceback.print_exc()  # Imprimir stack trace completo
        return jsonify({'error': str(e)}), 500

@app.route('/api/dashboard/calendar-status')
@login_required
def get_calendar_status():
    """
    Devuelve el estado de carga de datos por fecha para mostrar en el calendario
    Los estados posibles son:
    - ok: todo está cargado correctamente
    - pending: hay elementos en estado pendiente
    - missing: faltan elementos por cargar
    - mixed: hay elementos pendientes y también faltan elementos por cargar
    """
    try:
        # Definir el rango de fechas a analizar (por ejemplo, últimos 60 días)
        today = datetime.now(TIMEZONE).date()
        start_date = today - timedelta(days=30)  # 30 días atrás
        end_date = today + timedelta(days=14)    # 14 días adelante (para planificar)
        
        # Lista para almacenar los resultados por fecha
        date_statuses = []
        
        # Cargar datos de pendientes.json
        pendientes = load_json_file(PENDIENTES_FILE)
        
        # Procesar cada fecha en el rango
        current_date = start_date
        while current_date <= end_date:
            date_str = current_date.strftime('%Y-%m-%d')
            
            # Estructuras para almacenar los estados por zona
            pending_zones = {}  # Zonas con elementos pendientes
            missing_zones = {}  # Zonas con elementos faltantes
            
            # Verificar estado de cada zona para esta fecha
            for zona, zona_file in ZONAS_JSON.items():
                try:
                    # Cargar datos de la zona
                    zona_data = load_json_file(zona_file)
                    
                    # Filtrar registros para la fecha actual
                    zona_registros_fecha = [
                        r for r in zona_data 
                        if r.get('fecha') == date_str
                    ]
                    
                    # Filtrar registros pendientes para esta zona y fecha
                    pendientes_zona_fecha = [
                        r for r in pendientes 
                        if r.get('zona') == zona and r.get('fecha') == date_str
                    ]
                    
                    # Obtener etiquetas y turnos esperados para esta zona
                    etiquetas_turnos = get_etiqueta_turnos_map(zona)
                    
                    # Lista para llevar el seguimiento de lo que falta o está pendiente
                    faltantes = []
                    pendientes_etiquetas = []
                    
                    # Para cada combinación etiqueta-turno esperada
                    for etiqueta, turnos in etiquetas_turnos.items():
                        for turno in turnos:
                            # Verificar si esta combinación está cargada como OK
                            esta_ok = any(
                                r.get('etiqueta') == etiqueta and r.get('turno') == turno and r.get('estado') == 'OK'
                                for r in zona_registros_fecha
                            )
                            
                            # Verificar si está en pendientes
                            esta_pendiente = any(
                                r.get('etiqueta') == etiqueta and r.get('turno') == turno 
                                for r in pendientes_zona_fecha
                            )
                            
                            # Si no está OK ni pendiente, entonces falta
                            if not esta_ok and not esta_pendiente and current_date <= today:
                                faltantes.append(f"{etiqueta} ({turno})")
                            
                            # Si está en pendientes
                            if esta_pendiente:
                                pendientes_etiquetas.append(f"{etiqueta} ({turno})")
                    
                    # Actualizar datos de la zona
                    if pendientes_etiquetas:
                        pending_zones[zona] = {
                            'name': zona,
                            'items': pendientes_etiquetas
                        }
                    
                    if faltantes:
                        missing_zones[zona] = {
                            'name': zona,
                            'items': faltantes
                        }
                    
                except Exception as e:
                    print(f"Error procesando zona {zona} para fecha {date_str}: {str(e)}")
            
            # Determinar estado general de la fecha
            status = 'unknown'
            if not pending_zones and not missing_zones:
                status = 'ok'
            elif pending_zones and missing_zones:
                status = 'mixed'
            elif pending_zones:
                status = 'pending'
            elif missing_zones:
                status = 'missing'
            
            # Solo incluir fechas que no estén 'ok' o fechas de hoy o anteriores
            if status != 'ok' or current_date <= today:
                date_statuses.append({
                    'date': date_str,
                    'status': status,
                    'details': {
                        'pending': list(pending_zones.values()) if pending_zones else [],
                        'missing': list(missing_zones.values()) if missing_zones else []
                    }
                })
            
            # Pasar a la siguiente fecha
            current_date += timedelta(days=1)
        
        return jsonify({
            'dates': date_statuses
        })
        
    except Exception as e:
        print(f"Error en get_calendar_status: {str(e)}")
        import traceback
        traceback.print_exc()  # Imprimir stack trace completo
        return jsonify({'error': str(e)}), 500


def get_etiqueta_turnos_map(zona):
    """
    Devuelve un diccionario con las etiquetas y sus turnos asociados para cada zona
    """
    if zona == "BIMBO":
        return {
            "UFB07": ["UNI"], "UFB11": ["UNI"], "UFB53": ["UNI"], "UFB61": ["UNI"],
            "UFB69": ["UNI"], "UFB86": ["UNI"], "UFB92": ["UNI"], "UFB106": ["UNI"],
            "UFB123": ["UNI"], "UFB124": ["UNI"], "UFB130": ["UNI"], "UFB132": ["UNI"],
            "HL01": ["UNI"], "SH18": ["UNI"], "UFB31": ["UNI"], "UFB32": ["UNI"],
            "UFB33": ["UNI"], "UFB50": ["UNI"], "UFB55": ["UNI"], "UFB60": ["UNI"],
            "UFB82": ["UNI"], "UFB110": ["UNI"], "UFB127": ["UNI"], "ZJ02": ["UNI"],
            "ZT60": ["UNI"], "UFB12": ["UNI"], "UFB13": ["UNI"], "UFB89": ["UNI"],
            "UFB01": ["UNI"], "UFB03": ["UNI"], "UFB52": ["UNI"], "UFB93": ["UNI"],
            "UFB128": ["UNI"], "UFB129": ["UNI"], "HO25": ["UNI"], "UFB133": ["UNI"],
            "UFB134": ["UNI"], "UFB09": ["UNI"]
        }
    elif zona == "CONSTITUCION":
        return {
            "JM12": ["UNI"], "JM13": ["DIA", "NOCHE"], "JM21": ["DIA", "NOCHE"],
            "JM22": ["UNI"], "JM23": ["UNI"], "JM25": ["DIA", "NOCHE"],
            "JM28": ["UNI"], "JM32": ["DIA", "NOCHE"], "JM33": ["DIA", "NOCHE"],
            "JM39": ["DIA", "NOCHE"], "JM42": ["DIA", "NOCHE"], "TH07": ["DIA", "NOCHE"],
            "TH13": ["DIA", "NOCHE"], "TH54": ["DIA", "NOCHE"], "PF00": ["DIA", "NOCHE"],
            "PF02": ["DIA", "NOCHE"], "PF03": ["DIA", "NOCHE"], "PF04": ["DIA", "NOCHE"],
            "PF05": ["DIA", "NOCHE"], "PF06": ["DIA", "NOCHE"], "CR33": ["UNI"],
            "SH04": ["UNI"], "SH11": ["UNI"], "BA04": ["DIA", "TGT", "NOCHE"],
            "BA05": ["DIA", "NOCHE"], "BA06": ["UNI"], "BA07": ["UNI"]
        }
    elif zona == "GASTRONOMIA":
        return {
            "TH09": ["DIA", "NOCHE"], "TH10": ["DIA", "NOCHE"], "TH16": ["DIA", "NOCHE"],
            "TH18": ["DIA", "NOCHE"], "HO05": ["DIA", "NOCHE"], "HO24": ["DIA", "NOCHE"],
            "HO26": ["DIA", "NOCHE"], "HO39": ["DIA", "NOCHE"], "JM61": ["DIA", "NOCHE"],
            "JM62": ["DIA", "NOCHE"], "ZT56": ["UNI"], "HOOD": ["DIA", "NOCHE"]
        }
    elif zona == "KIOSCOS":
        return {
            "KO01": ["DIA", "NOCHE"], "KO02": ["DIA", "NOCHE"], "KO04": ["DIA", "NOCHE"],
            "KO05": ["DIA", "NOCHE"], "KO11": ["UNI"], "KO10": ["UNI"],
            "KF01": ["UNI"], "KM00": ["DIA", "NOCHE"], "KM04": ["UNI"],
            "KZ02": ["DIA", "NOCHE"], "KC01": ["UNI"], "KR01": ["DIA", "NOCHE"]
        }
    elif zona == "ONCE":
        return {
            "HO03": ["UNI"], "HO04": ["UNI"], "HO07": ["UNI"], "HO13": ["UNI"],
            "HO19": ["UNI"], "HO21": ["UNI"], "HO22": ["UNI"], "HO33": ["UNI"],
            "HO43": ["UNI"], "HO44": ["UNI"], "HO46": ["UNI"], "HO47": ["UNI"],
            "HO48": ["UNI"], "HO50": ["UNI"], "HO54": ["UNI"], "HO55": ["UNI"]
        }
    elif zona == "RETIRO":
        return {
            "JM07": ["DIA", "NOCHE"], "JM43": ["DIA", "NOCHE"], "JM45": ["UNI"],
            "JM60": ["DIA", "NOCHE"], "CC11": ["DIA", "NOCHE"], "CC12": ["DIA", "NOCHE"],
            "ZT51": ["UNI"], "CR13": ["DIA", "NOCHE"], "CR14": ["UNI"]
        }
    elif zona == "TBA":
        return {
            "MJ15": ["UNI"], "MJ16": ["DIA", "NOCHE"], "MJ22": ["UNI"],
            "MJ23": ["DIA", "NOCHE"], "MJ24": ["DIA", "NOCHE"], "MJ35": ["UNI"],
            "BR03": ["DIA", "NOCHE"], "CR08": ["UNI"], "CR05": ["UNI"],
            "LI00": ["DIA", "NOCHE"], "LI01": ["DIA", "NOCHE"], "LI05": ["DIA", "NOCHE"],
            "LI07": ["DIA", "NOCHE"], "LI09": ["DIA", "NOCHE"], "LI11": ["UNI"]
        }
    elif zona == "ZONA SUR":
        return {
            "ZT03": ["UNI"], "ZT18": ["DIA", "NOCHE"], "ZT19": ["DIA", "NOCHE"],
            "ZT20": ["UNI"], "ZI27": ["DIA", "NOCHE"], "ZI28": ["UNI"],
            "ZI29": ["UNI"], "ZI31": ["UNI"], "ZI32": ["UNI"],
            "ZI33": ["UNI"], "BR04": ["UNI"], "ZJ04": ["UNI"],
            "ZJ05": ["UNI"], "ZJ06": ["UNI"], "ZJ10": ["UNI"],
            "ZJ11": ["UNI"], "ZJ14": ["UNI"], "ZJ17": ["UNI"],
            "ZI04": ["UNI"], "ZI06": ["UNI"], "ZI30": ["UNI"],
            "ZT33": ["UNI"], "ZT34": ["UNI"], "ZI01": ["DIA", "NOCHE"],
            "ZI02": ["DIA", "NOCHE"], "ZI03": ["UNI"], "ZI10": ["UNI"],
            "ZI11": ["UNI"], "ZI14": ["DIA", "NOCHE"], "ZI18": ["DIA", "NOCHE"],
            "ZI23": ["DIA", "NOCHE"], "ZF05": ["UNI"], "ZF08": ["UNI"],
            "ZF18": ["DIA", "NOCHE"], "ZF19": ["DIA", "NOCHE"], "ZF20": ["UNI"],
            "CL02": ["UNI"]
        }
    elif zona == "AMBULANTE":
        return {
            "VA02": ["UNI"], "VA03": ["UNI"], "VA04": ["UNI"], "VA05": ["UNI"]
        }
    else:
        return {}  # Zona desconocida
    
# ========================================================================
# ===== RUTAS DE REGISTROS =====
# ========================================================================

@app.route('/check-session', methods=['GET'])
def check_session():
    if 'username' in session:
        return jsonify({'status': 'ok', 'username': session['username']}), 200
    return jsonify({'status': 'error', 'message': 'No session'}), 401





@app.route('/registros')
@login_required
@page_access_required('registros')
def registros():
    try:
        # Cargar y filtrar registros normales - mantener tu lógica actual
        registros_data = get_registros()
        registros_pendientes = [
            r for r in registros_data 
            if (r.get('estado') != 'CERRADO' and  # No cerrado explícitamente
                (r.get('saldoPendiente', 0) != 0 or  # Saldo diferente de cero
                 float(r.get('saldoPendiente', 0)) < 0 or  # Incluir facturas con excedente (saldo negativo)
                 not r.get('pagos')))  # O sin pagos
        ]
        
        # Ordenar por fecha más reciente primero
        registros_pendientes.sort(
            key=lambda x: datetime.strptime(x['datetime'], '%Y-%m-%d %H:%M:%S'),
            reverse=True
        )
        
        # Cargar pagos no vinculados desde su archivo correspondiente
        pagos_no_vinculados = []
        data_folder = os.path.dirname(os.path.abspath(REGISTROS_FILE))
        pagos_file = os.path.join(data_folder, 'pagos_no_vinculados.json')
        
        if os.path.exists(pagos_file):
            try:
                with open(pagos_file, 'r', encoding='utf-8') as f:
                    pagos_no_vinculados = json.load(f)
                print(f"Pagos no vinculados cargados: {len(pagos_no_vinculados)}")
            except Exception as e:
                print(f"Error al cargar pagos no vinculados: {str(e)}")
                pagos_no_vinculados = []  # Si hay error, usar lista vacía
        else:
            print(f"Archivo de pagos no vinculados no encontrado en {pagos_file}")
            pagos_no_vinculados = []  # Si no existe el archivo, usar lista vacía
        
        # Devolver la plantilla con ambos conjuntos de datos
        return render_template('registros.html', 
                             registros=registros_pendientes,
                             pagos_no_vinculados=pagos_no_vinculados,  # Agregar esta variable
                             current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))
    except Exception as e:
        print(f"Error en /registros: {str(e)}")
        import traceback
        traceback.print_exc()
        # Si hay error, devolver listas vacías para ambos conjuntos de datos
        return render_template('registros.html', 
                             registros=[], 
                             pagos_no_vinculados=[],
                             current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))

@app.route('/registros/cerrados')
@login_required
@page_access_required('registros_cerrados')
def registros_cerrados():
    try:
        registros_data = get_registros()
        registros_cerrados = [r for r in registros_data if r.get('estado') == 'CERRADO']
        
        registros_cerrados.sort(
            key=lambda x: datetime.strptime(x['datetime'], '%Y-%m-%d %H:%M:%S'),
            reverse=True
        )
        
        return render_template('registros_cerrados.html', registros=registros_cerrados)
    except Exception as e:
        print(f"Error en /registros/cerrados: {str(e)}")
        return render_template('registros_cerrados.html', registros=[])

@app.route('/submit', methods=['POST'])
@login_required
@page_access_required('index')
def submit():
    try:
        data = request.form
        
        required_fields = ['cliente', 'netoVta', 'iva', 'ng', 'trenes', 'origen']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    'status': 'error',
                    'message': f'Campo requerido: {field}'
                }), 400

        try:
            neto_vta = float(data['netoVta'])
            iva = float(data['iva'])
            ng = float(data['ng'])
            trenes = float(data['trenes'])
            
            total_general = round(neto_vta + iva, 2)
            total_participacion = round(ng + trenes, 2)
            
            if abs(total_general - total_participacion) > 0.01:
                return jsonify({
                    'status': 'error',
                    'message': 'El total de participación debe ser igual a la suma de Neto e IVA'
                }), 400
        except ValueError:
            return jsonify({
                'status': 'error',
                'message': 'Los valores numéricos no son válidos'
            }), 400

        nuevo_registro = {
            'id': get_current_datetime(),
            'datetime': datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'),
            'usuario': session['username'],
            'cliente': data['cliente'],
            'netoVta': str(neto_vta),
            'iva': str(iva),
            'ng': str(ng),
            'trenes': str(trenes),
            'totalParticipacion': str(total_participacion),
            'origen': data['origen'],
            'sinCargo': 'sinCargo' in data,
            'estado': 'PENDIENTE',
            'medioPago': data.get('medioPago', ''),
            'bancoSociedad': data.get('bancoSociedad', ''),
            'observaciones': data.get('observaciones', ''),
            'archivos': [],
            'pagos': [],
            'saldoPendiente': total_participacion
        }

        if 'files[]' in request.files:
            archivos = request.files.getlist('files[]')
            for archivo in archivos:
                if archivo and allowed_file(archivo.filename):
                    filename = secure_filename(archivo.filename)
                    archivo.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                    nuevo_registro['archivos'].append(filename)

        registros = get_registros()
        registros.append(nuevo_registro)
        save_registros(registros)

        return jsonify({
            'status': 'success',
            'message': 'Registro creado correctamente',
            'data': nuevo_registro
        })

    except Exception as e:
        print(f"Error en submit: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
    
@app.route('/registro/<registro_id>/adjuntos', methods=['POST'])
@login_required
def add_adjuntos(registro_id):
    """Añade archivos adjuntos a un registro existente"""
    try:
        # Verificar si el registro existe
        registros = get_registros()
        registro_index = next((i for i, r in enumerate(registros) if r['id'] == registro_id), -1)
        
        if registro_index == -1:
            return jsonify({
                'status': 'error',
                'message': 'Registro no encontrado'
            }), 404
            
        # Procesar archivos adjuntos
        if 'files[]' not in request.files:
            return jsonify({
                'status': 'error',
                'message': 'No se adjuntaron archivos'
            }), 400
            
        files = request.files.getlist('files[]')
        if not files or not any(file.filename for file in files):
            return jsonify({
                'status': 'error',
                'message': 'No se seleccionaron archivos válidos'
            }), 400
            
        # Guardar archivos
        saved_files = []
        for file in files:
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(file_path)
                saved_files.append(filename)
                
        # Agregar archivos al registro
        if not registros[registro_index].get('archivos'):
            registros[registro_index]['archivos'] = []
            
        registros[registro_index]['archivos'].extend(saved_files)
        
        # Agregar observaciones si existen
        observaciones = request.form.get('observaciones', '').strip()
        if observaciones:
            # Si ya hay observaciones, añadimos las nuevas con una nota de fecha
            if registros[registro_index].get('observaciones'):
                nueva_observacion = f"\n\n[{datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')}]\n{observaciones}"
                registros[registro_index]['observaciones'] += nueva_observacion
            else:
                registros[registro_index]['observaciones'] = observaciones
                
        # Guardar cambios
        save_registros(registros)
        
        return jsonify({
            'status': 'success',
            'message': 'Archivos adjuntados correctamente',
            'files': saved_files
        })
        
    except Exception as e:
        print(f"Error agregando adjuntos: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
    
@app.route('/registro/<registro_id>/pago', methods=['POST'])
@login_required
def registrar_pago(registro_id):
    """Registrar un pago para un registro específico"""
    try:
        # Verificar que el registro existe
        registros = get_registros()
        registro_index = next((i for i, r in enumerate(registros) if r['id'] == registro_id), -1)
        
        if registro_index == -1:
            return jsonify({
                'status': 'error',
                'message': 'Registro no encontrado'
            }), 404
        
        # Obtener datos del formulario
        ng = float(request.form.get('ng', 0))
        trenes = float(request.form.get('trenes', 0))
        medio_pago = request.form.get('medioPago')
        numero_comprobante = request.form.get('numeroComprobante')
        banco_sociedad = request.form.get('bancoSociedad', '')
        
        # Validaciones básicas
        if not medio_pago or not numero_comprobante or (ng + trenes) <= 0:
            return jsonify({
                'status': 'error',
                'message': 'Faltan datos requeridos para el pago'
            }), 400
        
        # Verificar archivos adjuntos
        if 'files[]' not in request.files:
            return jsonify({
                'status': 'error',
                'message': 'No se adjuntaron archivos'
            }), 400
        
        files = request.files.getlist('files[]')
        if not files or not any(file.filename for file in files):
            return jsonify({
                'status': 'error',
                'message': 'No se seleccionaron archivos válidos'
            }), 400
        
        # Guardar archivos
        archivos_guardados = []
        for file in files:
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(file_path)
                archivos_guardados.append(filename)
        
        # Calcular el saldo pendiente actual
        total_participacion = float(registros[registro_index].get('totalParticipacion', 0))
        pagos_realizados = sum(float(p.get('monto', 0)) for p in registros[registro_index].get('pagos', []))
        saldo_pendiente = total_participacion - pagos_realizados
        
        # Monto total del pago actual
        monto_pago = ng + trenes
        
        # Verificar si el pago excede el saldo pendiente
        if monto_pago > saldo_pendiente and saldo_pendiente > 0:
            # Calcular el excedente
            excedente = monto_pago - saldo_pendiente
            
            # Proporciones para distribución del pago en el registro
            ratio_ng = ng / monto_pago
            ratio_trenes = trenes / monto_pago
            
            # Montos ajustados para el registro
            ng_registro = saldo_pendiente * ratio_ng
            trenes_registro = saldo_pendiente * ratio_trenes
            
            # Crear el pago para aplicar al registro (por el saldo pendiente)
            nuevo_pago = {
                'id': str(uuid.uuid4()),
                'fecha': datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'),
                'ng': ng_registro,
                'trenes': trenes_registro,
                'monto': saldo_pendiente,
                'medioPago': medio_pago,
                'numeroComprobante': numero_comprobante,
                'bancoSociedad': banco_sociedad,
                'archivos': archivos_guardados.copy(),  # Copia para no modificar la lista original
                'usuario': session['username']
            }
            
            # Crear anticipo con el excedente
            ng_excedente = excedente * ratio_ng
            trenes_excedente = excedente * ratio_trenes
            
            anticipo = {
                'id': str(uuid.uuid4()),
                'fecha': datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'),
                'ng': ng_excedente,
                'trenes': trenes_excedente,
                'monto': excedente,
                'medioPago': medio_pago,
                'cliente': registros[registro_index].get('cliente', ''),
                'numeroComprobante': numero_comprobante,
                'bancoSociedad': banco_sociedad,
                'observaciones': f"Excedente de pago aplicado al registro {registro_id}",
                'archivos': archivos_guardados.copy(),  # Copia para no modificar la lista original
                'usuario': session['username']
            }
            
            # Guardar el anticipo en pagos no vinculados
            pagos_no_vinculados = []
            pagos_file = os.path.join(os.path.dirname(REGISTROS_FILE), 'pagos_no_vinculados.json')
            
            if os.path.exists(pagos_file):
                try:
                    with open(pagos_file, 'r', encoding='utf-8') as f:
                        pagos_no_vinculados = json.load(f)
                except:
                    pagos_no_vinculados = []
                    
            pagos_no_vinculados.append(anticipo)
            
            os.makedirs(os.path.dirname(pagos_file), exist_ok=True)
            with open(pagos_file, 'w', encoding='utf-8') as f:
                json.dump(pagos_no_vinculados, f, indent=2)
                
            # Mensaje de respuesta especial para este caso
            if excedente > 0:
                mensaje_respuesta = f'Pago registrado correctamente. El excedente ha sido convertido en un anticipo.'
                
                return jsonify({
                    'status': 'success',
                    'message': mensaje_respuesta,
                    'pago': nuevo_pago,
                    'excedente': excedente
                })
            else:
                return jsonify({
                    'status': 'success',
                    'message': 'Pago registrado correctamente',
                    'pago': nuevo_pago
                })
            
        else:
            # Pago normal (igual o menor al saldo pendiente)
            nuevo_pago = {
                'id': str(uuid.uuid4()),
                'fecha': datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'),
                'ng': ng,
                'trenes': trenes,
                'monto': ng + trenes,
                'medioPago': medio_pago,
                'numeroComprobante': numero_comprobante,
                'bancoSociedad': banco_sociedad,
                'archivos': archivos_guardados,
                'usuario': session['username']
            }
            
            mensaje_respuesta = 'Pago registrado correctamente'
            excedente = 0
        
        # Inicializar la lista de pagos si no existe
        if 'pagos' not in registros[registro_index]:
            registros[registro_index]['pagos'] = []
        
        # Agregar el pago
        registros[registro_index]['pagos'].append(nuevo_pago)
        
        # Recalcular saldo pendiente
        total_participacion = float(registros[registro_index].get('totalParticipacion', 0))
        pagos_realizados = sum(float(p.get('monto', 0)) for p in registros[registro_index].get('pagos', []))
        registros[registro_index]['saldoPendiente'] = total_participacion - pagos_realizados
        
        # CAMBIO IMPORTANTE: Modificar la lógica del estado
        # Solo si el saldo pendiente es exactamente cero, marcarlo como cerrado
        if registros[registro_index]['saldoPendiente'] == 0:
            registros[registro_index]['estado'] = 'CERRADO'
        # Si hay excedente (saldo negativo), mantenerlo como pendiente
        elif registros[registro_index]['saldoPendiente'] < 0:
            # Asegurar que no esté marcado como cerrado
            registros[registro_index]['estado'] = ''  # Estado pendiente
        
        # Guardar los cambios
        save_registros(registros)
        
        return jsonify({
            'status': 'success',
            'message': mensaje_respuesta,
            'pago': nuevo_pago,
            'excedente': excedente if excedente > 0 else None
        })
    
    except Exception as e:
        print(f"Error en registrar_pago: {str(e)}")
        import traceback
        traceback.print_exc()  # Imprime el stacktrace completo en la consola
        return jsonify({
            'status': 'error',
            'message': f'Error al procesar el pago: {str(e)}'
        }), 500
    
# Endpoint para pagos no vinculados
@app.route('/pago-no-vinculado', methods=['POST'])
@login_required
def pago_no_vinculado():
    try:
        # Obtener datos del formulario
        ng = float(request.form.get('ng', 0))
        trenes = float(request.form.get('trenes', 0))
        medio_pago = request.form.get('medioPago')
        cliente = request.form.get('cliente')
        numero_comprobante = request.form.get('numeroComprobante')
        banco_sociedad = request.form.get('bancoSociedad', '')
        observaciones = request.form.get('observaciones', '')
        
        # Validaciones básicas
        monto = ng + trenes
        if not medio_pago or not numero_comprobante or not cliente or monto <= 0:
            return jsonify({
                'status': 'error',
                'message': 'Faltan datos requeridos para el pago'
            }), 400
        
        # Verificar archivos adjuntos
        if 'files[]' not in request.files:
            return jsonify({
                'status': 'error',
                'message': 'No se adjuntaron archivos'
            }), 400
        
        files = request.files.getlist('files[]')
        if not files or not any(file.filename for file in files):
            return jsonify({
                'status': 'error',
                'message': 'No se seleccionaron archivos válidos'
            }), 400
        
        # Guardar archivos
        archivos_guardados = []
        for file in files:
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(file_path)
                archivos_guardados.append(filename)
        
        # Definir ruta para pagos no vinculados (usar la misma carpeta donde se guarda registros.json)
        data_folder = os.path.dirname(os.path.abspath(REGISTROS_FILE))
        pagos_file = os.path.join(data_folder, 'pagos_no_vinculados.json')
        
        # Cargar pagos no vinculados existentes
        pagos_no_vinculados = []
        if os.path.exists(pagos_file):
            try:
                with open(pagos_file, 'r', encoding='utf-8') as f:
                    pagos_no_vinculados = json.load(f)
            except:
                pagos_no_vinculados = []
        
        # Generar ID único para el pago
        pago_id = str(uuid.uuid4())
        
        # Crear el registro del pago
        nuevo_pago = {
            'id': pago_id,
            'fecha': datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'),
            'ng': ng,
            'trenes': trenes,
            'monto': monto,
            'medioPago': medio_pago,
            'cliente': cliente,
            'numeroComprobante': numero_comprobante,
            'bancoSociedad': banco_sociedad,
            'observaciones': observaciones,
            'archivos': archivos_guardados,
            'usuario': session['username']
        }
        
        # Agregar a la lista y guardar
        pagos_no_vinculados.append(nuevo_pago)
        
        os.makedirs(os.path.dirname(pagos_file), exist_ok=True)  # Asegurar que el directorio existe
        with open(pagos_file, 'w', encoding='utf-8') as f:
            json.dump(pagos_no_vinculados, f, indent=2)
        
        return jsonify({
            'status': 'success',
            'message': 'Pago registrado correctamente',
            'data': {
                'pago': nuevo_pago
            }
        })
        
    except Exception as e:
        print(f"Error al registrar pago no vinculado: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': f'Error al procesar el pago: {str(e)}'
        }), 500
    
@app.route('/pagos-no-vinculados', methods=['GET'])
@login_required
def obtener_pagos_no_vinculados():
    try:
        cliente = request.args.get('cliente')
        
        # Cargar pagos no vinculados
        data_folder = os.path.dirname(os.path.abspath(REGISTROS_FILE))
        pagos_file = os.path.join(data_folder, 'pagos_no_vinculados.json')
        pagos_no_vinculados = []
        
        if os.path.exists(pagos_file):
            with open(pagos_file, 'r', encoding='utf-8') as f:
                pagos_no_vinculados = json.load(f)
        
        # Filtrar por cliente si se proporciona
        if cliente:
            pagos_no_vinculados = [p for p in pagos_no_vinculados 
                                 if p.get('cliente', '').lower() == cliente.lower()]
        
        return jsonify({
            'status': 'success',
            'pagos': pagos_no_vinculados
        })
        
    except Exception as e:
        print(f"Error al obtener pagos no vinculados: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': f'Error al obtener pagos no vinculados: {str(e)}'
        }), 500
    
@app.route('/registro/<registro_id>/vincular-anticipo', methods=['POST'])
@login_required
def vincular_anticipo(registro_id):
    try:
        # Obtener datos del formulario
        data = request.json
        pago_id = data.get('pagoId')
        
        if not pago_id:
            return jsonify({
                'status': 'error',
                'message': 'Falta el ID del pago a vincular'
            }), 400
        
        # Cargar registros y pagos no vinculados
        registros_data = get_registros()
        
        data_folder = os.path.dirname(os.path.abspath(REGISTROS_FILE))
        pagos_file = os.path.join(data_folder, 'pagos_no_vinculados.json')
        pagos_no_vinculados = []
        
        if os.path.exists(pagos_file):
            with open(pagos_file, 'r', encoding='utf-8') as f:
                pagos_no_vinculados = json.load(f)
        
        # Encontrar el registro y el pago
        registro = None
        for r in registros_data:
            if r['id'] == registro_id:
                registro = r
                break
        
        if not registro:
            return jsonify({
                'status': 'error',
                'message': 'Registro no encontrado'
            }), 404
        
        # Buscar el pago no vinculado
        pago = None
        pago_index = -1
        for i, p in enumerate(pagos_no_vinculados):
            if p['id'] == pago_id:
                pago = p
                pago_index = i
                break
        
        if not pago:
            return jsonify({
                'status': 'error',
                'message': 'Pago no vinculado no encontrado'
            }), 404
        
        # Verificar que el pago sea del mismo cliente que el registro
        if pago['cliente'] != registro['cliente']:
            return jsonify({
                'status': 'error',
                'message': 'El pago no corresponde al mismo cliente del registro'
            }), 400
        
        # Añadir información a que registro se vinculó
        pago['vinculado_a'] = registro_id
        pago['fecha_vinculacion'] = datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        
        # Si el registro no tiene pagos, crear la lista
        if 'pagos' not in registro:
            registro['pagos'] = []
        
        # Añadir el pago al registro
        registro['pagos'].append(pago)
        
        # Recalcular el saldo pendiente
        total_pagos = sum(float(p['monto']) for p in registro['pagos'])
        registro['saldoPendiente'] = float(registro['totalParticipacion']) - total_pagos
        
        # Eliminar el pago de la lista de no vinculados
        pagos_no_vinculados.pop(pago_index)
        
        # Guardar los cambios
        with open(REGISTROS_FILE, 'w', encoding='utf-8') as f:
            json.dump(registros_data, f, indent=2)
        
        with open(pagos_file, 'w', encoding='utf-8') as f:
            json.dump(pagos_no_vinculados, f, indent=2)
        
        return jsonify({
            'status': 'success',
            'message': 'Anticipo vinculado correctamente',
            'data': {
                'registro': registro
            }
        })
        
    except Exception as e:
        print(f"Error al vincular anticipo: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': f'Error al vincular anticipo: {str(e)}'
        }), 500
    

@app.route('/registro/<registro_id>/reabrir', methods=['POST'])
@login_required
@page_access_required('registros')
def reabrir_registro(registro_id):
    try:
        # 1. Cargar todos los registros
        registros_data = get_registros()
        
        # 2. Buscar el registro específico
        registro = next((r for r in registros_data if r['id'] == registro_id), None)
        
        if not registro:
            return jsonify({'status': 'error', 'message': 'Registro no encontrado'}), 404
        
        # 3. Cambiar el estado del registro
        registro['estado'] = ''  # O el estado que uses para registros pendientes
        
        # 4. Guardar los cambios
        save_registros(registros_data)
        
        return jsonify({'status': 'success', 'message': 'Registro reabierto correctamente'})
    except Exception as e:
        print(f"Error al reabrir registro: {str(e)}")
        return jsonify({'status': 'error', 'message': f"Error al reabrir registro: {str(e)}"}), 500

@app.route('/registro/<registro_id>/pago/<pago_id>/eliminar', methods=['POST'])
@login_required
@page_access_required('registros')
def eliminar_pago(registro_id, pago_id):
    try:
        # 1. Cargar todos los registros
        registros_data = get_registros()
        
        # 2. Buscar el registro específico
        registro = next((r for r in registros_data if r['id'] == registro_id), None)
        
        if not registro:
            return jsonify({'status': 'error', 'message': 'Registro no encontrado'}), 404
        
        # 3. Buscar el pago por ID o índice
        if not pago_id.isdigit():
            # Si es un UUID, buscamos por ID
            pago = next((p for p in registro['pagos'] if p.get('id') == pago_id), None)
            pago_index = next((i for i, p in enumerate(registro['pagos']) if p.get('id') == pago_id), None)
        else:
            # Si es un número, buscamos por índice
            pago_index = int(pago_id)
            pago = registro['pagos'][pago_index] if pago_index < len(registro['pagos']) else None
        
        if pago is None:
            return jsonify({'status': 'error', 'message': 'Pago no encontrado'}), 404
        
        # 4. Crear un anticipo con los datos del pago
        anticipo = {
            'id': str(uuid.uuid4()),
            'fecha': datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'),
            'ng': pago.get('ng', 0),
            'trenes': pago.get('trenes', 0),
            'monto': pago.get('monto', 0),
            'medioPago': pago.get('medioPago', ''),
            'cliente': registro.get('cliente', ''),
            'numeroComprobante': pago.get('numeroComprobante', ''),
            'bancoSociedad': pago.get('bancoSociedad', ''),
            'observaciones': f"Anticipo generado por pago eliminado de factura {registro_id}",
            'archivos': pago.get('archivos', []),
            'usuario': session['username']
        }
        
        # 5. Guardar el anticipo en archivo de pagos no vinculados
        pagos_no_vinculados = []
        pagos_file = os.path.join(os.path.dirname(REGISTROS_FILE), 'pagos_no_vinculados.json')
        
        if os.path.exists(pagos_file):
            with open(pagos_file, 'r', encoding='utf-8') as f:
                pagos_no_vinculados = json.load(f)
        
        pagos_no_vinculados.append(anticipo)
        
        with open(pagos_file, 'w', encoding='utf-8') as f:
            json.dump(pagos_no_vinculados, f, indent=2, ensure_ascii=False)
        
        # 6. Recalcular saldo pendiente del registro
        monto_pago = float(pago.get('monto') or 0)
        registro['saldoPendiente'] = float(registro.get('saldoPendiente') or 0) + monto_pago
        
        # 7. Eliminar el pago del registro
        registro['pagos'].pop(pago_index)
        
        # 8. Si el registro estaba cerrado y ahora tiene saldo pendiente, reabrir
        if registro.get('estado') == 'CERRADO' and registro['saldoPendiente'] > 0:
            registro['estado'] = ''  # O el estado que uses para registros pendientes
        
        # 9. Guardar los cambios
        save_registros(registros_data)
        
        return jsonify({
            'status': 'success', 
            'message': 'Pago eliminado correctamente',
            'anticipoId': anticipo['id']
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': f"Error al eliminar pago: {str(e)}"}), 500
    

# Mantén la ruta nueva que acabamos de agregar, pero cambia el nombre de la función
@app.route('/registros_cerrados')
@login_required
@page_access_required('registros')
def ver_registros_cerrados():
    try:
        registros_data = get_registros()
        
        # Filtrar SOLO los registros explícitamente marcados como CERRADOS
        # o aquellos con saldo exactamente cero
        registros_cerrados = [
            r for r in registros_data 
            if r.get('estado') == 'CERRADO' or float(r.get('saldoPendiente', 0)) == 0
        ]
        
        # Ordenar por fecha más reciente primero
        registros_cerrados.sort(
            key=lambda x: datetime.strptime(x['datetime'], '%Y-%m-%d %H:%M:%S'),
            reverse=True
        )
        
        return render_template(
            'registros_cerrados.html', 
            registros=registros_cerrados,
            current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return render_template('registros_cerrados.html', registros=[])

@app.route('/registro/<registro_id>/balancear', methods=['POST'])
@login_required
def balancear_factura(registro_id):
    try:
        # Cargar todos los registros
        registros = get_registros()
        
        # Buscar el registro específico
        registro = next((r for r in registros if r['id'] == registro_id), None)
        
        if not registro:
            return jsonify({'status': 'error', 'message': 'Registro no encontrado'}), 404
        
        # Calcular el excedente
        total_participacion = float(registro.get('totalParticipacion', 0))
        total_pagos = sum(float(p.get('monto', 0)) for p in registro.get('pagos', []))
        
        # Verificar si hay excedente
        if total_pagos <= total_participacion:
            return jsonify({'status': 'error', 'message': 'Esta factura no tiene excedente de pago'}), 400
        
        excedente = total_pagos - total_participacion
        
        # Calcular proporciones de NG y TRENES en base al total de pagos
        ng_total = sum(float(p.get('ng', 0)) for p in registro.get('pagos', []))
        trenes_total = sum(float(p.get('trenes', 0)) for p in registro.get('pagos', []))
        
        # Si hay pagos, calcular las proporciones
        if total_pagos > 0:
            ratio_ng = ng_total / total_pagos
            ratio_trenes = trenes_total / total_pagos
        else:
            # Si por alguna razón no hay pagos (no debería ocurrir), usar proporciones del registro
            total_reg = float(registro.get('ng', 0)) + float(registro.get('trenes', 0))
            if total_reg > 0:
                ratio_ng = float(registro.get('ng', 0)) / total_reg
                ratio_trenes = float(registro.get('trenes', 0)) / total_reg
            else:
                # Si todo falla, dividir por igual
                ratio_ng = 0.5
                ratio_trenes = 0.5
        
        # Calcular montos para el anticipo
        ng_excedente = excedente * ratio_ng
        trenes_excedente = excedente * ratio_trenes
        
        # Crear el anticipo
        anticipo = {
            'id': str(uuid.uuid4()),
            'fecha': datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'),
            'ng': ng_excedente,
            'trenes': trenes_excedente,
            'monto': excedente,
            'medioPago': 'EXCEDENTE',  # Marca especial para identificar que es un excedente
            'cliente': registro.get('cliente', ''),
            'numeroComprobante': f"EXC-{registro_id}",  # Referencia a la factura original
            'bancoSociedad': '',
            'observaciones': f"Anticipo generado por excedente de factura {registro_id}",
            'archivos': [],  # No hay archivos nuevos para este anticipo
            'usuario': session['username']
        }
        
        # Guardar el anticipo en pagos no vinculados
        pagos_no_vinculados = []
        pagos_file = os.path.join(os.path.dirname(REGISTROS_FILE), 'pagos_no_vinculados.json')
        
        if os.path.exists(pagos_file):
            with open(pagos_file, 'r', encoding='utf-8') as f:
                pagos_no_vinculados = json.load(f)
        
        pagos_no_vinculados.append(anticipo)
        
        with open(pagos_file, 'w', encoding='utf-8') as f:
            json.dump(pagos_no_vinculados, f, indent=2, ensure_ascii=False)
        
        # Actualizar el registro con el saldo correcto
        registro['saldoPendiente'] = 0
        registro['estado'] = 'CERRADO'  # Marcar como cerrado ya que está pagado completamente
        
        # Guardar los cambios en los registros
        save_registros(registros)
        
        return jsonify({
            'status': 'success',
            'message': f'Factura balanceada correctamente. Se ha creado un anticipo de {excedente:,.2f}',
            'anticipoId': anticipo['id']
        })
        
    except Exception as e:
        print(f"Error en balancear_factura: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': f"Error al balancear factura: {str(e)}"}), 500

@app.route('/download/<filename>')
@login_required
def download_file(filename):
    """Descargar un archivo como adjunto"""
    try:
        # Verificar que el archivo existe
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if not os.path.exists(file_path):
            print(f"Archivo no encontrado: {file_path}")
            return "Archivo no encontrado", 404
            
        # Enviar el archivo como descarga
        return send_from_directory(
            directory=app.config['UPLOAD_FOLDER'], 
            path=filename,
            as_attachment=True
        )
    except Exception as e:
        print(f"Error al descargar archivo {filename}: {str(e)}")
        return f"Error al procesar la descarga: {str(e)}", 500

@app.route('/view/<filename>')
@login_required
def view_file(filename):
    """Ver un archivo en el navegador"""
    try:
        # Verificar que el archivo existe
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if not os.path.exists(file_path):
            print(f"Archivo no encontrado: {file_path}")
            return "Archivo no encontrado", 404
            
        # Enviar el archivo para visualización
        return send_from_directory(
            directory=app.config['UPLOAD_FOLDER'], 
            path=filename
        )
    except Exception as e:
        print(f"Error al mostrar archivo {filename}: {str(e)}")
        return f"Error al visualizar el archivo: {str(e)}", 500
    
@app.route('/view/<filename>')
@login_required
def view_file_attachment(filename):  # Nombre cambiado de view_file a view_file_attachment
    """Ver un archivo en el navegador"""
    try:
        # Verificar que el archivo existe
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if not os.path.exists(file_path):
            print(f"Archivo no encontrado: {file_path}")
            return "Archivo no encontrado", 404
            
        # Enviar el archivo para visualización
        return send_from_directory(
            directory=app.config['UPLOAD_FOLDER'], 
            path=filename
        )
    except Exception as e:
        print(f"Error al mostrar archivo {filename}: {str(e)}")
        return f"Error al visualizar el archivo: {str(e)}", 500

# ========================================================================
# ===== RUTAS PARA SISTEMA DE GESTIÓN DE VENTAS =====
# ========================================================================

@app.route('/api/ventas/registrar', methods=['POST'])
@login_required
def registrar_venta():
    """Registra una nueva venta en el sistema con la estructura actualizada."""
    try:
        # Obtener datos de la solicitud
        data = request.json
        
        if not data:
            return jsonify({'status': 'error', 'message': 'No se recibieron datos'}), 400
            
        # Extraer los campos principales
        ventaZ = float(data.get('ventaZ', 0))
        ventaVinson = float(data.get('ventaVinson', 0))
        ventaPixel = float(data.get('ventaPixel', 0))
        
        # Calcular discovery como la diferencia entre ventaVinson y ventaZ
        discovery = max(0, ventaVinson - ventaZ)
        
        # Crear registro con la nueva estructura
        nuevo_registro = {
            'id': str(uuid.uuid4()),
            'fecha': datetime.now(TIMEZONE).strftime('%Y-%m-%d'),
            'hora': datetime.now(TIMEZONE).strftime('%H:%M:%S'),
            'usuario': session.get('username'),
            'local': session.get('local', 'No asignado'),
            'sociedad': session.get('sociedad', 'No asignada'),
            'ventaZ': ventaZ,
            'ventaVinson': ventaVinson,  # Nuevo campo que reemplaza la suma
            'discovery': discovery,      # Ahora es calculado como ventaVinson - ventaZ
            'ventaPixel': ventaPixel,
            'fecha_creacion': datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        }
        
        # Guardar en archivo
        ventas_data = load_json_file(os.path.join(DATA_DIR, 'ventas.json'), [])
        ventas_data.append(nuevo_registro)
        save_json_file(os.path.join(DATA_DIR, 'ventas.json'), ventas_data)
        
        # Actualizar resúmenes
        actualizar_resumen_ventas()
        
        return jsonify({
            'status': 'success',
            'message': 'Venta registrada correctamente',
            'data': {
                'id': nuevo_registro['id'],
                'ventaZ': ventaZ,
                'ventaVinson': ventaVinson,
                'discovery': discovery,
                'ventaPixel': ventaPixel
            }
        })
        
    except Exception as e:
        print(f"Error en registrar_venta: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/mercadopago/registrar', methods=['POST'])
@login_required
def registrar_mercadopago():
    """Registra una transacción de MercadoPago."""
    try:
        # Obtener datos de la solicitud
        data = request.json
        
        if not data:
            return jsonify({'status': 'error', 'message': 'No se recibieron datos'}), 400
            
        # Crear registro
        nuevo_registro = {
            'id': str(uuid.uuid4()),
            'fecha': datetime.now(TIMEZONE).strftime('%Y-%m-%d'),
            'hora': datetime.now(TIMEZONE).strftime('%H:%M:%S'),
            'usuario': session.get('username'),
            'local': session.get('local', 'No asignado'),
            'sociedad': session.get('society', 'No asignada'),
            'importe': float(data.get('importe', 0)),
            'comision': float(data.get('comision', 0)),
            'neto': float(data.get('neto', 0)),
            'fecha_creacion': datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        }
        
        # Guardar en archivo
        mp_data = load_json_file(os.path.join(DATA_DIR, 'mercadopago.json'), [])
        mp_data.append(nuevo_registro)
        save_json_file(os.path.join(DATA_DIR, 'mercadopago.json'), mp_data)
        
        # Actualizar resúmenes
        actualizar_resumen_medios_pago()
        
        return jsonify({
            'status': 'success',
            'message': 'Transacción de MercadoPago registrada correctamente',
            'data': {
                'id': nuevo_registro['id']
            }
        })
        
    except Exception as e:
        print(f"Error en registrar_mercadopago: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/resumenes/obtener')
@login_required
def obtener_resumenes():
    """Obtiene los datos de resumen para el panel principal."""
    try:
        # Obtener fecha actual o fecha proporcionada
        fecha = request.args.get('fecha', datetime.now(TIMEZONE).strftime('%Y-%m-%d'))
        
        # Obtener usuario y local
        usuario = session.get('username')
        local = session.get('local', 'No asignado')
        
        # Obtener resúmenes de diferentes archivos
        ventas_resumen = obtener_resumen_ventas(fecha, local)
        tarjetas_resumen = obtener_resumen_tarjetas(fecha, local)
        medios_pago_resumen = obtener_resumen_medios_pago(fecha, local)
        
        return jsonify({
            'status': 'success',
            'data': {
                'ventas': ventas_resumen,
                'tarjetas': tarjetas_resumen,
                'mediosPago': medios_pago_resumen,
                'fecha': fecha
            }
        })
        
    except Exception as e:
        print(f"Error en obtener_resumenes: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

# Funciones auxiliares para manejar resúmenes
def calcular_total_cobrado(fecha):
    """
    Calcula el total cobrado para una fecha específica sumando todos los medios de pago.
    """
    try:
        total = 0
        
        # Sumar MercadoPago
        mp_data = load_json_file(os.path.join(DATA_DIR, 'mercadopago.json'), [])
        mp_filtrado = [mp for mp in mp_data if mp.get('fecha') == fecha]
        total += sum(mp.get('importe', 0) for mp in mp_filtrado)
        
        # Aquí podrías agregar la suma de otros medios de pago
        # Por ejemplo: efectivo, tarjetas, etc.
        
        # Por ahora retornamos lo que tenemos
        return total
        
    except Exception as e:
        print(f"Error en calcular_total_cobrado: {str(e)}")
        return 0

def actualizar_resumen_ventas():
    """Actualiza el archivo de resumen de ventas con la nueva estructura de datos."""
    try:
        # Obtener la fecha actual
        fecha_actual = datetime.now(TIMEZONE).strftime('%Y-%m-%d')
        
        # Cargar datos de ventas
        ventas_data = load_json_file(os.path.join(DATA_DIR, 'ventas.json'), [])
        
        # Filtrar ventas de hoy
        ventas_hoy = [v for v in ventas_data if v.get('fecha') == fecha_actual]
        
        if not ventas_hoy:
            print("No hay ventas registradas para hoy")
            return
        
        # Obtener la última venta
        ultima_venta = ventas_hoy[-1]
        
        # Calcular total cobrado (suma de todos los medios de pago)
        total_cobrado = calcular_total_cobrado(fecha_actual)
        
        # Calcular diferencia
        diferencia = ultima_venta.get('ventaVinson', 0) - total_cobrado
        
        # Crear o actualizar resumen
        resumen_data = load_json_file(os.path.join(DATA_DIR, 'resumenes.json'), {})
        
        if 'ventas' not in resumen_data:
            resumen_data['ventas'] = {}
        
        # Actualizar con los nuevos campos
        resumen_data['ventas'][fecha_actual] = {
            'ventaZ': ultima_venta.get('ventaZ', 0),
            'ventaVinson': ultima_venta.get('ventaVinson', 0),
            'discovery': ultima_venta.get('discovery', 0),
            'ventaPixel': ultima_venta.get('ventaPixel', 0),
            'totalCobrado': total_cobrado,
            'diferencia': diferencia,
            'ultima_actualizacion': datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        }
        
        # Guardar resumen actualizado
        save_json_file(os.path.join(DATA_DIR, 'resumenes.json'), resumen_data)
        print(f"Resumen de ventas actualizado para {fecha_actual}")
        
    except Exception as e:
        print(f"Error actualizando resumen de ventas: {str(e)}")

def actualizar_resumen_medios_pago():
    """Actualiza el archivo de resumen de medios de pago."""
    try:
        # Obtener la fecha actual
        fecha_actual = datetime.now(TIMEZONE).strftime('%Y-%m-%d')

        # Cargar datos de medios de pago
        medios_pago_data = load_json_file(os.path.join(DATA_DIR, 'medios_pago.json'), [])

        # Filtrar medios de pago de hoy
        medios_pago_hoy = [m for m in medios_pago_data if m.get('fecha') == fecha_actual]

        if not medios_pago_hoy:
            print("No hay medios de pago registrados para hoy")
            return

        # Obtener el último medio de pago
        ultimo_medio_pago = medios_pago_hoy[-1]

        # Crear o actualizar resumen
        resumen_data = load_json_file(os.path.join(DATA_DIR, 'resumenes.json'), {})

        if 'medios_pago' not in resumen_data:
            resumen_data['medios_pago'] = {}

        # Actualizar con los nuevos campos
        resumen_data['medios_pago'][fecha_actual] = {
            'efectivo': ultimo_medio_pago.get('efectivo', 0),
            'tarjeta': ultimo_medio_pago.get('tarjeta', 0),
            'pedidosYa': ultimo_medio_pago.get('pedidosYa', 0),
            'rappi': ultimo_medio_pago.get('rappi', 0),
            'pagos': ultimo_medio_pago.get('pagos', 0),
            'ultima_actualizacion': datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        }

        # Guardar resumen actualizado
        save_json_file(os.path.join(DATA_DIR, 'resumenes.json'), resumen_data)
        print(f"Resumen de medios de pago actualizado para {fecha_actual}")

    except Exception as e:
        print(f"Error actualizando resumen de medios de pago: {str(e)}")

def obtener_resumen_ventas(fecha, local):
    """Obtiene el resumen de ventas para una fecha y local específico con la nueva estructura."""
    try:
        # Cargar datos de resumen
        resumen_data = load_json_file(os.path.join(DATA_DIR, 'resumenes.json'), {})
        
        # Si no hay datos de resumen o no hay datos para la fecha solicitada
        if 'ventas' not in resumen_data or fecha not in resumen_data['ventas']:
            return {
                'ventaZ': 0,
                'ventaVinson': 0,
                'discovery': 0,
                'ventaPixel': 0,
                'totalCobrado': 0,
                'diferencia': 0
            }
        
        # Devolver los datos con la nueva estructura
        return resumen_data['ventas'][fecha]
        
    except Exception as e:
        print(f"Error en obtener_resumen_ventas: {str(e)}")
        return {
            'ventaZ': 0,
            'ventaVinson': 0,
            'discovery': 0,
            'ventaPixel': 0,
            'totalCobrado': 0,
            'diferencia': 0,
            'error': str(e)
        }

def obtener_resumen_tarjetas(fecha, local):
    """Obtiene el resumen de tarjetas para una fecha y local específico."""
    # Implementación simulada
    return {
        'visa': 0,
        'visaDebito': 0,
        'mastercard': 0,
        'mastercardDebito': 0,
        'cabal': 0,
        'cabalDebito': 0,
        'amex': 0,
        'maestro': 0,
        'pagosInmediatos': 0,
        'otros': 0,
        'total': 0
    }

def obtener_resumen_medios_pago(fecha, local):
    """Obtiene el resumen de medios de pago para una fecha y local específico."""
    try:
        # Inicializar valores por defecto
        resumen = {
            'efectivo': 0,
            'tarjeta': 0,
            'pedidosYa': 0,
            'rappi': 0,
            'pagos': 0,
            'mercadoPago': 0,
            'clubAhumado': 0
        }
        
        # Cargar y sumar MercadoPago
        mp_data = load_json_file(os.path.join(DATA_DIR, 'mercadopago.json'), [])
        mp_filtrado = [mp for mp in mp_data if mp.get('fecha') == fecha and mp.get('local') == local]
        
        if mp_filtrado:
            resumen['mercadoPago'] = sum(mp.get('importe', 0) for mp in mp_filtrado)
        
        # Las demás fuentes de datos se implementarían de manera similar
        
        return resumen
        
    except Exception as e:
        print(f"Error en obtener_resumen_medios_pago: {str(e)}")
        return {
            'efectivo': 0,
            'tarjeta': 0,
            'pedidosYa': 0,
            'rappi': 0,
            'pagos': 0,
            'mercadoPago': 0,
            'clubAhumado': 0,
            'error': str(e)
        }

def obtener_total_cobrado(fecha, local):
    """Calcula el total cobrado sumando todos los medios de pago."""
    # En una implementación real, sumarías todos los medios de pago
    # Aquí por simplicidad devolvemos un valor simulado
    try:
        total = 0
        
        # Sumar MercadoPago
        mp_data = load_json_file(os.path.join(DATA_DIR, 'mercadopago.json'), [])
        mp_filtrado = [mp for mp in mp_data if mp.get('fecha') == fecha and mp.get('local') == local]
        total += sum(mp.get('importe', 0) for mp in mp_filtrado)
        
        # Aquí se añadirían las demás fuentes de ingresos
        
        return total
        
    except Exception as e:
        print(f"Error en obtener_total_cobrado: {str(e)}")
        return 0

# ========================================================================
# ===== RUTAS DE TRANSFERENCIAS =====
# ========================================================================
@app.route('/transferencias')
@login_required
@page_access_required('transferencias')
def transferencias():
    return render_template('transferencias.html')

@app.route('/submit_transferencia', methods=['POST'])
@login_required
@page_access_required('transferencias')
def submit_transferencia():
    try:
        data = request.form
        print(f"Usuario en sesión: {session.get('username', 'No definido')}")
        print(f"Datos recibidos: {dict(data)}")

        # Crear el nuevo registro
        nuevo_registro = {
            'id': datetime.now(TIMEZONE).strftime('%Y%m%d%H%M%S'),
            'fecha_creacion': datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'),
            'usuario': session['username'],
            'fecha': data.get('fecha'),
            'etiqueta': data.get('etiqueta'),
            'zona': data.get('zona'),
            'comision': data.get('comision'),
            'turno': data.get('turno'),
            'fc': data.get('fc'),
            'pl': data.get('pl'),
            'transferencia': data.get('transferencia'),
            'boletaRosa': data.get('boletaRosa'),
            'observaciones': data.get('observaciones'),
            'estado': data.get('estado')
        }

        # Validar campos requeridos
        required_fields = ['fecha', 'etiqueta', 'zona', 'comision', 'turno', 'fc', 'estado']
        for field in required_fields:
            if not nuevo_registro.get(field) or str(nuevo_registro.get(field)).strip() == '':
                return jsonify({
                    'status': 'error',
                    'message': f'Campo requerido faltante o vacío: {field}'
                }), 400

        # Validar que FC sea un número positivo
        try:
            fc_value = int(nuevo_registro['fc'])
            if fc_value <= 0:
                return jsonify({
                    'status': 'error',
                    'message': 'El campo FC debe ser un número entero positivo'
                }), 400
        except (ValueError, TypeError):
            return jsonify({
                'status': 'error',
                'message': 'El campo FC debe ser un número válido'
            }), 400

        # Verificar duplicados en pendientes.json
        pendientes = load_json_file(PENDIENTES_FILE)
        
        # Verificar duplicados en el archivo de zona correspondiente
        zona_file = ZONAS_JSON.get(nuevo_registro['zona'])
        
        # Verificar que el archivo de zona exista
        if not zona_file:
            return jsonify({
                'status': 'error',
                'message': f'Zona no válida: {nuevo_registro["zona"]}'
            }), 400
            
        zona_registros = load_json_file(zona_file)
        
        # Combinar todos los registros para la verificación
        todos_registros = pendientes + zona_registros

        # Función para verificar si es duplicado
        def es_duplicado(registro):
            return (
                str(registro.get('etiqueta', '')).strip() == str(nuevo_registro['etiqueta']).strip() and
                str(registro.get('fecha', '')).strip() == str(nuevo_registro['fecha']).strip() and
                str(registro.get('turno', '')).strip() == str(nuevo_registro['turno']).strip() and
                str(registro.get('zona', '')).strip() == str(nuevo_registro['zona']).strip()
            )

        # Buscar duplicados
        duplicado = next((reg for reg in todos_registros if es_duplicado(reg)), None)
        
        if duplicado:
            estado_duplicado = duplicado.get('estado', 'DESCONOCIDO')
            mensaje = (
                f"Ya existe un registro con la misma etiqueta, fecha, turno y zona. "
                f"Estado actual: {estado_duplicado}"
            )
            print(f"DUPLICADO DETECTADO: {mensaje}")
            print(f"Registro duplicado encontrado: {duplicado}")
            
            return jsonify({
                'status': 'error',
                'message': mensaje,
                'duplicateData': {
                    'estado': estado_duplicado,
                    'fecha_creacion': duplicado.get('fecha_creacion', 'No disponible'),
                    'usuario': duplicado.get('usuario', 'No disponible'),
                    'id': duplicado.get('id', 'No disponible')
                }
            }), 409  # 409 Conflict

        # Si no hay duplicados, proceder con el guardado
        if nuevo_registro['estado'] == 'PENDIENTE':
            # Volver a cargar pendientes para evitar condiciones de carrera
            pendientes = load_json_file(PENDIENTES_FILE)
            
            # Verificar duplicados de nuevo justo antes de guardar
            if any(es_duplicado(reg) for reg in pendientes):
                print("DUPLICADO DETECTADO justo antes de guardar en pendientes")
                return jsonify({
                    'status': 'error',
                    'message': "Se detectó un duplicado justo antes de guardar (pendientes)",
                    'duplicateData': {
                        'estado': 'PENDIENTE',
                        'fecha_creacion': 'Recién detectado',
                        'usuario': 'Sistema'
                    }
                }), 409
                
            pendientes.append(nuevo_registro)
            if not save_json_file(PENDIENTES_FILE, pendientes):
                raise Exception('Error al guardar en archivo de pendientes')
                
            print(f"REGISTRO GUARDADO EN PENDIENTES: ID: {nuevo_registro['id']}")
        else:
            # Volver a cargar zona_registros para evitar condiciones de carrera
            zona_registros = load_json_file(zona_file)
            
            # Verificar duplicados de nuevo justo antes de guardar
            if any(es_duplicado(reg) for reg in zona_registros):
                print("DUPLICADO DETECTADO justo antes de guardar en zona")
                return jsonify({
                    'status': 'error',
                    'message': "Se detectó un duplicado justo antes de guardar (zona)",
                    'duplicateData': {
                        'estado': nuevo_registro['estado'],
                        'fecha_creacion': 'Recién detectado',
                        'usuario': 'Sistema'
                    }
                }), 409
                
            zona_registros.append(nuevo_registro)
            if not save_json_file(zona_file, zona_registros):
                raise Exception(f'Error al guardar en archivo de zona: {zona_file}')
                
            print(f"REGISTRO GUARDADO EN ZONA {nuevo_registro['zona']}: ID: {nuevo_registro['id']}")

        return jsonify({
            'status': 'success',
            'message': 'Registro guardado correctamente',
            'data': {
                'id': nuevo_registro['id'],
                'zona': nuevo_registro['zona'],
                'estado': nuevo_registro['estado'],
                'fecha_creacion': nuevo_registro['fecha_creacion']
            }
        })

    except Exception as e:
        error_msg = f"ERROR en submit_transferencia: {str(e)}"
        print(error_msg)
        print(f"Tipo de error: {type(e).__name__}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        
        return jsonify({
            'status': 'error',
            'message': f'Error interno del servidor: {str(e)}'
        }), 500
    
# ========================================================================
# ===== API DE CONSULTAS DE TRANSFERENCIAS =====
# ========================================================================
@app.route('/api/validar_turno_previo', methods=['POST'])
@login_required
def validar_turno_previo():
    """
    Verifica la secuencia correcta de turnos:
    - Para etiqueta BA04 en CONSTITUCION: DIA → TGT → NOCHE
    - Para las demás etiquetas: DIA → NOCHE
    """
    data = request.json
    zona = data.get('zona')
    etiqueta = data.get('etiqueta')
    fecha = data.get('fecha')
    turno = data.get('turno')
    
    if not zona or not etiqueta or not fecha or not turno:
        return jsonify({'valid': False, 'message': 'Faltan datos necesarios'}), 400
        
    # Si no es un turno que necesite validación, retornar válido directamente
    if turno == 'DIA' or turno == 'UNI':
        return jsonify({'valid': True, 'message': 'No requiere validación'}), 200
        
    # Crear un mapeo directo sin usar las constantes
    zona_file_map = {
        'CONSTITUCION': os.path.join(DATA_DIR, 'constitucion.json'),
        'ZONA SUR': os.path.join(DATA_DIR, 'zona_sur.json'),
        'GASTRONOMIA': os.path.join(DATA_DIR, 'gastronomia.json'),
        'KIOSCOS': os.path.join(DATA_DIR, 'kioscos.json'),
        'BIMBO': os.path.join(DATA_DIR, 'bimbo.json'),
        'RETIRO': os.path.join(DATA_DIR, 'retiro.json'),
        'TBA': os.path.join(DATA_DIR, 'tba.json'),
        'AMBULANTE': os.path.join(DATA_DIR, 'ambulante.json'),
        'ONCE': os.path.join(DATA_DIR, 'once.json')
    }
    
    zona_file = zona_file_map.get(zona)
    pendientes_file = os.path.join(DATA_DIR, 'pendientes.json')
    
    if not zona_file or not os.path.exists(zona_file):
        return jsonify({'valid': True, 'message': 'Archivo de zona no encontrado'}), 200
    
    try:
        # Cargar datos de la zona
        with open(zona_file, 'r', encoding='utf-8') as f:
            zona_data = json.load(f)
        
        # Cargar datos de pendientes
        with open(pendientes_file, 'r', encoding='utf-8') as f:
            pendientes_data = json.load(f)
            # Filtrar sólo los pendientes de esta zona
            pendientes_data = [item for item in pendientes_data if item.get('zona') == zona]
        
        # Combinar ambos conjuntos de datos para la validación
        todos_datos = zona_data + pendientes_data
        
        # Caso especial para BA04 en Constitución
        if zona == 'CONSTITUCION' and etiqueta == 'BA04':
            # Para turno TGT, verificar que exista DIA
            if turno == 'TGT':
                turno_dia_exists = any(
                    item['fecha'] == fecha and 
                    item['etiqueta'] == etiqueta and 
                    item['turno'] == 'DIA'
                    for item in todos_datos
                )
                
                if not turno_dia_exists:
                    return jsonify({
                        'valid': False, 
                        'message': 'Para BA04 debe enviar el turno DIA antes del turno TGT'
                    })
                    
                return jsonify({
                    'valid': True, 
                    'message': 'Turno DIA encontrado para esta fecha y etiqueta'
                })
                
            # Para turno NOCHE, verificar que existan TANTO DIA como TGT
            elif turno == 'NOCHE':
                turno_dia_exists = any(
                    item['fecha'] == fecha and 
                    item['etiqueta'] == etiqueta and 
                    item['turno'] == 'DIA'
                    for item in todos_datos
                )
                
                turno_tgt_exists = any(
                    item['fecha'] == fecha and 
                    item['etiqueta'] == etiqueta and 
                    item['turno'] == 'TGT'
                    for item in todos_datos
                )
                
                if not turno_dia_exists:
                    return jsonify({
                        'valid': False, 
                        'message': 'Para BA04 debe enviar el turno DIA antes del turno NOCHE'
                    })
                    
                if not turno_tgt_exists:
                    return jsonify({
                        'valid': False, 
                        'message': 'Para BA04 debe enviar el turno TGT antes del turno NOCHE'
                    })
                    
                return jsonify({
                    'valid': True, 
                    'message': 'Turnos DIA y TGT encontrados para esta fecha y etiqueta'
                })
        
        # Caso estándar para todas las demás etiquetas (turno NOCHE requiere DIA)
        else:
            if turno == 'NOCHE':
                turno_dia_exists = any(
                    item['fecha'] == fecha and 
                    item['etiqueta'] == etiqueta and 
                    item['turno'] == 'DIA'
                    for item in todos_datos
                )
                
                if not turno_dia_exists:
                    return jsonify({
                        'valid': False, 
                        'message': 'Debe enviar el turno DIA antes del turno NOCHE'
                    })
                    
                return jsonify({
                    'valid': True, 
                    'message': 'Turno DIA encontrado para esta fecha y etiqueta'
                })
        
        # Si llegamos aquí, es porque no se necesita validación especial
        return jsonify({'valid': True, 'message': 'No requiere validación especial'})
            
    except Exception as e:
        app.logger.error(f"Error validando turno previo: {e}")
        # En caso de error, permitimos continuar para no bloquear la operación
        return jsonify({'valid': True, 'message': f'Error al validar: {str(e)}'}), 200


@app.route('/api/validar_fecha_previa', methods=['POST'])
@login_required
def validar_fecha_previa():
    """
    Verifica si existe un registro para la fecha anterior a la actual
    para una etiqueta específica. Ahora también considera registros PENDIENTES.
    """
    data = request.json
    zona = data.get('zona')
    etiqueta = data.get('etiqueta')
    fecha = data.get('fecha')
    
    if not zona or not etiqueta or not fecha:
        return jsonify({'valid': False, 'message': 'Faltan datos necesarios'}), 400
    
    # Crear un mapeo directo sin usar las constantes
    zona_file_map = {
        'CONSTITUCION': os.path.join(DATA_DIR, 'constitucion.json'),
        'ZONA SUR': os.path.join(DATA_DIR, 'zona_sur.json'),
        'GASTRONOMIA': os.path.join(DATA_DIR, 'gastronomia.json'),
        'KIOSCOS': os.path.join(DATA_DIR, 'kioscos.json'),
        'BIMBO': os.path.join(DATA_DIR, 'bimbo.json'),
        'RETIRO': os.path.join(DATA_DIR, 'retiro.json'),
        'TBA': os.path.join(DATA_DIR, 'tba.json'),
        'AMBULANTE': os.path.join(DATA_DIR, 'ambulante.json'),
        'ONCE': os.path.join(DATA_DIR, 'once.json')
    }
    
    zona_file = zona_file_map.get(zona)
    pendientes_file = os.path.join(DATA_DIR, 'pendientes.json')
    
    if not zona_file or not os.path.exists(zona_file):
        return jsonify({'valid': True, 'message': 'Archivo de zona no encontrado'}), 200
    
    try:
        # Calcular la fecha anterior
        fecha_obj = datetime.strptime(fecha, '%Y-%m-%d')
        fecha_anterior_obj = fecha_obj - timedelta(days=1)
        fecha_anterior = fecha_anterior_obj.strftime('%Y-%m-%d')
        
        # Si es el primer día del mes, permitir la carga
        if fecha_obj.day == 1:
            return jsonify({'valid': True, 'message': 'Es primer día del mes, se permite la carga'})
        
        # Cargar datos de la zona
        with open(zona_file, 'r', encoding='utf-8') as f:
            zona_data = json.load(f)
        
        # Cargar datos de pendientes
        with open(pendientes_file, 'r', encoding='utf-8') as f:
            pendientes_data = json.load(f)
            # Filtrar sólo los pendientes de esta zona
            pendientes_data = [item for item in pendientes_data if item.get('zona') == zona]
        
        # Buscar registros de la fecha anterior en ambos archivos
        fecha_anterior_en_zona = any(
            item['fecha'] == fecha_anterior and 
            item['etiqueta'] == etiqueta
            for item in zona_data
        )
        
        fecha_anterior_en_pendientes = any(
            item['fecha'] == fecha_anterior and 
            item['etiqueta'] == etiqueta
            for item in pendientes_data
        )
        
        if fecha_anterior_en_zona or fecha_anterior_en_pendientes:
            return jsonify({
                'valid': True, 
                'message': 'Fecha anterior encontrada para esta etiqueta (OK o PENDIENTE)'
            })
        else:
            return jsonify({
                'valid': False, 
                'message': f'Debe enviar primero la fecha {fecha_anterior} para esta etiqueta'
            })
            
    except Exception as e:
        app.logger.error(f"Error validando fecha previa: {e}")
        # En caso de error, permitimos continuar para no bloquear la operación
        return jsonify({'valid': True, 'message': f'Error al validar: {str(e)}'}), 200


# ========================================================================
# ===== RUTAS DE REPORTES =====
# ========================================================================
@app.route('/reportes')
@page_access_required('reportes')
@login_required
def reportes():
    try:
        # Cargar registros normales
        registros_data = get_registros()
        
        # Usar la misma carpeta donde se encuentra registros.json
        # Suponiendo que REGISTROS_FILE es una variable global que contiene la ruta al archivo de registros
        data_folder = os.path.dirname(os.path.abspath(REGISTROS_FILE))
        pagos_file = os.path.join(data_folder, 'pagos_no_vinculados.json')
        
        print(f"Ruta del archivo de pagos: {pagos_file}")
        print(f"¿El archivo existe? {os.path.exists(pagos_file)}")
        
        # Cargar pagos no vinculados
        pagos_no_vinculados = []
        if os.path.exists(pagos_file):
            try:
                with open(pagos_file, 'r', encoding='utf-8') as f:
                    pagos_no_vinculados = json.load(f)
                print(f"Pagos no vinculados cargados: {len(pagos_no_vinculados)}")
            except json.JSONDecodeError as e:
                print(f"Error decodificando pagos_no_vinculados.json: {str(e)}")
            except Exception as e:
                print(f"Error al leer pagos_no_vinculados.json: {str(e)}")
        else:
            # Crear archivo vacío si no existe
            try:
                os.makedirs(os.path.dirname(pagos_file), exist_ok=True)  # Asegurar que el directorio existe
                with open(pagos_file, 'w', encoding='utf-8') as f:
                    json.dump([], f)
                print(f"Archivo de pagos no vinculados creado")
            except Exception as e:
                print(f"Error al crear archivo de pagos: {str(e)}")
        
        # Calcular estadísticas
        stats = {
            'pendientes': len([r for r in registros_data if r.get('estado') != 'CERRADO']),
            'cerrados': len([r for r in registros_data if r.get('estado') == 'CERRADO']),
            'saldo_total': sum(float(r.get('saldoPendiente', 0)) for r in registros_data)
        }

        print(f"Registros enviados a plantilla: {len(registros_data)}")
        print(f"Pagos no vinculados enviados a plantilla: {len(pagos_no_vinculados)}")
        
        return render_template('reportes.html', 
                             registros=registros_data,
                             pagos_no_vinculados=pagos_no_vinculados,
                             stats=stats,
                             current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))
    except Exception as e:
        print(f"Error en /reportes: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # Asegurar valores por defecto para evitar errores
        return render_template('reportes.html', 
                             registros=[],
                             pagos_no_vinculados=[],
                             stats={'pendientes': 0, 'cerrados': 0, 'saldo_total': 0},
                             current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))

@app.route('/casos-pendientes')
@login_required
@page_access_required('reportes2')
def casos_pendientes():
    return render_template('reportes2.html')

@app.route('/api/pendientes/resumen')
@login_required
@page_access_required('reportes2')
def get_pendientes_resumen():
    try:
        pendientes = load_json_file(PENDIENTES_FILE)
        
        # Calcular total de casos pendientes
        total = len(pendientes)
        
        # Calcular distribución por zonas
        distribucion_zonas = {}
        for caso in pendientes:
            zona = caso.get('zona')
            if zona:
                distribucion_zonas[zona] = distribucion_zonas.get(zona, 0) + 1
        
        # Obtener opciones únicas para filtros
        filtros = {
            'usuarios': sorted(list(set(caso.get('usuario') for caso in pendientes if caso.get('usuario')))),
            'etiquetas': sorted(list(set(caso.get('etiqueta') for caso in pendientes if caso.get('etiqueta')))),
            'zonas': sorted(list(set(caso.get('zona') for caso in pendientes if caso.get('zona'))))
        }
        
        return jsonify({
            'total': total,
            'distribucionZonas': distribucion_zonas,
            'filtros': filtros
        })
    except Exception as e:
        print(f"Error en get_pendientes_resumen: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/pendientes/lista')
@login_required
@page_access_required('reportes2') 
def get_pendientes_lista():
    try:
        pendientes = load_json_file(PENDIENTES_FILE)
        
        # Aplicar filtros si existen
        filters = request.args
        if filters:
            filtered_pendientes = pendientes
            for key, value in filters.items():
                if value:
                    if key == 'fecha':
                        # Manejar rango de fechas
                        dates = value.split(' to ')
                        if len(dates) == 2:
                            start_date = datetime.strptime(dates[0], '%Y-%m-%d')
                            end_date = datetime.strptime(dates[1], '%Y-%m-%d')
                            filtered_pendientes = [
                                caso for caso in filtered_pendientes
                                if start_date <= datetime.strptime(caso.get('fecha', ''), '%Y-%m-%d') <= end_date
                            ]
                        elif len(dates) == 1:
                            date = datetime.strptime(dates[0], '%Y-%m-%d')
                            filtered_pendientes = [
                                caso for caso in filtered_pendientes
                                if datetime.strptime(caso.get('fecha', ''), '%Y-%m-%d') == date
                            ]
                    else:
                        filtered_pendientes = [
                            caso for caso in filtered_pendientes
                            if str(caso.get(key, '')).lower() == value.lower()
                        ]
            pendientes = filtered_pendientes
        
        # Ordenar por fecha descendente
        pendientes.sort(key=lambda x: x.get('fecha', ''), reverse=True)
        
        return jsonify(pendientes)
    except Exception as e:
        print(f"Error en get_pendientes_lista: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/pendientes/<string:id>', methods=['GET'])
@login_required
@page_access_required('reportes2')
def get_pendiente(id):
    try:
        pendientes = load_json_file(PENDIENTES_FILE)
        caso = next((item for item in pendientes if str(item.get('id')) == str(id)), None)
        
        if not caso:
            return jsonify({'error': 'Registro no encontrado'}), 404
            
        return jsonify(caso)
    except Exception as e:
        print(f"Error en get_pendiente: {str(e)}")  # Agrega este log para depuración
        return jsonify({'error': str(e)}), 500

@app.route('/api/pendientes/update', methods=['POST'])
@login_required
@page_access_required('reportes2')
def update_pendiente():
    try:
        data = request.get_json()
        
        if not data or 'id' not in data:
            return jsonify({
                'status': 'error',
                'message': 'Datos inválidos'
            }), 400

        pendientes = load_json_file(PENDIENTES_FILE)
        
        # Encontrar el índice del caso a actualizar
        caso_index = next((index for index, item in enumerate(pendientes) 
                          if str(item.get('id')) == str(data['id'])), -1)
        
        if caso_index == -1:
            return jsonify({
                'status': 'error',
                'message': 'Registro no encontrado'
            }), 404

        caso_anterior = pendientes[caso_index]
        
        # Si el estado cambió de PENDIENTE a OK, mover a la zona correspondiente
        if caso_anterior['estado'] == 'PENDIENTE' and data['estado'] == 'OK':
            zona_file = ZONAS_JSON.get(data['zona'])
            
            if not zona_file:
                return jsonify({
                    'status': 'error',
                    'message': f'Zona no válida: {data["zona"]}'
                }), 400
            
            # Obtener datos de la zona
            zona_data = load_json_file(zona_file)
            
            # Agregar el caso actualizado a la zona
            nuevo_caso = {**caso_anterior, **data}
            nuevo_caso['fecha_actualizacion'] = datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
            zona_data.append(nuevo_caso)
            
            # Guardar en el archivo de la zona
            if not save_json_file(zona_file, zona_data):
                raise Exception('Error al guardar en el archivo de zona')
            
            # Eliminar de pendientes
            pendientes.pop(caso_index)
            
        else:
            # Actualizar el caso en pendientes
            pendientes[caso_index] = {**caso_anterior, **data}
            pendientes[caso_index]['fecha_actualizacion'] = datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        
        # Guardar cambios en pendientes.json
        if not save_json_file(PENDIENTES_FILE, pendientes):
            raise Exception('Error al guardar en pendientes.json')
        
        # Actualizar timestamp global para detección de cambios
        global last_pendientes_update
        last_pendientes_update = time.time()

        return jsonify({
            'status': 'success',
            'message': 'Registro actualizado correctamente'
        })

    except Exception as e:
        print(f"Error en update_pendiente: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/pendientes/last_update')
@login_required
@page_access_required('reportes2')
def check_pendientes_updates():
    try:
        # Recuperar timestamp del cliente
        client_timestamp = float(request.args.get('timestamp', 0))
        
        # Obtener la última fecha de modificación del archivo pendientes.json
        last_modified = os.path.getmtime(PENDIENTES_FILE)
        
        # Determinar si hay actualizaciones
        has_updates = last_modified > client_timestamp / 1000  # convertir de milisegundos a segundos
        
        # Cargar datos para obtener conteo si hay actualizaciones
        pendientes_count = 0
        if has_updates:
            pendientes = load_json_file(PENDIENTES_FILE)
            pendientes_count = len(pendientes)
        
        return jsonify({
            'hasUpdates': has_updates,
            'lastModified': last_modified,
            'pendingCount': pendientes_count
        })
    except Exception as e:
        print(f"Error checking pendientes updates: {str(e)}")
        return jsonify({'hasUpdates': False, 'error': str(e)})


# ========================================================================
# ===== RUTAS DE NOTAS POST-IT =====
# ========================================================================
@app.route('/api/notes', methods=['GET'])
@login_required
def get_notes():
    """Obtiene todas las notas del usuario actual."""
    try:
        username = session.get('username')
        notes_file = get_user_notes_file(username)
        
        # Si el archivo no existe, devolver lista vacía
        if not os.path.exists(notes_file):
            return jsonify([])
        
        # Leer y devolver notas
        with open(notes_file, 'r', encoding='utf-8') as f:
            notes = json.load(f)
        
        # Ordenar por fecha más reciente
        notes.sort(key=lambda x: x.get('date', ''), reverse=True)
        
        return jsonify(notes)
    except Exception as e:
        print(f"Error obteniendo notas: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/notes', methods=['POST'])
@login_required
def create_note():
    """Crea una nueva nota para el usuario actual."""
    try:
        username = session.get('username')
        notes_file = get_user_notes_file(username)
        
        # Obtener datos de la nota
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Datos no válidos'}), 400
        
        # Validar campos requeridos
        title = data.get('title', '').strip()
        content = data.get('content', '').strip()
        
        if not title and not content:
            return jsonify({'error': 'Se requiere al menos un título o contenido'}), 400
        
        # Obtener notas existentes o crear lista vacía
        notes = []
        if os.path.exists(notes_file):
            with open(notes_file, 'r', encoding='utf-8') as f:
                notes = json.load(f)
        
        # Crear nueva nota
        new_note = {
            'id': str(uuid.uuid4()),  # Requires import uuid
            'title': title or 'Sin título',
            'content': content,
            'color': data.get('color', '#feff9c'),
            'date': datetime.now(TIMEZONE).isoformat()
        }
        
        notes.append(new_note)
        
        # Guardar notas
        with open(notes_file, 'w', encoding='utf-8') as f:
            json.dump(notes, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            'status': 'success',
            'message': 'Nota creada correctamente',
            'note': new_note
        })
    except Exception as e:
        print(f"Error creando nota: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/notes/<note_id>', methods=['DELETE'])
@login_required
def delete_note(note_id):
    """Elimina una nota del usuario actual."""
    try:
        username = session.get('username')
        notes_file = get_user_notes_file(username)
        
        # Verificar si el archivo existe
        if not os.path.exists(notes_file):
            return jsonify({'error': 'No se encontraron notas'}), 404
        
        # Leer notas
        with open(notes_file, 'r', encoding='utf-8') as f:
            notes = json.load(f)
        
        # Buscar y eliminar la nota
        note_index = next((i for i, note in enumerate(notes) if note.get('id') == note_id), None)
        
        if note_index is None:
            return jsonify({'error': 'Nota no encontrada'}), 404
        
        # Eliminar nota
        removed_note = notes.pop(note_index)
        
        # Guardar notas actualizadas
        with open(notes_file, 'w', encoding='utf-8') as f:
            json.dump(notes, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            'status': 'success',
            'message': 'Nota eliminada correctamente',
            'note': removed_note
        })
    except Exception as e:
        print(f"Error eliminando nota: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/notes/<note_id>', methods=['PUT'])
@login_required
def update_note(note_id):
    """Actualiza una nota existente del usuario actual."""
    try:
        username = session.get('username')
        notes_file = get_user_notes_file(username)
        
        # Verificar si el archivo existe
        if not os.path.exists(notes_file):
            return jsonify({'error': 'No se encontraron notas'}), 404
        
        # Obtener datos de la nota a actualizar
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Datos no válidos'}), 400
        
        # Validar campos requeridos
        title = data.get('title', '').strip()
        content = data.get('content', '').strip()
        
        if not title and not content:
            return jsonify({'error': 'Se requiere al menos un título o contenido'}), 400
        
        # Leer notas existentes
        with open(notes_file, 'r', encoding='utf-8') as f:
            notes = json.load(f)
        
        # Buscar la nota por ID
        note_index = next((i for i, note in enumerate(notes) if note.get('id') == note_id), None)
        
        if note_index is None:
            return jsonify({'error': 'Nota no encontrada'}), 404
        
        # Actualizar campos de la nota
        notes[note_index]['title'] = title or 'Sin título'
        notes[note_index]['content'] = content
        notes[note_index]['color'] = data.get('color', notes[note_index].get('color', '#feff9c'))
        notes[note_index]['updated_at'] = datetime.now(TIMEZONE).isoformat()
        
        # Guardar notas actualizadas
        with open(notes_file, 'w', encoding='utf-8') as f:
            json.dump(notes, f, ensure_ascii=False, indent=2)
        
        return jsonify({
            'status': 'success',
            'message': 'Nota actualizada correctamente',
            'note': notes[note_index]
        })
    except Exception as e:
        print(f"Error actualizando nota: {str(e)}")
        return jsonify({'error': str(e)}), 500

# ========================================================================
# ===== RUTAS DE PERFIL DE USUARIO =====
# ========================================================================
@app.route('/mi-perfil')
@login_required
def mi_perfil():
    """Ruta para mostrar el perfil del usuario actual."""
    try:
        username = session.get('username')
        users = load_users()
        user = next((u for u in users if u['username'] == username), None)
        
        if not user:
            flash('Usuario no encontrado')
            return redirect(url_for('index'))
        
        # Formatear información del usuario para mostrar en la plantilla
        user_info = {
            'username': user['username'],
            'role': user['role'],
            'avatar_url': user.get('avatar_url', url_for('static', filename='images/default_avatar.png')),
            'last_access': format_datetime_for_display(user.get('lastAccess')),
            'pages': user.get('pages', [])
        }
        
        return render_template('mi_perfil.html', 
                             user_info=user_info, 
                             current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))
    except Exception as e:
        print(f"Error en mi_perfil: {str(e)}")
        flash('Ocurrió un error al cargar el perfil')
        return redirect(url_for('index'))

@app.route('/api/profile/change-password', methods=['POST'])
@login_required
def change_password():
    """API para cambiar la contraseña del usuario actual."""
    try:
        data = request.get_json()
        current_password = data.get('current_password')
        new_password = data.get('new_password')
        
        if not current_password or not new_password:
            return jsonify({
                'status': 'error',
                'message': 'Se requieren contraseña actual y nueva'
            }), 400
        
        # Obtener usuario actual
        username = session.get('username')
        users = load_users()
        user_index = next((i for i, u in enumerate(users) if u['username'] == username), None)
        
        if user_index is None:
            return jsonify({
                'status': 'error',
                'message': 'Usuario no encontrado'
            }), 404
        
        # Verificar contraseña actual
        user = users[user_index]
        if not bcrypt.checkpw(current_password.encode('utf-8'), user['password'].encode('utf-8')):
            return jsonify({
                'status': 'error',
                'message': 'Contraseña actual incorrecta'
            }), 400
        
        # Hashear nueva contraseña
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(new_password.encode('utf-8'), salt)
        
        # Actualizar contraseña
        users[user_index]['password'] = hashed.decode('utf-8')
        users[user_index]['updated_at'] = datetime.now(TIMEZONE).isoformat()
        
        # Guardar usuarios
        if not save_users(users):
            return jsonify({
                'status': 'error',
                'message': 'Error al guardar la contraseña'
            }), 500
        
        return jsonify({
            'status': 'success',
            'message': 'Contraseña actualizada correctamente'
        })
        
    except Exception as e:
        print(f"Error en change_password: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/profile/upload-avatar', methods=['POST'])
@login_required
def upload_avatar():
    """API para subir una foto de perfil."""
    try:
        if 'avatar' not in request.files:
            return jsonify({
                'status': 'error',
                'message': 'No se envió ninguna imagen'
            }), 400
        
        file = request.files['avatar']
        
        if file.filename == '':
            return jsonify({
                'status': 'error',
                'message': 'No se seleccionó ninguna imagen'
            }), 400
        
        if not allowed_image_file(file.filename):
            return jsonify({
                'status': 'error',
                'message': 'Formato de imagen no permitido. Use JPG, PNG o GIF'
            }), 400
        
        # Obtener usuario actual
        username = session.get('username')
        users = load_users()
        user_index = next((i for i, u in enumerate(users) if u['username'] == username), None)
        
        if user_index is None:
            return jsonify({
                'status': 'error',
                'message': 'Usuario no encontrado'
            }), 404
        
        # Crear nombre de archivo seguro: username_timestamp.extension
        timestamp = datetime.now(TIMEZONE).strftime('%Y%m%d%H%M%S')
        filename = secure_filename(f"{username}_{timestamp}.{file.filename.rsplit('.', 1)[1].lower()}")
        file_path = os.path.join(AVATAR_FOLDER, filename)
        
        # Guardar archivo
        file.save(file_path)
        
        # Actualizar la URL del avatar en el registro del usuario
        avatar_url = f"/static/avatars/{filename}"
        users[user_index]['avatar_url'] = avatar_url
        users[user_index]['updated_at'] = datetime.now(TIMEZONE).isoformat()
        
        # Guardar usuarios
        if not save_users(users):
            return jsonify({
                'status': 'error',
                'message': 'Error al guardar la imagen de perfil'
            }), 500
        
        return jsonify({
            'status': 'success',
            'message': 'Imagen de perfil actualizada correctamente',
            'avatar_url': avatar_url
        })
        
    except Exception as e:
        print(f"Error en upload_avatar: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

# ========================================================================
# ===== RUTAS DE ZONAS =====
# ========================================================================
@app.route('/zonas')
@login_required
@page_access_required('zonas')
def zonas():
    """Ruta para mostrar la página de selección de zonas."""
    # Obtener información del usuario
    username = session.get('username')
    users = load_users()
    user = next((u for u in users if u['username'] == username), None)
    
    # Información básica del usuario para la plantilla
    user_info = None
    if user:
        user_info = {
            'avatar_url': user.get('avatar_url') or url_for('static', filename='images/default_avatar.png')
        }
    
    return render_template('zonas.html', 
                         user_info=user_info,
                         now=int(time.time()),
                         current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))

@app.route('/zona/<zona_id>')
@login_required
def zona(zona_id):
    """Ruta para mostrar una zona específica."""
    username = session.get('username')
    users = load_users()
    user = next((u for u in users if u['username'] == username), None)
    
    # Información básica del usuario para la plantilla
    user_info = None
    if user:
        user_info = {
            'avatar_url': user.get('avatar_url') or url_for('static', filename='images/default_avatar.png')
        }
    
    # Verificar qué zona fue solicitada y mostrar la plantilla correspondiente
    if zona_id == 'ambulante':
        # Verificar que el archivo ambulante.json existe
        ambulante_json = ZONAS_JSON.get('AMBULANTE')
        if not os.path.exists(ambulante_json):
            save_json_file(ambulante_json, [])
        
        return render_template('ambulante.html', 
                            user_info=user_info,
                            now=int(time.time()),
                            current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))
    # Zona 'constitucion'
    elif zona_id == 'constitucion':
        # Verificar que el archivo constitucion.json existe
        constitucion_json = ZONAS_JSON.get('CONSTITUCION')
        if not os.path.exists(constitucion_json):
            save_json_file(constitucion_json, [])
        
        return render_template('constitucion.html', 
                            user_info=user_info,
                            now=int(time.time()),
                            current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))
    # Zona 'bimbo'
    elif zona_id == 'bimbo':
        # Verificar que el archivo bimbo.json existe
        bimbo_json = ZONAS_JSON.get('BIMBO')
        if not os.path.exists(bimbo_json):
            save_json_file(bimbo_json, [])
        
        return render_template('bimbo.html', 
                            user_info=user_info,
                            now=int(time.time()),
                            current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))
    # Zona 'tba'
    elif zona_id == 'tba':
        # Verificar que el archivo tba.json existe
        tba_json = ZONAS_JSON.get('TBA')
        if not os.path.exists(tba_json):
            save_json_file(tba_json, [])
        
        return render_template('tba.html', 
                            user_info=user_info,
                            now=int(time.time()),
                            current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))
    # Zona 'kioscos'
    elif zona_id == 'kioscos':
        # Verificar que el archivo kioscos.json existe
        kioscos_json = ZONAS_JSON.get('KIOSCOS')
        if not os.path.exists(kioscos_json):
            save_json_file(kioscos_json, [])
        
        return render_template('kioscos.html', 
                            user_info=user_info,
                            now=int(time.time()),
                            current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))
    # Zona 'once'
    elif zona_id == 'once':
        # Verificar que el archivo once.json existe
        once_json = ZONAS_JSON.get('ONCE')
        if not os.path.exists(once_json):
            save_json_file(once_json, [])
        
        return render_template('once.html', 
                            user_info=user_info,
                            now=int(time.time()),
                            current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))
    # Zona 'gastronomia'
    elif zona_id == 'gastronomia':
        # Verificar que el archivo gastronomia.json existe
        gastronomia_json = ZONAS_JSON.get('GASTRONOMIA')
        if not os.path.exists(gastronomia_json):
            save_json_file(gastronomia_json, [])
        
        return render_template('gastronomia.html', 
                            user_info=user_info,
                            now=int(time.time()),
                            current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))
    # Zona 'retiro'
    elif zona_id == 'retiro':
        # Verificar que el archivo retiro.json existe
        retiro_json = ZONAS_JSON.get('RETIRO')
        if not os.path.exists(retiro_json):
            save_json_file(retiro_json, [])
        
        return render_template('retiro.html', 
                            user_info=user_info,
                            now=int(time.time()),
                            current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))
    elif zona_id == 'zona_sur':
        # Verificar que el archivo zona_sur.json existe
        zona_sur_json = ZONAS_JSON.get('ZONA SUR')
        if not os.path.exists(zona_sur_json):
            save_json_file(zona_sur_json, [])
        
        return render_template('zona_sur.html', 
                            user_info=user_info,
                            now=int(time.time()),
                            current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))
    # El resto de zonas...
    else:
        # Si la zona no existe, redirigir a la página de zonas con un mensaje
        flash(f'La zona {zona_id} no existe.')
        return redirect(url_for('zonas'))

# ========================================================================
# ===== ENDPOINTS PARA ZONA AMBULANTE =====
# ========================================================================
@app.route('/api/ambulante/validation', methods=['GET'])
@login_required
def get_ambulante_validation():
    """Obtiene datos de validación para la zona ambulante."""
    try:
        fecha = request.args.get('fecha')
        if not fecha:
            return jsonify({'error': 'Fecha requerida'}), 400
            
        # Cargar datos de ambulante.json
        ambulante_data = load_json_file(ZONAS_JSON.get('AMBULANTE', ''))
        
        # Filtrar por fecha
        valid_records = [
            {
                'id': item.get('id', ''),
                'fecha': item.get('fecha', ''),
                'etiqueta': item.get('etiqueta', ''),
                'turno': item.get('turno', '')
            }
            for item in ambulante_data if item.get('fecha') == fecha
        ]
        
        return jsonify(valid_records)
    except Exception as e:
        print(f"Error en get_ambulante_validation: {str(e)}")
        return jsonify({'error': str(e)}), 500
        
@app.route('/api/ambulante/users', methods=['GET'])
@login_required
def get_ambulante_users():
    """Obtiene la lista de usuarios que han realizado registros en ambulante."""
    try:
        # Cargar datos de ambulante.json
        ambulante_data = load_json_file(ZONAS_JSON.get('AMBULANTE', ''))
        
        # Extraer usuarios únicos
        users = sorted(list(set(item.get('usuario', '') for item in ambulante_data if item.get('usuario'))))
        
        return jsonify(users)
    except Exception as e:
        print(f"Error en get_ambulante_users: {str(e)}")
        return jsonify({'error': str(e)}), 500
        
@app.route('/api/ambulante/data', methods=['GET'])
@login_required
def get_ambulante_data():
    """Obtiene los registros de la zona ambulante con filtros opcionales."""
    try:
        # Obtener parámetros de filtrado
        usuario = request.args.get('usuario')
        fecha = request.args.get('fecha')
        
        # Cargar datos de ambulante.json
        ambulante_data = load_json_file(ZONAS_JSON.get('AMBULANTE', ''))
        
        # Aplicar filtros si se proporcionan
        filtered_data = ambulante_data
        
        if usuario:
            filtered_data = [item for item in filtered_data if item.get('usuario', '').upper() == usuario.upper()]
            
        if fecha:
            filtered_data = [item for item in filtered_data if item.get('fecha') == fecha]
            
        # Ordenar por fecha descendente y por etiqueta
        filtered_data.sort(key=lambda x: (x.get('fecha', ''), x.get('etiqueta', '')), reverse=True)
        
        return jsonify(filtered_data)
    except Exception as e:
        print(f"Error en get_ambulante_data: {str(e)}")
        return jsonify({'error': str(e)}), 500
        
@app.route('/api/ambulante/record/<record_id>', methods=['GET'])
@login_required
def get_ambulante_record(record_id):
    """Obtiene un registro específico de la zona ambulante."""
    try:
        # Cargar datos de ambulante.json
        ambulante_data = load_json_file(ZONAS_JSON.get('AMBULANTE', ''))
        
        # Buscar el registro por ID
        record = next((item for item in ambulante_data if item.get('id') == record_id), None)
        
        if not record:
            return jsonify({'error': 'Registro no encontrado'}), 404
            
        return jsonify(record)
    except Exception as e:
        print(f"Error en get_ambulante_record: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ambulante/update', methods=['POST'])
@login_required
def update_ambulante_record():
    """Actualiza un registro de la zona ambulante, moviéndolo entre ambulante.json y pendientes.json según el estado."""
    try:
        # Obtener y validar los datos JSON del request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
            
        if 'id' not in data:
            return jsonify({'error': 'ID del registro no proporcionado'}), 400
            
        # Obtener las rutas a los archivos JSON
        ambulante_json = ZONAS_JSON.get('AMBULANTE')
        
        if not ambulante_json:
            return jsonify({'error': 'Configuración de zona no válida'}), 500
            
        # Cargar datos de ambulante.json y pendientes.json
        ambulante_data = load_json_file(ambulante_json)
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # Verificar nuevo estado
        nuevo_estado = data.get('estado')
        record_found = False
        source_file = None
        source_data = None
        source_index = -1
        
        # Buscar el registro primero en ambulante.json
        for index, item in enumerate(ambulante_data):
            if item.get('id') == data['id']:
                record_found = True
                source_file = ambulante_json
                source_data = ambulante_data
                source_index = index
                break
                
        # Si no se encontró en ambulante.json, buscarlo en pendientes.json
        if not record_found:
            for index, item in enumerate(pendientes_data):
                if item.get('id') == data['id']:
                    record_found = True
                    source_file = PENDIENTES_FILE
                    source_data = pendientes_data
                    source_index = index
                    break
        
        if not record_found:
            return jsonify({'error': f'Registro con ID {data["id"]} no encontrado'}), 404
        
        # Obtener el registro original completo
        original_record = source_data[source_index]
        
        # Preservar campos que no se deben sobrescribir
        for key in original_record:
            if key not in data:
                data[key] = original_record[key]
        
        # Asegurar que la zona sea correcta
        data['zona'] = 'AMBULANTE'
        
        # Procesar el color de fila si viene en el request
        if 'rowColor' in data:
            # El campo rowColor se mantiene tal como viene, incluso si está vacío
            # Ya está en data, así que no necesitamos hacer nada más
            app.logger.info(f"Aplicando color a la fila: {data['rowColor']}")
        
        # Agregar fecha de actualización
        data['fecha_actualizacion'] = datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        
        # Decidir dónde guardar el registro actualizado según el nuevo estado
        if nuevo_estado == 'OK':
            # Si el estado es OK, guardar en ambulante.json
            if source_file != ambulante_json:
                # Eliminar de la fuente original (pendientes.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a ambulante.json
                ambulante_data.append(data)
                if not save_json_file(ambulante_json, ambulante_data):
                    return jsonify({'error': 'Error al guardar en ambulante.json'}), 500
                    
                target_file = "ambulante.json"
            else:
                # Actualizar en ambulante.json
                ambulante_data[source_index] = data
                if not save_json_file(ambulante_json, ambulante_data):
                    return jsonify({'error': 'Error al actualizar en ambulante.json'}), 500
                    
                target_file = "ambulante.json (actualizado)"
        else:
            # Si el estado es PENDIENTE, guardar en pendientes.json
            if source_file != PENDIENTES_FILE:
                # Eliminar de la fuente original (ambulante.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a pendientes.json
                pendientes_data.append(data)
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al guardar en pendientes.json'}), 500
                    
                target_file = "pendientes.json"
            else:
                # Actualizar en pendientes.json
                pendientes_data[source_index] = data
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al actualizar en pendientes.json'}), 500
                    
                target_file = "pendientes.json (actualizado)"
        
        return jsonify({
            'status': 'success', 
            'message': f'Registro actualizado correctamente y guardado en {target_file}',
            'record': data
        })
        
    except Exception as e:
        print(f"Error en update_ambulante_record: {str(e)}")
        return jsonify({'error': str(e)}), 500
        
@app.route('/api/ambulante/delete/<record_id>', methods=['DELETE'])
@login_required
def delete_ambulante_record(record_id):
    """Elimina un registro de la zona ambulante."""
    try:
        # Cargar datos de ambulante.json
        ambulante_data = load_json_file(ZONAS_JSON.get('AMBULANTE', ''))
        
        # Filtrar el registro a eliminar
        updated_data = [item for item in ambulante_data if item.get('id') != record_id]
        
        # Verificar si se eliminó algún registro
        if len(updated_data) == len(ambulante_data):
            return jsonify({'error': 'Registro no encontrado'}), 404
            
        # Guardar los cambios
        save_json_file(ZONAS_JSON.get('AMBULANTE', ''), updated_data)
        
        return jsonify({'status': 'success', 'message': 'Registro eliminado correctamente'})
    except Exception as e:
        print(f"Error en delete_ambulante_record: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/ambulante/all', methods=['GET'])
@login_required
def get_all_ambulante_data():
    """Obtiene todos los registros de ambulante sin filtros."""
    try:
        # Cargar datos de ambulante.json
        ambulante_data = load_json_file(ZONAS_JSON.get('AMBULANTE', ''))
        return jsonify(ambulante_data)
    except Exception as e:
        print(f"Error en get_all_ambulante_data: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/pendientes/ambulante', methods=['GET'])
@login_required
def get_ambulante_pendientes():
    """Obtiene los registros pendientes de zona ambulante para una fecha específica."""
    try:
        fecha = request.args.get('fecha')
        if not fecha:
            return jsonify({'error': 'Fecha requerida'}), 400
            
        # Cargar datos de pendientes.json
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # Filtrar por zona ambulante y fecha específica
        ambulante_pendientes = [
            {
                'id': item.get('id', ''),
                'fecha': item.get('fecha', ''),
                'etiqueta': item.get('etiqueta', ''),
                'turno': item.get('turno', ''),
                'estado': item.get('estado', 'PENDIENTE')
            }
            for item in pendientes_data 
            if item.get('zona') == 'AMBULANTE' and item.get('fecha') == fecha
        ]
        
        return jsonify(ambulante_pendientes)
    except Exception as e:
        print(f"Error en get_ambulante_pendientes: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/ambulante/last_update')
@login_required
def check_ambulante_updates():
    try:
        # Recuperar timestamp del cliente
        client_timestamp = float(request.args.get('timestamp', 0))
        
        # Obtener la última fecha de modificación del archivo ambulante
        ambulante_file = ZONAS_JSON.get('AMBULANTE')
        last_modified = os.path.getmtime(ambulante_file)
        
        # Verificar también pendientes para ambulante
        pendientes_modified = os.path.getmtime(PENDIENTES_FILE)
        
        # Considerar también las modificaciones de pendientes, pero solo
        # si hay pendientes relacionados con ambulante
        pendientes_data = load_json_file(PENDIENTES_FILE)
        has_ambulante_pending = any(item.get('zona') == 'AMBULANTE' for item in pendientes_data)
        
        if has_ambulante_pending:
            last_modified = max(last_modified, pendientes_modified)
        
        # Hay actualizaciones si el archivo se modificó después del timestamp del cliente
        has_updates = last_modified > client_timestamp / 1000  # convertir de milisegundos a segundos
        
        return jsonify({
            'hasUpdates': has_updates,
            'lastModified': last_modified,
            'pendingCount': sum(1 for item in pendientes_data if item.get('zona') == 'AMBULANTE')
        })
    except Exception as e:
        print(f"Error checking ambulante updates: {str(e)}")
        return jsonify({'hasUpdates': False, 'error': str(e)})

# ========================================================================
# ===== ENDPOINTS PARA ZONA SUR =====
# ========================================================================

@app.route('/zona_sur')
@login_required
def zona_sur():
    """Página principal para gestión de Zona Sur"""
    username = session.get('username')
    users = load_users()
    user = next((u for u in users if u['username'] == username), None)
    
    # Información básica del usuario para la plantilla
    user_info = None
    if user:
        user_info = {
            'avatar_url': user.get('avatar_url') or url_for('static', filename='images/default_avatar.png')
        }
        
    return render_template('zona_sur.html', 
                      user_info=user_info,
                      now=int(time.time()),
                      current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))


@app.route('/api/zona_sur/data', methods=['GET'])
@login_required
def get_zona_sur_data():
    """
    Obtener datos de zona sur con posibilidad de filtrado
    Parámetros opcionales:
    - usuario: filtra por usuario específico
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    """
    try:
        # Obtener parámetros de filtro
        usuario = request.args.get('usuario', None)
        fecha = request.args.get('fecha', None)
        
        # Cargar datos desde el archivo
        data = load_json_file(ZONAS_JSON.get('ZONA SUR'))
        
        # Aplicar filtros si existen
        if usuario:
            data = [item for item in data if item.get('usuario') == usuario]
        if fecha:
            data = [item for item in data if item.get('fecha') == fecha]
        
        # Ordenar por fecha (más reciente primero) y luego por ID
        data = sorted(data, key=lambda x: (x.get('fecha', ''), x.get('id', 0)), reverse=True)
        
        return jsonify(data)
    except Exception as e:
        app.logger.error(f"Error en get_zona_sur_data: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/zona_sur/record/<record_id>', methods=['GET'])
@login_required
def get_zona_sur_record(record_id):
    """Obtener un registro específico de zona sur por su ID"""
    try:
        data = load_json_file(ZONAS_JSON.get('ZONA SUR'))
        # Intentar buscar el ID como string primero
        record = next((item for item in data if str(item.get('id')) == str(record_id)), None)
        
        if not record:
            return jsonify({"error": f"No se encontró el registro con ID {record_id}"}), 404
            
        return jsonify(record)
    except Exception as e:
        print(f"Error en get_zona_sur_record: {str(e)}")  # Usar print para debug inmediato
        return jsonify({"error": str(e)}), 500

@app.route('/api/zona_sur/update', methods=['POST'])
@login_required
def update_zona_sur_record():
    """Actualiza un registro de la zona sur, moviéndolo entre zona_sur.json y pendientes.json según el estado."""
    try:
        # Obtener y validar los datos JSON del request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
            
        if 'id' not in data:
            return jsonify({'error': 'ID del registro no proporcionado'}), 400
        
        # Logs detallados para depuración
        print(f"ACTUALIZACIÓN INICIADA: ID={data['id']}, Estado={data.get('estado')}, Usuario={session.get('username')}")
            
        # Obtener las rutas a los archivos JSON
        zona_sur_json = ZONAS_JSON.get('ZONA SUR')
        
        if not zona_sur_json:
            return jsonify({'error': 'Configuración de zona no válida'}), 500
            
        # Cargar datos de zona_sur.json y pendientes.json
        zona_sur_data = load_json_file(zona_sur_json)
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # NUEVA VERIFICACIÓN DE SEGURIDAD
        if not zona_sur_data:
            print(f"ALERTA CRÍTICA: Archivo {zona_sur_json} está vacío o no se pudo cargar")
            # Intentar recuperar datos de la copia de seguridad
            try:
                zona_sur_data = load_json_backup(zona_sur_json, [])
            except:
                zona_sur_data = []
            if not zona_sur_data:
                return jsonify({'error': 'Error crítico al cargar datos. Contacte al administrador.'}), 500
        
        # Guardar el conteo original para verificación
        original_count = len(zona_sur_data)
        print(f"CONTEO ORIGINAL en {zona_sur_json}: {original_count} registros")
        
        # Verificar nuevo estado
        nuevo_estado = data.get('estado')
        record_found = False
        source_file = None
        source_data = None
        source_index = -1
        target_file = "desconocido" # Inicializar variable target_file
        
        # Buscar el registro primero en zona_sur.json
        for index, item in enumerate(zona_sur_data):
            if str(item.get('id')) == str(data['id']):
                record_found = True
                source_file = zona_sur_json
                source_data = zona_sur_data
                source_index = index
                break
                
        # Si no se encontró en zona_sur.json, buscarlo en pendientes.json
        if not record_found:
            for index, item in enumerate(pendientes_data):
                if str(item.get('id')) == str(data['id']):
                    record_found = True
                    source_file = PENDIENTES_FILE
                    source_data = pendientes_data
                    source_index = index
                    break
        
        if not record_found:
            return jsonify({'error': f'Registro con ID {data["id"]} no encontrado'}), 404
        
        # Obtener el registro original completo
        original_record = source_data[source_index]
        
        # Preservar campos que no se deben sobrescribir
        for key in original_record:
            if key not in data:
                data[key] = original_record[key]
        
        # Asegurar que la zona sea correcta
        data['zona'] = 'ZONA SUR'
        
        # Agregar fecha de actualización
        data['fecha_actualizacion'] = datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        
        # Decidir dónde guardar el registro actualizado según el nuevo estado
        if nuevo_estado == 'OK':
            # Si el estado es OK, guardar en zona_sur.json
            if source_file != zona_sur_json:
                # Eliminar de la fuente original (pendientes.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a zona_sur.json
                zona_sur_data.append(data)
                if not save_json_file(zona_sur_json, zona_sur_data):
                    return jsonify({'error': 'Error al guardar en zona_sur.json'}), 500
                    
                target_file = "zona_sur.json"
            else:
                # Actualizar en zona_sur.json
                zona_sur_data[source_index] = data
                if not save_json_file(zona_sur_json, zona_sur_data):
                    return jsonify({'error': 'Error al actualizar en zona_sur.json'}), 500
                    
                target_file = "zona_sur.json (actualizado)"
        else:
            # Si el estado es PENDIENTE, guardar en pendientes.json
            if source_file != PENDIENTES_FILE:
                # Eliminar de la fuente original (zona_sur.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a pendientes.json
                pendientes_data.append(data)
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al guardar en pendientes.json'}), 500
                    
                target_file = "pendientes.json"
            else:
                # Actualizar en pendientes.json
                pendientes_data[source_index] = data
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al actualizar en pendientes.json'}), 500
                    
                target_file = "pendientes.json (actualizado)"
        
        # VERIFICACIÓN FINAL antes de terminar
        if nuevo_estado == 'OK' and source_file == zona_sur_json:
            # Verificar que no se perdieron registros
            if len(zona_sur_data) < original_count:
                print(f"ALERTA CRÍTICA: Posible pérdida de datos en {zona_sur_json}. Original: {original_count}, Nuevo: {len(zona_sur_data)}")
                
        # Actualizar timestamp (para actualizaciones en tiempo real)
        try:
            global last_zona_sur_update
            last_zona_sur_update = time.time()
        except:
            # Si la variable global no está definida, se ignora
            pass
        
        return jsonify({
            'status': 'success', 
            'message': f'Registro actualizado correctamente y guardado en {target_file}',
            'record': data
        })
        
    except Exception as e:
        print(f"ERROR en update_zona_sur_record: {str(e)}")
        # Capturar stacktrace completo para depuración
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/zona_sur/delete/<record_id>', methods=['DELETE'])
@login_required
def delete_zona_sur_record(record_id):
    """Eliminar un registro de zona sur por su ID"""
    try:
        # Cargar datos actuales
        zona_sur_data = load_json_file(ZONAS_JSON.get('ZONA SUR'))
        
        # Buscar el registro a eliminar (convertir IDs a string para comparación segura)
        record_index = next((i for i, item in enumerate(zona_sur_data) if str(item.get('id')) == str(record_id)), None)
        
        if record_index is None:
            return jsonify({"error": f"No se encontró el registro con ID {record_id}"}), 404
            
        # Guardar información del registro antes de eliminarlo (para el log)
        deleted_record = zona_sur_data[record_index]
        
        # Eliminar el registro
        zona_sur_data.pop(record_index)
        
        # Guardar cambios
        save_json_file(ZONAS_JSON.get('ZONA SUR'), zona_sur_data)
        
        # Registrar la actividad en el log del servidor
        print(f"ACTIVIDAD: Usuario {session.get('username')} eliminó registro de Zona Sur (ID: {record_id}, Etiqueta: {deleted_record.get('etiqueta')})")
        
        return jsonify({"success": True, "message": "Registro eliminado correctamente"})
    except Exception as e:
        print(f"Error en delete_zona_sur_record: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/zona_sur/users', methods=['GET'])
@login_required
def get_zona_sur_users():
    """Obtener la lista de usuarios que han registrado datos en zona sur"""
    try:
        data = load_json_file(ZONAS_JSON.get('ZONA SUR'))
        
        # Extraer usuarios únicos
        users = sorted(list(set(item.get('usuario') for item in data if item.get('usuario'))))
        return jsonify(users)
    except Exception as e:
        print(f"Error en get_zona_sur_users: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/pendientes/zona_sur', methods=['GET'])
@login_required
def get_zona_sur_pendientes():
    """
    Obtener pendientes específicos para la zona sur
    Parámetros opcionales:
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    """
    try:
        # Obtener fecha de filtro
        fecha = request.args.get('fecha', None)
        
        # Cargar datos desde el archivo de pendientes
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # Filtrar para obtener solo los pendientes de zona sur
        zona_sur_pendientes = [
            item for item in pendientes_data
            if item.get('zona') == 'ZONA SUR' and
            (fecha is None or item.get('fecha') == fecha)
        ]
        
        return jsonify(zona_sur_pendientes)
    except Exception as e:
        app.logger.error(f"Error en get_zona_sur_pendientes: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/zona_sur/last_update')
@login_required
def check_zona_sur_updates():
    try:
        # Recuperar timestamp del cliente
        client_timestamp = float(request.args.get('timestamp', 0))
        
        # Obtener la última fecha de modificación del archivo
        zona_sur_file = ZONAS_JSON.get('ZONA SUR')
        last_modified = os.path.getmtime(zona_sur_file)
        
        # Verificar también pendientes
        pendientes_modified = os.path.getmtime(PENDIENTES_FILE)
        last_modified = max(last_modified, pendientes_modified)
        
        # Hay actualizaciones si el archivo se modificó después del timestamp del cliente
        has_updates = last_modified > client_timestamp / 1000  # convertir de milisegundos a segundos
        
        return jsonify({
            'hasUpdates': has_updates,
            'lastModified': last_modified
        })
    except Exception as e:
        print(f"Error checking updates: {str(e)}")
        return jsonify({'hasUpdates': False, 'error': str(e)})

@app.route('/api/zona_sur/file_status')
@login_required
def zona_sur_file_status():
    try:
        zona_sur_data = load_json_file(ZONAS_JSON.get('ZONA SUR'), [])
        backup_exists = os.path.exists(ZONAS_JSON.get('ZONA SUR') + '.backup')
        
        return jsonify({
            'records': len(zona_sur_data),
            'file_exists': os.path.exists(ZONAS_JSON.get('ZONA SUR')),
            'file_size': os.path.getsize(ZONAS_JSON.get('ZONA SUR')) if os.path.exists(ZONAS_JSON.get('ZONA SUR')) else 0,
            'backup_exists': backup_exists,
            'last_modified': os.path.getmtime(ZONAS_JSON.get('ZONA SUR')) if os.path.exists(ZONAS_JSON.get('ZONA SUR')) else 0
        })
    except Exception as e:
        print(f"Error verificando estado del archivo: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
# ========================================================================
# ===== ENDPOINTS PARA ZONA BIMBO =====
# ========================================================================

@app.route('/api/bimbo/data', methods=['GET'])
@login_required
def get_bimbo_data():
    """
    Obtener datos de zona bimbo con posibilidad de filtrado
    Parámetros opcionales:
    - usuario: filtra por usuario específico
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    """
    try:
        # Obtener parámetros de filtro
        usuario = request.args.get('usuario', None)
        fecha = request.args.get('fecha', None)
        
        # Cargar datos desde el archivo
        data = load_json_file(ZONAS_JSON.get('BIMBO'))
        
        # Aplicar filtros si existen
        if usuario:
            data = [item for item in data if item.get('usuario') == usuario]
        if fecha:
            data = [item for item in data if item.get('fecha') == fecha]
        
        # Ordenar por fecha (más reciente primero) y luego por ID
        data = sorted(data, key=lambda x: (x.get('fecha', ''), x.get('id', 0)), reverse=True)
        
        return jsonify(data)
    except Exception as e:
        app.logger.error(f"Error en get_bimbo_data: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/bimbo/record/<record_id>', methods=['GET'])
@login_required
def get_bimbo_record(record_id):
    """Obtener un registro específico de zona bimbo por su ID"""
    try:
        data = load_json_file(ZONAS_JSON.get('BIMBO'))
        # Intentar buscar el ID como string primero
        record = next((item for item in data if str(item.get('id')) == str(record_id)), None)
        
        if not record:
            return jsonify({"error": f"No se encontró el registro con ID {record_id}"}), 404
            
        return jsonify(record)
    except Exception as e:
        print(f"Error en get_bimbo_record: {str(e)}")  
        return jsonify({"error": str(e)}), 500

@app.route('/api/bimbo/update', methods=['POST'])
@login_required
def update_bimbo_record():
    """Actualiza un registro de la zona bimbo, moviéndolo entre bimbo.json y pendientes.json según el estado."""
    try:
        # Obtener y validar los datos JSON del request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
            
        if 'id' not in data:
            return jsonify({'error': 'ID del registro no proporcionado'}), 400
        
        # Logs detallados para depuración
        print(f"ACTUALIZACIÓN INICIADA: ID={data['id']}, Estado={data.get('estado')}, Usuario={session.get('username')}")
            
        # Obtener las rutas a los archivos JSON
        bimbo_json = ZONAS_JSON.get('BIMBO')
        
        if not bimbo_json:
            return jsonify({'error': 'Configuración de zona no válida'}), 500
            
        # Cargar datos de bimbo.json y pendientes.json
        bimbo_data = load_json_file(bimbo_json)
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # NUEVA VERIFICACIÓN DE SEGURIDAD
        if not bimbo_data:
            print(f"ALERTA CRÍTICA: Archivo {bimbo_json} está vacío o no se pudo cargar")
            # Intentar recuperar datos de la copia de seguridad
            try:
                bimbo_data = load_json_backup(bimbo_json, [])
            except:
                bimbo_data = []
            if not bimbo_data:
                return jsonify({'error': 'Error crítico al cargar datos. Contacte al administrador.'}), 500
        
        # Guardar el conteo original para verificación
        original_count = len(bimbo_data)
        print(f"CONTEO ORIGINAL en {bimbo_json}: {original_count} registros")
        
        # Verificar nuevo estado
        nuevo_estado = data.get('estado')
        record_found = False
        source_file = None
        source_data = None
        source_index = -1
        target_file = "desconocido" # Inicializar variable target_file
        
        # Buscar el registro primero en bimbo.json
        for index, item in enumerate(bimbo_data):
            if str(item.get('id')) == str(data['id']):
                record_found = True
                source_file = bimbo_json
                source_data = bimbo_data
                source_index = index
                break
                
        # Si no se encontró en bimbo.json, buscarlo en pendientes.json
        if not record_found:
            for index, item in enumerate(pendientes_data):
                if str(item.get('id')) == str(data['id']):
                    record_found = True
                    source_file = PENDIENTES_FILE
                    source_data = pendientes_data
                    source_index = index
                    break
        
        if not record_found:
            return jsonify({'error': f'Registro con ID {data["id"]} no encontrado'}), 404
        
        # Obtener el registro original completo
        original_record = source_data[source_index]
        
        # Preservar campos que no se deben sobrescribir
        for key in original_record:
            if key not in data:
                data[key] = original_record[key]
        
        # Asegurar que la zona sea correcta
        data['zona'] = 'BIMBO'
        
        # Agregar fecha de actualización
        data['fecha_actualizacion'] = datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        
        # Decidir dónde guardar el registro actualizado según el nuevo estado
        if nuevo_estado == 'OK':
            # Si el estado es OK, guardar en bimbo.json
            if source_file != bimbo_json:
                # Eliminar de la fuente original (pendientes.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a bimbo.json
                bimbo_data.append(data)
                if not save_json_file(bimbo_json, bimbo_data):
                    return jsonify({'error': 'Error al guardar en bimbo.json'}), 500
                    
                target_file = "bimbo.json"
            else:
                # Actualizar en bimbo.json
                bimbo_data[source_index] = data
                if not save_json_file(bimbo_json, bimbo_data):
                    return jsonify({'error': 'Error al actualizar en bimbo.json'}), 500
                    
                target_file = "bimbo.json (actualizado)"
        else:
            # Si el estado es PENDIENTE, guardar en pendientes.json
            if source_file != PENDIENTES_FILE:
                # Eliminar de la fuente original (bimbo.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a pendientes.json
                pendientes_data.append(data)
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al guardar en pendientes.json'}), 500
                    
                target_file = "pendientes.json"
            else:
                # Actualizar en pendientes.json
                pendientes_data[source_index] = data
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al actualizar en pendientes.json'}), 500
                    
                target_file = "pendientes.json (actualizado)"
        
        # VERIFICACIÓN FINAL antes de terminar
        if nuevo_estado == 'OK' and source_file == bimbo_json:
            # Verificar que no se perdieron registros
            if len(bimbo_data) < original_count:
                print(f"ALERTA CRÍTICA: Posible pérdida de datos en {bimbo_json}. Original: {original_count}, Nuevo: {len(bimbo_data)}")
        
        return jsonify({
            'status': 'success', 
            'message': f'Registro actualizado correctamente y guardado en {target_file}',
            'record': data
        })
        
    except Exception as e:
        print(f"ERROR en update_bimbo_record: {str(e)}")
        # Capturar stacktrace completo para depuración
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/bimbo/delete/<record_id>', methods=['DELETE'])
@login_required
def delete_bimbo_record(record_id):
    """Eliminar un registro de zona bimbo por su ID"""
    try:
        # Cargar datos actuales
        bimbo_data = load_json_file(ZONAS_JSON.get('BIMBO'))
        
        # Buscar el registro a eliminar (convertir IDs a string para comparación segura)
        record_index = next((i for i, item in enumerate(bimbo_data) if str(item.get('id')) == str(record_id)), None)
        
        if record_index is None:
            return jsonify({"error": f"No se encontró el registro con ID {record_id}"}), 404
            
        # Guardar información del registro antes de eliminarlo (para el log)
        deleted_record = bimbo_data[record_index]
        
        # Eliminar el registro
        bimbo_data.pop(record_index)
        
        # Guardar cambios
        save_json_file(ZONAS_JSON.get('BIMBO'), bimbo_data)
        
        # Registrar la actividad en el log del servidor
        print(f"ACTIVIDAD: Usuario {session.get('username')} eliminó registro de Bimbo (ID: {record_id}, Etiqueta: {deleted_record.get('etiqueta')})")
        
        return jsonify({"success": True, "message": "Registro eliminado correctamente"})
    except Exception as e:
        print(f"Error en delete_bimbo_record: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/bimbo/users', methods=['GET'])
@login_required
def get_bimbo_users():
    """Obtener la lista de usuarios que han registrado datos en zona bimbo"""
    try:
        data = load_json_file(ZONAS_JSON.get('BIMBO'))
        
        # Extraer usuarios únicos
        users = sorted(list(set(item.get('usuario') for item in data if item.get('usuario'))))
        return jsonify(users)
    except Exception as e:
        print(f"Error en get_bimbo_users: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/pendientes/bimbo', methods=['GET'])
@login_required
def get_bimbo_pendientes():
    """
    Obtener pendientes específicos para la zona bimbo
    Parámetros opcionales:
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    """
    try:
        # Obtener fecha de filtro
        fecha = request.args.get('fecha', None)
        
        # Cargar datos desde el archivo de pendientes
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # Filtrar para obtener solo los pendientes de bimbo
        bimbo_pendientes = [
            item for item in pendientes_data
            if item.get('zona') == 'BIMBO' and
            (fecha is None or item.get('fecha') == fecha)
        ]
        
        return jsonify(bimbo_pendientes)
    except Exception as e:
        app.logger.error(f"Error en get_bimbo_pendientes: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/bimbo/last_update')
@login_required
def check_bimbo_updates():
    try:
        # Recuperar timestamp del cliente
        client_timestamp = float(request.args.get('timestamp', 0))
        
        # Obtener la última fecha de modificación del archivo
        bimbo_file = ZONAS_JSON.get('BIMBO')
        last_modified = os.path.getmtime(bimbo_file)
        
        # Verificar también pendientes
        pendientes_modified = os.path.getmtime(PENDIENTES_FILE)
        last_modified = max(last_modified, pendientes_modified)
        
        # Hay actualizaciones si el archivo se modificó después del timestamp del cliente
        has_updates = last_modified > client_timestamp / 1000  # convertir de milisegundos a segundos
        
        return jsonify({
            'hasUpdates': has_updates,
            'lastModified': last_modified
        })
    except Exception as e:
        print(f"Error checking updates: {str(e)}")
        return jsonify({'hasUpdates': False, 'error': str(e)})

@app.route('/api/bimbo/file_status')
@login_required
def bimbo_file_status():
    try:
        bimbo_data = load_json_file(ZONAS_JSON.get('BIMBO'), [])
        backup_exists = os.path.exists(ZONAS_JSON.get('BIMBO') + '.backup')
        
        return jsonify({
            'records': len(bimbo_data),
            'file_exists': os.path.exists(ZONAS_JSON.get('BIMBO')),
            'file_size': os.path.getsize(ZONAS_JSON.get('BIMBO')) if os.path.exists(ZONAS_JSON.get('BIMBO')) else 0,
            'backup_exists': backup_exists,
            'last_modified': os.path.getmtime(ZONAS_JSON.get('BIMBO')) if os.path.exists(ZONAS_JSON.get('BIMBO')) else 0
        })
    except Exception as e:
        print(f"Error verificando estado del archivo: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
# ========================================================================
# ===== ENDPOINTS PARA ZONA CONSTITUCION =====
# ========================================================================

@app.route('/constitucion')
@login_required
@page_access_required('zonas')
def constitucion():
    """Página principal para gestión de Constitución"""
    username = session.get('username')
    users = load_users()
    user = next((u for u in users if u['username'] == username), None)
    
    # Información básica del usuario para la plantilla
    user_info = None
    if user:
        user_info = {
            'avatar_url': user.get('avatar_url') or url_for('static', filename='images/default_avatar.png')
        }
        
    return render_template('constitucion.html', 
                      user_info=user_info,
                      now=int(time.time()),
                      current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'))


@app.route('/api/constitucion/data', methods=['GET'])
@login_required
def get_constitucion_data():
    """
    Obtener datos de zona constitución con posibilidad de filtrado
    Parámetros opcionales:
    - usuario: filtra por usuario específico
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    """
    try:
        # Obtener parámetros de filtro
        usuario = request.args.get('usuario', None)
        fecha = request.args.get('fecha', None)
        
        # Cargar datos desde el archivo
        data = load_json_file(ZONAS_JSON.get('CONSTITUCION'))
        
        # Aplicar filtros si existen
        if usuario:
            data = [item for item in data if item.get('usuario') == usuario]
        if fecha:
            data = [item for item in data if item.get('fecha') == fecha]
        
        # Ordenar por fecha (más reciente primero) y luego por ID
        data = sorted(data, key=lambda x: (x.get('fecha', ''), x.get('id', 0)), reverse=True)
        
        return jsonify(data)
    except Exception as e:
        app.logger.error(f"Error en get_constitucion_data: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/constitucion/record/<record_id>', methods=['GET'])
@login_required
def get_constitucion_record(record_id):
    """Obtener un registro específico de zona constitucion por su ID"""
    try:
        data = load_json_file(ZONAS_JSON.get('CONSTITUCION'))
        # Intentar buscar el ID como string primero
        record = next((item for item in data if str(item.get('id')) == str(record_id)), None)
        
        if not record:
            return jsonify({"error": f"No se encontró el registro con ID {record_id}"}), 404
            
        return jsonify(record)
    except Exception as e:
        print(f"Error en get_constitucion_record: {str(e)}")  
        return jsonify({"error": str(e)}), 500

@app.route('/api/constitucion/update', methods=['POST'])
@login_required
def update_constitucion_record():
    """Actualiza un registro de la zona constitucion, moviéndolo entre constitucion.json y pendientes.json según el estado."""
    try:
        # Obtener y validar los datos JSON del request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
            
        if 'id' not in data:
            return jsonify({'error': 'ID del registro no proporcionado'}), 400
        
        # Logs detallados para depuración
        print(f"ACTUALIZACIÓN INICIADA: ID={data['id']}, Estado={data.get('estado')}, Usuario={session.get('username')}")
            
        # Obtener las rutas a los archivos JSON
        constitucion_json = ZONAS_JSON.get('CONSTITUCION')
        
        if not constitucion_json:
            return jsonify({'error': 'Configuración de zona no válida'}), 500
            
        # Cargar datos de constitucion.json y pendientes.json
        constitucion_data = load_json_file(constitucion_json)
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # NUEVA VERIFICACIÓN DE SEGURIDAD
        if not constitucion_data:
            print(f"ALERTA CRÍTICA: Archivo {constitucion_json} está vacío o no se pudo cargar")
            # Intentar recuperar datos de la copia de seguridad
            try:
                constitucion_data = load_json_backup(constitucion_json, [])
            except:
                constitucion_data = []
            if not constitucion_data:
                return jsonify({'error': 'Error crítico al cargar datos. Contacte al administrador.'}), 500
        
        # Guardar el conteo original para verificación
        original_count = len(constitucion_data)
        print(f"CONTEO ORIGINAL en {constitucion_json}: {original_count} registros")
        
        # Verificar nuevo estado
        nuevo_estado = data.get('estado')
        record_found = False
        source_file = None
        source_data = None
        source_index = -1
        target_file = "desconocido" # Inicializar variable target_file
        
        # Buscar el registro primero en constitucion.json
        for index, item in enumerate(constitucion_data):
            if str(item.get('id')) == str(data['id']):
                record_found = True
                source_file = constitucion_json
                source_data = constitucion_data
                source_index = index
                break
                
        # Si no se encontró en constitucion.json, buscarlo en pendientes.json
        if not record_found:
            for index, item in enumerate(pendientes_data):
                if str(item.get('id')) == str(data['id']):
                    record_found = True
                    source_file = PENDIENTES_FILE
                    source_data = pendientes_data
                    source_index = index
                    break
        
        if not record_found:
            return jsonify({'error': f'Registro con ID {data["id"]} no encontrado'}), 404
        
        # Obtener el registro original completo
        original_record = source_data[source_index]
        
        # Preservar campos que no se deben sobrescribir
        for key in original_record:
            if key not in data:
                data[key] = original_record[key]
        
        # Asegurar que la zona sea correcta
        data['zona'] = 'CONSTITUCION'
        
        # Agregar fecha de actualización
        data['fecha_actualizacion'] = datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        
        # Decidir dónde guardar el registro actualizado según el nuevo estado
        if nuevo_estado == 'OK':
            # Si el estado es OK, guardar en constitucion.json
            if source_file != constitucion_json:
                # Eliminar de la fuente original (pendientes.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a constitucion.json
                constitucion_data.append(data)
                if not save_json_file(constitucion_json, constitucion_data):
                    return jsonify({'error': 'Error al guardar en constitucion.json'}), 500
                    
                target_file = "constitucion.json"
            else:
                # Actualizar en constitucion.json
                constitucion_data[source_index] = data
                if not save_json_file(constitucion_json, constitucion_data):
                    return jsonify({'error': 'Error al actualizar en constitucion.json'}), 500
                    
                target_file = "constitucion.json (actualizado)"
        else:
            # Si el estado es PENDIENTE, guardar en pendientes.json
            if source_file != PENDIENTES_FILE:
                # Eliminar de la fuente original (constitucion.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a pendientes.json
                pendientes_data.append(data)
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al guardar en pendientes.json'}), 500
                    
                target_file = "pendientes.json"
            else:
                # Actualizar en pendientes.json
                pendientes_data[source_index] = data
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al actualizar en pendientes.json'}), 500
                    
                target_file = "pendientes.json (actualizado)"
        
        # VERIFICACIÓN FINAL antes de terminar
        if nuevo_estado == 'OK' and source_file == constitucion_json:
            # Verificar que no se perdieron registros
            if len(constitucion_data) < original_count:
                print(f"ALERTA CRÍTICA: Posible pérdida de datos en {constitucion_json}. Original: {original_count}, Nuevo: {len(constitucion_data)}")
        
        return jsonify({
            'status': 'success', 
            'message': f'Registro actualizado correctamente y guardado en {target_file}',
            'record': data
        })
        
    except Exception as e:
        print(f"ERROR en update_constitucion_record: {str(e)}")
        # Capturar stacktrace completo para depuración
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/constitucion/delete/<record_id>', methods=['DELETE'])
@login_required
def delete_constitucion_record(record_id):
    """Eliminar un registro de zona constitucion por su ID"""
    try:
        # Cargar datos actuales
        constitucion_data = load_json_file(ZONAS_JSON.get('CONSTITUCION'))
        
        # Buscar el registro a eliminar (convertir IDs a string para comparación segura)
        record_index = next((i for i, item in enumerate(constitucion_data) if str(item.get('id')) == str(record_id)), None)
        
        if record_index is None:
            return jsonify({"error": f"No se encontró el registro con ID {record_id}"}), 404
            
        # Guardar información del registro antes de eliminarlo (para el log)
        deleted_record = constitucion_data[record_index]
        
        # Eliminar el registro
        constitucion_data.pop(record_index)
        
        # Guardar cambios
        save_json_file(ZONAS_JSON.get('CONSTITUCION'), constitucion_data)
        
        # Registrar la actividad en el log del servidor
        print(f"ACTIVIDAD: Usuario {session.get('username')} eliminó registro de Constitución (ID: {record_id}, Etiqueta: {deleted_record.get('etiqueta')})")
        
        return jsonify({"success": True, "message": "Registro eliminado correctamente"})
    except Exception as e:
        print(f"Error en delete_constitucion_record: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/constitucion/users', methods=['GET'])
@login_required
def get_constitucion_users():
    """Obtener la lista de usuarios que han registrado datos en zona constitucion"""
    try:
        data = load_json_file(ZONAS_JSON.get('CONSTITUCION'))
        
        # Extraer usuarios únicos
        users = sorted(list(set(item.get('usuario') for item in data if item.get('usuario'))))
        return jsonify(users)
    except Exception as e:
        print(f"Error en get_constitucion_users: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/pendientes/constitucion', methods=['GET'])
@login_required
def get_constitucion_pendientes():
    """
    Obtener pendientes específicos para la zona constitución
    Parámetros opcionales:
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    """
    try:
        # Obtener fecha de filtro
        fecha = request.args.get('fecha', None)
        
        # Cargar datos desde el archivo de pendientes
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # Filtrar para obtener solo los pendientes de constitución
        constitucion_pendientes = [
            item for item in pendientes_data
            if item.get('zona') == 'CONSTITUCION' and
            (fecha is None or item.get('fecha') == fecha)
        ]
        
        return jsonify(constitucion_pendientes)
    except Exception as e:
        app.logger.error(f"Error en get_constitucion_pendientes: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/constitucion/last_update')
@login_required
def check_constitucion_updates():
    try:
        # Recuperar timestamp del cliente
        client_timestamp = float(request.args.get('timestamp', 0))
        
        # Obtener la última fecha de modificación del archivo
        constitucion_file = ZONAS_JSON.get('CONSTITUCION')
        last_modified = os.path.getmtime(constitucion_file)
        
        # Verificar también pendientes
        pendientes_modified = os.path.getmtime(PENDIENTES_FILE)
        last_modified = max(last_modified, pendientes_modified)
        
        # Hay actualizaciones si el archivo se modificó después del timestamp del cliente
        has_updates = last_modified > client_timestamp / 1000  # convertir de milisegundos a segundos
        
        return jsonify({
            'hasUpdates': has_updates,
            'lastModified': last_modified
        })
    except Exception as e:
        print(f"Error checking updates: {str(e)}")
        return jsonify({'hasUpdates': False, 'error': str(e)})

@app.route('/api/constitucion/file_status')
@login_required
def constitucion_file_status():
    try:
        constitucion_data = load_json_file(ZONAS_JSON.get('CONSTITUCION'), [])
        backup_exists = os.path.exists(ZONAS_JSON.get('CONSTITUCION') + '.backup')
        
        return jsonify({
            'records': len(constitucion_data),
            'file_exists': os.path.exists(ZONAS_JSON.get('CONSTITUCION')),
            'file_size': os.path.getsize(ZONAS_JSON.get('CONSTITUCION')) if os.path.exists(ZONAS_JSON.get('CONSTITUCION')) else 0,
            'backup_exists': backup_exists,
            'last_modified': os.path.getmtime(ZONAS_JSON.get('CONSTITUCION')) if os.path.exists(ZONAS_JSON.get('CONSTITUCION')) else 0
        })
    except Exception as e:
        print(f"Error verificando estado del archivo: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
# ========================================================================
# ===== ENDPOINTS PARA ZONA TBA =====
# ========================================================================

@app.route('/api/tba/data', methods=['GET'])
@login_required
def get_tba_data():
    """
    Obtener datos de zona tba con posibilidad de filtrado
    Parámetros opcionales:
    - usuario: filtra por usuario específico
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    """
    try:
        # Obtener parámetros de filtro
        usuario = request.args.get('usuario', None)
        fecha = request.args.get('fecha', None)
        
        # Cargar datos desde el archivo
        data = load_json_file(ZONAS_JSON.get('TBA'))
        
        # Aplicar filtros si existen
        if usuario:
            data = [item for item in data if item.get('usuario') == usuario]
        if fecha:
            data = [item for item in data if item.get('fecha') == fecha]
        
        # Ordenar por fecha (más reciente primero) y luego por ID
        data = sorted(data, key=lambda x: (x.get('fecha', ''), x.get('id', 0)), reverse=True)
        
        return jsonify(data)
    except Exception as e:
        app.logger.error(f"Error en get_tba_data: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/tba/record/<record_id>', methods=['GET'])
@login_required
def get_tba_record(record_id):
    """Obtener un registro específico de zona tba por su ID"""
    try:
        data = load_json_file(ZONAS_JSON.get('TBA'))
        # Intentar buscar el ID como string primero
        record = next((item for item in data if str(item.get('id')) == str(record_id)), None)
        
        if not record:
            return jsonify({"error": f"No se encontró el registro con ID {record_id}"}), 404
            
        return jsonify(record)
    except Exception as e:
        print(f"Error en get_tba_record: {str(e)}")  
        return jsonify({"error": str(e)}), 500

@app.route('/api/tba/update', methods=['POST'])
@login_required
def update_tba_record():
    """Actualiza un registro de la zona tba, moviéndolo entre tba.json y pendientes.json según el estado."""
    try:
        # Obtener y validar los datos JSON del request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
            
        if 'id' not in data:
            return jsonify({'error': 'ID del registro no proporcionado'}), 400
        
        # Logs detallados para depuración
        print(f"ACTUALIZACIÓN INICIADA: ID={data['id']}, Estado={data.get('estado')}, Usuario={session.get('username')}")
            
        # Obtener las rutas a los archivos JSON
        tba_json = ZONAS_JSON.get('TBA')
        
        if not tba_json:
            return jsonify({'error': 'Configuración de zona no válida'}), 500
            
        # Cargar datos de tba.json y pendientes.json
        tba_data = load_json_file(tba_json)
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # NUEVA VERIFICACIÓN DE SEGURIDAD
        if not tba_data:
            print(f"ALERTA CRÍTICA: Archivo {tba_json} está vacío o no se pudo cargar")
            # Intentar recuperar datos de la copia de seguridad
            try:
                tba_data = load_json_backup(tba_json, [])
            except:
                tba_data = []
            if not tba_data:
                return jsonify({'error': 'Error crítico al cargar datos. Contacte al administrador.'}), 500
        
        # Guardar el conteo original para verificación
        original_count = len(tba_data)
        print(f"CONTEO ORIGINAL en {tba_json}: {original_count} registros")
        
        # Verificar nuevo estado
        nuevo_estado = data.get('estado')
        record_found = False
        source_file = None
        source_data = None
        source_index = -1
        target_file = "desconocido" # Inicializar variable target_file
        
        # Buscar el registro primero en tba.json
        for index, item in enumerate(tba_data):
            if str(item.get('id')) == str(data['id']):
                record_found = True
                source_file = tba_json
                source_data = tba_data
                source_index = index
                break
                
        # Si no se encontró en tba.json, buscarlo en pendientes.json
        if not record_found:
            for index, item in enumerate(pendientes_data):
                if str(item.get('id')) == str(data['id']):
                    record_found = True
                    source_file = PENDIENTES_FILE
                    source_data = pendientes_data
                    source_index = index
                    break
        
        if not record_found:
            return jsonify({'error': f'Registro con ID {data["id"]} no encontrado'}), 404
        
        # Obtener el registro original completo
        original_record = source_data[source_index]
        
        # Preservar campos que no se deben sobrescribir
        for key in original_record:
            if key not in data:
                data[key] = original_record[key]
        
        # Asegurar que la zona sea correcta
        data['zona'] = 'TBA'
        
        # Agregar fecha de actualización
        data['fecha_actualizacion'] = datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        
        # Decidir dónde guardar el registro actualizado según el nuevo estado
        if nuevo_estado == 'OK':
            # Si el estado es OK, guardar en tba.json
            if source_file != tba_json:
                # Eliminar de la fuente original (pendientes.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a tba.json
                tba_data.append(data)
                if not save_json_file(tba_json, tba_data):
                    return jsonify({'error': 'Error al guardar en tba.json'}), 500
                    
                target_file = "tba.json"
            else:
                # Actualizar en tba.json
                tba_data[source_index] = data
                if not save_json_file(tba_json, tba_data):
                    return jsonify({'error': 'Error al actualizar en tba.json'}), 500
                    
                target_file = "tba.json (actualizado)"
        else:
            # Si el estado es PENDIENTE, guardar en pendientes.json
            if source_file != PENDIENTES_FILE:
                # Eliminar de la fuente original (tba.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a pendientes.json
                pendientes_data.append(data)
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al guardar en pendientes.json'}), 500
                    
                target_file = "pendientes.json"
            else:
                # Actualizar en pendientes.json
                pendientes_data[source_index] = data
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al actualizar en pendientes.json'}), 500
                    
                target_file = "pendientes.json (actualizado)"
        
        # VERIFICACIÓN FINAL antes de terminar
        if nuevo_estado == 'OK' and source_file == tba_json:
            # Verificar que no se perdieron registros
            if len(tba_data) < original_count:
                print(f"ALERTA CRÍTICA: Posible pérdida de datos en {tba_json}. Original: {original_count}, Nuevo: {len(tba_data)}")
        
        return jsonify({
            'status': 'success', 
            'message': f'Registro actualizado correctamente y guardado en {target_file}',
            'record': data
        })
        
    except Exception as e:
        print(f"ERROR en update_tba_record: {str(e)}")
        # Capturar stacktrace completo para depuración
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/tba/delete/<record_id>', methods=['DELETE'])
@login_required
def delete_tba_record(record_id):
    """Eliminar un registro de zona tba por su ID"""
    try:
        # Cargar datos actuales
        tba_data = load_json_file(ZONAS_JSON.get('TBA'))
        
        # Buscar el registro a eliminar (convertir IDs a string para comparación segura)
        record_index = next((i for i, item in enumerate(tba_data) if str(item.get('id')) == str(record_id)), None)
        
        if record_index is None:
            return jsonify({"error": f"No se encontró el registro con ID {record_id}"}), 404
            
        # Guardar información del registro antes de eliminarlo (para el log)
        deleted_record = tba_data[record_index]
        
        # Eliminar el registro
        tba_data.pop(record_index)
        
        # Guardar cambios
        save_json_file(ZONAS_JSON.get('TBA'), tba_data)
        
        # Registrar la actividad en el log del servidor
        print(f"ACTIVIDAD: Usuario {session.get('username')} eliminó registro de TBA (ID: {record_id}, Etiqueta: {deleted_record.get('etiqueta')})")
        
        return jsonify({"success": True, "message": "Registro eliminado correctamente"})
    except Exception as e:
        print(f"Error en delete_tba_record: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/tba/users', methods=['GET'])
@login_required
def get_tba_users():
    """Obtener la lista de usuarios que han registrado datos en zona tba"""
    try:
        data = load_json_file(ZONAS_JSON.get('TBA'))
        
        # Extraer usuarios únicos
        users = sorted(list(set(item.get('usuario') for item in data if item.get('usuario'))))
        return jsonify(users)
    except Exception as e:
        print(f"Error en get_tba_users: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/pendientes/tba', methods=['GET'])
@login_required
def get_tba_pendientes():
    """
    Obtener pendientes específicos para la zona tba
    Parámetros opcionales:
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    """
    try:
        # Obtener fecha de filtro
        fecha = request.args.get('fecha', None)
        
        # Cargar datos desde el archivo de pendientes
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # Filtrar para obtener solo los pendientes de tba
        tba_pendientes = [
            item for item in pendientes_data
            if item.get('zona') == 'TBA' and
            (fecha is None or item.get('fecha') == fecha)
        ]
        
        return jsonify(tba_pendientes)
    except Exception as e:
        app.logger.error(f"Error en get_tba_pendientes: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/tba/last_update')
@login_required
def check_tba_updates():
    try:
        # Recuperar timestamp del cliente
        client_timestamp = float(request.args.get('timestamp', 0))
        
        # Obtener la última fecha de modificación del archivo
        tba_file = ZONAS_JSON.get('TBA')
        last_modified = os.path.getmtime(tba_file)
        
        # Verificar también pendientes
        pendientes_modified = os.path.getmtime(PENDIENTES_FILE)
        last_modified = max(last_modified, pendientes_modified)
        
        # Hay actualizaciones si el archivo se modificó después del timestamp del cliente
        has_updates = last_modified > client_timestamp / 1000  # convertir de milisegundos a segundos
        
        return jsonify({
            'hasUpdates': has_updates,
            'lastModified': last_modified
        })
    except Exception as e:
        print(f"Error checking updates: {str(e)}")
        return jsonify({'hasUpdates': False, 'error': str(e)})

@app.route('/api/tba/file_status')
@login_required
def tba_file_status():
    try:
        tba_data = load_json_file(ZONAS_JSON.get('TBA'), [])
        backup_exists = os.path.exists(ZONAS_JSON.get('TBA') + '.backup')
        
        return jsonify({
            'records': len(tba_data),
            'file_exists': os.path.exists(ZONAS_JSON.get('TBA')),
            'file_size': os.path.getsize(ZONAS_JSON.get('TBA')) if os.path.exists(ZONAS_JSON.get('TBA')) else 0,
            'backup_exists': backup_exists,
            'last_modified': os.path.getmtime(ZONAS_JSON.get('TBA')) if os.path.exists(ZONAS_JSON.get('TBA')) else 0
        })
    except Exception as e:
        print(f"Error verificando estado del archivo: {str(e)}")
        return jsonify({'error': str(e)}), 500

# ========================================================================
# ===== ENDPOINTS PARA ZONA KIOSCOS =====
# ========================================================================

@app.route('/api/kioscos/data', methods=['GET'])
@login_required
def get_kioscos_data():
    """
    Obtener datos de zona kioscos con posibilidad de filtrado
    Parámetros opcionales:
    - usuario: filtra por usuario específico
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    """
    try:
        # Obtener parámetros de filtro
        usuario = request.args.get('usuario', None)
        fecha = request.args.get('fecha', None)
        
        # Cargar datos desde el archivo
        data = load_json_file(ZONAS_JSON.get('KIOSCOS'))
        
        # Aplicar filtros si existen
        if usuario:
            data = [item for item in data if item.get('usuario') == usuario]
        if fecha:
            data = [item for item in data if item.get('fecha') == fecha]
        
        # Ordenar por fecha (más reciente primero) y luego por ID
        data = sorted(data, key=lambda x: (x.get('fecha', ''), x.get('id', 0)), reverse=True)
        
        return jsonify(data)
    except Exception as e:
        app.logger.error(f"Error en get_kioscos_data: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/kioscos/record/<record_id>', methods=['GET'])
@login_required
def get_kioscos_record(record_id):
    """Obtener un registro específico de zona kioscos por su ID"""
    try:
        data = load_json_file(ZONAS_JSON.get('KIOSCOS'))
        # Intentar buscar el ID como string primero
        record = next((item for item in data if str(item.get('id')) == str(record_id)), None)
        
        if not record:
            return jsonify({"error": f"No se encontró el registro con ID {record_id}"}), 404
            
        return jsonify(record)
    except Exception as e:
        print(f"Error en get_kioscos_record: {str(e)}")  
        return jsonify({"error": str(e)}), 500

@app.route('/api/kioscos/update', methods=['POST'])
@login_required
def update_kioscos_record():
    """Actualiza un registro de la zona kioscos, moviéndolo entre kioscos.json y pendientes.json según el estado."""
    try:
        # Obtener y validar los datos JSON del request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
            
        if 'id' not in data:
            return jsonify({'error': 'ID del registro no proporcionado'}), 400
        
        # Logs detallados para depuración
        print(f"ACTUALIZACIÓN INICIADA: ID={data['id']}, Estado={data.get('estado')}, Usuario={session.get('username')}")
            
        # Obtener las rutas a los archivos JSON
        kioscos_json = ZONAS_JSON.get('KIOSCOS')
        
        if not kioscos_json:
            return jsonify({'error': 'Configuración de zona no válida'}), 500
            
        # Cargar datos de kioscos.json y pendientes.json
        kioscos_data = load_json_file(kioscos_json)
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # NUEVA VERIFICACIÓN DE SEGURIDAD
        if not kioscos_data:
            print(f"ALERTA CRÍTICA: Archivo {kioscos_json} está vacío o no se pudo cargar")
            # Intentar recuperar datos de la copia de seguridad
            try:
                kioscos_data = load_json_backup(kioscos_json, [])
            except:
                kioscos_data = []
            if not kioscos_data:
                return jsonify({'error': 'Error crítico al cargar datos. Contacte al administrador.'}), 500
        
        # Guardar el conteo original para verificación
        original_count = len(kioscos_data)
        print(f"CONTEO ORIGINAL en {kioscos_json}: {original_count} registros")
        
        # Verificar nuevo estado
        nuevo_estado = data.get('estado')
        record_found = False
        source_file = None
        source_data = None
        source_index = -1
        target_file = "desconocido" # Inicializar variable target_file
        
        # Buscar el registro primero en kioscos.json
        for index, item in enumerate(kioscos_data):
            if str(item.get('id')) == str(data['id']):
                record_found = True
                source_file = kioscos_json
                source_data = kioscos_data
                source_index = index
                break
                
        # Si no se encontró en kioscos.json, buscarlo en pendientes.json
        if not record_found:
            for index, item in enumerate(pendientes_data):
                if str(item.get('id')) == str(data['id']):
                    record_found = True
                    source_file = PENDIENTES_FILE
                    source_data = pendientes_data
                    source_index = index
                    break
        
        if not record_found:
            return jsonify({'error': f'Registro con ID {data["id"]} no encontrado'}), 404
        
        # Obtener el registro original completo
        original_record = source_data[source_index]
        
        # Preservar campos que no se deben sobrescribir
        for key in original_record:
            if key not in data:
                data[key] = original_record[key]
        
        # Asegurar que la zona sea correcta
        data['zona'] = 'KIOSCOS'
        
        # Agregar fecha de actualización
        data['fecha_actualizacion'] = datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        
        # Decidir dónde guardar el registro actualizado según el nuevo estado
        if nuevo_estado == 'OK':
            # Si el estado es OK, guardar en kioscos.json
            if source_file != kioscos_json:
                # Eliminar de la fuente original (pendientes.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a kioscos.json
                kioscos_data.append(data)
                if not save_json_file(kioscos_json, kioscos_data):
                    return jsonify({'error': 'Error al guardar en kioscos.json'}), 500
                    
                target_file = "kioscos.json"
            else:
                # Actualizar en kioscos.json
                kioscos_data[source_index] = data
                if not save_json_file(kioscos_json, kioscos_data):
                    return jsonify({'error': 'Error al actualizar en kioscos.json'}), 500
                    
                target_file = "kioscos.json (actualizado)"
        else:
            # Si el estado es PENDIENTE, guardar en pendientes.json
            if source_file != PENDIENTES_FILE:
                # Eliminar de la fuente original (kioscos.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a pendientes.json
                pendientes_data.append(data)
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al guardar en pendientes.json'}), 500
                    
                target_file = "pendientes.json"
            else:
                # Actualizar en pendientes.json
                pendientes_data[source_index] = data
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al actualizar en pendientes.json'}), 500
                    
                target_file = "pendientes.json (actualizado)"
        
        # VERIFICACIÓN FINAL antes de terminar
        if nuevo_estado == 'OK' and source_file == kioscos_json:
            # Verificar que no se perdieron registros
            if len(kioscos_data) < original_count:
                print(f"ALERTA CRÍTICA: Posible pérdida de datos en {kioscos_json}. Original: {original_count}, Nuevo: {len(kioscos_data)}")
        
        return jsonify({
            'status': 'success', 
            'message': f'Registro actualizado correctamente y guardado en {target_file}',
            'record': data
        })
        
    except Exception as e:
        print(f"ERROR en update_kioscos_record: {str(e)}")
        # Capturar stacktrace completo para depuración
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/kioscos/delete/<record_id>', methods=['DELETE'])
@login_required
def delete_kioscos_record(record_id):
    """Eliminar un registro de zona kioscos por su ID"""
    try:
        # Cargar datos actuales
        kioscos_data = load_json_file(ZONAS_JSON.get('KIOSCOS'))
        
        # Buscar el registro a eliminar (convertir IDs a string para comparación segura)
        record_index = next((i for i, item in enumerate(kioscos_data) if str(item.get('id')) == str(record_id)), None)
        
        if record_index is None:
            return jsonify({"error": f"No se encontró el registro con ID {record_id}"}), 404
            
        # Guardar información del registro antes de eliminarlo (para el log)
        deleted_record = kioscos_data[record_index]
        
        # Eliminar el registro
        kioscos_data.pop(record_index)
        
        # Guardar cambios
        save_json_file(ZONAS_JSON.get('KIOSCOS'), kioscos_data)
        
        # Registrar la actividad en el log del servidor
        print(f"ACTIVIDAD: Usuario {session.get('username')} eliminó registro de Kioscos (ID: {record_id}, Etiqueta: {deleted_record.get('etiqueta')})")
        
        return jsonify({"success": True, "message": "Registro eliminado correctamente"})
    except Exception as e:
        print(f"Error en delete_kioscos_record: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/kioscos/users', methods=['GET'])
@login_required
def get_kioscos_users():
    """Obtener la lista de usuarios que han registrado datos en zona kioscos"""
    try:
        data = load_json_file(ZONAS_JSON.get('KIOSCOS'))
        
        # Extraer usuarios únicos
        users = sorted(list(set(item.get('usuario') for item in data if item.get('usuario'))))
        return jsonify(users)
    except Exception as e:
        print(f"Error en get_kioscos_users: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/pendientes/kioscos', methods=['GET'])
@login_required
def get_kioscos_pendientes():
    """
    Obtener pendientes específicos para la zona kioscos
    Parámetros opcionales:
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    """
    try:
        # Obtener fecha de filtro
        fecha = request.args.get('fecha', None)
        
        # Cargar datos desde el archivo de pendientes
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # Filtrar para obtener solo los pendientes de kioscos
        kioscos_pendientes = [
            item for item in pendientes_data
            if item.get('zona') == 'KIOSCOS' and
            (fecha is None or item.get('fecha') == fecha)
        ]
        
        return jsonify(kioscos_pendientes)
    except Exception as e:
        app.logger.error(f"Error en get_kioscos_pendientes: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/kioscos/last_update')
@login_required
def check_kioscos_updates():
    try:
        # Recuperar timestamp del cliente
        client_timestamp = float(request.args.get('timestamp', 0))
        
        # Obtener la última fecha de modificación del archivo
        kioscos_file = ZONAS_JSON.get('KIOSCOS')
        last_modified = os.path.getmtime(kioscos_file)
        
        # Verificar también pendientes
        pendientes_modified = os.path.getmtime(PENDIENTES_FILE)
        last_modified = max(last_modified, pendientes_modified)
        
        # Hay actualizaciones si el archivo se modificó después del timestamp del cliente
        has_updates = last_modified > client_timestamp / 1000  # convertir de milisegundos a segundos
        
        return jsonify({
            'hasUpdates': has_updates,
            'lastModified': last_modified
        })
    except Exception as e:
        print(f"Error checking updates: {str(e)}")
        return jsonify({'hasUpdates': False, 'error': str(e)})

@app.route('/api/kioscos/file_status')
@login_required
def kioscos_file_status():
    try:
        kioscos_data = load_json_file(ZONAS_JSON.get('KIOSCOS'), [])
        backup_exists = os.path.exists(ZONAS_JSON.get('KIOSCOS') + '.backup')
        
        return jsonify({
            'records': len(kioscos_data),
            'file_exists': os.path.exists(ZONAS_JSON.get('KIOSCOS')),
            'file_size': os.path.getsize(ZONAS_JSON.get('KIOSCOS')) if os.path.exists(ZONAS_JSON.get('KIOSCOS')) else 0,
            'backup_exists': backup_exists,
            'last_modified': os.path.getmtime(ZONAS_JSON.get('KIOSCOS')) if os.path.exists(ZONAS_JSON.get('KIOSCOS')) else 0
        })
    except Exception as e:
        print(f"Error verificando estado del archivo: {str(e)}")
        return jsonify({'error': str(e)}), 500

# ========================================================================
# ===== ENDPOINTS PARA ZONA ONCE =====
# ========================================================================

@app.route('/api/once/data', methods=['GET'])
@login_required
def get_once_data():
    """
    Obtener datos de zona once con posibilidad de filtrado
    Parámetros opcionales:
    - usuario: filtra por usuario específico
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    """
    try:
        # Obtener parámetros de filtro
        usuario = request.args.get('usuario', None)
        fecha = request.args.get('fecha', None)
        
        # Cargar datos desde el archivo
        data = load_json_file(ZONAS_JSON.get('ONCE'))
        
        # Aplicar filtros si existen
        if usuario:
            data = [item for item in data if item.get('usuario') == usuario]
        if fecha:
            data = [item for item in data if item.get('fecha') == fecha]
        
        # Ordenar por fecha (más reciente primero) y luego por ID
        data = sorted(data, key=lambda x: (x.get('fecha', ''), x.get('id', 0)), reverse=True)
        
        return jsonify(data)
    except Exception as e:
        app.logger.error(f"Error en get_once_data: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/once/record/<record_id>', methods=['GET'])
@login_required
def get_once_record(record_id):
    """Obtener un registro específico de zona once por su ID"""
    try:
        data = load_json_file(ZONAS_JSON.get('ONCE'))
        # Intentar buscar el ID como string primero
        record = next((item for item in data if str(item.get('id')) == str(record_id)), None)
        
        if not record:
            return jsonify({"error": f"No se encontró el registro con ID {record_id}"}), 404
            
        return jsonify(record)
    except Exception as e:
        print(f"Error en get_once_record: {str(e)}")  
        return jsonify({"error": str(e)}), 500

@app.route('/api/once/update', methods=['POST'])
@login_required
def update_once_record():
    """Actualiza un registro de la zona once, moviéndolo entre once.json y pendientes.json según el estado."""
    try:
        # Obtener y validar los datos JSON del request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
            
        if 'id' not in data:
            return jsonify({'error': 'ID del registro no proporcionado'}), 400
        
        # Logs detallados para depuración
        print(f"ACTUALIZACIÓN INICIADA: ID={data['id']}, Estado={data.get('estado')}, Usuario={session.get('username')}")
            
        # Obtener las rutas a los archivos JSON
        once_json = ZONAS_JSON.get('ONCE')
        
        if not once_json:
            return jsonify({'error': 'Configuración de zona no válida'}), 500
            
        # Cargar datos de once.json y pendientes.json
        once_data = load_json_file(once_json)
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # NUEVA VERIFICACIÓN DE SEGURIDAD
        if not once_data:
            print(f"ALERTA CRÍTICA: Archivo {once_json} está vacío o no se pudo cargar")
            # Intentar recuperar datos de la copia de seguridad
            try:
                once_data = load_json_backup(once_json, [])
            except:
                once_data = []
            if not once_data:
                return jsonify({'error': 'Error crítico al cargar datos. Contacte al administrador.'}), 500
        
        # Guardar el conteo original para verificación
        original_count = len(once_data)
        print(f"CONTEO ORIGINAL en {once_json}: {original_count} registros")
        
        # Verificar nuevo estado
        nuevo_estado = data.get('estado')
        record_found = False
        source_file = None
        source_data = None
        source_index = -1
        target_file = "desconocido" # Inicializar variable target_file
        
        # Buscar el registro primero en once.json
        for index, item in enumerate(once_data):
            if str(item.get('id')) == str(data['id']):
                record_found = True
                source_file = once_json
                source_data = once_data
                source_index = index
                break
                
        # Si no se encontró en once.json, buscarlo en pendientes.json
        if not record_found:
            for index, item in enumerate(pendientes_data):
                if str(item.get('id')) == str(data['id']):
                    record_found = True
                    source_file = PENDIENTES_FILE
                    source_data = pendientes_data
                    source_index = index
                    break
        
        if not record_found:
            return jsonify({'error': f'Registro con ID {data["id"]} no encontrado'}), 404
        
        # Obtener el registro original completo
        original_record = source_data[source_index]
        
        # Preservar campos que no se deben sobrescribir
        for key in original_record:
            if key not in data:
                data[key] = original_record[key]
        
        # Asegurar que la zona sea correcta
        data['zona'] = 'ONCE'
        
        # Agregar fecha de actualización
        data['fecha_actualizacion'] = datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        
        # Decidir dónde guardar el registro actualizado según el nuevo estado
        if nuevo_estado == 'OK':
            # Si el estado es OK, guardar en once.json
            if source_file != once_json:
                # Eliminar de la fuente original (pendientes.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a once.json
                once_data.append(data)
                if not save_json_file(once_json, once_data):
                    return jsonify({'error': 'Error al guardar en once.json'}), 500
                    
                target_file = "once.json"
            else:
                # Actualizar en once.json
                once_data[source_index] = data
                if not save_json_file(once_json, once_data):
                    return jsonify({'error': 'Error al actualizar en once.json'}), 500
                    
                target_file = "once.json (actualizado)"
        else:
            # Si el estado es PENDIENTE, guardar en pendientes.json
            if source_file != PENDIENTES_FILE:
                # Eliminar de la fuente original (once.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a pendientes.json
                pendientes_data.append(data)
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al guardar en pendientes.json'}), 500
                    
                target_file = "pendientes.json"
            else:
                # Actualizar en pendientes.json
                pendientes_data[source_index] = data
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al actualizar en pendientes.json'}), 500
                    
                target_file = "pendientes.json (actualizado)"
        
        # VERIFICACIÓN FINAL antes de terminar
        if nuevo_estado == 'OK' and source_file == once_json:
            # Verificar que no se perdieron registros
            if len(once_data) < original_count:
                print(f"ALERTA CRÍTICA: Posible pérdida de datos en {once_json}. Original: {original_count}, Nuevo: {len(once_data)}")
        
        return jsonify({
            'status': 'success', 
            'message': f'Registro actualizado correctamente y guardado en {target_file}',
            'record': data
        })
        
    except Exception as e:
        print(f"ERROR en update_once_record: {str(e)}")
        # Capturar stacktrace completo para depuración
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/once/delete/<record_id>', methods=['DELETE'])
@login_required
def delete_once_record(record_id):
    """Eliminar un registro de zona once por su ID"""
    try:
        # Cargar datos actuales
        once_data = load_json_file(ZONAS_JSON.get('ONCE'))
        
        # Buscar el registro a eliminar (convertir IDs a string para comparación segura)
        record_index = next((i for i, item in enumerate(once_data) if str(item.get('id')) == str(record_id)), None)
        
        if record_index is None:
            return jsonify({"error": f"No se encontró el registro con ID {record_id}"}), 404
            
        # Guardar información del registro antes de eliminarlo (para el log)
        deleted_record = once_data[record_index]
        
        # Eliminar el registro
        once_data.pop(record_index)
        
        # Guardar cambios
        save_json_file(ZONAS_JSON.get('ONCE'), once_data)
        
        # Registrar la actividad en el log del servidor
        print(f"ACTIVIDAD: Usuario {session.get('username')} eliminó registro de Once (ID: {record_id}, Etiqueta: {deleted_record.get('etiqueta')})")
        
        return jsonify({"success": True, "message": "Registro eliminado correctamente"})
    except Exception as e:
        print(f"Error en delete_once_record: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/once/users', methods=['GET'])
@login_required
def get_once_users():
    """Obtener la lista de usuarios que han registrado datos en zona once"""
    try:
        data = load_json_file(ZONAS_JSON.get('ONCE'))
        
        # Extraer usuarios únicos
        users = sorted(list(set(item.get('usuario') for item in data if item.get('usuario'))))
        return jsonify(users)
    except Exception as e:
        print(f"Error en get_once_users: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/pendientes/once', methods=['GET'])
@login_required
def get_once_pendientes():
    """
    Obtener pendientes específicos para la zona once
    Parámetros opcionales:
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    """
    try:
        # Obtener fecha de filtro
        fecha = request.args.get('fecha', None)
        
        # Cargar datos desde el archivo de pendientes
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # Filtrar para obtener solo los pendientes de once
        once_pendientes = [
            item for item in pendientes_data
            if item.get('zona') == 'ONCE' and
            (fecha is None or item.get('fecha') == fecha)
        ]
        
        return jsonify(once_pendientes)
    except Exception as e:
        app.logger.error(f"Error en get_once_pendientes: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/once/last_update')
@login_required
def check_once_updates():
    try:
        # Recuperar timestamp del cliente
        client_timestamp = float(request.args.get('timestamp', 0))
        
        # Obtener la última fecha de modificación del archivo
        once_file = ZONAS_JSON.get('ONCE')
        last_modified = os.path.getmtime(once_file)
        
        # Verificar también pendientes
        pendientes_modified = os.path.getmtime(PENDIENTES_FILE)
        last_modified = max(last_modified, pendientes_modified)
        
        # Hay actualizaciones si el archivo se modificó después del timestamp del cliente
        has_updates = last_modified > client_timestamp / 1000  # convertir de milisegundos a segundos
        
        return jsonify({
            'hasUpdates': has_updates,
            'lastModified': last_modified
        })
    except Exception as e:
        print(f"Error checking updates: {str(e)}")
        return jsonify({'hasUpdates': False, 'error': str(e)})

@app.route('/api/once/file_status')
@login_required
def once_file_status():
    try:
        once_data = load_json_file(ZONAS_JSON.get('ONCE'), [])
        backup_exists = os.path.exists(ZONAS_JSON.get('ONCE') + '.backup')
        
        return jsonify({
            'records': len(once_data),
            'file_exists': os.path.exists(ZONAS_JSON.get('ONCE')),
            'file_size': os.path.getsize(ZONAS_JSON.get('ONCE')) if os.path.exists(ZONAS_JSON.get('ONCE')) else 0,
            'backup_exists': backup_exists,
            'last_modified': os.path.getmtime(ZONAS_JSON.get('ONCE')) if os.path.exists(ZONAS_JSON.get('ONCE')) else 0
        })
    except Exception as e:
        print(f"Error verificando estado del archivo: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
# ========================================================================
# ===== ENDPOINTS PARA ZONA GASTRONOMIA =====
# ========================================================================

@app.route('/api/gastronomia/data', methods=['GET'])
@login_required
def get_gastronomia_data():
    """
    Obtener datos de zona gastronomia con posibilidad de filtrado
    Parámetros opcionales:
    - usuario: filtra por usuario específico
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    """
    try:
        # Obtener parámetros de filtro
        usuario = request.args.get('usuario', None)
        fecha = request.args.get('fecha', None)
        
        # Cargar datos desde el archivo
        data = load_json_file(ZONAS_JSON.get('GASTRONOMIA'))
        
        # Aplicar filtros si existen
        if usuario:
            data = [item for item in data if item.get('usuario') == usuario]
        if fecha:
            data = [item for item in data if item.get('fecha') == fecha]
        
        # Ordenar por fecha (más reciente primero) y luego por ID
        data = sorted(data, key=lambda x: (x.get('fecha', ''), x.get('id', 0)), reverse=True)
        
        return jsonify(data)
    except Exception as e:
        app.logger.error(f"Error en get_gastronomia_data: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/gastronomia/record/<record_id>', methods=['GET'])
@login_required
def get_gastronomia_record(record_id):
    """Obtener un registro específico de zona gastronomia por su ID"""
    try:
        data = load_json_file(ZONAS_JSON.get('GASTRONOMIA'))
        # Intentar buscar el ID como string primero
        record = next((item for item in data if str(item.get('id')) == str(record_id)), None)
        
        if not record:
            return jsonify({"error": f"No se encontró el registro con ID {record_id}"}), 404
            
        return jsonify(record)
    except Exception as e:
        print(f"Error en get_gastronomia_record: {str(e)}")  
        return jsonify({"error": str(e)}), 500

@app.route('/api/gastronomia/update', methods=['POST'])
@login_required
def update_gastronomia_record():
    """Actualiza un registro de la zona gastronomia, moviéndolo entre gastronomia.json y pendientes.json según el estado."""
    try:
        # Obtener y validar los datos JSON del request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
            
        if 'id' not in data:
            return jsonify({'error': 'ID del registro no proporcionado'}), 400
        
        # Logs detallados para depuración
        print(f"ACTUALIZACIÓN INICIADA: ID={data['id']}, Estado={data.get('estado')}, Usuario={session.get('username')}")
            
        # Obtener las rutas a los archivos JSON
        gastronomia_json = ZONAS_JSON.get('GASTRONOMIA')
        
        if not gastronomia_json:
            return jsonify({'error': 'Configuración de zona no válida'}), 500
            
        # Cargar datos de gastronomia.json y pendientes.json
        gastronomia_data = load_json_file(gastronomia_json)
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # NUEVA VERIFICACIÓN DE SEGURIDAD
        if not gastronomia_data:
            print(f"ALERTA CRÍTICA: Archivo {gastronomia_json} está vacío o no se pudo cargar")
            # Intentar recuperar datos de la copia de seguridad
            try:
                gastronomia_data = load_json_backup(gastronomia_json, [])
            except:
                gastronomia_data = []
            if not gastronomia_data:
                return jsonify({'error': 'Error crítico al cargar datos. Contacte al administrador.'}), 500
        
        # Guardar el conteo original para verificación
        original_count = len(gastronomia_data)
        print(f"CONTEO ORIGINAL en {gastronomia_json}: {original_count} registros")
        
        # Verificar nuevo estado
        nuevo_estado = data.get('estado')
        record_found = False
        source_file = None
        source_data = None
        source_index = -1
        target_file = "desconocido" # Inicializar variable target_file
        
        # Buscar el registro primero en gastronomia.json
        for index, item in enumerate(gastronomia_data):
            if str(item.get('id')) == str(data['id']):
                record_found = True
                source_file = gastronomia_json
                source_data = gastronomia_data
                source_index = index
                break
                
        # Si no se encontró en gastronomia.json, buscarlo en pendientes.json
        if not record_found:
            for index, item in enumerate(pendientes_data):
                if str(item.get('id')) == str(data['id']):
                    record_found = True
                    source_file = PENDIENTES_FILE
                    source_data = pendientes_data
                    source_index = index
                    break
        
        if not record_found:
            return jsonify({'error': f'Registro con ID {data["id"]} no encontrado'}), 404
        
        # Obtener el registro original completo
        original_record = source_data[source_index]
        
        # Preservar campos que no se deben sobrescribir
        for key in original_record:
            if key not in data:
                data[key] = original_record[key]
        
        # Asegurar que la zona sea correcta
        data['zona'] = 'GASTRONOMIA'
        
        # Agregar fecha de actualización
        data['fecha_actualizacion'] = datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        
        # Decidir dónde guardar el registro actualizado según el nuevo estado
        if nuevo_estado == 'OK':
            # Si el estado es OK, guardar en gastronomia.json
            if source_file != gastronomia_json:
                # Eliminar de la fuente original (pendientes.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a gastronomia.json
                gastronomia_data.append(data)
                if not save_json_file(gastronomia_json, gastronomia_data):
                    return jsonify({'error': 'Error al guardar en gastronomia.json'}), 500
                    
                target_file = "gastronomia.json"
            else:
                # Actualizar en gastronomia.json
                gastronomia_data[source_index] = data
                if not save_json_file(gastronomia_json, gastronomia_data):
                    return jsonify({'error': 'Error al actualizar en gastronomia.json'}), 500
                    
                target_file = "gastronomia.json (actualizado)"
        else:
            # Si el estado es PENDIENTE, guardar en pendientes.json
            if source_file != PENDIENTES_FILE:
                # Eliminar de la fuente original (gastronomia.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a pendientes.json
                pendientes_data.append(data)
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al guardar en pendientes.json'}), 500
                    
                target_file = "pendientes.json"
            else:
                # Actualizar en pendientes.json
                pendientes_data[source_index] = data
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al actualizar en pendientes.json'}), 500
                    
                target_file = "pendientes.json (actualizado)"
        
        # VERIFICACIÓN FINAL antes de terminar
        if nuevo_estado == 'OK' and source_file == gastronomia_json:
            # Verificar que no se perdieron registros
            if len(gastronomia_data) < original_count:
                print(f"ALERTA CRÍTICA: Posible pérdida de datos en {gastronomia_json}. Original: {original_count}, Nuevo: {len(gastronomia_data)}")
        
        return jsonify({
            'status': 'success', 
            'message': f'Registro actualizado correctamente y guardado en {target_file}',
            'record': data
        })
        
    except Exception as e:
        print(f"ERROR en update_gastronomia_record: {str(e)}")
        # Capturar stacktrace completo para depuración
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/gastronomia/delete/<record_id>', methods=['DELETE'])
@login_required
def delete_gastronomia_record(record_id):
    """Eliminar un registro de zona gastronomia por su ID"""
    try:
        # Cargar datos actuales
        gastronomia_data = load_json_file(ZONAS_JSON.get('GASTRONOMIA'))
        
        # Buscar el registro a eliminar (convertir IDs a string para comparación segura)
        record_index = next((i for i, item in enumerate(gastronomia_data) if str(item.get('id')) == str(record_id)), None)
        
        if record_index is None:
            return jsonify({"error": f"No se encontró el registro con ID {record_id}"}), 404
            
        # Guardar información del registro antes de eliminarlo (para el log)
        deleted_record = gastronomia_data[record_index]
        
        # Eliminar el registro
        gastronomia_data.pop(record_index)
        
        # Guardar cambios
        save_json_file(ZONAS_JSON.get('GASTRONOMIA'), gastronomia_data)
        
        # Registrar la actividad en el log del servidor
        print(f"ACTIVIDAD: Usuario {session.get('username')} eliminó registro de Gastronomía (ID: {record_id}, Etiqueta: {deleted_record.get('etiqueta')})")
        
        return jsonify({"success": True, "message": "Registro eliminado correctamente"})
    except Exception as e:
        print(f"Error en delete_gastronomia_record: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/gastronomia/users', methods=['GET'])
@login_required
def get_gastronomia_users():
    """Obtener la lista de usuarios que han registrado datos en zona gastronomia"""
    try:
        data = load_json_file(ZONAS_JSON.get('GASTRONOMIA'))
        
        # Extraer usuarios únicos
        users = sorted(list(set(item.get('usuario') for item in data if item.get('usuario'))))
        return jsonify(users)
    except Exception as e:
        print(f"Error en get_gastronomia_users: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/pendientes/gastronomia', methods=['GET'])
@login_required
def get_gastronomia_pendientes():
    """
    Obtener pendientes específicos para la zona gastronomia
    Parámetros opcionales:
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    """
    try:
        # Obtener fecha de filtro
        fecha = request.args.get('fecha', None)
        
        # Cargar datos desde el archivo de pendientes
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # Filtrar para obtener solo los pendientes de gastronomia
        gastronomia_pendientes = [
            item for item in pendientes_data
            if item.get('zona') == 'GASTRONOMIA' and
            (fecha is None or item.get('fecha') == fecha)
        ]
        
        return jsonify(gastronomia_pendientes)
    except Exception as e:
        app.logger.error(f"Error en get_gastronomia_pendientes: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/gastronomia/last_update')
@login_required
def check_gastronomia_updates():
    try:
        # Recuperar timestamp del cliente
        client_timestamp = float(request.args.get('timestamp', 0))
        
        # Obtener la última fecha de modificación del archivo
        gastronomia_file = ZONAS_JSON.get('GASTRONOMIA')
        last_modified = os.path.getmtime(gastronomia_file)
        
        # Verificar también pendientes
        pendientes_modified = os.path.getmtime(PENDIENTES_FILE)
        last_modified = max(last_modified, pendientes_modified)
        
        # Hay actualizaciones si el archivo se modificó después del timestamp del cliente
        has_updates = last_modified > client_timestamp / 1000  # convertir de milisegundos a segundos
        
        return jsonify({
            'hasUpdates': has_updates,
            'lastModified': last_modified
        })
    except Exception as e:
        print(f"Error checking updates: {str(e)}")
        return jsonify({'hasUpdates': False, 'error': str(e)})

@app.route('/api/gastronomia/file_status')
@login_required
def gastronomia_file_status():
    try:
        gastronomia_data = load_json_file(ZONAS_JSON.get('GASTRONOMIA'), [])
        backup_exists = os.path.exists(ZONAS_JSON.get('GASTRONOMIA') + '.backup')
        
        return jsonify({
            'records': len(gastronomia_data),
            'file_exists': os.path.exists(ZONAS_JSON.get('GASTRONOMIA')),
            'file_size': os.path.getsize(ZONAS_JSON.get('GASTRONOMIA')) if os.path.exists(ZONAS_JSON.get('GASTRONOMIA')) else 0,
            'backup_exists': backup_exists,
            'last_modified': os.path.getmtime(ZONAS_JSON.get('GASTRONOMIA')) if os.path.exists(ZONAS_JSON.get('GASTRONOMIA')) else 0
        })
    except Exception as e:
        print(f"Error verificando estado del archivo: {str(e)}")
        return jsonify({'error': str(e)}), 500

# ========================================================================
# ===== ENDPOINTS PARA ZONA RETIRO =====
# ========================================================================

@app.route('/api/retiro/data', methods=['GET'])
@login_required
def get_retiro_data():
    """
    Obtener datos de zona retiro con posibilidad de filtrado
    Parámetros opcionales:
    - usuario: filtra por usuario específico
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    """
    try:
        # Obtener parámetros de filtro
        usuario = request.args.get('usuario', None)
        fecha = request.args.get('fecha', None)
        
        # Cargar datos desde el archivo
        data = load_json_file(ZONAS_JSON.get('RETIRO'))
        
        # Aplicar filtros si existen
        if usuario:
            data = [item for item in data if item.get('usuario') == usuario]
        if fecha:
            data = [item for item in data if item.get('fecha') == fecha]
        
        # Ordenar por fecha (más reciente primero) y luego por ID
        data = sorted(data, key=lambda x: (x.get('fecha', ''), x.get('id', 0)), reverse=True)
        
        return jsonify(data)
    except Exception as e:
        app.logger.error(f"Error en get_retiro_data: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/retiro/record/<record_id>', methods=['GET'])
@login_required
def get_retiro_record(record_id):
    """Obtener un registro específico de zona retiro por su ID"""
    try:
        data = load_json_file(ZONAS_JSON.get('RETIRO'))
        # Intentar buscar el ID como string primero
        record = next((item for item in data if str(item.get('id')) == str(record_id)), None)
        
        if not record:
            return jsonify({"error": f"No se encontró el registro con ID {record_id}"}), 404
            
        return jsonify(record)
    except Exception as e:
        print(f"Error en get_retiro_record: {str(e)}")  
        return jsonify({"error": str(e)}), 500

@app.route('/api/retiro/update', methods=['POST'])
@login_required
def update_retiro_record():
    """Actualiza un registro de la zona retiro, moviéndolo entre retiro.json y pendientes.json según el estado."""
    try:
        # Obtener y validar los datos JSON del request
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos'}), 400
            
        if 'id' not in data:
            return jsonify({'error': 'ID del registro no proporcionado'}), 400
        
        # Logs detallados para depuración
        print(f"ACTUALIZACIÓN INICIADA: ID={data['id']}, Estado={data.get('estado')}, Usuario={session.get('username')}")
            
        # Obtener las rutas a los archivos JSON
        retiro_json = ZONAS_JSON.get('RETIRO')
        
        if not retiro_json:
            return jsonify({'error': 'Configuración de zona no válida'}), 500
            
        # Cargar datos de retiro.json y pendientes.json
        retiro_data = load_json_file(retiro_json)
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # NUEVA VERIFICACIÓN DE SEGURIDAD
        if not retiro_data:
            print(f"ALERTA CRÍTICA: Archivo {retiro_json} está vacío o no se pudo cargar")
            # Intentar recuperar datos de la copia de seguridad
            try:
                retiro_data = load_json_backup(retiro_json, [])
            except:
                retiro_data = []
            if not retiro_data:
                return jsonify({'error': 'Error crítico al cargar datos. Contacte al administrador.'}), 500
        
        # Guardar el conteo original para verificación
        original_count = len(retiro_data)
        print(f"CONTEO ORIGINAL en {retiro_json}: {original_count} registros")
        
        # Verificar nuevo estado
        nuevo_estado = data.get('estado')
        record_found = False
        source_file = None
        source_data = None
        source_index = -1
        target_file = "desconocido" # Inicializar variable target_file
        
        # Buscar el registro primero en retiro.json
        for index, item in enumerate(retiro_data):
            if str(item.get('id')) == str(data['id']):
                record_found = True
                source_file = retiro_json
                source_data = retiro_data
                source_index = index
                break
                
        # Si no se encontró en retiro.json, buscarlo en pendientes.json
        if not record_found:
            for index, item in enumerate(pendientes_data):
                if str(item.get('id')) == str(data['id']):
                    record_found = True
                    source_file = PENDIENTES_FILE
                    source_data = pendientes_data
                    source_index = index
                    break
        
        if not record_found:
            return jsonify({'error': f'Registro con ID {data["id"]} no encontrado'}), 404
        
        # Obtener el registro original completo
        original_record = source_data[source_index]
        
        # Preservar campos que no se deben sobrescribir
        for key in original_record:
            if key not in data:
                data[key] = original_record[key]
        
        # Asegurar que la zona sea correcta
        data['zona'] = 'RETIRO'
        
        # Agregar fecha de actualización
        data['fecha_actualizacion'] = datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
        
        # Decidir dónde guardar el registro actualizado según el nuevo estado
        if nuevo_estado == 'OK':
            # Si el estado es OK, guardar en retiro.json
            if source_file != retiro_json:
                # Eliminar de la fuente original (pendientes.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a retiro.json
                retiro_data.append(data)
                if not save_json_file(retiro_json, retiro_data):
                    return jsonify({'error': 'Error al guardar en retiro.json'}), 500
                    
                target_file = "retiro.json"
            else:
                # Actualizar en retiro.json
                retiro_data[source_index] = data
                if not save_json_file(retiro_json, retiro_data):
                    return jsonify({'error': 'Error al actualizar en retiro.json'}), 500
                    
                target_file = "retiro.json (actualizado)"
        else:
            # Si el estado es PENDIENTE, guardar en pendientes.json
            if source_file != PENDIENTES_FILE:
                # Eliminar de la fuente original (retiro.json)
                source_data.pop(source_index)
                if not save_json_file(source_file, source_data):
                    return jsonify({'error': f'Error al actualizar {source_file}'}), 500
                
                # Agregar a pendientes.json
                pendientes_data.append(data)
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al guardar en pendientes.json'}), 500
                    
                target_file = "pendientes.json"
            else:
                # Actualizar en pendientes.json
                pendientes_data[source_index] = data
                if not save_json_file(PENDIENTES_FILE, pendientes_data):
                    return jsonify({'error': 'Error al actualizar en pendientes.json'}), 500
                    
                target_file = "pendientes.json (actualizado)"
        
        # VERIFICACIÓN FINAL antes de terminar
        if nuevo_estado == 'OK' and source_file == retiro_json:
            # Verificar que no se perdieron registros
            if len(retiro_data) < original_count:
                print(f"ALERTA CRÍTICA: Posible pérdida de datos en {retiro_json}. Original: {original_count}, Nuevo: {len(retiro_data)}")
        
        return jsonify({
            'status': 'success', 
            'message': f'Registro actualizado correctamente y guardado en {target_file}',
            'record': data
        })
        
    except Exception as e:
        print(f"ERROR en update_retiro_record: {str(e)}")
        # Capturar stacktrace completo para depuración
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/retiro/delete/<record_id>', methods=['DELETE'])
@login_required
def delete_retiro_record(record_id):
    """Eliminar un registro de zona retiro por su ID"""
    try:
        # Cargar datos actuales
        retiro_data = load_json_file(ZONAS_JSON.get('RETIRO'))
        
        # Buscar el registro a eliminar (convertir IDs a string para comparación segura)
        record_index = next((i for i, item in enumerate(retiro_data) if str(item.get('id')) == str(record_id)), None)
        
        if record_index is None:
            return jsonify({"error": f"No se encontró el registro con ID {record_id}"}), 404
            
        # Guardar información del registro antes de eliminarlo (para el log)
        deleted_record = retiro_data[record_index]
        
        # Eliminar el registro
        retiro_data.pop(record_index)
        
        # Guardar cambios
        save_json_file(ZONAS_JSON.get('RETIRO'), retiro_data)
        
        # Registrar la actividad en el log del servidor
        print(f"ACTIVIDAD: Usuario {session.get('username')} eliminó registro de Retiro (ID: {record_id}, Etiqueta: {deleted_record.get('etiqueta')})")
        
        return jsonify({"success": True, "message": "Registro eliminado correctamente"})
    except Exception as e:
        print(f"Error en delete_retiro_record: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/retiro/users', methods=['GET'])
@login_required
def get_retiro_users():
    """Obtener la lista de usuarios que han registrado datos en zona retiro"""
    try:
        data = load_json_file(ZONAS_JSON.get('RETIRO'))
        
        # Extraer usuarios únicos
        users = sorted(list(set(item.get('usuario') for item in data if item.get('usuario'))))
        return jsonify(users)
    except Exception as e:
        print(f"Error en get_retiro_users: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/pendientes/retiro', methods=['GET'])
@login_required
def get_retiro_pendientes():
    """
    Obtener pendientes específicos para la zona retiro
    Parámetros opcionales:
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    """
    try:
        # Obtener fecha de filtro
        fecha = request.args.get('fecha', None)
        
        # Cargar datos desde el archivo de pendientes
        pendientes_data = load_json_file(PENDIENTES_FILE)
        
        # Filtrar para obtener solo los pendientes de retiro
        retiro_pendientes = [
            item for item in pendientes_data
            if item.get('zona') == 'RETIRO' and
            (fecha is None or item.get('fecha') == fecha)
        ]
        
        return jsonify(retiro_pendientes)
    except Exception as e:
        app.logger.error(f"Error en get_retiro_pendientes: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/retiro/last_update')
@login_required
def check_retiro_updates():
    try:
        # Recuperar timestamp del cliente
        client_timestamp = float(request.args.get('timestamp', 0))
        
        # Obtener la última fecha de modificación del archivo
        retiro_file = ZONAS_JSON.get('RETIRO')
        last_modified = os.path.getmtime(retiro_file)
        
        # Verificar también pendientes
        pendientes_modified = os.path.getmtime(PENDIENTES_FILE)
        last_modified = max(last_modified, pendientes_modified)
        
        # Hay actualizaciones si el archivo se modificó después del timestamp del cliente
        has_updates = last_modified > client_timestamp / 1000  # convertir de milisegundos a segundos
        
        return jsonify({
            'hasUpdates': has_updates,
            'lastModified': last_modified
        })
    except Exception as e:
        print(f"Error checking updates: {str(e)}")
        return jsonify({'hasUpdates': False, 'error': str(e)})

@app.route('/api/retiro/file_status')
@login_required
def retiro_file_status():
    try:
        retiro_data = load_json_file(ZONAS_JSON.get('RETIRO'), [])
        backup_exists = os.path.exists(ZONAS_JSON.get('RETIRO') + '.backup')
        
        return jsonify({
            'records': len(retiro_data),
            'file_exists': os.path.exists(ZONAS_JSON.get('RETIRO')),
            'file_size': os.path.getsize(ZONAS_JSON.get('RETIRO')) if os.path.exists(ZONAS_JSON.get('RETIRO')) else 0,
            'backup_exists': backup_exists,
            'last_modified': os.path.getmtime(ZONAS_JSON.get('RETIRO')) if os.path.exists(ZONAS_JSON.get('RETIRO')) else 0
        })
    except Exception as e:
        print(f"Error verificando estado del archivo: {str(e)}")
        return jsonify({'error': str(e)}), 500


# ========================================================================
# ===== RUTAS DE STOCK =====
# ========================================================================


@app.route('/stock')
@login_required
@page_access_required('stock')
def stock():
    """Página para la carga de stock"""
    # Obtener parámetros de URL para pre-cargar el formulario
    etiqueta = request.args.get('etiqueta', '')
    periodo = request.args.get('periodo', '')
    fecha = request.args.get('fecha', '')
    zona = request.args.get('zona', '')
    
    return render_template('stock.html', 
                          preload_etiqueta=etiqueta,
                          preload_periodo=periodo,
                          preload_fecha=fecha,
                          preload_zona=zona)


@app.route('/submit_stock', methods=['POST'])
@login_required
@page_access_required('stock')
def submit_stock():
    try:
        data = request.form
        print(f"Usuario en sesión: {session.get('username', 'No definido')}")
        print(f"Datos recibidos en stock: {dict(data)}")

        # Crear el nuevo registro
        nuevo_registro = {
            'id': datetime.now(TIMEZONE).strftime('%Y%m%d%H%M%S'),
            'fecha_creacion': datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S'),
            'usuario': session['username'],
            'fecha': data.get('fecha'),
            'periodo': data.get('periodo'),
            'zona': data.get('zona'),
            'etiqueta': data.get('etiqueta')
        }

        # Validar campos requeridos
        required_fields = ['fecha', 'periodo', 'zona', 'etiqueta']
        for field in required_fields:
            if not nuevo_registro.get(field) or str(nuevo_registro.get(field)).strip() == '':
                return jsonify({
                    'status': 'error',
                    'message': f'Campo requerido faltante o vacío: {field}'
                }), 400

        # Verificar que el periodo sea válido
        valid_periods = ['10', '20', '30', '31']
        if nuevo_registro['periodo'] not in valid_periods:
            return jsonify({
                'status': 'error',
                'message': 'Periodo no válido. Debe ser 10, 20, 30 o 31'
            }), 400

        # Verificar duplicados en stock.json
        stock_data = load_json_file(STOCK_FILE, [])
        
        # Función para verificar si es duplicado
        def es_duplicado(registro):
            return (
                str(registro.get('etiqueta', '')).strip() == str(nuevo_registro['etiqueta']).strip() and
                str(registro.get('fecha', '')).strip() == str(nuevo_registro['fecha']).strip() and
                str(registro.get('periodo', '')).strip() == str(nuevo_registro['periodo']).strip() and
                str(registro.get('zona', '')).strip() == str(nuevo_registro['zona']).strip()
            )

        # Buscar duplicados
        duplicado = next((reg for reg in stock_data if es_duplicado(reg)), None)
        
        if duplicado:
            mensaje = (
                f"Ya existe un registro de stock para la misma etiqueta, fecha, periodo y zona."
            )
            print(f"DUPLICADO DETECTADO: {mensaje}")
            print(f"Registro duplicado encontrado: {duplicado}")
            
            return jsonify({
                'status': 'error',
                'message': mensaje,
                'duplicateData': {
                    'fecha_creacion': duplicado.get('fecha_creacion', 'No disponible'),
                    'usuario': duplicado.get('usuario', 'No disponible'),
                    'id': duplicado.get('id', 'No disponible')
                }
            }), 409  # 409 Conflict

        # Si no hay duplicados, proceder con el guardado
        stock_data.append(nuevo_registro)
        
        if not save_json_file(STOCK_FILE, stock_data):
            raise Exception('Error al guardar en archivo de stock')
            
        print(f"REGISTRO DE STOCK GUARDADO: ID: {nuevo_registro['id']}")

        return jsonify({
            'status': 'success',
            'message': 'Registro de stock guardado correctamente',
            'data': {
                'id': nuevo_registro['id'],
                'zona': nuevo_registro['zona'],
                'etiqueta': nuevo_registro['etiqueta'],
                'fecha_creacion': nuevo_registro['fecha_creacion']
            }
        })

    except Exception as e:
        error_msg = f"ERROR en submit_stock: {str(e)}"
        print(error_msg)
        print(f"Tipo de error: {type(e).__name__}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        
        return jsonify({
            'status': 'error',
            'message': f'Error interno del servidor: {str(e)}'
        }), 500

@app.route('/api/stock/data', methods=['GET'])
@login_required
@page_access_required('stock')
def get_stock_data():
    """
    Obtener datos de stock con posibilidad de filtrado
    Parámetros opcionales:
    - usuario: filtra por usuario específico
    - fecha: filtra por fecha específica (formato YYYY-MM-DD)
    - zona: filtra por zona específica
    - etiqueta: filtra por etiqueta específica
    - periodo: filtra por periodo específico
    """
    try:
        # Obtener parámetros de filtro
        usuario = request.args.get('usuario', None)
        fecha = request.args.get('fecha', None)
        zona = request.args.get('zona', None)
        etiqueta = request.args.get('etiqueta', None)
        periodo = request.args.get('periodo', None)
        
        # Cargar datos desde el archivo
        data = load_json_file(STOCK_FILE, [])
        
        # Aplicar filtros si existen
        if usuario:
            data = [item for item in data if item.get('usuario') == usuario]
        if fecha:
            data = [item for item in data if item.get('fecha') == fecha]
        if zona:
            data = [item for item in data if item.get('zona') == zona]
        if etiqueta:
            data = [item for item in data if item.get('etiqueta') == etiqueta]
        if periodo:
            data = [item for item in data if item.get('periodo') == periodo]
        
        # Ordenar por fecha (más reciente primero) y luego por ID
        data = sorted(data, key=lambda x: (x.get('fecha', ''), x.get('id', 0)), reverse=True)
        
        return jsonify(data)
    except Exception as e:
        app.logger.error(f"Error en get_stock_data: {str(e)}")
        return jsonify({"error": str(e)}), 500

# Asegurar que el archivo de stock exista durante la inicialización
def init_stock_file():
    """Inicializa el archivo JSON para stock si no existe"""
    try:
        if not os.path.exists(STOCK_FILE):
            save_json_file(STOCK_FILE, [])
            print(f"Archivo de stock inicializado correctamente en {STOCK_FILE}")
    except Exception as e:
        print(f"Error inicializando archivo de stock: {str(e)}")

# Modificar la función init_app para incluir la inicialización del archivo de stock
def init_app():
    """Inicialización de la aplicación"""
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        
        # Asegurar que el archivo users.json exista
        if not os.path.exists(USERS_FILE):
            save_json_file(USERS_FILE, [])
        
        init_admin_user()  # Crear usuarios iniciales
        create_demo_user() # Crear usuario demo
        migrar_registros()
        
        if not os.path.exists(REGISTROS_FILE):
            with open(REGISTROS_FILE, 'w', encoding='utf-8') as f:
                json.dump([], f)
            print(f"Creado nuevo archivo de registros en {REGISTROS_FILE}")
        
        init_transferencias()
        init_stock_file()  # Inicializar archivo de stock
        
        # Iniciar el sistema de backup automático
        init_backup_scheduler()
        
        print("Inicialización completada exitosamente")
    except Exception as e:
        print(f"Error en la inicialización: {str(e)}")


# ========================================================================
# ===== APIs PARA VALIDACIÓN DE STOCK =====
# ========================================================================

@app.route('/api/stock/status', methods=['GET'])
@login_required
def get_stock_status():
    """
    Obtiene el estado del stock para una zona específica en un mes y año
    Parámetros:
    - zona: nombre de la zona
    - year: año (YYYY) - opcional, usa el mes de control si no se especifica
    - month: mes (1-12) - opcional, usa el mes de control si no se especifica
    
    Retorna un objeto con el estado de cada período (10, 20, 30/31)
    """
    try:
        zona = request.args.get('zona', '')
        
        # Intentar obtener año y mes de los parámetros
        try:
            year = int(request.args.get('year')) if request.args.get('year') else None
            month = int(request.args.get('month')) if request.args.get('month') else None
        except (ValueError, TypeError):
            year = None
            month = None
        
        # Si no se especificó año o mes, usar el mes de control
        if year is None or month is None:
            # Cargar mes de control
            control_month = load_system_config('stock_control_month')
            
            if control_month:
                year = year or control_month.get('year')
                month = month or control_month.get('month')
            else:
                # Fallback a la variable global
                global STOCK_CONTROL_MONTH
                year = year or STOCK_CONTROL_MONTH.get('year')
                month = month or STOCK_CONTROL_MONTH.get('month')
        
        # Si aún no tenemos año o mes, usar el actual
        if not year or not month:
            now = datetime.now(TIMEZONE)
            year = now.year
            month = now.month
            
        if not zona:
            return jsonify({'error': 'Se requiere el parámetro zona'}), 400
        
        
        # Cargar datos de stock
        stock_data = load_json_file(STOCK_FILE, [])
        
        # Filtrar por zona y fecha (mes/año)
        filtered_data = [item for item in stock_data if item.get('zona') == zona]
        
        # Determinar el número de etiquetas esperadas según la zona
        expected_etiquetas = []
        if zona == 'ZONA SUR':
            # Usar la lista de etiquetas de zona sur del archivo frontend
            expected_etiquetas = [
                "ZT03", "ZT18", "ZT19", "ZT20", "ZI27", "ZI28", "ZI29", "ZI31", "ZI32", "ZI33", 
                "BR04", "ZJ04", "ZJ05", "ZJ06", "ZJ10", "ZJ11", "ZJ14", "ZJ17", "ZI04", "ZI06", 
                "ZI30", "ZT33", "ZT34", "ZI01", "ZI02", "ZI03", "ZI10", "ZI11", "ZI14", "ZI18", 
                "ZI23", "ZF05", "ZF08", "ZF18", "ZF19", "ZF20", "CL02"
            ]
        elif zona == 'CONSTITUCION':
            # Lista de etiquetas de Constitución
            expected_etiquetas = [
                "BA01", "BA04", "BA23", "BA24", "BA25", "BA26", "BA27", 
                "BA28", "BA29", "BA30", "BA31", "BA32", "BA33", "BF03"
            ]
        elif zona == 'ONCE':
            # Lista de etiquetas de Once
            expected_etiquetas = [
                "ON01", "ON02", "ON03", "ON04", "ON05", "ON06", "ON07",
                "ON08", "ON09", "ON10", "ON11", "ON12", "ON18", "ON13",
                "ON14", "ON15", "ON16", "ON17", "ON19", "ON20", "ON21",
                "ON22", "ON23", "ON24", "ON25", "ON26", "ON27", "ON28"
            ]
        # Añadir más zonas según sea necesario
        
        # Inicializar estado para cada período
        periods_status = {'10': 'missing', '20': 'missing', '30': 'missing'}
        
        # Para cada período (10, 20, 30/31)
        for period in ['10', '20', '30']:
            # Filtrar registros por período
            period_records = [item for item in filtered_data if item.get('periodo') == period]
            
            # Filtrar por mes/año
            period_records_in_date = []
            for item in period_records:
                fecha = item.get('fecha', '')
                if fecha:
                    # Convertir fecha a objeto datetime
                    try:
                        fecha_date = datetime.strptime(fecha, '%Y-%m-%d')
                        if fecha_date.year == year and fecha_date.month == month:
                            period_records_in_date.append(item)
                    except ValueError:
                        # Si la fecha no está en formato esperado, ignorar
                        continue
            
            # Contar etiquetas únicas registradas en este período
            registered_etiquetas = set(item.get('etiqueta') for item in period_records_in_date)
            
            # Determinar el estado según la proporción de etiquetas registradas
            if len(registered_etiquetas) == 0:
                periods_status[period] = 'missing'  # No hay registros
            elif len(registered_etiquetas) >= len(expected_etiquetas):
                periods_status[period] = 'complete'  # Todas las etiquetas registradas
            elif len(registered_etiquetas) >= len(expected_etiquetas) / 2:
                periods_status[period] = 'partial'   # Al menos la mitad registradas
            else:
                periods_status[period] = 'partial'   # Menos de la mitad registradas
        
        return jsonify(periods_status)
    except Exception as e:
        app.logger.error(f"Error en get_stock_status: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/stock/details', methods=['GET'])
@login_required
def get_stock_details():
    """
    Obtiene los detalles del stock para una zona específica, período, mes y año
    Parámetros:
    - zona: nombre de la zona
    - period: período (10, 20, 30)
    - year: año (YYYY)
    - month: mes (1-12)
    
    Retorna una lista de etiquetas con su estado (registrado o no)
    """
    try:
        zona = request.args.get('zona', '')
        period = request.args.get('period', '')
        year = int(request.args.get('year', datetime.now(TIMEZONE).year))
        month = int(request.args.get('month', datetime.now(TIMEZONE).month))
        
        if not zona or not period:
            return jsonify({'error': 'Se requieren los parámetros zona y period'}), 400
        
        # Cargar datos de stock
        stock_data = load_json_file(STOCK_FILE, [])
        
        # Filtrar por zona, período y fecha (mes/año)
        filtered_data = []
        for item in stock_data:
            if item.get('zona') != zona or item.get('periodo') != period:
                continue
                
            fecha = item.get('fecha', '')
            if not fecha:
                continue
                
            try:
                fecha_date = datetime.strptime(fecha, '%Y-%m-%d')
                if fecha_date.year == year and fecha_date.month == month:
                    filtered_data.append(item)
            except ValueError:
                continue
        
        # Determinar el número de etiquetas esperadas según la zona
        expected_etiquetas = []
        if zona == 'ZONA SUR':
            # Usar la lista de etiquetas de zona sur del archivo frontend
            expected_etiquetas = [
                "ZT03", "ZT18", "ZT19", "ZT20", "ZI27", "ZI28", "ZI29", "ZI31", "ZI32", "ZI33", 
                "BR04", "ZJ04", "ZJ05", "ZJ06", "ZJ10", "ZJ11", "ZJ14", "ZJ17", "ZI04", "ZI06", 
                "ZI30", "ZT33", "ZT34", "ZI01", "ZI02", "ZI03", "ZI10", "ZI11", "ZI14", "ZI18", 
                "ZI23", "ZF05", "ZF08", "ZF18", "ZF19", "ZF20", "CL02"
            ]
        elif zona == 'CONSTITUCION':
            # Lista de etiquetas de Constitución
            expected_etiquetas = [
                "BA01", "BA04", "BA23", "BA24", "BA25", "BA26", "BA27", 
                "BA28", "BA29", "BA30", "BA31", "BA32", "BA33", "BF03"
            ]
        elif zona == 'ONCE':
            # Lista de etiquetas de Once
            expected_etiquetas = [
                "ON01", "ON02", "ON03", "ON04", "ON05", "ON06", "ON07",
                "ON08", "ON09", "ON10", "ON11", "ON12", "ON18", "ON13",
                "ON14", "ON15", "ON16", "ON17", "ON19", "ON20", "ON21",
                "ON22", "ON23", "ON24", "ON25", "ON26", "ON27", "ON28"
            ]
        # Añadir más zonas según sea necesario
        
        # Contar etiquetas únicas registradas
        registered_etiquetas = set(item.get('etiqueta') for item in filtered_data)
        
        # Construir respuesta con estado para cada etiqueta
        etiquetas_status = []
        for etiqueta in expected_etiquetas:
            etiquetas_status.append({
                'nombre': etiqueta,
                'registrado': etiqueta in registered_etiquetas
            })
        
        return jsonify({
            'zona': zona,
            'periodo': period,
            'year': year,
            'month': month,
            'etiquetas': etiquetas_status
        })
    except Exception as e:
        app.logger.error(f"Error en get_stock_details: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/zonas/lista', methods=['GET'])
@login_required
def get_zonas_lista():
    """Obtiene la lista de todas las zonas disponibles"""
    try:
        # Lista estática de zonas (podría venir de una configuración o base de datos)
        zonas = [
            {"nombre": "ZONA SUR", "activa": True},
            {"nombre": "CONSTITUCION", "activa": True},
            {"nombre": "ONCE", "activa": True},
            {"nombre": "BIMBO", "activa": True},
            {"nombre": "RETIRO", "activa": True},
            {"nombre": "TBA", "activa": True},
            {"nombre": "AMBULANTE", "activa": True}
        ]
        if request.args.get('activa', 'false').lower() == 'true':
            zonas = [zona for zona in zonas if zona.get('activa')]
        return jsonify(zonas)
    except Exception as e:
        app.logger.error(f"Error en get_zonas_lista: {str(e)}")
        return jsonify({"error": str(e)}), 500

# Global variable to store the current control month (fallback to current month)
STOCK_CONTROL_MONTH = {
    'year': datetime.now(TIMEZONE).year,
    'month': datetime.now(TIMEZONE).month
}

# API endpoint to set the control month for stock validation
@app.route('/api/stock/set_control_month', methods=['POST'])
@login_required
def set_stock_control_month():
    """
    Establece el mes de control para la validación de stock
    Requiere rol de administrador
    """
    # Verificar que el usuario sea administrador
    if session.get('role') != 'admin':
        return jsonify({
            'status': 'error',
            'message': 'Se requieren permisos de administrador para esta acción'
        }), 403
    
    try:
        data = request.json
        year = int(data.get('year', datetime.now(TIMEZONE).year))
        month = int(data.get('month', datetime.now(TIMEZONE).month))
        
        # Validar año y mes
        if not (2000 <= year <= 2100 and 1 <= month <= 12):
            raise ValueError('Año o mes fuera de rango')
        
        # Guardar en variable global
        global STOCK_CONTROL_MONTH
        STOCK_CONTROL_MONTH = {
            'year': year,
            'month': month
        }
        
        # También guardar en el sistema de configuración
        save_system_config('stock_control_month', STOCK_CONTROL_MONTH)
        
        return jsonify({
            'status': 'success',
            'message': 'Mes de control actualizado correctamente',
            'year': year,
            'month': month
        })
    except Exception as e:
        app.logger.error(f"Error en set_stock_control_month: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Error: {str(e)}'
        }), 500

# API endpoint to get the current control month
@app.route('/api/stock/control_month', methods=['GET'])
@login_required
def get_stock_control_month():
    """Obtiene el mes de control actual para la validación de stock"""
    try:
        # Intentar cargar desde el sistema de configuración
        config = load_system_config('stock_control_month')
        if config:
            return jsonify(config)
        
        # Si no hay configuración, devolver el valor de la variable global
        global STOCK_CONTROL_MONTH
        return jsonify(STOCK_CONTROL_MONTH)
    except Exception as e:
        app.logger.error(f"Error en get_stock_control_month: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Error: {str(e)}'
        }), 500

# Funciones auxiliares para guardar y cargar configuración del sistema
def save_system_config(key, value):
    """Guarda una configuración de sistema en el archivo de configuración"""
    try:
        CONFIG_FILE = os.path.join(DATA_DIR, 'system_config.json')
        config = {}
        
        # Cargar configuración existente si existe
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
        
        # Actualizar configuración
        config[key] = value
        
        # Guardar configuración
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2)
            
        return True
    except Exception as e:
        app.logger.error(f"Error guardando configuración de sistema: {str(e)}")
        return False

def load_system_config(key):
    """Carga una configuración de sistema del archivo de configuración"""
    try:
        CONFIG_FILE = os.path.join(DATA_DIR, 'system_config.json')
        
        # Verificar si el archivo existe
        if not os.path.exists(CONFIG_FILE):
            return None
        
        # Cargar configuración
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        # Devolver el valor si existe
        return config.get(key)
    except Exception as e:
        app.logger.error(f"Error cargando configuración de sistema: {str(e)}")
        return None

# ========================================================================
# ===== CAPACIDAD DEL SERVIDOR =====
# ========================================================================


# Historial para gráficos
SYSTEM_HISTORY = {
    'cpu': [],
    'memory': [],
    'requests_per_minute': [],
    'response_time': [],
    'last_update': time.time()
}

def get_status_level(value, thresholds=None):
    """Determina el nivel de estado basado en porcentaje"""
    if thresholds is None:
        thresholds = {'warning': 60, 'danger': 80}
    
    if value >= thresholds['danger']:
        return 'danger'
    elif value >= thresholds['warning']:
        return 'warning'
    else:
        return 'success'

def format_bytes(size):
    """Formatea bytes a formato legible"""
    power = 2**10
    n = 0
    units = {0: 'B', 1: 'KB', 2: 'MB', 3: 'GB', 4: 'TB'}
    while size > power:
        size /= power
        n += 1
    return f"{round(size, 2)} {units[n]}"

def get_system_stats():
    """Obtiene estadísticas del sistema operativo"""
    # Actualizar historial solo cada 5 segundos
    current_time = time.time()
    update_history = (current_time - SYSTEM_HISTORY['last_update']) > 5
    
    # CPU
    cpu_percent = psutil.cpu_percent(interval=0.5)
    cpu_cores = psutil.cpu_count()
    cpu_per_core = psutil.cpu_percent(interval=0.1, percpu=True)
    
    # Memoria
    memory = psutil.virtual_memory()
    
    # Disco
    disk = psutil.disk_usage('/')
    
    # Sistema
    boot_time = psutil.boot_time()
    uptime_seconds = time.time() - boot_time
    
    # Actualizar historial para gráficos
    if update_history:
        timestamp = datetime.now().strftime('%H:%M:%S')
        
        # Limitar a 60 puntos (5 minutos con intervalo de 5 segundos)
        SYSTEM_HISTORY['cpu'] = SYSTEM_HISTORY['cpu'][-59:] + [{
            'time': timestamp,
            'value': cpu_percent
        }]
        
        SYSTEM_HISTORY['memory'] = SYSTEM_HISTORY['memory'][-59:] + [{
            'time': timestamp,
            'value': memory.percent
        }]
        
        # Estimar solicitudes por minuto (simulado)
        if not SYSTEM_HISTORY.get('requests_per_minute'):
            SYSTEM_HISTORY['requests_per_minute'] = []
        
        # Valor basado en hora del día para simular cargas variables
        hour = datetime.now().hour
        base_load = 20  # Base mínima de solicitudes
        
        # Mayor carga en horario laboral
        if 9 <= hour < 18:
            additional_load = random.randint(10, 50)
        else:
            additional_load = random.randint(5, 20)
        
        requests_per_min = base_load + additional_load
        
        SYSTEM_HISTORY['requests_per_minute'] = SYSTEM_HISTORY['requests_per_minute'][-59:] + [{
            'time': timestamp,
            'value': requests_per_min
        }]
        
        # Estimar tiempo de respuesta (simulado - fluctuante pero relacionado con carga)
        if not SYSTEM_HISTORY.get('response_time'):
            SYSTEM_HISTORY['response_time'] = []
        
        base_response = 100  # ms
        response_factor = cpu_percent / 100 * 300  # Hasta 300ms adicionales basados en CPU
        response_jitter = random.randint(-50, 50)  # Algo de variabilidad
        
        response_time = max(50, base_response + response_factor + response_jitter)
        
        SYSTEM_HISTORY['response_time'] = SYSTEM_HISTORY['response_time'][-59:] + [{
            'time': timestamp,
            'value': response_time
        }]
        
        SYSTEM_HISTORY['last_update'] = current_time
    
    # Formatear tiempo de actividad
    uptime = str(timedelta(seconds=int(uptime_seconds)))
    
    return {
        'cpu': {
            'percent': cpu_percent,
            'cores': cpu_cores,
            'per_core': cpu_per_core,
            'status': get_status_level(cpu_percent)
        },
        'memory': {
            'percent': memory.percent,
            'used': format_bytes(memory.used),
            'total': format_bytes(memory.total),
            'status': get_status_level(memory.percent)
        },
        'disk': {
            'percent': disk.percent,
            'used': format_bytes(disk.used),
            'total': format_bytes(disk.total),
            'status': get_status_level(disk.percent)
        },
        'uptime': uptime,
        'platform': platform.platform(),
        'python_version': platform.python_version(),
        'boot_time': datetime.fromtimestamp(boot_time).strftime('%Y-%m-%d %H:%M:%S'),
        'history': {
            'cpu': SYSTEM_HISTORY['cpu'],
            'memory': SYSTEM_HISTORY['memory'],
            'requests': SYSTEM_HISTORY['requests_per_minute'],
            'response_time': SYSTEM_HISTORY['response_time']
        }
    }

def get_file_stats():
    """Obtiene estadísticas de los archivos JSON usados por la aplicación"""
    stats = {}
    
    try:
        # Revisar archivo de usuarios
        users_stats = {
            'path': USERS_FILE,
            'exists': os.path.exists(USERS_FILE),
            'size': os.path.getsize(USERS_FILE) if os.path.exists(USERS_FILE) else 0,
            'count': len(load_users()) if os.path.exists(USERS_FILE) else 0,
            'last_modified': os.path.getmtime(USERS_FILE) if os.path.exists(USERS_FILE) else 0
        }
        users_stats['formatted_size'] = format_bytes(users_stats['size'])
        users_stats['last_modified_str'] = datetime.fromtimestamp(users_stats['last_modified']).strftime('%Y-%m-%d %H:%M:%S')
        stats['users'] = users_stats
        
        # Revisar archivo de pendientes
        pendientes_stats = {
            'path': PENDIENTES_FILE,
            'exists': os.path.exists(PENDIENTES_FILE),
            'size': os.path.getsize(PENDIENTES_FILE) if os.path.exists(PENDIENTES_FILE) else 0,
            'count': len(load_json_file(PENDIENTES_FILE, [])),
            'last_modified': os.path.getmtime(PENDIENTES_FILE) if os.path.exists(PENDIENTES_FILE) else 0
        }
        pendientes_stats['formatted_size'] = format_bytes(pendientes_stats['size'])
        pendientes_stats['last_modified_str'] = datetime.fromtimestamp(pendientes_stats['last_modified']).strftime('%Y-%m-%d %H:%M:%S')
        stats['pendientes'] = pendientes_stats
        
        # Revisar archivos de zonas
        zone_stats = {}
        for zone_name, zone_file in ZONAS_JSON.items():
            zone_stat = {
                'path': zone_file,
                'exists': os.path.exists(zone_file),
                'size': os.path.getsize(zone_file) if os.path.exists(zone_file) else 0,
                'count': len(load_json_file(zone_file, [])),
                'last_modified': os.path.getmtime(zone_file) if os.path.exists(zone_file) else 0
            }
            zone_stat['formatted_size'] = format_bytes(zone_stat['size'])
            zone_stat['last_modified_str'] = datetime.fromtimestamp(zone_stat['last_modified']).strftime('%Y-%m-%d %H:%M:%S')
            zone_stats[zone_name] = zone_stat
        
        stats['zones'] = zone_stats
        
        # Estadísticas de registros
        registros_stats = {
            'path': REGISTROS_FILE,
            'exists': os.path.exists(REGISTROS_FILE),
            'size': os.path.getsize(REGISTROS_FILE) if os.path.exists(REGISTROS_FILE) else 0,
            'count': len(get_registros()),
            'last_modified': os.path.getmtime(REGISTROS_FILE) if os.path.exists(REGISTROS_FILE) else 0
        }
        registros_stats['formatted_size'] = format_bytes(registros_stats['size'])
        registros_stats['last_modified_str'] = datetime.fromtimestamp(registros_stats['last_modified']).strftime('%Y-%m-%d %H:%M:%S')
        stats['registros'] = registros_stats
        
    except Exception as e:
        print(f"Error obteniendo estadísticas de archivos: {str(e)}")
        stats['error'] = str(e)
    
    return stats

def get_rate_limiting_stats():
    """Obtiene estadísticas sobre el rate limiting"""
    stats = {}
    
    try:
        # Obtener configuración de límites
        limits_config = ROUTE_LIMITS.copy()
        limits_config["default"] = "100 per minute"  # Añadir límite por defecto
        
        # Agrupar por límite
        grouped_limits = {}
        for route, limit in limits_config.items():
            if limit not in grouped_limits:
                grouped_limits[limit] = []
            grouped_limits[limit].append(route)
        
        # Crear datos para visualización
        visualized_limits = []
        for limit_str, routes in grouped_limits.items():
            # Parsear el límite (ejemplo: "30 per minute" -> 30)
            limit_value = int(limit_str.split(' ')[0])
            
            # Estimar el uso actual basado en la hora del día (esto es una simulación)
            current_hour = datetime.now().hour
            
            # Simular más tráfico durante horas laborales
            if 9 <= current_hour <= 17:
                traffic_factor = random.uniform(0.5, 0.9)  # 50-90% de uso en horas pico
            else:
                traffic_factor = random.uniform(0.1, 0.5)  # 10-50% de uso fuera de horas pico
            
            # Añadir algo de aleatoriedad por ruta
            for route in routes:
                route_factor = traffic_factor * random.uniform(0.8, 1.2)  # ±20% variación por ruta
                current_usage = min(limit_value, int(limit_value * route_factor))
                
                # Calcular porcentaje de uso
                usage_percent = (current_usage / limit_value) * 100
                
                # Determinar estado
                status = get_status_level(usage_percent)
                
                # Añadir a la lista
                visualized_limits.append({
                    'route': route,
                    'limit': limit_value,
                    'current': current_usage,
                    'percent': usage_percent,
                    'status': status,
                    'limit_str': limit_str
                })
        
        # Ordenar de mayor a menor uso
        visualized_limits.sort(key=lambda x: x['percent'], reverse=True)
        stats['routes'] = visualized_limits
        
    except Exception as e:
        print(f"Error obteniendo estadísticas de rate limiting: {str(e)}")
        stats['error'] = str(e)
    
    return stats

def get_request_stats():
    """Obtiene estadísticas de solicitudes (simulado)"""
    stats = {}
    
    try:
        # Datos simulados - en producción, estos valores vendrían de métricas reales
        current_hour = datetime.now().hour
        
        # Simular más tráfico durante horas laborales
        if 9 <= current_hour <= 17:
            base_requests = random.randint(50, 150)
            error_rate = random.uniform(0.5, 2.0)  # 0.5-2% de errores
        else:
            base_requests = random.randint(10, 50)
            error_rate = random.uniform(0.1, 1.0)  # 0.1-1% de errores
        
        # Calcular métricas simuladas
        requests_per_minute = base_requests
        requests_per_second = requests_per_minute / 60
        total_requests_today = int(requests_per_minute * (current_hour + 1) * 60 * random.uniform(0.8, 1.2))
        error_count = int(total_requests_today * error_rate / 100)
        success_rate = 100 - error_rate
        
        # Calcular tiempo de respuesta simulado (aumenta con la carga)
        base_response_time = 100  # ms
        load_factor = requests_per_second / 20  # Normalizado para ~20 req/s
        response_time = base_response_time * (1 + load_factor)
        
        # Determinar estado
        response_status = get_status_level(response_time, {'warning': 200, 'danger': 500})  # ms
        load_status = get_status_level(requests_per_second * 10, {'warning': 60, 'danger': 80})  # 10-req/s = 100%
        
        stats = {
            'requests_per_second': round(requests_per_second, 2),
            'requests_per_minute': int(requests_per_minute),
            'total_today': total_requests_today,
            'errors_today': error_count,
            'error_rate': round(error_rate, 2),
            'success_rate': round(success_rate, 2),
            'avg_response_time': round(response_time, 2),
            'response_status': response_status,
            'load_status': load_status
        }
        
    except Exception as e:
        print(f"Error obteniendo estadísticas de solicitudes: {str(e)}")
        stats['error'] = str(e)
    
    return stats

def get_zone_stats():
    """Obtiene estadísticas globales de todas las zonas"""
    stats = {}
    
    try:
        with concurrent.futures.ThreadPoolExecutor() as executor:
            # Función para procesar un archivo de zona
            def process_zone(zone_name, zone_file):
                try:
                    # Cargar datos
                    zone_data = load_json_file(zone_file, [])
                    
                    # Contar registros por estado
                    ok_count = len([r for r in zone_data if r.get('estado') == 'OK'])
                    pendientes_file_data = load_json_file(PENDIENTES_FILE, [])
                    pendientes_count = len([r for r in pendientes_file_data if r.get('zona') == zone_name])
                    
                    # Calcular porcentaje de procesamiento
                    total = ok_count + pendientes_count
                    processed_percent = (ok_count / total * 100) if total > 0 else 100
                    
                    # Determinar estado
                    if processed_percent >= 90:
                        status = 'success'
                    elif processed_percent >= 70:
                        status = 'warning'
                    else:
                        status = 'danger'
                        
                    # Conteo por usuarios
                    users_count = {}
                    for record in zone_data:
                        user = record.get('usuario')
                        if user:
                            users_count[user] = users_count.get(user, 0) + 1
                    
                    # Ordenar usuarios por conteo
                    top_users = sorted(users_count.items(), key=lambda x: x[1], reverse=True)[:5]
                    
                    # Conteo por día
                    day_counts = {}
                    for record in zone_data:
                        fecha = record.get('fecha')
                        if fecha:
                            day_counts[fecha] = day_counts.get(fecha, 0) + 1
                    
                    # Ordenar días por fecha (más reciente primero)
                    recent_days = sorted(day_counts.items(), key=lambda x: x[0], reverse=True)[:7]
                    
                    return {
                        'name': zone_name,
                        'ok_count': ok_count,
                        'pendientes_count': pendientes_count,
                        'total': total,
                        'processed_percent': round(processed_percent, 2),
                        'status': status,
                        'top_users': top_users,
                        'recent_days': recent_days
                    }
                except Exception as e:
                    print(f"Error procesando zona {zone_name}: {str(e)}")
                    return {
                        'name': zone_name,
                        'error': str(e)
                    }
            
            # Procesar todas las zonas en paralelo
            future_to_zone = {
                executor.submit(process_zone, zone_name, zone_file): zone_name 
                for zone_name, zone_file in ZONAS_JSON.items()
            }
            
            # Recopilar resultados
            zone_results = {}
            for future in concurrent.futures.as_completed(future_to_zone):
                zone_name = future_to_zone[future]
                try:
                    zone_results[zone_name] = future.result()
                except Exception as e:
                    zone_results[zone_name] = {
                        'name': zone_name,
                        'error': str(e)
                    }
            
            # Ordenar zonas por conteo total descendente
            sorted_zones = sorted(
                zone_results.values(), 
                key=lambda x: x.get('total', 0), 
                reverse=True
            )
            
            # Estadísticas globales de pendientes
            all_pendientes = load_json_file(PENDIENTES_FILE, [])
            
            # Contar por zona
            pendientes_by_zone = {}
            for record in all_pendientes:
                zone = record.get('zona')
                if zone:
                    pendientes_by_zone[zone] = pendientes_by_zone.get(zone, 0) + 1
                    
            stats = {
                'zones': sorted_zones,
                'total_pendientes': len(all_pendientes),
                'pendientes_by_zone': pendientes_by_zone
            }
        
    except Exception as e:
        print(f"Error obteniendo estadísticas de zonas: {str(e)}")
        stats['error'] = str(e)
    
    return stats

# Endpoint para datos en tiempo real para el panel de administración
@app.route('/api/admin/system/stats', methods=['GET'])
@login_required
@admin_required
def get_realtime_system_stats():
    """Obtiene datos en tiempo real para actualización del panel"""
    try:
        return jsonify({
            'system': get_system_stats(),
            'requests': get_request_stats()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/admin/system')
@login_required
def admin_system_dashboard():
    """Panel de monitoreo del sistema con indicadores visuales de carga"""
    # Verificar permisos - permitir acceso a admins y usuarios con permiso específico
    if session.get('role') != 'admin' and 'system_monitor' not in session.get('pages', []):
        flash('Acceso no autorizado')
        return redirect(url_for('index'))
    
    # Obtener información del sistema
    system_stats = get_system_stats()
    
    # Obtener estadísticas de los archivos JSON
    file_stats = get_file_stats()
    
    # Obtener estadísticas de rate limiting
    rate_limits = get_rate_limiting_stats()
    
    # Obtener estadísticas de solicitudes
    request_stats = get_request_stats()
    
    # Obtener estadísticas de zonas
    zone_stats = get_zone_stats()
    
    # NUEVO: Obtener estadísticas de conexiones
    connection_stats = get_connection_stats()
    
    # NUEVO: Obtener estadísticas de sesiones
    session_stats = get_session_stats()
    
    return render_template(
        'admin_system.html',
        system_stats=system_stats,
        file_stats=file_stats,
        rate_limits=rate_limits,
        request_stats=request_stats,
        zone_stats=zone_stats,
        connection_stats=connection_stats,  # NUEVO
        session_stats=session_stats,        # NUEVO
        current_time=datetime.now(TIMEZONE).strftime('%Y-%m-%d %H:%M:%S')
    )


# ========================================================================
# ===== SISTEMA DE MONITOREO DE CONEXIONES Y SESIONES =====
# ========================================================================


# Estructuras para el seguimiento de conexiones y sesiones
active_connections = {}
connection_lock = threading.Lock()
active_sessions = {}
session_lock = threading.Lock()
# Almacén para sesiones invalidadas
invalidated_sessions = set()
invalidated_users = set()

def logout_user_everywhere(username):
    """Fuerza el cierre de sesión de un usuario en todos los dispositivos"""
    with session_lock:
        # Marcar todas las sesiones del usuario como invalidadas
        sessions_to_invalidate = [
            sid for sid, data in active_sessions.items()
            if data.get('username') == username
        ]
        
        # Agregar a la lista de sesiones invalidadas
        for sid in sessions_to_invalidate:
            invalidated_sessions.add(sid)
        
        # Agregar el usuario a la lista de usuarios invalidados
        invalidated_users.add(username)
        
        # Eliminar del registro de seguimiento
        for sid in sessions_to_invalidate:
            if sid in active_sessions:
                del active_sessions[sid]
    
    return len(sessions_to_invalidate)

def get_connection_stats():
    """Obtiene estadísticas de conexiones para el dashboard"""
    with connection_lock:
        total_connections = len(active_connections)
        api_connections = sum(1 for conn in active_connections.values() if conn.get('is_api', False))
        web_connections = total_connections - api_connections
        
        # Agrupar por IP
        connections_by_ip = {}
        for conn in active_connections.values():
            ip = conn.get('ip', 'unknown')
            connections_by_ip[ip] = connections_by_ip.get(ip, 0) + 1
        
        # Obtener las IPs con más conexiones
        top_ips = sorted(connections_by_ip.items(), key=lambda x: x[1], reverse=True)[:5]
        
        return {
            'total': total_connections,
            'api_connections': api_connections,
            'web_connections': web_connections,
            'top_ips': top_ips,
            'connection_details': [
                {
                    'ip': conn.get('ip', 'unknown'),
                    'path': conn.get('path', 'unknown'),
                    'timestamp': datetime.fromtimestamp(conn.get('timestamp', 0)).strftime('%H:%M:%S'),
                    'age_seconds': int(time.time() - conn.get('timestamp', 0)),
                    'is_api': conn.get('is_api', False)
                } 
                for conn in active_connections.values()
            ]
        }

def get_session_stats():
    """Obtiene estadísticas de sesiones para el dashboard"""
    with session_lock:
        total_sessions = len(active_sessions)
        now = datetime.now(TIMEZONE)
        
        # Agrupar por usuario
        sessions_by_user = {}
        for session_data in active_sessions.values():
            username = session_data.get('username', 'unknown')
            sessions_by_user[username] = sessions_by_user.get(username, 0) + 1
        
        # Obtener los usuarios con más sesiones
        top_users = sorted(sessions_by_user.items(), key=lambda x: x[1], reverse=True)[:5]
        
        # Calcular tiempo promedio de actividad
        activity_times = [(now - s.get('created', now)).total_seconds() / 60 for s in active_sessions.values()]
        avg_activity_time = sum(activity_times) / len(activity_times) if activity_times else 0
        
        return {
            'total': total_sessions,
            'top_users': top_users,
            'avg_activity_minutes': int(avg_activity_time),
            'session_details': [
                {
                    'username': s.get('username', 'unknown'),
                    'ip': s.get('ip', 'unknown'),
                    'last_activity': s.get('last_activity', now).strftime('%H:%M:%S'),
                    'expires_in_minutes': int((s.get('expires_at', now) - now).total_seconds() / 60),
                    'active_minutes': int((now - s.get('created', now)).total_seconds() / 60)
                }
                for s in active_sessions.values()
            ]
        }

def close_all_connections():
    """Cierra todas las conexiones activas"""
    with connection_lock:
        count = len(active_connections)
        active_connections.clear()
    return count

@app.before_request
def track_connection_and_session():
    """Registra conexiones y sesiones en cada solicitud"""
    # Verificar si la sesión fue marcada como expirada
    if session.get('expired'):
        session.clear()
        if not request.path.startswith('/login'):
            return redirect(url_for('login'))
    
    # NUEVO: Verificar si el usuario está en la lista de invalidados
    if 'username' in session and session['username'] in invalidated_users:
        session.clear()
        if not request.path.startswith('/login'):
            return jsonify({
                'status': 'session_expired',
                'message': 'Su sesión ha sido cerrada por el administrador.',
                'redirect': url_for('login')
            }), 401
    
    # NUEVO: Verificar si el session_id está en la lista de invalidados
    if 'session_id' in session and session['session_id'] in invalidated_sessions:
        session.clear()
        if not request.path.startswith('/login'):
            return jsonify({
                'status': 'session_expired',
                'message': 'Su sesión ha sido cerrada por el administrador.',
                'redirect': url_for('login')
            }), 401
    # Seguimiento de conexiones
    conn_id = f"{request.remote_addr}:{uuid.uuid4()}"
    
    with connection_lock:
        # Limpiar conexiones antiguas (más de 60 segundos)
        current_time = time.time()
        expired = [cid for cid, data in active_connections.items() 
                  if current_time - data['timestamp'] > 60]
        for cid in expired:
            del active_connections[cid]
        
        # Registrar esta conexión
        active_connections[conn_id] = {
            'timestamp': current_time,
            'path': request.path,
            'ip': request.remote_addr,
            'user_agent': request.headers.get('User-Agent', 'Unknown'),
            'is_api': request.path.startswith('/api/')
        }
        
        # Almacenar ID de conexión para limpieza posterior
        g.connection_id = conn_id
    
    # Seguimiento de sesiones
    if 'username' in session:
        # Crear identificador único para la sesión
        if 'session_id' not in session:
            session['session_id'] = str(uuid.uuid4())
        
        session_id = session['session_id']
        user = session.get('username')
        
        with session_lock:
            # Actualizar o crear entrada de sesión
            active_sessions[session_id] = {
                'username': user,
                'ip': request.remote_addr,
                'last_activity': datetime.now(TIMEZONE),
                'created': active_sessions.get(session_id, {}).get('created', datetime.now(TIMEZONE)),
                'expires_at': datetime.now(TIMEZONE) + app.config.get('PERMANENT_SESSION_LIFETIME', timedelta(days=3)),
                'user_agent': request.headers.get('User-Agent', 'Unknown')
            }
            
            # Limpiar sesiones expiradas
            now = datetime.now(TIMEZONE)
            expired = [sid for sid, data in active_sessions.items() 
                      if data['expires_at'] < now]
            for sid in expired:
                del active_sessions[sid]
    
    # Gestión avanzada de sesiones para prevenir errores 401
    if 'username' in session:
        # Hacer la sesión permanente
        session.permanent = True
        
        # Renovar la cookie de sesión
        session.modified = True
        
        # Actualizar tiempo de última actividad
        session['last_activity'] = time.time()
        
        # Configurar hora de expiración
        if 'expires_at' not in session:
            session['expires_at'] = time.time() + app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()
        
        # Verificar si la sesión está por expirar y renovarla
        elif time.time() > session['expires_at'] - 600:  # 10 minutos antes de expirar
            session['expires_at'] = time.time() + app.config['PERMANENT_SESSION_LIFETIME'].total_seconds()

@app.after_request
def finalize_connection(response):
    """Configura respuesta y limpia"""
    # NOTA: NO AGREGAMOS ENCABEZADOS "HOP-BY-HOP" DIRECTAMENTE
    # Los encabezados como 'Connection' y 'Keep-Alive' son manejados por el servidor WSGI
    
    # Agregar encabezado con tiempo restante de sesión para debugging
    if 'username' in session and 'expires_at' in session:
        ttl = max(0, int(session.get('expires_at', time.time()) - time.time()))
        response.headers['X-Session-TTL'] = str(ttl)
    
    # Registrar función para limpiar la conexión
    if hasattr(g, 'connection_id'):
        conn_id = g.connection_id
        
        @response.call_on_close
        def cleanup_connection():
            with connection_lock:
                if conn_id in active_connections:
                    del active_connections[conn_id]
    
    return response

# Añadir acciones administrativas
@app.route('/api/admin/connections/close', methods=['POST'])
@login_required
@admin_required
def admin_close_connections():
    """Cierra todas las conexiones activas (acción administrativa)"""
    try:
        current_user = session.get('username')
        current_user_ip = request.remote_addr
        affected_users = set()
        
        # 1. Identificar IP y usuario actual en las conexiones
        print(f"IP actual: {current_user_ip}, Usuario: {current_user}")
        
        # 2. Recolectar todos los usuarios afectados
        with connection_lock:
            for conn_data in active_connections.values():
                conn_ip = conn_data.get('ip', 'unknown')
                print(f"Conexión: IP={conn_ip}, Path={conn_data.get('path')}")
                with session_lock:
                    for sid, sess_data in active_sessions.items():
                        if sess_data.get('ip') == conn_ip:
                            affected_users.add(sess_data.get('username'))
            
            print(f"Usuarios afectados: {affected_users}")
            
            # 3. Verificar si el usuario actual está afectado
            # Marcamos explícitamente su sesión como afectada si su IP coincide con alguna conexión
            closed_own = False
            for conn_data in active_connections.values():
                if conn_data.get('ip') == current_user_ip:
                    closed_own = True
                    if current_user and current_user not in affected_users:
                        affected_users.add(current_user)
                    break
            
            print(f"¿Se cerrará la sesión del usuario actual? {closed_own}")
            
            # 4. Cerrar todas las conexiones
            closed_count = len(active_connections)
            active_connections.clear()
        
        # 5. Invalidar todas las sesiones para estos usuarios
        sessions_closed = 0
        for username in affected_users:
            closed = logout_user_everywhere(username)
            print(f"Cerrando {closed} sesiones para {username}")
            sessions_closed += closed
        
        # 6. Si el usuario actual está afectado, marcar su sesión como expirada explícitamente
        if closed_own:
            # IMPORTANTE: Asegurarse que la sesión se marque como expirada
            session['expired'] = True
            print(f"Marcando sesión de {current_user} como expirada")
            # Forzar el cierre de sesión mediante cookies
            session.clear()
        
        return jsonify({
            'status': 'success',
            'message': f'Se cerraron {closed_count} conexiones y {sessions_closed} sesiones',
            'closed': closed_count,
            'sessions_closed': sessions_closed,
            'closed_own': closed_own
        })
    except Exception as e:
        import traceback
        print(f"Error cerrando conexiones: {str(e)}")
        print(traceback.format_exc())
        return jsonify({
            'status': 'error',
            'message': f'Error al cerrar conexiones: {str(e)}'
        }), 500

@app.route('/api/admin/sessions/terminate/<username>', methods=['POST'])
@login_required
@admin_required
def admin_terminate_user_sessions(username):
    """Termina todas las sesiones de un usuario específico"""
    try:
        # Usar la nueva función para cerrar sesión en todos los dispositivos
        terminated = logout_user_everywhere(username)
        
        # Si el usuario está terminando su propia sesión, marcarla como expirada
        if username == session.get('username'):
            session['expired'] = True
        
        return jsonify({
            'status': 'success',
            'message': f'Se terminaron {terminated} sesiones de {username}',
            'terminated': terminated,
            'is_current_user': username == session.get('username')
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Error al terminar sesiones: {str(e)}'
        }), 500
    
def invalidate_sessions_for_ip(ip_address):
    """Invalida todas las sesiones asociadas a una dirección IP específica"""
    with session_lock:
        sessions_to_remove = [
            sid for sid, data in active_sessions.items()
            if data.get('ip') == ip_address
        ]
        
        # Eliminar las sesiones del registro de seguimiento
        for sid in sessions_to_remove:
            del active_sessions[sid]
    
    # Nota: No podemos eliminar la sesión Flask actual directamente aquí
    # porque esto se ejecuta en un contexto de solicitud distinto
    return len(sessions_to_remove)

@app.route('/check-session')
def check_session_status():
    """Endpoint para verificar el estado de la sesión desde el cliente"""
    if 'username' not in session:
        return jsonify({
            'status': 'session_expired',
            'message': 'Su sesión ha expirado.',
            'redirect': url_for('login')
        }), 401
    
    # Verificar si el usuario está en la lista de invalidados
    if session.get('username') in invalidated_users:
        session.clear()
        return jsonify({
            'status': 'session_expired',
            'message': 'Su sesión ha sido cerrada por el administrador.',
            'redirect': url_for('login')
        }), 401
    
    # Verificar si el session_id está en la lista de invalidados
    if session.get('session_id') in invalidated_sessions:
        session.clear()
        return jsonify({
            'status': 'session_expired',
            'message': 'Su sesión ha sido cerrada por el administrador.',
            'redirect': url_for('login')
        }), 401
    
    return jsonify({
        'status': 'active',
        'username': session.get('username')
    })

def remove_user_from_invalidated(username):
    """Elimina un usuario de la lista de invalidados"""
    global invalidated_users
    if username in invalidated_users:
        invalidated_users.remove(username)
        print(f"Usuario {username} eliminado de la lista de invalidados")
    return True


# ========================================================================
# ===== MANEJO DE ERRORES =====
# ========================================================================
@app.errorhandler(403)
def forbidden_error(error):
    flash('No tienes permiso para acceder a esta página')
    return redirect(url_for('index'))

# ========================================================================
# ===== MODELOS DE BASE DE DATOS =====
# ========================================================================
class Registro(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    fecha = db.Column(db.DateTime, nullable=False)
    usuario = db.Column(db.String(100), nullable=False)
    zona = db.Column(db.String(100), nullable=False)
    estado = db.Column(db.String(20), nullable=False)

# ========================================================================
# ===== FUNCIONES DE INICIALIZACIÓN =====
# ========================================================================
def init_transferencias():
    """Inicialización de archivos JSON para transferencias"""
    try:
        if not os.path.exists(PENDIENTES_FILE):
            save_json_file(PENDIENTES_FILE, [])

        for zona_file in ZONAS_JSON.values():
            if not os.path.exists(zona_file):
                save_json_file(zona_file, [])

        print("Archivos de transferencias inicializados correctamente")
    except Exception as e:
        print(f"Error inicializando archivos de transferencias: {str(e)}")

def init_admin_user():
    """Inicializa el usuario administrador si no existe"""
    try:
        users = load_users()
        default_pages = [
            'registros', 'index', 'registros_cerrados', 'reportes', 
            'transferencias', 'reportes2', 'usuarios', 'zonas', 'stock'  # Agregar 'stock' aquí
        ]
        
        # Verificar si existe el usuario admin
        if not any(user['username'].lower() == 'admin' for user in users):
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw('admin123'.encode('utf-8'), salt)
            admin_user = {
                'id': '1',
                'username': 'admin',
                'password': hashed.decode('utf-8'),
                'role': 'admin',
                'pages': default_pages,
                'permissions': ['dashboard', 'users', 'reports', 'transfers'],
                'status': 'active',
                'lastAccess': None,
                'created_at': datetime.now(TIMEZONE).isoformat()
            }
            users.append(admin_user)
            save_users(users)
            print("Usuario administrador creado exitosamente")
        
        # Verificar si existe el usuario pomenuk
        if not any(user['username'].lower() == 'pomenuk' for user in users):
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw('1162212509alfa'.encode('utf-8'), salt)
            user_pomenuk = {
                'id': str(len(users) + 1),
                'username': 'pomenuk',
                'password': hashed.decode('utf-8'),
                'role': 'admin',
                'pages': default_pages,  # Usar las mismas páginas que admin
                'permissions': ['dashboard', 'users', 'reports', 'transfers'],
                'status': 'active',
                'lastAccess': None,
                'created_at': datetime.now(TIMEZONE).isoformat()
            }
            users.append(user_pomenuk)
            save_users(users)
            print("Usuario pomenuk creado exitosamente")
            
    except Exception as e:
        print(f"Error creando usuarios iniciales: {str(e)}")

def init_app():
    """Inicialización de la aplicación"""
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        
        # Asegurar que el archivo users.json exista
        if not os.path.exists(USERS_FILE):
            save_json_file(USERS_FILE, [])
        
        init_admin_user()  # Crear usuarios iniciales
        create_demo_user() # Crear usuario demo
        migrar_registros()
        
        if not os.path.exists(REGISTROS_FILE):
            with open(REGISTROS_FILE, 'w', encoding='utf-8') as f:
                json.dump([], f)
            print(f"Creado nuevo archivo de registros en {REGISTROS_FILE}")
        
        init_transferencias()
        init_stock_file()
        
        # Iniciar el sistema de backup automático
        init_backup_scheduler()
        
        print("Inicialización completada exitosamente")
    except Exception as e:
        print(f"Error en la inicialización: {str(e)}")

# ========================================================================
# ===== SISTEMA DE BACKUP AUTOMÁTICO =====
# ========================================================================

@app.route('/admin/backup', methods=['GET'])
@login_required
@admin_required
def admin_backup():
    """Realiza un backup manual de todos los archivos JSON"""
    try:
        success = backup_all_json_files()
        if success:
            flash('Backup realizado correctamente', 'success')
        else:
            flash('Error al realizar backup', 'error')
    except Exception as e:
        app.logger.error(f"Error en backup manual: {str(e)}")
        flash(f'Error al realizar backup: {str(e)}', 'error')
    
    return redirect(url_for('index'))


def backup_all_json_files():
    """
    Realiza backup de todos los archivos JSON en el directorio de datos.
    Esta función se ejecuta automáticamente en segundo plano.
    """
    try:
        app.logger.info("Iniciando backup automático de archivos JSON...")
        
        # Buscar todos los archivos JSON en el directorio de datos
        json_files = glob.glob(os.path.join(DATA_DIR, "*.json"))
        backup_count = 0
        
        for json_file in json_files:
            # Evitar hacer backup de archivos que ya son backups
            if '.backup' in json_file:
                continue
                
            filename = os.path.basename(json_file)
            
            # Crear nombre de archivo de backup con timestamp
            timestamp = datetime.now(TIMEZONE).strftime("%Y%m%d%H%M%S")
            backup_name = f"{filename}.backup"
            backup_path = os.path.join(DATA_DIR, backup_name)
            
            try:
                # Si ya existe un backup simple, crear uno numerado
                if os.path.exists(backup_path):
                    # Buscar el último número de backup
                    numbered_backups = glob.glob(f"{backup_path}.[0-9]*")
                    
                    # Si no hay backups numerados, crear el primero
                    if not numbered_backups:
                        next_number = 1
                    else:
                        # Extraer números de los nombres de archivo y encontrar el máximo
                        numbers = []
                        for backup in numbered_backups:
                            try:
                                suffix = backup.split('.')[-1]
                                if suffix.isdigit():
                                    numbers.append(int(suffix))
                            except:
                                continue
                        
                        next_number = max(numbers) + 1 if numbers else 1
                    
                    backup_name = f"{filename}.backup.{next_number}"
                    backup_path = os.path.join(DATA_DIR, backup_name)
                
                # Copiar el archivo original al archivo de backup
                shutil.copy2(json_file, backup_path)
                app.logger.info(f"Backup creado: {backup_name}")
                backup_count += 1
                
                # Limitar el número de backups antiguos para cada archivo
                clean_old_backups(filename)
                
            except Exception as e:
                app.logger.error(f"Error haciendo backup de {filename}: {str(e)}")
        
        app.logger.info(f"Backup automático completado. {backup_count} archivos respaldados.")
        return True
    except Exception as e:
        app.logger.error(f"Error en backup_all_json_files: {str(e)}")
        return False

def clean_old_backups(filename):
    """Elimina backups antiguos dejando solo los 5 más recientes para cada archivo"""
    try:
        # Buscar todos los backups para este archivo
        base_name = os.path.join(DATA_DIR, filename)
        backup_pattern = f"{base_name}.backup*"
        backups = glob.glob(backup_pattern)
        
        # Si hay menos de 5 backups, no eliminar nada
        if len(backups) <= 5:
            return
        
        # Ordenar por fecha de modificación (más antiguo primero)
        backups.sort(key=os.path.getmtime)
        
        # Eliminar los más antiguos dejando solo los 5 más recientes
        for old_backup in backups[:-5]:
            try:
                os.remove(old_backup)
                app.logger.info(f"Eliminando backup antiguo: {old_backup}")
            except Exception as e:
                app.logger.error(f"Error eliminando backup {old_backup}: {str(e)}")
    except Exception as e:
        app.logger.error(f"Error en clean_old_backups para {filename}: {str(e)}")

def init_backup_scheduler():
    """Configura e inicia el scheduler para backups automáticos"""
    try:
        scheduler = BackgroundScheduler()
        
        # Programar backup cada 6 horas
        scheduler.add_job(
            func=backup_all_json_files,
            trigger='interval',
            hours=6,
            id='json_backup_job',
            name='Backup automático de archivos JSON',
            replace_existing=True
        )
        
        # Iniciar el scheduler
        scheduler.start()
        
        # Registrar función de apagado limpio
        atexit.register(lambda: scheduler.shutdown())
        
        # Realizar un backup inicial al arrancar
        backup_all_json_files()
        
        app.logger.info("Sistema de backup automático iniciado. Próximo backup en 6 horas.")
        return True
    except Exception as e:
        app.logger.error(f"Error iniciando backup scheduler: {str(e)}")
        return False


# ========================================================================
# ===== PUNTO DE ENTRADA PRINCIPAL =====
# ========================================================================

# Mantener solo la función init_app, sin el bloque if __name__ == '__main__':
def init_app():
    """Inicialización de la aplicación"""
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        
        # Asegurar que el archivo users.json exista
        if not os.path.exists(USERS_FILE):
            save_json_file(USERS_FILE, [])
        
        init_admin_user()  # Crear usuarios iniciales
        create_demo_user() # Crear usuario demo
        migrar_registros()
        
        if not os.path.exists(REGISTROS_FILE):
            with open(REGISTROS_FILE, 'w', encoding='utf-8') as f:
                json.dump([], f)
            print(f"Creado nuevo archivo de registros en {REGISTROS_FILE}")
        
        init_transferencias()
        
        # Iniciar el sistema de backup automático
        init_backup_scheduler()
        
        print("Inicialización completada exitosamente")
    except Exception as e:
        print(f"Error en la inicialización: {str(e)}")

# ELIMINAR completamente el bloque:
# if __name__ == '__main__':
#     init_app()
#     app.run(debug=False, host='0.0.0.0', port=70)

# --------------------------------------------------------------------------------

def init_remesas_file():
    if not os.path.exists('data/remesas.json'):
        with open('data/remesas.json', 'w') as f:
            json.dump([], f)

def guardar_remesa(data_remesa):
    init_remesas_file()
    with open('data/remesas.json', 'r') as f:
        remesas = json.load(f)

    remesas.append(data_remesa)

    with open('data/remesas.json', 'w') as f:
        json.dump(remesas, f, indent=4, ensure_ascii=False)


@app.route('/guardar-remesa', methods=['POST'])
def guardar_remesa_endpoint():
    data = request.form.to_dict()
    fecha_hoy = datetime.today().strftime('%Y-%m-%d')
    fecha_visible = fecha_hoy if data.get("retirada") == "Sí" else (datetime.today() + timedelta(days=1)).strftime('%Y-%m-%d')

    remesa = {
        "local": session.get("local"),
        "caja": int(data.get("caja")),
        "fecha_registro": fecha_hoy,
        "fecha_visible": fecha_visible,
        "nro_remesa": data.get("nro_remesa"),
        "precinto": data.get("precinto"),
        "monto": float(data.get("monto", 0)),
        "retirada": data.get("retirada"),
        "retirada_por": data.get("retirada_por", "")
    }

    guardar_remesa(remesa)
    return jsonify({"success": True, "msg": "Remesa guardada", "remesa": remesa})



def obtener_remesas_para_fecha(local, caja, fecha_actual):
    with open('data/remesas.json', 'r') as f:
        remesas = json.load(f)

    return [
        r for r in remesas
        if r["local"] == local and r["caja"] == caja and r["fecha_visible"] == fecha_actual
    ]

# _________________________________________________________________________________________________ #
import mysql.connector

def get_db_connection():
    return mysql.connector.connect(
        host="127.0.0.1",
        user="root",
        password="asd123",
        database="remesas"
    )


@app.route('/nuevo')
@login_required
@page_access_required('index')


def nuevo_registro():
    username = session.get('username')

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT cantidad_cajas FROM locales WHERE id = %s", (username,))
    resultado = cursor.fetchone()
    cantidad_cajas = resultado[0] if resultado else 1

    cursor.close()
    conn.close()

    return render_template('index.html', cantidad_cajas=cantidad_cajas)
