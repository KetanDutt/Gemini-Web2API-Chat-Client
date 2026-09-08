@echo off
rem ===================================================================
rem  GlassGem - shared environment check
rem  Called by run.bat and build.bat. Makes sure that:
rem    1. we are inside the GlassGem project folder
rem    2. Node.js (>= 20) and npm are installed and on PATH
rem    3. node_modules is present, complete (including Electron), and matches package-lock.json
rem  Exit codes:  0 = ready   1 = error (already printed)
rem               2 = Node.js was just installed, window must be reopened
rem  Usage:  call scripts\check-env.bat [clean]
rem ===================================================================
setlocal EnableExtensions EnableDelayedExpansion

set "MIN_NODE=20"
set "FORCE_REINSTALL="
if /i "%~1"=="clean" set "FORCE_REINSTALL=1"

rem ---------- 1. project folder ---------------------------------------
if not exist "package.json" (
  echo [ERROR] package.json was not found in "%CD%".
  echo         Run run.bat / build.bat from the GlassGem project folder.
  exit /b 1
)
findstr /i /c:"glassgem" package.json >nul 2>nul
if errorlevel 1 (
  echo [WARN]  This does not look like the GlassGem package.json - continuing anyway.
)

rem ---------- 2. Node.js + npm ----------------------------------------
where node >nul 2>nul
if errorlevel 1 goto :no_node

set "NODE_VER="
set "NODE_MAJOR="
for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
for /f "tokens=1 delims=v." %%a in ("!NODE_VER!") do set "NODE_MAJOR=%%a"
if not defined NODE_MAJOR (
  echo [ERROR] Could not determine the Node.js version. Output of "node -v" was: "!NODE_VER!"
  echo         Reinstall Node.js LTS from https://nodejs.org and try again.
  exit /b 1
)
if !NODE_MAJOR! LSS %MIN_NODE% (
  echo [ERROR] Node.js !NODE_VER! is too old. GlassGem needs Node.js %MIN_NODE% or newer.
  echo         Download the current LTS from https://nodejs.org and run this file again.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found even though Node.js is installed.
  echo         Repair or reinstall Node.js from https://nodejs.org - npm ships with it.
  exit /b 1
)
set "NPM_VER=unknown"
for /f "delims=" %%v in ('call npm -v 2^>nul') do set "NPM_VER=%%v"
echo [OK]    Node.js !NODE_VER!  ^|  npm !NPM_VER!

rem ---------- 3. dependencies -----------------------------------------
set "NEED_INSTALL="
set "REASON="
if defined FORCE_REINSTALL         (set "NEED_INSTALL=1" & set "REASON=clean install requested")
if not exist "node_modules\"       (set "NEED_INSTALL=1" & set "REASON=node_modules is missing - first run")
if not exist "node_modules\.bin\vite.cmd" (set "NEED_INSTALL=1" & if not defined REASON set "REASON=node_modules is incomplete")
if not exist "node_modules\.bin\electron-builder.cmd" (set "NEED_INSTALL=1" & if not defined REASON set "REASON=desktop build tools are missing")
if not exist "node_modules\electron\dist\electron.exe" (set "NEED_INSTALL=1" & if not defined REASON set "REASON=Electron runtime is missing")

rem Fingerprint package-lock.json so we reinstall automatically after an update.
set "LOCK_HASH="
if exist "package-lock.json" (
  for /f "skip=1 tokens=* delims=" %%h in ('certutil -hashfile package-lock.json SHA256 2^>nul ^| findstr /v /i "certutil"') do (
    if not defined LOCK_HASH set "LOCK_HASH=%%h"
  )
)
set "MARKER=node_modules\.glassgem-deps"
if not defined NEED_INSTALL if defined LOCK_HASH (
  set "SAVED_HASH="
  if exist "!MARKER!" set /p SAVED_HASH=<"!MARKER!"
  if not "!SAVED_HASH!"=="!LOCK_HASH!" (
    set "NEED_INSTALL=1"
    set "REASON=package-lock.json changed since the last install"
  )
)

if not defined NEED_INSTALL (
  echo [OK]    Dependencies are up to date.
  exit /b 0
)

echo [INFO]  Installing dependencies: !REASON!.
echo         This needs an internet connection and can take a minute or two.
echo.
if defined FORCE_REINSTALL if exist "node_modules\" (
  echo         Removing the old node_modules folder...
  rmdir /s /q "node_modules" 2>nul
  if exist "node_modules\" (
    echo [ERROR] Could not remove node_modules. Close editors/terminals that use this folder and try again.
    exit /b 1
  )
)

call npm install --no-fund --no-audit
if errorlevel 1 (
  echo.
  echo [WARN]  npm install failed. Verifying the npm cache and retrying once...
  call npm cache verify >nul 2>nul
  call npm install --no-fund --no-audit
)
if errorlevel 1 goto :install_failed
if not exist "node_modules\.bin\vite.cmd" (
  echo [ERROR] npm install finished but node_modules looks incomplete.
  goto :install_failed
)
if not exist "node_modules\.bin\electron-builder.cmd" (
  echo [ERROR] npm install finished but electron-builder is missing.
  goto :install_failed
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo [ERROR] npm install finished but the Electron runtime is missing.
  echo         Run the install again with a working connection to GitHub releases.
  goto :install_failed
)
if defined LOCK_HASH (>"!MARKER!" echo !LOCK_HASH!)
echo.
echo [OK]    Dependencies installed.
exit /b 0

rem ---------- error handlers ------------------------------------------
:no_node
echo [ERROR] Node.js is not installed or is not on your PATH.
where winget >nul 2>nul
if errorlevel 1 (
  echo         Download Node.js LTS from https://nodejs.org, install it, then run this file again.
  exit /b 1
)
echo.
choice /c YN /n /m "        Install Node.js LTS now using winget? [Y/N] "
if errorlevel 2 (
  echo         Download Node.js LTS from https://nodejs.org, install it, then run this file again.
  exit /b 1
)
echo.
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
  echo.
  echo [ERROR] winget could not install Node.js. Install it manually from https://nodejs.org
  exit /b 1
)
echo.
echo [OK]    Node.js was installed. Please CLOSE this window and run the script again
echo         so that the new PATH is picked up.
exit /b 2

:install_failed
echo.
echo [ERROR] Could not install the project dependencies.
echo         Common causes:
echo           - No internet connection, or a proxy/firewall blocking registry.npmjs.org
echo           - Antivirus software locking files inside node_modules
echo           - A previous install that was interrupted
echo         Things to try:
echo           1. Run again with a clean install:   run.bat clean   or   build.bat clean
echo           2. Check the npm error text above for the real cause
echo           3. If you are behind a proxy:  npm config set proxy http://your-proxy:port
exit /b 1
