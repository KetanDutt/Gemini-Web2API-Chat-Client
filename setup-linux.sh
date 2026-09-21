#!/usr/bin/env bash
# ===================================================================
#  GlassGem & Gemini Web2API - Linux Setup & Service Registration Script
#
#  Registers both gemini-web2api and glassgem as systemd services,
#  configures them to start automatically on system boot/restart,
#  and verifies that both services are healthy and functional.
#
#  Usage:
#      sudo ./setup-linux.sh              Install, register & start services
#      sudo ./setup-linux.sh --status     Check status of registered services
#      sudo ./setup-linux.sh --restart    Restart both services
#      sudo ./setup-linux.sh --stop       Stop both services
#      sudo ./setup-linux.sh --start      Start both services
#      sudo ./setup-linux.sh --logs       View recent service logs
#      sudo ./setup-linux.sh --uninstall  Remove and unregister services
#      ./setup-linux.sh --help            Show detailed usage options
# ===================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"

# Defaults
SERVICE_USER="${SUDO_USER:-$(id -un)}"
SERVICE_GROUP="$(id -gn "$SERVICE_USER" 2>/dev/null || echo "$SERVICE_USER")"
GLASSGEM_PORT="5173"
WEB2API_PORT="8081"
GLASSGEM_MODE="preview"
WEB2API_DIR=""
NON_INTERACTIVE=0
ACTION="install"

# Colors for terminal output
if [ -t 1 ]; then
  BOLD="\033[1m"
  GREEN="\033[0;32m"
  YELLOW="\033[0;33m"
  RED="\033[0;31m"
  BLUE="\033[0;34m"
  RESET="\033[0m"
else
  BOLD=""
  GREEN=""
  YELLOW=""
  RED=""
  BLUE=""
  RESET=""
fi

log_info()  { echo -e "${BLUE}[INFO]${RESET}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${RESET}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
log_error() { echo -e "${RED}[ERROR]${RESET} $*" >&2; }

print_help() {
  cat << EOF
${BOLD}GlassGem & Gemini Web2API - Linux Service Manager${RESET}

${BOLD}USAGE:${RESET}
  sudo ./setup-linux.sh [COMMAND] [OPTIONS]

${BOLD}COMMANDS:${RESET}
  install (default)    Register and enable both services to start on boot
  --status             Display the status and health of both services
  --start              Start both services
  --stop               Stop both services
  --restart            Restart both services
  --logs               View logs for both services (journalctl)
  --uninstall          Stop, disable, and remove the system services
  -h, --help           Show this help message

${BOLD}OPTIONS:${RESET}
  --user <name>        User to run services as (default: $SERVICE_USER)
  --port <port>        Port for GlassGem web client (default: 5173)
  --api-port <port>    Port for Gemini Web2API (default: 8081)
  --mode <preview|dev> GlassGem runner mode: preview (optimized) or dev (default: preview)
  --web2api-dir <path> Path to gemini-web2api repository folder
  -y, --force          Non-interactive mode, skip confirmation prompts

EOF
}

# Parse command line arguments
while [ $# -gt 0 ]; do
  case "$1" in
    --status|status)
      ACTION="status"
      shift
      ;;
    --start|start)
      ACTION="start"
      shift
      ;;
    --stop|stop)
      ACTION="stop"
      shift
      ;;
    --restart|restart)
      ACTION="restart"
      shift
      ;;
    --logs|logs)
      ACTION="logs"
      shift
      ;;
    --uninstall|uninstall)
      ACTION="uninstall"
      shift
      ;;
    --user)
      SERVICE_USER="$2"
      SERVICE_GROUP="$(id -gn "$SERVICE_USER" 2>/dev/null || echo "$SERVICE_USER")"
      shift 2
      ;;
    --port)
      GLASSGEM_PORT="$2"
      shift 2
      ;;
    --api-port)
      WEB2API_PORT="$2"
      shift 2
      ;;
    --mode)
      GLASSGEM_MODE="$2"
      shift 2
      ;;
    --web2api-dir)
      WEB2API_DIR="$2"
      shift 2
      ;;
    -y|--force)
      NON_INTERACTIVE=1
      shift
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      print_help
      exit 1
      ;;
  esac
done

