#!/bin/sh
# ===================================================================
#  GlassGem & Gemini Web2API - Linux/Alpine Setup & Service Registration
#
#  Registers both gemini-web2api and glassgem as system services
#  (systemd OR OpenRC, detected automatically) and configures them to
#  start automatically on system boot/restart.
#
#  Written in POSIX sh: works under bash, dash and BusyBox ash alike,
#  so no bash installation is required (important on Alpine Linux).
#
#  Supported platforms:
#    systemd distros   - Debian/Ubuntu, Fedora/RHEL, Arch, openSUSE, ...
#    OpenRC            - Alpine Linux, Gentoo, Artix, ...
#    Package managers  - apk, apt, dnf, yum, zypper, pacman
#    Windows           - use run.bat / run-desktop.bat instead (they set
#                        everything up automatically; no root needed)
#
#  Usage:
#      sudo sh setup-linux.sh              Install, register & start services
#      sudo sh setup-linux.sh --status     Check status of registered services
#      sudo sh setup-linux.sh --restart    Restart both services
#      sudo sh setup-linux.sh --stop       Stop both services
#      sudo sh setup-linux.sh --start      Start both services
#      sudo sh setup-linux.sh --logs       View recent service logs
#      sudo sh setup-linux.sh --uninstall  Remove and unregister services
#      sh setup-linux.sh --help            Show detailed usage options
# ===================================================================
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
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

# Colors for terminal output (plain variables; printed via printf %b)
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

log_info()  { printf '%b\n' "${BLUE}[INFO]${RESET}  $*"; }
log_ok()    { printf '%b\n' "${GREEN}[OK]${RESET}    $*"; }
log_warn()  { printf '%b\n' "${YELLOW}[WARN]${RESET}  $*"; }
log_error() { printf '%b\n' "${RED}[ERROR]${RESET} $*" >&2; }

print_help() {
  cat << EOF
GlassGem & Gemini Web2API - Linux/Alpine Service Manager

USAGE:
  sudo sh setup-linux.sh [COMMAND] [OPTIONS]

COMMANDS:
  install (default)    Register and enable both services to start on boot
  --status             Display the status and health of both services
  --start              Start both services
  --stop               Stop both services
  --restart            Restart both services
  --logs               View logs for both services
  --uninstall          Stop, disable, and remove the system services
  -h, --help           Show this help message

OPTIONS:
  --user <name>        User to run services as (default: $SERVICE_USER)
  --port <port>        Port for GlassGem web client (default: 5173)
  --api-port <port>    Port for Gemini Web2API (default: 8081)
  --mode <preview|dev> GlassGem runner mode: preview (optimized) or dev (default: preview)
  --web2api-dir <path> Path to gemini-web2api repository folder
  -y, --force          Non-interactive mode, skip confirmation prompts

SUPPORTED INIT SYSTEMS:
  systemd (Debian/Ubuntu/Fedora/Arch/...) and OpenRC (Alpine/Gentoo/...).
  Missing packages (node, npm, git, curl and optionally go) are offered to
  be installed automatically via the detected package manager
  (apk/apt/dnf/yum/zypper/pacman).

Windows users: run run.bat or run-desktop.bat instead - no setup script
or admin rights needed there.

EOF
}

# Parse command line arguments
while [ $# -gt 0 ]; do
  case "$1" in
    install|--install)
      ACTION="install"
      shift
      ;;
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

# -------------------------------------------------------------------
# Platform detection
# -------------------------------------------------------------------

# GG_INIT can force the init system (used by the test harness). Normally
# auto-detected: systemd first, OpenRC (Alpine/Gentoo) second.
detect_init() {
  if [ -n "${GG_INIT:-}" ]; then
    case "$GG_INIT" in systemd|openrc) printf '%s' "$GG_INIT"; return 0 ;; esac
  fi
  # /run/systemd/system marks systemd as the boot init; the extra bus check
  # excludes containers that merely contain systemd files without a running
  # systemd (typical Docker/Podman dev images).
  if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ] && systemctl list-units >/dev/null 2>&1; then
    printf 'systemd'
    return 0
  fi
  if [ -x /sbin/openrc-run ] || [ -d /run/openrc ] || [ -f /etc/openrc/rc.conf ]; then
    printf 'openrc'
    return 0
  fi
  printf 'none'
  return 0
}

