"""Shared plumbing for the kit's Python tools: where settings live, how keys are found, flags, ffmpeg helpers,
word-timing files. Every tool imports this module, so behaviour stays the same everywhere.

Settings folder: ~/.config/susanoo-reels/ (falls back to the same folder (kept for compatibility) until setup copies it over)
  config.json        saved defaults (voice, theme, brand, host, AI plan)
  elevenlabs.key     one line, the ElevenLabs API key (or the ELEVENLABS_API_KEY environment variable)
  openai.key         one line, only if you voice with OpenAI
Keys are only read, never printed.
"""
import json, os, re, subprocess, sys
from pathlib import Path

_NEW_CFG = Path.home() / '.config' / 'susanoo-reels'
_OLD_CFG = Path.home() / '.config' / 'susanoo-reels'   # migration fallback: same folder (kept for compatibility)
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
