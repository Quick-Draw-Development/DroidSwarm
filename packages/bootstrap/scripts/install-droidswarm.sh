#!/usr/bin/env bash

set -euo pipefail
export COPYFILE_DISABLE=1

info() {
  printf '%s\n' "$*" >&2
}

warn() {
  printf 'Warning: %s\n' "$*" >&2
}

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

is_interactive() {
  [[ -t 0 && -t 1 && "${DROIDSWARM_NONINTERACTIVE:-0}" != "1" ]]
}

pause_for_manual_step() {
  local title="$1"
  local instructions="$2"
  local verify_cmd="${3:-}"

  if ! is_interactive; then
    err "$title"
    [[ -n "$instructions" ]] && err "$instructions"
    err "Re-run interactively or preconfigure the required dependency first."
    exit 1
  fi

  while true; do
    printf '\nManual setup required: %s\n' "$title"
    [[ -n "$instructions" ]] && printf '%s\n' "$instructions"
    printf 'Press Enter when done, or type "abort" to stop: '
    local response=""
    IFS= read -r response
    if [[ "$response" == "abort" ]]; then
      err "Installation aborted during manual setup."
      exit 1
    fi

    if [[ -z "$verify_cmd" ]] || /bin/bash -lc "$verify_cmd"; then
      return 0
    fi

    warn "Verification failed. Complete the setup step and try again."
  done
}

download_file() {
  local url="$1"
  local destination="$2"

  mkdir -p "$(dirname "$destination")"
  curl -fL --retry 3 --retry-delay 2 --retry-connrefused "$url" -o "$destination"
}

node_major_version() {
  if ! command -v node >/dev/null 2>&1; then
    return 1
  fi

  node -p 'process.versions.node.split(".")[0]'
}

ensure_minimum_node_major() {
  local minimum_major="$1"
  local install_cmd="${2:-}"
  local current_major=""

  current_major="$(node_major_version 2>/dev/null || true)"
  if [[ -n "$current_major" && "$current_major" =~ ^[0-9]+$ && "$current_major" -ge "$minimum_major" ]]; then
    return 0
  fi

  if [[ -n "$install_cmd" ]]; then
    run_install_command "node" "$install_cmd"
    current_major="$(node_major_version 2>/dev/null || true)"
    if [[ -n "$current_major" && "$current_major" =~ ^[0-9]+$ && "$current_major" -ge "$minimum_major" ]]; then
      return 0
    fi
  fi

  pause_for_manual_step \
    "Node.js $minimum_major+ is required" \
    "Install Node.js $minimum_major or newer and ensure both node and npm are on PATH." \
    "command -v node >/dev/null 2>&1 && [[ \"\$(node -p 'process.versions.node.split(\".\")[0]')\" -ge $minimum_major ]] && command -v npm >/dev/null 2>&1"
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

  printf 'Installing %s...\n' "$name" >&2
  /bin/bash -lc "$install_cmd" >&2
}

default_install_command() {
  local component="$1"

  if command -v brew >/dev/null 2>&1; then
    case "$component" in
      node)
        printf 'brew install node@22\n'
        return 0
        ;;
      llama-server)
        printf 'brew install llama.cpp\n'
        return 0
        ;;
      docker)
        printf 'brew install docker colima\n'
        return 0
        ;;
      blink-server)
        printf 'npm install -g blink-server\n'
        return 0
        ;;
      mux)
        printf 'npm install -g mux\n'
        return 0
        ;;
    esac
  fi

  return 1
}

detect_platform_os() {
  case "$(uname -s)" in
    Darwin)
      printf 'darwin\n'
      ;;
    Linux)
      printf 'linux\n'
      ;;
    *)
      err "Unsupported operating system: $(uname -s)"
      exit 1
      ;;
  esac
}

detect_platform_arch() {
  case "$(uname -m)" in
    arm64|aarch64)
      printf 'arm64\n'
      ;;
    x86_64|amd64)
      printf 'amd64\n'
      ;;
    *)
      err "Unsupported CPU architecture: $(uname -m)"
      exit 1
      ;;
  esac
}

