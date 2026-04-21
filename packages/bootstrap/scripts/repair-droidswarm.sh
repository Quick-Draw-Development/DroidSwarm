#!/usr/bin/env bash

set -euo pipefail

err() {
  printf 'Error: %s\n' "$*" >&2
}

info() {
  printf '%s\n' "$*"
}

warn() {
  printf 'Warning: %s\n' "$*" >&2
}

require_value() {
  local flag="$1"
  local value="${2:-}"
  if [[ -z "$value" ]]; then
    err "Missing value for $flag"
    exit 1
  fi
}

verify_swarm_running() {
  local bin_dir="$1"
  local swarm_id="$2"
  local attempts="${3:-10}"
  local delay_seconds="${4:-2}"
  local attempt=1
  local status_output=""
  local swarm_status=""

  while [[ "$attempt" -le "$attempts" ]]; do
    status_output="$(DROIDSWARM_HOME="$DROIDSWARM_HOME" "$bin_dir/DroidSwarm" status --swarm-id "$swarm_id" 2>/dev/null || true)"
    swarm_status="$(printf '%s\n' "$status_output" | awk 'NR==2 { print $3 }')"
    if [[ "$swarm_status" == "running" ]]; then
      return 0
    fi

    sleep "$delay_seconds"
    attempt=$((attempt + 1))
  done

  return 1
}

copy_to_temp() {
  local source_path="$1"
  local destination
  destination="$(mktemp -t droidswarm-repair.XXXXXX.sh)"
  cp "$source_path" "$destination"
  chmod +x "$destination"
  printf '%s\n' "$destination"
}