detect_pkg_mgr() {
  for m in apk apt-get dnf yum zypper pacman; do
    if command -v "$m" >/dev/null 2>&1; then
      case "$m" in
        apt-get) printf 'apt' ;;
        *) printf '%s' "$m" ;;
      esac
      return 0
    fi
  done
  printf 'none'
  return 0
}

# Map a generic package name to the distribution-specific one.
# Interfaces: pkg_name <generic> <pkg_mgr>
pkg_name() {
  case "$1:$2" in
    node:apk|node:apt|node:dnf|node:yum|node:zypper|node:pacman) echo nodejs ;;
    go:apt|go:dnf|go:yum) echo golang ;;
    *) echo "$1" ;;
  esac
}

# pkg_install <generic names...> - installs packages with the detected manager.
PKG_MGR="${GG_PKG_MGR:-$(detect_pkg_mgr)}"
APT_UPDATED=0
install_one() {
  generic="$1"
  pkg="$(pkg_name "$generic" "$PKG_MGR")"
  case "$PKG_MGR" in
    apk)    apk add --no-cache "$pkg" ;;
    apt)
      if [ "$APT_UPDATED" -eq 0 ]; then apt-get update -qq || true; APT_UPDATED=1; fi
      DEBIAN_FRONTEND=noninteractive apt-get install -y "$pkg"
      ;;
    dnf)    dnf install -y "$pkg" ;;
    yum)    yum install -y "$pkg" ;;
    zypper) zypper --non-interactive install --no-recommends "$pkg" ;;
    pacman) pacman -Sy --needed --noconfirm "$pkg" ;;
    *) return 1 ;;
  esac
}

# install_missing <node> [npm] [git] [curl] [go ...] - offers to install
# missing tools via the package manager (auto-accepted with --force, or when
# the shell is not interactive).
install_missing() {
  missing="$*"
  if [ -z "$missing" ]; then
    return 0
  fi
  if [ "$PKG_MGR" = "none" ]; then
    log_error "Missing required tools: $missing"
    log_error "No supported package manager found. Please install them manually."
    return 1
  fi
  if [ "$NON_INTERACTIVE" -eq 0 ] && [ -t 0 ]; then
    printf '%b' "${YELLOW}[?]${RESET}     Missing tools: $missing. Install them now with $PKG_MGR? [Y/n] "
    read -r answer || answer=""
    case "$answer" in
      n|N|no|NO) return 1 ;;
    esac
  fi
  log_info "Installing missing packages with $PKG_MGR: $missing"
  for p in $missing; do
    if ! install_one "$p"; then
      log_warn "Could not install '$p' via $PKG_MGR - continuing anyway."
    fi
  done
  return 0
}

# Ensure root privileges for service registration
require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
      log_info "Elevating to root privileges using sudo..."
      exec sudo -E sh "$0" "$ACTION" "$@"
    else
      log_error "This action requires root or sudo privileges."
      exit 1
    fi
  fi
}

# -------------------------------------------------------------------
# Init-system agnostic service control
# -------------------------------------------------------------------
INIT_SYS="$(detect_init)"

svc_do() {
  # svc_do <start|stop|restart|enable|disable|is-active|is-enabled> <service>
  act="$1"; svc="$2"
  if [ "$INIT_SYS" = "systemd" ]; then
    case "$act" in
      enable)     systemctl enable "$svc.service" ;;
      disable)    systemctl disable "$svc.service" ;;
      is-active)  systemctl is-active --quiet "$svc.service" ;;
      is-enabled) systemctl is-enabled "$svc.service" ;;
      *)          systemctl "$act" "$svc.service" ;;
    esac
  else
    case "$act" in
      enable)     rc-update add "$svc" default ;;
      disable)    rc-update del "$svc" default 2>/dev/null || true ;;
      is-active)  rc-service "$svc" status >/dev/null 2>&1 ;;
      is-enabled) rc-update show default 2>/dev/null | grep -q -e "\\b$svc\\b" ;;
      *)          rc-service "$svc" "$act" ;;
    esac
  fi
}

service_logs() {
  # service_logs <service> - last lines of the service log
  if [ "$INIT_SYS" = "systemd" ]; then
    journalctl -u "$1.service" -n 25 --no-pager 2>/dev/null || true
  else
    if [ -f "/var/log/$1.log" ]; then
      tail -n 25 "/var/log/$1.log" 2>/dev/null || true
    else
      echo "(no log file /var/log/$1.log found)"
    fi
  fi
}

