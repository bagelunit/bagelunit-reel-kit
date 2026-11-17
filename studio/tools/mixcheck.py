#!/usr/bin/env python3
"""Sound design check: is the mix of a finished reel clean? Uses only ffmpeg and ffprobe (no numpy, no key, no network).

  python3 ~/.claude/skills/bagelunit-reels/tools/mixcheck.py <reel folder | slug> [video.mp4]
  python3 mixcheck.py <video.mp4>            a bare mp4 (no ducking check: it needs the reel's voice timing)
  python3 mixcheck.py --selftest             builds a tiny test file with ffmpeg and checks the checks (SKIPPED without ffmpeg)

Prints PASS / WARN / FAIL / SKIPPED (and INFO) lines and writes build/mix.json (next to the reel; for a bare mp4, mix.json beside it).
  loudness     integrated LUFS -15 to -9 PASS, -16 to -8 WARN, else FAIL; true peak above -1 dBTP FAIL (the same bar as qa.py)
  range        loudness range (LRA, LU): over 12 WARN (a mix that jumps between loud and quiet is hard to hear on a phone)
  clipping     sample peak at or above -0.1 dBFS WARN, at full scale (-0.01 or higher) FAIL
  silence      a gap in the sound longer than 1.5 s WARN (a hold at the very end is not counted)
  ducking      only when build/music.json or build/sfx.json exists: the level of the bed in the gaps between words against the voice.
               The bed is not a separate track in the mix, so this measures the mix in the gaps (bed + effects, an upper bound for the
               bed under speech) against the mix while words are spoken. Margin 12 dB or more PASS, 6 to 12 WARN, under 6 FAIL.
               These two limits are this tool's own rule of thumb, not a platform rule.
  earshot      optional: SKIPPED unless the earshot Python tool or skill is installed, never needed.
Exit code: 0 all PASS or WARN or SKIPPED, 1 any FAIL, 2 could not run (no ffmpeg or no video).
"""
import array
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

LUFS_PASS = (-15.0, -9.0)
LUFS_WARN = (-16.0, -8.0)
TP_MAX = -1.0
LRA_WARN = 12.0
CLIP_WARN, CLIP_FAIL = -0.1, -0.01
GAP_S = 1.5
DUCK_PASS, DUCK_WARN = 12.0, 6.0
RATE = 16000
WIN = 0.05


def ff_log(path, af):
    cmd = ['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-vn', '-af', af, '-f', 'null', '-']
    return subprocess.run(cmd, capture_output=True, text=True).stderr


