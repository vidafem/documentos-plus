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
echo y pegala en FISCALIA_PROXY_URL en tu proyecto de Vercel.
echo.
echo NOTA PARA VERCEL:
echo En Vercel: Project -^> Deployments -^> clic en los tres puntos (...) -^> Redeploy
echo Asi se activara al instante para TI y para TODOS tus pasantes sin configurar nada en sus navegadores.
echo =======================================================
echo.

cloudflared tunnel --url http://127.0.0.1:3005
pause