# Ensure root privileges for systemd system modifications
require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
      log_info "Elevating to root privileges using sudo..."
      exec sudo -E bash "$0" "$ACTION" "$@"
    else
      log_error "This action requires root or sudo privileges."
      exit 1
    fi
  fi
}

systemctl_cmd() {
  if [ "$(id -u)" -eq 0 ]; then
    systemctl "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo systemctl "$@"
  else
    systemctl "$@"
  fi
}

# Check init system
has_systemd() {
  if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    return 0
  fi
  return 1
}

# -------------------------------------------------------------------
# Service Status Action
# -------------------------------------------------------------------
do_status() {
  echo ""
  echo -e "${BOLD}=============================================${RESET}"
  echo -e "${BOLD}  GlassGem & Web2API Service Status${RESET}"
  echo -e "${BOLD}=============================================${RESET}"
  echo ""

  if has_systemd; then
    echo -e "${BOLD}1. Gemini Web2API (systemd):${RESET}"
    if systemctl_cmd is-active --quiet gemini-web2api.service 2>/dev/null; then
      echo -e "   Status: ${GREEN}Active (running)${RESET}"
    else
      echo -e "   Status: ${RED}Inactive or not running${RESET}"
    fi
    echo -e "   Autostart: $(systemctl_cmd is-enabled gemini-web2api.service 2>/dev/null || echo 'not enabled')"

    echo ""
    echo -e "${BOLD}2. GlassGem Web Client (systemd):${RESET}"
    if systemctl_cmd is-active --quiet glassgem.service 2>/dev/null; then
      echo -e "   Status: ${GREEN}Active (running)${RESET}"
    else
      echo -e "   Status: ${RED}Inactive or not running${RESET}"
    fi
    echo -e "   Autostart: $(systemctl_cmd is-enabled glassgem.service 2>/dev/null || echo 'not enabled')"
  fi

  echo ""
  echo -e "${BOLD}3. Network Ports & Health:${RESET}"

  # Port 8081 check
  if curl -s -m 2 "http://127.0.0.1:$WEB2API_PORT/v1/models" >/dev/null 2>&1; then
    echo -e "   Web2API Port $WEB2API_PORT: ${GREEN}Healthy and responding${RESET}"
  else
    echo -e "   Web2API Port $WEB2API_PORT: ${YELLOW}Not responding to HTTP queries${RESET}"
  fi

  # Port 5173 check
  if curl -s -m 2 "http://127.0.0.1:$GLASSGEM_PORT/" >/dev/null 2>&1; then
    echo -e "   GlassGem Port $GLASSGEM_PORT: ${GREEN}Healthy and responding${RESET}"
  else
    echo -e "   GlassGem Port $GLASSGEM_PORT: ${YELLOW}Not responding to HTTP queries${RESET}"
  fi

  # Proxy route check
  if curl -s -m 2 "http://127.0.0.1:$GLASSGEM_PORT/web2api/v1/models" >/dev/null 2>&1; then
    echo -e "   Vite Web2API Proxy:   ${GREEN}Functioning normally${RESET}"
  else
    echo -e "   Vite Web2API Proxy:   ${YELLOW}Waiting for Web2API or GlassGem${RESET}"
  fi
  echo ""
}

# -------------------------------------------------------------------
# Service Stop / Start / Restart Actions
# -------------------------------------------------------------------
do_stop() {
  require_root
  log_info "Stopping services..."
  systemctl stop glassgem.service 2>/dev/null || true
  systemctl stop gemini-web2api.service 2>/dev/null || true
  log_ok "Services stopped."
}

do_start() {
  require_root
  log_info "Starting gemini-web2api..."
  systemctl start gemini-web2api.service
  log_info "Starting glassgem..."
  systemctl start glassgem.service
  log_ok "Services started."
  sleep 2
  do_status
}

do_restart() {
  require_root
  log_info "Restarting gemini-web2api..."
  systemctl restart gemini-web2api.service
  log_info "Restarting glassgem..."
  systemctl restart glassgem.service
  log_ok "Services restarted."
  sleep 2
  do_status
}

# -------------------------------------------------------------------
# Service Logs Action
# -------------------------------------------------------------------
do_logs() {
  require_root
  echo -e "${BOLD}--- Recent logs for gemini-web2api.service ---${RESET}"
  journalctl -u gemini-web2api.service -n 25 --no-pager || true
  echo ""
  echo -e "${BOLD}--- Recent logs for glassgem.service ---${RESET}"
  journalctl -u glassgem.service -n 25 --no-pager || true
}

