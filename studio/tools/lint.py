#!/usr/bin/env python3
"""Shot-grammar lint: does the cut list of a built reel follow the house rules for shots and cuts?

  python3 tools/lint.py <project> [video.mp4]      (video: only for FIRST-MOVE; default the newer of build/video.mp4 and build/draft.mp4)

Every finding is one line:   CODE  severity  time  message
Errors fail the run (exit 3); warnings and notes do not. No findings prints "lint: clean".

Rule codes
  SHOT-LEN       error    a shot is shorter than 1.0 s or longer than 5.0 s
  FACE-LEN       error    a shot that shows the presenter or the face holds longer than 2.0 s (talking reels: 3.0 s, the cadence
                          in modes/talking/GUIDE.md is a cut every 1.5-3 s, so the face layouts there are allowed that long)
  ADJ-SAME       error    two neighbouring shots share a layout (talking reels: a warning for a pair, an error from the third in a
                          row, because modes/talking/GUIDE.md allows one layout twice but never three times)
  CUT-WORD       error    a cut lands inside a spoken word: it must fall in a gap between words, or at most 2 frames (at 30 fps)
                          after a word starts (build/words.json)
  RHYTHM         error    three shots in a row whose lengths are all within 0.3 s of each other (a metronome)
  FIRST-MOVE     error    nothing moves in the first frames of the rendered video (frame differences on the first second, the
                          same approach as pace.py, with the mode's quiet regions left out). A note, not an error, when there
                          is no video yet or numpy is missing
  DEVICE-REPEAT  warning  the same prop or card id is used in three shots in a row (only when the shot data names its props)

Where the shots come from (first match wins)
  build/shots.json   written by a mode page or by hand; works for every mode. Either a list or {"shots": [...]} of
                     {"id": "01-hook", "t0": 0.0, "t1": 2.4, "layout": "SPLIT", "face": true, "props": ["card:pricing"]}
                     (t0/t1 may be written s/e or start/end; only id, t0 and t1 are required; layout, face, props switch on
                     the rules that need them)
  talking            build/motion_mask.json, which `kit render` writes: one entry per scene with its layout (lay), start and end;
                     the face is on screen when the scene masks a face region
  depth              cuts.js, evaluated with the mode's own cut planner (node) against build/words.json; the layout is the set
                     and view named in shots/<id>.js when they are written out plainly, otherwise unknown (ADJ-SAME skips it)
  print              the print engine keeps its scene list only in the page, not in a file, so a print reel needs build/shots.json
If no shot data is found: "lint: no shot data for mode <x>, nothing checked" and exit 0. Nothing is guessed.
"""
import json, re, subprocess, sys
from pathlib import Path

from kitcore import Flags, KIT_ROOT, load_words, read_json, reel_settings

TOOL = 'lint'
FPS = 30
SHOT_MIN, SHOT_MAX = 1.0, 5.0
FACE_MAX = {'talking': 3.0}          # per mode; the default is 2.0
FACE_DEFAULT = 2.0
RHYTHM_SPREAD = 0.3
CUT_AFTER_ONSET = 2 / FPS
EPS = 0.012                          # float and rounding slack on times, a little under half a frame


# ───────────────────────────── shot data ─────────────────────────────
def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def clean_shots(rows):
    """Normalise {id, t0|s|start, t1|e|end, layout, face, props}; rows with no usable times are dropped."""
    out = []
    for n, r in enumerate(rows or []):
        if not isinstance(r, dict):
            continue
        t0 = next((x for x in (_num(r.get(k)) for k in ('t0', 's', 'start')) if x is not None), None)
        t1 = next((x for x in (_num(r.get(k)) for k in ('t1', 'e', 'end')) if x is not None), None)
        if t0 is None or t1 is None:
            continue
        props = r.get('props')
        out.append({'id': str(r.get('id', f'shot {n + 1}')), 't0': t0, 't1': t1, 'layout': r.get('layout', r.get('lay')),
                    'face': r.get('face'), 'props': [str(p) for p in props] if isinstance(props, list) else None})
    return sorted(out, key=lambda s: s['t0'])


def from_shots_json(project, mode):
    data = read_json(project / 'build' / 'shots.json')
    rows = data.get('shots') if isinstance(data, dict) else data
    return clean_shots(rows), 'build/shots.json'


