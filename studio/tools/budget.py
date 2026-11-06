#!/usr/bin/env python3
"""budget.py - will this script fit in the ElevenLabs credits left? Run it before Gate A (before any voice is made).

  python3 budget.py reels/<slug>/script.txt [--takes 2]
  python3 budget.py --selftest

Counts the script's characters (what the voice step sends), asks ElevenLabs how many characters the account has left
(a free read of your own subscription, using your saved key; the key is never printed), and says OK / TIGHT / NOT ENOUGH.
--takes is how many times you might voice it (default 2: one take plus one redo). Standard library only.
"""
import json, re, sys, urllib.error, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def count_chars(text):
    """Characters the voice step would send: the spoken text, whitespace collapsed, no stage-direction lines."""
    lines = [l for l in text.splitlines() if l.strip() and not l.strip().startswith(('#', '//', '['))]
    return len(re.sub(r"\s+", " ", " ".join(lines)).strip())


def verdict(need, left):
    if left is None:
        return 'UNKNOWN', 'could not read the credits left'
    if left >= need * 1.5:
        return 'OK', f'enough: {left:,} left for about {need:,}'
    if left >= need:
        return 'TIGHT', f'just enough: {left:,} left for about {need:,}, with little room for a redo'
    return 'NOT ENOUGH', f'short by about {need - left:,}: top up, wait for the monthly reset, or shorten the script'


def credits_left():
    from kitcore import api_key
    try:
        key = api_key('elevenlabs', 'budget')
    except SystemExit as e:
        return None, str(e) if str(e) else 'no ElevenLabs key saved yet'
    req = urllib.request.Request('https://api.elevenlabs.io/v1/user/subscription', headers={'xi-api-key': key})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            sub = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return None, 'the saved key cannot read credits (it may lack the "User: read" permission)'
        return None, f'ElevenLabs answered {e.code}'
    except (urllib.error.URLError, TimeoutError):
        return None, 'offline right now'
    return int(sub.get('character_limit', 0)) - int(sub.get('character_count', 0)), None


def selftest():
    assert count_chars("Save   this.\n\n# note\n[pause]\nThree steps.") == len("Save this. Three steps.")
    assert verdict(800, 5000)[0] == 'OK' and verdict(800, 900)[0] == 'TIGHT' and verdict(800, 100)[0] == 'NOT ENOUGH'
    assert verdict(800, None)[0] == 'UNKNOWN'
    print('selftest OK')


def main():
    a = sys.argv[1:]
    if '--selftest' in a:
        return selftest()
    takes = 2
    if '--takes' in a:
        i = a.index('--takes'); takes = int(a[i + 1]); del a[i:i + 2]
    if not a:
        sys.exit(__doc__)
    text = Path(a[0]).expanduser().read_text(encoding='utf-8')
    one = count_chars(text)
    need = one * takes
    print(f'script: {one:,} characters; for {takes} take(s) about {need:,}')
    left, why = credits_left()
    v, msg = verdict(need, left)
    print(f'credits: {msg}' + (f' ({why})' if why and left is None else ''))
    print(f'verdict: {v}')
    sys.exit(0 if v in ('OK', 'TIGHT', 'UNKNOWN') else 1)


if __name__ == '__main__':
    main()
