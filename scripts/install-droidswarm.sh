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

print_help() {
  cat <<'EOF'
Usage:
  install-droidswarm.sh [options]

Options:
  --repo-url URL       Download DroidSwarm from this GitHub repository
  --ref REF            Download this Git ref instead of the default branch
  --install-root DIR   Install files under this directory
  --bin-dir DIR        Place the DroidSwarm symlink in this directory
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
      err "Unknown installer option: $1"
      print_help
      exit 1
      ;;
  esac
  shift
done

mkdir -p "$INSTALL_ROOT" "$BIN_DIR"

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
DIST_DIR="$WORKSPACE_SOURCE_ROOT/dist/apps/dashboard/.next"
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
rm -rf "$INSTALL_ROOT/runtime/socket-server" "$INSTALL_ROOT/runtime/orchestrator" "$INSTALL_ROOT/runtime/dashboard"
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
if [[ -d "$WORKSPACE_SOURCE_ROOT/dist/packages/protocol" ]]; then
  mkdir -p "$INSTALL_ROOT/runtime/packages/protocol"
  cp -R "$WORKSPACE_SOURCE_ROOT/dist/packages/protocol/." "$INSTALL_ROOT/runtime/packages/protocol/"
fi
if [[ -d "$WORKSPACE_SOURCE_ROOT/dist/packages/protocol-alias" ]]; then
  mkdir -p "$INSTALL_ROOT/runtime/packages/protocol-alias"
  cp -R "$WORKSPACE_SOURCE_ROOT/dist/packages/protocol-alias/." "$INSTALL_ROOT/runtime/packages/protocol-alias/"
fi
cp -R "$DASHBOARD_RUNTIME_SOURCE/." "$INSTALL_ROOT/runtime/dashboard/"
if [[ -d "$DASHBOARD_STATIC_SOURCE" ]]; then
  cp -R "$DASHBOARD_STATIC_SOURCE" "$INSTALL_ROOT/runtime/dashboard/.next/"
fi
if [[ -d "$DASHBOARD_PUBLIC_SOURCE" ]]; then
  cp -R "$DASHBOARD_PUBLIC_SOURCE" "$INSTALL_ROOT/runtime/dashboard/public"
fi

DASHBOARD_STANDALONE_PKG="$INSTALL_ROOT/runtime/dashboard/apps/dashboard/package.json"
# shellcheck disable=SC1090
if [[ -f "$DASHBOARD_STANDALONE_PKG" ]]; then
  node "$SOURCE_DIR/scripts/patch-dashboard-package.js" "$DASHBOARD_STANDALONE_PKG"
fi

chmod +x "$INSTALL_ROOT/bin/DroidSwarm" "$INSTALL_ROOT/libexec/droidswarm-daemon.sh" "$INSTALL_ROOT/bin/update-droidswarm" "$INSTALL_ROOT/scripts/update-droidswarm.sh"
ln -sf "$INSTALL_ROOT/bin/DroidSwarm" "$BIN_DIR/DroidSwarm"

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

$PATH_UPDATE_MESSAGE

Next steps:
  DroidSwarm help
  DroidSwarm setup --project-root "\$PWD" --project-mode <greenfield|existing>
  DroidSwarm swarm --project-root "\$PWD"
EOF
