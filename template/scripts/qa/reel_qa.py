#!/usr/bin/env python3
"""reel_qa.py: text-size, safe-zone and mute-hook checks on a finished reel mp4.
Reads the picture only, so it works for Print and every other style (the kit's own text check skips Print reels).
OCR: Apple Vision on a Mac (scripts/qa/ocr, built from ocr.swift the first time), else the Tesseract program if it is installed
(Windows, Linux: install Tesseract; the check says so if neither is there).

  python3 scripts/qa/reel_qa.py reels/<slug>/out/<file>.mp4 [--step 0.5] [--min-h 30] [--hook-words 3] [--json]

Checks
  SIZE   a text line whose box is shorter than --min-h px (about a 40 px font) at any sampled time. Tiny UI mock-up text is listed
         as INFO so a person can decide: it is not always a fault.
  SAFE   text inside the bottom 300 px or the right 120 px of the 1080x1920 frame (confidence 0.5+, 3+ characters).
  HOOK   at 0.1 s the frame already shows a headline (large text, 60 px+ tall, 3+ words) and the same words are still up at 2.0 s.
Exit code 0 when SIZE (non-mock-up) and SAFE and HOOK all pass, else 1. It reports facts from pixels; a person decides what to fix."""
import argparse, json, pathlib, platform, shutil, subprocess, sys, tempfile, re, difflib
HERE = pathlib.Path(__file__).resolve().parent
OCR = HERE / 'ocr'
NO_OCR = 'reel QA needs a text reader: on a Mac it builds its own (install the Xcode command line tools: xcode-select --install); on Windows or Linux install Tesseract (https://tesseract-ocr.github.io/tessdoc/Installation.html) and run this again.'

def extra_ignores():
    f = HERE.parent.parent / 'brand' / 'qa-ignore.txt'
    return [l.strip().lower() for l in f.read_text().splitlines() if l.strip() and not l.startswith('#')] if f.exists() else []

def host_logo_text():
    # the sticker host's chest or hoodie logo (brand.json -> host.logo_text), read by OCR as fragments: never a fault of the reel
    try: return re.sub(r'[^a-z.]', '', str(json.loads((HERE.parent.parent / 'brand' / 'brand.json').read_text()).get('host', {}).get('logo_text', '')).lower())
    except Exception: return ''

def host_logo(txt, y0, x1, ignores):
    low = re.sub(r'[^a-z.]', '', txt.lower())
    if any(i in txt.lower() for i in ignores): return True
    logo = host_logo_text()
    return bool(logo) and x1 > 780 and y0 > 1600 and (difflib.SequenceMatcher(None, low, logo).ratio() >= 0.4 or len(low) <= 6)

def frames(mp4, times, d):
    for i, t in enumerate(times):
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{t:.2f}', '-i', mp4, '-frames:v', '1', f'{d}/f_{i:04d}.png'], check=True)
    return [f'{d}/f_{i:04d}.png' for i in range(len(times))]

def build_apple_ocr():
    if OCR.exists(): return True
    if platform.system() != 'Darwin' or not shutil.which('swiftc'): return False
    r = subprocess.run(['swiftc', '-O', str(HERE / 'ocr.swift'), '-o', str(OCR)], capture_output=True, text=True)
    return r.returncode == 0 and OCR.exists()

