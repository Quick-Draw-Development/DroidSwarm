#!/usr/bin/env bash

set -euo pipefail
export COPYFILE_DISABLE=1

err() {
  printf 'Error: %s\n' "$*" >&2
}

require_value() {
  local flag="$1"
  local value="${2:-}"
  if [[ -z "$value" ]]; then
    err "Missing value for $flag"
    exit 1
  fi
}

append_path_export() {
  local shell_name="$1"
  local bin_dir="$2"
  local rc_file=""
  local export_line="export PATH=\"$bin_dir:\$PATH\""

  case "$shell_name" in
    zsh)
      rc_file="$HOME/.zshrc"
      ;;
    bash)
      if [[ -f "$HOME/.bash_profile" ]]; then
        rc_file="$HOME/.bash_profile"
      else
        rc_file="$HOME/.bashrc"
      fi
      ;;
    *)
      return 1
      ;;
  esac

  touch "$rc_file"
  if ! grep -Fqx "$export_line" "$rc_file"; then
    printf '\n%s\n' "$export_line" >>"$rc_file"
  fi

  printf '%s\n' "$rc_file"
}

command_path() {
  local candidate="${1:-}"
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  if [[ -n "$candidate" ]] && command -v "$candidate" >/dev/null 2>&1; then
    command -v "$candidate"
    return 0
  fi

  return 1
}

run_install_command() {
  local name="$1"
  local install_cmd="${2:-}"

  if [[ -z "$install_cmd" ]]; then
    return 1
  fi

  printf 'Installing %s...\n' "$name"
  /bin/bash -lc "$install_cmd"
}

write_assignment() {
  local file="$1"
  local key="$2"
  local value="${3:-}"
  printf '%s=%q\n' "$key" "$value" >>"$file"
}

resolve_service_binary() {
  local env_value="$1"
  local install_cmd="$2"
  shift 2

  local path_value=""
  if path_value="$(command_path "$env_value" 2>/dev/null)"; then
    printf '%s\n' "$path_value"
    return 0
  fi

  local candidate
  for candidate in "$@"; do
    if path_value="$(command_path "$candidate" 2>/dev/null)"; then
      printf '%s\n' "$path_value"
      return 0
    fi
  done

  if run_install_command "$candidate" "$install_cmd"; then
    if path_value="$(command_path "$env_value" 2>/dev/null)"; then
      printf '%s\n' "$path_value"
      return 0
    fi
    for candidate in "$@"; do
      if path_value="$(command_path "$candidate" 2>/dev/null)"; then
        printf '%s\n' "$path_value"
        return 0
      fi
    done
  fi

  return 1
}

