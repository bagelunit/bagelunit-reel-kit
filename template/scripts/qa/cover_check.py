#!/usr/bin/env python3
"""cover_check.py: is this reel cover (the still that sits on the profile grid) ready? Facts from pixels, no model, no credits.

  python3 scripts/qa/cover_check.py reels/<slug>/out/cover.jpg [--min-h 80] [--json]
  python3 scripts/qa/cover_check.py --selftest

Checks
  SIZE    1080x1920 is the reel cover. Another 9:16 size is a WARN (scale it to 1080x1920). A 1:1 or 4:5 picture is a WARN (a feed
          image, not a reel cover). Any other shape fails.
  SAFE    every line of text inside the middle 1010x1350 of a 1080x1920 cover (x 35 to 1045, y 285 to 1635), so the profile grid
          (which crops a reel cover to 3:4 or 4:5) and the feed square never cut a word. Other shapes use the same share of the picture.
  TEXT    the biggest line of text is at least --min-h px tall (default 80, about a 110 px font: still readable at the 150 px
          wide thumbnail the brief asks for). Any other line under 40 px tall is a WARN. No text found at all fails: the cover is its title.
  LIGHT   not near-black (mean brightness under 30 and almost nothing bright: the brightest 1 percent under 60) and not near-white (mean
          over 225 and almost nothing dark: the darkest 1 percent over 180). A dark or light brand colour with a clear title passes.
Text is read the way the reel QA reads it (scripts/qa/reel_qa.py: Apple Vision on a Mac, else Tesseract). With neither, SAFE and TEXT say
"not checked" and the exit code is 2, never a silent pass. Exit code 0 = all pass (WARN allowed), 1 = a FAIL, 2 = a check could not run.
Needs ffmpeg and numpy (the kit already uses both); the picture is decoded with ffmpeg, so JPEG and PNG both work."""
import json, pathlib, shutil, subprocess, sys

SAFE_W, SAFE_H = 1010 / 1080, 1350 / 1920      # the share of a 9:16 cover that the grid crop never touches
MIN_TITLE_H = 80
MIN_SMALL_H = 40
HERE = pathlib.Path(__file__).resolve().parent


# ---------------------------------------------------------------- pure checks (tested without any picture)
def size_check(w, h):
    """-> (level, message). level is PASS, WARN or FAIL."""
    if (w, h) == (1080, 1920):
        return 'PASS', 'SIZE 1080x1920'
    ratio = w / h if h else 0
    if abs(ratio - 9 / 16) < 0.01:
        return 'WARN', f'SIZE {w}x{h} is 9:16 but the reel cover is 1080x1920: scale it'
    if abs(ratio - 1) < 0.01 or abs(ratio - 4 / 5) < 0.01:
        return 'WARN', f'SIZE {w}x{h} is a feed shape (1:1 or 4:5), not a 9:16 reel cover: the reel cover is 1080x1920'
    return 'FAIL', f'SIZE {w}x{h} is not 9:16, 1:1 or 4:5: make a 1080x1920 cover'


def safe_box(w, h):
    """The box text must sit in: the middle 1010x1350 of 1080x1920, scaled to this picture. (x0, y0, x1, y1)."""
    if abs((w / h if h else 0) - 9 / 16) < 0.01:
        bw, bh = w * SAFE_W, h * SAFE_H
    else:
        bw, bh = w * 0.9, h * 0.9
    return (w - bw) / 2, (h - bh) / 2, (w + bw) / 2, (h + bh) / 2


