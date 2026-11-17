#!/bin/zsh
# grade.sh: one consistent look across Print, Blender and screen-capture clips. A gentle warm grade, mixed at [mix].
#   zsh scripts/fx/grade.sh in.mp4 out.mp4 [mix 0..1 = 0.6] [lut.cube]
# With no LUT a plain warm grade is used. To give the brand its own look, put a .cube file at scripts/fx/look.cube (or pass one).
D="$(cd "$(dirname "$0")" && pwd)"; IN=$1; OUT=$2; MIX=${3:-0.6}; LUT=${4:-$D/look.cube}
[ -f "$IN" ] || { echo "usage: zsh grade.sh in.mp4 out.mp4 [mix] [lut.cube]"; exit 1; }
if [ -f "$LUT" ]; then G="lut3d=file=${LUT}"; else G="colorbalance=rs=0.04:gs=0.01:bs=-0.04:rm=0.03:bm=-0.03,eq=contrast=1.04:saturation=1.06"; fi
ffmpeg -loglevel error -y -i "$IN" -filter_complex "[0:v]split[a][b];[b]${G}[g];[a][g]blend=all_expr='A*(1-${MIX})+B*${MIX}',format=yuv420p" -c:v libx264 -crf 17 -c:a copy "$OUT" && echo "graded: $OUT (mix $MIX)"