github_archive_url() {
  local repo_url="$1"
  local ref="${2:-}"
  local owner=""
  local repo=""
  local normalized="${repo_url%.git}"

  if [[ "$normalized" =~ ^https://github\.com/([^/]+)/([^/]+)$ ]]; then
    owner="${BASH_REMATCH[1]}"
    repo="${BASH_REMATCH[2]}"
  elif [[ "$normalized" =~ ^git@github\.com:([^/]+)/([^/]+)$ ]]; then
    owner="${BASH_REMATCH[1]}"
    repo="${BASH_REMATCH[2]}"
  else
    err "Unsupported repo URL for archive install: $repo_url"
    err "Use a GitHub repo URL."
    exit 1
  fi

  if [[ -n "$ref" ]]; then
    printf 'https://codeload.github.com/%s/%s/tar.gz/%s\n' "$owner" "$repo" "$ref"
  else
    printf 'https://codeload.github.com/%s/%s/tar.gz/refs/heads/main\n' "$owner" "$repo"
  fi
}

REPO_URL=""
REF=""
INSTALL_ROOT="${DROIDSWARM_INSTALL_ROOT:-$HOME/.droidswarm/install}"
BIN_DIR="${DROIDSWARM_BIN_DIR:-$HOME/.local/bin}"
SOURCE_DIR=""
DEFAULT_REPO_URL="${DROIDSWARM_DEFAULT_REPO_URL:-https://github.com/Quick-Draw-Development/DroidSwarm}"
WORKSPACE_SOURCE_ROOT=""
FORCE_INSTALL="0"
SERVICE_HOME="${DROIDSWARM_HOME:-$HOME/.droidswarm}"
SERVICE_CONFIG_FILE="${DROIDSWARM_SERVICE_CONFIG:-$SERVICE_HOME/services.env}"
RUNTIME_DIR="$INSTALL_ROOT/runtime"
INSTALL_BIN_DIR="$INSTALL_ROOT/bin"
MODELS_DIR="${DROIDSWARM_MODELS_DIR:-$SERVICE_HOME/models}"

print_help() {
  cat <<'EOF'
Usage:
  install-droidswarm.sh [options]

Options:
  --repo-url URL       Download DroidSwarm from this GitHub repository
  --ref REF            Download this Git ref instead of the default branch
  --install-root DIR   Install files under this directory
  --bin-dir DIR        Place the DroidSwarm symlink in this directory
  --force              Reinstall even if files already exist
  --help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-url)
      shift
      require_value "--repo-url" "${1:-}"
      REPO_URL="$1"
      ;;
    --ref)
      shift
      require_value "--ref" "${1:-}"
      REF="$1"
      ;;
    --install-root)
      shift
      require_value "--install-root" "${1:-}"
      INSTALL_ROOT="$1"
      ;;
    --bin-dir)
      shift
      require_value "--bin-dir" "${1:-}"
      BIN_DIR="$1"
      ;;
    --force)
      FORCE_INSTALL="1"
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      err "Unknown installer option: $1"
      print_help
      exit 1
      ;;
  esac
  shift
done

mkdir -p "$INSTALL_ROOT" "$BIN_DIR" "$SERVICE_HOME"
mkdir -p "$MODELS_DIR"

if [[ -z "$REPO_URL" && -n "$DEFAULT_REPO_URL" ]]; then
  REPO_URL="$DEFAULT_REPO_URL"
fi

if [[ -z "$REPO_URL" ]]; then
  err "Missing repo URL and no default repo configured."
  exit 1
fi

SOURCE_DIR="$INSTALL_ROOT/source/packages/bootstrap"
WORKSPACE_SOURCE_ROOT="$INSTALL_ROOT/source"
ARCHIVE_URL="$(github_archive_url "$REPO_URL" "$REF")"
TMP_ARCHIVE="$(mktemp -t droidswarm-install.XXXXXX.tar.gz)"
rm -rf "$INSTALL_ROOT/source"
mkdir -p "$INSTALL_ROOT/source"
curl -fsSL "$ARCHIVE_URL" -o "$TMP_ARCHIVE"
tar -xzf "$TMP_ARCHIVE" -C "$INSTALL_ROOT/source" --strip-components=1
rm -f "$TMP_ARCHIVE"

SOCKET_RUNTIME_SOURCE="$WORKSPACE_SOURCE_ROOT/dist/apps/socket-server"
ORCHESTRATOR_RUNTIME_SOURCE="$WORKSPACE_SOURCE_ROOT/dist/apps/orchestrator"
BLINK_BRIDGE_RUNTIME_SOURCE="$WORKSPACE_SOURCE_ROOT/dist/apps/blink-bridge"
WORKER_HOST_RUNTIME_SOURCE="$WORKSPACE_SOURCE_ROOT/dist/apps/worker-host"
DASHBOARD_DIST_SOURCE="$WORKSPACE_SOURCE_ROOT/dist/apps/dashboard/.next"
DIST_DIR="$DASHBOARD_DIST_SOURCE"
DASHBOARD_RUNTIME_SOURCE="$DIST_DIR/standalone"
DASHBOARD_STATIC_SOURCE="$DIST_DIR/static"
DASHBOARD_PUBLIC_SOURCE="$WORKSPACE_SOURCE_ROOT/apps/dashboard/public"

