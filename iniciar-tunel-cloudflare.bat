@echo off
title Tunel Cloudflare - Fiscalia Ecuador
color 0b

echo =======================================================
echo     TUNEL DE CLOUDFLARE PARA FISCALIA (SIAF ONLINE)
echo =======================================================
echo.
echo 1. Iniciando servidor puente local en puerto 3005...
start /b node fiscalia-bridge.js

timeout /t 2 /nobreak >nul

echo.
echo 2. Estableciendo Tunel de Cloudflare...
echo Copia la URL https://xxxx.trycloudflare.com que aparecera abajo
echo y colocala en FISCALIA_PROXY_URL en tu proyecto de Vercel.
echo.
echo =======================================================
echo.

cloudflared tunnel --url http://127.0.0.1:3005
pause
