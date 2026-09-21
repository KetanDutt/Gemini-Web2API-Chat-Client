#!/bin/sh
# ===================================================================
#  GlassGem / Gemini Web2API Service Launcher
#  Handles running the Go binary, a Python fallback, or the mock.
#  Used by the systemd / OpenRC services created by setup-linux.sh.
#
#  POSIX sh: works under bash, dash and BusyBox ash (Alpine).
# ===================================================================
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PORT="${PORT:-8081}"
HOST="${HOST:-0.0.0.0}"
WEB2API_DIR="${WEB2API_DIR:-}"

# Release port if held by a stray non-service process (iproute2 ss, BusyBox
# ss, and lsof variants - whichever the distro provides).
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

# Auto-detect directory if not set (vendored sources bundled with this repo first)
if [ -z "$WEB2API_DIR" ]; then
  if [ -d "$REPO_ROOT/gemini-web2api-ikhsan3adi" ]; then
    WEB2API_DIR="$REPO_ROOT/gemini-web2api-ikhsan3adi"
  elif [ -d "$REPO_ROOT/gemini-web2api" ]; then
    WEB2API_DIR="$REPO_ROOT/gemini-web2api"
  elif [ -d "$REPO_ROOT/../gemini-web2api" ]; then
    WEB2API_DIR="$(cd "$REPO_ROOT/../gemini-web2api" && pwd)"
  elif [ -n "${HOME:-}" ] && [ -d "$HOME/gemini-web2api" ]; then
    WEB2API_DIR="$HOME/gemini-web2api"
  fi
fi

# Strategy 1: Look for compiled Go binary
if [ -n "$WEB2API_DIR" ] && [ -x "$WEB2API_DIR/gemini-web2api" ]; then
  echo "[INFO] Starting compiled gemini-web2api binary from $WEB2API_DIR on port $PORT..."
  cd "$WEB2API_DIR"
  exec ./gemini-web2api --port "$PORT"
fi

# Strategy 2: If Go is installed and source is present, compile and run.
# CGO_ENABLED=0 produces a fully static binary that runs on glibc and musl
# (Alpine) systems alike.
if [ -n "$WEB2API_DIR" ] && [ -f "$WEB2API_DIR/main.go" ] && command -v go >/dev/null 2>&1; then
  echo "[INFO] Found main.go and Go compiler. Compiling gemini-web2api (static build)..."
  cd "$WEB2API_DIR"
  if CGO_ENABLED=0 go build -o gemini-web2api .; then
    echo "[OK] Build succeeded. Starting gemini-web2api binary on port $PORT..."
    exec ./gemini-web2api --port "$PORT"
  else
    echo "[WARN] Go build failed. Falling back to alternative launcher..."
  fi
fi

# Strategy 3: Try the prebuilt release binary (no Go toolchain needed)
if [ -z "${WEB2API_NO_DOWNLOAD:-}" ] && command -v node >/dev/null 2>&1; then
  echo "[INFO] No local binary. Trying the prebuilt gemini-web2api release..."
  if [ -z "$WEB2API_DIR" ]; then
    WEB2API_DIR="$REPO_ROOT/gemini-web2api"
  fi
  export WEB2API_DIR
  if node "$REPO_ROOT/scripts/ensure-web2api.mjs" --install-only --port "$PORT" >/dev/null 2>&1; then
    echo "[OK] Prebuilt binary ready."
  fi
fi

if [ -n "$WEB2API_DIR" ] && [ -x "$WEB2API_DIR/gemini-web2api" ]; then
  echo "[INFO] Starting gemini-web2api binary from $WEB2API_DIR on port $PORT..."
  cd "$WEB2API_DIR"
  exec ./gemini-web2api --port "$PORT"
fi

# Strategy 4: Check for Python implementation (gemini_web2api.py)
if [ -n "$WEB2API_DIR" ] && [ -f "$WEB2API_DIR/gemini_web2api.py" ] && command -v python3 >/dev/null 2>&1; then
  echo "[INFO] Starting Python gemini_web2api from $WEB2API_DIR on port $PORT..."
  cd "$WEB2API_DIR"
  exec python3 gemini_web2api.py --port "$PORT"
fi

# Strategy 5: Fallback to built-in GlassGem mock Web2API server
MOCK_SCRIPT="$REPO_ROOT/scripts/mock-web2api.mjs"
if [ -f "$MOCK_SCRIPT" ] && command -v node >/dev/null 2>&1; then
  echo "[WARN] No real Gemini Web2API available - running the MOCK server on port $PORT (sample answers only)."
  echo "[INFO] (To use real Gemini: install Go, or allow the prebuilt download from github.com)"
  cd "$REPO_ROOT"
  exec node "$MOCK_SCRIPT" "$PORT"
fi

echo "[ERROR] No viable launcher found for Gemini Web2API." >&2
exit 1
