#!/usr/bin/env bash

set -euo pipefail

DROIDSWARM_HOME="${DROIDSWARM_HOME:-$HOME/.droidswarm}"
DROIDSWARM_SWARMS_DIR="${DROIDSWARM_SWARMS_DIR:-$DROIDSWARM_HOME/swarms}"
DROIDSWARM_RUN_DIR="${DROIDSWARM_RUN_DIR:-$DROIDSWARM_HOME/run}"
DROIDSWARM_LOG_DIR="${DROIDSWARM_LOG_DIR:-$DROIDSWARM_HOME/logs}"
DROIDSWARM_INSTALL_DIR="${DROIDSWARM_INSTALL_DIR:-$DROIDSWARM_HOME/install}"
DROIDSWARM_SERVICE_CONFIG="${DROIDSWARM_SERVICE_CONFIG:-$DROIDSWARM_HOME/services.env}"
DROIDSWARM_RUNTIME_DIR="${DROIDSWARM_RUNTIME_DIR:-$DROIDSWARM_INSTALL_DIR/runtime}"
DROIDSWARM_BIN_INSTALL_DIR="${DROIDSWARM_BIN_INSTALL_DIR:-$DROIDSWARM_INSTALL_DIR/bin}"
DROIDSWARM_MODELS_DIR="${DROIDSWARM_MODELS_DIR:-$DROIDSWARM_HOME/models}"
DROIDSWARM_DEFAULT_BLINK_SERVER_BIN="${DROIDSWARM_DEFAULT_BLINK_SERVER_BIN:-$DROIDSWARM_BIN_INSTALL_DIR/blink-server}"
DROIDSWARM_DEFAULT_MUX_BIN="${DROIDSWARM_DEFAULT_MUX_BIN:-$DROIDSWARM_BIN_INSTALL_DIR/mux}"
DROIDSWARM_DEFAULT_LLAMA_SERVER_BIN="${DROIDSWARM_DEFAULT_LLAMA_SERVER_BIN:-$DROIDSWARM_BIN_INSTALL_DIR/llama-server}"
DROIDSWARM_DEFAULT_LLAMA_MODEL="${DROIDSWARM_DEFAULT_LLAMA_MODEL:-$DROIDSWARM_MODELS_DIR/default.gguf}"
DROIDSWARM_DEFAULT_BLINK_BRIDGE_ENTRY="${DROIDSWARM_DEFAULT_BLINK_BRIDGE_ENTRY:-$DROIDSWARM_RUNTIME_DIR/blink-bridge/main.js}"
DROIDSWARM_DEFAULT_WORKER_HOST_ENTRY="${DROIDSWARM_DEFAULT_WORKER_HOST_ENTRY:-$DROIDSWARM_RUNTIME_DIR/worker-host/main.js}"

now_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

ensure_runtime_dirs() {
  mkdir -p \
    "$DROIDSWARM_HOME" \
    "$DROIDSWARM_SWARMS_DIR" \
    "$DROIDSWARM_RUN_DIR" \
    "$DROIDSWARM_LOG_DIR" \
    "$DROIDSWARM_INSTALL_DIR" \
    "$DROIDSWARM_RUNTIME_DIR" \
    "$DROIDSWARM_BIN_INSTALL_DIR" \
    "$DROIDSWARM_MODELS_DIR"
}

err() {
  printf 'Error: %s\n' "$*" >&2
}

info() {
  printf '%s\n' "$*"
}

slugify() {
  local value="${1:-}"
  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  value="$(printf '%s' "$value" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g')"
  if [[ -z "$value" ]]; then
    value="droidswarm-project"
  fi
  printf '%s\n' "$value"
}

uuid() {
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen | tr '[:upper:]' '[:lower:]'
    return
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
    return
  fi

  printf '%s\n' "$(date +%s)-$$-$RANDOM"
}

