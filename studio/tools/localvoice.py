#!/usr/bin/env python3
"""localvoice.py · the free voice that needs no account: this computer's own speech engine, or any command you connect.

  python3 tools/localvoice.py check              which built-in engine would speak (and whether Whisper times the words)
  python3 tools/localvoice.py voices             the voices that engine offers

tools/voice.py calls this when the provider is "local" (also chosen automatically when there is no ElevenLabs key) or "command".
brand/brand.json "voice" (or ~/.config/bagelunit-reels/config.json, or one reel's reel.json) can hold:
  "provider": "elevenlabs" | "local" | "command" | "auto" | "openai" | "file"
  "local_engine": "say" | "piper" | "espeak-ng" | "espeak" | "sapi"   (default: the first one found)
  "local_voice": "Samantha"          the engine's voice name       "local_rate": 185   words a minute (sapi: -10 to 10)
  "local_model": "/path/en_US-lessac-medium.onnx"                  piper needs a model file
  "command": "my-tts --in {text_file} --out {audio_file}"          your own command (provider "command"), see below
  "chunk_chars": 1500                                              the longest piece sent to the engine in one go

Engines: macOS `say`, Windows System.Speech (SAPI) through PowerShell, Linux `piper` or `espeak-ng` (also used anywhere they are
installed). The audio is converted to the format an ElevenLabs take has; the word clock comes from the script's own words:
timed by Whisper when it is installed (whisper.cpp or faster-whisper), otherwise estimated from each piece's length and the
words' syllables (build/voice_source.json then says "timings": "estimated" and captions and cuts may drift a little).

Your own command: the template is split into words the way a shell would (quotes group words) but NO shell runs it: nothing
is expanded, only {text_file} (a UTF-8 text file with the words) and {audio_file} (where the audio must be written, any format
ffmpeg reads) are replaced, in each word. It is run once per piece of the script, a piece that is already made is not made
again, and any key it needs is its own business (its environment, its own config). A tiny wrapper script is the usual shape:
  my-tts.py:  text = open(sys.argv[2]).read();  ...call the service with your key from its own env...;  open(sys.argv[4], 'wb').write(audio)
  "command": "python3 /path/my-tts.py --in {text_file} --out {audio_file}"
"""
import difflib, hashlib, json, os, re, shutil, subprocess, sys, wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kitcore import CJK_CHAR, fail, key_ready, media_length, whisper_available, whisper_words

TOOL = 'voice'
GAP = 0.15                          # seconds of silence left between two pieces of the script
RATE = 44100
DEFAULT_RATE = {'say': 185, 'espeak-ng': 175, 'espeak': 175, 'piper': None, 'sapi': 0}
DEFAULT_CHUNK = {'say': 1500, 'espeak-ng': 1500, 'espeak': 1500, 'piper': 1500, 'sapi': 1500, 'command': 2500}
NOTE = ('voice: built-in voice (free, basic quality). A natural voice service such as ElevenLabs is a suggested upgrade: '
        'kit suggest elevenlabs')
SAPI_SCRIPT = ('Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; '
               'if ($env:BU_VOICE) { $s.SelectVoice($env:BU_VOICE) }; $s.Rate = [int]$env:BU_RATE; '
               '$s.SetOutputToWaveFile($env:BU_OUT); $s.Speak([System.IO.File]::ReadAllText($env:BU_IN, [System.Text.Encoding]::UTF8)); $s.Dispose()')


# ── which provider speaks ────────────────────────────────────────────────────────────────────────────────────────────────
def find_engine(opts, which=shutil.which, platform=sys.platform):
    """(engine, executable) of the built-in speech engine to use, or (None, why-not). A forced opts["local_engine"] is used or
    reported; otherwise the first of piper (with a model), say, espeak-ng, espeak, SAPI (Windows) that is installed."""
    model = opts.get('local_model')
    shell = which('powershell') or which('pwsh') if platform == 'win32' else None
    exes = {'piper': which('piper'), 'say': which('say'), 'espeak-ng': which('espeak-ng'), 'espeak': which('espeak'), 'sapi': shell}
    forced = opts.get('local_engine')
    if forced:
        if forced not in exes:
            return None, f'unknown local_engine "{forced}" (say, piper, espeak-ng, espeak or sapi)'
        if not exes[forced]:
            return None, f'local_engine "{forced}" is not installed here'
        if forced == 'piper' and not (model and Path(model).expanduser().is_file()):
            return None, 'piper needs voice.local_model: the path of a piper .onnx voice file'
        return forced, exes[forced]
    for name in ('piper', 'say', 'espeak-ng', 'espeak', 'sapi'):
        if not exes[name]:
            continue
        if name == 'piper' and not (model and Path(model).expanduser().is_file()):
            continue
        return name, exes[name]
    hint = {'win32': 'Windows ships one (System.Speech through PowerShell), but PowerShell was not found',
            'darwin': '`say` ships with macOS but was not found'}.get(platform, 'install espeak-ng (for example: sudo apt install espeak-ng) or piper')
    return None, 'no built-in speech engine found: ' + hint