def from_motion_mask(project, mode):
    if mode != 'talking':
        return [], ''
    rows = [{'id': e.get('id'), 'layout': e.get('lay'), 't0': e.get('t0'), 't1': e.get('t1'), 'face': bool(e.get('ignore'))}
            for e in (read_json(project / 'build' / 'motion_mask.json', []) or []) if isinstance(e, dict) and 'lay' in e]
    return clean_shots(rows), 'build/motion_mask.json'


DEPTH_PLAN = r"""
import { readCuts } from %s;
import fs from 'node:fs';
const [reel, words, base] = [process.argv[1], process.argv[2], process.argv[3]];
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const out = await readCuts(read(words, []), read(reel, {}), new URL(base), null);
console.log(JSON.stringify(out.cuts.map((c) => ({ id: c.id, t0: c.t0, t1: c.t1, turn: c.turn }))));
"""


def from_depth_cuts(project, mode):
    if mode != 'depth' or not (project / 'cuts.js').is_file() or not load_words(project):
        return [], ''
    runtime = (KIT_ROOT / 'modes' / 'depth' / 'runtime' / 'cutlist.js').as_uri()
    try:
        done = subprocess.run(['node', '--input-type=module', '-e', DEPTH_PLAN % json.dumps(runtime), str(project / 'reel.json'),
                               str(project / 'build' / 'words.json'), (project.as_uri() + '/')], capture_output=True, text=True, timeout=60)
        cuts = json.loads(done.stdout.strip().splitlines()[-1]) if done.returncode == 0 and done.stdout.strip() else []
    except (OSError, ValueError, subprocess.TimeoutExpired):
        cuts = []
    for c in cuts:
        src = project / 'shots' / f'{c["id"]}.js'
        text = src.read_text(encoding='utf-8', errors='replace') if src.is_file() else ''
        room = re.search(r'k\.rooms\.(\w+)\(', text)
        view = re.search(r'view\s*:\s*\(\s*\)\s*=>\s*[\'"](\w+)[\'"]', text)
        c['layout'] = f'{room.group(1)}/{view.group(1)}' if room and view else None
    return clean_shots(cuts), 'cuts.js'


def find_shots(project, mode):
    for finder in (from_shots_json, from_motion_mask, from_depth_cuts):
        shots, source = finder(project, mode)
        if shots:
            return shots, source
    return [], ''


# ───────────────────────────── the rules ─────────────────────────────
def finding(code, severity, t, message):
    return {'code': code, 'severity': severity, 'time': t, 'message': message}


def check_lengths(shots, mode):
    out, face_max = [], FACE_MAX.get(mode, FACE_DEFAULT)
    for s in shots:
        d = s['t1'] - s['t0']
        if d < SHOT_MIN - EPS or d > SHOT_MAX + EPS:
            out.append(finding('SHOT-LEN', 'error', s['t0'], f'{s["id"]} lasts {d:.2f} s (shots run {SHOT_MIN:.1f} to {SHOT_MAX:.1f} s)'))
        if s['face'] and d > face_max + EPS:
            out.append(finding('FACE-LEN', 'error', s['t0'], f'{s["id"]} shows the face for {d:.2f} s (at most {face_max:.1f} s; cut away or change the layout)'))
    return out


def check_adjacent(shots, mode):
    out, run = [], 1
    for a, b in zip(shots, shots[1:]):
        same = a['layout'] is not None and a['layout'] == b['layout']
        run = run + 1 if same else 1
        if not same:
            continue
        severity = 'error' if mode != 'talking' or run >= 3 else 'warning'
        out.append(finding('ADJ-SAME', severity, b['t0'], f'{a["id"]} and {b["id"]} both use layout {b["layout"]}'
                           + (f' ({run} in a row)' if run > 2 else '')))
    return out


def check_cuts(shots, words):
    out = []
    if not words:
        return out
    for s in shots[1:]:
        t = s['t0']
        inside = next((w for w in words if w['s'] + CUT_AFTER_ONSET + EPS < t < w['e'] - EPS), None)   # past the 2-frame allowance, before the word ends
        if inside:
            out.append(finding('CUT-WORD', 'error', t, f'the cut into {s["id"]} falls inside "{inside["w"]}" '
                               f'({inside["s"]:.2f}-{inside["e"]:.2f} s): move it into a gap, or to at most 2 frames after the word starts'))
    return out


