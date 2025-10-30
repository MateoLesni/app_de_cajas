# wsgi.py — Servidor WSGI para uso LOCAL
# Nota: En Cloud Run el arranque lo hace gunicorn (ver Procfile). Este archivo es solo para correr local.

import os
import sys
import logging
from datetime import datetime

# ===== Logging básico a archivo + consola =====
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)

LOG_FILE = os.path.join(LOG_DIR, f"server_{datetime.now().strftime('%Y%m%d')}.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("wsgi-local")

def get_server_info():
    """Devuelve info del entorno para imprimir al inicio."""
    import platform
    import multiprocessing
    return {
        "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "user": os.getenv("USERNAME") or os.getenv("USER") or "unknown",
        "platform": platform.platform(),
        "python": platform.python_version(),
        "cpus": multiprocessing.cpu_count(),
        "directory": BASE_DIR,
    }

if __name__ == "__main__":
    # Importamos la app de Flask
    # OJO: no importamos waitress en el tope del archivo para evitar romper en ambientes donde no esté instalada.
    from app import app  # debe existir un objeto Flask llamado `app` en app.py

    info = get_server_info()

    print("=" * 60)
    print("SERVIDOR WSGI (LOCAL)")
    print(f"Fecha/Hora: {info['date']}")
    print(f"Usuario:    {info['user']}")
    print(f"Sistema:    {info['platform']}")
    print(f"Python:     {info['python']}")
    print(f"CPUs:       {info['cpus']}")
    print(f"Directorio: {info['directory']}")
    print("=" * 60)
    print(f"Logs: {LOG_FILE}")
    print("=" * 60)

    # Puerto/host configurables por variables de entorno
    # - PORT se usa también en plataformas PaaS; por defecto 8080
    PORT = int(os.getenv("PORT", "8080"))
    HOST = os.getenv("HOST", "0.0.0.0")  # 0.0.0.0 para aceptar conexiones en la LAN si querés

    # Intentamos usar Waitress si está instalada; si no, caemos al servidor de Flask
    try:
        # Import diferido para no fallar si waitress no está en requirements de la imagen remota
        from waitress import serve

        threads = max(2, info["cpus"] * 2)
        print(f"Iniciando con Waitress en http://{HOST}:{PORT} (threads={threads})")
        serve(app, host=HOST, port=PORT, threads=threads)

    except ModuleNotFoundError:
        # Fallback al servidor dev de Flask (solo para local)
        print("Waitress no instalado. Usando servidor de desarrollo de Flask.")
        print(f"Escuchando en http://{HOST}:{PORT}")
        # debug=True opcional para autoreload local
        app.run(host=HOST, port=PORT, debug=True)
