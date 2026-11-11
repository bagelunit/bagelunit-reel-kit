#!/usr/bin/env python3
"""budget.py - will this script fit in the ElevenLabs credits left? Run it before Gate A (before any voice is made).

  python3 budget.py reels/<slug>/script.txt [--takes 2]
  python3 budget.py --left [--json]       just the account: characters left, the monthly allowance, the reset date
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


def subscription():
    """The account's subscription (a free read with the saved key) as (dict, None), or (None, why)."""
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
    return sub, None


def credits_left():
    sub, why = subscription()
    if sub is None:
        return None, why
    return int(sub.get('character_limit', 0)) - int(sub.get('character_count', 0)), None


def account(sub):
    """What the pace suggestion needs: left, the monthly allowance, the reset date (ISO, UTC) and the plan's name."""
    limit = int(sub.get('character_limit', 0) or 0)
    reset = sub.get('next_character_count_reset_unix')
    when = None
    if reset:
        import datetime
        when = datetime.datetime.fromtimestamp(int(reset), datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    return {'left': limit - int(sub.get('character_count', 0) or 0), 'limit': limit, 'reset': when, 'tier': sub.get('tier')}


def selftest():
    assert count_chars("Save   this.\n\n# note\n[pause]\nThree steps.") == len("Save this. Three steps.")
    assert verdict(800, 5000)[0] == 'OK' and verdict(800, 900)[0] == 'TIGHT' and verdict(800, 100)[0] == 'NOT ENOUGH'
    assert verdict(800, None)[0] == 'UNKNOWN'
    a = account({'character_limit': 100000, 'character_count': 25000, 'next_character_count_reset_unix': 1893456000, 'tier': 'creator'})
    assert a == {'left': 75000, 'limit': 100000, 'reset': '2030-01-01T00:00:00Z', 'tier': 'creator'}, a
    print('selftest OK')


def main():
    a = sys.argv[1:]
    if '--selftest' in a:
        return selftest()
    takes = 2
    if '--takes' in a:
        i = a.index('--takes'); takes = int(a[i + 1]); del a[i:i + 2]
    if '--left' in a:
        sub, why = subscription()
        if sub is None:
            print(json.dumps({'left': None, 'why': why}) if '--json' in a else f'credits: unknown ({why})')
            sys.exit(0)
        info = account(sub)
        print(json.dumps(info) if '--json' in a else f"credits: {info['left']:,} characters left of {info['limit']:,} a month" + (f", resets {info['reset'][:10]}" if info['reset'] else ''))
        return
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
