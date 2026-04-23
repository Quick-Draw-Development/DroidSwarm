#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BOOTSTRAP_INSTALLER="$ROOT_DIR/packages/bootstrap/scripts/install-droidswarm.sh"

if [[ ! -x "$BOOTSTRAP_INSTALLER" ]]; then
  printf 'Error: Bootstrap installer not found: %s\n' "$BOOTSTRAP_INSTALLER" >&2
  exit 1
fi

exec /bin/bash "$BOOTSTRAP_INSTALLER" "$@"
