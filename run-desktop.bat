@echo off
rem ===================================================================
rem  GlassGem Desktop - start the native Windows app (Electron)
rem
rem  Double-click this file, or from a terminal:
rem      run-desktop.bat           start the desktop app (Vite + Electron)
rem      run-desktop.bat clean     reinstall dependencies first, then start
rem      run-desktop.bat mock      start with the mock Web2API server
rem      run-desktop.bat stop      stop the background Web2API server and exit
rem      run-desktop.bat /?        show this help
rem
rem   The Web2API server is started together with the desktop app and
rem   stopped again when the app window (or this window) closes. A server
rem   that was already running beforehand is left untouched. Use
rem   "run-desktop.bat stop" to stop any managed server manually.
rem
rem  For the browser/PWA version use run.bat instead - it does not need
rem  Electron and therefore no access to github.com.
rem
rem  The desktop app needs the Electron runtime (electron.exe), which is
rem  downloaded from https://github.com/electron/electron/releases the
rem  first time. If your network blocks GitHub, set a mirror first:
rem      set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/
rem ===================================================================
setlocal EnableExtensions
title GlassGem Desktop

cd /d "%~dp0" 2>nul
if errorlevel 1 (
  echo [ERROR] Could not open the project folder "%~dp0".
  pause
  exit /b 1
)

set "CLEAN="
set "MOCK="
set "STOP="
:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="clean"  set "CLEAN=clean"
if /i "%~1"=="mock"   set "MOCK=1"
if /i "%~1"=="stop"   set "STOP=1"
if /i "%~1"=="/?"     goto :help
if /i "%~1"=="-h"     goto :help
if /i "%~1"=="--help" goto :help
shift
goto :parse_args
:args_done

if defined STOP goto :stop_web2api

echo.
echo   =============================================
echo     GlassGem Desktop  -  native Windows app
echo   =============================================
echo.

rem ---------- environment + dependencies (Electron required) ----------
call "scripts\check-env.bat" %CLEAN% desktop
set "RC=%errorlevel%"
if "%RC%"=="2" (
  echo.
  pause
  exit /b 0
)
if not "%RC%"=="0" goto :fail

rem ---------- gemini-web2api lifecycle --------------------------------
rem The desktop session (scripts\desktop-dev.mjs) ensures Gemini Web2API is
rem present and running before the app starts, prints the same status here,
rem and stops the server again when the app window closes. A server that was
rem already running beforehand is left untouched.
if defined MOCK (
  echo [INFO]  Starting GlassGem with the MOCK Web2API server ^(sample answers only^).
  echo         It stops automatically together with the app.
  set "GLASSGEM_DESKTOP_MOCK=1"
) else (
  echo [INFO]  Ensuring Gemini Web2API is present and running...
  echo         ^(first run: downloads or builds the server - can take a minute^)
  echo         The server is stopped automatically when the app closes.
)

echo.
echo   Starting the GlassGem desktop app...  Close its window to stop it.
echo.
call npm run desktop:dev
set "RC=%errorlevel%"
if not "%RC%"=="0" (
  echo.
  echo [ERROR] The desktop app stopped with exit code %RC%.
  echo         Read the message above. Typical fixes:
  echo           - Dependency problems:   run-desktop.bat clean
  echo           - Port conflicts:        close the other program using the port
  goto :fail
)
echo.
echo   GlassGem Desktop stopped.
echo   Any Web2API server started with it was stopped automatically.
pause
exit /b 0

:stop_web2api
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or is not on your PATH.
  pause
  exit /b 1
)
call node "scripts\stop-web2api.mjs"
set "RC=%errorlevel%"
pause
exit /b %RC%

:help
echo.
echo   run-desktop.bat [clean] [mock] [stop]
echo.
echo     clean   remove node_modules and reinstall before starting
echo     mock    start with the mock Web2API server ^(sample answers only^)
echo     stop    stop the background Web2API server and exit
echo.
echo   Starts GlassGem as a native Windows window (Electron) with hot reload.
echo   The browser/PWA version is started by run.bat instead.
echo.
echo   The Web2API server is started with the desktop session and stopped
echo   again when the app window closes. A server that was already running
echo   beforehand ^(npm run web2api, a service^) is left untouched.
echo.
echo   Environment: set GLASSGEM_WEB2API_URL to override the Web2API address
echo   that is checked at startup ^(default http://127.0.0.1:8081^). Its port
echo   is also used when GlassGem starts the server itself.
echo   Set GLASSGEM_SKIP_AUTO_WEB2API=1 to never auto-start the server.
echo.
pause
exit /b 0

:fail
echo.
echo   GlassGem Desktop could not start. See the messages above.
echo.
pause
exit /b 1
