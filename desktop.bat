@echo off
rem ===================================================================
rem  GlassGem - Windows desktop app
rem
rem  desktop.bat dev       run the Electron app with Vite hot reload
rem  desktop.bat build     create the Windows NSIS installer + portable exe
rem  desktop.bat portable  create only the portable Windows exe
rem  desktop.bat pack      create an unpacked Windows app directory
rem  desktop.bat clean     reinstall dependencies, then build the installer
rem  desktop.bat /?        show this help
rem ===================================================================
setlocal EnableExtensions
title GlassGem - Windows desktop app

cd /d "%~dp0" 2>nul
if errorlevel 1 (
  echo [ERROR] Could not open the project folder "%~dp0".
  pause
  exit /b 1
)

set "COMMAND=%~1"
if /i "%COMMAND%"=="/?" goto :help
if /i "%COMMAND%"=="-h" goto :help
if /i "%COMMAND%"=="--help" goto :help
if /i "%COMMAND%"=="dev" goto :dev
if /i "%COMMAND%"=="build" goto :build
if /i "%COMMAND%"=="portable" goto :portable
if /i "%COMMAND%"=="pack" goto :pack
if /i "%COMMAND%"=="clean" goto :clean
if "%COMMAND%"=="" goto :help

echo [ERROR] Unknown command "%COMMAND%".
goto :help

:dev
call :check_environment
if errorlevel 1 goto :fail
call npm run desktop:dev
set "RC=%errorlevel%"
if not "%RC%"=="0" goto :fail
exit /b 0

:build
call :check_environment
if errorlevel 1 goto :fail
call npm run desktop:build
set "RC=%errorlevel%"
if not "%RC%"=="0" goto :fail
goto :success

:portable
call :check_environment
if errorlevel 1 goto :fail
call npm run desktop:build:portable
set "RC=%errorlevel%"
if not "%RC%"=="0" goto :fail
goto :success

:pack
call :check_environment
if errorlevel 1 goto :fail
call npm run desktop:pack
set "RC=%errorlevel%"
if not "%RC%"=="0" goto :fail
goto :success

:clean
call "scripts\check-env.bat" clean desktop
if errorlevel 1 goto :fail
call npm run desktop:build
set "RC=%errorlevel%"
if not "%RC%"=="0" goto :fail
goto :success

:check_environment
call "scripts\check-env.bat" desktop
exit /b %errorlevel%

:success
echo.
echo [OK]    Windows desktop build complete.
echo         Installer and portable output: %CD%\release
echo         The installed app does not require Node.js or a browser.
echo.
exit /b 0

:help
echo.
echo   desktop.bat ^<command^>
echo.
echo     dev       run GlassGem as a native Electron app with Vite hot reload
echo     build     create the NSIS installer and a portable x64 executable
echo     portable  create only the portable x64 executable
echo     pack      create an unpacked Windows app directory for testing
echo     clean     reinstall npm dependencies before building the installer
echo.
echo   In dev mode the Web2API server is started with the session and stopped
echo   again when the app closes. GlassGem's embedded desktop proxy keeps the
echo   same API settings and avoids CORS.
echo.
pause
exit /b 0

:fail
echo.
echo [ERROR] The Windows desktop command did not complete.
echo         Read the messages above for the suggested fix.
echo.
pause
exit /b 1
