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

cd "$REPO_ROOT"

# Ensure environment and node_modules
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/vite" ]; then
  echo "[INFO] Dependencies missing or incomplete. Running check-env..."
  bash scripts/check-env.sh
fi

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
