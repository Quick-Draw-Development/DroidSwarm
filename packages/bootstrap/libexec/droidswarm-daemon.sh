#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=../lib/droidswarm/common.sh
source "$ROOT_DIR/lib/droidswarm/common.sh"

swarm_id="${1:-}"
state_dir="${2:-}"

if [[ -z "$swarm_id" || -z "$state_dir" ]]; then
  err "Usage: droidswarm-daemon.sh <swarm-id> <state-dir>"
  exit 1
fi

heartbeat_file="$state_dir/heartbeat"
status_file="$state_dir/status"
started_epoch_file="$state_dir/started_epoch"
shutdown_requested="0"

mkdir -p "$state_dir"

set -a
# shellcheck disable=SC1090
source "$state_dir/swarm.env"
if [[ -f "$state_dir/env.list" ]]; then
  # shellcheck disable=SC1090
  source "$state_dir/env.list"
fi
if [[ -f "$state_dir/config.list" ]]; then
  # shellcheck disable=SC1090
  source "$state_dir/config.list"
fi
set +a

touch "$heartbeat_file"
printf '%s\n' "$$" >"$(swarm_pid_file "$swarm_id")"

mark_status() {
  printf '%s\n' "$1" >"$status_file"
}

mark_component_status() {
  local name="$1"
  local status="$2"
  printf '%s\n' "$status" >"$(component_status_file "$name" "$state_dir")"
}

start_component() {
  local name="$1"
  shift

  local log_file pid_file
  log_file="$(component_log_file "$swarm_id" "$name")"
  pid_file="$(component_pid_file "$name" "$state_dir")"

  mark_component_status "$name" "starting"

  "$@" >>"$log_file" 2>&1 &
  local pid="$!"
  printf '%s\n' "$pid" >"$pid_file"
  mark_component_status "$name" "running"
}

stop_component() {
  local name="$1"
  local pid_file pid
  pid_file="$(component_pid_file "$name" "$state_dir")"
  pid=""

  if [[ -f "$pid_file" ]]; then
    pid="$(<"$pid_file")"
  fi

  if [[ -n "$pid" ]] && is_pid_running "$pid"; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    if is_pid_running "$pid"; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi

  mark_component_status "$name" "stopped"
}

shutdown() {
  shutdown_requested="1"
  stop_component "orchestrator"
  stop_component "dashboard"
  stop_component "socket-server"
  mark_status "stopped"
  printf '%s\n' "$(now_utc)" >"$heartbeat_file"
  exit 0
}

fail_daemon() {
  local reason="$1"
  err "$reason"
  shutdown_requested="1"
  stop_component "orchestrator"
  stop_component "dashboard"
  stop_component "socket-server"
  mark_status "failed"
  printf '%s\n' "$(now_utc)" >"$heartbeat_file"
  exit 1
}

run_socket_server() {
  export NODE_ENV=production
  export DROIDSWARM_SPECS_DIR="${DROIDSWARM_SPECS_DIR:-$ROOT_DIR/specs}"
  export DROIDSWARM_VERSION
  export DROIDSWARM_SOCKET_HOST="127.0.0.1"
  export DROIDSWARM_SOCKET_PORT="$DROIDSWARM_WS_PORT"
  export DROIDSWARM_SOCKET_URL="ws://127.0.0.1:$DROIDSWARM_WS_PORT"
  export DROIDSWARM_DB_PATH
  export DROIDSWARM_PROJECT_ID
  export DROIDSWARM_PROJECT_NAME
  export DROIDSWARM_OPERATOR_TOKEN
  exec "$DROIDSWARM_NODE_BIN" "$DROIDSWARM_SOCKET_SERVER_ENTRY"
}

