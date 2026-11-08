#!/usr/bin/env python3
"""Measure a rendered reel: facts only, no judgement and no prediction.

  python3 tools/measure.py <project> [video.mp4]      (default: the newer of build/video.mp4 and build/draft.mp4)

Writes build/measure.json and up to 4 contact sheets in build/measure/ (the first 3 s, two sheets of body frames just
after cuts, the last 3 s) for a reviewer to look at. Uses ffmpeg, ffprobe, numpy and build/words.json (it never runs a
transcriber, and it makes no network calls).

What is measured
  length, words per second (overall and first 5 s), time of the first spoken word
  loudness: integrated LUFS and short-term loudness range (ebur128)
  silence: stretches under -45 dB lasting 0.6 s or more
  scene cuts: ffmpeg scene filter, threshold SCENE_THRESHOLD, with their times and a count per minute
  movement: how much of the picture changes, per second (read at 10 fps, small, grey, like pace.py)
  static stretches: 2 s or more with little change; how many and the longest
  opening: movement in the first 3 s against the rest; time of the first strong change
"""
import json, re, subprocess, sys, tempfile
from pathlib import Path
import numpy as np

from kitcore import Flags, fail, grey_frames, load_words, media_length
from pace import HIT_LEVEL, newest_render, runs_below

TOOL = 'measure'
SCENE_THRESHOLD = 0.3        # ffmpeg scene score above this counts as a cut
SILENCE_DB = -45
SILENCE_MIN_S = 0.6
STATIC_LEVEL = 1.0           # per-frame change (grey levels, 0 to 255) under this counts as still
STATIC_MIN_S = 2.0


def has_audio(video):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index',
                          '-of', 'csv=p=0', str(video)], capture_output=True, text=True).stdout.strip()
    return bool(out)


def run_filter(video, flt, kind):
    """Run an ffmpeg filter to null and return its log text."""
    flag = '-af' if kind == 'a' else '-vf'
    done = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(video), flag, flt, '-f', 'null', '-'],
                          capture_output=True, text=True)
    return done.stderr


def loudness(video):
    log = run_filter(video, 'ebur128', 'a')
    tail = log.split('Summary:')[-1]
    lufs = re.search(r'I:\s+(-?[\d.]+)\s+LUFS', tail)
    lra = re.search(r'LRA:\s+(-?[\d.]+)\s+LU', tail)
    return (float(lufs.group(1)) if lufs else None), (float(lra.group(1)) if lra else None)


def silences(video, length):
    log = run_filter(video, f'silencedetect=n={SILENCE_DB}dB:d={SILENCE_MIN_S}', 'a')
    starts = [float(x) for x in re.findall(r'silence_start: (-?[\d.]+)', log)]
    ends = [float(x) for x in re.findall(r'silence_end: (-?[\d.]+)', log)]
    out = []
    for n, a in enumerate(starts):
        b = ends[n] if n < len(ends) else length
        out.append([round(max(0.0, a), 2), round(min(b, length), 2)])
    return out


def scene_cuts(video):
    log = run_filter(video, f"select='gt(scene,{SCENE_THRESHOLD})',showinfo", 'v')
    return [round(float(t), 2) for t in re.findall(r'pts_time:(-?[\d.]+)', log) if float(t) > 0.05]


def sheet(video, out, start, span, cols, step_fps, width=216):
    tmp = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{start:.2f}', '-t', f'{span:.2f}',
                          '-i', str(video), '-vf', f'fps={step_fps},scale={width}:-2,tile={cols}x1', '-frames:v', '1',
                          '-q:v', '4', str(out)], capture_output=True, text=True)
    return out.exists() and tmp.returncode == 0


def frames_sheet(video, times, out, cols, width=216):
    """One tiled jpg with a frame at each time (single-frame seeks, then ffmpeg tile)."""
    with tempfile.TemporaryDirectory() as tmp:
        for n, t in enumerate(times):
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{t:.2f}', '-i', str(video),
                            '-frames:v', '1', '-vf', f'scale={width}:-2', f'{tmp}/f{n:02d}.jpg'], capture_output=True)
        rows = -(-len(times) // cols)
        done = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', '1', '-i', f'{tmp}/f%02d.jpg',
                               '-vf', f'tile={cols}x{rows}', '-frames:v', '1', '-q:v', '4', str(out)], capture_output=True)
    return out.exists() and done.returncode == 0


def make_sheets(video, outdir, length, cuts):
    outdir.mkdir(parents=True, exist_ok=True)
    for old in outdir.glob('*.jpg'):
        old.unlink()
    made = {}
    if sheet(video, outdir / 'first3s.jpg', 0, min(3.0, length), 7, 2):
        made['first_3s'] = 'first3s.jpg'
    body = [min(c + 0.1, length - 0.05) for c in cuts if 3.0 < c < length - 3.0]
    if not body:                                         # no cuts found: sample the body evenly instead
        span = max(0.0, length - 6.0)
        body = [3.0 + span * (k + 0.5) / 12 for k in range(12)] if span > 1 else []
    if len(body) > 24:
        body = [body[int(i * len(body) / 24)] for i in range(24)]
    for n, chunk in enumerate([body[:12], body[12:24]], 1):
        if chunk and frames_sheet(video, chunk, outdir / f'body_{n}.jpg', min(6, len(chunk))):
            made[f'body_{n}'] = f'body_{n}.jpg'
            made[f'body_{n}_times_s'] = [round(t, 2) for t in chunk]
    if length > 3.5 and sheet(video, outdir / 'last3s.jpg', max(0.0, length - 3.0), 3.0, 7, 2):
        made['last_3s'] = 'last3s.jpg'
    return made