# -------------------------------------------------------------------
# Service Uninstall Action
# -------------------------------------------------------------------
do_uninstall() {
  require_root
  log_info "Disabling and removing GlassGem & Gemini Web2API system services..."
  systemctl stop glassgem.service 2>/dev/null || true
  systemctl stop gemini-web2api.service 2>/dev/null || true
  systemctl disable glassgem.service 2>/dev/null || true
  systemctl disable gemini-web2api.service 2>/dev/null || true

  rm -f /etc/systemd/system/glassgem.service
  rm -f /etc/systemd/system/gemini-web2api.service
  rm -f /etc/default/glassgem
  rm -f /etc/default/gemini-web2api

  systemctl daemon-reload
  log_ok "Services uninstalled successfully."
}

# -------------------------------------------------------------------
# Port conflict resolution
# -------------------------------------------------------------------
clear_port_conflict() {
  local port="$1"
  local name="$2"

  local pids=""
  if command -v ss >/dev/null 2>&1; then
    pids="$(ss -tulpn "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)"
  elif command -v fuser >/dev/null 2>&1; then
    pids="$(fuser "$port/tcp" 2>/dev/null || true)"
  elif command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti :"$port" 2>/dev/null || true)"
  fi

  if [ -n "$pids" ]; then
    log_warn "Port $port ($name) is currently occupied by PID(s): $pids"
    for pid in $pids; do
      # Avoid killing init or self
      if [ "$pid" -gt 1 ] && [ "$pid" -ne "$$" ]; then
        log_info "Stopping conflicting process (PID $pid)..."
        kill "$pid" 2>/dev/null || true
        sleep 1
        if kill -0 "$pid" 2>/dev/null; then
          kill -9 "$pid" 2>/dev/null || true
        fi
      fi
    done
  fi
}

