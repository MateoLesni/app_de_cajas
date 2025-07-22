# wsgi.py - Servidor WSGI para la aplicación Flask
from waitress import serve
import os
import sys
import logging
from datetime import datetime

# Configurar logging
log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(log_dir, exist_ok=True)

log_file = os.path.join(log_dir, f"server_{datetime.now().strftime('%Y%m%d')}.log")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger('waitress')

def get_server_info():
    """Obtiene información del servidor"""
    import platform
    import multiprocessing
    
    return {
        'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'user': os.getenv('USERNAME', 'unknown'),
        'platform': platform.platform(),
        'python': platform.python_version(),
        'cpus': multiprocessing.cpu_count(),
        'directory': os.path.dirname(os.path.abspath(__file__))
    }

if __name__ == '__main__':
    # Importar la app Flask y la función init_app desde app.py
    # Importante: hacerlo aquí dentro del bloque if para evitar problemas de importación circular
    from app import app, init_app
    
    # Inicializar la aplicación
    init_app()
    
    # Obtener información del servidor
    info = get_server_info()
    
    # Mostrar información de inicio
    print("="*60)
    print(f"SERVIDOR WSGI (WAITRESS)")
    print(f"Fecha/Hora: {info['date']}")
    print(f"Usuario: {info['user']}")
    print(f"Sistema: {info['platform']}")
    print(f"Python: {info['python']}")
    print(f"CPUs: {info['cpus']}")
    print(f"Directorio: {info['directory']}")
    print("="*60)
    print("Escuchando en http://localhost:70")
    print(f"Logs: {log_file}")
    print("Presiona Ctrl+C para detener el servidor")
    print("="*60)
    
    # Calcular número óptimo de threads
    threads = info['cpus'] * 2
    print(f"Usando {threads} threads para procesamiento")
    
    # Iniciar servidor con Waitress
    serve(app, host='localhost', port=443, threads=threads)