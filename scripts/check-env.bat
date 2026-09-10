@echo off
rem ===================================================================
rem  GlassGem - shared environment check
rem  Called by run.bat, build.bat, run-desktop.bat and desktop.bat.
rem  Makes sure that:
rem    1. we are inside the GlassGem project folder
rem    2. Node.js (>= 20) and npm are installed and on PATH
rem    3. node_modules is present, complete, and matches package-lock.json
rem
rem  Two modes:
rem    web      (default)  needs Vite only. The Electron binary is NOT
rem                         required and its download is skipped, so the web
rem                         client works even where GitHub releases are blocked.
rem    desktop            also needs the Electron runtime (electron.exe),
rem                         which is downloaded from GitHub releases. If it is
rem                         missing the script repairs it in several ways:
rem                         the electron package's own downloader, an npm
rem                         rebuild, and finally a direct zip download that
rem                         is verified against the SHA-256 bundled in the
rem                         electron npm package (GitHub, a user mirror, or
rem                         registry.npmmirror.com as an automatic fallback).
rem
rem  Exit codes:  0 = ready   1 = error (already printed)
rem               2 = Node.js was just installed, window must be reopened
rem  Usage:  call scripts\check-env.bat [clean] [desktop]
rem ===================================================================
setlocal EnableExtensions EnableDelayedExpansion

set "MIN_NODE=20"
set "FORCE_REINSTALL="
set "REQUIRE_ELECTRON="
:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="clean" set "FORCE_REINSTALL=1"
if /i "%~1"=="desktop" set "REQUIRE_ELECTRON=1"
shift
goto :parse_args
:args_done

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
if defined REQUIRE_ELECTRON if not exist "node_modules\.bin\electron-builder.cmd" (set "NEED_INSTALL=1" & if not defined REASON set "REASON=desktop build tools are missing")
if defined REQUIRE_ELECTRON if not exist "node_modules\electron\dist\electron.exe" (set "NEED_INSTALL=1" & if not defined REASON set "REASON=Electron runtime is missing")
if defined REQUIRE_ELECTRON if not exist "node_modules\electron\path.txt" (set "NEED_INSTALL=1" & if not defined REASON set "REASON=Electron runtime registration ^(path.txt^) is missing")

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