for required_path in \
  "$SOCKET_RUNTIME_SOURCE/main.js" \
  "$ORCHESTRATOR_RUNTIME_SOURCE/main.js"; do
  if [[ ! -f "$required_path" ]]; then
    err "Missing built runtime artifact: $required_path"
    err "Build the applications before running the installer."
    exit 1
  fi
done

if [[ ! -d "$DASHBOARD_RUNTIME_SOURCE" ]]; then
  err "Missing dashboard standalone runtime: $DASHBOARD_RUNTIME_SOURCE"
  err "Run: nx build dashboard"
  exit 1
fi

mkdir -p "$INSTALL_ROOT/bin" "$INSTALL_ROOT/lib" "$INSTALL_ROOT/libexec" "$INSTALL_ROOT/runtime"
cp "$SOURCE_DIR/bin/DroidSwarm" "$INSTALL_ROOT/bin/DroidSwarm"
cp -R "$SOURCE_DIR/lib/droidswarm" "$INSTALL_ROOT/lib/"
cp "$SOURCE_DIR/libexec/droidswarm-daemon.sh" "$INSTALL_ROOT/libexec/droidswarm-daemon.sh"
mkdir -p "$INSTALL_ROOT/scripts"
cp "$SOURCE_DIR/scripts/update-droidswarm.sh" "$INSTALL_ROOT/bin/update-droidswarm"
cp "$SOURCE_DIR/scripts/update-droidswarm.sh" "$INSTALL_ROOT/scripts/update-droidswarm.sh"
rm -rf "$INSTALL_ROOT/specs"
mkdir -p "$INSTALL_ROOT/specs"
cp -R "$SOURCE_DIR/specs/." "$INSTALL_ROOT/specs/"
if [[ -f "$WORKSPACE_SOURCE_ROOT/VERSION" ]]; then
  cp "$WORKSPACE_SOURCE_ROOT/VERSION" "$INSTALL_ROOT/VERSION"
fi
rm -rf "$INSTALL_ROOT/runtime/socket-server" "$INSTALL_ROOT/runtime/orchestrator" "$INSTALL_ROOT/runtime/dashboard" "$INSTALL_ROOT/runtime/blink-bridge" "$INSTALL_ROOT/runtime/worker-host"
mkdir -p "$INSTALL_ROOT/runtime/socket-server" "$INSTALL_ROOT/runtime/orchestrator" "$INSTALL_ROOT/runtime/dashboard/.next"
cp -R "$SOCKET_RUNTIME_SOURCE/." "$INSTALL_ROOT/runtime/socket-server/"
(
  cd "$INSTALL_ROOT/runtime/socket-server"
  npm install --production >/dev/null 2>&1 || true
)
cp -R "$ORCHESTRATOR_RUNTIME_SOURCE/." "$INSTALL_ROOT/runtime/orchestrator/"
(
  cd "$INSTALL_ROOT/runtime/orchestrator"
  npm install --production >/dev/null 2>&1 || true
)
if [[ -d "$BLINK_BRIDGE_RUNTIME_SOURCE" ]]; then
  mkdir -p "$INSTALL_ROOT/runtime/blink-bridge"
  cp -R "$BLINK_BRIDGE_RUNTIME_SOURCE/." "$INSTALL_ROOT/runtime/blink-bridge/"
fi
if [[ -d "$WORKER_HOST_RUNTIME_SOURCE" ]]; then
  mkdir -p "$INSTALL_ROOT/runtime/worker-host"
  cp -R "$WORKER_HOST_RUNTIME_SOURCE/." "$INSTALL_ROOT/runtime/worker-host/"
fi
cp -R "$DASHBOARD_RUNTIME_SOURCE/." "$INSTALL_ROOT/runtime/dashboard/"
if [[ -d "$DASHBOARD_STATIC_SOURCE" ]]; then
  cp -R "$DASHBOARD_STATIC_SOURCE" "$INSTALL_ROOT/runtime/dashboard/.next/"