# -------------------------------------------------------------------
# Render helpers (also used by the test harness - see GG_LIB_ONLY below)
# -------------------------------------------------------------------

# write_env_files <target dir> - KEY=VALUE files; /etc/default (systemd) and
# /etc/conf.d (OpenRC) both understand this format.
write_env_files() {
  tgt="$1"
  mkdir -p "$tgt"
  cat > "$tgt/gemini-web2api" << EOF
# Configuration for the gemini-web2api service
PORT=${WEB2API_PORT}
HOST=0.0.0.0
WEB2API_DIR=${WEB2API_DIR}
EOF
  cat > "$tgt/glassgem" << EOF
# Configuration for the glassgem service
GLASSGEM_PORT=${GLASSGEM_PORT}
GLASSGEM_MODE=${GLASSGEM_MODE}
GLASSGEM_WEB2API_URL=http://127.0.0.1:${WEB2API_PORT}
NODE_ENV=production
EOF
}

write_systemd_units() {
  tgt="$1"
  mkdir -p "$tgt"
  cat > "$tgt/gemini-web2api.service" << EOF
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
  cat > "$tgt/glassgem.service" << EOF
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
  chmod 644 "$tgt/gemini-web2api.service" "$tgt/glassgem.service"
}

write_openrc_scripts() {
  tgt="$1"
  mkdir -p "$tgt"
  cat > "$tgt/gemini-web2api" << EOF
#!/sbin/openrc-run
# Gemini Web2API service (generated by GlassGem setup-linux.sh).
# Environment comes from /etc/conf.d/gemini-web2api (sourced automatically).
name="gemini-web2api"
description="OpenAI-compatible API server for Google Gemini"
supervisor=supervise-daemon
command="${REPO_ROOT}/scripts/start-web2api.sh"
command_user="${SERVICE_USER}:${SERVICE_GROUP}"
directory="${WEB2API_DIR}"
output_log="/var/log/gemini-web2api.log"
error_log="/var/log/gemini-web2api.log"

depend() {
	need net
	after firewall
}
EOF
  cat > "$tgt/glassgem" << EOF
#!/sbin/openrc-run
# GlassGem web client service (generated by GlassGem setup-linux.sh).
# Environment comes from /etc/conf.d/glassgem (sourced automatically).
name="glassgem"
description="Liquid Glass Chat Client for Gemini Web2API"
supervisor=supervise-daemon
command="${REPO_ROOT}/scripts/start-glassgem.sh"
command_user="${SERVICE_USER}:${SERVICE_GROUP}"
directory="${REPO_ROOT}"
output_log="/var/log/glassgem.log"
error_log="/var/log/glassgem.log"

depend() {
	need net
	use gemini-web2api
	after gemini-web2api
}
EOF
  chmod 755 "$tgt/gemini-web2api" "$tgt/glassgem"
}

# -------------------------------------------------------------------
# Service Status Action
# -------------------------------------------------------------------
check_health() {
  if ! command -v curl >/dev/null 2>&1; then
    printf '%b\n' "   (curl not installed - skipping health checks)"
    return 0
  fi
  if curl -s -m 2 "http://127.0.0.1:$WEB2API_PORT/v1/models" >/dev/null 2>&1; then
    printf '%b\n' "   Web2API Port $WEB2API_PORT: ${GREEN}Healthy and responding${RESET}"
  else
    printf '%b\n' "   Web2API Port $WEB2API_PORT: ${YELLOW}Not responding to HTTP queries${RESET}"
  fi
  if curl -s -m 2 "http://127.0.0.1:$GLASSGEM_PORT/" >/dev/null 2>&1; then
    printf '%b\n' "   GlassGem Port $GLASSGEM_PORT: ${GREEN}Healthy and responding${RESET}"
  else
    printf '%b\n' "   GlassGem Port $GLASSGEM_PORT: ${YELLOW}Not responding to HTTP queries${RESET}"
  fi
  if curl -s -m 2 "http://127.0.0.1:$GLASSGEM_PORT/web2api/v1/models" >/dev/null 2>&1; then
    printf '%b\n' "   Vite Web2API Proxy:   ${GREEN}Functioning normally${RESET}"
  else
    printf '%b\n' "   Vite Web2API Proxy:   ${YELLOW}Waiting for Web2API or GlassGem${RESET}"
  fi
}

