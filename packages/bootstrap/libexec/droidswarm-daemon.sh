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
health_file="$(swarm_service_health_file "$swarm_id")"
health_json_file="$(swarm_service_health_json_file "$swarm_id")"
federation_status_file="$(swarm_federation_status_file "$swarm_id")"
shutdown_requested="0"
component_start_retries="${DROIDSWARM_COMPONENT_START_RETRIES:-3}"
service_start_retries="${DROIDSWARM_SERVICE_START_RETRIES:-3}"
runtime_restart_retries="${DROIDSWARM_RUNTIME_RESTART_RETRIES:-2}"
retry_delay_seconds="${DROIDSWARM_RETRY_DELAY_SECONDS:-2}"
component_grace_seconds="${DROIDSWARM_COMPONENT_GRACE_SECONDS:-2}"
slack_bot_active="0"
swarm_role="${DROIDSWARM_SWARM_ROLE:-master}"
dashboard_enabled="1"
orchestrator_enabled="1"
slack_bot_enabled="${DROIDSWARM_ENABLE_SLACK_BOT:-0}"

if [[ "$swarm_role" == "slave" ]]; then
  dashboard_enabled="0"
  orchestrator_enabled="0"
  slack_bot_enabled="0"
fi

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

llama_inventory_contains_selected_model() {
  local inventory_file="${DROIDSWARM_LLAMA_MODELS_FILE:-}"
  local selected_model="${DROIDSWARM_LLAMA_MODEL:-}"

  if [[ -z "$inventory_file" || -z "$selected_model" || ! -f "$inventory_file" ]]; then
    return 1
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$inventory_file" "$selected_model" <<'PY' >/dev/null 2>&1
import json
import sys

inventory_path = sys.argv[1]
selected_model = sys.argv[2]
with open(inventory_path, 'r', encoding='utf-8') as handle:
    payload = json.load(handle)

models = payload if isinstance(payload, list) else payload.get('models', [])
for model in models:
    if not isinstance(model, dict):
        continue
    if model.get('path') == selected_model:
        sys.exit(0)
sys.exit(1)
PY
    return $?
  fi

  grep -Fq "$(basename "$selected_model")" "$inventory_file"
}

llama_inventory_model_count() {
  local inventory_file="${DROIDSWARM_LLAMA_MODELS_FILE:-}"
  if [[ -z "$inventory_file" || ! -f "$inventory_file" ]]; then
    printf '0\n'
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$inventory_file" <<'PY' 2>/dev/null
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    payload = json.load(handle)

models = payload if isinstance(payload, list) else payload.get('models', [])
print(len(models) if isinstance(models, list) else 0)
PY
    return
  fi

  grep -c '"path"' "$inventory_file" 2>/dev/null || printf '0\n'
}

