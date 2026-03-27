#!/usr/bin/env bash

set -euo pipefail

err() {
  printf 'Error: %s\n' "$*" >&2
}

info() {
  printf '%s\n' "$*"
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
FORCE_UPDATE="0"
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
  --force              Reinstall regardless of version parity
  --help
EOF
}

parse_github_repo() {
  local repo_url="$1"
  local normalized="${repo_url%.git}"
  local owner=""
  local repo=""

  if [[ "$normalized" =~ ^https://github\.com/([^/]+)/([^/]+)$ ]]; then
    owner="${BASH_REMATCH[1]}"
    repo="${BASH_REMATCH[2]}"
  elif [[ "$normalized" =~ ^git@github\.com:([^/]+)/([^/]+)$ ]]; then
    owner="${BASH_REMATCH[1]}"
    repo="${BASH_REMATCH[2]}"
  else
    return 1
  fi

  printf '%s|%s\n' "$owner" "$repo"
}

raw_file_url() {
  local repo_url="$1"
  local ref="${2:-main}"
  local path="$3"
  local owner_repo

  owner_repo="$(parse_github_repo "$repo_url")" || return 1
  local owner="${owner_repo%%|*}"
  local repo="${owner_repo##*|}"

  printf 'https://raw.githubusercontent.com/%s/%s/%s/%s\n' "$owner" "$repo" "$ref" "$path"
}

read_local_version() {
  if [[ -f "$INSTALL_ROOT/VERSION" ]]; then
    local version_line
    IFS= read -r version_line <"$INSTALL_ROOT/VERSION"
    printf '%s\n' "${version_line%%$'\\r'}"
  fi
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
      FORCE_UPDATE="1"
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
  line=$(
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
    set +a
  )
  swarm_configs+=("$line")
done

rm -rf "$DROIDSWARM_HOME/swarms" "$DROIDSWARM_HOME/run" "$DROIDSWARM_HOME/logs"
mkdir -p "$DROIDSWARM_HOME/{swarms,run,logs}"

local_version="$(read_local_version || true)"
remote_version=""
if remote_url="$(raw_file_url "$REPO_URL" "${REF:-main}" "VERSION" 2>/dev/null)"; then
  info "Fetching version metadata from $remote_url"
  remote_version="$(curl -fsSL "$remote_url" 2>/dev/null || true)"
  remote_version="${remote_version%%$'\r'}"
  remote_version="${remote_version%%$'\n'}"
fi

if [[ "$FORCE_UPDATE" != "1" && -n "$local_version" && -n "$remote_version" && "$local_version" == "$remote_version" ]]; then
  info "Local version: $local_version; already on version $remote_version; skipping update."
  exit 0
fi

info "Local version: ${local_version:-unknown}; remote version: ${remote_version:-unknown}"
info "Downloading and installing the latest runtime into $INSTALL_ROOT"

INSTALL_ARGS=()
if [[ -n "$REPO_URL" ]]; then
  INSTALL_ARGS+=(--repo-url "$REPO_URL")
fi
if [[ -n "$REF" ]]; then
  INSTALL_ARGS+=(--ref "$REF")
fi
env DROIDSWARM_INSTALL_ROOT="$INSTALL_ROOT" \
    DROIDSWARM_BIN_DIR="$BIN_DIR" \
    DROIDSWARM_DEFAULT_REPO_URL="$REPO_URL" \
    /bin/bash -c "$(curl -fsSL "$INSTALL_SCRIPT_URL")" install-droidswarm "${INSTALL_ARGS[@]}"

for config in "${swarm_configs[@]}"; do
  IFS='|' read -r swarm_id project_root dashboard_port ws_port agent_count main_branch production_branch repo_url project_mode <<<"$config"
  [[ -z "$swarm_id" || -z "$project_root" ]] && continue
  old_dir="$DROIDSWARM_HOME/swarms/$swarm_id"
  rm -rf "$old_dir"

  info "Starting swarm $swarm_id (project $project_root) with WS port ${ws_port:-default}"
  restart_cmd=("$BIN_DIR/DroidSwarm" swarm --swarm-id "$swarm_id" --project-root "$project_root")
  [[ -n "$dashboard_port" ]] && restart_cmd+=(--dashboard-port "$dashboard_port")
  [[ -n "$ws_port" ]] && restart_cmd+=(--ws-port "$ws_port")
  [[ -n "$agent_count" ]] && restart_cmd+=(--agent-count "$agent_count")
  [[ -n "$main_branch" ]] && restart_cmd+=(--main-branch "$main_branch")
  [[ -n "$production_branch" ]] && restart_cmd+=(--production-branch "$production_branch")
  [[ -n "$repo_url" ]] && restart_cmd+=(--repo-url "$repo_url")

  DROIDSWARM_HOME="$DROIDSWARM_HOME" "${restart_cmd[@]}" >/dev/null 2>&1 || true
done
