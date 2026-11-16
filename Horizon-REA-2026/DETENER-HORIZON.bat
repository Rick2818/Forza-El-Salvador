@echo off
setlocal
title Horizon El Salvador - Detener servidor
echo Deteniendo el servidor local de Horizon El Salvador en el puerto 4173...
set "FOUND="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4173" ^| findstr "LISTENING"') do (
  set "FOUND=1"
  taskkill /PID %%a /F >nul 2>&1
)
if defined FOUND (
  echo Servidor detenido.
) else (
  echo No habia ningun servidor escuchando en el puerto 4173.
)
timeout /t 2 /nobreak >nul
exit /b 0
