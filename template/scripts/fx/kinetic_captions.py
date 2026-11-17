#!/usr/bin/env python3
"""kinetic_captions.py: word-by-word pop captions from the reel's own word times .
  python3 scripts/fx/kinetic_captions.py reels/<slug> in.mp4 out.mp4 [--y 1280] [--size 88]
Reads <reel>/build/words.json ([{w, s, e}] in seconds), draws the current 3 to 4 words with the active word popping, and overlays it on in.mp4.
This ffmpeg has no libass/drawtext, so frames are drawn with PIL and streamed in. Keep the captions out of the bottom 300 px (default y=1280)."""
import argparse, json, pathlib, subprocess, sys
from PIL import Image, ImageDraw, ImageFont
ap = argparse.ArgumentParser(); ap.add_argument('reel'); ap.add_argument('inp'); ap.add_argument('out'); ap.add_argument('--y', type=int, default=1280); ap.add_argument('--size', type=int, default=88); a = ap.parse_args()
words = json.load(open(pathlib.Path(a.reel) / 'build' / 'words.json'))
F = str(pathlib.Path.home() / '.claude/skills/bagelunit-reels/fonts/Anton-Regular.ttf'); sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent)); from brandcolors import colors, rgb
_c = colors(); INK = rgb(_c['ink']); RED = rgb(_c['accent']); PAPER = rgb(_c['paper'], 235)   # the brand's own colours (brand/brand.json)
dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', a.inp], text=True)); FPS = 30
groups = []; cur = []
for w in words:
    cur.append(w)
    if len(cur) >= 4 or w['w'].rstrip().endswith(('.', '?', '!', ',')): groups.append(cur); cur = []
if cur: groups.append(cur)
font = ImageFont.truetype(F, a.size)
p = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-i', a.inp, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '1080x300', '-r', str(FPS), '-i', '-', '-filter_complex', f'[0:v][1:v]overlay=0:{a.y}:format=auto,format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-c:a', 'copy', a.out], stdin=subprocess.PIPE)
for i in range(int(dur * FPS)):
    t = i / FPS; im = Image.new('RGBA', (1080, 300), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    g = next((g for g in groups if g[0]['s'] - 0.05 <= t <= g[-1]['e'] + 0.25), None)
    if g:
        txt = [x['w'].upper() for x in g]; widths = [d.textlength(x + ' ', font=font) for x in txt]; total = sum(widths); x0 = (1080 - total) / 2
        d.rounded_rectangle((x0 - 28, 70, x0 + total + 20, 70 + a.size + 50), 28, fill=PAPER)
        for x, wd, wo in zip(txt, widths, g):
            active = wo['s'] <= t <= wo['e'] + 0.08
            pop = 1 + 0.12 * max(0, 1 - (t - wo['s']) / 0.12) if active else 1
            f2 = ImageFont.truetype(F, int(a.size * pop)) if active else font
            d.text((x0, 80 + (a.size - int(a.size * pop)) * 0.2), x, font=f2, fill=RED if active else INK)
            x0 += wd
    p.stdin.write(im.tobytes())
p.stdin.close(); p.wait(); print('captions:', a.out)
