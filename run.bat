@echo off
title GlassGem
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js was not found. Please install it from https://nodejs.org (LTS) and run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing GlassGem dependencies (first run only)...
  call npm install
  if %errorlevel% neq 0 (
    echo npm install failed. Check the messages above.
    pause
    exit /b 1
  )
)

echo.
echo Starting GlassGem...  Make sure Gemini Web2API is running at http://127.0.0.1:8081
echo Press Ctrl+C in this window to stop GlassGem.
echo.
start "" http://localhost:5173
call npm run dev
pause
