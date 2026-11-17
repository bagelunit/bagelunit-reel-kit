#!/usr/bin/env python3
"""scriptlint.py: does this script make sense when it is heard once? Deterministic checks, no model, no credits.

  python3 scriptlint.py <reel folder> [--seconds 45] [--json]
  python3 scriptlint.py <reel folder> --hash     (the script's fingerprint, 12 hex characters, for the Gate A review line)
  python3 scriptlint.py --selftest

Reads <reel>/script.txt (the spoken words; lines starting with #, // or [ are notes) and, when it exists,
<reel>/script-plan.json (the beat outline written by /script-plan). Writes <reel>/build/script-lint.md.
Exit code 1 when there is any ERROR. ERROR is for things that are plainly wrong (a count that does not match the items,
a loop that is opened and never closed in the plan, a sentence too long to say in one breath, a menu path spoken aloud, a
script over its time). WARN is for things a person or the cold reader should judge.

Checks: announced count vs the items said; a list with no announced count; loop openers; plan coverage (every loop closed,
every item has a so-what, the item count, the word budget); sentence length; fragments; repeated openers; jargon with no
plain explanation; spoken menu paths, links and commands; too many spoken numbers or names; fact-check qualifiers in the
voice; names that appear only at the end (a tangent); and seconds from the brand's own measured pace.
brand/jargon.md (one term per line under "## Terms", optional "term | plain swap") adds the brand's own jargon words."""
import json, re, statistics, sys
from pathlib import Path

NUM = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10}
NUMRE = '|'.join(NUM) + r'|\d{1,2}'
ITEM_NOUNS = ('things|ways|tips|rules|mistakes|traps|steps|prompts|reasons|signs|updates|tools|questions|risks|checks|habits|lessons|'
              'ideas|hacks|problems|fixes|secrets|trends|changes|shortcuts|templates|apps|features|myths|moves|tricks|skills|stories|examples')
ANNOUNCE = re.compile(rf'\b({NUMRE})\s+(?:[A-Za-z\'-]+\s+){{0,2}}(?:{ITEM_NOUNS})\b', re.I)
ENUM = re.compile(rf'^(?:({"|".join(NUM)})\s*[.:,]|(\d{{1,2}})\s*[:.)]|(?:number|rule|step|prompt|tip|trap|update|mistake)\s+({NUMRE})\s*[.:,])', re.I)
LOOPS = [r'\bthe biggest (?:one|thing|change)\b', r'\bthe one (?:that|thing)\b', r'\bone fix\b', r'\bhere\'?s why\b', r'\bwhat gets left behind\b',
         r'\bisn\'?t the (?:risky|hard|scary) part\b', r'\bone\'?s got a deadline\b', r'\bwait (?:for|till|until)\b', r'\bbut (?:first|here\'?s the catch)\b',
         r'\bthe (?:real|actual) (?:problem|reason|risk)\b', r'\bi\'?ll (?:break|explain|show) (?:it|this|that) (?:down )?(?:in|on|monday|later|next)\b',
         r'\bnobody (?:tells|talks about)\b', r'\bthe (?:last|final) one\b(?! is)']
DEFAULT_JARGON = ['api', 'tokens', 'plugin', 'sdk', 'webhook', 'session replay', 'safe harbor', 'wiretap', 'credential', 'llm', 'mcp', 'embeddings',
                  'inference', 'latency', 'fine-tune', 'fine-tuning', 'agentic', 'rag', 'prompt injection', 'context window', 'open source', 'repo']