# -------------------------------------------------------------------
# Main Install & Service Registration
# -------------------------------------------------------------------
do_install() {
  require_root

  echo ""
  echo -e "${BOLD}======================================================${RESET}"
  echo -e "${BOLD}  GlassGem & Gemini Web2API Linux Service Setup${RESET}"
  echo -e "${BOLD}======================================================${RESET}"
  echo ""

  # 1. OS & Init system check
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    log_info "Detected OS: ${PRETTY_NAME:-$ID}"
  fi

  if ! has_systemd; then
    log_error "systemd is not active or running on this system."
    log_error "This script requires systemd to register boot/restart services."
    exit 1
  fi
  log_ok "systemd init system verified."

  # 2. Node.js and npm verification
  if ! command -v node >/dev/null 2>&1; then
    log_error "Node.js is not installed."
    log_error "Please install Node.js (version 20 or newer) from https://nodejs.org"
    exit 1
  fi

  NODE_VER=$(node -v)
  NODE_MAJOR=$(echo "$NODE_VER" | sed -E 's/^v([0-9]+).*/\1/')
  if [ "$NODE_MAJOR" -lt 20 ]; then
    log_error "Node.js $NODE_VER is older than the required version (20+)."
    exit 1
  fi
  log_ok "Node.js $NODE_VER detected."

  if ! command -v npm >/dev/null 2>&1; then
    log_error "npm is not installed."
    exit 1
  fi
  log_ok "npm $(npm -v) detected."

  # 3. Resolve user and paths
  log_info "Services will execute under user: $SERVICE_USER (group: $SERVICE_GROUP)"
  USER_HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6)"
  if [ -z "$USER_HOME" ]; then
    USER_HOME="/home/$SERVICE_USER"
  fi

  # 4. Locate or setup gemini-web2api
  if [ -z "$WEB2API_DIR" ]; then
    if [ -d "$REPO_ROOT/gemini-web2api" ]; then
      WEB2API_DIR="$REPO_ROOT/gemini-web2api"
    elif [ -d "$USER_HOME/gemini-web2api" ]; then
      WEB2API_DIR="$USER_HOME/gemini-web2api"
    elif [ -d "$REPO_ROOT/../gemini-web2api" ]; then
      WEB2API_DIR="$(cd "$REPO_ROOT/../gemini-web2api" && pwd)"
    fi
  fi

  if [ -z "$WEB2API_DIR" ] || [ ! -d "$WEB2API_DIR" ]; then
    log_info "gemini-web2api directory not found. Cloning from GitHub..."
    TARGET_CLONE="$USER_HOME/gemini-web2api"
    if [ ! -d "$TARGET_CLONE" ]; then
      su - "$SERVICE_USER" -c "git clone https://github.com/ikhsan3adi/gemini-web2api \"$TARGET_CLONE\""
    fi
    WEB2API_DIR="$TARGET_CLONE"
  fi
  log_ok "gemini-web2api located at: $WEB2API_DIR"

  # Check Go binary or compilation
  if [ -x "$WEB2API_DIR/gemini-web2api" ]; then
    log_ok "Found precompiled gemini-web2api binary."
  elif command -v go >/dev/null 2>&1; then
    log_info "Go compiler found. Compiling gemini-web2api..."
    su - "$SERVICE_USER" -c "cd \"$WEB2API_DIR\" && go build -o gemini-web2api ." || log_warn "Go build failed; will fall back to mock/wrapper."
  else
    log_info "Go compiler not found. The launcher will automatically use the built-in mock server or Python fallback."
  fi

  # 5. Check and build GlassGem dependencies
  log_info "Verifying GlassGem dependencies and build bundle..."
  chmod +x "$REPO_ROOT/scripts/start-web2api.sh" "$REPO_ROOT/scripts/start-glassgem.sh" "$REPO_ROOT/run.sh" "$REPO_ROOT/build.sh" "$REPO_ROOT/scripts/check-env.sh"

  su - "$SERVICE_USER" -c "cd \"$REPO_ROOT\" && bash scripts/check-env.sh"
  if [ ! -f "$REPO_ROOT/dist/index.html" ]; then
    log_info "Building GlassGem production bundle..."
    su - "$SERVICE_USER" -c "cd \"$REPO_ROOT\" && npm run build"
  fi
  log_ok "GlassGem build ready."

  # 6. Check and clear any conflicting background processes on ports
  clear_port_conflict "$WEB2API_PORT" "Web2API"
  clear_port_conflict "$GLASSGEM_PORT" "GlassGem"

  # 7. Create environment configuration files in /etc/default/
  log_info "Creating configuration files in /etc/default/..."
  cat > /etc/default/gemini-web2api << EOF
# Configuration for gemini-web2api service
PORT=${WEB2API_PORT}
HOST=0.0.0.0
WEB2API_DIR=${WEB2API_DIR}
EOF

  cat > /etc/default/glassgem << EOF
# Configuration for glassgem service
GLASSGEM_PORT=${GLASSGEM_PORT}
GLASSGEM_MODE=${GLASSGEM_MODE}
GLASSGEM_WEB2API_URL=http://127.0.0.1:${WEB2API_PORT}
NODE_ENV=production
EOF

  # 8. Create systemd service unit: gemini-web2api.service
  log_info "Creating /etc/systemd/system/gemini-web2api.service..."
  cat > /etc/systemd/system/gemini-web2api.service << EOF
[Unit]
Description=Gemini Web2API - OpenAI-compatible server for Google Gemini
Documentation=https://github.com/ikhsan3adi/gemini-web2api
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${WEB2API_DIR}
EnvironmentFile=-/etc/default/gemini-web2api
ExecStart=${REPO_ROOT}/scripts/start-web2api.sh
Restart=always
RestartSec=5s
LimitNOFILE=65535
StandardOutput=journal
StandardError=journal
TimeoutStartSec=30
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
EOF

  # 9. Create systemd service unit: glassgem.service
  log_info "Creating /etc/systemd/system/glassgem.service..."
  cat > /etc/systemd/system/glassgem.service << EOF