def check_rhythm(shots):
    out, last = [], -5
    lengths = [s['t1'] - s['t0'] for s in shots]
    for i in range(len(shots) - 2):
        window = lengths[i:i + 3]
        if max(window) - min(window) <= RHYTHM_SPREAD + 1e-9:
            if last != i - 1:                          # one finding per run of even shots
                out.append(finding('RHYTHM', 'error', shots[i]['t0'], f'{shots[i]["id"]}, {shots[i + 1]["id"]}, {shots[i + 2]["id"]} are '
                                   f'{window[0]:.2f}, {window[1]:.2f}, {window[2]:.2f} s: vary one of them by more than {RHYTHM_SPREAD} s'))
            last = i
    return out


def check_devices(shots):
    out = []
    named = [set(s['props'] or []) for s in shots]
    reported = set()
    for i in range(len(shots) - 2):
        for p in named[i] & named[i + 1] & named[i + 2]:
            if (p, i - 1) in reported:
                reported.add((p, i))
                continue
            reported.add((p, i))
            out.append(finding('DEVICE-REPEAT', 'warning', shots[i]['t0'], f'"{p}" is used in {shots[i]["id"]}, {shots[i + 1]["id"]} and '
                               f'{shots[i + 2]["id"]}: give one of them a different prop'))
    return out


def check_first_move(project, video_arg, mode):
    """Frame differences on the first second at 30 fps (pace.py reads 10 fps for the whole reel; the opening needs finer steps)."""
    try:
        import numpy as np
        from pace import MaskPlan, newest_render
    except ImportError:
        return [finding('FIRST-MOVE', 'note', 0.0, 'skipped: numpy is not installed (pip3 install numpy)')]
    video = newest_render(project, video_arg)
    if not video or not Path(video).exists():
        return [finding('FIRST-MOVE', 'note', 0.0, 'skipped: nothing rendered yet (run kit render first)')]
    w, h = 108, 192
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-t', '1', '-i', str(video), '-vf', f'fps={FPS},scale={w}:{h},format=gray', '-f', 'rawvideo', '-'],
                         capture_output=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32) if raw else np.zeros((0, h, w), np.float32)
    if len(frames) < 4:
        return [finding('FIRST-MOVE', 'note', 0.0, 'skipped: the video is shorter than 4 frames')]
    counted = MaskPlan(project, w, h).at(0)[0]
    steps = [float(np.abs(frames[n + 1] - frames[n])[counted].mean()) for n in range(len(frames) - 1)]
    early = max(steps[:4])                             # frames 0-4, the first 0.13 s
    if early < 0.5:
        late = max(steps)
        tail = f' (it first moves at {steps.index(late) / FPS:.2f} s)' if late >= 0.5 else ' (and the whole first second stays still)'
        return [finding('FIRST-MOVE', 'error', 0.0, f'the first frames are still{tail}: start something moving on frame 0 (a drop, a slam, a wipe, a count)')]
    return []


def lint(project, mode, shots, words, video_arg=None):
    found = check_lengths(shots, mode) + check_adjacent(shots, mode) + check_cuts(shots, words) + check_rhythm(shots) + check_devices(shots)
    found += check_first_move(project, video_arg, mode)
    return sorted(found, key=lambda f: (f['time'], f['code']))


def main():
    flags = Flags()
    args = flags.positional()
    if not args:
        print(__doc__)
        raise SystemExit(1)
    project = Path(args[0]).resolve()
    if not (project / 'reel.json').is_file():
        sys.exit(f'{TOOL}: {project} has no reel.json, so it is not a reel')
    mode = reel_settings(project).get('style', 'print')
    shots, source = find_shots(project, mode)
    if not shots:
        print(f'lint: no shot data for mode {mode}, nothing checked')
        return
    found = lint(project, mode, shots, load_words(project), args[1] if len(args) > 1 else None)
    print(f'lint ({mode} · {len(shots)} shots from {source})')
    for f in found:
        print(f'{f["code"]:<14}{f["severity"]:<9}{f["time"]:6.2f}s  {f["message"]}')
    errors = sum(f['severity'] == 'error' for f in found)
    warnings = sum(f['severity'] == 'warning' for f in found)
    print(f'lint: {errors} error(s), {warnings} warning(s)' if found else 'lint: clean')
    sys.exit(3 if errors else 0)


if __name__ == '__main__':
    main()
