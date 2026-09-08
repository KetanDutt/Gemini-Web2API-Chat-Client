@echo off
rem ===================================================================
rem  GlassGem - start the development server (Windows)
rem
rem  Double-click this file, or from a terminal:
rem      run.bat            start GlassGem
rem      run.bat clean      delete node_modules, reinstall, then start
rem      run.bat mock       also start the mock Web2API server (for UI testing)
rem      run.bat /?         show this help
rem ===================================================================
setlocal EnableExtensions
title GlassGem

cd /d "%~dp0" 2>nul
if errorlevel 1 (
  echo [ERROR] Could not open the project folder "%~dp0".
  pause
  exit /b 1
)

set "CLEAN="
set "MOCK="
:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="clean"  set "CLEAN=clean"
if /i "%~1"=="mock"   set "MOCK=1"
if /i "%~1"=="/?"     goto :help
if /i "%~1"=="-h"     goto :help
if /i "%~1"=="--help" goto :help
shift
goto :parse_args
:args_done

echo.
echo   =============================================
echo     GlassGem  -  Your personal Gemini workspace
echo   =============================================
echo.

rem ---------- environment + dependencies ------------------------------
call "scripts\check-env.bat" %CLEAN%
set "RC=%errorlevel%"
if "%RC%"=="2" (
  echo.
  pause
  exit /b 0
)
if not "%RC%"=="0" goto :fail

rem ---------- optional mock Web2API -----------------------------------
set "WEB2API=http://127.0.0.1:8081"
if defined GLASSGEM_WEB2API_URL set "WEB2API=%GLASSGEM_WEB2API_URL%"
if defined MOCK (
  echo [INFO]  Starting the mock Web2API server in a separate window on port 8081.
  echo         It only returns sample answers - use it to try the UI without Gemini.
  start "GlassGem - Mock Web2API" cmd /k node "scripts\mock-web2api.mjs" 8081
  timeout /t 2 /nobreak >nul
)

rem ---------- is Web2API reachable? (informational only) --------------
where curl >nul 2>nul
if errorlevel 1 (
  echo [INFO]  Make sure Gemini Web2API is running at %WEB2API% before chatting.
) else (
  curl -s -o nul -m 3 "%WEB2API%/v1/models" >nul 2>nul
  if errorlevel 1 (
    echo [WARN]  Gemini Web2API does not answer at %WEB2API%.
    echo         GlassGem will start anyway and reconnect automatically once Web2API is running.
  ) else (
    echo [OK]    Gemini Web2API is reachable at %WEB2API%.
  )
)

rem ---------- port check ---------------------------------------------
set "PORT=5173"
set "PORT_BUSY="
netstat -ano 2>nul | findstr /r /c:":%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 set "PORT_BUSY=1"
if defined PORT_BUSY (
  echo [INFO]  Port %PORT% is already in use - Vite will choose the next free port.
  echo         Open the address shown after "Local:" below.
) else (
  start "" /b cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:%PORT%"
)

echo.
echo   Starting the GlassGem dev server...  Press Ctrl+C in this window to stop it.
echo.
call npm run dev
set "RC=%errorlevel%"
if not "%RC%"=="0" (
  echo.
  echo [ERROR] The dev server stopped with exit code %RC%.
  echo         Read the message above. Typical fixes:
  echo           - Dependency problems:   run.bat clean
  echo           - Port conflicts:        close the other program using the port
  echo           - Corrupted cache:       delete the node_modules\.vite folder
  goto :fail
)
echo.
echo   GlassGem stopped.
pause
exit /b 0

:help
echo.
echo   run.bat [clean] [mock]
echo.
echo     clean   remove node_modules and reinstall before starting
echo     mock    also start the mock Web2API server ^(sample answers only^)
echo.
echo   Environment: set GLASSGEM_WEB2API_URL to override the Web2API address
echo   that is checked at startup ^(default http://127.0.0.1:8081^).
echo.
pause
exit /b 0

:fail
echo.
echo   GlassGem could not start. See the messages above.
echo.
pause
exit /b 1