EXPLAIN = re.compile(r'\b(means|is a|is the|are the|that is|that\'?s|which is|i\.e\.|basically|in other words|like a|think of|it lets|lets you)\b|,\s*(?:a|an|the)\s', re.I)
HEDGES = re.compile(r'\b(may|might|could|eligible|rolling out|depending|in certain|some (?:users|stores|accounts)|not every|at every|once it shows up|if available|subject to)\b', re.I)
NAMES_OK = {'I', 'I\'m', 'I\'ll', 'I\'ve', 'And', 'But', 'So', 'The', 'This', 'That', 'It', 'If', 'Is', 'Do', 'Does', 'Not', 'No', 'Yes', 'One', 'Two', 'Three', 'Four', 'Five', 'Six',
            'Seven', 'Eight', 'Nine', 'Ten', 'Here', 'Save', 'Follow', 'Send', 'Share', 'Comment', 'Same', 'Now', 'Then', 'Next', 'First', 'Last', 'Neither', 'Your', 'You', 'Who', 'What',
            'When', 'Why', 'How', 'Where', 'Built', 'Per', 'Up', 'Like', 'Are', 'Can', 'Will', 'Have', 'Has', 'Just', 'Only', 'Also', 'Still', 'Even', 'Every', 'Most', 'Some', 'Any',
            'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'December', 'November', 'January', 'February', 'March', 'April', 'May', 'June', 'July',
            'August', 'September', 'October'}
DEFAULT_PACE = 3.2


def find_root(start):
    for p in [start.resolve()] + list(start.resolve().parents):
        if (p / 'brand' / 'brand.json').exists():
            return p
    return None


def spoken_text(raw):
    lines = [l.strip() for l in raw.splitlines() if l.strip() and not l.strip().startswith(('#', '//', '['))]
    return lines


def sentences(lines):
    out = []
    for l in lines:
        for s in re.split(r'(?<=[.!?])\s+(?=[A-Z0-9"“\'])', l):
            s = s.strip()
            if s:
                out.append(s)
    return out


def words(s):
    return re.findall(r"[A-Za-z0-9$%][A-Za-z0-9$%.,'’\-]*", s)


def pace_for(root):
    """The brand's own measured words per second: the median of past reels' build/words.json (fallback 3.2)."""
    if not root:
        return DEFAULT_PACE, 'default'
    rates = []
    for f in list((root / 'reels').rglob('build/words.json'))[:60]:
        try:
            w = json.loads(f.read_text())
            if len(w) > 30 and w[-1]['e'] > 10:
                rates.append(len(w) / (w[-1]['e'] - w[0]['s']))
        except Exception:
            pass
    return (round(statistics.median(rates), 2), f'median of {len(rates)} reels') if len(rates) >= 3 else (DEFAULT_PACE, 'default')