fi
if [[ -d "$DASHBOARD_PUBLIC_SOURCE" ]]; then
  cp -R "$DASHBOARD_PUBLIC_SOURCE" "$INSTALL_ROOT/runtime/dashboard/public"
fi
if [[ -d "$DASHBOARD_DIST_SOURCE" ]]; then
  DASHBOARD_RUNTIME_DIST="$INSTALL_ROOT/runtime/dashboard/dist/apps/dashboard/.next"
  mkdir -p "$DASHBOARD_RUNTIME_DIST"
  cp -R "$DASHBOARD_DIST_SOURCE/." "$DASHBOARD_RUNTIME_DIST"
fi

chmod +x "$INSTALL_ROOT/bin/DroidSwarm" "$INSTALL_ROOT/libexec/droidswarm-daemon.sh" "$INSTALL_ROOT/bin/update-droidswarm" "$INSTALL_ROOT/scripts/update-droidswarm.sh"
ln -sf "$INSTALL_ROOT/bin/DroidSwarm" "$BIN_DIR/DroidSwarm"

BLINK_SERVER_BIN="${DROIDSWARM_BLINK_SERVER_BIN:-$INSTALL_BIN_DIR/blink-server}"
MUX_BIN="${DROIDSWARM_MUX_BIN:-$INSTALL_BIN_DIR/mux}"
LLAMA_SERVER_BIN="${DROIDSWARM_LLAMA_SERVER_BIN:-$INSTALL_BIN_DIR/llama-server}"
LLAMA_MODEL="${DROIDSWARM_LLAMA_MODEL:-$MODELS_DIR/default.gguf}"
BLINK_SERVER_INSTALL_CMD="${DROIDSWARM_BLINK_SERVER_INSTALL_CMD:-}"
MUX_INSTALL_CMD="${DROIDSWARM_MUX_INSTALL_CMD:-}"
LLAMA_INSTALL_CMD="${DROIDSWARM_LLAMA_INSTALL_CMD:-}"
LLAMA_MODEL_DOWNLOAD_CMD="${DROIDSWARM_LLAMA_MODEL_DOWNLOAD_CMD:-}"
BLINK_SERVER_PORT="${DROIDSWARM_BLINK_SERVER_PORT:-8950}"
MUX_PORT="${DROIDSWARM_MUX_PORT:-8960}"
LLAMA_PORT="${DROIDSWARM_LLAMA_PORT:-11434}"

if ! BLINK_SERVER_BIN="$(resolve_service_binary "$BLINK_SERVER_BIN" "$BLINK_SERVER_INSTALL_CMD" blink-server blink 2>/dev/null)"; then
  err "Blink server is required. Set DROIDSWARM_BLINK_SERVER_BIN or DROIDSWARM_BLINK_SERVER_INSTALL_CMD."
  exit 1
fi

if ! MUX_BIN="$(resolve_service_binary "$MUX_BIN" "$MUX_INSTALL_CMD" mux 2>/dev/null)"; then
  err "Mux is required. Set DROIDSWARM_MUX_BIN or DROIDSWARM_MUX_INSTALL_CMD."
  exit 1
fi

if [[ -z "$LLAMA_INSTALL_CMD" && -z "$LLAMA_SERVER_BIN" ]] && command -v brew >/dev/null 2>&1; then
  LLAMA_INSTALL_CMD="brew install llama.cpp"
fi

if ! LLAMA_SERVER_BIN="$(resolve_service_binary "$LLAMA_SERVER_BIN" "$LLAMA_INSTALL_CMD" llama-server 2>/dev/null)"; then
  err "llama.cpp server is required. Set DROIDSWARM_LLAMA_SERVER_BIN or DROIDSWARM_LLAMA_INSTALL_CMD."
  exit 1
fi

