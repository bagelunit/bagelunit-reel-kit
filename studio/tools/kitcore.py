"""Shared plumbing for the kit's Python tools: where settings live, how keys are found, flags, ffmpeg helpers,
word-timing files. Every tool imports this module, so behaviour stays the same everywhere.

Settings folder: ~/.config/bagelunit-reels/ (falls back to ~/.config/susanoo-reels/, the folder used before the rename, until setup copies it over)
  config.json        saved defaults (voice, theme, brand, host, AI plan)
  elevenlabs.key     one line, the ElevenLabs API key (or the ELEVENLABS_API_KEY environment variable)
  openai.key         one line, only if you voice with OpenAI
Keys are only read, never printed.
"""
import json, os, re, subprocess, sys
from pathlib import Path

_NEW_CFG = Path.home() / '.config' / 'bagelunit-reels'
_OLD_CFG = Path.home() / '.config' / 'susanoo-reels'   # migration fallback: the folder used before the BagelUnit rename (2026-11-08)
HOME_CFG = _NEW_CFG if _NEW_CFG.is_dir() or not _OLD_CFG.is_dir() else _OLD_CFG
KIT_ROOT = Path(__file__).resolve().parent.parent          # the studio/ folder

KEY_ENV = {'elevenlabs': 'ELEVENLABS_API_KEY', 'openai': 'OPENAI_API_KEY'}

VOICE_DEFAULTS = {'provider': 'elevenlabs', 'model': 'eleven_v4', 'speed': 1.15, 'gap': 0.28,
                  'stability': 0.45, 'similarity': 0.8, 'style': 0.2}


class Flags:
    """argv reader: positional args plus --name value / --switch."""
    def __init__(self, argv=None):
        self.argv = list(sys.argv[1:] if argv is None else argv)

    def get(self, name, fallback=None):
        tag = '--' + name
        if tag not in self.argv:
            return fallback
        i = self.argv.index(tag)
        nxt = self.argv[i + 1] if i + 1 < len(self.argv) else None
        return nxt if nxt is not None and not nxt.startswith('--') else True

    def on(self, name):
        return ('--' + name) in self.argv

    def positional(self):
        out, skip = [], False
        for i, a in enumerate(self.argv):
            if skip:
                skip = False
                continue
            if a.startswith('--'):
                nxt = self.argv[i + 1] if i + 1 < len(self.argv) else None
                skip = nxt is not None and not nxt.startswith('--')
                continue
            out.append(a)
        return out


def fail(tool, msg):
    sys.exit(f'{tool}: {msg}')


def read_json(path, fallback=None):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return fallback


def saved_settings():
    return read_json(HOME_CFG / 'config.json', {}) or {}


def store_settings(data):
    HOME_CFG.mkdir(parents=True, exist_ok=True)
    (HOME_CFG / 'config.json').write_text(json.dumps(data, indent=2), encoding='utf-8')


def api_key(provider, tool='kit'):
    env = KEY_ENV[provider]
    if os.environ.get(env):
        return os.environ[env].strip()
    for candidate in (HOME_CFG / f'{provider}.key', Path.home() / '.config' / provider / 'key'):
        if candidate.is_file():
            return candidate.read_text(encoding='utf-8').strip()
    fail(tool, f'no {provider} API key found. Set {env}, or save the key as one line in {HOME_CFG / (provider + ".key")} (see SETUP.md).')


def has_key(provider):
    return bool(os.environ.get(KEY_ENV[provider])) or (HOME_CFG / f'{provider}.key').is_file() \
        or (Path.home() / '.config' / provider / 'key').is_file()


def reel_settings(project):
    return read_json(Path(project) / 'reel.json', {}) or {}


def voice_settings(project):
    """Voice options, lowest priority first: built-in defaults < saved config < the reel's own reel.json."""
    opts = dict(VOICE_DEFAULTS)
    opts.update(saved_settings().get('voice') or {})
    reel = reel_settings(project)
    opts.update(reel.get('voice') or {})
    if reel.get('language') and not (reel.get('voice') or {}).get('language'):
        opts['language'] = reel['language']               # the reel's language also sets the voice accent
    return opts


