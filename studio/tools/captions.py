#!/usr/bin/env python3
"""captions.py: can a viewer read the on-screen captions in the time they are up? Facts from the word times, no model, no credits.

  python3 captions.py <reel folder> [--max-cps 17] [--min-seconds 1.0] [--max-words 6] [--json]
  python3 captions.py --srt <file.srt|file.vtt> [--max-cps 17] [--min-seconds 1.0] [--json]
  python3 captions.py --selftest

From <reel>/build/words.json ([{w, s, e}] on the voice's clock) it forms the caption groups the way the print captions do (a group ends at
a comma, full stop, question or exclamation mark, at --max-words words, or at a pause over 0.6 s) and, for each group, the seconds it is on screen:
from its first word to the next group's first word (at most 0.4 s past its own last word, because the kit's captions leave when the
next one comes, not later). With --srt a cue is a group and its own start and end are used.

For each group it prints the characters per second (spaces count, the usual subtitle measure) and the words per minute, and flags
  FAST   more than --max-cps characters per second (default 17, the common subtitle limit)
  SHORT  on screen under --min-seconds (default 1.0) with more than --short-ok-words words (default 2: a one or two word pop caption is
         meant to be quick, and it is the characters per second that decide whether it can be read)
Exit code 1 when anything is flagged, 0 when the captions can be read, 2 when there is nothing to read. Times are in the voice's clock;
the video starts the voice at 0, so they are the times to open in the video."""
import json, re, sys
from pathlib import Path

MAX_CPS = 17.0
MIN_SECONDS = 1.0
LINGER = 0.4
PAUSE = 0.6


def _word(d):
    text = d.get('w', d.get('word', d.get('text', '')))
    return str(text).strip(), float(d.get('s', d.get('start', 0))), float(d.get('e', d.get('end', d.get('s', d.get('start', 0)))))


def group_words(words, max_words=6):
    """words: [(text, start, end)] -> [{'text', 's', 'e', 'words'}] caption groups."""
    groups, cur = [], []

    def flush():
        if cur:
            groups.append({'text': ' '.join(w[0] for w in cur), 's': cur[0][1], 'e': cur[-1][2], 'words': len(cur)})
            cur.clear()

    for w in words:
        if not w[0]:
            continue
        if cur and w[1] - cur[-1][2] > PAUSE:
            flush()
        cur.append(w)
        if re.search(r'[.!?,;:]["”\']?$', w[0]) or len(cur) >= max_words:
            flush()
    flush()
    return groups


def shown_times(groups, linger=LINGER):
    """Seconds on screen: until the next group starts, but not more than `linger` past its own last word."""
    out = []
    for i, g in enumerate(groups):
        end = g['e'] + linger
        if i + 1 < len(groups):
            end = min(end, max(groups[i + 1]['s'], g['e']))
        out.append(max(0.0, end - g['s']))
    return out


def measure(groups, shown, max_cps=MAX_CPS, min_seconds=MIN_SECONDS, short_ok_words=2):
    rows = []
    for g, d in zip(groups, shown):
        chars = len(g['text'])
        cps = chars / d if d > 0 else float('inf')
        wpm = g['words'] / d * 60 if d > 0 else float('inf')
        flags = []
        if cps > max_cps:
            flags.append('FAST')
        if d < min_seconds and g['words'] > short_ok_words:
            flags.append('SHORT')
        rows.append({'start': round(g['s'], 2), 'end': round(g['s'] + d, 2), 'seconds': round(d, 2), 'text': g['text'], 'chars': chars,
                     'words': g['words'], 'cps': round(cps, 1) if cps != float('inf') else None, 'wpm': round(wpm) if wpm != float('inf') else None, 'flags': flags})
    return rows


def parse_subtitles(text):
    """SRT or VTT -> groups (each cue is one) and the seconds each is up."""
    groups, shown = [], []
    for block in re.split(r'\r?\n\s*\r?\n', text.strip()):
        m = re.search(r'(\d+):(\d\d):(\d\d)[.,](\d{1,3})\s*-->\s*(\d+):(\d\d):(\d\d)[.,](\d{1,3})', block)
        if not m:
            continue
        t = lambda h, mi, s, ms: int(h) * 3600 + int(mi) * 60 + int(s) + int(ms.ljust(3, '0')) / 1000
        s, e = t(*m.groups()[:4]), t(*m.groups()[4:])
        body = block[m.end():]
        body = re.sub(r'<[^>]+>', '', ' '.join(l.strip() for l in body.splitlines() if l.strip()))
        if not body:
            continue
        groups.append({'text': body, 's': s, 'e': e, 'words': len(body.split())})
        shown.append(e - s)
    return groups, shown


def report(rows, max_cps, min_seconds):
    flagged = [r for r in rows if r['flags']]
    lines = [f'{len(rows)} caption group(s); limits: {max_cps:g} characters per second, {min_seconds:g} s on screen.']
    for r in flagged:
        lines.append(f'  {"+".join(r["flags"]):<10} {r["start"]:6.2f}-{r["end"]:6.2f} s ({r["seconds"]:.2f} s)  {r["cps"]} chars/s, {r["wpm"]} words/min  "{r["text"]}"')
    if rows:
        cps = [r['cps'] for r in rows if r['cps'] is not None]
        lines.append(f'fastest {max(cps):.1f} chars/s, median {sorted(cps)[len(cps) // 2]:.1f}; {len(flagged)} flagged.')
    return '\n'.join(lines)


