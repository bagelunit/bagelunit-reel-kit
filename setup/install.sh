#!/usr/bin/env bash
# Susanoo Reel Kit installer: launcher for macOS and Linux.
# The real installer is setup/install.mjs (Node), which also runs on Windows (use install.ps1 there).
# All options pass straight through: bash setup/install.sh --help
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18 or newer is needed first."
  if command -v brew >/dev/null 2>&1; then echo "Install it with:  brew install node"
  elif command -v apt-get >/dev/null 2>&1; then echo "Install it with:  sudo apt-get install -y nodejs npm   (or use https://nodejs.org for the current LTS)"
  else echo "Install the current LTS from https://nodejs.org"; fi
  echo "Then open a new terminal and run this again."
  exit 1
fi
exec node "$DIR/install.mjs" "$@"
