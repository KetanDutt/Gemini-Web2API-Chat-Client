```bat
@echo off
title Gemini Web2API

cd /d "%~dp0"

echo ========================================
echo       Gemini Web2API Server
echo ========================================
echo.
echo Starting server...
echo.

.\gemini-web2api.exe --port 8081 --cookie-file cookie.txt

echo.
echo ========================================
echo Server stopped.
echo Press any key to close...
echo ========================================
pause >nul
```