def selftest():
    # grouping: punctuation, a pause and the word cap end a group
    ws = [('Save', 0.0, 0.3), ('this.', 0.3, 0.7), ('Then', 0.8, 1.0), ('wait', 1.0, 1.3), ('a', 1.3, 1.4), ('minute', 1.4, 1.9), ('before', 3.0, 3.4), ('you', 3.4, 3.6)]
    g = group_words(ws)
    assert [x['text'] for x in g] == ['Save this.', 'Then wait a minute', 'before you'], [x['text'] for x in g]
    assert len(group_words([(f'w{i}', i * .2, i * .2 + .2) for i in range(14)], 6)) == 3
    # on screen until the next group starts, at most 0.4 s past its own last word
    sh = shown_times(g)
    assert abs(sh[0] - 0.8) < 1e-9 and abs(sh[1] - 1.5) < 1e-9 and abs(sh[2] - 1.0) < 1e-9, sh
    # a readable caption is not flagged; a crammed one is, with its time
    easy = [{'text': 'Save this for later', 's': 10.0, 'e': 12.0, 'words': 4}]
    assert not measure(easy, shown_times(easy))[0]['flags']
    fast = [{'text': 'Twenty one thousand reasons to wait', 's': 5.0, 'e': 6.2, 'words': 6}]
    r = measure(fast, [1.2])[0]
    assert r['flags'] == ['FAST'] and r['cps'] == round(35 / 1.2, 1) and r['start'] == 5.0, r
    assert r['wpm'] == 300
    # a 17.0 chars per second caption is at the limit, not over it: 34 characters in 2 s
    edge = [{'text': 'a' * 34, 's': 0, 'e': 2, 'words': 1}]
    assert measure(edge, [2.0])[0]['flags'] == []
    # short on screen: flagged for 3 or more words, left alone for a one or two word pop
    three = [{'text': 'one two three', 's': 0, 'e': 0.8, 'words': 3}]
    assert 'SHORT' in measure(three, [0.8])[0]['flags']
    pop = [{'text': 'wait', 's': 0, 'e': 0.4, 'words': 1}]
    assert measure(pop, [0.4])[0]['flags'] == []
    assert measure(pop, [0.4], short_ok_words=0)[0]['flags'] == ['SHORT']
    # SRT and VTT
    srt = "1\n00:00:01,000 --> 00:00:02,000\nThis caption holds far too many letters to read\n\n2\n00:00:02,000 --> 00:00:05,000\nEasy to read.\n"
    gs, sh = parse_subtitles(srt)
    rows = measure(gs, sh)
    assert rows[0]['flags'] == ['FAST'] and rows[1]['flags'] == [] and rows[0]['start'] == 1.0, rows
    vtt = "WEBVTT\n\n00:01.000 --> 00:02.000\nno hours form is not valid here\n".replace('00:01.000', '00:00:01.000').replace('00:02.000', '00:00:02.000')
    assert len(parse_subtitles(vtt)[0]) == 1
    # words.json written with the other key names still reads
    assert _word({'word': 'hi', 'start': 1, 'end': 2}) == ('hi', 1.0, 2.0)
    print('captions selftest: ok')


def main():
    a = sys.argv[1:]
    if '--selftest' in a:
        return selftest()
    if not a or a[0].startswith('--') and '--srt' not in a:
        sys.exit(__doc__)
    opt = lambda k, d: float(a[a.index(k) + 1]) if k in a else d
    max_cps, min_s = opt('--max-cps', MAX_CPS), opt('--min-seconds', MIN_SECONDS)
    if '--srt' in a:
        f = Path(a[a.index('--srt') + 1])
        if not f.is_file():
            sys.exit(f'captions: no file {f}')
        groups, shown = parse_subtitles(f.read_text(encoding='utf-8-sig'))
        name = f.name
    else:
        reel = Path(a[0])
        wf = reel / 'build' / 'words.json'
        if not wf.is_file():
            sys.exit(f'captions: no {wf} (voice the script first, or point at a subtitle file with --srt)')
        words = [_word(d) for d in json.loads(wf.read_text(encoding='utf-8'))]
        groups = group_words(words, int(opt('--max-words', 6)))
        shown = shown_times(groups)
        name = reel.name
    if not groups:
        print('captions: nothing to read (no words or no cues)')
        sys.exit(2)
    rows = measure(groups, shown, max_cps, min_s, int(opt('--short-ok-words', 2)))
    if '--json' in a:
        print(json.dumps({'reel': name, 'max_cps': max_cps, 'min_seconds': min_s, 'groups': rows, 'flagged': sum(1 for r in rows if r['flags'])}, indent=1))
    else:
        print(report(rows, max_cps, min_s))
    sys.exit(1 if any(r['flags'] for r in rows) else 0)


if __name__ == '__main__':
    main()
