#!/usr/bin/env bash
# review_sheet.sh: a contact sheet of the reel plus a headless Claude vision review.
# THIS SPENDS ONE SHORT CLAUDE RUN on the account that is signed in to `claude`. It prints a notice and
# waits for a yes first; pass --yes to skip the question (only when the owner already said yes to the run).
#   bash scripts/qa/review_sheet.sh [--yes] reels/<slug>/out/<file>.mp4 [every_seconds=3]
# Writes <mp4 dir>/review-sheet.jpg and review-notes.md. A second opinion only: /reel-review still writes the
# verdict line for Gate C. Optional; nothing in the kit calls it on its own.
YES=0; [ "$1" = "--yes" ] && { YES=1; shift; }
IN=$1; EVERY=${2:-3}; D=$(dirname "$IN"); [ -f "$IN" ] || { echo "usage: bash review_sheet.sh [--yes] reel.mp4 [every]"; exit 1; }
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN"); ROWS=$(python3 -c "import math;print(max(1,math.ceil(math.ceil($DUR/$EVERY)/8)))")
ffmpeg -loglevel error -y -i "$IN" -vf "fps=1/${EVERY},scale=216:-1,tile=8x${ROWS}:padding=4:color=0x15110E" -frames:v 1 -q:v 3 "$D/review-sheet.jpg"
if [ "$YES" != "1" ]; then
  echo "This will spend one short Claude run to review the contact sheet. Continue? [y/N]"; read -r A
  case $A in y|Y|yes) ;; *) echo "Stopped. The contact sheet is at $D/review-sheet.jpg; no Claude run was made."; exit 0;; esac
fi
claude -p "Look at the image $D/review-sheet.jpg: a contact sheet of one short vertical Instagram reel, one frame every ${EVERY} seconds, left to right then down. Judge it as a viewer on a phone: does the first frame hold a readable hook, does the picture change often enough, are layouts repeated, is any text tiny or in the bottom fifth, does the ending drag. Give 5 to 8 short bullet points, most important first, each with the approximate second. Do not invent anything you cannot see. Write them to $D/review-notes.md." --model sonnet --permission-mode acceptEdits --allowedTools "Read,Write" --max-turns 6 2>&1 | tail -3