rem The Electron binary (electron.exe) is fetched from GitHub releases by the
rem electron package's postinstall script. The web client does not need it, so
rem in web mode we skip that download entirely - this keeps "npm install"
rem working even on networks where GitHub is blocked. Desktop mode performs the
rem download (see the repair step below). The downloader ignores npm's proxy
rem config, so those settings are mapped onto the variables it understands.
if defined REQUIRE_ELECTRON (
  set "ELECTRON_SKIP_BINARY_DOWNLOAD="
  call :electron_download_env
) else (
  set "ELECTRON_SKIP_BINARY_DOWNLOAD=1"
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
if defined REQUIRE_ELECTRON if not exist "node_modules\.bin\electron-builder.cmd" (
  echo [ERROR] npm install finished but electron-builder is missing.
  goto :install_failed
)
if not exist "node_modules\electron\dist\electron.exe" (
  if defined REQUIRE_ELECTRON goto :repair_electron_binary
  echo [INFO]  The Electron runtime ^(electron.exe^) was not installed - the web
  echo         version does not need it. Use run-desktop.bat for the native app.
  goto :install_ok
)
if defined REQUIRE_ELECTRON if not exist "node_modules\electron\path.txt" goto :repair_electron_binary
goto :install_ok

rem ---------- Electron runtime repair (desktop mode only) -------------
rem The electron npm package contains JavaScript only. The real runtime
rem (electron.exe) is downloaded from GitHub releases by the package's
rem postinstall script. If that download ever failed or was interrupted,
rem "npm install" keeps reporting "up to date" and never retries it, so
rem the download is re-run explicitly here - first with the package's own
rem downloader, then with a direct, checksum-verified zip download.
:repair_electron_binary
echo.
echo [WARN]  The npm packages are installed, but the Electron runtime ^(electron.exe^)
echo         is missing. It is downloaded from GitHub releases in a separate step,
echo         and npm does not retry that download on its own. Retrying it now...
echo.
set "ELECTRON_SKIP_BINARY_DOWNLOAD="

rem Runtime present but registration (path.txt) missing or seen - just rewrite
rem it, no download needed. Electron refuses to start without this file.
if exist "node_modules\electron\dist\electron.exe" (
  <nul set /p "=electron.exe" > "node_modules\electron\path.txt"
  goto :electron_repair_done
)

if not exist "node_modules\electron\install.js" (
  echo [INFO]  The electron package itself is incomplete - forcing a full reinstall.
  call npm install --force --no-fund --no-audit
  goto :electron_repair_done
)
call node "node_modules\electron\install.js"
if errorlevel 1 (
  echo.
  echo [WARN]  The direct download failed. Asking npm to rebuild the electron package...
  call npm rebuild electron --foreground-scripts
)
if exist "node_modules\electron\dist\electron.exe" goto :electron_repair_done

rem The npm-based downloader (@electron/get) can be defeated by proxies it
rem does not understand, a corrupt cache, or an antivirus that silently
rem removes electron.exe. Fall back to downloading the official zip with
rem curl/PowerShell and verify it byte-for-byte against the SHA-256 checksum
rem bundled inside the electron npm package (npm's integrity for that package
rem is anchored in package-lock.json), which also makes the mirror fallback
rem safe.
echo.
echo [WARN]  The npm-based download did not produce electron.exe.
echo         Trying a direct, checksum-verified zip download instead...
call :fetch_electron_zip

:electron_repair_done
if not exist "node_modules\electron\path.txt" if exist "node_modules\electron\dist\electron.exe" (
  <nul set /p "=electron.exe" > "node_modules\electron\path.txt"
)
if not exist "node_modules\electron\dist\electron.exe" goto :electron_binary_failed
echo [OK]    Electron runtime restored.
goto :install_ok

:install_ok
if defined LOCK_HASH (>"!MARKER!" echo !LOCK_HASH!)
echo.
echo [OK]    Dependencies installed.
exit /b 0

:electron_binary_failed
echo.
echo [ERROR] The Electron runtime still could not be downloaded.
echo         It comes from https://github.com/electron/electron/releases
echo         ^(the files themselves are on objects.githubusercontent.com^),
echo         which are different hosts than the npm registry.
echo         The web version ^(run.bat^) works without it. Things to try for the
echo         desktop app:
echo           1. Read the error text above - it usually names the blocked host.
echo           2. Behind a proxy, set it in THIS window and run again:
echo                set HTTPS_PROXY=http://your-proxy:port
echo                run-desktop.bat
echo              ^("npm config set https-proxy" alone does NOT cover the
echo               Electron download - this script maps it automatically.^)
echo           3. If GitHub is blocked for you, download from a mirror instead:
echo                set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/
echo                run-desktop.bat    ^(try again in the same terminal window^)
echo              Make it permanent:
echo                npm config set electron_mirror https://registry.npmmirror.com/-/binary/electron/
echo              Mirrored zips are verified against the SHA-256 bundled in the
echo              electron npm package, so they are identical to the GitHub ones.
echo           4. Antivirus can silently quarantine electron.exe right after the
echo              download - allow the project folder, then run:   run-desktop.bat clean
echo           5. Fully manual: download electron-v^<version^>-win32-^<arch^>.zip from
echo              a mirror, extract it into node_modules\electron\dist, and put a
echo              path.txt containing only "electron.exe" next to the dist folder.
exit /b 1

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
echo           3. If you are behind a proxy:  set HTTPS_PROXY=http://your-proxy:port
echo              in the same window before running this script ^(that covers both
echo              npm and the separate Electron download^).
echo           4. Desktop install failing on the Electron download? The web version
echo              ^(run.bat^) works without it, or set an Electron mirror:
echo                set ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/
exit /b 1

rem ====================================================================
rem  :electron_download_env
rem  The Electron downloader (@electron/get) does NOT honor npm's proxy
rem  config. It only uses a proxy when ELECTRON_GET_USE_PROXY=1 is set,
rem  and then reads HTTP(S)_PROXY (it maps those onto its GLOBAL_AGENT_*
rem  variables itself). Map the usual proxy settings across so a proxy
rem  that already works for npm also works for the Electron download,
rem  and adopt a permanent electron_mirror from the npm config so the
rem  direct-download fallback below uses it as well.
rem ====================================================================
:electron_download_env
set "GG_PROXY="
if defined HTTPS_PROXY set "GG_PROXY=%HTTPS_PROXY%"
if not defined GG_PROXY if defined https_proxy set "GG_PROXY=%https_proxy%"
if not defined GG_PROXY if defined HTTP_PROXY set "GG_PROXY=%HTTP_PROXY%"
if not defined GG_PROXY if defined http_proxy set "GG_PROXY=%http_proxy%"
if not defined GG_PROXY (
  for /f "delims=" %%p in ('call npm config get https-proxy 2^>nul') do (
    if not defined GG_PROXY if /i not "%%p"=="null" if /i not "%%p"=="undefined" set "GG_PROXY=%%p"
  )
)
if defined GG_PROXY (
  if not defined ELECTRON_GET_USE_PROXY set "ELECTRON_GET_USE_PROXY=1"
  if not defined GLOBAL_AGENT_HTTPS_PROXY set "GLOBAL_AGENT_HTTPS_PROXY=!GG_PROXY!"
  if not defined GLOBAL_AGENT_HTTP_PROXY set "GLOBAL_AGENT_HTTP_PROXY=!GG_PROXY!"
  echo [INFO]  Using proxy !GG_PROXY! for the Electron download.
)
if not defined ELECTRON_MIRROR (
  for /f "delims=" %%m in ('call npm config get electron_mirror 2^>nul') do (
    if not defined ELECTRON_MIRROR if /i not "%%m"=="null" if /i not "%%m"=="undefined" set "ELECTRON_MIRROR=%%m"
  )
)
exit /b 0

rem ====================================================================
rem  :fetch_electron_zip
rem  Downloads electron-v<version>-win32-<arch>.zip without @electron/get.
rem  Sources are tried in this order:
rem    1. a user-defined mirror (ELECTRON_MIRROR / npm electron_mirror)
rem    2. github.com (the official release host)
rem    3. registry.npmmirror.com (a full mirror of the GitHub releases)
rem  Every download is verified against the SHA-256 checksum that ships
rem  inside the electron npm package (checksums.json) - the same anchor
rem  the official installer uses - so a mirror cannot serve other bytes
rem  than the official GitHub release.
rem ====================================================================
:fetch_electron_zip
set "EL_VER="
for /f "delims=" %%v in ('node -p "try{require('./node_modules/electron/package.json').version}catch(e){''}" 2^>nul') do set "EL_VER=%%v"
if not defined EL_VER (
  echo [WARN]  Could not read the Electron version from node_modules\electron.
  exit /b 1
)
set "EL_ARCH=x64"
for /f "delims=" %%a in ('node -p "process.arch" 2^>nul') do set "EL_ARCH=%%a"
set "EL_FILE=electron-v!EL_VER!-win32-!EL_ARCH!.zip"
set "EL_ZIP=%TEMP%\!EL_FILE!"
set "EL_SUM="
for /f "delims=" %%h in ('node -p "try{require('./node_modules/electron/checksums.json')['!EL_FILE!']||''}catch(e){''}" 2^>nul') do set "EL_SUM=%%h"
if not defined EL_SUM echo [WARN]  No bundled checksum for !EL_FILE! - the download cannot be verified.

if defined ELECTRON_MIRROR (
  set "EL_BASE=!ELECTRON_MIRROR!"
  if not "!EL_BASE:~-1!"=="/" set "EL_BASE=!EL_BASE!/"
  call :fetch_electron_zip_from "!EL_BASE!v!EL_VER!/!EL_FILE!"
  if exist "node_modules\electron\dist\electron.exe" exit /b 0
)

call :fetch_electron_zip_from "https://github.com/electron/electron/releases/download/v!EL_VER!/!EL_FILE!"
if exist "node_modules\electron\dist\electron.exe" exit /b 0

echo(!ELECTRON_MIRROR! | findstr /i /c:"npmmirror.com" >nul || (
  echo.
  echo [INFO]  github.com seems unreachable, trying the Electron mirror at
  echo         registry.npmmirror.com ^(still verified against the official
  echo         SHA-256 bundled in the electron npm package^)...
  call :fetch_electron_zip_from "https://registry.npmmirror.com/-/binary/electron/v!EL_VER!/!EL_FILE!"
)
if exist "node_modules\electron\dist\electron.exe" exit /b 0
exit /b 1

rem ====================================================================
rem  :fetch_electron_zip_from <url>   helper used by :fetch_electron_zip
rem  Downloads one URL with curl.exe ^(Windows 10+^) or, if curl is
rem  missing, with PowerShell ^(which honors the system proxy^), verifies
rem  the SHA-256, extracts into node_modules\electron\dist and writes the
rem  path.txt registration file Electron needs to start.
rem ====================================================================
:fetch_electron_zip_from
set "EL_URL=%~1"
echo.
echo [INFO]  Downloading !EL_FILE!
echo         from !EL_URL!
if exist "!EL_ZIP!" del /f /q "!EL_ZIP!" >nul 2>nul
set "EL_HAVE_CURL="
set "EL_HAVE_TAR="
where curl >nul 2>nul && set "EL_HAVE_CURL=1"
where tar >nul 2>nul && set "EL_HAVE_TAR=1"
if defined EL_HAVE_CURL (
  curl -fL --connect-timeout 20 --retry 2 -o "!EL_ZIP!" "!EL_URL!"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '!EL_URL!' -OutFile '!EL_ZIP!' -UseBasicParsing"
)
if errorlevel 1 (
  echo [WARN]  The download failed.
  del /f /q "!EL_ZIP!" >nul 2>nul
  exit /b 1
)
if not exist "!EL_ZIP!" (
  echo [WARN]  The download produced no file.
  exit /b 1
)

if defined EL_SUM (
  set "EL_ACTUAL="
  for /f "skip=1 tokens=* delims=" %%h in ('certutil -hashfile "!EL_ZIP!" SHA256 2^>nul ^| findstr /v /i "certutil"') do (
    if not defined EL_ACTUAL set "EL_ACTUAL=%%h"
  )
  if /i not "!EL_ACTUAL!"=="!EL_SUM!" (
    echo [ERROR] Checksum mismatch for !EL_FILE! - the file has been discarded.
    echo         Something between you and the download host modified it.
    del /f /q "!EL_ZIP!" >nul 2>nul
    exit /b 1
  )
  echo [OK]    SHA-256 matches the checksum bundled with the electron npm package.
)

echo [INFO]  Extracting into node_modules\electron\dist ...
if exist "node_modules\electron\dist\" rmdir /s /q "node_modules\electron\dist" >nul 2>nul
mkdir "node_modules\electron\dist" 2>nul
rem tar.exe on Windows is bsdtar and unzips fine, but GNU tar (e.g. the one
rem shipped with Git for Windows) cannot - so fall back to PowerShell.
set "EL_EXTRACT_OK="
if defined EL_HAVE_TAR (
  tar -xf "!EL_ZIP!" -C "node_modules\electron\dist" >nul 2>&1 && set "EL_EXTRACT_OK=1"
)
if not defined EL_EXTRACT_OK (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '!EL_ZIP!' -DestinationPath 'node_modules\electron\dist' -Force" && set "EL_EXTRACT_OK=1"
)
if not defined EL_EXTRACT_OK (
  echo [WARN]  Could not extract the zip.
  del /f /q "!EL_ZIP!" >nul 2>nul
  exit /b 1
)
del /f /q "!EL_ZIP!" >nul 2>nul
<nul set /p "=electron.exe" > "node_modules\electron\path.txt"
if not exist "node_modules\electron\dist\electron.exe" (
  echo [ERROR] electron.exe is still missing right after the extraction.
  echo         This usually means antivirus software quarantined it - allow this
  echo         project folder in your antivirus, then run:   run-desktop.bat clean
  exit /b 1
)
exit /b 0