def choose_provider(opts, requested, eleven_key, engine_ok):
    """(provider, note). requested = a --provider flag (used as given, except "auto"). Otherwise opts["provider"]: local, command,
    openai and file are taken as they are; elevenlabs (the default) and auto use ElevenLabs when a key is saved, else the
    built-in voice when an engine is installed, else "standin" (no real voice is possible; the caller says what to do)."""
    want = requested if requested and requested is not True else opts.get('provider') or 'elevenlabs'
    if want in ('local', 'command', 'openai', 'file'):
        return want, None
    if want not in ('elevenlabs', 'auto'):
        return want, None                                   # unknown: the caller reports it
    if requested and requested is not True and want == 'elevenlabs':
        return 'elevenlabs', None                           # asked for by name on the command line: no silent swap
    if eleven_key:
        return 'elevenlabs', None
    if engine_ok:
        return 'local', 'voice: no ElevenLabs key saved, so the reel is voiced with the built-in voice (free, basic quality)'
    return 'standin', None


# ── the script as words, and a clock for them ────────────────────────────────────────────────────────────────────────────
def script_words(text):
    """The script's words as written (whitespace ends a word, every CJK character is a word of its own, punctuation stays
    attached), the list the captions show."""
    out, cur = [], ''
    for ch in text:
        cjk = bool(CJK_CHAR.match(ch))
        if ch.isspace() or cjk:
            if cur:
                out.append(cur)
                cur = ''
            if cjk:
                out.append(ch)
        else:
            cur += ch
    if cur:
        out.append(cur)
    glued = []
    for w in out:
        if glued and re.fullmatch(r'[^\w]+', w):
            glued[-1] += w
        else:
            glued.append(w)
    return glued


def norm(word):
    return re.sub(r'[\W_]+', '', str(word).lower())


def weights(word):
    """(speech, pause) of a word in syllable-like units: vowel groups for a Latin word, characters otherwise; a comma or a full
    stop leaves a pause after the word."""
    core = norm(word)
    syl = len(re.findall(r'[aeiouyà-æè-ïò-öù-ýœ]+', core)) if core.isascii() or re.search(r'[a-zà-ÿ]', core) else len(core)
    if re.search(r'[a-zà-ÿ]', core) and core.endswith('e') and syl > 1 and not core.endswith(('le', 'ee')):
        syl -= 1                                            # a silent final e ("make")
    speech = max(1.0, syl + 0.15 * len(core))
    if core.isdigit():
        speech = 1.5 * len(core)                           # digits are read out, about a syllable and a half each
    tail = word.rstrip('"\'”’)]')[-1:]
    pause = 1.4 if tail and tail in '.!?…。！？' else 0.7 if tail and tail in ',;:、，；：' else 0.0
    return speech, pause


def estimate_words(words, start, end):
    """[word, start, end] for each word, the time between start and end shared out by syllable-like weights (see weights)."""
    if not words:
        return []
    end = max(end, start + 0.05 * len(words))
    parts = [weights(w) for w in words]
    unit = (end - start) / sum(a + b for a, b in parts)
    out, at = [], start
    for w, (a, b) in zip(words, parts):
        out.append([w, round(at, 3), round(at + a * unit, 3)])
        at += (a + b) * unit
    return out


def align_words(script, heard, total):
    """Put the SCRIPT's words on the clock Whisper heard: (words as [word, start, end], share of script words matched).
    heard is Whisper's [word, start, end]. Words that match (ignoring case and punctuation) take Whisper's times; the ones in
    between (a number Whisper wrote out, a word it missed) share the time between their neighbours by estimate_words."""
    a, b = [norm(w) for w in script], [norm(h[0]) for h in heard]
    b_idx = [j for j, x in enumerate(b) if x]
    b = [b[j] for j in b_idx]
    matched = {}
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            if a[blk.a + k]:
                h = heard[b_idx[blk.b + k]]
                matched[blk.a + k] = (float(h[1]), float(h[2]))
    out = [None] * len(script)
    for i, (s, e) in matched.items():
        out[i] = [script[i], s, e]
    i = 0
    while i < len(script):
        if out[i] is not None:
            i += 1
            continue
        j = i
        while j < len(script) and out[j] is None:
            j += 1
        lo = out[i - 1][2] if i else 0.0
        hi = out[j][1] if j < len(script) else max(total, lo)
        out[i:j] = estimate_words(script[i:j], lo, hi)
        i = j
    prev_e = 0.0
    for item in out:                                        # never backwards, never zero long
        item[1] = max(item[1], prev_e)
        item[2] = max(item[2], item[1] + 0.02)
        prev_e = item[2]
    return [[w, round(s, 3), round(e, 3)] for w, s, e in out], len(matched) / max(1, len(script))


