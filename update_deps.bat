@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo ERROR: No existe el entorno virtual .venv
  echo Ejecuta primero: install.bat
  pause
  exit /b 1
)

".venv\Scripts\pip.exe" install -r requirements.txt
pause