def text_checks(lines, w, h, min_h=MIN_TITLE_H):
    """lines: [{text, x, y, w, h, conf}] in pixels, y from the top. -> list of (level, message)."""
    out = []
    real = [l for l in lines if len(str(l.get('text', '')).strip()) >= 2 and float(l.get('conf', 1)) >= 0.5]
    if not real:
        return [('FAIL', 'TEXT no text read on the cover: it needs its title (3 to 5 words), big enough to read at thumbnail size')]
    x0, y0, x1, y1 = safe_box(w, h)
    outside = [l for l in real if l['x'] < x0 - 1 or l['y'] < y0 - 1 or l['x'] + l['w'] > x1 + 1 or l['y'] + l['h'] > y1 + 1]
    for l in outside:
        out.append(('FAIL', f'SAFE "{l["text"]}" at x {l["x"]:.0f}-{l["x"] + l["w"]:.0f}, y {l["y"]:.0f}-{l["y"] + l["h"]:.0f} leaves the safe box '
                            f'x {x0:.0f}-{x1:.0f}, y {y0:.0f}-{y1:.0f} (the profile grid would cut it)'))
    if not outside:
        out.append(('PASS', f'SAFE all {len(real)} text line(s) inside x {x0:.0f}-{x1:.0f}, y {y0:.0f}-{y1:.0f}'))
    top = max(real, key=lambda l: l['h'])
    if top['h'] < min_h:
        out.append(('FAIL', f'TEXT the biggest line "{top["text"]}" is {top["h"]:.0f} px tall; at least {min_h:.0f} px so it reads at 150 px wide'))
    else:
        out.append(('PASS', f'TEXT the biggest line "{top["text"]}" is {top["h"]:.0f} px tall (needs {min_h:.0f})'))
    for l in real:
        if l is not top and l['h'] < MIN_SMALL_H:
            out.append(('WARN', f'TEXT "{l["text"]}" is only {l["h"]:.0f} px tall (under {MIN_SMALL_H}): unreadable on the grid; fine only for a handle or a credit'))
    return out


def light_check(stats):
    """stats: {mean, p1, p99} of the picture's brightness 0..255 -> (level, message)."""
    m, lo, hi = stats['mean'], stats['p1'], stats['p99']
    if m < 30 and hi < 60:
        return 'FAIL', f'LIGHT near-black (mean {m:.0f}, brightest 1 percent {hi:.0f}): it disappears on a dark grid'
    if m > 225 and lo > 180:
        return 'FAIL', f'LIGHT near-white (mean {m:.0f}, darkest 1 percent {lo:.0f}): it disappears on a light grid'
    return 'PASS', f'LIGHT mean {m:.0f}, darkest 1 percent {lo:.0f}, brightest 1 percent {hi:.0f}'


# ---------------------------------------------------------------- reading the picture
def dimensions(path):
    if shutil.which('ffprobe'):
        r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', str(path)],
                           capture_output=True, text=True)
        try:
            a, b = r.stdout.strip().split('x')
            return int(a), int(b)
        except ValueError:
            pass
    raise RuntimeError('could not read the picture size (is ffprobe installed, and is this a JPEG or PNG?)')


def brightness(path, w, h):
    import numpy as np
    # decode to 8-bit grey at a quarter of the size: enough for a mean and percentiles
    tw, th = max(2, w // 4), max(2, h // 4)
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-vf', f'scale={tw}:{th}:flags=area,format=gray', '-frames:v', '1', '-f', 'rawvideo', '-'],
                       capture_output=True)
    a = np.frombuffer(r.stdout, dtype=np.uint8)
    if a.size != tw * th:
        raise RuntimeError('ffmpeg could not decode the picture')
    return {'mean': float(a.mean()), 'p1': float(np.percentile(a, 1)), 'p99': float(np.percentile(a, 99))}


def read_text(path):
    """OCR lines from the reel QA's reader, or None when no reader is installed."""
    sys.path.insert(0, str(HERE))
    try:
        import reel_qa
    except (Exception, SystemExit):
        return None
    try:
        res = reel_qa.ocr([str(pathlib.Path(path).resolve())])
    except Exception:
        return None
    if not res:
        return None
    return res[0].get('lines', [])


def check(path, min_h=MIN_TITLE_H):
    """-> list of (level, message); level also NOTRUN when a reader is missing."""
    path = pathlib.Path(path)
    if not path.is_file():
        raise RuntimeError(f'no picture at {path}')
    w, h = dimensions(path)
    out = [size_check(w, h)]
    try:
        out.append(light_check(brightness(path, w, h)))
    except ImportError:
        out.append(('NOTRUN', 'LIGHT not checked: numpy is missing (pip install numpy)'))
    lines = read_text(path)
    if lines is None:
        out.append(('NOTRUN', 'SAFE and TEXT not checked: no text reader. On a Mac install the Xcode command line tools (xcode-select --install); on Windows or Linux install Tesseract'))
    else:
        out += text_checks(lines, w, h, min_h)
    return out


