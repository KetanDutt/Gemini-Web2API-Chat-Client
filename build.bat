@echo off
rem ===================================================================
rem  GlassGem - create a production build (Windows)
rem
rem  Double-click this file, or from a terminal:
rem      build.bat            type-check + build into the dist folder
rem      build.bat clean      reinstall dependencies first, then build
rem      build.bat preview    build and start the local preview server
rem      build.bat /?         show this help
rem ===================================================================
setlocal EnableExtensions
title GlassGem - build

cd /d "%~dp0" 2>nul
if errorlevel 1 (
  echo [ERROR] Could not open the project folder "%~dp0".
  pause
  exit /b 1
)

set "CLEAN="
set "PREVIEW="
:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="clean"   set "CLEAN=clean"
if /i "%~1"=="preview" set "PREVIEW=1"
if /i "%~1"=="serve"   set "PREVIEW=1"
if /i "%~1"=="/?"      goto :help
if /i "%~1"=="-h"      goto :help
if /i "%~1"=="--help"  goto :help
shift
goto :parse_args
:args_done

echo.
echo   =============================================
echo     GlassGem  -  production build
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

rem ---------- type-check ---------------------------------------------
echo.
echo [1/2]   Type-checking...
call npm run typecheck
if errorlevel 1 (
  echo.
  echo [ERROR] TypeScript reported errors. Each line above shows  file^(line,column^): message.
  echo         Fix them and run build.bat again.
  goto :fail
)
echo [OK]    No type errors.

rem ---------- bundle -------------------------------------------------
echo.
echo [2/2]   Building the optimized bundle...
call npx vite build
if errorlevel 1 (
  echo.
  echo [ERROR] The Vite build failed. Read the message above.
  echo         If it mentions a missing module, try:  build.bat clean
  goto :fail
)
if not exist "dist\index.html" (
  echo [ERROR] The build finished but dist\index.html is missing - the output folder is incomplete.
  goto :fail
)

echo.
echo [OK]    Build complete.
echo         Output folder:  %CD%\dist
echo.
echo         To run it:  npm run preview   ^(or build.bat preview^)
echo         The preview server includes the local Web2API proxy, so the API
echo         settings inside GlassGem stay the same.
echo.

if defined PREVIEW goto :preview
choice /c YN /n /t 20 /d N /m "  Start the local preview server now to test the build? [Y/N] - auto-No in 20s: "
if errorlevel 2 goto :done

:preview
set "PORT=4173"
netstat -ano 2>nul | findstr /r /c:":%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo [INFO]  Port %PORT% is already in use - Vite will choose the next free port.
  echo         Open the address shown after "Local:" below.
) else (
  start "" /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:%PORT%"
)
echo.
echo   Serving the production build...  Press Ctrl+C in this window to stop it.
echo.
call npm run preview
set "RC=%errorlevel%"
if not "%RC%"=="0" (
  echo.
  echo [ERROR] The preview server stopped with exit code %RC%.
  goto :fail
)

:done
echo.
pause
exit /b 0

:help
echo.
echo   build.bat [clean] [preview]
echo.
echo     clean     remove node_modules and reinstall before building
echo     preview   start the local preview server after a successful build
echo.
pause
exit /b 0

:fail
echo.
echo   Build did not complete. See the messages above.
echo.
pause
exit /b 1