write_service_health_snapshot() {
  local llama_status
  local llama_reachable
  local inventory_present selected_model_present inventory_contains_selected all_ready
  local inventory_count

  llama_status="unknown"
  llama_reachable="0"

  [[ -f "$(service_status_file "llama.cpp" "$state_dir")" ]] && llama_status="$(<"$(service_status_file "llama.cpp" "$state_dir")")"
  if service_runtime_is_healthy "llama.cpp" "${DROIDSWARM_LLAMA_PORT:-}"; then
    llama_reachable="1"
  fi

  inventory_present="0"
  selected_model_present="0"
  inventory_contains_selected="0"
  [[ -n "${DROIDSWARM_LLAMA_MODELS_FILE:-}" && -f "${DROIDSWARM_LLAMA_MODELS_FILE:-}" ]] && inventory_present="1"
  [[ -n "${DROIDSWARM_LLAMA_MODEL:-}" && -f "${DROIDSWARM_LLAMA_MODEL:-}" ]] && selected_model_present="1"
  if llama_inventory_contains_selected_model; then
    inventory_contains_selected="1"
  fi
  inventory_count="$(llama_inventory_model_count)"

  all_ready="0"
  if [[ "$llama_reachable" == "1" && "$selected_model_present" == "1" && "$inventory_contains_selected" == "1" ]]; then
    all_ready="1"
  fi

  cat >"$health_file" <<EOF
DROIDSWARM_HEALTH_UPDATED_AT=$(printf '%q' "$(now_utc)")
DROIDSWARM_HEALTH_LLAMA_STATUS=$(printf '%q' "$llama_status")
DROIDSWARM_HEALTH_LLAMA_REACHABLE=$(printf '%q' "$llama_reachable")
DROIDSWARM_HEALTH_LLAMA_URL=$(printf '%q' "${DROIDSWARM_LLAMA_BASE_URL:-http://127.0.0.1:${DROIDSWARM_LLAMA_PORT:-}}")
DROIDSWARM_HEALTH_LLAMA_MODEL=$(printf '%q' "${DROIDSWARM_LLAMA_MODEL:-}")
DROIDSWARM_HEALTH_LLAMA_MODEL_PRESENT=$(printf '%q' "$selected_model_present")
DROIDSWARM_HEALTH_LLAMA_MODELS_FILE=$(printf '%q' "${DROIDSWARM_LLAMA_MODELS_FILE:-}")
DROIDSWARM_HEALTH_LLAMA_INVENTORY_PRESENT=$(printf '%q' "$inventory_present")
DROIDSWARM_HEALTH_LLAMA_INVENTORY_COUNT=$(printf '%q' "$inventory_count")
DROIDSWARM_HEALTH_LLAMA_INVENTORY_HAS_SELECTED=$(printf '%q' "$inventory_contains_selected")
DROIDSWARM_HEALTH_ALL_READY=$(printf '%q' "$all_ready")
EOF

  cat >"$health_json_file" <<EOF
{
  "updatedAt": "$(json_escape "$(now_utc)")",
  "allReady": $([[ "$all_ready" == "1" ]] && printf 'true' || printf 'false'),
  "llama": {
    "status": "$(json_escape "$llama_status")",
    "reachable": $([[ "$llama_reachable" == "1" ]] && printf 'true' || printf 'false'),
    "url": "$(json_escape "${DROIDSWARM_LLAMA_BASE_URL:-http://127.0.0.1:${DROIDSWARM_LLAMA_PORT:-}}")",
    "model": "$(json_escape "${DROIDSWARM_LLAMA_MODEL:-}")",
    "modelPresent": $([[ "$selected_model_present" == "1" ]] && printf 'true' || printf 'false'),
    "inventoryFile": "$(json_escape "${DROIDSWARM_LLAMA_MODELS_FILE:-}")",
    "inventoryPresent": $([[ "$inventory_present" == "1" ]] && printf 'true' || printf 'false'),
    "inventoryCount": $([[ "$inventory_count" =~ ^[0-9]+$ ]] && printf '%s' "$inventory_count" || printf '0'),
    "inventoryHasSelected": $([[ "$inventory_contains_selected" == "1" ]] && printf 'true' || printf 'false')
  }
}
EOF
}

write_federation_status_snapshot() {
  local enabled state node_id host bus_port admin_port bus_url admin_url
  local peer_count recent_event_count status_json

  enabled="${DROIDSWARM_ENABLE_FEDERATION:-0}"
  node_id="${DROIDSWARM_FEDERATION_NODE_ID:-$swarm_id}"
  host="${DROIDSWARM_FEDERATION_HOST:-127.0.0.1}"
  bus_port="${DROIDSWARM_FEDERATION_BUS_PORT:-}"
  admin_port="${DROIDSWARM_FEDERATION_ADMIN_PORT:-}"
  bus_url="${DROIDSWARM_FEDERATION_BUS_URL:-}"
  admin_url="${DROIDSWARM_FEDERATION_ADMIN_URL:-}"
  peer_count="0"
  recent_event_count="0"
  state="disabled"

  if [[ "$enabled" == "1" ]]; then
    if federation_service_looks_healthy "${bus_port:-0}"; then
      state="enabled"
      if command -v curl >/dev/null 2>&1 && [[ -n "$admin_url" ]]; then
        status_json="$(curl -fsS --max-time 2 "${admin_url%/}/status" 2>/dev/null || true)"
      else
        status_json=""
      fi

      if [[ -n "$status_json" ]] && command -v python3 >/dev/null 2>&1; then
        read -r peer_count recent_event_count state < <(
          python3 - "$status_json" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
peer_count = int(payload.get("peerCount") or 0)
recent_event_count = int(payload.get("recentEventCount") or 0)
state = "active" if peer_count > 0 else "enabled"
print(peer_count, recent_event_count, state)
PY
        )
        printf '%s\n' "$status_json" >"$federation_status_file"
        return 0
      fi
    else
      state="degraded"
    fi
  fi

  cat >"$federation_status_file" <<EOF
{
  "enabled": $([[ "$enabled" == "1" ]] && printf 'true' || printf 'false'),
  "state": "$(json_escape "$state")",
  "nodeId": "$(json_escape "$node_id")",
  "host": "$(json_escape "$host")",
  "busPort": $([[ "$bus_port" =~ ^[0-9]+$ ]] && printf '%s' "$bus_port" || printf 'null'),
  "adminPort": $([[ "$admin_port" =~ ^[0-9]+$ ]] && printf '%s' "$admin_port" || printf 'null'),
  "busUrl": "$(json_escape "$bus_url")",
  "adminUrl": "$(json_escape "$admin_url")",
  "adbEnabled": $([[ "${DROIDSWARM_ENABLE_FEDERATION_ADB:-0}" == "1" ]] && printf 'true' || printf 'false'),
  "adbUrl": "$(json_escape "http://127.0.0.1:${DROIDSWARM_FEDERATION_ADB_PORT:-}")",
  "peerCount": $([[ "$peer_count" =~ ^[0-9]+$ ]] && printf '%s' "$peer_count" || printf '0'),
  "recentEventCount": $([[ "$recent_event_count" =~ ^[0-9]+$ ]] && printf '%s' "$recent_event_count" || printf '0'),
  "peers": [],
  "updatedAt": "$(json_escape "$(now_utc)")"
}
EOF
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
    llama.cpp)
      printf 'DROIDSWARM_ADOPT_LLAMA\n'
      ;;
    federation-bus)
      printf 'DROIDSWARM_ADOPT_FEDERATION\n'
      ;;
    *)
      return 1
      ;;
  esac
}

