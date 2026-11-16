@echo off
setlocal
title Horizon El Salvador - Iniciar
cd /d "%~dp0"

if not exist "dist\index.html" (
  echo.
  echo Falta la compilacion del juego.
  echo Ejecuta primero:  npm run build
  echo.
  pause
  exit /b 1
)

rem --- Is the preview server already running on 4173? ---
powershell -NoProfile -Command "try { $null = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:4173/' -TimeoutSec 1; exit 0 } catch { exit 1 }"
if not errorlevel 1 goto open

echo Iniciando servidor local en http://localhost:4173/ ...
start "Horizon El Salvador - Servidor (cierra esta ventana para detener)" cmd /c "npm run preview -- --port 4173 --strictPort"

rem --- Wait up to 30 seconds for the server ---
for /l %%i in (1,1,30) do (
  powershell -NoProfile -Command "try { $null = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:4173/' -TimeoutSec 1; exit 0 } catch { exit 1 }"
  if not errorlevel 1 goto open
  timeout /t 1 /nobreak >nul
)

echo.
echo El servidor no respondio. Revisa la ventana "Horizon El Salvador - Servidor".
pause
exit /b 1

:open
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --app=http://localhost:4173/ --start-maximized
) else (
  start "" http://localhost:4173/
)
exit /b 0
