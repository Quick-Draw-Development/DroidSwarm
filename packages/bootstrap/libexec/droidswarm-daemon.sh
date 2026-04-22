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
component_start_retries="${DROIDSWARM_COMPONENT_START_RETRIES:-3}"
service_start_retries="${DROIDSWARM_SERVICE_START_RETRIES:-3}"
runtime_restart_retries="${DROIDSWARM_RUNTIME_RESTART_RETRIES:-2}"
retry_delay_seconds="${DROIDSWARM_RETRY_DELAY_SECONDS:-2}"
component_grace_seconds="${DROIDSWARM_COMPONENT_GRACE_SECONDS:-2}"

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

stop_pid() {
  local pid="${1:-}"
  if [[ -z "$pid" ]] || ! is_pid_running "$pid"; then
    return 0
  fi

  kill "$pid" 2>/dev/null || true
  sleep 1
  if is_pid_running "$pid"; then
    kill -9 "$pid" 2>/dev/null || true
  fi
}

service_adoption_flag_for_name() {
  case "$1" in
    blink-server)
      printf 'DROIDSWARM_ADOPT_BLINK_SERVER\n'
      ;;
    mux)
      printf 'DROIDSWARM_ADOPT_MUX\n'
      ;;
    llama.cpp)
      printf 'DROIDSWARM_ADOPT_LLAMA\n'
      ;;
    *)
      return 1
      ;;
  esac
}

service_adoption_pid_var_for_name() {
  case "$1" in
    blink-server)
      printf 'DROIDSWARM_ADOPT_BLINK_SERVER_PID\n'
      ;;
    mux)
      printf 'DROIDSWARM_ADOPT_MUX_PID\n'
      ;;
    llama.cpp)
      printf 'DROIDSWARM_ADOPT_LLAMA_PID\n'
      ;;
    *)
      return 1
      ;;
  esac
}

service_should_adopt() {
  local name="$1"
  local flag_var flag_value
  flag_var="$(service_adoption_flag_for_name "$name" || true)"
  [[ -n "$flag_var" ]] || return 1
  flag_value="${!flag_var:-0}"
  [[ "$flag_value" == "1" ]]
}

service_adopted_pid() {
  local name="$1"
  local pid_var
  pid_var="$(service_adoption_pid_var_for_name "$name" || true)"
  [[ -n "$pid_var" ]] || return 1
  printf '%s\n' "${!pid_var:-}"
}

llama_service_looks_healthy() {
  local port="$1"
  local base_url="http://127.0.0.1:${port}"

  if ! port_is_listening "$port"; then
    return 1
  fi

  if http_probe "${base_url}/v1/models" 2; then
    return 0
  fi

  if http_post_json_probe "${base_url}/completion" '{"prompt":"health","n_predict":1}' 3; then
    return 0
  fi

  if http_post_json_probe "${base_url}/v1/completions" '{"model":"default","prompt":"health","max_tokens":1}' 3; then
    return 0
  fi

  return 1
}

service_passes_health_check() {
  local name="$1"
  local port="$2"
  local pid="${3:-}"

  if [[ -z "$port" ]] || ! port_is_listening "$port"; then
    return 1
  fi

  if [[ -n "$pid" ]] && ! is_pid_running "$pid"; then
    return 1
  fi

  case "$name" in
    llama.cpp)
      llama_service_looks_healthy "$port"
      ;;
    *)
      return 0
      ;;
  esac
}