def measure(project, video):
    length = media_length(video)
    if length <= 0:
        fail(TOOL, f'could not read the length of {video}')
    words = load_words(project)
    starts = sorted(w['s'] for w in words)
    first_word = starts[0] if starts else None
    wps = len(words) / length if words else None
    wps5 = sum(1 for s in starts if s < 5) / min(5.0, length) if words else None

    audio = has_audio(video)
    lufs, lra = loudness(video) if audio else (None, None)
    quiet = silences(video, length) if audio else []
    quiet_total = sum(b - a for a, b in quiet)

    cuts = scene_cuts(video)

    frames = grey_frames(video, 108, 192)
    if len(frames) < 3:
        fail(TOOL, 'the video is too short to measure')
    per_frame = np.abs(np.diff(frames, axis=0)).mean(axis=(1, 2))
    times = np.arange(1, len(frames)) / 10
    seconds = int(np.ceil(len(per_frame) / 10))
    per_second = [round(float(per_frame[i * 10:(i + 1) * 10].mean()), 2) for i in range(seconds)]
    still = [(float(a), float(b)) for a, b in runs_below(per_frame, STATIC_LEVEL, times) if b - a >= STATIC_MIN_S]
    first3 = per_frame[:30]
    rest = per_frame[30:]
    strong = np.flatnonzero(per_frame > HIT_LEVEL)
    first_change = round(float(times[strong[0]]), 2) if len(strong) else None
    e3 = float(first3.mean())
    erest = float(rest.mean()) if len(rest) else e3

    facts = {
        'video': str(video.name),
        'duration_s': round(length, 2),
        'words': len(words),
        'words_per_s': None if wps is None else round(wps, 2),
        'words_per_s_first5': None if wps5 is None else round(wps5, 2),
        'first_word_s': None if first_word is None else round(float(first_word), 2),
        'loudness_lufs': lufs,
        'loudness_range_lu': lra,
        'silence_stretches': quiet,
        'silence_total_s': round(quiet_total, 2),
        'silence_share': round(quiet_total / length, 3),
        'scene_threshold': SCENE_THRESHOLD,
        'cuts_s': cuts,
        'cuts_per_min': round(len(cuts) / length * 60, 1),
        'energy_per_s': per_second,
        'energy_mean': round(float(per_frame.mean()), 2),
        'static_threshold': STATIC_LEVEL,
        'static_min_s': STATIC_MIN_S,
        'static_stretches': [[round(a, 1), round(b, 1)] for a, b in still],
        'static_count': len(still),
        'static_longest_s': round(max([b - a for a, b in still], default=0.0), 1),
        'static_share': round(sum(b - a for a, b in still) / length, 3),
        'energy_first3': round(e3, 2),
        'energy_rest': round(erest, 2),
        'energy_first3_ratio': round(e3 / erest, 2) if erest > 1e-6 else None,
        'first_strong_change_s': first_change,
        'strong_change_level': HIT_LEVEL,
        'has_audio': audio,
        'has_words_json': bool(words),
    }
    facts['sheets'] = make_sheets(video, project / 'build' / 'measure', length, cuts)
    return facts


def say(f):
    def v(x, unit=''):
        return 'n/a' if x is None else f'{x}{unit}'
    print(f"measure: {f['video']}  {f['duration_s']} s  (facts only, no prediction)")
    print(f"  words/s {v(f['words_per_s'])}   first 5 s {v(f['words_per_s_first5'])}   first word at {v(f['first_word_s'], ' s')}")
    print(f"  loudness {v(f['loudness_lufs'], ' LUFS')}   short-term range {v(f['loudness_range_lu'], ' LU')}")
    print(f"  silence {f['silence_total_s']} s in {len(f['silence_stretches'])} stretches (under {SILENCE_DB} dB, {SILENCE_MIN_S} s or more)")
    print(f"  cuts {len(f['cuts_s'])}  ({f['cuts_per_min']}/min, scene threshold {SCENE_THRESHOLD})")
    print(f"  movement mean {f['energy_mean']}   first 3 s {f['energy_first3']} vs rest {f['energy_rest']}   first strong change at {v(f['first_strong_change_s'], ' s')}")
    print(f"  static stretches (2 s or more): {f['static_count']}, longest {f['static_longest_s']} s  {f['static_stretches']}")
    if f['sheets']:
        print('  contact sheets: build/measure/' + ', '.join(v for k, v in f['sheets'].items() if isinstance(v, str)))


def run(project, given=None):
    project = Path(project).resolve()
    video = newest_render(project, given)
    if not video or not video.exists():
        fail(TOOL, 'nothing rendered yet: run  kit render <project>  first (or pass a video file)')
    facts = measure(project, video)
    (project / 'build').mkdir(parents=True, exist_ok=True)
    (project / 'build' / 'measure.json').write_text(json.dumps(facts, indent=1), encoding='utf-8')
    return facts


def main():
    args = Flags().positional()
    if not args:
        print(__doc__)
        raise SystemExit(1)
    say(run(args[0], args[1] if len(args) > 1 else None))


if __name__ == '__main__':
    main()