# ── pieces of the script ─────────────────────────────────────────────────────────────────────────────────────────────────
def chunk_text(text, limit):
    """The text cut at sentence ends into pieces of at most `limit` characters (a longer sentence is cut at a comma, then at a
    space), so a long video never meets an engine's limit. Joined with a space they give the text back."""
    text = re.sub(r'\s+', ' ', text).strip()
    if len(text) <= limit:
        return [text] if text else []
    sentences = re.findall(r'.+?(?:[.!?…。！？]+["\'”’)\]]*(?:\s+|$)|$)', text)
    pieces = []
    for s in sentences:
        s = s.strip()
        while len(s) > limit:
            cut = max(s.rfind(', ', 0, limit), s.rfind('; ', 0, limit))
            cut = cut + 1 if cut > limit // 3 else s.rfind(' ', 0, limit)
            if cut <= 0:
                cut = limit
            pieces.append(s[:cut].strip())
            s = s[cut:].strip()
        if s:
            pieces.append(s)
    out, cur = [], ''
    for p in pieces:
        if cur and len(cur) + 1 + len(p) > limit:
            out.append(cur)
            cur = p
        else:
            cur = f'{cur} {p}'.strip()
    if cur:
        out.append(cur)
    return out


# ── your own command ─────────────────────────────────────────────────────────────────────────────────────────────────────
def split_command(template, posix=None):
    """A command template as a list of words, with no shell: whitespace separates words, '...' and "..." group (and are
    removed); on Linux and macOS a backslash escapes the next character outside quotes and \\" \\\\ inside double quotes, on Windows
    a backslash is just a character (paths). Nothing else is special: no $VARS, no ~, no globs, no ; | & > operators."""
    posix = (os.name != 'nt') if posix is None else posix
    words, cur, quote, have = [], '', None, False
    i = 0
    while i < len(template):
        ch = template[i]
        if quote:
            if ch == quote:
                quote = None
            elif ch == '\\' and posix and quote == '"' and i + 1 < len(template) and template[i + 1] in '"\\':
                i += 1
                cur += template[i]
            else:
                cur += ch
        elif ch in '"\'':
            quote, have = ch, True
        elif ch == '\\' and posix and i + 1 < len(template):
            i += 1
            cur, have = cur + template[i], True
        elif ch.isspace():
            if have or cur:
                words.append(cur)
                cur, have = '', False
        else:
            cur, have = cur + ch, True
        i += 1
    if quote:
        raise ValueError('the command has an unclosed quote')
    if have or cur:
        words.append(cur)
    return words


def command_argv(template, text_file, audio_file, posix=None):
    """The argv to run for one piece: the template's words with {text_file} and {audio_file} replaced (nothing else is)."""
    words = split_command(template, posix)
    if not words:
        raise ValueError('voice.command is empty')
    if not any('{text_file}' in w for w in words) or not any('{audio_file}' in w for w in words):
        raise ValueError('voice.command must contain both {text_file} and {audio_file}, for example: my-tts --in {text_file} --out {audio_file}')
    return [w.replace('{text_file}', str(text_file)).replace('{audio_file}', str(audio_file)) for w in words]


# ── making the audio ─────────────────────────────────────────────────────────────────────────────────────────────────────
def to_wav(src, dst):
    """Any audio file to the mono 44.1 kHz 16-bit wav the pieces are kept and joined as."""
    done = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(src), '-ac', '1', '-ar', str(RATE),
                           '-c:a', 'pcm_s16le', str(dst)], capture_output=True, text=True)
    if done.returncode != 0 or not Path(dst).is_file():
        fail(TOOL, 'ffmpeg could not read the audio the voice engine wrote: ' + (done.stderr or '').strip()[-400:])


def run_checked(argv, what, **kw):
    try:
        done = subprocess.run(argv, capture_output=True, **kw)
    except (OSError, subprocess.TimeoutExpired) as err:
        fail(TOOL, f'{what} could not run: {err}')
    if done.returncode != 0:
        tail = (done.stderr or b'').decode('utf-8', 'replace').strip()[-400:]
        fail(TOOL, f'{what} stopped with exit code {done.returncode}' + (f': {tail}' if tail else ''))


