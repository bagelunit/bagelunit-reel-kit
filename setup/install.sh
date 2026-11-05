#!/usr/bin/env bash
# Susanoo Reel Kit installer (macOS + Homebrew).
#
# Safe to run again: every step checks what is already there and skips it.
# It never asks for, reads or stores an API key. Your ElevenLabs key is yours to put in
# ~/.config/susanoo-reels/elevenlabs.key yourself (see SETUP.md).
#
# Usage:
#   bash setup/install.sh [--link] [--skip-brew] [--skip-plugins] [--skip-sound] [--earshot-mcp] [--rebuild-sounds]
#
#   --link            symlink studio/ into ~/.claude/skills/susanoo-reels instead of copying it
#                     (good if you will edit the kit or pull updates with git)
#   --skip-brew       do not install Homebrew packages
#   --skip-plugins    do not add the Claude Code plugins (hyperframes, instagram-agent)
#   --skip-sound      do not set up opus-sound-layer and earshot (the real-sound step will not work)
#   --earshot-mcp     also register earshot as a user-level MCP server in Claude Code
#   --rebuild-sounds  rebuild the opus-sound-layer library even if it already exists

set -euo pipefail

LINK=0; SKIP_BREW=0; SKIP_PLUGINS=0; SKIP_SOUND=0; EARSHOT_MCP=0; REBUILD_SOUNDS=0
for arg in "$@"; do
  case "$arg" in
    --link) LINK=1 ;;
    --skip-brew) SKIP_BREW=1 ;;
    --skip-plugins) SKIP_PLUGINS=1 ;;
    --skip-sound) SKIP_SOUND=1 ;;
    --earshot-mcp) EARSHOT_MCP=1 ;;
    --rebuild-sounds) REBUILD_SOUNDS=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 2 ;;
  esac
done

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STUDIO="$REPO/studio"
SKILLS="$HOME/.claude/skills"
TARGET="$SKILLS/susanoo-reels"
CONFIG="$HOME/.config/susanoo-reels"
SOUND="$HOME/dev/sound"
OPUS="$SOUND/opus-sound-layer"
EARSHOT="$SOUND/earshot"
MARKER=".susanoo-reel-kit"

