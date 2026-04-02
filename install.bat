@echo off
setlocal

REM ==========================================
REM MirsaTechHospital - Installer (Windows)
REM Requires: Python 3.13+ available as "py"
REM ==========================================

cd /d "%~dp0"

echo.
echo [1/4] Verificando Python...
py -c "import sys; print(sys.version)" || (
  echo.
  echo ERROR: No se encontro Python con el comando "py".
  echo Instala Python y marca "Add Python to PATH", o habilita el Python Launcher.
  pause
  exit /b 1
)

echo.
echo [2/4] Creando entorno virtual .venv ...
if exist ".venv\Scripts\python.exe" (
  echo - El entorno virtual ya existe. Saltando creacion.
) else (
  py -m venv .venv || (
    echo ERROR: No se pudo crear el entorno virtual.
    pause
    exit /b 1
  )
)

echo.
echo [3/4] Actualizando pip...
".venv\Scripts\python.exe" -m pip install --upgrade pip || (
  echo ERROR: No se pudo actualizar pip.
  pause
  exit /b 1
)

echo.
echo [4/4] Instalando dependencias...
".venv\Scripts\pip.exe" install -r requirements.txt || (
  echo.
  echo ERROR: Fallo la instalacion de dependencias.
  echo Copia el error y envialo para ayudarte.
  pause
  exit /b 1
)

echo.
echo Instalacion completada.
echo Ahora ejecuta: start_app.bat
echo.
pause
exit /b 0