def media_length(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
                         capture_output=True, text=True).stdout.strip()
    try:
        return float(out)
    except ValueError:
        return 0.0


def ffmpeg(args, tool='kit', **kw):
    done = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], capture_output=True, text=True, **kw)
    if done.returncode != 0:
        fail(tool, 'ffmpeg failed: ' + (done.stderr or '').strip()[-700:])
    return done


def pcm(path, rate, extra=()):
    """Decode any audio/video to mono float32 samples at `rate`."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', *extra, '-i', str(path), '-ac', '1', '-ar', str(rate), '-f', 'f32le', '-'],
                         capture_output=True).stdout
    import numpy as np
    return np.frombuffer(raw, np.float32).astype(np.float64)


def grey_frames(path, w, h, fps=10):
    """Decode a video to grey frames (n, h, w) as float32, `fps` per second."""
    import numpy as np
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-vf', f'fps={fps},scale={w}:{h},format=gray', '-f', 'rawvideo', '-'],
                         capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32)


def load_words(project):
    return read_json(Path(project) / 'build' / 'words.json', []) or []


def write_words(project, words):
    """build/words.json ([{w, s, e}] on the final audio clock) plus the readable build/word_index.txt."""
    build = Path(project) / 'build'
    build.mkdir(parents=True, exist_ok=True)
    (build / 'words.json').write_text(json.dumps(words, ensure_ascii=False, indent=0), encoding='utf-8')
    rows = [f"{n:4d} {w['s']:7.2f} {w['e']:7.2f}  {w['w']}" for n, w in enumerate(words)]
    (build / 'word_index.txt').write_text('\n'.join(rows), encoding='utf-8')


def spoken_between(words, a, b, limit=70):
    return ' '.join(w['w'] for w in words if a - 0.05 <= w['s'] < b)[:limit]


QUOTES = str.maketrans({'“': None, '”': None, '"': None, '’': "'"})


def tidy_word(text):
    return text.translate(QUOTES)


def whisper_words(audio, opts):
    """Word timings for any audio file: whisper.cpp (whisper-cli + a ggml model) if present, else faster-whisper."""
    import shutil
    audio = Path(audio)
    wav16 = audio.parent / 'w16.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(audio), '-ar', '16000', '-ac', '1', str(wav16)], check=True)
    lang = opts.get('language') or 'auto'
    cli = shutil.which('whisper-cli')
    models = [Path(opts['whisper_model']) if opts.get('whisper_model') else None, HOME_CFG / 'ggml-base.bin',
              Path.home() / '.cache/whisper-cpp/ggml-base.bin', Path.home() / '.cache/whisper-cpp/ggml-base.en.bin']
    model = next((m for m in models if m and m.is_file()), None)
    if cli and model:
        stem = audio.parent / 'whisper'
        subprocess.run([cli, '-m', str(model), '-f', str(wav16), '-ml', '1', '-sow', '-oj', '-l', lang, '-of', str(stem)],
                       capture_output=True, check=True)
        parts = json.loads(Path(str(stem) + '.json').read_text(encoding='utf-8'))['transcription']
        return [[p['text'].strip(), p['offsets']['from'] / 1000, p['offsets']['to'] / 1000] for p in parts if p['text'].strip()]
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit('words: word timings need Whisper. Install it with  pip3 install faster-whisper  (or brew install whisper-cpp). See SETUP.md.')
    segments, _ = WhisperModel('base', device='cpu', compute_type='int8').transcribe(
        str(wav16), word_timestamps=True, language=None if lang == 'auto' else lang)
    return [[w.word.strip(), w.start, w.end] for seg in segments for w in seg.words if w.word.strip()]


CJK_CHAR = re.compile(r'[぀-ヿ㐀-鿿가-힯]')


# ── where a reel folder is (same rules as the template's publisher/scripts/reels.mjs) ─────────────────────────────────
REEL_MARKERS = ('reel.json', 'approvals.md', 'script.txt', 'STORYBOARD.md')


def is_date_folder_name(n):
    return bool(re.fullmatch(r'\d{4}', n) or re.fullmatch(r'\d{2} [A-Za-z]+', n) or re.fullmatch(r'[A-Za-z]+ \d{1,2}', n))


def list_reels(brand):
    """Every reel folder under <brand>/reels: reels/<slug> or the dated reels/2026/11 November/November 12/<slug>.
    Returns [(slug, Path)] sorted by path. Folders starting with _ or . are skipped; a reel folder is not searched inside."""
    base, out = Path(brand) / 'reels', []

    def walk(d, depth):
        try:
            entries = sorted(d.iterdir())
        except OSError:
            return
        for e in entries:
            if not e.is_dir() or e.name.startswith(('_', '.')):
                continue
            if depth < 4 and is_date_folder_name(e.name) and not any((e / m).exists() for m in REEL_MARKERS):
                walk(e, depth + 1)
            else:
                out.append((e.name, e))
    if base.is_dir():
        walk(base, 0)
    return sorted(out, key=lambda t: t[1].relative_to(base).as_posix())


def find_reel(brand, slug):
    """The folder of the reel called slug (a slug, reels/<slug> or a dated path all work), or None."""
    s = [p for p in str(slug).replace('\\', '/').replace('`', '').split('/') if p.strip()]
    s = s[-1].strip() if s else ''
    if not s or s.startswith(('_', '.')):
        return None
    flat = Path(brand) / 'reels' / s
    if flat.is_dir():
        return flat
    hits = [p for n, p in list_reels(brand) if n == s]
    return hits[-1] if hits else None


def resolve_reel(arg, cwd=None):
    """What a person typed for a reel (a folder, reels/<slug>, or just the slug) -> its folder. A path that exists is used as
    it is; otherwise the slug is looked up in the nearest brand folder above the current folder, in reels/<slug> or in the
    dated folders. Falls back to the path as typed, so the tool's own "not a reel" message still shows what was typed."""
    base = Path(cwd) if cwd else Path.cwd()
    typed = (base / str(arg)).expanduser().resolve()
    if typed.is_dir():
        return typed
    for d in [base.resolve(), *base.resolve().parents]:
        if (d / 'brand' / 'brand.json').is_file():
            return (find_reel(d, arg) or typed).resolve()
    return typed


