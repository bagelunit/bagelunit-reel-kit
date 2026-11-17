#!/usr/bin/env python3
"""board_add.py: pull reference frames into a per-format board. Shape study only: pacing, layout, hook position.
  python3 scripts/qa/board_add.py <video.mp4> --format menu|prompt-pack|hero-shot|screen-capture|... --source <post url> [--every 1.5]
Writes brand/research/boards/<format>/<video name>/ with a frame every N seconds plus a contact sheet, and a row in boards/INDEX.md
(source, date, length). The video must be one the project already holds (a file the owner supplied, or one fetched with the scrape rule).
Never reuse another creator's script, colours, characters or footage in a reel: boards are for timing and layout only."""
import argparse, datetime, pathlib, subprocess
ap = argparse.ArgumentParser(); ap.add_argument('video'); ap.add_argument('--format', required=True); ap.add_argument('--source', required=True); ap.add_argument('--every', type=float, default=1.5); a = ap.parse_args()
root = pathlib.Path(__file__).resolve().parents[2] / 'brand/research/boards'; v = pathlib.Path(a.video); out = root / a.format / v.stem; out.mkdir(parents=True, exist_ok=True)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(v), '-vf', f'fps=1/{a.every},scale=270:-1', str(out / 'f_%03d.jpg')], check=True)
dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(v)], text=True))
rows = max(1, -(-len(list(out.glob('f_*.jpg'))) // 8))
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-pattern_type', 'glob', '-i', str(out / 'f_*.jpg'), '-vf', f'tile=8x{rows}:padding=4:color=0x15110E', '-frames:v', '1', str(out / 'sheet.jpg')], check=True)
idx = root / 'INDEX.md'
if not idx.exists(): idx.write_text('# Reference boards (shape only)\n\n| Format | Video | Source | Seconds | Added |\n|---|---|---|---|---|\n')
with idx.open('a') as f: f.write(f'| {a.format} | {v.stem} | {a.source} | {dur:.1f} | {datetime.date.today()} |\n')
print(f'board: {out}/sheet.jpg')
