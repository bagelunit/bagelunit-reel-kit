#!/usr/bin/env python3
"""The reel's final soundtrack: the voice, light sound effects made right here in code, and optional music under the voice.

  python3 tools/sound.py <project> [--music track.mp3] [--sfx-gain -4] [--no-sfx]

In:   audio/vo.mp3 · build/sfx.json (the cue list the page writes on every render: [{t, name, gain}]) · reel.json "music" / "sfx_gain"
Out:  build/mix.wav (48 kHz stereo, -14 LUFS)

No sound files ship with the kit: every effect is synthesised below, so there is nothing to license.
Effect names: whoosh swoosh pop click tick thud impact boom shimmer riser type cash stamp. Any other name is matched by keyword
(slam → stamp, press → click, sparkle → shimmer ...). There is no bell: ding / chime / success / notify all play the soft pop.
House taste: effects sit about 18 dB under the voice, and crowded cues are skipped so nothing machine-guns.
"""
from pathlib import Path
import subprocess
import numpy as np

from kitcore import Flags, fail, load_words, media_length, pcm, read_json, reel_settings

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

def main():
    flags = Flags()
    args = flags.positional()
    if not args:
        print(__doc__)
        raise SystemExit(1)
    project = Path(args[0]).resolve()
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
    if music:
        bed = music_bed(project, music, voice, length)
        mix[:len(bed)] += bed
    mix = mix / max(1.0, np.abs(mix).max() / 0.97)
    out = project / 'build' / 'mix.wav'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f64le', '-ar', str(RATE), '-ac', '1', '-i', '-',
                    '-af', 'loudnorm=I=-14:TP=-1.2:LRA=11', '-ar', str(RATE), '-ac', '2', str(out)], input=mix.tobytes(), check=True)
    print(f'sound: build/mix.wav {length / RATE:.2f} s · voice + {len(kept)} effects '
          f'({len(cues) - len(kept)} of {len(cues)} cues skipped on purpose: too close to another)' + (' + music' if music else ''))

if __name__ == '__main__':
    main()
