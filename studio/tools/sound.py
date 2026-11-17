#!/usr/bin/env python3
"""The reel's final soundtrack: the voice, light sound effects made right here in code, and optional music under the voice.

  python3 tools/sound.py <project> [--music track.mp3] [--sfx-gain -4] [--no-sfx]

In:   audio/vo.mp3 · build/sfx.json (the cue list the page writes on every render: [{t, name, gain}]) · reel.json "music" / "sfx_gain"
Out:  build/mix.wav (48 kHz stereo, -14 LUFS) · build/music.json (the licensed music beds used, with each file's hash)

reel.json "music" is either a path to one track (the old form) or a list of licensed beds recorded with  kit licensed add:
  "music": [{"asset": "clear-skies", "from": 0, "fade": 1.5, "gain_db": -18}]
  asset    the id in brand/licensed/assets.json (type music)      from     seconds into the reel where the bed starts (default 0)
  fade     fade in and out, seconds (default 1)                   gain_db  level under the voice before ducking (default -18)
The bed loops to the end of the reel and is ducked under the voice with ffmpeg sidechaincompress. A missing, changed or wrong-type
asset stops the mix with the reason.

No sound files ship with the kit: every effect is synthesised below, so there is nothing to license.
Effect names: whoosh swoosh pop click tick thud impact boom shimmer riser type cash stamp. Any other name is matched by keyword
(slam → stamp, press → click, sparkle → shimmer ...). There is no bell: ding / chime / success / notify all play the soft pop.
House taste: effects sit about 18 dB under the voice, and crowded cues are skipped so nothing machine-guns.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile
import numpy as np

from kitcore import resolve_reel, Flags, fail, load_words, media_length, pcm, read_json, reel_settings, brand_root

TOOL = 'sound'
RATE = 48000
BASE_DB = -18                                     # where an effect sits under the voice before its own gain

# ── the effect bank ───────────────────────────────────────────────────────────────────────────────────────────────
def _clock(seconds=0.9):
    return np.arange(int(RATE * seconds)) / RATE

def _env(t, attack, decay):
    return np.minimum(1.0, t / attack) * np.exp(-t / decay)

def _hiss(seed, n):
    return np.random.default_rng(seed).standard_normal(n)

def _smooth(x, width):
    return np.convolve(x, np.ones(width) / width, 'same')

def _sweep(t, f_top, f_floor, fall):
    return np.sin(2 * np.pi * np.cumsum(f_top * np.exp(-t * fall) + f_floor) / RATE)

def air(width, centre, soft):
    def make(t, seed):
        x = _smooth(_hiss(seed, len(t)), soft) * np.exp(-((t - centre) / width) ** 2)
        return 0.55 * x / (np.abs(x).max() + 1e-9)
    return make

def pop(t, seed):
    return 0.6 * _sweep(t, 900, 300, 18) * _env(t, 0.002, 0.045)

def click(t, seed):
    return 0.6 * np.convolve(_hiss(seed, len(t)) * _env(t, 0.0005, 0.012), [1, -0.9], 'same')

def tick(t, seed):
    return 0.35 * np.sin(2 * np.pi * 2400 * t) * _env(t, 0.0008, 0.018)

def key(t, seed):
    return 0.4 * np.convolve(_hiss(seed, len(t)) * _env(t, 0.0003, 0.006), [1, -0.95], 'same')

def coins(t, seed):
    second = np.sin(2 * np.pi * 2637 * t) * (t > 0.06)
    return 0.25 * (np.sin(2 * np.pi * 2093 * t) + second) * _env(t, 0.002, 0.18)

def thump(edge):
    def make(t, seed):
        body = _sweep(t, 140, 45, 9) * _env(t, 0.002, 0.12)
        if edge:
            body = body + 0.5 * _smooth(_hiss(seed, len(t)), 6) * _env(t, 0.001, 0.03)
        return 0.8 * body
    return make

def low_hit(tail):
    def make(t, seed):
        body = _sweep(t, 90, 32, 4) * _env(t, 0.003, tail)
        return 0.8 * (body + 0.6 * _smooth(_hiss(seed, len(t)), 40) * _env(t, 0.001, 0.06))
    return make

def sparkle(t, seed):
    tones = sum(np.sin(2 * np.pi * f * t + k) for k, f in enumerate((2637, 3136, 3951, 4699)))
    return 0.08 * tones * _env(t, 0.05, 0.3) * (0.5 + 0.5 * np.sin(2 * np.pi * 14 * t))

def lift(t, seed):
    u = t / t[-1]
    tone = np.sin(2 * np.pi * np.cumsum(300 + 1500 * u ** 2) / RATE) * u ** 3 * 0.15
    return tone + _smooth(_hiss(seed, len(t)), 8) * u ** 2 * 0.3

BANK = {'whoosh': air(0.09, 0.2, 30), 'swoosh': air(0.06, 0.12, 14), 'pop': pop, 'click': click, 'tick': tick, 'type': key,
        'cash': coins, 'thud': thump(False), 'stamp': thump(True), 'impact': low_hit(0.2), 'boom': low_hit(0.35),
        'shimmer': sparkle, 'riser': lift}

# name → effect, first match wins (exact name, then keyword)
ALIASES = [('whoosh', 'whoosh whip wipe dock fly cut'), ('swoosh', 'swoosh swish slide fwip'),
           ('pop', 'pop pill land plop appear bubble ding chime success check confirm notif bell'),
           ('click', 'click enter press tap toggle key'), ('type', 'type typing'), ('cash', 'cash coin money'),
           ('stamp', 'stamp slam gavel slap'), ('thud', 'thud drop thump'), ('boom', 'boom bass'), ('impact', 'impact hit shock'),
           ('shimmer', 'shimmer sparkle glow magic'), ('riser', 'riser rise build')]

def effect_for(name):
    low = str(name).lower()
    for effect, words in ALIASES:
        if low == effect or any(w in low for w in words.split()):
            return effect
    return 'tick'

_rendered = {}
def render_effect(effect):
    if effect not in _rendered:
        t = _clock()
        _rendered[effect] = BANK.get(effect, lambda t, s: 0.3 * np.sin(2 * np.pi * 2000 * t) * _env(t, 0.001, 0.02))(t, sum(map(ord, effect)))
    return _rendered[effect]

# ── which cues get through ───────────────────────────────────────────────────────────────────────────────────────
ALWAYS = {'whoosh', 'stamp', 'impact', 'boom'}             # transitions and slams win
ROOMY = {'swoosh', 'thud', 'cash', 'riser'}                # medium: next in line
# everything else is light (pops, ticks, clicks, typing): only where there's room
SPACING = 0.75        # at most about one cue per 0.75 s overall (house taste: sparse, never machine-gun)
BIG_SPACING = 0.4     # two transitions/slams may sit closer than that, never closer than 0.4 s

def _rank(effect):
    return 0 if effect in ALWAYS else 1 if effect in ROOMY else 2

def thin_out(cues):
    """Keep the cues that matter, sparsely. Big ones first (cuts, stamps, slams), then medium, then light,
    each only if nothing already kept sits within SPACING of it."""
    wanted = []
    for cue in cues:
        t = float(cue['t'])
        if t < 0:
            continue
        effect = effect_for(cue.get('name', cue.get('n', 'tick')))
        wanted.append((_rank(effect), t, effect, float(cue.get('gain', cue.get('g', 0)))))
    kept = []
    for rank, t, effect, gain in sorted(wanted, key=lambda w: (w[0], w[1])):
        clear = all(abs(t - kt) >= (BIG_SPACING if rank == 0 and _rank(ke) == 0 else SPACING) for kt, ke, _ in kept)
        if clear:
            kept.append((t, effect, gain))
    return sorted(kept)

def music_bed(project, path, voice, length):
    track = Path(path) if Path(path).is_absolute() else project / path
    bed = pcm(track, RATE, ('-stream_loop', '-1'))[:length]
    padded = np.zeros(length)
    padded[:min(len(voice), length)] = np.abs(voice[:length])
    loud = np.convolve(padded, np.ones(int(RATE * 0.25)) / (RATE * 0.25), 'same')
    duck = 1 - 0.7 * np.clip(loud / (loud.max() + 1e-9) * 4, 0, 1)    # dip the music while words are spoken
    return bed * 0.16 * duck[:len(bed)]

def _sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def licensed_beds(project, music):
    """reel.json "music" as a list of licensed beds -> [{asset, file, from, fade, gain_db, sha256}], or stops with the reason."""
    brand = brand_root(project)
    if brand is None:
        fail(TOOL, 'reel.json "music" lists licensed assets, but this reel is not inside a brand folder (no brand/brand.json above it)')
    reg = read_json(brand / 'brand' / 'licensed' / 'assets.json', {}) or {}
    assets = reg.get('assets') if isinstance(reg.get('assets'), list) else []
    root = (brand / 'brand' / 'licensed').resolve()
    beds = []
    for i, m in enumerate(music, 1):
        if not isinstance(m, dict) or not m.get('asset'):
            fail(TOOL, f'reel.json music[{i}] needs an "asset" (the id of a licensed music asset)')
        a = next((x for x in assets if x.get('id') == m['asset']), None)
        if not a:
            fail(TOOL, f'music[{i}]: no licensed asset "{m["asset"]}" in brand/licensed/assets.json (kit licensed add <file> --type music --title ...)')
        if a.get('type') != 'music':
            fail(TOOL, f'music[{i}]: asset "{m["asset"]}" is a {a.get("type")}, not music')
        f = (brand / str(a.get('file', ''))).resolve()
        if root not in f.parents:
            fail(TOOL, f'music[{i}]: asset "{m["asset"]}" points outside brand/licensed/')
        if not f.is_file():
            fail(TOOL, f'music[{i}]: the file of asset "{m["asset"]}" is missing ({a.get("file")})')
        digest = _sha256(f)
        if digest != a.get('sha256'):
            fail(TOOL, f'music[{i}]: asset "{m["asset"]}" changed since it was recorded (kit licensed check)')
        try:
            start, fade, gain = float(m.get('from', 0)), float(m.get('fade', 1)), float(m.get('gain_db', -18))
        except (TypeError, ValueError):
            fail(TOOL, f'music[{i}]: from, fade and gain_db must be numbers')
        if start < 0 or fade < 0 or gain > 0:
            fail(TOOL, f'music[{i}]: from and fade cannot be negative and gain_db cannot be above 0 (it is how far under full level the bed sits)')
        beds.append({'asset': m['asset'], 'file': str(a['file']), 'from': start, 'fade': fade, 'gain_db': gain, 'sha256': digest, '_path': f})
    return beds


def licensed_bed(bed, voice, length):
    """One licensed bed, looped to the end of the reel, faded, set to gain_db and ducked under the voice (ffmpeg sidechaincompress)."""
    import os
    seconds = length / RATE
    run = max(0.1, seconds - bed['from'])
    fade = min(bed['fade'], run / 2)
    keyed = np.zeros(length)
    keyed[:min(len(voice), length)] = voice[:length]
    fd, key = tempfile.mkstemp(suffix='.wav')
    os.close(fd)
    try:
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f64le', '-ar', str(RATE), '-ac', '1', '-i', '-', key], input=keyed.tobytes(), check=True)
        chain = (f'[1:a]aresample={RATE},aformat=channel_layouts=mono,atrim=0:{run:.3f},asetpts=PTS-STARTPTS,volume={bed["gain_db"]}dB'
                 + (f',afade=t=in:d={fade:.3f},afade=t=out:st={max(0, run - fade):.3f}:d={fade:.3f}' if fade > 0 else '')
                 + f',adelay={int(bed["from"] * 1000)},apad=whole_len={length}[m];'
                 f'[0:a]aresample={RATE},aformat=channel_layouts=mono,apad=whole_len={length}[k];'
                 f'[m][k]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300:makeup=1[d]')
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', key, '-stream_loop', '-1', '-i', str(bed['_path']), '-filter_complex', chain,
                              '-map', '[d]', '-t', f'{seconds:.3f}', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-'], capture_output=True)
    finally:
        try:
            os.remove(key)
        except OSError:
            pass
    if raw.returncode != 0:
        fail(TOOL, 'ffmpeg could not mix the licensed bed: ' + raw.stderr.decode('utf-8', 'replace').strip()[-400:])
    return np.frombuffer(raw.stdout, np.float32).astype(np.float64)[:length]


def main():
    flags = Flags()
    args = flags.positional()
    if not args:
        print(__doc__)
        raise SystemExit(1)
    project = resolve_reel(args[0])
    vo_file = project / 'audio' / 'vo.mp3'
    if not vo_file.exists():
        fail(TOOL, 'no audio/vo.mp3 yet (voice the script with tools/voice.py first)')
    voice = pcm(vo_file, RATE)
    reel = reel_settings(project)
    video = project / 'build' / 'video.mp4'
    length = int(RATE * max(len(voice) / RATE + 0.6, media_length(video) if video.exists() else 0))

    cues = [] if flags.on('no-sfx') else (read_json(project / 'build' / 'sfx.json', []) or [])
    offset = float(flags.get('sfx-gain', reel.get('sfx_gain', 0)))
    track = np.zeros(length)
    kept = thin_out(cues)
    for t, effect, gain in kept:
        start = int(t * RATE)
        clip = render_effect(effect)[:max(0, min(len(_clock()), length - start))]
        track[start:start + len(clip)] += clip * 10 ** ((min(gain, 0) + offset + BASE_DB) / 20)

    mix = track
    mix[:min(len(voice), length)] += voice[:length]
    music = flags.get('music', reel.get('music'))
    record = project / 'build' / 'music.json'
    if isinstance(music, list) and not flags.get('music'):
        beds = licensed_beds(project, music)
        for b in beds:
            bed = licensed_bed(b, voice, length)
            mix[:len(bed)] += bed
        record.write_text(json.dumps([{k: v for k, v in b.items() if not k.startswith('_')} for b in beds], indent=1) + '\n', encoding='utf-8')
        music = bool(beds)
    elif music:
        bed = music_bed(project, music, voice, length)
        mix[:len(bed)] += bed
        record.unlink(missing_ok=True)
    else:
        record.unlink(missing_ok=True)
    mix = mix / max(1.0, np.abs(mix).max() / 0.97)
    out = project / 'build' / 'mix.wav'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f64le', '-ar', str(RATE), '-ac', '1', '-i', '-',
                    '-af', 'loudnorm=I=-14:TP=-1.2:LRA=11', '-ar', str(RATE), '-ac', '2', str(out)], input=mix.tobytes(), check=True)
    print(f'sound: build/mix.wav {length / RATE:.2f} s · voice + {len(kept)} effects '
          f'({len(cues) - len(kept)} of {len(cues)} cues skipped on purpose: too close to another)' + (' + music' if music else ''))

if __name__ == '__main__':
    main()
