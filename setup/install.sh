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
#                     (not needed after adding Kenney packs: the script notices them and rebuilds)
#
# Kenney sound packs: Kenney only lets a browser download them. The script opens the 7 pack pages,
# you click Download (then "Continue without donating...") on each, and it takes the zips from
# ~/Downloads. Run it in a terminal so it can wait for you.

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
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d'; exit 0 ;;
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
PACKS="interface-sounds ui-audio impact-sounds sci-fi-sounds digital-audio casino-audio rpg-audio"   # Kenney packs
DL="$HOME/Downloads"
MISSING=""; IMPORTED=0

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
  CATALOG="$OPUS/audio/kit/catalog.json"

  step "Kenney sound packs (7 free CC0 packs, downloaded in your browser)"
  # Kenney only serves its zips to a browser. A script that tries gets a web page back, and the
  # sound builder saves that page under the zip's name ("File is not a zip file"). So: never trust
  # a file just because it exists, test it as a zip, and fetch the real packs through the browser.
  real_zip() { [ -s "$1" ] && unzip -tqq "$1" >/dev/null 2>&1; }
  drop_fake_packs() {
    for p in $PACKS; do
      f="$RAW/kenney_$p.zip"
      if [ -e "$f" ] && ! real_zip "$f"; then
        rm -f "$f"; [ "${1:-}" = quiet ] || warn "removed kenney_$p.zip: it was a web page, not the sound pack"
      fi
    done
  }
  # A pack downloaded in the browser: the newest real zip in ~/Downloads, or the folder Safari
  # makes when it unzips a download by itself.
  import_pack() {
    local p="$1" dst="$RAW/kenney_$1.zip" f d
    while IFS= read -r f; do
      if real_zip "$f"; then cp "$f" "$dst"; ok "kenney_$p.zip taken from Downloads"; IMPORTED=1; return 0; fi
    done < <(ls -t "$DL"/*"$p"*.zip 2>/dev/null)
    for d in "$DL"/*"$p"*/; do
      [ -d "$d" ] || continue
      if [ -n "$(find "$d" \( -iname '*.ogg' -o -iname '*.wav' \) -print -quit)" ]; then
        rm -f "$dst"
        if ( cd "$d" && zip -qr "$dst" . ); then ok "kenney_$p.zip made from the unzipped folder in Downloads"; IMPORTED=1; return 0; fi
      fi
    done
    return 1
  }
  # the pack's name inside the sound library (catalog ids look like "hit/kenney-impact-...")
  lib_name() { case "$1" in interface-sounds) echo interface ;; impact-sounds) echo impact ;; sci-fi-sounds) echo scifi ;;
                            digital-audio) echo digital ;; casino-audio) echo casino ;; rpg-audio) echo rpg ;; *) echo "$1" ;; esac; }

  drop_fake_packs
  for p in $PACKS; do real_zip "$RAW/kenney_$p.zip" || import_pack "$p" || MISSING="$MISSING $p"; done

  if [ -n "$MISSING" ] && [ -t 0 ] && [ -t 1 ] && have open; then
    warn "$(echo $MISSING | wc -w | tr -d ' ') of 7 packs still needed. Kenney only allows downloads from a browser, so this part is by hand (about 2 minutes)."
    info "Opening each pack page in your browser now. On each page:"
    info "  1. click Download"
    info "  2. a 'Consider a donation' box opens: click 'Continue without donating...' (the packs are free)"
    info "  3. leave the zip in your Downloads folder; this script picks it up from there"
    for p in $MISSING; do info "  https://kenney.nl/assets/$p"; open "https://kenney.nl/assets/$p"; done
    while [ -n "$MISSING" ]; do
      printf '    Press Enter when the downloads have finished (or type s then Enter to skip for now): '
      read -r reply || reply=s
      LEFT=""; for p in $MISSING; do import_pack "$p" || LEFT="$LEFT $p"; done; MISSING="$LEFT"
      [ "$reply" = s ] && break
      [ -n "$MISSING" ] && warn "not in Downloads yet:$MISSING"
    done
  fi

  if [ -n "$MISSING" ]; then
    warn "Kenney packs missing:$MISSING"
    info "Reels still work, but the real-sound step has no ui or zap sounds and fewer impact and sci-fi sounds. To add them:"
    info "  open each page below, click Download, then 'Continue without donating...', leave the zip in Downloads"
    for p in $MISSING; do info "  https://kenney.nl/assets/$p"; done
    info "  then run: bash setup/install.sh --rebuild-sounds"
  else ok "all 7 Kenney packs present and valid"; fi

  step "Sound library (opus-sound-layer, about 1,140 CC0 sounds)"
  NEED_BUILD="$REBUILD_SOUNDS"
  [ -f "$CATALOG" ] || NEED_BUILD=1
  [ "$IMPORTED" = 1 ] && NEED_BUILD=1
  if [ "$NEED_BUILD" = 0 ]; then
    for p in $PACKS; do
      if real_zip "$RAW/kenney_$p.zip" && ! grep -q "/kenney-$(lib_name "$p")-" "$CATALOG"; then
        info "the library was built without the $p pack; rebuilding it"; NEED_BUILD=1; break
      fi
    done
  fi
  if [ "$NEED_BUILD" = 1 ]; then
    info "building the sound library (uv run scripts/sfx.py kit); this downloads CC0 recordings and takes a few minutes"
    [ -n "$MISSING" ] && info "the missing Kenney packs will show as 'skip pack ...: File is not a zip file'; that is expected"
    ( cd "$OPUS" && uv run scripts/sfx.py kit ) || warn "library build reported errors; run: bash setup/install.sh --rebuild-sounds"
    drop_fake_packs quiet
  else ok "sound library already built with every Kenney pack you have (use --rebuild-sounds to rebuild)"; fi
  if [ -f "$CATALOG" ]; then
    KN=$(grep -c '"id": "[a-z]*/kenney-' "$CATALOG" || true); ALL=$(grep -c '"id": ' "$CATALOG" || true)
    if [ -z "$MISSING" ]; then ok "library: $ALL sounds, $KN of them from Kenney (complete: about 1,140 sounds, 309 from Kenney)"
    else warn "library: $ALL sounds, $KN of them from Kenney (complete: about 1,140, 309 from Kenney). Until the packs are in, the ui and zap sound types are empty."; fi
  fi

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
if [ -n "$MISSING" ]; then
  printf 'Still to do: the Kenney packs%s (see the "Kenney sound packs" step above). Reels work without them.\n' "$MISSING"
fi