STEP=0
step() { STEP=$((STEP + 1)); printf '\n==> Step %d: %s\n' "$STEP" "$*"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '    OK: %s\n' "$*"; }
warn() { printf '    NOTE: %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

[ -f "$STUDIO/KIT.md" ] || { echo "Cannot find studio/KIT.md next to this script. Run it from a clone of the repo."; exit 1; }
printf 'Susanoo Reel Kit installer\nRepo: %s\n' "$REPO"

# ---------------------------------------------------------------- 1. programs
step "Programs from Homebrew (ffmpeg, node, uv, whisper-cpp, numpy)"
if [ "$SKIP_BREW" = 1 ]; then
  warn "skipped (--skip-brew)"
elif ! have brew; then
  warn "Homebrew is not installed. Install it from https://brew.sh, open a new terminal, then run this script again."
  exit 1
else
  for f in ffmpeg node uv whisper-cpp numpy; do
    if brew list --formula "$f" >/dev/null 2>&1; then ok "$f already installed"
    else info "installing $f"; brew install "$f"; fi
  done
fi
for c in node npm ffmpeg python3; do have "$c" || { warn "$c not found on PATH. Open a new terminal and run this script again."; exit 1; }; done

# ---------------------------------------------------------------- 2. studio
step "Install the studio as the Claude Code skill at $TARGET"
mkdir -p "$SKILLS"
if [ -e "$TARGET" ] && [ ! -L "$TARGET" ] && [ ! -f "$TARGET/$MARKER" ]; then
  BACKUP="$TARGET.backup-$(date +%Y%m%d-%H%M%S)"
  info "an older copy not installed by this repo is there; moving it to $BACKUP"
  mv "$TARGET" "$BACKUP"
fi
if [ "$LINK" = 1 ]; then
  if [ -d "$TARGET" ] && [ ! -L "$TARGET" ]; then
    BACKUP="$TARGET.backup-$(date +%Y%m%d-%H%M%S)"
    info "switching from a copy to a symlink; moving the copy to $BACKUP"
    mv "$TARGET" "$BACKUP"
  fi
  ln -sfn "$STUDIO" "$TARGET"
  ok "linked $TARGET -> $STUDIO"
else
  if [ -L "$TARGET" ]; then rm "$TARGET"; info "replacing the old symlink with a copy"; fi
  mkdir -p "$TARGET"
  rsync -a --delete --exclude node_modules --exclude '__pycache__' --exclude '*.orig-*' --exclude "$MARKER" "$STUDIO/" "$TARGET/"
  ok "copied studio/ to $TARGET"
fi
date +%Y-%m-%d > "$TARGET/$MARKER" 2>/dev/null || true

step "Kit packages (npm install) and the render browser (npm run browser)"
( cd "$TARGET" && npm install --no-fund --no-audit && npm run browser )
ok "packages and headless Chromium ready"

# ---------------------------------------------------------------- 3. settings folder + key
step "Settings folder for your own keys"
mkdir -p "$CONFIG"; chmod 700 "$CONFIG"
if [ -s "$CONFIG/elevenlabs.key" ]; then
  ok "an ElevenLabs key file exists (not read by this script)"
else
  warn "no ElevenLabs key yet. Make a key at https://elevenlabs.io/app/settings/api-keys"
  info "(allow Text to Speech and Voices), then put it on ONE line in:"
  info "  $CONFIG/elevenlabs.key"
  info "for example: open -e \"$CONFIG/elevenlabs.key\" after: touch \"$CONFIG/elevenlabs.key\""
  info "Never paste the key into a Claude chat."
fi

# ---------------------------------------------------------------- 4. plugins + telemetry
step "Claude Code plugins (hyperframes, instagram-agent)"
if [ "$SKIP_PLUGINS" = 1 ]; then
  warn "skipped (--skip-plugins)"
elif ! have claude; then
  warn "the claude command was not found. Install Claude Code, then run this script again (or add the plugins by hand, see SETUP.md)."
else
  PLUGINS="$(claude plugin list 2>/dev/null || true)"
  add_plugin() { # $1 marketplace repo, $2 plugin@marketplace
    if printf '%s' "$PLUGINS" | grep -q "${2%@*}"; then ok "${2%@*} already installed"; return; fi
    claude plugin marketplace add "$1" || warn "marketplace $1 may already be added"
    claude plugin install "$2" || warn "could not install $2; add it by hand (see SETUP.md)"
  }
  add_plugin heygen-com/hyperframes hyperframes@hyperframes
  add_plugin Jakeschincariol/instagram-agent-skill instagram-agent@instagram-agent-skill
fi

step "HyperFrames telemetry off"
for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
  [ -f "$rc" ] || continue
  if grep -q 'HYPERFRAMES_NO_TELEMETRY' "$rc"; then ok "already set in $rc"
  else printf '\n# Susanoo Reel Kit: no HyperFrames telemetry\nexport HYPERFRAMES_NO_TELEMETRY=1\n' >> "$rc"; ok "added HYPERFRAMES_NO_TELEMETRY=1 to $rc"; fi
done
export HYPERFRAMES_NO_TELEMETRY=1
npx --yes hyperframes telemetry disable >/dev/null 2>&1 && ok "hyperframes telemetry disabled" || warn "could not run 'npx hyperframes telemetry disable'; the environment variable still turns it off"

# ---------------------------------------------------------------- 5. sound tools
if [ "$SKIP_SOUND" = 1 ]; then
  step "Sound tools"; warn "skipped (--skip-sound). The real-sound step needs them."
else
  mkdir -p "$SOUND"

  step "opus-sound-layer (MIT) at $OPUS"
  if [ -d "$OPUS/.git" ]; then ok "already cloned"; else git clone https://github.com/Bodila51/opus-sound-layer "$OPUS"; fi
  RAW="$OPUS/audio/kit/_raw"; mkdir -p "$RAW"
  MISSING=""
  for p in interface-sounds ui-audio impact-sounds sci-fi-sounds digital-audio casino-audio rpg-audio; do
    [ -s "$RAW/kenney_$p.zip" ] || MISSING="$MISSING $p"
  done
  if [ -n "$MISSING" ]; then
    warn "Kenney sound packs need a download in your browser (their links are signed). For each pack:"
    for p in $MISSING; do info "  https://kenney.nl/assets/$p  ->  save as $RAW/kenney_$p.zip"; done
    info "then run: bash setup/install.sh --rebuild-sounds"
  else ok "all 7 Kenney packs present"; fi
  if [ ! -f "$OPUS/audio/kit/catalog.json" ] || [ "$REBUILD_SOUNDS" = 1 ]; then
    info "building the sound library (uv run scripts/sfx.py kit); this downloads CC0 recordings and takes a few minutes"
    ( cd "$OPUS" && uv run scripts/sfx.py kit ) || warn "library build reported errors; run it again after the Kenney downloads"
  else ok "sound library already built (use --rebuild-sounds to rebuild)"; fi

  step "earshot (MIT) at $EARSHOT"
  if [ -d "$EARSHOT/.git" ]; then ok "already cloned"; else git clone https://github.com/Leonxlnx/earshot "$EARSHOT"; fi
  if [ -x "$EARSHOT/.venv/bin/python" ]; then ok ".venv exists"; else ( cd "$EARSHOT" && uv venv --python 3.12 .venv ); fi
  if "$EARSHOT/.venv/bin/python" -c 'import torch' >/dev/null 2>&1; then ok "torch installed"
  else info "installing CPU-only torch"; uv pip install --python "$EARSHOT/.venv/bin/python" torch --index-url https://download.pytorch.org/whl/cpu; fi
  if [ -x "$EARSHOT/.venv/bin/earshot" ]; then ok "earshot installed"
  else ( cd "$EARSHOT" && uv pip install --python .venv/bin/python -e ".[mcp]" ); fi
  info "checking earshot and fetching its two open models (about 1.1 GB, first time only)"
  "$EARSHOT/.venv/bin/earshot" doctor --fetch || warn "earshot doctor reported a problem; run it again: $EARSHOT/.venv/bin/earshot doctor --fetch"

  step "earshot skills (earshot, real-sound) into $SKILLS"
  for s in earshot real-sound; do
    if [ -d "$EARSHOT/skills/$s" ]; then rsync -a "$EARSHOT/skills/$s/" "$SKILLS/$s/"; ok "skill $s"; else warn "skill $s not found in the earshot repo"; fi
  done

  step "earshot MCP server (optional)"
  if [ "$EARSHOT_MCP" = 1 ] && have claude; then
    if claude mcp get earshot >/dev/null 2>&1; then ok "already registered"
    else claude mcp add --scope user earshot -- "$EARSHOT/.venv/bin/earshot" mcp && ok "registered"; fi
  else
    info "not registered. To add it later: claude mcp add --scope user earshot -- $EARSHOT/.venv/bin/earshot mcp"
  fi
fi

# ---------------------------------------------------------------- 6. checkup
step "Kit checkup (node tools/checkup.mjs)"
( cd "$TARGET" && node tools/checkup.mjs ) || warn "the checkup lists items to fix above; SETUP.md explains each one"

printf '\nDone. Next: copy template/ to a folder for your brand, open Claude Code in that copy and run /brand-setup.\n'