service_adoption_pid_var_for_name() {
  case "$1" in
    llama.cpp)
      printf 'DROIDSWARM_ADOPT_LLAMA_PID\n'
      ;;
    federation-bus)
      printf 'DROIDSWARM_ADOPT_FEDERATION_PID\n'
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

federation_service_looks_healthy() {
  local bus_port="$1"
  local admin_port="${DROIDSWARM_FEDERATION_ADMIN_PORT:-$((bus_port + 3))}"
  local admin_url="http://127.0.0.1:${admin_port}"

  if ! port_is_listening "$bus_port"; then
    return 1
  fi

  if ! port_is_listening "$admin_port"; then
    return 1
  fi

  http_probe "${admin_url}/status" 2
}

federation_adb_service_looks_healthy() {
  local port="$1"
  local url="http://127.0.0.1:${port}"

  if ! port_is_listening "$port"; then
    return 1
  fi

  http_probe "$url" 2
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
    federation-bus)
      federation_service_looks_healthy "$port"
      ;;
    federation-adb)
      federation_adb_service_looks_healthy "$port"
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
  stop_component "slack-bot"
  stop_component "orchestrator"
  stop_component "dashboard"
  stop_component "socket-server"
  stop_service "federation-adb"
  stop_service "federation-bus"
  stop_service "llama.cpp"
  mark_status "stopped"
  write_service_health_snapshot
  write_federation_status_snapshot
  printf '%s\n' "$(now_utc)" >"$heartbeat_file"
  exit 0
}

