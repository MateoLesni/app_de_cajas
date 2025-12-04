# Usar imagen oficial de Python
FROM python:3.11-slim

# Variables de entorno para optimización
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Instalar dependencias del sistema necesarias para MySQL
RUN apt-get update && apt-get install -y \
    default-libmysqlclient-dev \
    build-essential \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de trabajo
WORKDIR /app

# Copiar requirements primero (para aprovechar caché de Docker)
COPY requirements.txt .

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el resto de la aplicación
COPY . .

# Crear directorio para logs
RUN mkdir -p /app/logs

# El puerto que usa Cloud Run
ENV PORT=8080

# Exponer el puerto
EXPOSE 8080

# Comando para ejecutar la aplicación
# Gunicorn es más robusto para producción que el servidor de desarrollo de Flask
CMD exec gunicorn --bind :$PORT --workers 2 --threads 4 --timeout 300 --access-logfile - --error-logfile - app:app