resolve_install_script() {
  local candidate
  for candidate in \
    "$SCRIPT_DIR/install-droidswarm.sh" \
    "$INSTALL_ROOT/source/packages/bootstrap/scripts/install-droidswarm.sh"; do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

snapshot_swarms() {
  local snapshot_dir="$1"
  local env_path swarm_id swarm_dir

  mkdir -p "$snapshot_dir"
  shopt -s nullglob
  for env_path in "$DROIDSWARM_HOME"/swarms/*/swarm.env; do
    swarm_dir="$(dirname "$env_path")"
    swarm_id="$(basename "$swarm_dir")"
    mkdir -p "$snapshot_dir/$swarm_id"
    cp "$env_path" "$snapshot_dir/$swarm_id/swarm.env"
    [[ -f "$swarm_dir/env.list" ]] && cp "$swarm_dir/env.list" "$snapshot_dir/$swarm_id/env.list"
    [[ -f "$swarm_dir/config.list" ]] && cp "$swarm_dir/config.list" "$snapshot_dir/$swarm_id/config.list"
  done
  shopt -u nullglob
}

append_assignment_args() {
  local assignment_file="$1"
  local flag_name="$2"
  local line key value

  [[ -f "$assignment_file" ]] || return 0

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    key="${line%%=*}"
    [[ -n "$key" ]] || continue
    value="$(
      ASSIGNMENT_FILE="$assignment_file" \
      ASSIGNMENT_KEY="$key" \
      /bin/bash -lc 'set -a; source "$ASSIGNMENT_FILE"; printf "%s" "${!ASSIGNMENT_KEY}"'
    )"
    RESTART_CMD+=("$flag_name" "$key=$value")
  done <"$assignment_file"
}

repair_model_symlink() {
  local default_model="$DROIDSWARM_HOME/models/default.gguf"
  if [[ -L "$default_model" && ! -e "$default_model" ]]; then
    rm -f "$default_model"
  fi
}

restart_captured_swarms() {
  local snapshot_dir="$1"
  local swarm_snapshot_dir snapshot_env_path

  shopt -s nullglob
  for swarm_snapshot_dir in "$snapshot_dir"/*; do
    [[ -d "$swarm_snapshot_dir" ]] || continue
    snapshot_env_path="$swarm_snapshot_dir/swarm.env"
    [[ -f "$snapshot_env_path" ]] || continue

    unset \
      DROIDSWARM_SWARM_ID \
      DROIDSWARM_PROJECT_ROOT \
      DROIDSWARM_DASHBOARD_PORT \
      DROIDSWARM_WS_PORT \
      DROIDSWARM_AGENT_COUNT \
      DROIDSWARM_MAIN_BRANCH \
      DROIDSWARM_PRODUCTION_BRANCH \
      DROIDSWARM_REPO_URL \
      DROIDSWARM_PROJECT_MODE \
      DROIDSWARM_BLINK_SERVER_PORT \
      DROIDSWARM_MUX_PORT \
      DROIDSWARM_LLAMA_PORT \
      DROIDSWARM_LLAMA_MODEL

    # shellcheck disable=SC1090
    source "$snapshot_env_path"

    [[ -n "${DROIDSWARM_SWARM_ID:-}" && -n "${DROIDSWARM_PROJECT_ROOT:-}" ]] || continue

    info "Restarting swarm ${DROIDSWARM_SWARM_ID} (project ${DROIDSWARM_PROJECT_ROOT})"
    RESTART_CMD=(
      "$BIN_DIR/DroidSwarm"
      swarm
      --swarm-id "$DROIDSWARM_SWARM_ID"
      --project-root "$DROIDSWARM_PROJECT_ROOT"
    )
    [[ -n "${DROIDSWARM_DASHBOARD_PORT:-}" ]] && RESTART_CMD+=(--dashboard-port "$DROIDSWARM_DASHBOARD_PORT")
    [[ -n "${DROIDSWARM_WS_PORT:-}" ]] && RESTART_CMD+=(--ws-port "$DROIDSWARM_WS_PORT")
    [[ -n "${DROIDSWARM_AGENT_COUNT:-}" ]] && RESTART_CMD+=(--agent-count "$DROIDSWARM_AGENT_COUNT")
    [[ -n "${DROIDSWARM_MAIN_BRANCH:-}" ]] && RESTART_CMD+=(--main-branch "$DROIDSWARM_MAIN_BRANCH")
    [[ -n "${DROIDSWARM_PRODUCTION_BRANCH:-}" ]] && RESTART_CMD+=(--production-branch "$DROIDSWARM_PRODUCTION_BRANCH")
    [[ -n "${DROIDSWARM_REPO_URL:-}" ]] && RESTART_CMD+=(--repo-url "$DROIDSWARM_REPO_URL")
    [[ -n "${DROIDSWARM_BLINK_SERVER_PORT:-}" ]] && RESTART_CMD+=(--blink-port "$DROIDSWARM_BLINK_SERVER_PORT")
    [[ -n "${DROIDSWARM_MUX_PORT:-}" ]] && RESTART_CMD+=(--mux-port "$DROIDSWARM_MUX_PORT")
    [[ -n "${DROIDSWARM_LLAMA_PORT:-}" ]] && RESTART_CMD+=(--llama-port "$DROIDSWARM_LLAMA_PORT")
    [[ -n "${DROIDSWARM_LLAMA_MODEL:-}" ]] && RESTART_CMD+=(--llama-model "$DROIDSWARM_LLAMA_MODEL")
    append_assignment_args "$swarm_snapshot_dir/env.list" --env
    append_assignment_args "$swarm_snapshot_dir/config.list" --config

    if ! DROIDSWARM_HOME="$DROIDSWARM_HOME" "${RESTART_CMD[@]}" >/dev/null 2>&1; then
      err "Failed to restart swarm ${DROIDSWARM_SWARM_ID}"
      exit 1
    fi

    if ! verify_swarm_running "$BIN_DIR" "$DROIDSWARM_SWARM_ID"; then
      err "Swarm ${DROIDSWARM_SWARM_ID} repaired but did not report a running status in time."
      exit 1
    fi
  done
  shopt -u nullglob
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_URL=""
REF=""
INSTALL_ROOT="${DROIDSWARM_INSTALL_ROOT:-$HOME/.droidswarm/install}"
BIN_DIR="${DROIDSWARM_BIN_DIR:-$HOME/.local/bin}"
DROIDSWARM_HOME="${DROIDSWARM_HOME:-$HOME/.droidswarm}"
CLEAN_REINSTALL="0"
RESTART_SWARMS="1"

print_help() {
  cat <<'EOF'
Usage:
  repair-droidswarm.sh [options]

Options:
  --repo-url URL       Download DroidSwarm from this GitHub repository
  --ref REF            Download this Git ref instead of the default branch
  --install-root DIR   Installer root to repair (default: ~/.droidswarm/install)
  --bin-dir DIR        Existing DroidSwarm bin directory
  --clean              Remove the current install/runtime and reinstall cleanly
  --no-restart         Repair install state without restarting tracked swarms
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
    --clean)
      CLEAN_REINSTALL="1"
      ;;
    --no-restart)
      RESTART_SWARMS="0"
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      err "Unknown repair option: $1"
      print_help
      exit 1
      ;;
  esac
  shift
done

INSTALL_SCRIPT_SOURCE="$(resolve_install_script)" || {
  err "Unable to find the bundled install script for repair."
  exit 1
}
INSTALL_SCRIPT_PATH="$(copy_to_temp "$INSTALL_SCRIPT_SOURCE")"
SNAPSHOT_DIR="$(mktemp -d -t droidswarm-repair-swarms.XXXXXX)"

trap 'rm -f "$INSTALL_SCRIPT_PATH"; rm -rf "$SNAPSHOT_DIR"' EXIT

snapshot_swarms "$SNAPSHOT_DIR"

if [[ -x "$BIN_DIR/DroidSwarm" ]]; then
  DROIDSWARM_HOME="$DROIDSWARM_HOME" "$BIN_DIR/DroidSwarm" shutdown --all >/dev/null 2>&1 || true
fi

repair_model_symlink

if [[ "$CLEAN_REINSTALL" == "1" ]]; then
  info "Performing clean DroidSwarm reinstall..."
  rm -rf "$INSTALL_ROOT"
  rm -f "$BIN_DIR/DroidSwarm" "$BIN_DIR/update-droidswarm" "$BIN_DIR/repair-droidswarm"
fi

rm -f "$DROIDSWARM_HOME/services.env"
rm -rf "$DROIDSWARM_HOME/run" "$DROIDSWARM_HOME/logs" "$DROIDSWARM_HOME/swarms"
mkdir -p "$DROIDSWARM_HOME/run" "$DROIDSWARM_HOME/logs" "$DROIDSWARM_HOME/swarms"

INSTALL_CMD=("$INSTALL_SCRIPT_PATH")
[[ -n "$REPO_URL" ]] && INSTALL_CMD+=(--repo-url "$REPO_URL")
[[ -n "$REF" ]] && INSTALL_CMD+=(--ref "$REF")

env DROIDSWARM_INSTALL_ROOT="$INSTALL_ROOT" \
    DROIDSWARM_BIN_DIR="$BIN_DIR" \
    DROIDSWARM_DEFAULT_REPO_URL="${REPO_URL:-${DROIDSWARM_DEFAULT_REPO_URL:-https://github.com/Quick-Draw-Development/DroidSwarm}}" \
    "${INSTALL_CMD[@]}"

if [[ "$RESTART_SWARMS" == "1" ]]; then
  restart_captured_swarms "$SNAPSHOT_DIR"
fi

info "DroidSwarm repair completed."