fail_daemon() {
  local reason="$1"
  err "$reason"
  shutdown_requested="1"
  stop_component "slack-bot"
  stop_component "orchestrator"
  stop_component "dashboard"
  stop_component "socket-server"
  stop_service "federation-adb"
  stop_service "federation-bus"
  stop_service "llama.cpp"
  mark_status "failed"
  write_service_health_snapshot
  write_federation_status_snapshot
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
  export DROIDSWARM_ENABLE_FEDERATION
  export DROIDSWARM_FEDERATION_NODE_ID
  export DROIDSWARM_FEDERATION_BUS_URL
  export DROIDSWARM_FEDERATION_ADMIN_URL
  export DROIDSWARM_FEDERATION_POLL_MS="${DROIDSWARM_FEDERATION_POLL_MS:-2000}"
  export DROIDSWARM_FEDERATION_SIGNING_KEY_ID="${DROIDSWARM_FEDERATION_SIGNING_KEY_ID:-}"
  export DROIDSWARM_FEDERATION_SIGNING_PRIVATE_KEY="${DROIDSWARM_FEDERATION_SIGNING_PRIVATE_KEY:-}"
  export DROIDSWARM_ENABLE_GOVERNANCE="${DROIDSWARM_ENABLE_GOVERNANCE:-1}"
  exec "$DROIDSWARM_NODE_BIN" "$DROIDSWARM_SOCKET_SERVER_ENTRY"
}

run_llama_server() {
  exec /bin/bash -lc "$DROIDSWARM_LLAMA_START_CMD"
}

run_federation_bus() {
  export NODE_ENV=production
  export DROIDSWARM_FEDERATION_NODE_ID
  export DROIDSWARM_FEDERATION_HOST
  export DROIDSWARM_FEDERATION_BUS_PORT
  export DROIDSWARM_FEDERATION_ADMIN_PORT
  export DROIDSWARM_FEDERATION_PEERS
  export DROIDSWARM_FEDERATION_SIGNING_KEY_ID="${DROIDSWARM_FEDERATION_SIGNING_KEY_ID:-}"
  export DROIDSWARM_FEDERATION_SIGNING_PRIVATE_KEY="${DROIDSWARM_FEDERATION_SIGNING_PRIVATE_KEY:-}"
  export DROIDSWARM_FEDERATION_SIGNING_PUBLIC_KEY="${DROIDSWARM_FEDERATION_SIGNING_PUBLIC_KEY:-}"
  export DROIDSWARM_FEDERATION_TRUSTED_PUBLIC_KEYS="${DROIDSWARM_FEDERATION_TRUSTED_PUBLIC_KEYS:-}"
  export DROIDSWARM_FEDERATION_ENFORCE_SIGNATURES="${DROIDSWARM_FEDERATION_ENFORCE_SIGNATURES:-0}"
  export DROIDSWARM_ENABLE_GOVERNANCE="${DROIDSWARM_ENABLE_GOVERNANCE:-1}"
  export DROIDSWARM_SWARM_ROLE="$swarm_role"
  export DROIDSWARM_FEDERATION_CONNECT_TO="${DROIDSWARM_FEDERATION_CONNECT_TO:-}"
  export DROIDSWARM_FEDERATION_MASTER_ADMIN_PORT="${DROIDSWARM_FEDERATION_MASTER_ADMIN_PORT:-4950}"
  exec "$DROIDSWARM_NODE_BIN" "$DROIDSWARM_FEDERATION_BUS_ENTRY"
}