def engine_run(engine, exe, text, opts, out, work):
    """Speak `text` with the built-in engine into the file `out` (any format ffmpeg reads)."""
    txt = Path(work) / 'text.txt'
    txt.write_text(text, encoding='utf-8')
    voice, rate = opts.get('local_voice'), opts.get('local_rate') or DEFAULT_RATE.get(engine)
    if engine == 'say':
        argv = [exe] + (['-v', str(voice)] if voice else []) + ['-r', str(rate), '-o', str(out), '-f', str(txt)]
        run_checked(argv, 'say')
    elif engine in ('espeak-ng', 'espeak'):
        argv = [exe] + (['-v', str(voice)] if voice else []) + ['-s', str(rate), '-w', str(out), '-f', str(txt)]
        run_checked(argv, engine)
    elif engine == 'piper':
        run_checked([exe, '--model', str(Path(opts['local_model']).expanduser()), '--output_file', str(out)], 'piper', input=text.encode('utf-8'))
    else:                                                   # sapi: values go in through the environment, never into the script text
        env = {**os.environ, 'BU_VOICE': str(voice or ''), 'BU_RATE': str(int(rate or 0)), 'BU_OUT': str(out), 'BU_IN': str(txt)}
        run_checked([exe, '-NoProfile', '-NonInteractive', '-Command', SAPI_SCRIPT], 'PowerShell speech', env=env)


def command_run(template, exe_cwd, text, out, work):
    txt = Path(work) / 'text.txt'
    txt.write_text(text, encoding='utf-8')
    try:
        argv = command_argv(template, txt, out)
    except ValueError as err:
        fail(TOOL, str(err))
    found = shutil.which(argv[0]) or (argv[0] if Path(argv[0]).is_file() else None)
    if not found:
        fail(TOOL, f'voice.command: "{argv[0]}" was not found (give its full path, or put it on PATH)')
    run_checked([found] + argv[1:], 'voice.command', cwd=exe_cwd, timeout=900)
    if not Path(out).is_file() or Path(out).stat().st_size == 0:
        fail(TOOL, 'voice.command ran but wrote no audio to {audio_file}')


def write_joined(wavs, dst):
    """The piece wavs one after another with GAP of silence between them; returns each piece's start second."""
    starts, at = [], 0.0
    with wave.open(str(dst), 'wb') as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        for n, w in enumerate(wavs):
            starts.append(at)
            with wave.open(str(w), 'rb') as part:
                frames = part.readframes(part.getnframes())
                at += part.getnframes() / part.getframerate()
            out.writeframes(frames)
            if n < len(wavs) - 1:
                out.writeframes(b'\0\0' * int(GAP * RATE))
                at += int(GAP * RATE) / RATE
    return starts


def wav_seconds(path):
    with wave.open(str(path), 'rb') as w:
        return w.getnframes() / w.getframerate()


