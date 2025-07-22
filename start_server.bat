@echo off
echo =======================================
echo  Iniciando Servidor WSGI - Sistema PAIS
echo =======================================
echo.

REM Activar entorno virtual si existe
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
    echo [OK] Entorno virtual activado
) else (
    echo [INFO] No se encontro entorno virtual
)

REM Verificar si Waitress está instalado
python -c "import waitress" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [INSTALANDO] Waitress no esta instalado. Instalando...
    pip install waitress
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] No se pudo instalar Waitress
        pause
        exit /b 1
    )
    echo [OK] Waitress instalado correctamente
)

REM Ejecutar servidor
echo [INICIANDO] Servidor WSGI...
python wsgi.py

REM Si el servidor se detiene con un error, pausar para ver el mensaje
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] El servidor se detuvo con un error
    pause
)