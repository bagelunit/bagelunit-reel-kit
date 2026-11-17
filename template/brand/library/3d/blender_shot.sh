#!/usr/bin/env bash
# blender_shot.sh: run a Blender shot script headless and (optionally) turn the frames into a transparent clip.
#   bash blender_shot.sh <shot.py> <out-dir> [--still 30 | --clip name.mov] [shot options...]
# --still N   render only frame N to <out-dir>/still.png (fast: use it to LOOK before rendering the clip)
# --clip x    after rendering the frames, encode them to <out-dir>/x with an alpha channel (.mov = ProRes 4444, .webm = VP9)
# Blender is found at $BLENDER_PATH, then on PATH, then the Mac app. Output is a numbered PNG sequence f_0001.png ... in <out-dir>.
SHOT=$1; OUT=$2; shift 2
B=${BLENDER_PATH:-$(command -v blender)}; [ -z "$B" ] && [ -x /Applications/Blender.app/Contents/MacOS/Blender ] && B=/Applications/Blender.app/Contents/MacOS/Blender
[ -x "$B" ] || { echo "Blender was not found. Install it (brew install --cask blender, or blender.org) or set BLENDER_PATH."; exit 1; }
[ -f "$SHOT" ] || { echo "usage: bash blender_shot.sh <shot.py> <out-dir> [--still N | --clip name.mov] [options]"; exit 1; }
CLIP=""; ARGS=()
while [ $# -gt 0 ]; do case $1 in --clip) CLIP=$2; shift 2;; *) ARGS+=("$1"); shift;; esac; done
mkdir -p "$OUT"
"$B" -b --factory-startup -P "$SHOT" -- --out "$OUT" "${ARGS[@]}" 2>&1 | grep -E "^(STILL|FRAMES|ATTRIBUTION|Error|Traceback|.*Error:)|File \"|^  " | tail -25
if [ -n "$CLIP" ]; then
  case $CLIP in
    *.webm) ffmpeg -loglevel error -y -framerate 30 -i "$OUT/f_%04d.png" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 24 "$OUT/$CLIP";;
    *) ffmpeg -loglevel error -y -framerate 30 -i "$OUT/f_%04d.png" -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le "$OUT/$CLIP";;
  esac && echo "clip: $OUT/$CLIP"
fi
