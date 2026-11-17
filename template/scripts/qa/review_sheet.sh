#!/bin/zsh
# review_sheet.sh: a contact sheet of the reel plus a headless Claude vision review . Costs one short Claude run.
#   zsh scripts/qa/review_sheet.sh reels/<slug>/out/<file>.mp4 [every_seconds=3]
# Writes <mp4 dir>/review-sheet.jpg and review-notes.md. A second opinion only: /reel-review still writes the verdict line for Gate C.
IN=$1; EVERY=${2:-3}; D=$(dirname "$IN"); [ -f "$IN" ] || { echo "usage: zsh review_sheet.sh reel.mp4 [every]"; exit 1; }
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN"); ROWS=$(python3 -c "import math;print(max(1,math.ceil(math.ceil($DUR/$EVERY)/8)))")
ffmpeg -loglevel error -y -i "$IN" -vf "fps=1/${EVERY},scale=216:-1,tile=8x${ROWS}:padding=4:color=0x15110E" -frames:v 1 -q:v 3 "$D/review-sheet.jpg"
claude -p "Look at the image $D/review-sheet.jpg: a contact sheet of one short vertical Instagram reel, one frame every ${EVERY} seconds, left to right then down. Judge it as a viewer on a phone: does the first frame hold a readable hook, does the picture change often enough, are layouts repeated, is any text tiny or in the bottom fifth, does the ending drag. Give 5 to 8 short bullet points, most important first, each with the approximate second. Do not invent anything you cannot see. Write them to $D/review-notes.md." --model sonnet --permission-mode acceptEdits --allowedTools "Read,Write" --max-turns 6 2>&1 | tail -3
