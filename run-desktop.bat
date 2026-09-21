@echo off
rem ===================================================================
rem  GlassGem Desktop - start the native Windows app (Electron)
rem
rem  Double-click this file, or from a terminal:
rem      run-desktop.bat           start the desktop app (Vite + Electron)
rem      run-desktop.bat clean     reinstall dependencies first, then start
rem      run-desktop.bat mock      also start the mock Web2API server
rem      run-desktop.bat /?        show this help
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

rem ---------- ensure gemini-web2api is present and running -----------
set "WEB2API=http://127.0.0.1:8081"
if defined GLASSGEM_WEB2API_URL set "WEB2API=%GLASSGEM_WEB2API_URL%"
if defined MOCK (
  echo [INFO]  Starting the mock Web2API server in a separate window on port 8081.
  echo         It only returns sample answers - use it to try the UI without Gemini.
  start "GlassGem - Mock Web2API" cmd /k node "scripts\mock-web2api.mjs" 8081
  timeout /t 2 /nobreak >nul
) else (
  echo [INFO]  Ensuring Gemini Web2API is present and running...
  call node "scripts\ensure-web2api.mjs"
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
pause
exit /b 0

:help
echo.
echo   run-desktop.bat [clean] [mock]
echo.
echo     clean   remove node_modules and reinstall before starting
echo     mock    also start the mock Web2API server ^(sample answers only^)
echo.
echo   Starts GlassGem as a native Windows window (Electron) with hot reload.
echo   The browser/PWA version is started by run.bat instead.
echo.
echo   Environment: set GLASSGEM_WEB2API_URL to override the Web2API address
echo   that is checked at startup ^(default http://127.0.0.1:8081^).
echo.
pause
exit /b 0

:fail
echo.
echo   GlassGem Desktop could not start. See the messages above.
echo.
pause
exit /b 1