run_federation_adb() {
  export NODE_ENV=production
  export DROIDSWARM_FEDERATION_ADB_PORT
  export DROIDSWARM_FEDERATION_ADB_BIN
  exec "$DROIDSWARM_NODE_BIN" "$DROIDSWARM_FEDERATION_ADB_ENTRY"
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
  export DROIDSWARM_ENABLE_FEDERATION
  export DROIDSWARM_FEDERATION_NODE_ID
  export DROIDSWARM_FEDERATION_HOST
  export DROIDSWARM_FEDERATION_BUS_PORT
  export DROIDSWARM_FEDERATION_ADMIN_PORT
  export DROIDSWARM_FEDERATION_BUS_URL
  export DROIDSWARM_FEDERATION_ADMIN_URL
  export DROIDSWARM_FEDERATION_PEERS

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
  export DROIDSWARM_LLAMA_BASE_URL="http://127.0.0.1:${DROIDSWARM_LLAMA_PORT}"
  export DROIDSWARM_LLAMA_MODEL
  export DROIDSWARM_LLAMA_MODEL_NAME
  export DROIDSWARM_LLAMA_MODELS_FILE
  export DROIDSWARM_ENABLE_FEDERATION="${DROIDSWARM_ENABLE_FEDERATION:-0}"
  export DROIDSWARM_FEDERATION_NODE_ID="${DROIDSWARM_FEDERATION_NODE_ID:-$DROIDSWARM_SWARM_ID}"
  export DROIDSWARM_FEDERATION_BUS_URL="${DROIDSWARM_FEDERATION_BUS_URL:-}"
  export DROIDSWARM_FEDERATION_ADMIN_URL="${DROIDSWARM_FEDERATION_ADMIN_URL:-}"
  export DROIDSWARM_FEDERATION_PEERS="${DROIDSWARM_FEDERATION_PEERS:-}"
  export DROIDSWARM_FEDERATION_REMOTE_WORKERS_FILE="${DROIDSWARM_FEDERATION_REMOTE_WORKERS_FILE:-}"
  export DROIDSWARM_FEDERATION_SIGNING_KEY_ID="${DROIDSWARM_FEDERATION_SIGNING_KEY_ID:-}"
  export DROIDSWARM_FEDERATION_SIGNING_PRIVATE_KEY="${DROIDSWARM_FEDERATION_SIGNING_PRIVATE_KEY:-}"
  export DROIDSWARM_FEDERATION_SIGNING_PUBLIC_KEY="${DROIDSWARM_FEDERATION_SIGNING_PUBLIC_KEY:-}"
  export DROIDSWARM_FEDERATION_TRUSTED_PUBLIC_KEYS="${DROIDSWARM_FEDERATION_TRUSTED_PUBLIC_KEYS:-}"
  export DROIDSWARM_FEDERATION_ENFORCE_SIGNATURES="${DROIDSWARM_FEDERATION_ENFORCE_SIGNATURES:-0}"
  export DROIDSWARM_FEDERATION_ADB_BIN="${DROIDSWARM_FEDERATION_ADB_BIN:-adb}"
  export DROIDSWARM_ENABLE_GOVERNANCE="${DROIDSWARM_ENABLE_GOVERNANCE:-1}"
  exec "$DROIDSWARM_NODE_BIN" "$DROIDSWARM_ORCHESTRATOR_ENTRY"
}

slack_bot_has_tokens() {
  local service_name="${DROIDSWARM_SLACK_KEYCHAIN_SERVICE:-DroidSwarm Slack}"

  if [[ -n "${DROIDSWARM_SLACK_BOT_TOKEN:-}" && -n "${DROIDSWARM_SLACK_APP_TOKEN:-}" ]]; then
    return 0
  fi

  if command -v security >/dev/null 2>&1; then
    security find-generic-password -w -s "$service_name" -a droidswarm-slack-bot-token >/dev/null 2>&1 || return 1
    security find-generic-password -w -s "$service_name" -a droidswarm-slack-app-token >/dev/null 2>&1 || return 1
    return 0
  fi

  return 1
}

run_slack_bot() {
  export NODE_ENV=production
  export DROIDSWARM_ENABLE_SLACK_BOT="${DROIDSWARM_ENABLE_SLACK_BOT:-0}"
  export DROIDSWARM_ENABLE_GOVERNANCE="${DROIDSWARM_ENABLE_GOVERNANCE:-1}"
  export DROIDSWARM_SLACK_KEYCHAIN_SERVICE="${DROIDSWARM_SLACK_KEYCHAIN_SERVICE:-DroidSwarm Slack}"
  export DROIDSWARM_PROJECT_ID
  export DROIDSWARM_PROJECT_NAME
  export DROIDSWARM_PROJECT_ROOT
  export DROIDSWARM_SWARM_ID
  export DROIDSWARM_DB_PATH
  exec "$DROIDSWARM_NODE_BIN" "$DROIDSWARM_SLACK_BOT_ENTRY"
}

