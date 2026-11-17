#!/bin/zsh
# music_bed.sh: put a licensed music bed under a finished reel, ducked under the voice, loudness back to -14 LUFS.
#   zsh scripts/fx/music_bed.sh reel.mp4 music.(mp3|wav) out.mp4 [music_db=-20]
# Mix: -2.5 dB at 3.8 kHz on the voice bus, -1.5 dB at 200 Hz on the music, looser loudness range (LRA 11) so impacts breathe.
# Use only music with its licence on record (brand/library/sfx/sfx_add.py --license ...). Check the result with earshot measure.
IN=$1; MUS=$2; OUT=$3; DB=${4:--20}
[ -f "$IN" ] && [ -f "$MUS" ] || { echo "usage: zsh music_bed.sh reel.mp4 music out.mp4 [music_db]"; exit 1; }
ffmpeg -loglevel error -y -i "$IN" -stream_loop -1 -i "$MUS" -filter_complex "[1:a]volume=${DB}dB,equalizer=f=200:t=q:w=1:g=-1.5,afade=t=in:d=1[m];[0:a]equalizer=f=3800:t=q:w=1.5:g=-2.5,asplit[v][k];[m][k]sidechaincompress=threshold=0.04:ratio=8:attack=20:release=300[d];[v][d]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest "$OUT" && echo "music bed: $OUT"