def report(results):
    code = 1 if any(l == 'FAIL' for l, _ in results) else 2 if any(l == 'NOTRUN' for l, _ in results) else 0
    return code, '\n'.join(f'{l:6} {m}' for l, m in results)


# ---------------------------------------------------------------- self test (no picture, no reader needed)
def selftest():
    assert size_check(1080, 1920)[0] == 'PASS'
    assert size_check(720, 1280)[0] == 'WARN' and size_check(1080, 1080)[0] == 'WARN' and size_check(1080, 1350)[0] == 'WARN'
    assert size_check(1920, 1080)[0] == 'FAIL'
    x0, y0, x1, y1 = safe_box(1080, 1920)
    assert (round(x0), round(y0), round(x1), round(y1)) == (35, 285, 1045, 1635), (x0, y0, x1, y1)
    ok = [{'text': 'FEED THE STARTER', 'x': 120, 'y': 800, 'w': 840, 'h': 130, 'conf': 0.9}, {'text': '@handle', 'x': 400, 'y': 1500, 'w': 280, 'h': 44, 'conf': 0.9}]
    assert all(l == 'PASS' for l, _ in text_checks(ok, 1080, 1920))
    low = [{'text': 'FEED THE STARTER', 'x': 120, 'y': 1700, 'w': 840, 'h': 130, 'conf': 0.9}]       # in the bottom 300 px: the grid crop cuts it
    assert any(l == 'FAIL' and m.startswith('SAFE') for l, m in text_checks(low, 1080, 1920))
    left = [{'text': 'FEED THE STARTER', 'x': 10, 'y': 800, 'w': 840, 'h': 130, 'conf': 0.9}]
    assert any(l == 'FAIL' and m.startswith('SAFE') for l, m in text_checks(left, 1080, 1920))
    small = [{'text': 'FEED THE STARTER', 'x': 120, 'y': 800, 'w': 400, 'h': 50, 'conf': 0.9}]
    assert any(l == 'FAIL' and m.startswith('TEXT') for l, m in text_checks(small, 1080, 1920))
    assert text_checks([], 1080, 1920)[0][0] == 'FAIL'
    assert text_checks([{'text': 'x', 'x': 120, 'y': 800, 'w': 20, 'h': 100, 'conf': 0.2}], 1080, 1920)[0][0] == 'FAIL'   # a low-confidence smudge is not text
    tiny = ok + [{'text': 'subtitle', 'x': 300, 'y': 1000, 'w': 200, 'h': 30, 'conf': 0.9}]
    assert any(l == 'WARN' for l, _ in text_checks(tiny, 1080, 1920))
    assert light_check({'mean': 12, 'p1': 0, 'p99': 40})[0] == 'FAIL'
    assert light_check({'mean': 245, 'p1': 220, 'p99': 255})[0] == 'FAIL'
    assert light_check({'mean': 25, 'p1': 10, 'p99': 240})[0] == 'PASS'       # a dark picture with a bright title is a design, not a fault
    assert light_check({'mean': 235, 'p1': 40, 'p99': 255})[0] == 'PASS'
    assert light_check({'mean': 110, 'p1': 30, 'p99': 220})[0] == 'PASS'
    assert report([('PASS', 'a')])[0] == 0 and report([('WARN', 'a'), ('FAIL', 'b')])[0] == 1 and report([('PASS', 'a'), ('NOTRUN', 'b')])[0] == 2
    print('cover_check selftest: ok')


def main():
    a = sys.argv[1:]
    if '--selftest' in a:
        return selftest()
    if not a or a[0].startswith('--'):
        sys.exit(__doc__)
    min_h = float(a[a.index('--min-h') + 1]) if '--min-h' in a else MIN_TITLE_H
    try:
        results = check(a[0], min_h)
    except RuntimeError as e:
        sys.exit(f'cover_check: {e}')
    code, text = report(results)
    if '--json' in a:
        print(json.dumps({'file': a[0], 'exit': code, 'results': [{'level': l, 'message': m} for l, m in results]}, indent=1))
    else:
        print(text)
        print({0: 'COVER OK', 1: 'COVER NEEDS FIXING (a FAIL above)', 2: 'COVER PARTLY CHECKED (a check could not run)'}[code])
    sys.exit(code)


if __name__ == '__main__':
    main()