run_dashboard() {
  export NODE_ENV=production
  export DROIDSWARM_SPECS_DIR="${DROIDSWARM_SPECS_DIR:-$ROOT_DIR/specs}"
  export NEXT_PUBLIC_DROIDSWARM_SOCKET_URL="ws://127.0.0.1:$DROIDSWARM_WS_PORT"
  export NEXT_PUBLIC_DROIDSWARM_PROJECT_ID="${DROIDSWARM_PROJECT_ID:-}"
  export DROIDSWARM_VERSION
  export PORT="$DROIDSWARM_DASHBOARD_PORT"
  export HOSTNAME="127.0.0.1"
  export DROIDSWARM_SOCKET_URL="ws://127.0.0.1:$DROIDSWARM_WS_PORT"
  export DROIDSWARM_DB_PATH
  export DROIDSWARM_PROJECT_ID
  export DROIDSWARM_PROJECT_NAME
  export DROIDSWARM_OPERATOR_TOKEN

  if [[ -n "${DROIDSWARM_DASHBOARD_STATIC_DIR:-}" && -d "$DROIDSWARM_DASHBOARD_STATIC_DIR" ]]; then
    mkdir -p "$DROIDSWARM_DASHBOARD_WORKDIR/.next"
    if [[ ! -e "$DROIDSWARM_DASHBOARD_WORKDIR/.next/static" ]]; then
      ln -s "$DROIDSWARM_DASHBOARD_STATIC_DIR" "$DROIDSWARM_DASHBOARD_WORKDIR/.next/static"
    fi
  fi

  if [[ -n "${DROIDSWARM_DASHBOARD_PUBLIC_DIR:-}" && -d "$DROIDSWARM_DASHBOARD_PUBLIC_DIR" ]]; then
    if [[ ! -e "$DROIDSWARM_DASHBOARD_WORKDIR/public" ]]; then
      ln -s "$DROIDSWARM_DASHBOARD_PUBLIC_DIR" "$DROIDSWARM_DASHBOARD_WORKDIR/public"
    fi
  fi

  cd "$DROIDSWARM_DASHBOARD_WORKDIR"
  exec "$DROIDSWARM_NODE_BIN" "$DROIDSWARM_DASHBOARD_SERVER_ENTRY"
}

run_orchestrator() {
  export NODE_ENV=production
  export DROIDSWARM_SPECS_DIR="${DROIDSWARM_SPECS_DIR:-$ROOT_DIR/specs}"
  export DROIDSWARM_VERSION
  export DROIDSWARM_SOCKET_HOST="127.0.0.1"
  export DROIDSWARM_SOCKET_PORT="$DROIDSWARM_WS_PORT"
  export DROIDSWARM_SOCKET_URL="ws://127.0.0.1:$DROIDSWARM_WS_PORT"
  export DROIDSWARM_PROJECT_ID
  export DROIDSWARM_PROJECT_NAME
  export DROIDSWARM_OPERATOR_TOKEN
  exec "$DROIDSWARM_NODE_BIN" "$DROIDSWARM_ORCHESTRATOR_ENTRY"
}

trap shutdown TERM INT

for required_file in \
  "$state_dir/swarm.env" \
  "$DROIDSWARM_NODE_BIN" \
  "$DROIDSWARM_SOCKET_SERVER_ENTRY" \
  "$DROIDSWARM_ORCHESTRATOR_ENTRY" \
  "$DROIDSWARM_DASHBOARD_SERVER_ENTRY"; do
  if [[ ! -e "$required_file" ]]; then
    err "Missing daemon dependency: $required_file"
    exit 1
  fi
done

mark_status "starting"
printf '%s\n' "$(date +%s)" >"$started_epoch_file"

start_component "socket-server" run_socket_server
sleep 1
start_component "dashboard" run_dashboard
sleep 1
start_component "orchestrator" run_orchestrator

mark_status "running"

while true; do
  printf '%s\n' "$(now_utc)" >"$heartbeat_file"

  for component_name in socket-server dashboard orchestrator; do
    component_pid="$(<"$(component_pid_file "$component_name" "$state_dir")")"
    if ! is_pid_running "$component_pid"; then
      mark_component_status "$component_name" "failed"
      if [[ "$shutdown_requested" != "1" ]]; then
        fail_daemon "Component exited unexpectedly: $component_name"
      fi
    fi
  done

  sleep 5
done