def speak(text, opts, take, provider='local', force=False, cwd=None):
    """Voice `text` piece by piece into the take (mp3). Returns (words as [word, start, end] on the take's clock, info) where info is
    {"provider", "engine", "voice", "timings": "whisper" | "estimated"}. A piece already made (same words, engine, voice and
    settings) is kept in vo_raw/local/ and not made again; --force makes them all again."""
    take = Path(take)
    if provider == 'command':
        template = opts.get('command') or fail(TOOL, 'provider "command" needs brand.json voice.command, for example "my-tts --in {text_file} --out {audio_file}"')
        try:
            command_argv(template, 'x.txt', 'x.mp3')
        except ValueError as err:
            fail(TOOL, str(err))
        engine, exe, voice = Path(split_command(template)[0]).name, None, ''
        ident = template
    else:
        engine, exe = find_engine(opts)
        if not engine:
            fail(TOOL, exe)
        voice = str(opts.get('local_voice') or '')
        ident = json.dumps([engine, voice, opts.get('local_rate') or DEFAULT_RATE.get(engine), str(opts.get('local_model') or '')])
    limit = int(opts.get('chunk_chars') or DEFAULT_CHUNK.get('command' if provider == 'command' else engine, 1500))
    pieces = chunk_text(text, max(200, limit))
    if not pieces:
        fail(TOOL, 'the script has no words to speak')
    cdir = take.parent / 'local'
    if force:
        shutil.rmtree(cdir, ignore_errors=True)
    cdir.mkdir(parents=True, exist_ok=True)
    keys = [hashlib.sha256((ident + '\0' + p).encode('utf-8')).hexdigest()[:16] for p in pieces]
    wavs = [cdir / f'{n:03d}-{k}.wav' for n, k in enumerate(keys, 1)]
    for old in cdir.glob('*.wav'):                          # pieces of an older script or voice
        if old not in wavs and old.name != 'all.wav':
            old.unlink()
    timings = 'whisper' if opts.get('timings') != 'estimated' and whisper_available(opts) else 'estimated'
    state = cdir / 'state.json'
    stamp = hashlib.sha256(json.dumps([keys, timings], sort_keys=True).encode()).hexdigest()
    saved = take.parent / 'words_raw.json'
    try:
        done = json.loads(state.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        done = {}
    if done.get('stamp') == stamp and take.is_file() and saved.is_file() and all(w.is_file() for w in wavs):
        return json.loads(saved.read_text(encoding='utf-8')), done['info']
    for n, (piece, wav) in enumerate(zip(pieces, wavs), 1):
        if wav.is_file():
            continue
        print(f'voice: piece {n}/{len(pieces)} ({len(piece)} characters)', file=sys.stderr)
        work = cdir / f'work-{n:03d}'
        work.mkdir(exist_ok=True)
        raw = work / ('audio.mp3' if provider == 'command' else 'audio.aiff' if engine == 'say' else 'audio.wav')
        try:
            if provider == 'command':
                command_run(template, cwd, piece, raw, work)
            else:
                engine_run(engine, exe, piece, opts, raw, work)
            part = wav.with_suffix('.part.wav')
            to_wav(raw, part)
            if wav_seconds(part) <= 0.05:
                fail(TOOL, f'the voice engine made no sound for piece {n}')
            os.replace(part, wav)
        finally:
            shutil.rmtree(work, ignore_errors=True)
    joined = cdir / 'all.wav'
    starts = write_joined(wavs, joined)
    done_wav = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(joined), '-ac', '1', '-b:a', '192k', str(take)],
                              capture_output=True, text=True)
    if done_wav.returncode != 0:
        fail(TOOL, 'ffmpeg failed: ' + (done_wav.stderr or '').strip()[-400:])
    total = wav_seconds(joined)
    words = None
    if timings == 'whisper':
        try:
            heard = whisper_words(take, opts)
            aligned, share = align_words(script_words(text), heard, total)
            if share >= 0.6:
                words = aligned
            else:
                print(f'voice: Whisper matched only {share:.0%} of the script words; using estimated timings', file=sys.stderr)
        except (SystemExit, subprocess.SubprocessError, OSError, ValueError, KeyError) as err:
            print(f'voice: Whisper could not time the words ({err}); using estimated timings', file=sys.stderr)
    if words is None:
        timings, words = 'estimated', []
        spans = [(s, s + wav_seconds(w)) for s, w in zip(starts, wavs)]
        for piece, (a, b) in zip(pieces, spans):
            words += estimate_words(script_words(piece), a, b)
    info = {'provider': provider, 'engine': engine, 'voice': voice or ('default' if provider == 'local' else ''), 'timings': timings}
    state.write_text(json.dumps({'stamp': stamp, 'info': info}), encoding='utf-8')
    return words, info


# ── command line ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def voices(engine, exe):
    try:
        if engine == 'say':
            return subprocess.run([exe, '-v', '?'], capture_output=True, text=True).stdout
        if engine in ('espeak-ng', 'espeak'):
            return subprocess.run([exe, '--voices'], capture_output=True, text=True).stdout
        if engine == 'sapi':
            script = 'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }'
            return subprocess.run([exe, '-NoProfile', '-Command', script], capture_output=True, text=True).stdout
    except OSError:
        pass
    return 'piper voices are model files: download one (see the piper project) and set voice.local_model to its .onnx path\n'


def main():
    from kitcore import saved_settings
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    opts = dict(saved_settings().get('voice') or {})
    if cmd not in ('check', 'voices'):
        print(__doc__)
        raise SystemExit(1)
    engine, exe = find_engine(opts)
    if cmd == 'check':
        print(f'built-in voice: {engine} ({exe})' if engine else f'built-in voice: none ({exe})')
        print('word timings: ' + ('Whisper (installed)' if whisper_available(opts) else 'estimated (install whisper for exact timings: brew install whisper-cpp, or pip3 install faster-whisper)'))
        print('ElevenLabs key: ' + ('saved' if key_ready('elevenlabs') else 'none'))
    elif engine:
        sys.stdout.write(voices(engine, exe))
    else:
        fail(TOOL, exe)


if __name__ == '__main__':
    main()
