#!/bin/sh
# ===================================================================
#  GlassGem - start the web (browser/PWA) development server
#
#  Usage:
#      ./run.sh            start GlassGem
#      ./run.sh clean      delete node_modules, reinstall, then start
#      ./run.sh mock       also start the mock Web2API server (for UI testing)
#      ./run.sh stop       stop the background Web2API server and exit
#      ./run.sh --help     show this help
#
#  POSIX sh: runs on any Linux (incl. Alpine/BusyBox ash) and macOS.
# ===================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

CLEAN=""
MOCK=""
STOP=""

for arg in "$@"; do
  case "$arg" in
    clean)
      CLEAN="clean"
      ;;
    mock)
      MOCK="1"
      ;;
    stop)
      STOP="1"
      ;;
    -h|--help|/?)
      echo ""
      echo "  run.sh [clean] [mock] [stop]"
      echo ""
      echo "    clean   remove node_modules and reinstall before starting"
      echo "    mock    also start the mock Web2API server (sample answers only)"
      echo "    stop    stop the background Web2API server and exit"
      echo ""
      echo "  Environment: set GLASSGEM_WEB2API_URL to override the Web2API address"
      echo "  that is checked at startup (default http://127.0.0.1:8081). Its port"
      echo "  is also used when GlassGem starts the server itself."
      echo "  Set GLASSGEM_SKIP_AUTO_WEB2API=1 to never auto-start the server."
      echo ""
      exit 0
      ;;
  esac
done

if [ -n "$STOP" ]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not installed or is not on your PATH." >&2
    exit 1
  fi
  node scripts/stop-web2api.mjs
  exit $?
fi

echo ""
echo "  ============================================="
echo "    GlassGem  -  Your personal Gemini workspace"
echo "  ============================================="
echo "    Browser/PWA version"
echo ""

# ---------- environment + dependencies ------------------------------
sh "scripts/check-env.sh" $CLEAN

# ---------- ensure gemini-web2api is present and running -----------
WEB2API="${GLASSGEM_WEB2API_URL:-http://127.0.0.1:8081}"
MOCK_PID=""

# The Web2API daemon intentionally keeps running after GlassGem exits (same
# on Windows and Linux) so the next start reuses it; stop it explicitly with
# ./run.sh stop. Only the session-scoped mock server is stopped on exit.
cleanup() {
  if [ -n "$MOCK_PID" ] && kill -0 "$MOCK_PID" 2>/dev/null; then
    kill "$MOCK_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [ -n "$MOCK" ]; then
  echo "[INFO]  Starting the mock Web2API server on port 8081."
  echo "        It only returns sample answers - use it to try the UI without Gemini."
  node scripts/mock-web2api.mjs 8081 &
  MOCK_PID=$!
  sleep 1
else
  echo "[INFO]  Ensuring Gemini Web2API is present and running..."
  echo "        (first run: downloads or builds the server - can take a minute)"
  node scripts/ensure-web2api.mjs || true
fi

# ---------- is Web2API reachable? (informational only) --------------
if command -v curl >/dev/null 2>&1; then
  if curl -s -o /dev/null -m 3 "$WEB2API/v1/models" 2>/dev/null; then
    echo "[OK]    Gemini Web2API is reachable at $WEB2API."
  else
    echo "[WARN]  Gemini Web2API does not answer at $WEB2API."
    echo "        GlassGem will start anyway and reconnect automatically once Web2API is running."
  fi
else
  echo "[INFO]  Make sure Gemini Web2API is running at $WEB2API before chatting."
fi

echo ""
echo "  Starting the GlassGem dev server...  Press Ctrl+C to stop it."
echo ""
npm run dev
