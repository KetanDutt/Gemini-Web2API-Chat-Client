#!/bin/sh
# ===================================================================
#  GlassGem - create a production build
#
#  Usage:
#      ./build.sh            type-check + build into the dist folder
#      ./build.sh clean      reinstall dependencies first, then build
#      ./build.sh preview    build and start the local preview server
#      ./build.sh --help     show this help
# ===================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

CLEAN=""
PREVIEW=""

for arg in "$@"; do
  case "$arg" in
    clean)
      CLEAN="clean"
      ;;
    preview|serve)
      PREVIEW="1"
      ;;
    -h|--help|/?)
      echo ""
      echo "  build.sh [clean] [preview]"
      echo ""
      echo "    clean     remove node_modules and reinstall before building"
      echo "    preview   start the local preview server after a successful build"
      echo ""
      exit 0
      ;;
  esac
done

echo ""
echo "  ============================================="
echo "    GlassGem  -  production build"
echo "  ============================================="
echo ""

sh "scripts/check-env.sh" $CLEAN

echo ""
echo "[1/2]   Type-checking..."
npm run typecheck
echo "[OK]    No type errors."

echo ""
echo "[2/2]   Building the optimized bundle..."
npx vite build
if [ ! -f "dist/index.html" ]; then
  echo "[ERROR] The build finished but dist/index.html is missing." >&2
  exit 1
fi

echo ""
echo "[OK]    Build complete."
echo "        Output folder: $(pwd)/dist"
echo ""

if [ -n "$PREVIEW" ]; then
  echo "  Serving the production build...  Press Ctrl+C to stop it."
  echo ""
  npm run preview
fi
