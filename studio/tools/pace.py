#!/usr/bin/env python3
"""Pace check: does the rendered reel keep moving, or does it sit still where viewers scroll away?

  python3 tools/pace.py <project> [video.mp4]      (default: the newer of build/video.mp4 and build/draft.mp4)

How it looks: the video is read at 10 frames a second, small and grey. Between neighbouring frames it measures
  energy    how much of the picture changes, on average
  hits/s    strong changes per second (cuts, slams, whips, reveals)
  still     1.5 s windows where almost nothing changes
Each mode has its own bar (see BARS). The talking mode has a separate four-part bar measured on the graphics only.
Regions a mode declares as background motion (the host's idle loop, a face take) are left out: the page lists them as
window.studio.quiet and `kit render` saves it to build/motion_mask.json as [{"t0": s, "ignore": [[x, y, w, h], ...], "keep": [...]}].
"""
from pathlib import Path
import sys
import numpy as np

from kitcore import Flags, fail, grey_frames, load_words, read_json, reel_settings, spoken_between

TOOL = 'pace'

# mode: energy at least, hits per second at least, a window counts as still below this, share of still windows allowed
BARS = {'print': (4.8, 0.65, 2.0, 0.27), 'depth': (11.0, 3.5, 3.0, 0.08)}
HIT_LEVEL = 12               # a frame-to-frame change this big is a "hit"
WINDOW = 15                  # 1.5 s at 10 fps

# talking reels: a change at least every 0.47 s, 92 % of frames moving, 78 % of changes on a spoken word, no hold of 0.8 s.
# Measured at 180x320. A pixel changes when it moves more than 24 grey levels; inside the masked face area only near-total
# changes (> 90: captions, stickers) count, so the face moving on its own can never pass the bar.
TALK = dict(every=0.47, moving=0.92, on_word=0.78, hold=0.8, event_share=0.45, moving_level=0.12, px=24, face_px=90,
            event_gap=0.3, min_area=0.35)


def newest_render(project, given):
    if given:
        return Path(given)
    renders = [f for f in (project / 'build' / 'video.mp4', project / 'build' / 'draft.mp4') if f.exists()]
    return max(renders, key=lambda f: f.stat().st_mtime) if renders else None


class MaskPlan:
    """build/motion_mask.json → per-time pixel masks at a given analysis size."""
    def __init__(self, project, w, h):
        self.w, self.h = w, h
        self.entries = read_json(project / 'build' / 'motion_mask.json', []) or []
        self.cache = [self._build(e) for e in self.entries]

    def _box(self, r):
        k = self.w / 1080
        ys = slice(max(0, int(r[1] * k)), max(0, int((r[1] + r[3]) * k + 0.999)))
        xs = slice(max(0, int(r[0] * k)), max(0, int((r[0] + r[2]) * k + 0.999)))
        return ys, xs

    def _build(self, entry):
        counted = np.ones((self.h, self.w), bool)
        for r in entry.get('ignore', []):
            counted[self._box(r)] = False
        rescued = np.zeros((self.h, self.w), bool)
        for r in entry.get('keep', []):
            rescued[self._box(r)] = True
        return counted, rescued & ~counted

    def index(self, t):
        pick = 0
        for n, e in enumerate(self.entries):
            if t >= e.get('t0', 0) - 1e-3:
                pick = n
        return pick

    def at(self, t):
        return self.cache[self.index(t)] if self.cache else (np.ones((self.h, self.w), bool), np.zeros((self.h, self.w), bool))


def runs_below(values, level, times):
    """[(start, end)] of stretches where values stay under level."""
    out, start = [], None
    for t, v in zip(times, values):
        if v < level:
            start = t if start is None else start
        elif start is not None:
            out.append((start, t))
            start = None
    if start is not None:
        out.append((start, times[-1] + 0.1))
    return out


