#!/usr/bin/env python3
"""Face take → everything a talking reel needs (pauses tightened, voice polished, face frames, word timings).

  python3 tools/take.py <project> --video take.mov
  options: --keep 0.15        pause length kept where a pause is cut (s)
           --min-pause 0.22   only pauses at least this long are tightened (s)
           --no-cut           keep the take's timing untouched (no pause cuts, no head/tail trim)
           --transcriber auto|scribe|whisper   word timings: ElevenLabs Scribe (auto when a key exists), else local Whisper
           --language en      language code for the transcriber (default: reel.json "language", else auto)
           --retranscribe     ask the transcriber again (default: reuse vo_raw/take_words.json for the same take, no extra cost)

Outputs (the talking engine and the shared tools read these):
  audio/vo.mp3            the polished voice (highpass, gentle denoise, de-ess, light compression, limiter, -14 LUFS)
  frames/face/%05d.jpg    the cut take at 1080x1920 (scaled + cropped to fill), 30 fps, one per output frame
  build/face.json         {"n": frames, "fps": 30, "cuts": [jump-cut times], "src": "take.mov"}
  build/words.json        [{"w": "word", "s": start_s, "e": end_s}, ...] on the FINAL (cut) clock
  build/word_index.txt    "index  start  end  word" (pick cue words for scenes.js here)
  vo_raw/                 take_words.json (raw transcription, reused next run), cuts.json, transcript.txt

Keys: ELEVENLABS_API_KEY env var, or one line in ~/.config/susanoo-reels/elevenlabs.key (same as tools/voice.py).
Needs only ffmpeg/ffprobe (plus faster-whisper or whisper.cpp if you use the Whisper fallback).
"""
import json, os, re, shutil, subprocess, sys, urllib.error, urllib.request, uuid
from pathlib import Path

FPS = 30
_NEW_CFG = Path.home() / '.config' / 'susanoo-reels'
_OLD_CFG = Path.home() / '.config' / 'susanoo-reels'   # migration fallback: same folder (kept for compatibility)
CFG_DIR = _NEW_CFG if _NEW_CFG.is_dir() or not _OLD_CFG.is_dir() else _OLD_CFG

def arg(name, default=None):
    if f'--{name}' in sys.argv:
        i = sys.argv.index(f'--{name}')
        return sys.argv[i + 1] if i + 1 < len(sys.argv) and not sys.argv[i + 1].startswith('--') else True
    return default

def die(msg): sys.exit('take: ' + msg)

def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0: die('ffmpeg failed: ' + (r.stderr or '').strip()[-800:])
    return r

def probe(f, entries, stream=None):
    cmd = ['ffprobe', '-v', 'error'] + (['-select_streams', stream] if stream else []) + ['-show_entries', entries, '-of', 'csv=p=0', str(f)]
    return subprocess.run(cmd, capture_output=True, text=True).stdout.strip()

def eleven_key():
    if os.environ.get('ELEVENLABS_API_KEY'): return os.environ['ELEVENLABS_API_KEY'].strip()
    for f in [CFG_DIR / 'elevenlabs.key', Path.home() / '.config' / 'elevenlabs' / 'key']:
        if f.exists() and f.read_text().strip(): return f.read_text().strip()
    return None

def multipart(fields, files):
    b = '----susanooreels' + uuid.uuid4().hex
    body = bytearray()
    for k, v in fields.items():
        body += f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    for k, (fn, data, ct) in files.items():
        body += f'--{b}\r\nContent-Disposition: form-data; name="{k}"; filename="{fn}"\r\nContent-Type: {ct}\r\n\r\n'.encode() + data + b'\r\n'
    body += f'--{b}--\r\n'.encode()
    return bytes(body), 'multipart/form-data; boundary=' + b

def scribe_words(audio, key, lang, model):
    fields = {'model_id': model, 'timestamps_granularity': 'word', 'tag_audio_events': 'false', 'diarize': 'false'}
    if lang and lang != 'auto': fields['language_code'] = lang
    body, ct = multipart(fields, {'file': (audio.name, audio.read_bytes(), 'audio/mpeg')})
    req = urllib.request.Request('https://api.elevenlabs.io/v1/speech-to-text', data=body, headers={'xi-api-key': key, 'Content-Type': ct})
    r = json.load(urllib.request.urlopen(req, timeout=600))
    (audio.parent / 'scribe.json').write_text(json.dumps(r, ensure_ascii=False))
    words = []
    for w in r.get('words', []):
        if w.get('type', 'word') != 'word' or not str(w.get('text', '')).strip(): continue
        t = str(w['text']).strip()
        if words and re.fullmatch(r'[^\w]+', t): words[-1][0] += t; words[-1][2] = float(w['end']); continue   # stray punctuation → previous word
        words.append([t, float(w['start']), float(w['end'])])
    return words

