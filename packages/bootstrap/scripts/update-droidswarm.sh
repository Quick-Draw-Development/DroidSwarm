#!/usr/bin/env bash

set -euo pipefail

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

INSTALL_SCRIPT_URL="${DROIDSWARM_INSTALL_SCRIPT_URL:-https://raw.githubusercontent.com/Quick-Draw-Development/DroidSwarm/main/scripts/install-droidswarm.sh}"
REPO_URL=""
REF=""
INSTALL_ROOT="${DROIDSWARM_INSTALL_ROOT:-$HOME/.droidswarm/install}"
BIN_DIR="${DROIDSWARM_BIN_DIR:-$HOME/.local/bin}"
DROIDSWARM_HOME="${DROIDSWARM_HOME:-$HOME/.droidswarm}"

print_help() {
  cat <<'EOF'
Usage:
  update-droidswarm.sh [options]

Options:
  --repo-url URL       Download DroidSwarm from this GitHub repository
  --ref REF            Download this Git ref instead of the default branch
  --install-root DIR   Installer root to update (default: ~/.droidswarm/install)
  --bin-dir DIR        Existing DroidSwarm bin directory
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
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      err "Unknown update option: $1"
      print_help
      exit 1
      ;;
  esac
  shift
done

if [[ -z "$REPO_URL" ]]; then
  REPO_URL="${DROIDSWARM_DEFAULT_REPO_URL:-https://github.com/Quick-Draw-Development/DroidSwarm}"
fi

if [[ -x "$BIN_DIR/DroidSwarm" ]]; then
  DROIDSWARM_HOME="$DROIDSWARM_HOME" "$BIN_DIR/DroidSwarm" shutdown --all >/dev/null 2>&1 || true
fi

declare -a swarm_configs=()
config_file="$DROIDSWARM_HOME/swarms/*/swarm.env"
for env_path in $config_file; do
  [[ -f "$env_path" ]] || continue
  (
    set -a
    source "$env_path"
    printf '%s|%s|%s|%s|%s|%s|%s|%s|%s\n' \
      "${DROIDSWARM_SWARM_ID:-}" \
      "${DROIDSWARM_PROJECT_ROOT:-}" \
      "${DROIDSWARM_DASHBOARD_PORT:-}" \
      "${DROIDSWARM_WS_PORT:-}" \
      "${DROIDSWARM_AGENT_COUNT:-0}" \
      "${DROIDSWARM_MAIN_BRANCH:-main}" \
      "${DROIDSWARM_PRODUCTION_BRANCH:-production}" \
      "${DROIDSWARM_REPO_URL:-}" \
      "${DROIDSWARM_PROJECT_MODE:-}"
  )
done | while IFS= read -r line; do
  swarm_configs+=("$line")
done

rm -rf "$DROIDSWARM_HOME/swarms" "$DROIDSWARM_HOME/run" "$DROIDSWARM_HOME/logs"
mkdir -p "$DROIDSWARM_HOME/{swarms,run,logs}"

INSTALL_ARGS=("--install-root" "$INSTALL_ROOT" "--bin-dir" "$BIN_DIR")
if [[ -n "$REPO_URL" ]]; then
  INSTALL_ARGS+=(--repo-url "$REPO_URL")
fi
if [[ -n "$REF" ]]; then
  INSTALL_ARGS+=(--ref "$REF")
fi

/bin/bash -c "$(curl -fsSL "$INSTALL_SCRIPT_URL")" "${INSTALL_ARGS[@]}"

for config in "${swarm_configs[@]}"; do
  IFS='|' read -r swarm_id project_root dashboard_port ws_port agent_count main_branch production_branch repo_url project_mode <<<"$config"
  [[ -z "$swarm_id" || -z "$project_root" ]] && continue
  old_dir="$DROIDSWARM_HOME/swarms/$swarm_id"
  rm -rf "$old_dir"

  restart_cmd=("$BIN_DIR/DroidSwarm" swarm --swarm-id "$swarm_id" --project-root "$project_root")
  [[ -n "$dashboard_port" ]] && restart_cmd+=(--dashboard-port "$dashboard_port")
  [[ -n "$ws_port" ]] && restart_cmd+=(--ws-port "$ws_port")
  [[ -n "$agent_count" ]] && restart_cmd+=(--agent-count "$agent_count")
  [[ -n "$main_branch" ]] && restart_cmd+=(--main-branch "$main_branch")
  [[ -n "$production_branch" ]] && restart_cmd+=(--production-branch "$production_branch")
  [[ -n "$repo_url" ]] && restart_cmd+=(--repo-url "$repo_url")

  DROIDSWARM_HOME="$DROIDSWARM_HOME" "${restart_cmd[@]}" >/dev/null 2>&1 || true
done
