#!/usr/bin/env bash
# RGB-split glitch bursts on any clip: a short burst every second, tuned for Print reels.
#   bash fx_glitch.sh in.mp4 out.mp4 [every_seconds=1.2] [burst_seconds=0.12]
IN=$1; OUT=$2; EVERY=${3:-1.2}; BURST=${4:-0.12}
[ -f "$IN" ] || { echo "usage: bash fx_glitch.sh in.mp4 out.mp4 [every] [burst]"; exit 1; }
ffmpeg -loglevel error -y -i "$IN" -vf "rgbashift=rh=10:bh=-10:gv=4:enable='lt(mod(t\,${EVERY})\,${BURST})',noise=alls=18:allf=t:enable='lt(mod(t\,${EVERY})\,${BURST})'" -c:v libx264 -crf 18 -pix_fmt yuv420p "$OUT" && echo "glitch: $OUT"