svc_status_line() {
  svc="$1"; label="$2"
  if svc_do is-active "$svc" 2>/dev/null; then
    printf '%b\n' "   Status: ${GREEN}Active (running)${RESET}    [$label]"
  else
    printf '%b\n' "   Status: ${RED}Inactive or not running${RESET}    [$label]"
  fi
  if [ "$INIT_SYS" = "systemd" ]; then
    # systemctl is-enabled prints a state (e.g. "disabled") to stdout even on
    # non-zero exit, so only fall back when nothing was captured at all.
    en="$(svc_do is-enabled "$svc" 2>/dev/null || true)"
    if [ -z "$en" ]; then en="not enabled"; fi
  else
    if svc_do is-enabled "$svc" 2>/dev/null; then en="enabled"; else en="not enabled"; fi
  fi
  printf '%s\n' "   Autostart: $en"
}

do_status() {
  echo ""
  printf '%b\n' "${BOLD}=============================================${RESET}"
  printf '%b\n' "${BOLD}  GlassGem & Web2API Service Status${RESET}"
  printf '%b\n' "${BOLD}=============================================${RESET}"
  echo ""

  if [ "$INIT_SYS" = "none" ]; then
    log_warn "No supported init system detected (systemd/OpenRC)."
    log_warn "Services are not registered - run GlassGem with ./run.sh instead."
  else
    printf '%b\n' "${BOLD}1. Gemini Web2API ($INIT_SYS):${RESET}"
    svc_status_line gemini-web2api "$INIT_SYS"
    echo ""
    printf '%b\n' "${BOLD}2. GlassGem Web Client ($INIT_SYS):${RESET}"
    svc_status_line glassgem "$INIT_SYS"
  fi

  echo ""
  printf '%b\n' "${BOLD}3. Network Ports & Health:${RESET}"
  check_health
  echo ""
}

# -------------------------------------------------------------------
# Service Stop / Start / Restart Actions
# -------------------------------------------------------------------
require_services_init() {
  if [ "$INIT_SYS" = "none" ]; then
    log_error "No supported init system detected (need systemd or OpenRC)."
    log_error "Run GlassGem directly with ./run.sh instead."
    exit 1
  fi
}

do_stop() {
  require_root
  require_services_init
  log_info "Stopping services..."
  svc_do stop glassgem 2>/dev/null || true
  svc_do stop gemini-web2api 2>/dev/null || true
  log_ok "Services stopped."
}

do_start() {
  require_root
  require_services_init
  log_info "Starting gemini-web2api..."
  svc_do start gemini-web2api
  log_info "Starting glassgem..."
  svc_do start glassgem
  log_ok "Services started."
  sleep 2
  do_status
}

do_restart() {
  require_root
  require_services_init
  log_info "Restarting gemini-web2api..."
  svc_do restart gemini-web2api
  log_info "Restarting glassgem..."
  svc_do restart glassgem
  log_ok "Services restarted."
  sleep 2
  do_status
}

# -------------------------------------------------------------------
# Service Logs Action
# -------------------------------------------------------------------
do_logs() {
  require_root
  require_services_init
  printf '%b\n' "${BOLD}--- Recent logs for gemini-web2api ---${RESET}"
  service_logs gemini-web2api
  echo ""
  printf '%b\n' "${BOLD}--- Recent logs for glassgem ---${RESET}"
  service_logs glassgem
}

# -------------------------------------------------------------------
# Service Uninstall Action
# -------------------------------------------------------------------
do_uninstall() {
  require_root
  require_services_init
  log_info "Disabling and removing GlassGem & Gemini Web2API system services..."
  svc_do stop glassgem 2>/dev/null || true
  svc_do stop gemini-web2api 2>/dev/null || true
  svc_do disable glassgem 2>/dev/null || true
  svc_do disable gemini-web2api 2>/dev/null || true

  if [ "$INIT_SYS" = "systemd" ]; then
    rm -f /etc/systemd/system/glassgem.service
    rm -f /etc/systemd/system/gemini-web2api.service
    rm -f /etc/default/glassgem
    rm -f /etc/default/gemini-web2api
    systemctl daemon-reload
  else
    rm -f /etc/init.d/glassgem
    rm -f /etc/init.d/gemini-web2api
    rm -f /etc/conf.d/glassgem
    rm -f /etc/conf.d/gemini-web2api
    rm -f /var/log/glassgem.log /var/log/gemini-web2api.log
  fi
  log_ok "Services uninstalled successfully."
}

