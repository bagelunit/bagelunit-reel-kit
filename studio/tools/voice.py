#!/usr/bin/env python3
"""voice.py · script.txt in, the reel's voiceover and a clock for every word out.

  python3 tools/voice.py <project>                         speak the script with your saved voice
  python3 tools/voice.py <project> --voice <voice_id>      a different voice, this time only
  python3 tools/voice.py <project> --provider openai       OpenAI speech (word clock from Whisper)
  python3 tools/voice.py <project> --provider file --audio take.mp3    your own recording (word clock from Whisper)
  python3 tools/voice.py <project> --reuse                 re-cut the last take instead of paying for a new one
  tuning: --speed 1.15 (tempo once the pauses are cut)  --gap 0.28 (breath left where a long pause was)  --no-cut

Every mode reads what this writes:
  audio/vo.mp3           the finished voice: long pauses shortened, sped up, levelled to -14 LUFS
  build/words.json       [{"w": word, "s": start, "e": end}], seconds on the finished audio
  build/word_index.txt   "index  start  end  word", the list cue words are picked from
  vo_raw/                the untouched take and its alignment

Which voice and which defaults: tools/voicebank.py (saved in ~/.config/susanoo-reels/config.json); reel.json "voice" overrides per reel.
"""
import base64, io, json, re, shutil, subprocess, urllib.error, urllib.request
from pathlib import Path

from kitcore import (Flags, CJK_CHAR, api_key, fail, ffmpeg, media_length, tidy_word, voice_settings, whisper_words, write_words)

TOOL = 'voice'
LONG_PAUSE = 0.45                 # a pause longer than this is shortened to --gap
FALLBACK_MODEL = 'eleven_multilingual_v2'
FORMATS = ['mp3_44100_192', 'mp3_44100_128']    # Free/Starter plans refuse 192 kbps with HTTP 403; then 128 is used


def words_from_letters(chars, starts, ends):
    """ElevenLabs gives one time per character; join them into [word, start, end]. Whitespace ends a word, every CJK character
    is a word of its own (those scripts have no spaces), and stray punctuation is glued onto the word before it."""
    out, current = [], None
    for ch, a, b in zip(chars, starts, ends):
        cjk = bool(CJK_CHAR.match(ch))
        if ch.isspace() or cjk:
            if current:
                out.append(current)
                current = None
            if cjk:
                out.append([ch, a, b])
        elif current:
            current[0] += ch
            current[2] = b
        else:
            current = [ch, a, b]
    if current:
        out.append(current)
    glued = []
    for item in out:
        if glued and re.fullmatch(r'[^\w]+', item[0]):
            glued[-1] = [glued[-1][0] + item[0], glued[-1][1], item[2]]
        else:
            glued.append(item)
    return glued


def post_json(url, payload, headers):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={**headers, 'Content-Type': 'application/json'})
    return urllib.request.urlopen(req, timeout=300)


def elevenlabs(text, opts, take):
    voice_id = opts.get('voice_id') or fail(TOOL, 'no voice picked yet. Run  python3 tools/voicebank.py search "warm male narrator"  then  voicebank.py use <voice_id>')
    payload = {'text': text, 'voice_settings': {'stability': opts['stability'], 'similarity_boost': opts['similarity'], 'style': opts['style'], 'use_speaker_boost': True}}
    if opts.get('language'):
        payload['language_code'] = opts['language']
    key = {'xi-api-key': api_key('elevenlabs', TOOL)}

    def attempt(model):
        """One model, trying the better audio format first; returns (reply, None) or (None, (code, body))."""
        for fmt in FORMATS:
            url = f'https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps?output_format={fmt}'
            try:
                return json.load(post_json(url, {**payload, 'model_id': model}, key)), None
            except urllib.error.HTTPError as err:
                body = err.read().decode()[:400]
                plan_limit = err.code == 403 and ('output_format' in body or 'subscription_required' in body)
                if plan_limit and fmt != FORMATS[-1]:
                    continue
                return None, (err.code, body)
        return None, (0, 'no format accepted')

    reply, problem = attempt(opts['model'])
    if problem:
        code, body = problem
        if code in (400, 422) and 'model' in body.lower() and opts['model'] != FALLBACK_MODEL:
            print(f'{opts["model"]} is not on this account; voicing with {FALLBACK_MODEL} instead')
            reply, problem = attempt(FALLBACK_MODEL)
            if problem:
                fail(TOOL, f'ElevenLabs answered HTTP {problem[0]}: {problem[1]}')
        elif code == 401:
            fail(TOOL, 'ElevenLabs refused the key, or the account is out of credits: ' + body)
        else:
            fail(TOOL, f'ElevenLabs answered HTTP {code}: {body}')
    take.write_bytes(base64.b64decode(reply['audio_base64']))
    timing = reply.get('normalized_alignment') or reply['alignment']
    (take.parent / 'align.json').write_text(json.dumps(timing))
    return words_from_letters(timing['characters'], timing['character_start_times_seconds'], timing['character_end_times_seconds'])