start_component() {
  local name="$1"
  local health_port="$2"
  shift 2

  local log_file pid_file
  log_file="$(component_log_file "$swarm_id" "$name")"
  pid_file="$(component_pid_file "$name" "$state_dir")"
  local attempt=1
  local pid=""

  while [[ "$attempt" -le "$component_start_retries" ]]; do
    mark_component_status "$name" "starting"
    printf '[%s] starting %s (attempt %s/%s)\n' "$(now_utc)" "$name" "$attempt" "$component_start_retries" >>"$log_file"

    "$@" >>"$log_file" 2>&1 &
    pid="$!"
    printf '%s\n' "$pid" >"$pid_file"

    if [[ -n "$health_port" && "$health_port" != "-" ]]; then
      if wait_for_port "$health_port" 20 1; then
        mark_component_status "$name" "running"
        return 0
      fi
    else
      sleep "$component_grace_seconds"
      if is_pid_running "$pid"; then
        mark_component_status "$name" "running"
        return 0
      fi
    fi

    if is_pid_running "$pid"; then
      printf '[%s] component %s failed readiness check; retrying\n' "$(now_utc)" "$name" >>"$log_file"
    else
      printf '[%s] component %s exited during startup; retrying\n' "$(now_utc)" "$name" >>"$log_file"
    fi

    mark_component_status "$name" "retrying"
    stop_pid "$pid"
    attempt=$((attempt + 1))
    if [[ "$attempt" -le "$component_start_retries" ]]; then
      sleep "$retry_delay_seconds"
    fi
  done

  mark_component_status "$name" "failed"
  fail_daemon "Component failed startup after retries: $name"
}

start_service() {
  local name="$1"
  local port="$2"
  shift 2

  local log_file pid_file existing_pid listener_pid
  log_file="$(component_log_file "$swarm_id" "$name")"
  pid_file="$(service_pid_file "$name" "$state_dir")"
  local attempt=1
  local pid=""

  existing_pid=""
  if [[ -f "$pid_file" ]]; then
    existing_pid="$(<"$pid_file")"
  fi

  if port_is_listening "$port"; then
    if [[ -n "$existing_pid" ]] && is_pid_running "$existing_pid"; then
      if service_passes_health_check "$name" "$port" "$existing_pid"; then
        mark_service_status "$name" "running"
        printf '[%s] reusing existing %s on port %s (pid %s)\n' "$(now_utc)" "$name" "$port" "$existing_pid" >>"$log_file"
        return 0
      fi
    fi

    if service_should_adopt "$name"; then
      listener_pid="$(listener_pid_for_port "$port" || true)"
      if [[ -n "$listener_pid" ]]; then
        local adopted_pid
        adopted_pid="$(service_adopted_pid "$name" || true)"
        if [[ -z "$adopted_pid" || "$adopted_pid" == "$listener_pid" ]]; then
          if service_passes_health_check "$name" "$port" "$listener_pid"; then
            printf '%s\n' "$listener_pid" >"$pid_file"
            printf '1\n' >"$(service_adopted_file "$name" "$state_dir")"
            mark_service_status "$name" "running"
            printf '[%s] adopted %s on port %s (pid %s)\n' "$(now_utc)" "$name" "$port" "$listener_pid" >>"$log_file"
            return 0
          fi
        fi
      fi
    fi

    mark_service_status "$name" "failed"
    fail_daemon "Service port already in use before startup: $name on port $port"
  fi

  while [[ "$attempt" -le "$service_start_retries" ]]; do
    mark_service_status "$name" "starting"
    printf '[%s] starting %s on port %s (attempt %s/%s)\n' "$(now_utc)" "$name" "$port" "$attempt" "$service_start_retries" >>"$log_file"

    "$@" >>"$log_file" 2>&1 &
    pid="$!"
    printf '%s\n' "$pid" >"$pid_file"
    rm -f "$(service_adopted_file "$name" "$state_dir")"

    if wait_for_port "$port" 20 1 && service_passes_health_check "$name" "$port" "$pid"; then
      mark_service_status "$name" "running"
      return 0
    fi

    mark_service_status "$name" "retrying"
    printf '[%s] service %s failed health check on port %s; retrying\n' "$(now_utc)" "$name" "$port" >>"$log_file"
    stop_pid "$pid"
    attempt=$((attempt + 1))
    if [[ "$attempt" -le "$service_start_retries" ]]; then
      sleep "$retry_delay_seconds"
    fi
  done

  mark_service_status "$name" "failed"
  fail_daemon "Service failed health check after retries: $name on port $port"
}