github_release_asset_url() {
  local repo="$1"
  local os_name="$2"
  local arch_name="$3"
  local api_url="https://api.github.com/repos/$repo/releases/latest"
  local release_json
  release_json="$(curl -fsSL "$api_url")"

  printf '%s' "$release_json" | TARGET_OS="$os_name" TARGET_ARCH="$arch_name" node -e '
const fs = require("node:fs");
const payload = JSON.parse(fs.readFileSync(0, "utf8"));
const os = process.env.TARGET_OS;
const arch = process.env.TARGET_ARCH;
const archTokens = arch === "amd64" ? ["amd64", "x64", "x86_64"] : ["arm64", "aarch64"];
const assets = Array.isArray(payload.assets) ? payload.assets : [];
const matches = (assetName, requiredExt) => {
  const lower = assetName.toLowerCase();
  const hasOs = lower.includes(os);
  const hasArch = archTokens.some((token) => lower.includes(token));
  const hasExt = requiredExt.some((suffix) => suffix === "" || lower.endsWith(suffix));
  return hasOs && hasArch && hasExt;
};
const preferred = [
  (asset) => matches(asset.name, [".tar.gz", ".tgz", ".zip"]),
  (asset) => matches(asset.name, [".appimage"]),
  (asset) => matches(asset.name, [""]),
];
let selected;
for (const matcher of preferred) {
  selected = assets.find((asset) => matcher(asset));
  if (selected) break;
}
if (!selected || !selected.browser_download_url) process.exit(1);
process.stdout.write(selected.browser_download_url);
'
}

link_installed_binary() {
  local source_path="$1"
  local target_path="$2"

  if [[ ! -x "$source_path" ]]; then
    err "Installed binary is not executable: $source_path"
    exit 1
  fi

  mkdir -p "$(dirname "$target_path")"
  ln -sf "$source_path" "$target_path"
}

install_blink_server_binary() {
  local install_root="$1"
  local target_path="$2"
  local prefix_dir="$install_root/vendor/blink"

  mkdir -p "$prefix_dir"
  npm install -g --prefix "$prefix_dir" blink-server >&2
  link_installed_binary "$prefix_dir/bin/blink-server" "$target_path"
}

install_mux_binary() {
  local install_root="$1"
  local target_path="$2"
  local prefix_dir="$install_root/vendor/mux"

  mkdir -p "$prefix_dir"
  npm install -g --prefix "$prefix_dir" mux >&2
  link_installed_binary "$prefix_dir/bin/mux" "$target_path"
}

start_docker_runtime() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if command -v colima >/dev/null 2>&1; then
    info "Starting Colima for Blink..."
    colima start >/dev/null 2>&1 || true
  fi

  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if [[ "$(uname -s)" == "Darwin" && -d "/Applications/Docker.app" ]] && command -v open >/dev/null 2>&1; then
    info "Starting Docker Desktop for Blink..."
    open -a Docker >/dev/null 2>&1 || true
  fi

  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl start docker >/dev/null 2>&1 || true
  elif command -v service >/dev/null 2>&1; then
    sudo service docker start >/dev/null 2>&1 || true
  fi

  local attempt
  for attempt in 1 2 3 4 5; do
    if docker info >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  return 1
}

ensure_docker_runtime() {
  local install_cmd="${1:-}"

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    return 0
  fi

  if ! command -v docker >/dev/null 2>&1; then
    if [[ -n "$install_cmd" ]]; then
      run_install_command "docker" "$install_cmd"
    fi
  fi

  if command -v docker >/dev/null 2>&1 && start_docker_runtime; then
    return 0
  fi

  pause_for_manual_step \
    "Docker is required for Blink server" \
    "Install Docker and make sure the Docker daemon is running before continuing." \
    "command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1"
}

ensure_blink_runtime() {
  local node_install_cmd docker_install_cmd
  node_install_cmd="$(default_install_command "node" 2>/dev/null || true)"
  docker_install_cmd="$(default_install_command "docker" 2>/dev/null || true)"

  ensure_minimum_node_major 22 "$node_install_cmd"
  ensure_docker_runtime "$docker_install_cmd"
}

