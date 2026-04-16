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

mark_service_status() {
  local name="$1"
  local status="$2"
  printf '%s\n' "$status" >"$(service_status_file "$name" "$state_dir")"
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

start_service() {
  local name="$1"
  local port="$2"
  shift 2

  local log_file pid_file
  log_file="$(component_log_file "$swarm_id" "$name")"
  pid_file="$(service_pid_file "$name" "$state_dir")"

  mark_service_status "$name" "starting"
  "$@" >>"$log_file" 2>&1 &
  local pid="$!"
  printf '%s\n' "$pid" >"$pid_file"

  if ! wait_for_port "$port" 20 1; then
    mark_service_status "$name" "failed"
    if is_pid_running "$pid"; then
      kill "$pid" 2>/dev/null || true
    fi
    fail_daemon "Service failed health check: $name on port $port"
  fi

  mark_service_status "$name" "running"
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

stop_service() {
  local name="$1"
  local pid_file pid
  pid_file="$(service_pid_file "$name" "$state_dir")"
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

  mark_service_status "$name" "stopped"
}

shutdown() {
  shutdown_requested="1"
  stop_component "blink-bridge"
  stop_component "orchestrator"
  stop_component "dashboard"
  stop_component "socket-server"
  stop_service "llama.cpp"
  stop_service "mux"
  stop_service "blink-server"
  mark_status "stopped"
  printf '%s\n' "$(now_utc)" >"$heartbeat_file"
  exit 0
}

fail_daemon() {
  local reason="$1"
  err "$reason"
  shutdown_requested="1"
  stop_component "blink-bridge"
  stop_component "orchestrator"
  stop_component "dashboard"
  stop_component "socket-server"
  stop_service "llama.cpp"
  stop_service "mux"
  stop_service "blink-server"
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

run_blink_bridge() {
  export NODE_ENV=production
  export DROIDSWARM_DB_PATH
  export DROIDSWARM_PROJECT_ID
  export DROIDSWARM_SLACK_API_BASE_URL
  export DROIDSWARM_SLACK_BOT_TOKEN
  export DROIDSWARM_BLINK_API_BASE_URL
  export DROIDSWARM_BLINK_API_TOKEN
  exec "$DROIDSWARM_NODE_BIN" "$DROIDSWARM_BLINK_BRIDGE_ENTRY"
}

run_blink_server() {
  exec /bin/bash -lc "$DROIDSWARM_BLINK_SERVER_START_CMD"
}

run_mux() {
  exec /bin/bash -lc "$DROIDSWARM_MUX_START_CMD"
}

run_llama_server() {
  exec /bin/bash -lc "$DROIDSWARM_LLAMA_START_CMD"
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
  export DROIDSWARM_BLINK_SERVER_URL="http://127.0.0.1:${DROIDSWARM_BLINK_SERVER_PORT}"
  export DROIDSWARM_MUX_URL="http://127.0.0.1:${DROIDSWARM_MUX_PORT}"
  export DROIDSWARM_LLAMA_BASE_URL="http://127.0.0.1:${DROIDSWARM_LLAMA_PORT}"
  export DROIDSWARM_LLAMA_MODEL
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

if [[ -f "$DROIDSWARM_SERVICE_CONFIG" ]]; then
  # shellcheck disable=SC1090
  source "$DROIDSWARM_SERVICE_CONFIG"
fi

for required_var in \
  DROIDSWARM_BLINK_SERVER_BIN \
  DROIDSWARM_MUX_BIN \
  DROIDSWARM_LLAMA_SERVER_BIN \
  DROIDSWARM_BLINK_SERVER_START_CMD \
  DROIDSWARM_MUX_START_CMD \
  DROIDSWARM_LLAMA_START_CMD \
  DROIDSWARM_BLINK_SERVER_PORT \
  DROIDSWARM_MUX_PORT \
  DROIDSWARM_LLAMA_PORT; do
  if [[ -z "${!required_var:-}" ]]; then
    err "Missing service configuration: $required_var"
    exit 1
  fi
done

for required_bin in \
  "$DROIDSWARM_BLINK_SERVER_BIN" \
  "$DROIDSWARM_MUX_BIN" \
  "$DROIDSWARM_LLAMA_SERVER_BIN"; do
  if [[ ! -x "$required_bin" ]]; then
    err "Missing managed service binary: $required_bin"
    exit 1
  fi
done

if [[ -z "${DROIDSWARM_LLAMA_MODEL:-}" || ! -f "$DROIDSWARM_LLAMA_MODEL" ]]; then
  err "Missing llama.cpp model file: ${DROIDSWARM_LLAMA_MODEL:-unset}"
  exit 1
fi

mark_status "starting"
printf '%s\n' "$(date +%s)" >"$started_epoch_file"

start_service "blink-server" "$DROIDSWARM_BLINK_SERVER_PORT" run_blink_server
start_service "mux" "$DROIDSWARM_MUX_PORT" run_mux
start_service "llama.cpp" "$DROIDSWARM_LLAMA_PORT" run_llama_server
start_component "socket-server" run_socket_server
sleep 1
if [[ -n "${DROIDSWARM_BLINK_BRIDGE_ENTRY:-}" && -f "$DROIDSWARM_BLINK_BRIDGE_ENTRY" ]]; then
  start_component "blink-bridge" run_blink_bridge
  sleep 1
fi
start_component "dashboard" run_dashboard
sleep 1
start_component "orchestrator" run_orchestrator

mark_status "running"

while true; do
  printf '%s\n' "$(now_utc)" >"$heartbeat_file"

  for component_name in socket-server dashboard orchestrator blink-bridge; do
    if [[ "$component_name" == "blink-bridge" && ! -f "$(component_pid_file "$component_name" "$state_dir")" ]]; then
      continue
    fi
    component_pid="$(<"$(component_pid_file "$component_name" "$state_dir")")"
    if ! is_pid_running "$component_pid"; then
      mark_component_status "$component_name" "failed"
      if [[ "$shutdown_requested" != "1" ]]; then
        fail_daemon "Component exited unexpectedly: $component_name"
      fi
    fi
  done

  for service_name in blink-server mux llama.cpp; do
    service_pid="$(<"$(service_pid_file "$service_name" "$state_dir")")"
    if ! is_pid_running "$service_pid"; then
      mark_service_status "$service_name" "failed"
      if [[ "$shutdown_requested" != "1" ]]; then
        fail_daemon "Managed service exited unexpectedly: $service_name"
      fi
    fi
  done

  sleep 5
done
