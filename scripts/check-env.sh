#!/usr/bin/env bash
# ===================================================================
#  GlassGem - shared environment check (Linux / macOS)
#  Called by run.sh, build.sh.
#  Makes sure that:
#    1. we are inside the GlassGem project folder
#    2. Node.js (>= 20) and npm are installed and on PATH
#    3. node_modules is present, complete, and matches package-lock.json
# ===================================================================
set -e

MIN_NODE=20
FORCE_REINSTALL=0
REQUIRE_ELECTRON=0

for arg in "$@"; do
  case "$arg" in
    clean)
      FORCE_REINSTALL=1
      ;;
    desktop)
      REQUIRE_ELECTRON=1
      ;;
  esac
done

# 1. Project folder
if [ ! -f "package.json" ]; then
  echo "[ERROR] package.json was not found in $(pwd)." >&2
  echo "        Run run.sh / build.sh from the GlassGem project folder." >&2
  exit 1
fi

if ! grep -qi "glassgem" package.json; then
  echo "[WARN]  This does not look like the GlassGem package.json - continuing anyway."
fi

# 2. Node.js + npm
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is not installed or is not on your PATH." >&2
  echo "        Install Node.js LTS (>= 20) from https://nodejs.org and try again." >&2
  exit 1
fi

NODE_VER=$(node -v 2>/dev/null || echo "")
NODE_MAJOR=$(echo "$NODE_VER" | sed -E 's/^v([0-9]+).*/\1/')

if [ -z "$NODE_MAJOR" ]; then
  echo "[ERROR] Could not determine the Node.js version. Output of 'node -v' was: $NODE_VER" >&2
  exit 1
fi

if [ "$NODE_MAJOR" -lt "$MIN_NODE" ]; then
  echo "[ERROR] Node.js $NODE_VER is too old. GlassGem needs Node.js $MIN_NODE or newer." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm was not found even though Node.js is installed." >&2
  exit 1
fi

NPM_VER=$(npm -v 2>/dev/null || echo "unknown")
echo "[OK]    Node.js $NODE_VER  |  npm $NPM_VER"

# 3. Dependencies
NEED_INSTALL=0
REASON=""

if [ "$FORCE_REINSTALL" -eq 1 ]; then
  NEED_INSTALL=1
  REASON="clean install requested"
elif [ ! -d "node_modules" ]; then
  NEED_INSTALL=1
  REASON="node_modules is missing - first run"
elif [ ! -f "node_modules/.bin/vite" ]; then
  NEED_INSTALL=1
  REASON="node_modules is incomplete"
fi

if [ "$REQUIRE_ELECTRON" -eq 1 ]; then
  if [ ! -f "node_modules/.bin/electron-builder" ] || [ ! -d "node_modules/electron/dist" ]; then
    NEED_INSTALL=1
    REASON="desktop build tools / Electron runtime missing"
  fi
fi

MARKER="node_modules/.glassgem-deps"
LOCK_HASH=""
if [ -f "package-lock.json" ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    LOCK_HASH=$(sha256sum package-lock.json | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    LOCK_HASH=$(shasum -a 256 package-lock.json | awk '{print $1}')
  fi
fi

if [ "$NEED_INSTALL" -eq 0 ] && [ -n "$LOCK_HASH" ]; then
  if [ -f "$MARKER" ]; then
    SAVED_HASH=$(cat "$MARKER" 2>/dev/null || true)
    if [ "$SAVED_HASH" != "$LOCK_HASH" ]; then
      NEED_INSTALL=1
      REASON="package-lock.json changed since the last install"
    fi
  fi
fi

if [ "$NEED_INSTALL" -eq 0 ]; then
  echo "[OK]    Dependencies are up to date."
  exit 0
fi

echo "[INFO]  Installing dependencies: $REASON."
echo "        This needs an internet connection and can take a minute or two."
echo ""

if [ "$FORCE_REINSTALL" -eq 1 ] && [ -d "node_modules" ]; then
  echo "        Removing the old node_modules folder..."
  rm -rf node_modules
fi

if [ "$REQUIRE_ELECTRON" -eq 0 ]; then
  export ELECTRON_SKIP_BINARY_DOWNLOAD=1
fi

npm install --no-fund --no-audit

if [ ! -f "node_modules/.bin/vite" ]; then
  echo "[ERROR] npm install finished but node_modules looks incomplete." >&2
  exit 1
fi

if [ -n "$LOCK_HASH" ]; then
  echo "$LOCK_HASH" > "$MARKER"
fi

echo ""
echo "[OK]    Dependencies installed."
exit 0