trap shutdown TERM INT

for required_file in \
  "$state_dir/swarm.env" \
  "$DROIDSWARM_NODE_BIN" \
  "$DROIDSWARM_SOCKET_SERVER_ENTRY"; do
  if [[ ! -e "$required_file" ]]; then
    err "Missing daemon dependency: $required_file"
    exit 1
  fi
done

if [[ "$orchestrator_enabled" == "1" && ! -e "$DROIDSWARM_ORCHESTRATOR_ENTRY" ]]; then
  err "Missing daemon dependency: $DROIDSWARM_ORCHESTRATOR_ENTRY"
  exit 1
fi

if [[ "$dashboard_enabled" == "1" && ! -e "$DROIDSWARM_DASHBOARD_SERVER_ENTRY" ]]; then
  err "Missing daemon dependency: $DROIDSWARM_DASHBOARD_SERVER_ENTRY"
  exit 1
fi

if [[ "${DROIDSWARM_ENABLE_FEDERATION:-0}" == "1" ]]; then
  for required_file in "$DROIDSWARM_FEDERATION_BUS_ENTRY"; do
    if [[ ! -e "$required_file" ]]; then
      err "Missing daemon dependency: $required_file"
      exit 1
    fi
  done
fi

if [[ "${DROIDSWARM_ENABLE_FEDERATION_ADB:-0}" == "1" ]]; then
  for required_file in "$DROIDSWARM_FEDERATION_ADB_ENTRY"; do
    if [[ ! -e "$required_file" ]]; then
      err "Missing daemon dependency: $required_file"
      exit 1
    fi
  done
fi

if [[ "${DROIDSWARM_ENABLE_SLACK_BOT:-0}" == "1" ]]; then
  for required_file in "$DROIDSWARM_SLACK_BOT_ENTRY"; do
    if [[ ! -e "$required_file" ]]; then
      err "Missing daemon dependency: $required_file"
      exit 1
    fi
  done
fi

if [[ -f "$DROIDSWARM_SERVICE_CONFIG" ]]; then
  swarm_llama_port="${DROIDSWARM_LLAMA_PORT:-}"
  swarm_llama_model="${DROIDSWARM_LLAMA_MODEL:-}"
  # shellcheck disable=SC1090
  source "$DROIDSWARM_SERVICE_CONFIG"
  [[ -n "$swarm_llama_port" ]] && DROIDSWARM_LLAMA_PORT="$swarm_llama_port"
  [[ -n "$swarm_llama_model" ]] && DROIDSWARM_LLAMA_MODEL="$swarm_llama_model"
fi

if [[ "${DROIDSWARM_ENABLE_FEDERATION:-0}" == "1" ]]; then
  for required_var in \
    DROIDSWARM_FEDERATION_BUS_ENTRY \
    DROIDSWARM_FEDERATION_BUS_PORT \
    DROIDSWARM_FEDERATION_ADMIN_PORT; do
    if [[ -z "${!required_var:-}" ]]; then
      err "Missing federation configuration: $required_var"
      exit 1
    fi
  done
fi

if [[ "${DROIDSWARM_ENABLE_FEDERATION_ADB:-0}" == "1" ]]; then
  for required_var in DROIDSWARM_FEDERATION_ADB_ENTRY DROIDSWARM_FEDERATION_ADB_PORT; do
    if [[ -z "${!required_var:-}" ]]; then
      err "Missing federation ADB configuration: $required_var"
      exit 1
    fi
  done
fi

DROIDSWARM_LLAMA_START_CMD="${DROIDSWARM_LLAMA_SERVER_BIN} --host 127.0.0.1 --port ${DROIDSWARM_LLAMA_PORT} -m ${DROIDSWARM_LLAMA_MODEL}"

for required_var in \
  DROIDSWARM_LLAMA_SERVER_BIN \
  DROIDSWARM_LLAMA_START_CMD \
  DROIDSWARM_LLAMA_PORT; do
  if [[ -z "${!required_var:-}" ]]; then
    err "Missing service configuration: $required_var"
    exit 1
  fi
