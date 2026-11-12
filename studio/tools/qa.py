#!/usr/bin/env python3
"""Final QA: does the finished file meet the spec a platform and a viewer expect? Uses only ffmpeg and ffprobe (plus numpy).

  python3 tools/qa.py <project> [video.mp4]     (default: newest out/*.mp4, else build/video.mp4, else build/draft.mp4)

One line per check, each PASS, WARN, FAIL or SKIPPED; then  QA: PASS  or  QA: FAIL  (exit code 1 on FAIL). WARN does not fail.
The same facts are written to build/qa.json so a reviewer can read them.

  spec       1080x1920, 30 fps, h264 video + aac audio, length within 1 s of audio/vo.mp3 (when it exists), size 0.2 to 250 MB
  loudness   integrated LUFS (ebur128): PASS -15..-9, WARN inside -16..-8, FAIL outside; true peak must be <= -1 dBTP
  black      black stretches longer than 0.5 s, listed with times (FAIL)
  frozen     frozen stretches longer than 0.5 s, listed with times (FAIL)
  text       text size and safe zone, from build/text_boxes.json: [{"t0": s, "t1": s, "x": px, "y": px, "w": px, "h": px,
             "label": "..."}] on the 1080x1920 canvas. No other build file holds text boxes (build/motion_mask.json lists regions
             to ignore, not text), so without that file this check is SKIPPED, never PASS.
             Scene-style reels (local addition): when there is no text_boxes.json but kit render wrote build/scene_boxes.json
             (the resting boxes the style's engine reports through S.inspect, every drawn item, not only text), the safe zone
             is checked on those boxes with the styles repo's 6 px slack; text size is not, since the engine reports boxes,
             not font sizes. Modes never write scene_boxes.json, so nothing changes for them.
  sync       first word start in build/words.json vs the first audible sound in the final audio, within 80 ms
             (SKIPPED when words.json is missing). The audio may carry effects or music: read a WARN as "listen".
"""
import json, re, subprocess, sys
from pathlib import Path

from kitcore import resolve_reel, Flags, fail, load_words, media_length, pcm, read_json

TOOL = 'qa'
SAFE = dict(top=250, bottom=450, side=60)        # px kept clear of text on a 1080x1920 canvas (platform buttons and caption bar)
MIN_TEXT_H = 44                                    # a text box shorter than this is hard to read on a phone
MIN_STILL = 0.5                                    # black or frozen for longer than this (s) is reported
SYNC_LIMIT = 0.080
SCENE_SLACK = 6                                    # px; scene-style boxes (S.inspect) get the styles repo tester's tolerance


def newest_video(project, given):
    if given:
        return Path(given)
    outs = [f for f in (project / 'out').glob('*.mp4') if '.tmp.' not in f.name] if (project / 'out').is_dir() else []
    if outs:
        return max(outs, key=lambda f: f.stat().st_mtime)
    for f in (project / 'build' / 'video.mp4', project / 'build' / 'draft.mp4'):
        if f.exists():
            return f
    return None


def probe(video):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(video)],
                         capture_output=True, text=True).stdout
    try:
        return json.loads(out)
    except ValueError:
        return {}


def fps_of(stream):
    try:
        a, b = stream.get('avg_frame_rate', '0/1').split('/')
        return float(a) / float(b) if float(b) else 0.0
    except ValueError:
        return 0.0


def run_filter(video, flt, audio=False):
    """Run an ffmpeg analysis filter and return its log text (stderr)."""
    cmd = ['ffmpeg', '-hide_banner', '-nostats', '-i', str(video)]
    cmd += ['-vn', '-af', flt] if audio else ['-an', '-vf', flt]
    return subprocess.run(cmd + ['-f', 'null', '-'], capture_output=True, text=True).stderr


def spans(text, start_re, end_re):
    """Pair up start/end log values into [(start, end)]."""
    out = []
    for m in re.finditer(start_re + r'.*?' + end_re, text, re.S):
        a, b = float(m.group(1)), float(m.group(2))
        if b - a > MIN_STILL:
            out.append((a, b))
    return out


def fmt_spans(items):
    return ', '.join(f'{a:.2f}-{b:.2f}s' for a, b in items[:10]) + (' ...' if len(items) > 10 else '')