restart_component() {
  local name="$1"
  local health_port="$2"
  shift 2

  local log_file
  log_file="$(component_log_file "$swarm_id" "$name")"
  printf '[%s] component %s exited unexpectedly; attempting restart\n' "$(now_utc)" "$name" >>"$log_file"
  mark_component_status "$name" "retrying"
  start_component "$name" "$health_port" "$@"
}

restart_service() {
  local name="$1"
  local port="$2"
  shift 2

  local log_file
  log_file="$(component_log_file "$swarm_id" "$name")"
  printf '[%s] service %s exited unexpectedly; attempting restart\n' "$(now_utc)" "$name" >>"$log_file"
  mark_service_status "$name" "retrying"
  start_service "$name" "$port" "$@"
}

maybe_restart_component() {
  local name="$1"
  local health_port="$2"
  shift 2
  local pid_file restart_count_file restart_count
  pid_file="$(component_pid_file "$name" "$state_dir")"
  restart_count_file="$state_dir/${name}.restarts"
  restart_count="0"

  [[ -f "$restart_count_file" ]] && restart_count="$(<"$restart_count_file")"
  if [[ "$restart_count" -ge "$runtime_restart_retries" ]]; then
    mark_component_status "$name" "failed"
    fail_daemon "Component exceeded restart limit: $name"
  fi

  printf '%s\n' $((restart_count + 1)) >"$restart_count_file"
  restart_component "$name" "$health_port" "$@"
}

maybe_restart_service() {
  local name="$1"
  local port="$2"
  shift 2
  local pid_file restart_count_file restart_count
  pid_file="$(service_pid_file "$name" "$state_dir")"
  restart_count_file="$state_dir/${name}.restarts"
  restart_count="0"

  [[ -f "$restart_count_file" ]] && restart_count="$(<"$restart_count_file")"
  if [[ "$restart_count" -ge "$runtime_restart_retries" ]]; then
    mark_service_status "$name" "failed"
    fail_daemon "Service exceeded restart limit: $name"
  fi

  rm -f "$(service_adopted_file "$name" "$state_dir")"
  printf '%s\n' $((restart_count + 1)) >"$restart_count_file"
  restart_service "$name" "$port" "$@"
}

service_runtime_is_healthy() {
  local name="$1"
  local port="$2"
  local pid_file pid
  pid_file="$(service_pid_file "$name" "$state_dir")"
  pid=""

  if [[ -f "$pid_file" ]]; then
    pid="$(<"$pid_file")"
  fi

  if [[ -f "$(service_adopted_file "$name" "$state_dir")" ]]; then
    service_passes_health_check "$name" "$port" ""
    return $?
  fi

  service_passes_health_check "$name" "$port" "$pid"
}