json_escape() {
  local value="${1:-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

project_meta_dir() {
  printf '%s/.droidswarm\n' "$1"
}

project_meta_file() {
  printf '%s/project.json\n' "$(project_meta_dir "$1")"
}

project_setup_file() {
  printf '%s/setup.env\n' "$(project_meta_dir "$1")"
}

project_db_file() {
  printf '%s/droidswarm.db\n' "$(project_meta_dir "$1")"
}

project_is_setup() {
  local project_root="$1"
  [[ -f "$(project_meta_file "$project_root")" && -f "$(project_setup_file "$project_root")" ]]
}

read_package_name() {
  local project_root="$1"
  local package_file="$project_root/package.json"
  if [[ ! -f "$package_file" ]]; then
    return 1
  fi

  sed -nE 's/.*"name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$package_file" | head -n 1
}

git_repo_name() {
  local project_root="$1"
  if [[ ! -d "$project_root/.git" ]]; then
    return 1
  fi

  local remote
  remote="$(git -C "$project_root" config --get remote.origin.url 2>/dev/null || true)"
  if [[ -n "$remote" ]]; then
    basename "$remote" .git
    return 0
  fi

  basename "$project_root"
}

detect_main_branch() {
  local project_root="$1"
  if [[ -d "$project_root/.git" ]]; then
    if git -C "$project_root" show-ref --verify --quiet refs/heads/main || \
       git -C "$project_root" show-ref --verify --quiet refs/remotes/origin/main; then
      printf 'main\n'
      return 0
    fi
    if git -C "$project_root" show-ref --verify --quiet refs/heads/master || \
       git -C "$project_root" show-ref --verify --quiet refs/remotes/origin/master; then
      printf 'master\n'
      return 0
    fi
  fi

  printf 'main\n'
}

ensure_gitignore_entry() {
  local project_root="$1"
  local gitignore_file="$project_root/.gitignore"
  local entry="$2"

  touch "$gitignore_file"
  if ! grep -Fxq "$entry" "$gitignore_file"; then
    printf '%s\n' "$entry" >>"$gitignore_file"
  fi
}

swarm_dir() {
  printf '%s/%s\n' "$DROIDSWARM_SWARMS_DIR" "$1"
}

swarm_env_file() {
  printf '%s/swarm.env\n' "$(swarm_dir "$1")"
}

swarm_pid_file() {
  printf '%s/pid\n' "$(swarm_dir "$1")"
}

swarm_status_file() {
  printf '%s/status\n' "$(swarm_dir "$1")"
}

swarm_log_file() {
  printf '%s/%s.log\n' "$DROIDSWARM_LOG_DIR" "$1"
}

component_pid_file() {
  printf '%s/%s.pid\n' "$2" "$1"
}

component_status_file() {
  printf '%s/%s.status\n' "$2" "$1"
}

component_log_file() {
  printf '%s/%s.%s.log\n' "$DROIDSWARM_LOG_DIR" "$1" "$2"
}

service_pid_file() {
  printf '%s/%s.pid\n' "$2" "$1"
}

service_status_file() {
  printf '%s/%s.status\n' "$2" "$1"
}

swarm_exists() {
  [[ -d "$(swarm_dir "$1")" ]]
}

is_pid_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

load_swarm_env() {
  local swarm_id="$1"
  local env_file
  env_file="$(swarm_env_file "$swarm_id")"

  if [[ ! -f "$env_file" ]]; then
    return 1
  fi

  # shellcheck disable=SC1090
  source "$env_file"
}

active_swarm_ids() {
  if [[ ! -d "$DROIDSWARM_SWARMS_DIR" ]]; then
    return 0
  fi

  local dir
  for dir in "$DROIDSWARM_SWARMS_DIR"/*; do
    [[ -d "$dir" ]] || continue
    printf '%s\n' "$(basename "$dir")"
  done
}

port_is_free() {
  local port="$1"
  if [[ -z "$port" ]]; then
    return 1
  fi

  if command -v node >/dev/null 2>&1; then
    node - "$port" <<'NODE' >/dev/null 2>&1
const net = require('net');
const port = Number(process.argv[2]);
const host = '127.0.0.1';
const server = net.createServer();
server.unref();
server.once('error', () => process.exit(1));
server.once('listening', () => {
  server.close(() => process.exit(0));
});
server.listen(port, host);
NODE
    return $?
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$port" <<'PY' >/dev/null 2>&1
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    sock.bind(('127.0.0.1', port))
except OSError:
    sys.exit(1)
finally:
    sock.close()
PY
    return $?
  fi

  return 0
}

port_is_listening() {
  local port="$1"
  if [[ -z "$port" ]]; then
    return 1
  fi

  if command -v node >/dev/null 2>&1; then
    node - "$port" <<'NODE' >/dev/null 2>&1
const net = require('net');
const port = Number(process.argv[2]);
const hosts = ['127.0.0.1', '::1', 'localhost'];
let index = 0;
const tryHost = () => {
  if (index >= hosts.length) {
    process.exit(1);
  }
  const socket = net.createConnection({ host: hosts[index], port });
  index += 1;
  socket.setTimeout(1000);
  socket.once('connect', () => {
    socket.destroy();
    process.exit(0);
  });
  socket.once('timeout', () => {
    socket.destroy();
    tryHost();
  });
  socket.once('error', () => {
    socket.destroy();
    tryHost();
  });
};
tryHost();
NODE
    return $?
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$port" <<'PY' >/dev/null 2>&1
import socket
import sys

port = int(sys.argv[1])
hosts = ["127.0.0.1", "::1", "localhost"]
for host in hosts:
    try:
        family = socket.AF_INET6 if ":" in host else socket.AF_INET
        sock = socket.socket(family, socket.SOCK_STREAM)
        sock.settimeout(1)
        sock.connect((host, port))
        sock.close()
        sys.exit(0)
    except OSError:
        try:
            sock.close()
        except Exception:
            pass
sys.exit(1)
PY
    return $?
  fi

  return 1
}

wait_for_port() {
  local port="$1"
  local retries="${2:-20}"
  local delay="${3:-1}"
  local attempt=0

  while [[ "$attempt" -lt "$retries" ]]; do
    if port_is_listening "$port"; then
      return 0
    fi
    sleep "$delay"
    attempt=$((attempt + 1))
  done

  return 1
}

next_available_port() {
  local base="$1"
  local candidate="$base"
  local used_ports=""
  local swarm_id pid_file pid

  for swarm_id in $(active_swarm_ids); do
    pid_file="$(swarm_pid_file "$swarm_id")"
    pid=""

    if [[ -f "$pid_file" ]]; then
      pid="$(<"$pid_file")"
    fi

    if [[ -n "$pid" ]] && is_pid_running "$pid" && load_swarm_env "$swarm_id"; then
      used_ports="${used_ports} ${DROIDSWARM_DASHBOARD_PORT:-} ${DROIDSWARM_WS_PORT:-}"
    fi
  done

  while true; do
    if [[ " $used_ports " == *" $candidate "* ]]; then
      candidate=$((candidate + 1))
      continue
    fi

    if ! port_is_free "$candidate"; then
      candidate=$((candidate + 1))
      continue
    fi

    break
  done

  printf '%s\n' "$candidate"
}

write_env_assignment_file() {
  local file="$1"
  shift

  : >"$file"
  if [[ $# -eq 0 ]]; then
    return 0
  fi

  local pair key value
  for pair in "$@"; do
    [[ -n "$pair" ]] || continue
    key="${pair%%=*}"
    value="${pair#*=}"
    [[ -n "$key" ]] || continue
    printf '%s=%q\n' "$key" "$value" >>"$file"
  done
}

format_duration() {
  local start_epoch="$1"
  if [[ -z "$start_epoch" || "$start_epoch" == "0" ]]; then
    printf -- "-\n"
    return
  fi

  local now_epoch elapsed h m s
  now_epoch="$(date +%s)"
  elapsed=$((now_epoch - start_epoch))
  h=$((elapsed / 3600))
  m=$(((elapsed % 3600) / 60))
  s=$((elapsed % 60))
  printf '%02dh%02dm%02ds\n' "$h" "$m" "$s"
}

require_value() {
  local flag="$1"
  local value="${2:-}"
  if [[ -z "$value" ]]; then
    err "Missing value for $flag"
    exit 1
  fi
}

file_exists_or_empty() {
  local path="${1:-}"
  [[ -n "$path" && -f "$path" ]]
}
