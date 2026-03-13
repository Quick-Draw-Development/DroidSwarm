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
  --repo-url URL       Clone or update DroidSwarm from this git repository
  --ref REF            Checkout this ref after cloning/updating
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
if [[ -d "$INSTALL_ROOT/source/.git" ]]; then
  git -C "$INSTALL_ROOT/source" fetch --all --tags
else
  rm -rf "$INSTALL_ROOT/source"
  git clone "$REPO_URL" "$INSTALL_ROOT/source"
fi

if [[ -n "$REF" ]]; then
  git -C "$INSTALL_ROOT/source" checkout "$REF"
fi

SOCKET_RUNTIME_SOURCE="$WORKSPACE_SOURCE_ROOT/dist/apps/socket-server"
ORCHESTRATOR_RUNTIME_SOURCE="$WORKSPACE_SOURCE_ROOT/dist/apps/orchestrator"
DASHBOARD_RUNTIME_SOURCE="$WORKSPACE_SOURCE_ROOT/apps/dashboard/.next/standalone"
DASHBOARD_STATIC_SOURCE="$WORKSPACE_SOURCE_ROOT/apps/dashboard/.next/static"
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
rm -rf "$INSTALL_ROOT/runtime/socket-server" "$INSTALL_ROOT/runtime/orchestrator" "$INSTALL_ROOT/runtime/dashboard"
mkdir -p "$INSTALL_ROOT/runtime/socket-server" "$INSTALL_ROOT/runtime/orchestrator" "$INSTALL_ROOT/runtime/dashboard/.next"
cp -R "$SOCKET_RUNTIME_SOURCE/." "$INSTALL_ROOT/runtime/socket-server/"
cp -R "$ORCHESTRATOR_RUNTIME_SOURCE/." "$INSTALL_ROOT/runtime/orchestrator/"
cp -R "$DASHBOARD_RUNTIME_SOURCE/." "$INSTALL_ROOT/runtime/dashboard/"
if [[ -d "$DASHBOARD_STATIC_SOURCE" ]]; then
  cp -R "$DASHBOARD_STATIC_SOURCE" "$INSTALL_ROOT/runtime/dashboard/.next/"
fi
if [[ -d "$DASHBOARD_PUBLIC_SOURCE" ]]; then
  cp -R "$DASHBOARD_PUBLIC_SOURCE" "$INSTALL_ROOT/runtime/dashboard/public"
fi

chmod +x "$INSTALL_ROOT/bin/DroidSwarm" "$INSTALL_ROOT/libexec/droidswarm-daemon.sh"
ln -sf "$INSTALL_ROOT/bin/DroidSwarm" "$BIN_DIR/DroidSwarm"

cat <<EOF
Installed DroidSwarm CLI.

Binary: $BIN_DIR/DroidSwarm
Install root: $INSTALL_ROOT
Source: $SOURCE_DIR

Make sure $BIN_DIR is on your PATH.

Next steps:
  DroidSwarm help
  DroidSwarm setup --project-root "\$PWD" --project-mode <greenfield|existing>
  DroidSwarm swarm --project-root "\$PWD"
EOF
