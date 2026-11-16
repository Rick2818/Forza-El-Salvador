@echo off
title Horizon El Salvador - Iniciar App (Preview)
cd /d "C:\Users\Ricardo\Documents\Boltech Group\Plan Comercial tipo Relevance AI\Horizon-REA-2026"
echo.
echo [Horizon El Salvador] Iniciando visualización de la app...
echo.
echo La app se abrirá en: http://127.0.0.1:4173/
echo.
vite preview --port 4173 --strictPort
echo.
echo Visualización terminada.
pause