stop_component() {
  local name="$1"
  local pid_file pid
  pid_file="$(component_pid_file "$name" "$state_dir")"
  pid=""

  if [[ -f "$pid_file" ]]; then
    pid="$(<"$pid_file")"
  fi

  stop_pid "$pid"

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

  if [[ -f "$(service_adopted_file "$name" "$state_dir")" ]]; then
    rm -f "$(service_adopted_file "$name" "$state_dir")"
  else
    stop_pid "$pid"
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
  export DROIDSWARM_LLAMA_MODEL_NAME
  export DROIDSWARM_LLAMA_MODELS_FILE
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
  swarm_blink_port="${DROIDSWARM_BLINK_SERVER_PORT:-}"
  swarm_mux_port="${DROIDSWARM_MUX_PORT:-}"
  swarm_llama_port="${DROIDSWARM_LLAMA_PORT:-}"
  swarm_llama_model="${DROIDSWARM_LLAMA_MODEL:-}"
  # shellcheck disable=SC1090
  source "$DROIDSWARM_SERVICE_CONFIG"
  [[ -n "$swarm_blink_port" ]] && DROIDSWARM_BLINK_SERVER_PORT="$swarm_blink_port"
  [[ -n "$swarm_mux_port" ]] && DROIDSWARM_MUX_PORT="$swarm_mux_port"
  [[ -n "$swarm_llama_port" ]] && DROIDSWARM_LLAMA_PORT="$swarm_llama_port"
  [[ -n "$swarm_llama_model" ]] && DROIDSWARM_LLAMA_MODEL="$swarm_llama_model"
fi

DROIDSWARM_BLINK_SERVER_START_CMD="${DROIDSWARM_BLINK_SERVER_BIN} --host 127.0.0.1 --port ${DROIDSWARM_BLINK_SERVER_PORT}"
DROIDSWARM_MUX_START_CMD="${DROIDSWARM_MUX_BIN} server --host 127.0.0.1 --port ${DROIDSWARM_MUX_PORT}"
DROIDSWARM_LLAMA_START_CMD="${DROIDSWARM_LLAMA_SERVER_BIN} --host 127.0.0.1 --port ${DROIDSWARM_LLAMA_PORT} -m ${DROIDSWARM_LLAMA_MODEL}"

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
start_component "socket-server" "$DROIDSWARM_WS_PORT" run_socket_server
sleep 1
if [[ -n "${DROIDSWARM_BLINK_BRIDGE_ENTRY:-}" && -f "$DROIDSWARM_BLINK_BRIDGE_ENTRY" ]]; then
  start_component "blink-bridge" "-" run_blink_bridge
  sleep 1
fi
start_component "dashboard" "$DROIDSWARM_DASHBOARD_PORT" run_dashboard
sleep 1
start_component "orchestrator" "-" run_orchestrator

mark_status "running"

while true; do
  printf '%s\n' "$(now_utc)" >"$heartbeat_file"

  for component_name in socket-server dashboard orchestrator blink-bridge; do
    if [[ "$component_name" == "blink-bridge" && ! -f "$(component_pid_file "$component_name" "$state_dir")" ]]; then
      continue
    fi
    component_pid="$(<"$(component_pid_file "$component_name" "$state_dir")")"
    if ! is_pid_running "$component_pid"; then
      if [[ "$shutdown_requested" != "1" ]]; then
        case "$component_name" in
          socket-server)
            maybe_restart_component "$component_name" "$DROIDSWARM_WS_PORT" run_socket_server
            ;;
          dashboard)
            maybe_restart_component "$component_name" "$DROIDSWARM_DASHBOARD_PORT" run_dashboard
            ;;
          orchestrator)
            maybe_restart_component "$component_name" "-" run_orchestrator
            ;;
          blink-bridge)
            maybe_restart_component "$component_name" "-" run_blink_bridge
            ;;
        esac
      fi
    fi
  done

  for service_name in blink-server mux llama.cpp; do
    service_pid="$(<"$(service_pid_file "$service_name" "$state_dir")")"
    service_port=""
    case "$service_name" in
      blink-server)
        service_port="$DROIDSWARM_BLINK_SERVER_PORT"
        ;;
      mux)
        service_port="$DROIDSWARM_MUX_PORT"
        ;;
      llama.cpp)
        service_port="$DROIDSWARM_LLAMA_PORT"
        ;;
    esac
    if ! service_runtime_is_healthy "$service_name" "$service_port"; then
      if [[ "$shutdown_requested" != "1" ]]; then
        mark_service_status "$service_name" "retrying"
        case "$service_name" in
          blink-server)
            maybe_restart_service "$service_name" "$DROIDSWARM_BLINK_SERVER_PORT" run_blink_server
            ;;
          mux)
            maybe_restart_service "$service_name" "$DROIDSWARM_MUX_PORT" run_mux
            ;;
          llama.cpp)
            maybe_restart_service "$service_name" "$DROIDSWARM_LLAMA_PORT" run_llama_server
            ;;
        esac
      fi
    fi
  done

  sleep 5
done
