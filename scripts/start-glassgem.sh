#!/bin/sh
# ===================================================================
#  GlassGem Web Client Service Launcher
#  Used by the systemd / OpenRC services created by setup-linux.sh.
#
#  POSIX sh: works under bash, dash and BusyBox ash (Alpine).
# ===================================================================
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PORT="${GLASSGEM_PORT:-5173}"
MODE="${GLASSGEM_MODE:-preview}"
export GLASSGEM_WEB2API_URL="${GLASSGEM_WEB2API_URL:-http://127.0.0.1:8081}"

# Release port if held by a stray process (best effort; works with iproute2
# ss, BusyBox ss, and lsof - whichever is present on the distro).
kill_port() {
  PORT_TO_KILL="$1"
  PIDS=""
  if command -v lsof >/dev/null 2>&1; then
    PIDS=$(lsof -ti :"$PORT_TO_KILL" 2>/dev/null || true)
  elif command -v ss >/dev/null 2>&1; then
    PIDS=$(ss -tulpn 2>/dev/null | grep -F ":$PORT_TO_KILL " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)
  fi
  for pid in $PIDS; do
    case "$pid" in ''|*[!0-9]*) continue ;; esac
    if [ "$pid" -gt 1 ] && [ "$pid" -ne "$$" ]; then
      kill "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
    fi
  done
  [ -n "$PIDS" ] && sleep 1
  return 0
}
kill_port "$PORT"

cd "$REPO_ROOT"

# Ensure environment and node_modules
if [ -z "${ELECTRON_SKIP_BINARY_DOWNLOAD:-}" ]; then
  ELECTRON_SKIP_BINARY_DOWNLOAD=1
  export ELECTRON_SKIP_BINARY_DOWNLOAD
fi
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/vite" ]; then
  echo "[INFO] Dependencies missing or incomplete. Running check-env..."
  sh scripts/check-env.sh
fi

# Ensure Gemini Web2API is present, installed, and running
echo "[INFO] Verifying Gemini Web2API status..."
node scripts/ensure-web2api.mjs || true

if [ "$MODE" = "preview" ]; then
  if [ ! -f "dist/index.html" ]; then
    echo "[INFO] Building production bundle for preview..."
    npm run build
  fi
  echo "[INFO] Starting GlassGem production preview on 0.0.0.0:$PORT..."
  exec npx vite preview --host 0.0.0.0 --port "$PORT"
else
  echo "[INFO] Starting GlassGem dev server on 0.0.0.0:$PORT..."
  exec npx vite --host 0.0.0.0 --port "$PORT"
fi
