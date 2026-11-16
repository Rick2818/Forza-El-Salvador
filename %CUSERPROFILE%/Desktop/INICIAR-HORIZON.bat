@echo off
title Horizon REA 2026 - Servidor de Desarrollo
cd /d "C:\Users\Ricardo\Documents\Boltech Group\Plan Comercial tipo Relevance AI\Horizon-REA-2026"
echo.
echo Iniciando servidor Horizon REA 2026...
echo.
echo Servidor disponible en:
echo   http://127.0.0.1:5173/
echo.
echo (Si da error de puerto ocupado, cierra cualquier instancia previa de vite)
echo.
npm run dev
echo.
pause