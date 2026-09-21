#!/usr/bin/env bash
# ===================================================================
#  GlassGem / Gemini Web2API Service Launcher
#  Handles running the Go binary, Python version, or fallback mock.
# ===================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PORT="${PORT:-8081}"
HOST="${HOST:-0.0.0.0}"
WEB2API_DIR="${WEB2API_DIR:-}"

# Auto-detect directory if not set
if [ -z "$WEB2API_DIR" ]; then
  if [ -d "$REPO_ROOT/gemini-web2api" ]; then
    WEB2API_DIR="$REPO_ROOT/gemini-web2api"
  elif [ -d "$REPO_ROOT/../gemini-web2api" ]; then
    WEB2API_DIR="$(cd "$REPO_ROOT/../gemini-web2api" && pwd)"
  elif [ -d "/home/user/gemini-web2api" ]; then
    WEB2API_DIR="/home/user/gemini-web2api"
  fi
fi

# Strategy 1: Look for compiled Go binary
if [ -n "$WEB2API_DIR" ] && [ -x "$WEB2API_DIR/gemini-web2api" ]; then
  echo "[INFO] Starting compiled gemini-web2api binary from $WEB2API_DIR on port $PORT..."
  cd "$WEB2API_DIR"
  exec ./gemini-web2api --port "$PORT"
fi

# Strategy 2: If Go is installed and source is present, compile and run
if [ -n "$WEB2API_DIR" ] && [ -f "$WEB2API_DIR/main.go" ] && command -v go >/dev/null 2>&1; then
  echo "[INFO] Found main.go and Go compiler. Compiling gemini-web2api..."
  cd "$WEB2API_DIR"
  if go build -o gemini-web2api .; then
    echo "[OK] Build succeeded. Starting gemini-web2api binary on port $PORT..."
    exec ./gemini-web2api --port "$PORT"
  else
    echo "[WARN] Go build failed. Falling back to alternative launcher..."
  fi
fi

# Strategy 3: Check for Python implementation (gemini_web2api.py)
if [ -n "$WEB2API_DIR" ] && [ -f "$WEB2API_DIR/gemini_web2api.py" ] && command -v python3 >/dev/null 2>&1; then
  echo "[INFO] Starting Python gemini_web2api from $WEB2API_DIR on port $PORT..."
  cd "$WEB2API_DIR"
  exec python3 gemini_web2api.py --port "$PORT"
fi

# Strategy 4: Fallback to built-in GlassGem mock Web2API server
MOCK_SCRIPT="$REPO_ROOT/scripts/mock-web2api.mjs"
if [ -f "$MOCK_SCRIPT" ] && command -v node >/dev/null 2>&1; then
  echo "[INFO] Running GlassGem mock Web2API server on port $PORT (key: sk-gemini)..."
  echo "[INFO] (To use real Gemini Web2API: compile gemini-web2api or place binary in $WEB2API_DIR)"
  cd "$REPO_ROOT"
  exec node "$MOCK_SCRIPT" "$PORT"
fi

echo "[ERROR] No viable launcher found for Gemini Web2API." >&2
exit 1