def check_talking(project, video):
    frames = grey_frames(video, 180, 320)
    if len(frames) < 15:
        fail(TOOL, 'the video is too short to judge')
    plan = MaskPlan(project, 180, 320)
    if not plan.entries:
        print('  (no build/motion_mask.json yet: render with kit render first; the face is counted too)')
    whole = (np.ones((320, 180), bool), np.zeros((320, 180), bool))
    energy, share = [], []
    for n in range(len(frames) - 1):
        ta, tb = n / 10, (n + 1) / 10
        counted, rescued = plan.at(tb) if plan.entries and plan.index(ta) == plan.index(tb) else whole   # a cut counts in full
        diff = np.abs(frames[n + 1] - frames[n])
        used = diff * counted + diff * (rescued & (diff > TALK['face_px']))
        area = max(counted.sum() + rescued.sum(), TALK['min_area'] * 320 * 180)
        energy.append(used.sum() / area)
        share.append((used > TALK['px']).sum() / area * 100)
    energy, share = np.array(energy), np.array(share)
    times = np.arange(1, len(frames)) / 10
    length = len(frames) / 10

    changes, last = [], -9.0
    for t, s in zip(times, share):
        if s >= TALK['event_share'] and t - last >= TALK['event_gap']:
            changes.append(float(t))
            last = t
    holds = [(a, b) for a, b in runs_below(energy, TALK['moving_level'], times) if b - a >= TALK['hold']]
    words = load_words(project)
    on_word = [c for c in changes if any(abs(c - w['s']) <= 0.15 for w in words)]
    every = length / max(1, len(changes))
    moving = float((energy >= TALK['moving_level']).mean())
    word_share = len(on_word) / max(1, len(changes))

    print(f'pace check (talking · {video.name} · {length:.1f} s · graphics and captions only, the face is masked)')
    rows = [(every <= TALK['every'], 'a change every', f'{every:.2f} s', f'≤ {TALK["every"]} s'),
            (moving >= TALK['moving'], 'frames moving', f'{moving * 100:.0f} %', f'≥ {TALK["moving"] * 100:.0f} %'),
            (word_share >= TALK['on_word'], 'changes on a word', f'{word_share * 100:.0f} %', f'≥ {TALK["on_word"] * 100:.0f} %'),
            (not holds, 'holds ≥ 0.8 s', str(len(holds)), '0')]
    for good, label, value, target in rows:
        print(f'  {"✓" if good else "✗"} {label:<18} {value:<10} target {target}')
    for a, b in holds[:10]:
        print(f'    hold {a:5.1f}-{b:5.1f}s  "{spoken_between(words, a, b)}"   (give it a beat: a pop, a count, a new card, a slider)')
    gaps = sorted(((b - a, a, b) for a, b in zip(changes, changes[1:]) if b - a >= 0.9), reverse=True)
    if gaps:
        print('  longest stretches with no change:')
        for g, a, b in gaps[:8]:
            print(f'    {g:4.2f}s  {a:5.1f}-{b:5.1f}s  "{spoken_between(words, a, b)}"')
    off = [c for c in changes if c not in on_word]
    if off:
        print('  changes that miss a word: ' + ' '.join(f'{c:.1f}' for c in off[:20]))
    passed = all(r[0] for r in rows)
    print('PASS' if passed else 'BELOW THE BAR: see modes/talking/GUIDE.md (pacing bar)')
    return 0 if passed else 3


def check_motion(project, video, mode, reel):
    frames = grey_frames(video, 108, 192)
    if len(frames) < 16:
        fail(TOOL, 'the video is too short to judge')
    plan = MaskPlan(project, 108, 192)
    times = np.arange(1, len(frames)) / 10
    diffs = np.abs(np.diff(frames, axis=0))
    if plan.entries:
        energy = np.array([d[plan.at(t)[0]].mean() for d, t in zip(diffs, times)])
    else:
        counted = np.ones((192, 108), bool)
        if mode == 'print' and reel.get('host', reel.get('presenter', True)) is not False:
            counted[130:, 70:] = False      # older print pages without a mask: the host corner (bottom-right) idles on its own
        energy = diffs[:, counted].mean(axis=1)
    min_energy, min_hits, still_level, still_share = BARS.get(mode, BARS['print'])
    level = float(energy.mean())
    hits = float((energy > HIT_LEVEL).sum() / (len(energy) / 10))
    rolling = np.convolve(energy, np.ones(WINDOW) / WINDOW, 'valid')
    still = rolling < still_level
    still_frac = float(still.mean())

    print(f'pace check ({mode} · {video.name} · {len(energy) / 10:.1f} s)')
    print(f'  energy {level:5.2f}   bar ≥ {min_energy}   {"✓" if level >= min_energy else "✗ too calm"}')
    print(f'  hits/s {hits:5.2f}   bar ≥ {min_hits}   {"✓" if hits >= min_hits else "✗ too few strong moments (cuts, slams, reveals, whips)"}')
    print(f'  still  {still_frac * 100:4.0f}%   bar ≤ {still_share * 100:.0f}%  {"✓" if still_frac <= still_share else "✗ too many still stretches"}')
    spans = []
    for n in np.flatnonzero(still):
        a, b = n / 10, (n + WINDOW) / 10
        if spans and a <= spans[-1][1]:
            spans[-1][1] = b
        else:
            spans.append([a, b])
    words = load_words(project)
    if spans:
        print('  still stretches (add a build-up, a secondary motion or a camera move here):')
        for a, b in spans[:12]:
            print(f'    {a:5.1f}-{b:5.1f}s  "{spoken_between(words, a + 0.05, b)}"')
    else:
        print('  no still stretches ✓')
    passed = level >= min_energy and hits >= min_hits and still_frac <= still_share
    print('PASS' if passed else f'BELOW THE BAR: see modes/{mode}/GUIDE.md (quality bar)')
    return 0 if passed else 3


def main():
    flags = Flags()
    args = flags.positional()
    if not args:
        print(__doc__)
        raise SystemExit(1)
    project = Path(args[0]).resolve()
    reel = reel_settings(project)
    mode = reel.get('style', 'print')
    video = newest_render(project, args[1] if len(args) > 1 else None)
    if not video or not video.exists():
        fail(TOOL, 'nothing rendered yet: run  kit render <project>  first')
    sys.exit(check_talking(project, video) if mode == 'talking' else check_motion(project, video, mode, reel))


if __name__ == '__main__':
    main()