def openai(text, opts, take):
    payload = {'model': opts.get('openai_model', 'gpt-4o-mini-tts'), 'voice': opts.get('openai_voice', 'ash'), 'input': text, 'format': 'mp3'}
    if opts.get('instructions'):
        payload['instructions'] = opts['instructions']
    try:
        take.write_bytes(post_json('https://api.openai.com/v1/audio/speech', payload, {'Authorization': 'Bearer ' + api_key('openai', TOOL)}).read())
    except urllib.error.HTTPError as err:
        fail(TOOL, f'OpenAI answered HTTP {err.code}: {err.read().decode()[:400]}')
    return whisper_words(take, opts)


def silences(take):
    """(start, end) of every stretch quieter than -35 dB lasting over LONG_PAUSE, from ffmpeg's silencedetect."""
    log = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(take), '-af', f'silencedetect=n=-35dB:d={LONG_PAUSE}', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    return list(zip(map(float, re.findall(r'silence_start: ([\d.]+)', log)), map(float, re.findall(r'silence_end: ([\d.]+)', log))))


class Cut:
    """The parts of the raw take that survive (each long pause loses its middle, a `gap`-long breath stays), and the
    mapping from raw-take seconds to seconds on the finished, sped-up voice."""

    def __init__(self, take, words, gap, cut, speed):
        start, end = max(0.0, words[0][1] - 0.06), min(media_length(take), words[-1][2] + 0.3)
        self.speed, self.spans, edge = speed, [], start
        for q0, q1 in (silences(take) if cut else []):
            if q0 < edge or q1 <= edge or q1 - q0 <= LONG_PAUSE:
                continue
            mid = (q0 + q1) / 2
            self.spans.append((edge, mid - gap / 2))
            edge = mid + gap / 2
        self.spans.append((edge, end))

    def final_time(self, x):
        kept = 0.0
        for a, b in self.spans:
            if x <= b:
                return (kept + max(0.0, x - a)) / self.speed
            kept += b - a
        return kept / self.speed

    def filter_graph(self):
        pieces = ''.join(f'[0:a]atrim={a:.4f}:{b:.4f},asetpts=PTS-STARTPTS[p{n}];' for n, (a, b) in enumerate(self.spans))
        joins = ''.join(f'[p{n}]' for n in range(len(self.spans)))
        return f'{pieces}{joins}concat=n={len(self.spans)}:v=0:a=1,atempo={self.speed},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100[out]'


def record(project, flags, opts, provider, take, saved):
    """The raw take's words as [word, start, end]: from your file, the saved last take (--reuse) or a new synthesis."""
    if provider == 'file':
        shutil.copy(Path(flags.get('audio') or fail(TOOL, '--provider file needs --audio <your recording>')), take)
        return whisper_words(take, opts)
    if flags.on('reuse') and take.exists() and saved.exists():
        return json.loads(saved.read_text(encoding='utf-8'))
    script = Path(flags.get('script') or project / 'script.txt')
    if not script.exists():
        fail(TOOL, f'no script found at {script}')
    speak = {'elevenlabs': elevenlabs, 'openai': openai}.get(provider) or fail(TOOL, f'unknown provider "{provider}" (elevenlabs, openai or file)')
    return speak(re.sub(r'\s+', ' ', script.read_text(encoding='utf-8')).strip(), opts, take)


def main():
    flags = Flags()
    names = flags.positional()
    if not names:
        print(__doc__)
        raise SystemExit(1)
    project = Path(names[0]).resolve()
    opts = voice_settings(project)
    if flags.get('voice'):
        opts['voice_id'] = flags.get('voice')
    provider = flags.get('provider', opts['provider'])
    speed, gap = float(flags.get('speed', opts['speed'])), float(flags.get('gap', opts['gap']))
    for sub in ('vo_raw', 'audio', 'build'):
        (project / sub).mkdir(exist_ok=True)
    take, saved = project / 'vo_raw' / 'raw.mp3', project / 'vo_raw' / 'words_raw.json'

    words = record(project, flags, opts, provider, take, saved)
    saved.write_text(json.dumps(words))
    cut = Cut(take, words, gap, not flags.on('no-cut'), speed)
    final = project / 'audio' / 'vo.mp3'
    ffmpeg(['-i', str(take), '-filter_complex', cut.filter_graph(), '-map', '[out]', '-ac', '1', '-b:a', '192k', str(final)], TOOL)
    timed = [{'w': tidy_word(w), 's': round(cut.final_time(a), 3), 'e': round(cut.final_time(b), 3)} for w, a, b in words if tidy_word(w)]
    write_words(project, timed)
    print(f'voice: audio/vo.mp3 {media_length(final):.2f} s (take {media_length(take):.2f} s, {len(cut.spans) - 1} pauses shortened, '
          f'tempo x{speed}) · {len(timed)} words → build/words.json + build/word_index.txt')


if __name__ == '__main__':
    main()