def main():
    flags = Flags()
    args = flags.positional()
    if not args:
        print(__doc__)
        raise SystemExit(1)
    project = resolve_reel(args[0])
    video = newest_video(project, args[1] if len(args) > 1 else None)
    if not video or not video.exists():
        fail(TOOL, 'nothing rendered yet: run  kit render <project>  and  kit export <project>  first')
    info = probe(video)
    streams = info.get('streams', [])
    vs = next((s for s in streams if s.get('codec_type') == 'video'), None)
    au = next((s for s in streams if s.get('codec_type') == 'audio'), None)
    if not vs:
        fail(TOOL, f'{video.name} has no video stream')

    rows = []                                   # (name, status, text, facts)

    def add(name, status, text, **facts):
        rows.append({'check': name, 'status': status, 'text': text, **facts})

    # spec
    duration = float(info.get('format', {}).get('duration') or media_length(video))
    size_mb = video.stat().st_size / 1e6
    problems = []
    w, h, fps = vs.get('width'), vs.get('height'), fps_of(vs)
    if (w, h) != (1080, 1920):
        problems.append(f'size {w}x{h} (want 1080x1920)')
    if abs(fps - 30) > 0.05:
        problems.append(f'{fps:.2f} fps (want 30)')
    if vs.get('codec_name') != 'h264':
        problems.append(f'video codec {vs.get("codec_name")} (want h264)')
    if not au:
        problems.append('no audio stream')
    elif au.get('codec_name') != 'aac':
        problems.append(f'audio codec {au.get("codec_name")} (want aac)')
    vo = project / 'audio' / 'vo.mp3'
    vo_len = media_length(vo) if vo.exists() else None
    if vo_len and abs(duration - vo_len) > 1.0:
        problems.append(f'length {duration:.1f}s vs voice {vo_len:.1f}s (more than 1 s apart)')
    if not 0.2 <= size_mb <= 250:
        problems.append(f'file size {size_mb:.1f} MB (want 0.2 to 250)')
    vo_note = f', voice {vo_len:.1f}s' if vo_len else ', no audio/vo.mp3 to compare length'
    desc = f'{w}x{h} {fps:.0f} fps {vs.get("codec_name")}+{au.get("codec_name") if au else "none"}, {duration:.1f}s{vo_note}, {size_mb:.1f} MB'
    add('spec', 'FAIL' if problems else 'PASS', ('; '.join(problems) + ' | ' if problems else '') + desc,
        width=w, height=h, fps=round(fps, 3), vcodec=vs.get('codec_name'), acodec=au.get('codec_name') if au else None,
        duration=round(duration, 3), voice_length=round(vo_len, 3) if vo_len else None, size_mb=round(size_mb, 2))

    # loudness
    if au:
        log = run_filter(video, 'ebur128=peak=true', audio=True)
        summary = log[log.rfind('Summary:'):] if 'Summary:' in log else ''
        mi = re.search(r'I:\s+(-?[\d.]+) LUFS', summary)
        mp = re.search(r'True peak:.*?Peak:\s+(-?[\d.]+|-inf) dBFS', summary, re.S)
        if mi and mp:
            lufs = float(mi.group(1))
            tp = float('-inf') if mp.group(1) == '-inf' else float(mp.group(1))
            status, notes = 'PASS', []
            if not -15 <= lufs <= -9:
                status = 'WARN' if -16 <= lufs <= -8 else 'FAIL'
                notes.append('target -15 to -9')
            if tp > -1.0:
                status = 'FAIL'
                notes.append('true peak above -1 dBTP')
            add('loudness', status, f'{lufs:.1f} LUFS, true peak {tp:.1f} dBTP' + (f' ({"; ".join(notes)})' if notes else ''),
                lufs=lufs, true_peak_db=tp)
        else:
            add('loudness', 'FAIL', 'ffmpeg ebur128 gave no readable summary', lufs=None, true_peak_db=None)
    else:
        add('loudness', 'FAIL', 'no audio stream to measure', lufs=None, true_peak_db=None)

    # black and frozen
    log = run_filter(video, f'blackdetect=d={MIN_STILL}:pix_th=0.10')
    black = [(float(a), float(b)) for a, b in re.findall(r'black_start:([\d.]+) black_end:([\d.]+)', log)]
    add('black', 'FAIL' if black else 'PASS', f'{len(black)} black stretch(es) over {MIN_STILL}s: {fmt_spans(black)}' if black
        else f'no black frames longer than {MIN_STILL}s', stretches=[[a, b] for a, b in black])
    log = run_filter(video, f'freezedetect=n=-60dB:d={MIN_STILL}')
    starts = [float(x) for x in re.findall(r'freeze_start: ([\d.]+)', log)]
    ends = [float(x) for x in re.findall(r'freeze_end: ([\d.]+)', log)]
    frozen = [(a, ends[i] if i < len(ends) else duration) for i, a in enumerate(starts)]
    add('frozen', 'FAIL' if frozen else 'PASS', f'{len(frozen)} frozen stretch(es) over {MIN_STILL}s: {fmt_spans(frozen)}' if frozen
        else f'no frozen frames longer than {MIN_STILL}s', stretches=[[a, b] for a, b in frozen])

    # text size and safe zone
    boxes = read_json(project / 'build' / 'text_boxes.json', None)
    scene_boxes = read_json(project / 'build' / 'scene_boxes.json', None) if not isinstance(boxes, list) or not boxes else None
    if isinstance(scene_boxes, list) and scene_boxes:
        k, bad = SCENE_SLACK, []
        for b in scene_boxes:
            x, y, bw, bh = b.get('x', 0), b.get('y', 0), b.get('w', 0), b.get('h', 0)
            if y < SAFE['top'] - k or y + bh > 1920 - SAFE['bottom'] + k or x < SAFE['side'] - k or x + bw > 1080 - SAFE['side'] + k:
                bad.append(f'{b.get("t0", 0):.1f}s {b.get("kind", "")} "{str(b.get("label", ""))[:24]}" outside the safe zone')
        add('text', 'FAIL' if bad else 'PASS', (f'{len(bad)} of {len(scene_boxes)} scene boxes: ' + '; '.join(bad[:6])) if bad
            else f'{len(scene_boxes)} resting boxes from the scene engine (S.inspect) inside the safe zone; text size not measured for scene styles',
            boxes=len(scene_boxes), bad=bad, source='build/scene_boxes.json')
    elif not isinstance(boxes, list) or not boxes:
        add('text', 'SKIPPED', 'no text-box data (build/text_boxes.json is not written by kit render yet), so text size and safe zone were NOT checked')
    else:
        bad = []
        for b in boxes:
            x, y, bw, bh = b.get('x', 0), b.get('y', 0), b.get('w', 0), b.get('h', 0)
            why = []
            if bh < MIN_TEXT_H:
                why.append(f'height {bh:.0f}px < {MIN_TEXT_H}')
            if y < SAFE['top'] or y + bh > 1920 - SAFE['bottom'] or x < SAFE['side'] or x + bw > 1080 - SAFE['side']:
                why.append('outside the safe zone')
            if why:
                bad.append(f'{b.get("t0", 0):.1f}s "{str(b.get("label", ""))[:24]}" ' + ', '.join(why))
        add('text', 'FAIL' if bad else 'PASS', (f'{len(bad)} of {len(boxes)} boxes: ' + '; '.join(bad[:6])) if bad
            else f'{len(boxes)} text boxes inside the safe zone and tall enough', boxes=len(boxes), bad=bad)

    # audio / video sync
    words = load_words(project)
    if not words:
        add('sync', 'SKIPPED', 'build/words.json is missing, so audio/video sync was NOT checked')
    elif not au:
        add('sync', 'FAIL', 'no audio stream to compare with the first word')
    else:
        import numpy as np
        rate = 16000
        x = pcm(video, rate)
        hop = rate // 100
        n = len(x) // hop
        rms = np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-12)
        db = 20 * np.log10(rms)
        loud = np.flatnonzero(db > -35)
        if len(loud) == 0:
            add('sync', 'FAIL', 'the final audio is silent (nothing above -35 dBFS)')
        else:
            onset, first = loud[0] / 100, float(words[0]['s'])
            gap = onset - first
            add('sync', 'PASS' if abs(gap) <= SYNC_LIMIT else 'FAIL',
                f'first word at {first:.3f}s, first audible sound at {onset:.3f}s, off by {gap * 1000:+.0f} ms (limit {SYNC_LIMIT * 1000:.0f})',
                first_word=first, first_audio=round(onset, 3), offset_ms=round(gap * 1000))

    for r in rows:
        print(f'{r["status"]:<8} {r["check"]:<9} {r["text"]}')
    failed = any(r['status'] == 'FAIL' for r in rows)
    result = 'FAIL' if failed else 'PASS'
    print(f'QA: {result}' + ('  (some checks were skipped)' if any(r['status'] == 'SKIPPED' for r in rows) else ''))
    build = project / 'build'
    build.mkdir(parents=True, exist_ok=True)
    (build / 'qa.json').write_text(json.dumps({'video': video.name, 'result': result, 'checks': rows}, indent=2, ensure_ascii=False),
                                   encoding='utf-8')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