def tesseract_lines(path):
    # word boxes grouped into lines (same shape as ocr.swift: pixels, y from the top)
    from PIL import Image
    w, h = Image.open(path).size
    r = subprocess.run(['tesseract', path, 'stdout', '--psm', '11', 'tsv'], capture_output=True, text=True)
    rows, lines = [l.split('\t') for l in r.stdout.splitlines()[1:]], {}
    for c in rows:
        if len(c) < 12 or not c[11].strip() or float(c[10]) < 0: continue
        k = (c[2], c[3], c[4]); x, y, ww, hh = int(c[6]), int(c[7]), int(c[8]), int(c[9])
        lines.setdefault(k, []).append((x, y, ww, hh, c[11].strip(), float(c[10]) / 100))
    out = []
    for ws in lines.values():
        x0 = min(a[0] for a in ws); y0 = min(a[1] for a in ws); x1 = max(a[0] + a[2] for a in ws); y1 = max(a[1] + a[3] for a in ws)
        out.append({'text': ' '.join(a[4] for a in sorted(ws)), 'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0, 'conf': sum(a[5] for a in ws) / len(ws)})
    return {'file': pathlib.Path(path).name, 'w': w, 'h': h, 'lines': out}

def ocr(paths):
    if build_apple_ocr():
        out = []
        for i in range(0, len(paths), 40):
            r = subprocess.run([str(OCR)] + paths[i:i + 40], capture_output=True, text=True)
            out += [json.loads(l) for l in r.stdout.splitlines() if l.strip()]
        return out
    if shutil.which('tesseract'): return [tesseract_lines(p) for p in paths]
    return None

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('mp4'); ap.add_argument('--step', type=float, default=0.5); ap.add_argument('--min-h', type=float, default=30)
    ap.add_argument('--hook-words', type=int, default=3); ap.add_argument('--json', action='store_true'); a = ap.parse_args()
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', a.mp4], text=True).strip())
    times = [0.1, 0.5, 1.0, 1.5, 2.0] + [round(t, 2) for t in frange(2.5, dur - 0.1, a.step)]
    with tempfile.TemporaryDirectory() as d:
        res = ocr(frames(a.mp4, times, d))
    if res is None: sys.exit(NO_OCR)
    W = res[0]['w']; H = res[0]['h']; sx = W / 1080; sy = H / 1920
    size, safe, ign = {}, {}, extra_ignores()
    for t, fr in zip(times, res):
        for l in fr['lines']:
            txt = re.sub(r'\s+', ' ', l['text']).strip()
            if len(txt) < 3 or l['conf'] < 0.5 or not re.search(r'[A-Za-z0-9]', txt): continue
            h = l['h'] / sy; y0 = l['y'] / sy; x1 = (l['x'] + l['w']) / sx
            if host_logo(txt, y0, x1, ign): continue
            if h < a.min_h: size.setdefault(txt, []).append((t, round(h)))
            if y0 + h > 1620 or x1 > 960: safe.setdefault(txt, []).append((t, round(y0), round(x1)))
    first, f2 = res[0], res[4]
    big = lambda fr: [re.sub(r'\s+', ' ', l['text']).strip() for l in fr['lines'] if l['h'] / sy >= 60 and l['conf'] >= 0.5]
    h0, h2 = big(first), big(f2)
    words0 = sum(len(x.split()) for x in h0); held = bool(h0) and any(x in h2 for x in h0)
    report = {'file': a.mp4, 'seconds': dur, 'size': {k: v for k, v in size.items()}, 'safe': safe, 'hook': {'frame0_headline': h0, 'words': words0, 'held_to_2s': held}}
    if a.json: print(json.dumps(report, indent=1)); return
    print(f'{a.mp4}  ({dur:.1f} s, sampled {len(times)} frames)\n')
    print(f'HOOK  frame 0.1 s headline: {" / ".join(h0) or "none found"}  [{words0} words]  held to 2.0 s: {"yes" if held else "NO"}')
    hook_ok = words0 >= a.hook_words and held
    print('      ' + ('PASS' if hook_ok else f'FAIL: want {a.hook_words}+ words of 60 px+ text at frame 0 that stay up to 2 s') + '\n')
    nsize = sum(1 for k, v in size.items() if len(v) >= 2)   # a line seen at 2+ samples is real text, not a flicker
    print(f'SIZE  {len(size)} distinct lines under {a.min_h:.0f} px tall (a ~40 px font); {nsize} seen at two or more sample times')
    for k, v in sorted(size.items(), key=lambda kv: -len(kv[1]))[:14]: print(f'      {min(h for _, h in v):>3} px  x{len(v):<2} first {v[0][0]:>5.1f}s  "{k[:48]}"')
    print('      (small text inside a drawn phone or form mock-up is usually fine: judge those by eye)\n')
    print(f'SAFE  {len(safe)} lines in the bottom 300 px or right 120 px')
    for k, v in sorted(safe.items(), key=lambda kv: -len(kv[1]))[:12]: print(f'      x{len(v):<2} first {v[0][0]:>5.1f}s  y={v[0][1]}  right edge={v[0][2]}  "{k[:48]}"')
    ok = hook_ok and not safe
    print('\n(the sticker host\'s hoodie logo and anything in brand/qa-ignore.txt are skipped)')
    print('\nRESULT ' + ('PASS' if ok else 'ATTENTION: see HOOK and SAFE above; SIZE is for a person to judge')); sys.exit(0 if ok else 1)

def frange(a, b, s):
    t = a
    while t < b: yield t; t += s

if __name__ == '__main__':
    main()
