@echo off
title GlassGem (production)
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
if not exist dist (
  echo Building GlassGem...
  call npm run build
)
echo Serving the production build on http://localhost:4173
start "" http://localhost:4173
call npm run preview
pause