install_runtime_dependencies() {
  local runtime_dir="$1"
  local runtime_name="$2"

  if [[ ! -f "$runtime_dir/package.json" ]]; then
    return 0
  fi

  printf 'Installing runtime dependencies for %s...\n' "$runtime_name"
  if ! (
    cd "$runtime_dir"
    npm install --omit=dev
  ); then
    err "Failed to install runtime dependencies for $runtime_name."
    exit 1
  fi
}

write_assignment() {
  local file="$1"
  local key="$2"
  local value="${3:-}"
  printf '%s=%q\n' "$key" "$value" >>"$file"
}

validate_nonempty_single_line() {
  local key="$1"
  local value="${2:-}"

  if [[ -z "$value" ]]; then
    err "Installer resolved an empty value for $key"
    exit 1
  fi

  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    err "Installer resolved an invalid multi-line value for $key"
    exit 1
  fi
}

validate_positive_port() {
  local key="$1"
  local value="${2:-}"

  if [[ ! "$value" =~ ^[0-9]+$ ]] || [[ "$value" -le 0 ]]; then
    err "Installer resolved an invalid port for $key: $value"
    exit 1
  fi
}

validate_service_config() {
  validate_nonempty_single_line "DROIDSWARM_BLINK_SERVER_BIN" "$BLINK_SERVER_BIN"
  validate_nonempty_single_line "DROIDSWARM_MUX_BIN" "$MUX_BIN"
  validate_nonempty_single_line "DROIDSWARM_LLAMA_SERVER_BIN" "$LLAMA_SERVER_BIN"
  validate_nonempty_single_line "DROIDSWARM_LLAMA_MODEL" "$LLAMA_MODEL"
  validate_nonempty_single_line "DROIDSWARM_LLAMA_MODEL_NAME" "$LLAMA_MODEL_NAME"
  validate_nonempty_single_line "DROIDSWARM_LLAMA_MODELS_FILE" "$LLAMA_MODELS_FILE"
  validate_nonempty_single_line "DROIDSWARM_BLINK_SERVER_START_CMD" "$BLINK_SERVER_START_CMD"
  validate_nonempty_single_line "DROIDSWARM_MUX_START_CMD" "$MUX_START_CMD"
  validate_nonempty_single_line "DROIDSWARM_LLAMA_START_CMD" "$LLAMA_START_CMD"
  validate_positive_port "DROIDSWARM_BLINK_SERVER_PORT" "$BLINK_SERVER_PORT"
  validate_positive_port "DROIDSWARM_MUX_PORT" "$MUX_PORT"
  validate_positive_port "DROIDSWARM_LLAMA_PORT" "$LLAMA_PORT"

  if [[ ! -x "$BLINK_SERVER_BIN" ]]; then
    err "Installer resolved a non-executable Blink binary: $BLINK_SERVER_BIN"
    exit 1
  fi

  if [[ ! -x "$MUX_BIN" ]]; then
    err "Installer resolved a non-executable Mux binary: $MUX_BIN"
    exit 1
  fi

  if [[ ! -x "$LLAMA_SERVER_BIN" ]]; then
    err "Installer resolved a non-executable llama.cpp binary: $LLAMA_SERVER_BIN"
    exit 1
  fi

  if [[ ! -f "$LLAMA_MODEL" ]]; then
    err "Installer resolved a missing llama.cpp model file: $LLAMA_MODEL"
    exit 1
  fi

  if [[ ! -f "$LLAMA_MODELS_FILE" ]]; then
    err "Installer resolved a missing llama model inventory file: $LLAMA_MODELS_FILE"
    exit 1
  fi
}

validate_service_config_file() {
  local file="$1"

  if [[ ! -s "$file" ]]; then
    err "Installer wrote an empty service config: $file"
    exit 1
  fi

  if ! /bin/bash -n "$file"; then
    err "Installer wrote invalid shell syntax to service config: $file"
    exit 1
  fi

  if ! env -i /bin/bash -lc "set -a; source '$file'; [[ -n \"\$DROIDSWARM_BLINK_SERVER_BIN\" ]] && [[ -n \"\$DROIDSWARM_MUX_BIN\" ]] && [[ -n \"\$DROIDSWARM_LLAMA_SERVER_BIN\" ]] && [[ -n \"\$DROIDSWARM_LLAMA_MODEL\" ]]" >/dev/null 2>&1; then
    err "Installer wrote an unreadable or incomplete service config: $file"
    exit 1
  fi
}

