@echo off
setlocal

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo.
  echo ERROR: No existe el entorno virtual .venv
  echo Ejecuta primero: install.bat
  echo.
  pause
  exit /b 1
)

echo.
echo ================================
echo  MirsaTechHospital - START
echo ================================
echo.

echo IPs de esta PC (busca la IPv4 para abrir desde el celular):
ipconfig | findstr /R /C:"IPv4"

echo.
echo Abre en esta PC:  http://localhost:5000/app
echo Abre en otra PC/cel: http://TU_IP:5000/app
echo.

".venv\Scripts\python.exe" app.py

echo.
echo Servidor detenido.
pause
exit /b 0