done

for required_bin in "$DROIDSWARM_LLAMA_SERVER_BIN"; do
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

start_service "llama.cpp" "$DROIDSWARM_LLAMA_PORT" run_llama_server
if [[ "${DROIDSWARM_ENABLE_FEDERATION:-0}" == "1" ]]; then
  start_service "federation-bus" "$DROIDSWARM_FEDERATION_BUS_PORT" run_federation_bus
fi
if [[ "${DROIDSWARM_ENABLE_FEDERATION_ADB:-0}" == "1" ]]; then
  start_service "federation-adb" "$DROIDSWARM_FEDERATION_ADB_PORT" run_federation_adb
fi
start_component "socket-server" "$DROIDSWARM_WS_PORT" run_socket_server
sleep 1
if [[ "$dashboard_enabled" == "1" ]]; then
  start_component "dashboard" "$DROIDSWARM_DASHBOARD_PORT" run_dashboard
else
  mark_component_status "dashboard" "disabled"
fi
sleep 1
if [[ "$orchestrator_enabled" == "1" ]]; then
  start_component "orchestrator" "-" run_orchestrator
else
  mark_component_status "orchestrator" "disabled"
fi
if [[ "$slack_bot_enabled" == "1" ]]; then
  if slack_bot_has_tokens; then
    start_component "slack-bot" "-" run_slack_bot
    slack_bot_active="1"
  else
    mark_component_status "slack-bot" "disabled"
    printf '[%s] slack-bot disabled; missing bot/app tokens\n' "$(now_utc)" >>"$(component_log_file "$swarm_id" "slack-bot")"
  fi
fi

mark_status "running"
write_service_health_snapshot
write_federation_status_snapshot

while true; do
  printf '%s\n' "$(now_utc)" >"$heartbeat_file"

  for component_name in socket-server dashboard orchestrator slack-bot; do
    if [[ "$component_name" == "slack-bot" && "$slack_bot_active" != "1" ]]; then
      continue
    fi
    if [[ "$component_name" == "dashboard" && "$dashboard_enabled" != "1" ]]; then
      continue
    fi
    if [[ "$component_name" == "orchestrator" && "$orchestrator_enabled" != "1" ]]; then
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
          slack-bot)
            maybe_restart_component "$component_name" "-" run_slack_bot
            ;;
        esac
      fi
    fi
  done

  for service_name in llama.cpp federation-bus federation-adb; do
    if [[ "$service_name" == "federation-bus" && "${DROIDSWARM_ENABLE_FEDERATION:-0}" != "1" ]]; then
      continue
    fi
    if [[ "$service_name" == "federation-adb" && "${DROIDSWARM_ENABLE_FEDERATION_ADB:-0}" != "1" ]]; then
      continue
    fi
    service_pid="$(<"$(service_pid_file "$service_name" "$state_dir")")"
    service_port=""
    case "$service_name" in
      llama.cpp)
        service_port="$DROIDSWARM_LLAMA_PORT"
        ;;
      federation-bus)
        service_port="$DROIDSWARM_FEDERATION_BUS_PORT"
        ;;
      federation-adb)
        service_port="$DROIDSWARM_FEDERATION_ADB_PORT"
        ;;
    esac
    if ! service_runtime_is_healthy "$service_name" "$service_port"; then
      if [[ "$shutdown_requested" != "1" ]]; then
        mark_service_status "$service_name" "retrying"
        case "$service_name" in
          llama.cpp)
            maybe_restart_service "$service_name" "$DROIDSWARM_LLAMA_PORT" run_llama_server
            ;;
          federation-bus)
            maybe_restart_service "$service_name" "$DROIDSWARM_FEDERATION_BUS_PORT" run_federation_bus
            ;;
          federation-adb)
            maybe_restart_service "$service_name" "$DROIDSWARM_FEDERATION_ADB_PORT" run_federation_adb
            ;;
        esac
      fi
    fi
  done

  write_service_health_snapshot
  write_federation_status_snapshot

  sleep 5
done