def lint(text, plan=None, jargon_extra=(), seconds=45, pace=DEFAULT_PACE, cta_keyword=None):
    """-> list of (level, where, message). where is a sentence number or a name."""
    out = []
    add = lambda lvl, where, msg: out.append((lvl, where, msg))
    lines = spoken_text(text)
    sents = sentences(lines)
    flat = ' '.join(sents)
    nwords = len(words(flat))
    if '{{' in text:
        add('ERROR', 'script', 'a {{needs cleared fact}} placeholder is still in the script')

    # time and size
    est = nwords / pace
    if est > seconds:
        add('ERROR', 'script', f'{nwords} words is about {est:.0f} s at {pace} words a second; the brief is {seconds} s. Cut to about {int(seconds * pace)} words')
    elif nwords > 135 and seconds <= 45:
        add('WARN', 'script', f'{nwords} words is long for {seconds} s; about {int(seconds * pace * 0.92)} reads comfortably')
    if nwords < 70:
        add('WARN', 'script', f'only {nwords} words: is there enough to keep a viewer to the end?')

    # announced count vs items said
    first3 = ' '.join(sents[:3])
    m = ANNOUNCE.search(first3)
    announced = None
    if m:
        t = m.group(1).lower()
        announced = NUM[t] if t in NUM else int(t)
    nums = []
    for i, s in enumerate(sents, 1):
        e = ENUM.match(s)
        if e:
            g = next(x for x in e.groups() if x)
            nums.append((i, NUM[g.lower()] if g.lower() in NUM else int(g)))
    seq = [n for _, n in nums]
    consecutive = seq == list(range(1, len(seq) + 1))
    if len(seq) >= 2 and not consecutive:
        add('ERROR', nums[0][0], f'the list is numbered {seq}: it should run 1, 2, 3 in order with none missing')
    if announced and seq and max(seq) != announced:
        add('ERROR', nums[0][0], f'the opening announces {announced} but the list says {max(seq)}: the viewer is counting')
    elif announced and len(seq) < 2 and announced >= 3:
        add('ERROR', 'script', f'the opening announces {announced} but the items are not numbered out loud ("One.", "Two."...), so the viewer cannot count them')
    if not announced and len(seq) >= 3:
        add('ERROR', nums[0][0], f'a list of {max(seq)} is numbered but never announced: say the count in the first sentences ("Three things...") or drop the numbers')
    if announced and len(seq) >= 2:
        # text after the last item that starts a new instruction is a second reel
        last_i = nums[-1][0]
        tail = sents[last_i:]
        if len(tail) > 4:
            add('WARN', last_i, f'{len(tail)} sentences after the last list item: one item may be too long, or a second topic started')
    if len(seq) >= 6:
        add('WARN', nums[0][0], f'{max(seq)} items in one short reel: each gets under {int(nwords / max(seq))} words, too few for a so-what')

    # sentence length and fragments
    frags = []
    for i, s in enumerate(sents, 1):
        n = len(words(s))
        if n > 28:
            add('ERROR', i, f'{n} words in one sentence: too long to say in one breath. Split it: "{s[:70]}..."')
        elif n > 22:
            add('WARN', i, f'{n} words in one sentence: "{s[:70]}..."')
        if n <= 3 and not ENUM.match(s) and not re.search(r'\d', s) and n >= 1:
            frags.append((i, s))
    if len(frags) > 2:
        add('WARN', frags[0][0], f'{len(frags)} very short fragments ({"; ".join(repr(s) for _, s in frags[:4])}): a fragment must be a clear thought with something to point to, not a punch')

    # repeated openers and repeated claims
    starts = [s.split()[0].lower().strip('.,:;!?') for s in sents if not ENUM.match(s) and s.split()]
    for w in set(starts):
        if w not in ('and', 'but', 'so', 'the', 'if') and starts.count(w) >= 4:
            add('WARN', 'script', f'{starts.count(w)} sentences start with "{w}"')
    cw = lambda s: {x.lower() for x in words(s) if len(x) > 4}
    for a in range(min(3, len(sents))):
        for b in range(a + 1, min(3, len(sents))):
            if len(cw(sents[a]) & cw(sents[b])) >= 3:
                add('WARN', a + 1, f'sentences {a + 1} and {b + 1} say nearly the same thing')

    # loop openers
    for i, s in enumerate(sents, 1):
        for p in LOOPS:
            if re.search(p, s, re.I):
                closes = [b for b in (plan or {}).get('beats', []) if b.get('closes')]
                add('WARN' if not plan else 'INFO', i, f'opens a promise ("{s[:60]}"): a later line has to pay it off in words the viewer can use' + ('' if not plan else '; checked against the plan below'))
                break
    qs = [(i, s) for i, s in enumerate(sents[: max(2, len(sents) // 6)], 1) if s.endswith('?')]
    if len(qs) >= 2:
        add('WARN', qs[0][0], f'{len(qs)} questions in the opening: answer the first before asking the next')

    # jargon: needs a plain explanation within 12 words, or belongs on screen
    terms = [t.lower() for t in list(DEFAULT_JARGON) + list(jargon_extra)]
    bad = []
    low = flat.lower()
    for t in sorted(set(terms), key=len, reverse=True):
        for mt in re.finditer(r'\b' + re.escape(t) + r'\b', low):
            after = ' '.join(low[mt.end():].split()[:12])
            before = ' '.join(low[:mt.start()].split()[-8:])
            if not (EXPLAIN.search(after) or EXPLAIN.search(before)):
                bad.append(t)
            break
    if bad:
        add('ERROR' if len(bad) >= 3 else 'WARN', 'script', f'unexplained jargon: {", ".join(bad[:6])}. Say what it means in plain words next to it, or put it on screen only')

    # spoken menu paths, links, commands
    for i, s in enumerate(sents, 1):
        if re.search(r'(?:\b[A-Z][\w\']+(?: [A-Z][\w\']+)*),? then (?:[A-Z][\w\']+)', s) or ' > ' in s or re.search(r'https?://|\b\w+\.(?:com|ai|io|co|app)/\S|`|\s/[a-z-]{3,}', s):
            add('ERROR', i, f'a menu path, link or command is spoken aloud ("{s[:70]}"): put it on screen and say what it does instead')

    # too many spoken facts
    nd = len(re.findall(r'\$?\d[\d,.]*\s?(?:%|percent|million|billion|k)?', flat))
    names = set()
    for s in sents:
        ws = s.split()
        for w in ws[1:]:
            w2 = w.strip('.,:;!?"“”’\'()')
            if w2[:1].isupper() and w2 not in NAMES_OK and len(w2) > 2:
                names.add(w2)
    if nd - len(seq) > 4:
        add('WARN', 'script', f'{nd - len(seq)} numbers spoken: more than four is hard to hold. Keep the ones that decide something and put the rest on screen')
    if len(names) > 6:
        add('WARN', 'script', f'{len(names)} different names spoken ({", ".join(sorted(names)[:8])}): a name list is a screen job')
    nh = len(HEDGES.findall(flat))
    if nh >= 3:
        add('WARN', 'script', f'{nh} qualifiers in the voice ("may", "eligible", "rolling out"...): keep the one that changes what the viewer does and move the rest to the screen or the caption')

    # tangent: a name that first appears late
    if len(sents) >= 8:
        head = ' '.join(sents[: int(len(sents) * 0.75)])
        late = ' '.join(sents[int(len(sents) * 0.75):])
        new = [n for n in re.findall(r'\b[A-Z][a-z]{3,}\b', late) if n not in NAMES_OK and n not in head]
        if new:
            add('WARN', 'script', f'new name(s) only in the last quarter: {", ".join(sorted(set(new))[:4])}. A tangent, or does the hook promise it?')

    # the call to action: reel.json cta.keyword is what the closing scene shows large, so the voice has to say it too
    kw = str(cta_keyword or '').strip()
    if kw and sents:
        if not re.search(r'(?<![A-Za-z0-9])' + re.escape(kw) + r'(?![A-Za-z0-9])', sents[-1], re.I):
            add('WARN', len(sents), f'reel.json cta.keyword is "{kw}" but the last sentence does not say it ("{sents[-1][:60]}"). End on the line that asks for it (for example "Comment {kw.upper()} and I\'ll send it"), or fix the keyword in reel.json')

    # plan checks
    if plan:
        beats = plan.get('beats', [])
        opened, closed = {}, {}
        for idx, b in enumerate(beats):
            for o in b.get('opens', []): opened[o] = idx
            for c in b.get('closes', []): closed[c] = idx
        for k, idx in opened.items():
            if k not in closed:
                add('ERROR', f'beat {beats[idx].get("id", idx + 1)}', f'opens the loop "{k}" and no later beat closes it')
            elif closed[k] < idx:
                add('ERROR', f'beat {beats[idx].get("id", idx + 1)}', f'loop "{k}" closes before it opens')
        for k in closed:
            if k not in opened:
                add('WARN', 'plan', f'a beat closes "{k}" which nothing opened')
        items = [b for b in beats if b.get('role') == 'item']
        for b in items:
            if not str(b.get('so_what', '')).strip():
                add('ERROR', f'beat {b.get("id", "?")}', 'an item with no so-what (what it means for the viewer or what to do)')
        ac = plan.get('announced_count')
        if ac and len(items) != ac:
            add('ERROR', 'plan', f'announced_count is {ac} but the plan has {len(items)} items')
        if beats and not any(b.get('role') == 'payoff' for b in beats):
            add('ERROR', 'plan', 'no payoff beat: what does the viewer walk away with?')
        if not str(plan.get('promise', '')).strip() or not str(plan.get('viewer', '')).strip():
            add('ERROR', 'plan', 'the plan needs one viewer and one promise')
        bw = sum(int(b.get('words', 0)) for b in beats)
        if bw and abs(bw - nwords) > max(15, nwords * 0.2):
            add('WARN', 'plan', f'beats budget {bw} words but the script has {nwords}: the draft drifted from the outline')
    return out, nwords, est


def selftest():
    bad = ("Built an app with AI? Six legal traps can hit before your first sale. One fix costs $6.\n"
           "One. Kids. Collect a child's data without a parent's OK and the FTC can seek $53,088 per violation under COPPA, the rules on kids data that apply once you know they are under thirteen years old.\n"
           "Two. Email. No opt-out?\n"
           "Three. Open My GPTs, then Migrate to plugin, then check the API tokens and the webhook settings.\n"
           "Four. Fonts.\n"
           "Here's the fix. Do it all.\n")
    r, n, _ = lint(bad)
    msgs = ' | '.join(m for _, _, m in r)
    assert any('announces 6' in m for _, _, m in r), msgs
    assert any('too long to say' in m for _, _, m in r), msgs
    assert any('menu path' in m for _, _, m in r), msgs
    assert any('unexplained jargon' in m for _, _, m in r), msgs
    unannounced = "You can fix this. One. Wash it. Two. Dry it. Three. Fold it. Done."
    r, _, _ = lint(unannounced)
    assert any('never announced' in m for _, _, m in r), r
    good = ("Three things a shop owner should check before an AI pays at their store. Here is the first.\n"
            "One. The AI never sees the real card number, it uses a stand-in number. So the number on your receipt will not match the customer's card, and that is normal.\n"
            "Two. A payment that shows as approved is not an order yet. Wait for your own shop's confirmation before you pack the box.\n"
            "Three. If a customer agrees to a repeat plan, you may keep their payment details and charge again on the dates they agreed to. Write those dates down in plain words.\n"
            "That is the check: stand-in numbers, your own confirmation, and plain dates. Save this before a customer asks.")
    r, n, _ = lint(good, seconds=45)
    errs = [m for lvl, _, m in r if lvl == 'ERROR']
    assert not errs, errs
    plan = {'viewer': 'a shop owner', 'promise': 'three checks', 'announced_count': 3, 'beats': [
        {'id': 1, 'role': 'context', 'opens': ['checks']}, {'id': 2, 'role': 'item', 'so_what': 'receipt will not match'},
        {'id': 3, 'role': 'item', 'so_what': ''}, {'id': 4, 'role': 'item', 'so_what': 'write dates'}, {'id': 5, 'role': 'payoff'}]}
    r, _, _ = lint(good, plan=plan)
    msgs = [m for lvl, _, m in r if lvl == 'ERROR']
    assert any('no later beat closes' in m for m in msgs) and any('no so-what' in m for m in msgs), msgs
    # the keyword CTA: the last sentence has to say reel.json cta.keyword; no keyword, no check
    ends = "Three checks before launch. Do them in this order, every time.\nComment BAKE and I'll send you the whole setup."
    assert not [m for _, _, m in lint(ends, cta_keyword='bake')[0] if 'cta.keyword' in m]
    miss = [m for _, _, m in lint(ends, cta_keyword='LINK')[0] if 'cta.keyword' in m]
    assert miss and '"LINK"' in miss[0], miss
    assert not [m for _, _, m in lint(ends)[0] if 'cta.keyword' in m]
    assert [m for _, _, m in lint("Comment BAKE for the setup. Then wait.", cta_keyword='BAKE')[0] if 'cta.keyword' in m], 'keyword said early only'
    assert [m for _, _, m in lint("Say BAKERY loudly.", cta_keyword='BAKE')[0] if 'cta.keyword' in m], 'BAKERY is not BAKE'
    print('scriptlint selftest: ok')


def main():
    a = sys.argv[1:]
    if '--selftest' in a:
        return selftest()
    if '--hash' in a:
        from kitcore import spoken_hash
        h = spoken_hash(Path(a[0]) / 'script.txt' if not a[0].startswith('--') else '')
        sys.exit('scriptlint: no script.txt') if not h else print(h)
        return
    if not a or a[0].startswith('--'):
        sys.exit(__doc__)
    reel = Path(a[0])
    f = reel / 'script.txt'
    plan_only = not f.exists() and (reel / 'script-plan.json').exists()   # /script-plan checks the outline before any draft exists
    if not f.exists() and not plan_only:
        sys.exit(f'scriptlint: no script.txt in {reel}')
    seconds = float(a[a.index('--seconds') + 1]) if '--seconds' in a else 45
    root = find_root(reel)
    pace, pace_src = pace_for(root)
    extra = []
    if root and (root / 'brand' / 'jargon.md').exists():
        jt = (root / 'brand' / 'jargon.md').read_text()
        jt = jt.split('## Terms', 1)[1] if '## Terms' in jt else jt          # the starter's explanation sits above "## Terms"
        extra = [l.split('|')[0].strip(' -*`').lower() for l in jt.splitlines() if l.strip() and not l.startswith(('#', '`'))]
        extra = [t for t in extra if 1 < len(t) < 40]
    plan = None
    pf = reel / 'script-plan.json'
    if pf.exists():
        try:
            plan = json.loads(pf.read_text())
        except Exception as e:
            sys.exit(f'scriptlint: script-plan.json is not valid JSON: {e}')
    cta_kw = None
    try:
        cta = (json.loads((reel / 'reel.json').read_text(encoding='utf-8')) or {}).get('cta')
        cta_kw = cta.get('keyword') if isinstance(cta, dict) else None
    except Exception:
        pass   # no reel.json, or one that is not valid JSON yet: no keyword check
    res, nwords, est = lint('' if plan_only else f.read_text(), plan, extra, seconds, pace, cta_kw)
    if plan_only:
        res = [r for r in res if r[1] != 'script']
    errs = [r for r in res if r[0] == 'ERROR']
    if '--json' in a:
        print(json.dumps({'words': nwords, 'seconds': round(est, 1), 'pace': pace, 'errors': len(errs), 'findings': res}, indent=1))
    lines = [f'# Script lint: {reel.name}', '',
             f'{nwords} words, about {est:.0f} s at {pace} words a second ({pace_src}); brief {seconds:.0f} s. {len(errs)} error(s), {sum(1 for r in res if r[0] == "WARN")} warning(s).', '']
    for lvl in ('ERROR', 'WARN', 'INFO'):
        for _, where, msg in [r for r in res if r[0] == lvl]:
            lines.append(f'- **{lvl}** ({"sentence " if isinstance(where, int) else ""}{where}): {msg}')
    if not res:
        lines.append('Clean.')
    lines += ['', 'ERROR must be fixed before the script is shown. Answer each WARN in one line (fix it, or why it is fine). Then run the cold read (/script-coldread).']
    (reel / 'build').mkdir(exist_ok=True)
    (reel / 'build' / 'script-lint.md').write_text('\n'.join(lines) + '\n')
    if '--json' not in a:
        print('\n'.join(lines))
    sys.exit(1 if errs else 0)


if __name__ == '__main__':
    main()
