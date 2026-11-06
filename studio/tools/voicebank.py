#!/usr/bin/env python3
"""Find, hear and save the voice your reels speak with (ElevenLabs).

  python3 tools/voicebank.py mine                                  voices already in your ElevenLabs account
  python3 tools/voicebank.py search "warm deep male narrator" [--lang en] [--gender male] [--age middle_aged]
                                                                    look through the public Voice Library (prints preview links)
  python3 tools/voicebank.py preview <voice_id> ["a sample line"]   speak a sample → ~/.config/susanoo-reels/previews/<id>.mp3
  python3 tools/voicebank.py add <owner_id> <voice_id> "<name>"     copy a Library voice into your account (needed before using it)
  python3 tools/voicebank.py use <voice_id> [--name Sam] [--speed 1.15] [--model eleven_v4] [--language en]
                                                                    make it the default voice for every reel
  python3 tools/voicebank.py provider elevenlabs|openai|file [--openai-voice ash]
  python3 tools/voicebank.py show                                   what's saved (keys are never printed, only found/missing)
"""
import json, os, subprocess, sys, urllib.error, urllib.parse, urllib.request

from kitcore import Flags, HOME_CFG, api_key, has_key, saved_settings, store_settings

TOOL = 'voicebank'
ELEVEN = 'https://api.elevenlabs.io'
SAMPLE = "This is how your reels will sound with this voice."


def call(path, query=None, body=None, binary=False):
    url = ELEVEN + path
    if query:
        url += '?' + urllib.parse.urlencode({k: v for k, v in query.items() if v})
    headers = {'xi-api-key': api_key('elevenlabs', TOOL)}
    data = None
    if body is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(body).encode()
    try:
        reply = urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=120)
        return reply.read() if binary else json.load(reply)
    except urllib.error.HTTPError as err:
        sys.exit(f'{TOOL}: ElevenLabs answered HTTP {err.code}: {err.read().decode()[:300]}')


def list_mine(flags):
    for v in call('/v1/voices')['voices']:
        tags = v.get('labels') or {}
        print(f"{v['voice_id']}  {v['name'][:28]:28s} {tags.get('gender', ''):7s} {tags.get('age', ''):12s} "
              f"{tags.get('accent', ''):12s} {v.get('category', '')}")


def search(flags):
    words = ' '.join(flags.positional()[1:])
    found = call('/v1/shared-voices', {'search': words, 'page_size': 12, 'language': flags.get('lang'),
                                        'gender': flags.get('gender'), 'age': flags.get('age'), 'sort': 'trending'})
    for v in found.get('voices', []):
        traits = ' · '.join(x for x in (v.get('gender'), v.get('age'), v.get('accent'), v.get('use_case')) if x)
        print(f"{v['voice_id']}  owner {v['public_owner_id']}\n   {v['name']} · {traits} · used {v.get('cloned_by_count', 0)}x\n"
              f"   {(v.get('description') or '')[:140]}\n   listen: {v.get('preview_url', '')}")
    print('\nTo use one: voicebank.py add <owner> <voice_id> "<name>", then voicebank.py use <voice_id>')


def preview(flags):
    args = flags.positional()
    voice_id = args[1]
    line = args[2] if len(args) > 2 else SAMPLE
    audio = call(f'/v1/text-to-speech/{voice_id}', {'output_format': 'mp3_44100_128'},
                 {'text': line, 'model_id': flags.get('model', 'eleven_multilingual_v2')}, binary=True)
    folder = HOME_CFG / 'previews'
    folder.mkdir(parents=True, exist_ok=True)
    out = folder / f'{voice_id}.mp3'
    out.write_bytes(audio)
    print('sample:', out)
    play(out)


def play(path):
    """Play a sound file on Mac, Windows or Linux; silently do nothing if there is no player."""
    try:
        if sys.platform == 'darwin':
            subprocess.run(['afplay', str(path)])
        elif sys.platform == 'win32':
            os.startfile(str(path))   # opens the default player
        else:
            import shutil
            for cmd in (['ffplay', '-nodisp', '-autoexit', '-loglevel', 'quiet'], ['mpv', '--no-video'], ['paplay'], ['aplay']):
                if shutil.which(cmd[0]):
                    subprocess.run(cmd + [str(path)])
                    break
    except Exception:
        pass


def add(flags):
    args = flags.positional()
    made = call(f'/v1/voices/add/{args[1]}/{args[2]}', body={'new_name': args[3] if len(args) > 3 else 'Reel voice'})
    print('now in your account:', made.get('voice_id', made))


def use(flags):
    settings = saved_settings()
    voice = settings.setdefault('voice', {})
    voice.update({'provider': 'elevenlabs', 'voice_id': flags.positional()[1]})
    for field, kind in (('name', str), ('speed', float), ('model', str), ('language', str)):
        if flags.get(field) is not None:
            voice[field] = kind(flags.get(field))
    store_settings(settings)
    print('default voice saved:', json.dumps(voice))


def provider(flags):
    settings = saved_settings()
    voice = settings.setdefault('voice', {})
    voice['provider'] = flags.positional()[1]
    if flags.get('openai-voice'):
        voice['openai_voice'] = flags.get('openai-voice')
    store_settings(settings)
    print('voice provider:', voice['provider'])


def show(flags):
    print(json.dumps(saved_settings(), indent=2))
    for name in ('elevenlabs', 'openai'):
        print(f'{name} key: {"found" if has_key(name) else "missing"}')


ACTIONS = {'mine': list_mine, 'search': search, 'preview': preview, 'add': add, 'use': use, 'provider': provider, 'show': show}

if __name__ == '__main__':
    flags = Flags()
    words = flags.positional()
    if not words or words[0] not in ACTIONS:
        print(__doc__)
    else:
        ACTIONS[words[0]](flags)