[Unit]
Description=GlassGem - Liquid Glass Chat Client for Gemini Web2API
Documentation=https://github.com/KetanDutt/Gemini-Web2API-Chat-Client
After=network.target network-online.target gemini-web2api.service
Wants=network-online.target gemini-web2api.service

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${REPO_ROOT}
EnvironmentFile=-/etc/default/glassgem
ExecStart=${REPO_ROOT}/scripts/start-glassgem.sh
Restart=always
RestartSec=5s
LimitNOFILE=65535
StandardOutput=journal
StandardError=journal
TimeoutStartSec=30
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
EOF

  # Set secure permissions on unit files
  chmod 644 /etc/systemd/system/gemini-web2api.service /etc/systemd/system/glassgem.service

  # 10. Reload systemd, enable services for boot/restart, and start them
  log_info "Reloading systemd daemon..."
  systemctl daemon-reload

  log_info "Enabling services to start on system boot/restart..."
  systemctl enable gemini-web2api.service
  systemctl enable glassgem.service

  log_info "Starting gemini-web2api.service..."
  systemctl restart gemini-web2api.service

  log_info "Starting glassgem.service..."
  systemctl restart glassgem.service

  # 11. Health verification
  log_info "Verifying service readiness (waiting up to 10 seconds)..."
  local attempts=0
  local max_attempts=10
  local api_ok=0
  local web_ok=0

  while [ $attempts -lt $max_attempts ]; do
    sleep 1
    attempts=$((attempts + 1))

    if [ $api_ok -eq 0 ] && curl -s -m 2 "http://127.0.0.1:$WEB2API_PORT/v1/models" >/dev/null 2>&1; then
      api_ok=1
    fi

    if [ $web_ok -eq 0 ] && curl -s -m 2 "http://127.0.0.1:$GLASSGEM_PORT/" >/dev/null 2>&1; then
      web_ok=1
    fi

    if [ $api_ok -eq 1 ] && [ $web_ok -eq 1 ]; then
      break
    fi
  done

  # Error diagnostic if not running
  if [ $api_ok -eq 0 ]; then
    log_warn "gemini-web2api.service is not responding yet on port $WEB2API_PORT."
    log_info "Recent log output from gemini-web2api:"
    journalctl -u gemini-web2api.service -n 15 --no-pager || true
  fi

  if [ $web_ok -eq 0 ]; then
    log_warn "glassgem.service is not responding yet on port $GLASSGEM_PORT."
    log_info "Recent log output from glassgem:"
    journalctl -u glassgem.service -n 15 --no-pager || true
  fi

  echo ""
  echo -e "${BOLD}======================================================${RESET}"
  echo -e "${BOLD}${GREEN}  Setup & Service Registration Completed Successfully!${RESET}"
  echo -e "${BOLD}======================================================${RESET}"
  echo ""
  echo -e "  Both services are now ${GREEN}enabled${RESET} to start automatically on system restart."
  echo ""
  echo -e "  ${BOLD}Active Endpoints:${RESET}"
  echo -e "    - GlassGem Web Client : ${GREEN}http://localhost:${GLASSGEM_PORT}${RESET}"
  echo -e "    - Gemini Web2API Server: ${GREEN}http://localhost:${WEB2API_PORT}/v1${RESET}"
  echo -e "    - Built-in Proxy Route : ${GREEN}http://localhost:${GLASSGEM_PORT}/web2api/v1${RESET}"
  echo ""
  echo -e "  ${BOLD}Service Management Commands:${RESET}"
  echo -e "    Check status  : ${BOLD}sudo ./setup-linux.sh --status${RESET}   (or systemctl status glassgem)"
  echo -e "    Restart       : ${BOLD}sudo ./setup-linux.sh --restart${RESET}  (or systemctl restart glassgem)"
  echo -e "    Stop          : ${BOLD}sudo ./setup-linux.sh --stop${RESET}"
  echo -e "    Start         : ${BOLD}sudo ./setup-linux.sh --start${RESET}"
  echo -e "    View live logs: ${BOLD}sudo ./setup-linux.sh --logs${RESET}   (or journalctl -u glassgem -f)"
  echo -e "    Uninstall     : ${BOLD}sudo ./setup-linux.sh --uninstall${RESET}"
  echo ""
}

# Run the requested action
case "$ACTION" in
  install)
    do_install
    ;;
  status)
    do_status
    ;;
  start)
    do_start
    ;;
  stop)
    do_stop
    ;;
  restart)
    do_restart
    ;;
  logs)
    do_logs
    ;;
  uninstall)
    do_uninstall
    ;;
  *)
    log_error "Unknown action: $ACTION"
    exit 1
    ;;
esac