ensure_command() {
  local binary_name="$1"
  local install_cmd="${2:-}"
  local manual_instructions="${3:-}"

  if command -v "$binary_name" >/dev/null 2>&1; then
    return 0
  fi

  if [[ -n "$install_cmd" ]]; then
    run_install_command "$binary_name" "$install_cmd"
  fi

  if command -v "$binary_name" >/dev/null 2>&1; then
    return 0
  fi

  pause_for_manual_step \
    "Missing required command: $binary_name" \
    "${manual_instructions:-Install $binary_name and ensure it is on PATH.}" \
    "command -v '$binary_name' >/dev/null 2>&1"
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

default_manual_instructions() {
  local component="$1"
  local binary_name="$2"
  local install_cmd_var="$3"
  local bin_var="$4"
  local configured_path="${5:-}"

  cat <<EOF
Install or configure $component, then make the binary discoverable.
- Put the executable on PATH as \`$binary_name\`
- or place it at the already configured path: ${configured_path:-<unset>}
If you want to change $bin_var or $install_cmd_var, stop now and re-run the installer with those values set.
EOF
}

ensure_service_binary() {
  local component="$1"
  local env_value="$2"
  local install_cmd="$3"
  local install_cmd_var="$4"
  local bin_var="$5"
  shift 5

  local binary_path=""
  if binary_path="$(resolve_service_binary "$env_value" "$install_cmd" "$@" 2>/dev/null)"; then
    if [[ "$component" == "blink-server" ]]; then
      ensure_blink_runtime
    fi
    printf '%s\n' "$binary_path"
    return 0
  fi

  if [[ "$component" == "blink-server" && -z "$install_cmd" ]]; then
    ensure_blink_runtime
    install_blink_server_binary "$INSTALL_ROOT" "$INSTALL_BIN_DIR/blink-server"
    if binary_path="$(resolve_service_binary "$INSTALL_BIN_DIR/blink-server" "" "$@" 2>/dev/null)"; then
      printf '%s\n' "$binary_path"
      return 0
    fi
  fi

  if [[ "$component" == "mux" && -z "$install_cmd" ]]; then
    if install_mux_binary "$INSTALL_ROOT" "$INSTALL_BIN_DIR/mux"; then
      if binary_path="$(resolve_service_binary "$INSTALL_BIN_DIR/mux" "" "$@" 2>/dev/null)"; then
        printf '%s\n' "$binary_path"
        return 0
      fi
    fi
  fi

  local default_cmd=""
  if [[ -z "$install_cmd" ]] && default_cmd="$(default_install_command "$component" 2>/dev/null || true)" && [[ -n "$default_cmd" ]]; then
    if binary_path="$(resolve_service_binary "$env_value" "$default_cmd" "$@" 2>/dev/null)"; then
      printf '%s\n' "$binary_path"
      return 0
    fi
  fi

  local primary_candidate="${1:-$component}"
  local instructions
  instructions="$(default_manual_instructions "$component" "$primary_candidate" "$install_cmd_var" "$bin_var" "$env_value")"
  pause_for_manual_step \
    "Missing required dependency: $component" \
    "$instructions" \
    "command -v '$primary_candidate' >/dev/null 2>&1 || [[ -n '$env_value' && -x '$env_value' ]]"

  if binary_path="$(resolve_service_binary "$env_value" "" "$@" 2>/dev/null)"; then
    if [[ "$component" == "blink-server" ]]; then
      ensure_blink_runtime
    fi
    printf '%s\n' "$binary_path"
    return 0
  fi

  err "Unable to resolve $component after manual setup."
  exit 1
}

ensure_llama_model() {
  local model_path="$1"
  local download_cmd="$2"
  local model_url="${3:-}"

  if [[ -n "$model_path" && -f "$model_path" ]]; then
    printf '%s\n' "$model_path"
    return 0
  fi

  if [[ -n "$download_cmd" ]]; then
    info "Provisioning llama.cpp model..."
    /bin/bash -lc "$download_cmd"
  elif [[ -n "$model_url" && -n "$model_path" ]]; then
    info "Downloading llama.cpp model from $model_url"
    download_file "$model_url" "$model_path"
  fi

  if [[ -n "$model_path" && -f "$model_path" ]]; then
    printf '%s\n' "$model_path"
    return 0
  fi

  local instructions
  instructions=$(cat <<EOF
Install a llama.cpp GGUF model and make it available at:
  $model_path
If you want to use DROIDSWARM_LLAMA_MODEL, DROIDSWARM_LLAMA_MODEL_URL, or
DROIDSWARM_LLAMA_MODEL_DOWNLOAD_CMD instead, stop now and re-run the installer
with those values set.
EOF
)
  pause_for_manual_step \
    "Missing llama.cpp model file" \
    "$instructions" \
    "[[ -f '$model_path' ]]"

  if [[ -f "$model_path" ]]; then
    printf '%s\n' "$model_path"
    return 0
  fi

  err "Unable to resolve llama.cpp model file after manual setup."
  exit 1
}

known_llama_models() {
  cat <<'EOF'
qwen2.5-coder-1.5b|Qwen2.5 Coder 1.5B Instruct Q4_K_M|coding,cheap|Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF|qwen2.5-coder-1.5b-instruct-q4_k_m.gguf
qwen2.5-coder-3b|Qwen2.5 Coder 3B Instruct Q4_K_M|coding,balanced,default|Qwen/Qwen2.5-Coder-3B-Instruct-GGUF|qwen2.5-coder-3b-instruct-q4_k_m.gguf
qwen2.5-coder-7b|Qwen2.5 Coder 7B Instruct Q4_K_M|coding,capable|Qwen/Qwen2.5-Coder-7B-Instruct-GGUF|qwen2.5-coder-7b-instruct-q4_k_m.gguf
EOF
}

model_download_url() {
  local repo="$1"
  local filename="$2"
  printf 'https://huggingface.co/%s/resolve/main/%s\n' "$repo" "$filename"
}

select_llama_model_ids() {
  if ! is_interactive; then
    printf 'qwen2.5-coder-3b\n'
    return 0
  fi

  printf '\nSelect local llama.cpp models to install:\n'
  local index=1
  while IFS='|' read -r model_id model_name model_tags _repo _file; do
    [[ -n "$model_id" ]] || continue
    printf '  %s. %s [%s]\n' "$index" "$model_name" "$model_tags"
    index=$((index + 1))
  done <<EOF
$(known_llama_models)
EOF
  printf 'Enter one or more numbers separated by commas (default: 2): '
  local response=""
  IFS= read -r response
  response="${response:-2}"

  local normalized=""
  IFS=',' read -r -a selected_indexes <<<"$response"
  for raw_index in "${selected_indexes[@]}"; do
    local trimmed
    trimmed="$(printf '%s' "$raw_index" | tr -d '[:space:]')"
    case "$trimmed" in
      1)
        normalized="${normalized}${normalized:+,}qwen2.5-coder-1.5b"
        ;;
      2)
        normalized="${normalized}${normalized:+,}qwen2.5-coder-3b"
        ;;
      3)
        normalized="${normalized}${normalized:+,}qwen2.5-coder-7b"
        ;;
    esac
  done

  if [[ -z "$normalized" ]]; then
    normalized="qwen2.5-coder-3b"
  fi

  printf '%s\n' "$normalized"
}

write_llama_inventory() {
  local inventory_file="$1"
  local selected_id="$2"
  shift 2

  mkdir -p "$(dirname "$inventory_file")"
  {
    printf '{\n'
    printf '  "selected_model_id": "%s",\n' "$selected_id"
    printf '  "updated_at": "%s",\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    printf '  "models": [\n'
    local first="1"
    local entry
    for entry in "$@"; do
      IFS='|' read -r model_id model_name model_tags model_path model_url <<<"$entry"
      [[ "$first" == "1" ]] || printf ',\n'
      first="0"
      printf '    {\n'
      printf '      "id": "%s",\n' "$model_id"
      printf '      "name": "%s",\n' "$model_name"
      printf '      "tags": "%s",\n' "$model_tags"
      printf '      "path": "%s",\n' "$model_path"
      printf '      "url": "%s"\n' "$model_url"
      printf '    }'
    done
    printf '\n  ]\n'
    printf '}\n'
  } >"$inventory_file"
}

load_existing_llama_model() {
  local inventory_file="$1"
  if [[ ! -f "$inventory_file" ]]; then
    return 1
  fi

  INVENTORY_FILE="$inventory_file" node -e '
const fs = require("node:fs");
const inventoryFile = process.env.INVENTORY_FILE;
const payload = JSON.parse(fs.readFileSync(inventoryFile, "utf8"));
const selectedId = payload.selected_model_id;
const models = Array.isArray(payload.models) ? payload.models : [];
const selected = models.find((model) => model.id === selectedId && typeof model.path === "string" && fs.existsSync(model.path));
if (!selected) process.exit(1);
process.stdout.write(`${selected.id}|${selected.path}`);
'
}

install_selected_llama_models() {
  local models_dir="$1"
  local inventory_file="$2"
  local selected_ids_csv="$3"
  local first_selected_id=""
  local selected_entries=()

  IFS=',' read -r -a selected_ids <<<"$selected_ids_csv"
  local wanted_id
  for wanted_id in "${selected_ids[@]}"; do
    while IFS='|' read -r model_id model_name model_tags model_repo model_file; do
      [[ "$model_id" == "$wanted_id" ]] || continue
      local model_url model_path
      model_url="$(model_download_url "$model_repo" "$model_file")"
      model_path="$models_dir/$model_file"
      if [[ ! -f "$model_path" ]]; then
        info "Downloading $model_name"
        download_file "$model_url" "$model_path"
      fi
      selected_entries+=("$model_id|$model_name|$model_tags|$model_path|$model_url")
      [[ -n "$first_selected_id" ]] || first_selected_id="$model_id"
    done <<EOF
$(known_llama_models)
EOF
  done

  if [[ "${#selected_entries[@]}" -eq 0 ]]; then
    err "No llama.cpp models were selected for installation."
    exit 1
  fi

  write_llama_inventory "$inventory_file" "$first_selected_id" "${selected_entries[@]}"
  printf '%s|%s\n' "$first_selected_id" "${selected_entries[0]}"
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
LLAMA_MODEL_URL="${DROIDSWARM_LLAMA_MODEL_URL:-}"
LLAMA_MODELS_FILE="${DROIDSWARM_LLAMA_MODELS_FILE:-$MODELS_DIR/inventory.json}"

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

ensure_command "curl" "" "Install curl so DroidSwarm can download runtime artifacts."
ensure_command "tar" "" "Install tar so DroidSwarm can unpack runtime artifacts."
ensure_command "unzip" "" "Install unzip so DroidSwarm can unpack release archives when needed."
ensure_command "node" "" "Install Node.js 20+ so DroidSwarm runtime components can execute."
ensure_command "npm" "" "Install npm so DroidSwarm can provision runtime dependencies."

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
download_file "$ARCHIVE_URL" "$TMP_ARCHIVE"
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
cp "$SOURCE_DIR/scripts/repair-droidswarm.sh" "$INSTALL_ROOT/bin/repair-droidswarm"
cp "$SOURCE_DIR/scripts/repair-droidswarm.sh" "$INSTALL_ROOT/scripts/repair-droidswarm.sh"
rm -rf "$INSTALL_ROOT/specs"
mkdir -p "$INSTALL_ROOT/specs"
cp -R "$SOURCE_DIR/specs/." "$INSTALL_ROOT/specs/"
if [[ -f "$WORKSPACE_SOURCE_ROOT/VERSION" ]]; then
  cp "$WORKSPACE_SOURCE_ROOT/VERSION" "$INSTALL_ROOT/VERSION"
fi
rm -rf "$INSTALL_ROOT/runtime/socket-server" "$INSTALL_ROOT/runtime/orchestrator" "$INSTALL_ROOT/runtime/dashboard" "$INSTALL_ROOT/runtime/blink-bridge" "$INSTALL_ROOT/runtime/worker-host"
mkdir -p "$INSTALL_ROOT/runtime/socket-server" "$INSTALL_ROOT/runtime/orchestrator" "$INSTALL_ROOT/runtime/dashboard/.next"
cp -R "$SOCKET_RUNTIME_SOURCE/." "$INSTALL_ROOT/runtime/socket-server/"
install_runtime_dependencies "$INSTALL_ROOT/runtime/socket-server" "socket-server"
cp -R "$ORCHESTRATOR_RUNTIME_SOURCE/." "$INSTALL_ROOT/runtime/orchestrator/"
install_runtime_dependencies "$INSTALL_ROOT/runtime/orchestrator" "orchestrator"
if [[ -d "$BLINK_BRIDGE_RUNTIME_SOURCE" ]]; then
  mkdir -p "$INSTALL_ROOT/runtime/blink-bridge"
  cp -R "$BLINK_BRIDGE_RUNTIME_SOURCE/." "$INSTALL_ROOT/runtime/blink-bridge/"
  install_runtime_dependencies "$INSTALL_ROOT/runtime/blink-bridge" "blink-bridge"
fi
if [[ -d "$WORKER_HOST_RUNTIME_SOURCE" ]]; then
  mkdir -p "$INSTALL_ROOT/runtime/worker-host"
  cp -R "$WORKER_HOST_RUNTIME_SOURCE/." "$INSTALL_ROOT/runtime/worker-host/"
  install_runtime_dependencies "$INSTALL_ROOT/runtime/worker-host" "worker-host"
fi
cp -R "$DASHBOARD_RUNTIME_SOURCE/." "$INSTALL_ROOT/runtime/dashboard/"
install_runtime_dependencies "$INSTALL_ROOT/runtime/dashboard" "dashboard"
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

chmod +x \
  "$INSTALL_ROOT/bin/DroidSwarm" \
  "$INSTALL_ROOT/libexec/droidswarm-daemon.sh" \
  "$INSTALL_ROOT/bin/update-droidswarm" \
  "$INSTALL_ROOT/bin/repair-droidswarm" \
  "$INSTALL_ROOT/scripts/update-droidswarm.sh" \
  "$INSTALL_ROOT/scripts/repair-droidswarm.sh"
ln -sf "$INSTALL_ROOT/bin/DroidSwarm" "$BIN_DIR/DroidSwarm"

BLINK_SERVER_BIN="${DROIDSWARM_BLINK_SERVER_BIN:-$INSTALL_BIN_DIR/blink-server}"
MUX_BIN="${DROIDSWARM_MUX_BIN:-$INSTALL_BIN_DIR/mux}"
LLAMA_SERVER_BIN="${DROIDSWARM_LLAMA_SERVER_BIN:-$INSTALL_BIN_DIR/llama-server}"
LLAMA_MODEL="${DROIDSWARM_LLAMA_MODEL:-$MODELS_DIR/default.gguf}"
LLAMA_MODEL_NAME="${DROIDSWARM_LLAMA_MODEL_NAME:-}"
BLINK_SERVER_INSTALL_CMD="${DROIDSWARM_BLINK_SERVER_INSTALL_CMD:-}"
MUX_INSTALL_CMD="${DROIDSWARM_MUX_INSTALL_CMD:-}"
LLAMA_INSTALL_CMD="${DROIDSWARM_LLAMA_INSTALL_CMD:-}"
LLAMA_MODEL_DOWNLOAD_CMD="${DROIDSWARM_LLAMA_MODEL_DOWNLOAD_CMD:-}"
BLINK_SERVER_PORT="${DROIDSWARM_BLINK_SERVER_PORT:-8950}"
MUX_PORT="${DROIDSWARM_MUX_PORT:-8960}"
LLAMA_PORT="${DROIDSWARM_LLAMA_PORT:-11434}"

if [[ -z "$LLAMA_INSTALL_CMD" && -z "$LLAMA_SERVER_BIN" ]] && command -v brew >/dev/null 2>&1; then
  LLAMA_INSTALL_CMD="brew install llama.cpp"
fi

BLINK_SERVER_BIN="$(ensure_service_binary "blink-server" "$BLINK_SERVER_BIN" "$BLINK_SERVER_INSTALL_CMD" "DROIDSWARM_BLINK_SERVER_INSTALL_CMD" "DROIDSWARM_BLINK_SERVER_BIN" blink-server blink)"
MUX_BIN="$(ensure_service_binary "mux" "$MUX_BIN" "$MUX_INSTALL_CMD" "DROIDSWARM_MUX_INSTALL_CMD" "DROIDSWARM_MUX_BIN" mux)"
LLAMA_SERVER_BIN="$(ensure_service_binary "llama-server" "$LLAMA_SERVER_BIN" "$LLAMA_INSTALL_CMD" "DROIDSWARM_LLAMA_INSTALL_CMD" "DROIDSWARM_LLAMA_SERVER_BIN" llama-server)"

if [[ -z "$LLAMA_MODEL_URL" && -z "$LLAMA_MODEL_DOWNLOAD_CMD" && ! -f "$LLAMA_MODEL" ]] && existing_llama_model="$(load_existing_llama_model "$LLAMA_MODELS_FILE" 2>/dev/null || true)" && [[ -n "$existing_llama_model" ]]; then
  IFS='|' read -r LLAMA_MODEL_NAME LLAMA_MODEL <<<"$existing_llama_model"
elif [[ -z "$LLAMA_MODEL_URL" && -z "$LLAMA_MODEL_DOWNLOAD_CMD" && ! -f "$LLAMA_MODEL" ]]; then
  selected_model_payload="$(install_selected_llama_models "$MODELS_DIR" "$LLAMA_MODELS_FILE" "$(select_llama_model_ids)")"
  IFS='|' read -r LLAMA_MODEL_NAME _model_id _model_name _model_tags LLAMA_MODEL _model_url <<<"$selected_model_payload"
else
  LLAMA_MODEL="$(ensure_llama_model "$LLAMA_MODEL" "$LLAMA_MODEL_DOWNLOAD_CMD" "$LLAMA_MODEL_URL")"
  if [[ -z "$LLAMA_MODEL_NAME" ]]; then
    LLAMA_MODEL_NAME="$(basename "$LLAMA_MODEL" .gguf)"
  fi
  write_llama_inventory "$LLAMA_MODELS_FILE" "$LLAMA_MODEL_NAME" "$LLAMA_MODEL_NAME|$LLAMA_MODEL_NAME|custom|$LLAMA_MODEL|${LLAMA_MODEL_URL:-custom}"
fi

if [[ "$LLAMA_MODEL" != "$MODELS_DIR/default.gguf" ]]; then
  ln -sf "$LLAMA_MODEL" "$MODELS_DIR/default.gguf"
fi

BLINK_SERVER_START_CMD="${DROIDSWARM_BLINK_SERVER_START_CMD:-$BLINK_SERVER_BIN --host 127.0.0.1 --port $BLINK_SERVER_PORT}"
MUX_START_CMD="${DROIDSWARM_MUX_START_CMD:-$MUX_BIN server --port $MUX_PORT}"
LLAMA_START_CMD="${DROIDSWARM_LLAMA_START_CMD:-$LLAMA_SERVER_BIN --host 127.0.0.1 --port $LLAMA_PORT -m $LLAMA_MODEL}"

validate_service_config

: >"$SERVICE_CONFIG_FILE"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_BLINK_SERVER_BIN" "$BLINK_SERVER_BIN"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_MUX_BIN" "$MUX_BIN"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_LLAMA_SERVER_BIN" "$LLAMA_SERVER_BIN"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_LLAMA_MODEL" "$LLAMA_MODEL"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_LLAMA_MODEL_NAME" "$LLAMA_MODEL_NAME"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_LLAMA_MODELS_FILE" "$LLAMA_MODELS_FILE"
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
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_BLINK_API_BASE_URL" "http://127.0.0.1:$BLINK_SERVER_PORT"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_MUX_BASE_URL" "http://127.0.0.1:$MUX_PORT"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_LLAMA_BASE_URL" "http://127.0.0.1:$LLAMA_PORT"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_BLINK_SERVER_START_CMD" "$BLINK_SERVER_START_CMD"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_MUX_START_CMD" "$MUX_START_CMD"
write_assignment "$SERVICE_CONFIG_FILE" "DROIDSWARM_LLAMA_START_CMD" "$LLAMA_START_CMD"

validate_service_config_file "$SERVICE_CONFIG_FILE"

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