# -------------------------------------------------------------------
# Port conflict resolution (iproute2 ss, BusyBox ss or lsof variants)
# -------------------------------------------------------------------
clear_port_conflict() {
  port="$1"
  name="$2"

  pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti :"$port" 2>/dev/null || true)"
  elif command -v ss >/dev/null 2>&1; then
    pids="$(ss -tulpn 2>/dev/null | grep -F ":$port " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)"
  fi

  if [ -n "$pids" ]; then
    log_warn "Port $port ($name) is currently occupied by PID(s): $pids"
    for pid in $pids; do
      case "$pid" in ''|*[!0-9]*) continue ;; esac
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
  printf '%b\n' "${BOLD}======================================================${RESET}"
  printf '%b\n' "${BOLD}  GlassGem & Gemini Web2API Service Setup (Linux/Alpine)${RESET}"
  printf '%b\n' "${BOLD}======================================================${RESET}"
  echo ""

  # 1. OS & init system check
  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    log_info "Detected OS: ${PRETTY_NAME:-${ID:-unknown}}"
  fi

  if [ "$INIT_SYS" = "none" ]; then
    log_error "No supported init system detected (need systemd or OpenRC)."
    log_error "Without an init system no boot services can be registered."
    log_error "Run GlassGem directly with ./run.sh instead - that works everywhere."
    exit 1
  fi
  log_ok "Init system: $INIT_SYS"

  # 2. Make sure the required tools exist (offering to install them)
  WANT=""
  command -v node >/dev/null 2>&1 || WANT="$WANT node"
  command -v npm  >/dev/null 2>&1 || WANT="$WANT npm"
  command -v git  >/dev/null 2>&1 || WANT="$WANT git"
  command -v curl >/dev/null 2>&1 || WANT="$WANT curl"
  # Go speeds up the first start (builds from the vendored sources); a
  # prebuilt download is the fallback, so Go is optional but offered.
  HAVE_GO=1
  if ! command -v go >/dev/null 2>&1; then
    HAVE_GO=0
  fi
  if [ -n "$WANT" ]; then
    # shellcheck disable=SC2086
    install_missing $WANT || true
  fi
  if [ "$HAVE_GO" -eq 0 ] && [ -f "$REPO_ROOT/gemini-web2api-ikhsan3adi/go.mod" ]; then
    if install_missing go; then
      log_ok "Go installed - the Web2API server will be built from the bundled sources."
    fi
  fi

  if ! command -v node >/dev/null 2>&1; then
    log_error "Node.js is not installed and could not be installed automatically."
    case "$PKG_MGR" in
      apk)    log_error "Install it with: apk add nodejs npm" ;;
      apt)    log_error "Install it with: apt install nodejs npm (or Node.js LTS from https://nodejs.org)" ;;
      dnf|yum) log_error "Install it with: $PKG_MGR install nodejs npm" ;;
      zypper) log_error "Install it with: zypper install nodejs npm" ;;
      pacman) log_error "Install it with: pacman -S nodejs npm" ;;
      *)      log_error "Install Node.js LTS (>= 20) from https://nodejs.org" ;;
    esac
    exit 1
  fi

  NODE_VER=$(node -v)
  NODE_MAJOR=$(echo "$NODE_VER" | sed 's/^v//; s/\..*//')
  if [ "$NODE_MAJOR" -lt 20 ]; then
    log_error "Node.js $NODE_VER is older than the required version (20+)."
    log_error "Install the current LTS from https://nodejs.org and run this again."
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
  USER_HOME="$(getent passwd "$SERVICE_USER" 2>/dev/null | cut -d: -f6 || true)"
  if [ -z "$USER_HOME" ] && [ -f /etc/passwd ]; then
    USER_HOME="$(awk -F: -v u="$SERVICE_USER" '$1 == u {print $6}' /etc/passwd)"
  fi
  if [ -z "$USER_HOME" ]; then
    USER_HOME="/home/$SERVICE_USER"
  fi

  # 4. Locate or setup gemini-web2api (vendored sources bundled with this repo first)
  if [ -z "$WEB2API_DIR" ]; then
    if [ -d "$REPO_ROOT/gemini-web2api-ikhsan3adi" ]; then
      WEB2API_DIR="$REPO_ROOT/gemini-web2api-ikhsan3adi"
    elif [ -d "$REPO_ROOT/gemini-web2api" ]; then
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

  # Check Go binary, compilation, or prebuilt release download
  if [ -x "$WEB2API_DIR/gemini-web2api" ]; then
    log_ok "Found precompiled gemini-web2api binary."
  elif command -v go >/dev/null 2>&1; then
    # CGO_ENABLED=0: pure-Go module, so a static build runs on glibc AND
    # musl (Alpine) - important because prebuilt release binaries are glibc-only.
    log_info "Go compiler found. Compiling gemini-web2api (static build)..."
    if ! su - "$SERVICE_USER" -c "cd \"$WEB2API_DIR\" && CGO_ENABLED=0 go build -o gemini-web2api ."; then
      log_warn "Go build failed; trying the prebuilt release binary..."
      su - "$SERVICE_USER" -c "cd \"$REPO_ROOT\" && WEB2API_DIR=\"$WEB2API_DIR\" node scripts/ensure-web2api.mjs --install-only" || true
    fi
  elif command -v node >/dev/null 2>&1; then
    log_info "Go compiler not found. Downloading the prebuilt gemini-web2api release..."
    if ! su - "$SERVICE_USER" -c "cd \"$REPO_ROOT\" && WEB2API_DIR=\"$WEB2API_DIR\" node scripts/ensure-web2api.mjs --install-only"; then
      log_warn "Prebuilt download failed; the launcher will fall back to the mock server."
    fi
  else
    log_info "Go compiler not found. The launcher will automatically use the built-in mock server or Python fallback."
  fi

  # 5. Check and build GlassGem dependencies
  log_info "Verifying GlassGem dependencies and build bundle..."
  chmod +x "$REPO_ROOT/scripts/start-web2api.sh" "$REPO_ROOT/scripts/start-glassgem.sh" "$REPO_ROOT/run.sh" "$REPO_ROOT/build.sh" "$REPO_ROOT/scripts/check-env.sh"

  su - "$SERVICE_USER" -c "cd \"$REPO_ROOT\" && sh scripts/check-env.sh"
  if [ ! -f "$REPO_ROOT/dist/index.html" ]; then
    log_info "Building GlassGem production bundle..."
    su - "$SERVICE_USER" -c "cd \"$REPO_ROOT\" && npm run build"
  fi
  log_ok "GlassGem build ready."

  # 6. Check and clear any conflicting background processes on ports
  clear_port_conflict "$WEB2API_PORT" "Web2API"
  clear_port_conflict "$GLASSGEM_PORT" "GlassGem"

  # 7. Environment configuration files
  if [ "$INIT_SYS" = "systemd" ]; then
    env_dir="/etc/default"
  else
    env_dir="/etc/conf.d"
  fi
  log_info "Creating configuration files in $env_dir/..."
  write_env_files "$env_dir"

  # 8/9. Create service definitions for the detected init system
  if [ "$INIT_SYS" = "systemd" ]; then
    log_info "Creating /etc/systemd/system/*.service units..."
    write_systemd_units /etc/systemd/system
    log_info "Reloading systemd daemon..."
    systemctl daemon-reload
  else
    log_info "Creating /etc/init.d/gemini-web2api and /etc/init.d/glassgem (OpenRC)..."
    write_openrc_scripts /etc/init.d
    # supervise-daemon writes logs as the service user: pre-seed the log files
    touch /var/log/gemini-web2api.log /var/log/glassgem.log
    chown "$SERVICE_USER:$SERVICE_GROUP" /var/log/gemini-web2api.log /var/log/glassgem.log 2>/dev/null || true
  fi

  # 10. Enable services for boot/restart, and start them
  log_info "Enabling services to start on system boot/restart..."
  svc_do enable gemini-web2api
  svc_do enable glassgem

  log_info "Starting gemini-web2api..."
  svc_do restart gemini-web2api

  log_info "Starting glassgem..."
  svc_do restart glassgem

  # 11. Health verification
  log_info "Verifying service readiness (waiting up to 10 seconds)..."
  attempts=0
  max_attempts=10
  api_ok=0
  web_ok=0

  while [ "$attempts" -lt "$max_attempts" ]; do
    sleep 1
    attempts=$((attempts + 1))

    if [ "$api_ok" -eq 0 ] && command -v curl >/dev/null 2>&1 && curl -s -m 2 "http://127.0.0.1:$WEB2API_PORT/v1/models" >/dev/null 2>&1; then
      api_ok=1
    fi

    if [ "$web_ok" -eq 0 ] && command -v curl >/dev/null 2>&1 && curl -s -m 2 "http://127.0.0.1:$GLASSGEM_PORT/" >/dev/null 2>&1; then
      web_ok=1
    fi

    if [ "$api_ok" -eq 1 ] && [ "$web_ok" -eq 1 ]; then
      break
    fi
  done

  # Error diagnostics if not running
  if [ "$api_ok" -eq 0 ]; then
    log_warn "gemini-web2api is not responding yet on port $WEB2API_PORT."
    log_info "Recent log output from gemini-web2api:"
    service_logs gemini-web2api
  fi

  if [ "$web_ok" -eq 0 ]; then
    log_warn "glassgem is not responding yet on port $GLASSGEM_PORT."
    log_info "Recent log output from glassgem:"
    service_logs glassgem
  fi

  echo ""
  printf '%b\n' "${BOLD}======================================================${RESET}"
  printf '%b\n' "${BOLD}${GREEN}  Setup & Service Registration Completed Successfully!${RESET}"
  printf '%b\n' "${BOLD}======================================================${RESET}"
  echo ""
  printf '%b\n' "  Both services are now ${GREEN}enabled${RESET} to start automatically on system restart."
  echo ""
  printf '%b\n' "  ${BOLD}Active Endpoints:${RESET}"
  printf '%b\n' "    - GlassGem Web Client : ${GREEN}http://localhost:${GLASSGEM_PORT}${RESET}"
  printf '%b\n' "    - Gemini Web2API Server: ${GREEN}http://localhost:${WEB2API_PORT}/v1${RESET}"
  printf '%b\n' "    - Built-in Proxy Route : ${GREEN}http://localhost:${GLASSGEM_PORT}/web2api/v1${RESET}"
  echo ""
  printf '%b\n' "  ${BOLD}Service Management Commands:${RESET}"
  if [ "$INIT_SYS" = "systemd" ]; then
    printf '%b\n' "    Check status  : ${BOLD}sudo sh setup-linux.sh --status${RESET}   (or systemctl status glassgem)"
    printf '%b\n' "    Restart       : ${BOLD}sudo sh setup-linux.sh --restart${RESET}  (or systemctl restart glassgem)"
    printf '%b\n' "    Stop          : ${BOLD}sudo sh setup-linux.sh --stop${RESET}"
    printf '%b\n' "    Start         : ${BOLD}sudo sh setup-linux.sh --start${RESET}"
    printf '%b\n' "    View live logs: ${BOLD}sudo sh setup-linux.sh --logs${RESET}   (or journalctl -u glassgem -f)"
    printf '%b\n' "    Uninstall     : ${BOLD}sudo sh setup-linux.sh --uninstall${RESET}"
  else
    printf '%b\n' "    Check status  : ${BOLD}sudo sh setup-linux.sh --status${RESET}   (or rc-service glassgem status)"
    printf '%b\n' "    Restart       : ${BOLD}sudo sh setup-linux.sh --restart${RESET}  (or rc-service glassgem restart)"
    printf '%b\n' "    Stop          : ${BOLD}sudo sh setup-linux.sh --stop${RESET}"
    printf '%b\n' "    Start         : ${BOLD}sudo sh setup-linux.sh --start${RESET}"
    printf '%b\n' "    View logs     : ${BOLD}sudo sh setup-linux.sh --logs${RESET}   (or tail -f /var/log/glassgem.log)"
    printf '%b\n' "    Uninstall     : ${BOLD}sudo sh setup-linux.sh --uninstall${RESET}"
  fi
  echo ""
}

# Run the requested action (skipped when the file is sourced as a library,
# e.g. by the test harness: GG_LIB_ONLY=1 sh -c '. ./setup-linux.sh; ...')
if [ -z "${GG_LIB_ONLY:-}" ]; then
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
fi
