#!/bin/zsh
# upscale.sh: clean up and enlarge a low-res clip or still with ffmpeg only: denoise, Lanczos, light sharpen.
#   zsh scripts/fx/upscale.sh in.(mp4|png|jpg) out.(mp4|png) [width=1080]
# Real-ESRGAN would be sharper but needs a model download; add it only with the owner's yes for that file.
IN=$1; OUT=$2; W=${3:-1080}
[ -f "$IN" ] || { echo "usage: zsh upscale.sh in out [width]"; exit 1; }
ffmpeg -loglevel error -y -i "$IN" -vf "hqdn3d=2:1.5:3:3,scale=${W}:-2:flags=lanczos,unsharp=5:5:0.6:3:3:0.2" "$OUT" \
  && echo "upscaled: $OUT"
