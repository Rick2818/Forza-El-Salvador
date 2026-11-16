@echo off
:: Este archivo agrega "horizon.local" al archivo hosts de Windows
:: para que puedas acceder al juego con http://horizon.local:5173/
:: 
:: IMPORTANTE: Haz clic derecho sobre este archivo y selecciona
:: "Ejecutar como administrador" para que funcione.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Este script requiere permisos de administrador.
    echo.
    echo Haz clic derecho sobre el archivo y selecciona
    echo "Ejecutar como administrador".
    echo.
    pause
    exit /b 1
)

echo.
echo Agregando horizon.local al archivo hosts...

findstr /C:"horizon.local" "C:\Windows\System32\drivers\etc\hosts" >nul 2>&1
if %errorlevel% equ 0 (
    echo La entrada ya existe.
) else (
    echo 127.0.0.1    horizon.local >> "C:\Windows\System32\drivers\etc\hosts"
    echo Entrada agregada exitosamente.
)

echo.
echo Ahora puedes acceder al juego con:
echo http://horizon.local:5173/
echo.
pause