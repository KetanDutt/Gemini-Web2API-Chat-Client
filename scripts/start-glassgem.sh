#!/usr/bin/env bash
# ===================================================================
#  GlassGem Web Client Service Launcher
# ===================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PORT="${GLASSGEM_PORT:-5173}"
MODE="${GLASSGEM_MODE:-preview}"
export GLASSGEM_WEB2API_URL="${GLASSGEM_WEB2API_URL:-http://127.0.0.1:8081}"

# Release port if held by a stray process
if command -v ss >/dev/null 2>&1; then
  STRAY_PIDS=$(ss -tulpn "sport = :${PORT}" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)
  for pid in $STRAY_PIDS; do
    if [ -n "$pid" ] && [ "$pid" -gt 1 ] && [ "$pid" -ne "$$" ]; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
  sleep 0.5
elif command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  sleep 0.5
fi

cd "$REPO_ROOT"

# Ensure environment and node_modules
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/vite" ]; then
  echo "[INFO] Dependencies missing or incomplete. Running check-env..."
  bash scripts/check-env.sh
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