if [[ -z "$LLAMA_MODEL" || ! -f "$LLAMA_MODEL" ]]; then
  if [[ -n "$LLAMA_MODEL_DOWNLOAD_CMD" ]]; then
    printf 'Provisioning llama.cpp model...\n'
    /bin/bash -lc "$LLAMA_MODEL_DOWNLOAD_CMD"
  fi
fi

if [[ -z "$LLAMA_MODEL" || ! -f "$LLAMA_MODEL" ]]; then
  err "Missing llama.cpp model file. Set DROIDSWARM_LLAMA_MODEL and optionally DROIDSWARM_LLAMA_MODEL_DOWNLOAD_CMD."
  exit 1
fi

BLINK_SERVER_START_CMD="${DROIDSWARM_BLINK_SERVER_START_CMD:-$BLINK_SERVER_BIN --host 127.0.0.1 --port $BLINK_SERVER_PORT}"
MUX_START_CMD="${DROIDSWARM_MUX_START_CMD:-$MUX_BIN serve --host 127.0.0.1 --port $MUX_PORT}"
LLAMA_START_CMD="${DROIDSWARM_LLAMA_START_CMD:-$LLAMA_SERVER_BIN --host 127.0.0.1 --port $LLAMA_PORT -m $LLAMA_MODEL}"

: >"$SERVICE_CONFIG_FILE"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_BLINK_SERVER_BIN" "$BLINK_SERVER_BIN"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_MUX_BIN" "$MUX_BIN"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_LLAMA_SERVER_BIN" "$LLAMA_SERVER_BIN"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_LLAMA_MODEL" "$LLAMA_MODEL"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_RUNTIME_DIR" "$RUNTIME_DIR"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_BIN_INSTALL_DIR" "$INSTALL_BIN_DIR"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_MODELS_DIR" "$MODELS_DIR"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_DEFAULT_BLINK_SERVER_BIN" "$INSTALL_BIN_DIR/blink-server"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_DEFAULT_MUX_BIN" "$INSTALL_BIN_DIR/mux"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_DEFAULT_LLAMA_SERVER_BIN" "$INSTALL_BIN_DIR/llama-server"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_DEFAULT_LLAMA_MODEL" "$MODELS_DIR/default.gguf"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_DEFAULT_BLINK_BRIDGE_ENTRY" "$RUNTIME_DIR/blink-bridge/main.js"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_DEFAULT_WORKER_HOST_ENTRY" "$RUNTIME_DIR/worker-host/main.js"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_BLINK_SERVER_PORT" "$BLINK_SERVER_PORT"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_MUX_PORT" "$MUX_PORT"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_LLAMA_PORT" "$LLAMA_PORT"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_BLINK_SERVER_START_CMD" "$BLINK_SERVER_START_CMD"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_MUX_START_CMD" "$MUX_START_CMD"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_LLAMA_START_CMD" "$LLAMA_START_CMD"

PATH_UPDATE_MESSAGE="Make sure $BIN_DIR is on your PATH."
UPDATED_RC_FILE=""
CURRENT_SHELL_NAME="$(basename "${SHELL:-}")"
if UPDATED_RC_FILE="$(append_path_export "$CURRENT_SHELL_NAME" "$BIN_DIR" 2>/dev/null)"; then
  PATH_UPDATE_MESSAGE="Added $BIN_DIR to PATH in $UPDATED_RC_FILE. Open a new shell or run: export PATH=\"$BIN_DIR:\$PATH\""
fi

cat <<EOF
Installed DroidSwarm CLI.

Binary: $BIN_DIR/DroidSwarm
Install root: $INSTALL_ROOT
Source: $SOURCE_DIR
Service config: $SERVICE_CONFIG_FILE

$PATH_UPDATE_MESSAGE

Next steps:
  DroidSwarm help
  DroidSwarm setup --project-root "\$PWD" --project-mode <greenfield|existing>
  DroidSwarm swarm --project-root "\$PWD"
EOF