def resolve_in_reel(arg, cwd=None):
    """Like resolve_reel, for a file inside a reel (reels/<slug>/script.txt): the reel part is looked up when the path as typed
    does not exist."""
    base = Path(cwd) if cwd else Path.cwd()
    typed = (base / str(arg)).expanduser()
    if typed.exists():
        return typed
    return resolve_reel(typed.parent, cwd) / typed.name if str(typed.parent) not in ('', '.') else typed


def brand_of(project):
    """The brand folder a reel sits in: the nearest folder above it holding brand/brand.json (as findBrand does in the dashboard
    scripts), so a reel in reels/<slug> and one in reels/2026/11 November/November 12/<slug> both find brand/facts.md. Falls back
    to two folders up (the flat layout) when no brand.json is found, so a bare test folder still works."""
    p = Path(project).resolve()
    for d in p.parents:
        if (d / 'brand' / 'brand.json').is_file():
            return d
    return p.parent.parent


# ── calm scene styles (Susanoo Studio, owner 2026-11-13) ─────────────────────────────────────────────────────────────────
# Slow by design (long camera moves, no slams). `kit pace` measures them but does not hold them to the busy bar, and
# /reel-review scores "Movement on the words" and "Pace and variety" against the calm bar for them. Add a style here only
# on the owner's say-so.
CALM_STYLES = {'deep-zoom'}


def is_calm(style):
    return str(style or '') in CALM_STYLES


# ── the score bar (owner rule 2026-11-11): anything scored must reach 90 or more, or it is redone and rechecked ──────────
MIN_SCORE = 90


def review_score(line):
    """The score in a /reel-review verdict line, on a 0 to 100 scale, or None. Reads "(92/100; ..." and the older "(4.3/5; ..."
    (4.5 out of 5 is 90)."""
    m = re.search(r'\((\d+(?:\.\d+)?)\s*/\s*(100|5)\b', str(line or ''))
    if not m:
        return None
    n, top = float(m.group(1)), int(m.group(2))
    return round(n * 100 / top, 1)