def duration_of(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return 0.0


def has_audio(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True).stdout
    return 'audio' in out


def loudness(path):
    log = ff_log(path, 'ebur128=peak=true')
    summ = log[log.rfind('Summary:'):] if 'Summary:' in log else ''
    mi = re.search(r'I:\s+(-?[\d.]+) LUFS', summ)
    mr = re.search(r'LRA:\s+(-?[\d.]+) LU', summ)
    mp = re.search(r'True peak:.*?Peak:\s+(-?[\d.]+|-inf) dBFS', summ, re.S)
    if not (mi and mp):
        return None
    tp = float('-inf') if mp.group(1) == '-inf' else float(mp.group(1))
    return {'lufs': float(mi.group(1)), 'lra': float(mr.group(1)) if mr else None, 'true_peak_db': tp}


def sample_peak(path):
    log = ff_log(path, 'astats=metadata=0:reset=0')
    m = re.findall(r'Peak level dB:\s+(-?[\d.]+|-inf)', log)
    if not m:
        return None
    vals = [float('-inf') if v == '-inf' else float(v) for v in m]
    return max(vals)


def silences(path, total):
    log = ff_log(path, f'silencedetect=n=-50dB:d={GAP_S}')
    starts = [float(x) for x in re.findall(r'silence_start: (-?[\d.]+)', log)]
    ends = [float(x) for x in re.findall(r'silence_end: (-?[\d.]+)', log)]
    out = []
    for i, a in enumerate(starts):
        a = max(0.0, a)
        b = ends[i] if i < len(ends) else total
        out.append((a, b))
    return out


def pcm_rms(path):
    """Mono 16 kHz samples -> a list of RMS (dB) per 50 ms window."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-vn', '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'],
                         capture_output=True).stdout
    a = array.array('f')
    a.frombytes(raw[:len(raw) - len(raw) % 4])
    n = int(RATE * WIN)
    out = []
    for i in range(0, len(a) - n + 1, n):
        s = sum(x * x for x in a[i:i + n]) / n
        out.append(10 * math.log10(s) if s > 1e-12 else -120.0)
    return out


def speech_windows(reel, n_windows):
    """A True/False per 50 ms window: is a word being spoken. From build/words.json, else None."""
    try:
        words = json.loads((reel / 'build' / 'words.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None
    spans = sorted((float(w['s']), float(w['e'])) for w in words if isinstance(w, dict) and 's' in w and 'e' in w)
    if not spans:
        return None
    merged = [list(spans[0])]
    for s, e in spans[1:]:
        if s - merged[-1][1] < 0.3:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    mask = [False] * n_windows
    for s, e in merged:
        for i in range(int(s / WIN), min(n_windows, int(e / WIN) + 1)):
            mask[i] = True
    return mask


def ducking(video, reel):
    """(status, message, data). Needs the reel folder (words.json) and a music or sfx record."""
    if reel is None:
        return 'SKIPPED', 'a bare video has no reel folder, so no word timing to compare against', {}
    has_rec = any((reel / 'build' / f).is_file() for f in ('music.json', 'sfx.json'))
    if not has_rec:
        return 'SKIPPED', 'no build/music.json or build/sfx.json: voice only, nothing to duck', {}
    rms = pcm_rms(video)
    mask = speech_windows(reel, len(rms))
    if mask is None:
        return 'SKIPPED', 'no build/words.json to tell where words are spoken', {}
    sp = [r for r, m in zip(rms, mask) if m and r > -100]
    gap = [r for r, m in zip(rms, mask) if not m]
    # a gap window of true silence (digital zero) carries no bed: leave those out, they belong to the silence check
    gap = [r for r in gap if r > -100]
    if len(sp) < 10 or len(gap) < 10:
        return 'SKIPPED', f'too little to compare ({len(sp)} speech and {len(gap)} gap windows of {int(WIN * 1000)} ms)', {}

    def avg_db(v):
        return 10 * math.log10(sum(10 ** (x / 10) for x in v) / len(v))
    s_db, g_db = avg_db(sp), avg_db(gap)
    margin = s_db - g_db
    data = {'speech_db': round(s_db, 1), 'gap_db': round(g_db, 1), 'margin_db': round(margin, 1)}
    status = 'PASS' if margin >= DUCK_PASS else 'WARN' if margin >= DUCK_WARN else 'FAIL'
    note = f'speech {s_db:.1f} dB, gaps {g_db:.1f} dB (the bed and effects), voice stands {margin:.1f} dB above the gap level'
    if status != 'PASS':
        note += f' (want {DUCK_PASS:.0f} or more: lower the bed, `gain_db` in reel.json music, or duck harder)'
    return status, note, data


def earshot_line():
    try:
        import earshot  # noqa: F401
        return 'INFO', 'the earshot Python package is installed: ask Claude to run its measure and realness tools on this file for a describe line (not run here)'
    except Exception:
        pass
    if (Path.home() / '.claude' / 'skills' / 'earshot').is_dir():
        return 'INFO', 'the earshot skill is installed: ask Claude to run its measure and realness tools on this file for a describe line (not run here)'
    return 'SKIPPED', 'earshot is not installed (optional, not needed)'


def find_video(arg, extra):
    p = Path(extra) if extra else None
    if p:
        return p
    a = Path(arg)
    if a.is_file():
        return a
    return None


def pick_in_reel(reel):
    outs = sorted((reel / 'out').glob('*.mp4'), key=lambda f: f.stat().st_mtime, reverse=True) if (reel / 'out').is_dir() else []
    if outs:
        return outs[0]
    d = reel / 'build' / 'draft.mp4'
    return d if d.is_file() else None


def run(reel, video):
    results = []

    def add(name, status, msg, **data):
        results.append({'check': name, 'status': status, 'message': msg, **data})
        print(f'{status:8} {name:10} {msg}')

    print(f'mixcheck: {video}')
    if not has_audio(video):
        add('loudness', 'FAIL', 'no audio stream to measure')
        return results
    total = duration_of(video)
    m = loudness(video)
    if not m:
        add('loudness', 'FAIL', 'ffmpeg ebur128 gave no readable summary')
    else:
        lufs, tp = m['lufs'], m['true_peak_db']
        status, notes = 'PASS', []
        if not LUFS_PASS[0] <= lufs <= LUFS_PASS[1]:
            status = 'WARN' if LUFS_WARN[0] <= lufs <= LUFS_WARN[1] else 'FAIL'
            notes.append('target -15 to -9')
        if tp > TP_MAX:
            status = 'FAIL'
            notes.append('true peak above -1 dBTP')
        add('loudness', status, f'{lufs:.1f} LUFS, true peak {tp:.1f} dBTP' + (f' ({"; ".join(notes)})' if notes else ''), lufs=lufs, true_peak_db=tp)
        lra = m['lra']
        if lra is not None:
            add('range', 'WARN' if lra > LRA_WARN else 'PASS', f'loudness range {lra:.1f} LU' + (f' (over {LRA_WARN:.0f}: the level jumps about)' if lra > LRA_WARN else ''), lra=lra)
    pk = sample_peak(video)
    if pk is None:
        add('clipping', 'SKIPPED', 'ffmpeg gave no peak level')
    else:
        st = 'FAIL' if pk >= CLIP_FAIL else 'WARN' if pk >= CLIP_WARN else 'PASS'
        add('clipping', st, f'sample peak {pk:.2f} dBFS' + ('' if st == 'PASS' else ' (touching full scale: lower the master)'), sample_peak_db=pk)
    gaps = [(a, b) for a, b in silences(video, total) if b - a > GAP_S]
    tail = [g for g in gaps if total and total - g[1] < 0.05]
    inner = [g for g in gaps if g not in tail]
    spans = ', '.join(f'{a:.1f}-{b:.1f}s' for a, b in inner[:6])
    add('silence', 'WARN' if inner else 'PASS',
        (f'{len(inner)} gap(s) over {GAP_S}s: {spans}' if inner else f'no silence gap over {GAP_S}s') + (' (a silent tail is not counted)' if tail else ''),
        gaps=[[round(a, 2), round(b, 2)] for a, b in inner])
    st, msg, data = ducking(video, reel)
    add('ducking', st, msg, **data)
    st, msg = earshot_line()
    add('earshot', st, msg)
    return results


def selftest():
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        print('SKIPPED mixcheck selftest: ffmpeg or ffprobe not found')
        return 0
    bad = 0
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        good = td / 'good.mp4'
        # a steady tone near -12 LUFS, then a tone with a 3 s hole, then a tone pushed into the limiter
        mk = lambda out, af: subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-f', 'lavfi', '-i',
                                              'sine=frequency=300:sample_rate=48000:duration=6', '-filter_complex', af, '-map', '[a]', '-t', '6',
                                              '-c:a', 'aac', str(out)], capture_output=True, text=True)
        r = mk(good, '[1:a]volume=10dB[a]')
        if r.returncode:
            print('SKIPPED mixcheck selftest: this ffmpeg could not make the test file: ' + r.stderr.strip()[-120:])
            return 0
        res = {x['check']: x for x in run(None, good)}
        if res['loudness']['status'] not in ('PASS', 'WARN', 'FAIL') or 'lufs' not in res['loudness']:
            print('FAIL selftest: no loudness number'); bad += 1
        if res['silence']['status'] != 'PASS':
            print('FAIL selftest: a steady tone should have no silence gap'); bad += 1
        if res['ducking']['status'] != 'SKIPPED':
            print('FAIL selftest: a bare video should skip ducking'); bad += 1
        gap = td / 'gap.mp4'
        mk(gap, '[1:a]volume=10dB,atrim=0:1.5,asetpts=N/SR/TB[x];anullsrc=r=48000:cl=mono,atrim=0:3[s];[1:a]volume=10dB,atrim=0:1.5,asetpts=N/SR/TB[y];[x][s][y]concat=n=3:v=0:a=1[a]')
        res = {x['check']: x for x in run(None, gap)}
        if res['silence']['status'] != 'WARN':
            print('FAIL selftest: a 3 s silent gap should WARN'); bad += 1
        hot = td / 'hot.mp4'
        mk(hot, '[1:a]volume=30dB,alimiter=limit=1:level=disabled[a]')
        res = {x['check']: x for x in run(None, hot)}
        if res['loudness']['status'] != 'FAIL':
            print('FAIL selftest: a very hot tone should FAIL loudness'); bad += 1
        # ducking on a reel folder: words at 0-2 s loud, bed only after; plus a music.json record
        reel = td / 'reel'
        (reel / 'build').mkdir(parents=True)
        (reel / 'build' / 'music.json').write_text('[]')
        (reel / 'build' / 'words.json').write_text(json.dumps([{'w': 'a', 's': 0.0, 'e': 3.0}]))
        duck = reel / 'build' / 'd.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=300:sample_rate=48000:duration=3',
                        '-f', 'lavfi', '-i', 'sine=frequency=500:sample_rate=48000:duration=3', '-filter_complex',
                        '[0:a]volume=-10dB[v];[1:a]volume=-40dB[b];[v][b]concat=n=2:v=0:a=1[a]', '-map', '[a]', '-c:a', 'aac', str(duck)], capture_output=True)
        res = {x['check']: x for x in run(reel, duck)}
        if res['ducking']['status'] != 'PASS':
            print('FAIL selftest: voice 30 dB above the bed should PASS ducking: ' + res['ducking']['message']); bad += 1
    print('mixcheck selftest: ' + ('FAIL' if bad else 'OK'))
    return 1 if bad else 0


def main(argv):
    if '--selftest' in argv:
        return selftest()
    args = [a for a in argv if not a.startswith('--')]
    if not args:
        print(__doc__)
        return 2
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        print('mixcheck: ffmpeg and ffprobe are needed (install ffmpeg)')
        return 2
    target = Path(args[0]).expanduser()
    reel = None
    video = None
    if len(args) > 1:
        video = Path(args[1]).expanduser()
        reel = target if target.is_dir() else None
    elif target.is_file():
        video = target
    else:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        try:
            from kitcore import resolve_reel
            target = resolve_reel(args[0])
        except Exception:
            pass
        if target.is_dir():
            reel = target
            video = pick_in_reel(reel)
    if video is None or not video.is_file():
        print(f'mixcheck: no video found for "{args[0]}" (give an mp4, or a reel folder with out/*.mp4 or build/draft.mp4)')
        return 2
    results = run(reel, video)
    out_dir = (reel / 'build') if reel else video.parent
    out = out_dir / ('mix.json' if reel else video.stem + '.mix.json')
    try:
        out_dir.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({'video': str(video).replace('\\', '/'), 'checks': results}, indent=1) + '\n', encoding='utf-8')
        print('wrote ' + str(out).replace('\\', '/'))
    except OSError as e:
        print(f'could not write {out}: {e}')
    return 1 if any(r['status'] == 'FAIL' for r in results) else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