def whisper_fallback(proj, wav):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from kitcore import voice_settings, whisper_words               # shared helper (whisper.cpp or faster-whisper)
    cfg = voice_settings(proj)
    if arg('language'): cfg['language'] = arg('language')
    return whisper_words(wav, cfg)

def ff_graph(inp, graph, outs, work):
    """Run one ffmpeg with a filter graph; long graphs go through a script file (both ffmpeg spellings tried)."""
    base = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(inp)]
    if len(graph) < 7000: return run(base + ['-filter_complex', graph] + outs)
    fc = work / 'cut.fc'; fc.write_text(graph)
    r = subprocess.run(base + ['-/filter_complex', str(fc)] + outs, capture_output=True, text=True)
    if r.returncode == 0: return r
    return run(base + ['-filter_complex_script', str(fc)] + outs)

def main():
    if len(sys.argv) < 2 or sys.argv[1].startswith('--'): print(__doc__); sys.exit(1)
    proj = Path(sys.argv[1]).resolve()
    if not (proj / 'reel.json').exists(): die(f'{proj} is not a reel project (no reel.json). Make one: node tools/kit.mjs start <dir> --style talking')
    vid = arg('video')
    if not vid or vid is True: die('give the face take: --video take.mov')
    src = Path(vid) if Path(vid).exists() else proj / vid
    if not src.exists(): die(f'no video at {vid}')
    src = src.resolve()
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'): die('ffmpeg/ffprobe not found on PATH (see SETUP.md)')
    rj = json.loads((proj / 'reel.json').read_text())
    keep_gap, min_pause = float(arg('keep', 0.15)), float(arg('min-pause', 0.22))
    lang = arg('language') or rj.get('language') or 'auto'
    for d in ['vo_raw', 'audio', 'build', 'frames']: (proj / d).mkdir(exist_ok=True)
    raw = proj / 'vo_raw'
    D = float(probe(src, 'format=duration') or 0)
    if D <= 0: die(f'could not read {src.name}')
    if not probe(src, 'stream=codec_type', 'a:0'): die(f'{src.name} has no audio track')

    # ── 1. word timings on the RAW take (cached per take: re-runs with other cut settings cost nothing)
    cache = raw / 'take_words.json'
    stamp = {'src': src.name, 'size': src.stat().st_size}
    old = json.loads(cache.read_text()) if cache.exists() else {}
    if old.get('src') == stamp['src'] and old.get('size') == stamp['size'] and old.get('words') and not arg('retranscribe'):
        words, how = old['words'], old.get('how', 'cache') + ' (cached)'
    else:
        wav = raw / 'take16k.wav'
        run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(src), '-vn', '-ac', '1', '-ar', '16000', str(wav)])
        mode, key, words, how = arg('transcriber', 'auto'), eleven_key(), None, ''
        if mode in ('auto', 'scribe') and key:
            mp3 = raw / 'take_scribe.mp3'
            run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(wav), '-ac', '1', '-b:a', '96k', str(mp3)])
            try: words, how = scribe_words(mp3, key, lang, arg('scribe-model', 'scribe_v1')), 'ElevenLabs Scribe'
            except urllib.error.HTTPError as e:
                msg = e.read().decode(errors='ignore')[:300]
                if mode == 'scribe': die(f'Scribe HTTP {e.code}: {msg}')
                print(f'Scribe failed (HTTP {e.code}: {msg}); using local Whisper')
            except Exception as e:
                if mode == 'scribe': die(f'Scribe failed: {e}')
                print(f'Scribe failed ({e}); using local Whisper')
        elif mode == 'scribe': die('no ElevenLabs key: set ELEVENLABS_API_KEY or save it to ' + str(CFG_DIR / 'elevenlabs.key'))
        if words is None: words, how = whisper_fallback(proj, wav), 'Whisper'
        cache.write_text(json.dumps(dict(stamp, how=how, words=words), ensure_ascii=False))
    words = [w for w in words if str(w[0]).strip()]
    if not words: die('no speech found in the take')
    (raw / 'transcript.txt').write_text(' '.join(w[0] for w in words) + '\n', encoding='utf-8')

    # ── 2. pauses: quiet stretches at -35 dB (breaths stay), cut in the middle, on the 30 fps grid
    fr = lambda t: round(t * FPS) / FPS
    cuts = []
    if arg('no-cut'): keep = [(0.0, fr(D) if fr(D) <= D else D)]
    else:
        log = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-i', str(src), '-vn', '-af', f'silencedetect=n=-35dB:d={min_pause}', '-f', 'null', '-'], capture_output=True, text=True).stderr
        S = [(float(a), float(b)) for a, b in re.findall(r'silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)', log)]
        w0, w1 = words[0][1], words[-1][2]
        for a, b in S:
            if a < w0 + 0.1 or b > w1 - 0.1 or b - a <= keep_gap + 0.06: continue
            mid, half = (a + b) / 2, (b - a - keep_gap) / 2
            c0, c1 = fr(mid - half), fr(mid + half)
            if c1 - c0 >= 2 / FPS: cuts.append((c0, c1))
        t0, t1 = max(0.0, fr(w0 - 0.12)), min(D, fr(w1 + 0.45))
        keep, p = [], t0
        for c0, c1 in cuts:
            if c0 > p: keep.append((p, c0))
            p = max(p, c1)
        keep.append((p, t1))
    keep = [(a, b) for a, b in keep if b - a >= 1 / FPS]
    total = sum(b - a for a, b in keep)

    # ── 3. one ffmpeg pass: cut picture + audio (10 ms fades at every join) → face frames + polished voice
    face_dir = proj / 'frames' / 'face'
    shutil.rmtree(face_dir, ignore_errors=True); face_dir.mkdir(parents=True)
    F = 0.01
    g = []
    for i, (a, b) in enumerate(keep):
        g.append(f'[0:v]trim={a:.4f}:{b:.4f},setpts=PTS-STARTPTS[v{i}]')
        g.append(f'[0:a]atrim={a:.4f}:{b:.4f},asetpts=PTS-STARTPTS,afade=t=in:d={F},afade=t=out:st={max(0, b - a - F):.4f}:d={F}[a{i}]')
    g.append(''.join(f'[v{i}][a{i}]' for i in range(len(keep))) + f'concat=n={len(keep)}:v=1:a=1[vc][ac]')
    g.append('[vc]fps=30,scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1[vo]')
    g.append('[ac]highpass=f=80,afftdn=nr=10:nf=-45,deesser=i=0.35,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=2,'
             'alimiter=limit=0.89,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100[ao]')
    ff_graph(src, ';'.join(g), ['-map', '[vo]', '-q:v', '3', '-start_number', '0', str(face_dir / '%05d.jpg'),
                                '-map', '[ao]', '-ac', '1', '-b:a', '192k', str(proj / 'audio' / 'vo.mp3')], raw)
    n = len(list(face_dir.glob('*.jpg')))
    if not n: die('no face frames were written')

    # ── 4. timings on the cut clock
    def remap(x):
        acc = 0.0
        for a, b in keep:
            if x <= b: return acc + max(0.0, x - a)
            acc += b - a
        return acc
    clean = lambda w: str(w).replace('“', '').replace('”', '').replace('"', '').replace('’', "'")
    W = [{'w': clean(w), 's': round(remap(s), 3), 'e': round(max(remap(e), remap(s) + 0.02), 3)} for w, s, e in words if clean(w)]
    (proj / 'build' / 'words.json').write_text(json.dumps(W, ensure_ascii=False, indent=0), encoding='utf-8')
    (proj / 'build' / 'word_index.txt').write_text('\n'.join(f"{i:4d} {x['s']:7.2f} {x['e']:7.2f}  {x['w']}" for i, x in enumerate(W)), encoding='utf-8')
    joins, acc = [], 0.0
    for a, b in keep[:-1]: acc += b - a; joins.append(round(acc, 3))
    (proj / 'build' / 'face.json').write_text(json.dumps({'n': n, 'fps': FPS, 'cuts': joins, 'src': src.name}))
    (raw / 'cuts.json').write_text(json.dumps({'take': src.name, 'duration': D, 'keep': keep, 'cuts': cuts}, indent=1))
    vd = float(probe(proj / 'audio' / 'vo.mp3', 'format=duration') or 0)
    wpm = round(len(W) / max(0.1, W[-1]['e'] - W[0]['s']) * 60)
    print(f'take: {src.name} {D:.2f} s → {total:.2f} s ({len(cuts)} pauses tightened)   words: {len(W)} via {how}, {wpm} wpm')
    print(f'  audio/vo.mp3 {vd:.2f} s · frames/face {n} frames ({n / FPS:.2f} s) · build/words.json · build/word_index.txt · build/face.json')
    if abs(vd - n / FPS) > 0.1: print(f'  note: voice and picture differ by {abs(vd - n / FPS):.2f} s (the reel uses the picture length)')

if __name__ == '__main__': main()
