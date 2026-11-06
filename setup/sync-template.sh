#!/usr/bin/env bash
# Launcher for setup/sync-template.mjs (Node, runs on macOS, Windows and Linux). All options pass straight through.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v node >/dev/null 2>&1 || { echo "Node.js 18 or newer is needed. Install it from https://nodejs.org and run this again."; exit 1; }
exec node "$DIR/sync-template.mjs" "$@"
