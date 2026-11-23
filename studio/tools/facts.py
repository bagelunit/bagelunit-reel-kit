#!/usr/bin/env python3
"""Fact check, the second look at every claim before it is voiced and before it is approved.

  python3 tools/facts.py <project> [check] [--scope script|final] [--facts path]
  python3 tools/facts.py <project> record --scope script|final --result PASS|FAIL [--note "text"]

<project> is a reel folder (reels/<slug>); the brand's cleared facts are brand/facts.md in the brand folder above the reel, flat or dated (or --facts).

  check    The mechanical half. No network, no keys. It reads brand/facts.md and the reel's words and checks:
           - every facts row has a source and a cleared date (blank = error); a cleared date older than 30 days is a warning;
           - every digit, price or percentage in script.txt, caption.txt (and build/on_screen_text.txt if it exists)
             appears in facts.md (error if not);
           - no {{needs cleared fact}} is left in them (error);
           - lines with absolute or comparative wording (only, never, always, best, better, faster, free, every, can't ...) are
             listed as warnings, because those need a source that says exactly that;
           - each script sentence is paired with the nearest facts row, as a hint (a poor match is a warning);
           - a worksheet is written to build/factcheck.md for the re-read, with the "Never say" list.
           --scope script (default) looks at the script; --scope final also looks at the caption and the on-screen text file,
           and for a talking reel (reel.json style "talking") at the words said on camera, from build/words.json (take.py).
           A new take changes them, so the final record goes out of date.
           It cannot tell whether a source is TRUE. That is the second half: the /reel-factcheck skill re-reads each source
           fresh and records its verdict with `record`.
  on-screen text (scope final)
           `kit render` writes build/on_screen_text.txt for every kind of reel (tools/ontext.mjs; scene styles: tools/scenes.mjs):
           one line per text the page really drew, "[t0-t1s kind] text", read from the page while the frames are drawn (the DOM, and
           canvas text), plus, for a scene style, every text prop of the plan that the page did not draw as one piece (kind
           "scene N: prop name"). Only the text after the "[...]" is checked, so the times never count as numbers, and the
           fingerprint covers that text only, so a change of timing alone does not make a record stale. Caption words are joined into
           lines; a typed-out text is listed once, in full; a counter or clock that ticks is listed by its last value (a value held
           for 0.4 s or more always stays). A text seen for under 0.3 s is marked "fleeting": its numbers not in facts.md are a
           warning (NUMBER-FLEETING), not an error, because no one can read them; every other number is an error as in the script. Lines of
           kind "chrome" (the print engine's own chapter mark "01 THE PROBLEM" and the brand handle) are read for {{needs cleared fact}}
           and absolute wording but their numbers are not checked: a chapter number is not a claim. A readout the reel sets itself is
           content and is checked. Text a 3D scene draws on a texture is a string only (kind "in-scene"). When the file is
           missing the final check prints  SKIP ON-SCREEN-TEXT  and says on-screen text was NOT checked, never OK for it; a file older
           than the reel's files is a warning (render again). A render of only part of the reel (--from/--to) leaves the file alone.
  record   Saves the re-read verdict (PASS or FAIL) for this scope together with a fingerprint of the words and the facts
           table, writes build/facts_check.json and adds a "Fact check:" line under "## Fact check" in approvals.md.
           PASS is refused while `check` still has errors. Change the script, the caption or a facts row afterwards and the
           record is out of date: `kit gate` will ask for a new one.
Exit code 1 when check finds errors.
"""
import hashlib, json, re, sys
from datetime import date, datetime
from pathlib import Path

from kitcore import resolve_reel, Flags, brand_of, fail

TOOL = 'facts'
STALE_DAYS = 30
ABSOLUTES = re.compile(
    r"\b(only|never|always|best|better|worst|fastest|faster|slowest|cheaper|cheapest|free|every|lacks?|without|"
    r"can't|cannot|doesn't|does not|don't|no longer|guarantee[sd]?|unlimited|none|nobody|everyone)\b", re.I)
NUMBER = re.compile(r"(?<![\w#])[$£€]?\d[\d,]*(?:\.\d+)?\s?(?:%|x|k|m|b)?(?![\w])", re.I)
# Spoken quantities. "one" is only a number when a unit follows ("one quiz"), not in "one place".
_SPELLED_ONES = {
    'zero': 0, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
    'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16,
    'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
}
_SPELLED_TENS = {'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90}
_SPELLED_ONE_UNITS = {
    'percent', 'dollar', 'dollars', 'lesson', 'lessons', 'request', 'requests', 'quiz', 'quizzes',
    'course', 'courses', 'hour', 'hours', 'minute', 'minutes', 'week', 'weeks', 'month', 'months',
    'year', 'years', 'user', 'users', 'people', 'day', 'days',
}


def strip_notes(text):
    """Lines starting with #, // or [ are notes, not words the viewer hears. A fact check must not treat them as claims."""
    kept = []
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith('#') or s.startswith('//') or s.startswith('['):
            continue
        kept.append(line)
    return '\n'.join(kept)


def spelled_numbers(text):
    """(surface, digit) for quantities said in words. "fifty" -> "50". "one place" is not a quantity."""
    tokens = re.findall(r"[A-Za-z]+(?:-[A-Za-z]+)?", text)
    out, i = [], 0
    while i < len(tokens):
        raw = tokens[i]
        parts = raw.lower().split('-')
        if len(parts) == 2 and parts[0] in _SPELLED_TENS and parts[1] in _SPELLED_ONES:
            out.append((raw, str(_SPELLED_TENS[parts[0]] + _SPELLED_ONES[parts[1]])))
            i += 1
            continue
        w = parts[0]
        nxt = tokens[i + 1].lower() if i + 1 < len(tokens) else ''
        if w in _SPELLED_TENS and nxt in _SPELLED_ONES:
            out.append((f'{raw} {tokens[i + 1]}', str(_SPELLED_TENS[w] + _SPELLED_ONES[nxt])))
            i += 2
            continue
        if w in _SPELLED_TENS or w in _SPELLED_ONES:
            val = _SPELLED_TENS[w] if w in _SPELLED_TENS else _SPELLED_ONES[w]
            out.append((raw, str(val)))
            i += 1
            continue
        if w == 'one' and nxt in _SPELLED_ONE_UNITS:
            out.append((raw, '1'))
        i += 1
    return out


def number_is_cleared(token, facts_numbers, facts_blob):
    """A digit or a spelled quantity is cleared when facts.md holds that number, or the words themselves."""
    key = re.sub(r'[\s,]', '', token.lower())
    if key in facts_numbers:
        return True
    bare = re.sub(r'^[$£€]', '', key)
    if bare in facts_numbers or f'${bare}' in facts_numbers or f'£{bare}' in facts_numbers or f'€{bare}' in facts_numbers:
        return True
    return token.lower() in facts_blob.lower()
STOP = set('the a an and or of to in on for with is are be it its this that your you they their them at as by from has have '
           'can will not no but so if then than into out up all any both each also more most one two what when where which who'.split())


def project_paths(project, facts_override=None):
    facts = Path(facts_override) if facts_override else brand_of(project) / 'brand' / 'facts.md'
    return facts


def parse_facts(text):
    """Return (rows, never_say). A row is a dict: claim, source, cleared, notes."""
    rows, never, in_never = [], [], False
    for line in text.splitlines():
        s = line.strip()
        if s.lower().startswith('## never say'):
            in_never = True
            continue
        if s.startswith('## ') and in_never:
            in_never = False
        if in_never and s.startswith('-') and len(s) > 2:
            never.append(s.lstrip('- ').strip())
            continue
        if not s.startswith('|') or re.match(r'^\|[\s\-:|]+\|?$', s):
            continue
        cells = [c.strip() for c in s.strip('|').split('|')]
        if not cells or cells[0].lower().startswith('claim'):
            continue
        cells += [''] * (4 - len(cells))
        if not any(cells[:4]):
            continue
        rows.append({'claim': cells[0], 'source': cells[1], 'cleared': cells[2], 'notes': cells[3]})
    return rows, never


def talking_words(project):
    """For a talking reel the words that count are the ones said on camera, not script.txt (often a pre-shoot draft or the
    starter sample): take.py writes them, as heard, to build/words.json. Returns them as one text, or '' for any other style."""
    try:
        style = json.loads((project / 'reel.json').read_text(encoding='utf-8')).get('style')
    except (OSError, ValueError, AttributeError):
        return ''
    if style != 'talking':
        return ''
    try:
        words = json.loads((project / 'build' / 'words.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return ''
    return ' '.join(str(w.get('w', '')).strip() for w in words if isinstance(w, dict) and str(w.get('w', '')).strip())


ON_SCREEN_LINE = re.compile(r'^\[([^\]\n]*)\]\s*(.*)$')    # "[1.20-3.30s caption] text": the bracket is in front of every line of build/on_screen_text.txt
FLEETING_LABEL = 'on_screen_text.txt (fleeting)'
CHROME_LABEL = 'on_screen_text.txt (engine tag)'      # the print engine's chapter mark and handle: its chapter numbers are not claims
ON_SCREEN_LABELS = ('on_screen_text.txt', FLEETING_LABEL, CHROME_LABEL)
ON_SCREEN_SOURCES = ('reel.json', 'scenes.json', 'timeline.js', 'cuts.js', 'index.html', 'scenes.js', 'build/words.json')


def on_screen_path(project):
    return project / 'build' / 'on_screen_text.txt'


def on_screen_stale(project):
    """Name of a file that changed after build/on_screen_text.txt was written (so the text may be out of date), else ''."""
    f = on_screen_path(project)
    if not f.exists():
        return ''
    when = f.stat().st_mtime
    names = list(ON_SCREEN_SOURCES)
    for sub in ('scenes', 'shots'):
        d = project / sub
        if d.is_dir():
            names += [f'{sub}/{p.name}' for p in d.iterdir() if p.suffix == '.js']
    for n in names:
        p = project / n
        if p.is_file() and p.stat().st_mtime > when + 2:
            return n
    return ''


def words_text(project, scope):
    """The reel's words for this scope: [(file label, text)]."""
    out = []
    for label, path in (('script.txt', project / 'script.txt'),):
        raw = path.read_text(encoding='utf-8') if path.exists() else ''
        out.append((label, strip_notes(raw)))
    if scope == 'final':
        spoken = talking_words(project)
        if spoken:
            out.append(('words.json', spoken))
        for label, path in (('caption.txt', project / 'out' / 'caption.txt'),
                            ('caption.txt', project / 'caption.txt'),
                            ('on_screen_text.txt', on_screen_path(project))):
            if path.exists():
                raw = path.read_text(encoding='utf-8')
                if label != 'on_screen_text.txt':
                    out.append((label, raw))
                    continue
                held, fleeting, tag = [], [], []        # "fleeting": on screen under 0.3 s (a rolling counter, a wipe); "chrome": the engine's own tag
                for ln in raw.splitlines():
                    m = ON_SCREEN_LINE.match(ln)
                    bracket, body = (m.group(1), m.group(2)) if m else ('', ln)
                    words = bracket.split()
                    (tag if 'chrome' in words else fleeting if 'fleeting' in words else held).append(body)
                out.append((label, '\n'.join(held)))
                if fleeting:
                    out.append((FLEETING_LABEL, '\n'.join(fleeting)))
                if tag:
                    out.append((CHROME_LABEL, '\n'.join(tag)))
    return out


def fingerprint(project, scope, facts_path):
    """Short hash of exactly what a fact check covers: the words in scope plus the facts table."""
    h = hashlib.sha256()
    for label, text in words_text(project, scope):
        h.update(label.encode() + b'\0' + text.encode('utf-8') + b'\0')
    if facts_path.exists():
        rows, never = parse_facts(facts_path.read_text(encoding='utf-8'))
        h.update(json.dumps([rows, never], sort_keys=True).encode('utf-8'))
    return h.hexdigest()[:12]


def load_state(project):
    p = project / 'build' / 'facts_check.json'
    try:
        return json.loads(p.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def status_for(project, scope, facts_path=None):
    """('PASS'|'FAIL'|'STALE'|'NONE', detail) for gate.py. A final-scope PASS also covers the script scope only if it is current."""
    facts_path = facts_path or project_paths(project)
    rec = load_state(project).get('records', {}).get(scope)
    if not rec:
        return 'NONE', f'no {scope} fact check recorded'
    if rec.get('fingerprint') != fingerprint(project, scope, facts_path):
        return 'STALE', f'the {scope} fact check ({rec.get("at", "?")}) no longer matches the words or facts.md'
    return rec.get('result', 'FAIL'), f'{scope} fact check {rec.get("result")} on {rec.get("at", "?")}'


def sentences(text):
    parts = re.split(r'(?<=[.!?])\s+|\n+', text)
    return [p.strip() for p in parts if len(re.findall(r'[A-Za-z]', p)) >= 3]


def tokens(s):
    return {w for w in re.findall(r"[a-z0-9\.]+", s.lower().replace('.md', '')) if w not in STOP and len(w) > 1}


def nearest(sentence, rows):
    st = tokens(sentence)
    best, score = None, 0.0
    for i, r in enumerate(rows):
        rt = tokens(r['claim'] + ' ' + r['notes'])
        if not st or not rt:
            continue
        sc = len(st & rt) / len(st)
        if sc > score:
            best, score = i, sc
    return best, score


def check(project, scope, facts_path):
    findings = []   # (level, code, where, message)
    if not facts_path.exists():
        fail(TOOL, f'no facts file at {facts_path}')
    rows, never = parse_facts(facts_path.read_text(encoding='utf-8'))
    today = date.today()

    if not rows:
        findings.append(('ERROR', 'NO-FACTS', 'facts.md', 'the table is empty: no claim has been cleared, so the reel can make none'))
    for i, r in enumerate(rows, 1):
        if not r['claim']:
            continue
        if not r['source']:
            findings.append(('ERROR', 'NO-SOURCE', f'facts row {i}', f'"{r["claim"][:60]}" has no source'))
        if not r['cleared']:
            findings.append(('ERROR', 'NOT-CLEARED', f'facts row {i}', f'"{r["claim"][:60]}" has no cleared date'))
        else:
            m = re.search(r'(\d{4})-(\d{2})-(\d{2})', r['cleared'])
            if not m:
                findings.append(('WARN', 'NO-DATE', f'facts row {i}', f'"{r["claim"][:60]}": cleared cell has no yyyy-mm-dd date'))
            else:
                try:
                    age = (today - date(int(m[1]), int(m[2]), int(m[3]))).days
                except ValueError:
                    age = 0
                if age > STALE_DAYS:
                    findings.append(('WARN', 'STALE', f'facts row {i}', f'"{r["claim"][:60]}" was cleared {age} days ago: re-read the source'))

    facts_blob = ' '.join(r['claim'] + ' ' + r['notes'] for r in rows)
    facts_numbers = {re.sub(r'[\s,]', '', n.group(0).lower()) for n in NUMBER.finditer(facts_blob)}
    # A caption's "Sources:" block (studio rule: every reel lists its sources with links) holds citations, not claims:
    # its numbers (volume, pages, DOIs, dates) must match facts.md's SOURCE column instead (local change 2026-11-13).
    source_numbers = {re.sub(r'[\s,]', '', n.group(0).lower()) for n in NUMBER.finditer(' '.join(r['source'] for r in rows))}
    surfaces = []
    for label, text in words_text(project, scope):
        parts = re.split(r'^\s*Sources:\s*$', text, maxsplit=1, flags=re.M) if label == 'caption.txt' else [text]
        surfaces.append((label, parts[0]))
        if len(parts) > 1:
            block = parts[1].split('\n\n')[0]          # up to the hashtag line
            for n in NUMBER.finditer(block):
                tok = re.sub(r'[\s,]', '', n.group(0).lower())
                if tok not in source_numbers:
                    ctx = block[max(0, n.start() - 25): n.end() + 25].replace('\n', ' ')
                    findings.append(('ERROR', 'SOURCE-NOT-IN-FACTS', label, f'"{n.group(0).strip()}" in the Sources block is not in any facts.md source (…{ctx}…)'))
            rest = parts[1].split('\n\n', 1)
            if len(rest) > 1:
                surfaces.append((label, rest[1]))
    if scope == 'final':
        if not on_screen_path(project).exists():
            findings.append(('SKIP', 'ON-SCREEN-TEXT', 'build/on_screen_text.txt', 'SKIPPED: the text drawn on screen was NOT checked, because kit render has not written '
                             'build/on_screen_text.txt (render the reel, whole, then check again); check the text in scenes by eye'))
        else:
            late = on_screen_stale(project)
            if late:
                findings.append(('WARN', 'STALE-ON-SCREEN', 'build/on_screen_text.txt', f'{late} is newer than the on-screen text file: render the reel again so the text checked is the text drawn'))
    if not surfaces[0][1].strip():
        findings.append(('ERROR', 'NO-SCRIPT', 'script.txt', 'script.txt is missing or empty'))
    claims = []
    for label, text in surfaces:
        for m in re.finditer(r'\{\{\s*needs cleared fact.*?\}\}', text, re.I):
            findings.append(('ERROR', 'NEEDS-FACT', label, 'a {{needs cleared fact}} marker is still in the text'))
        # on-screen text is one text per line: a number never runs over a line break, and the finding shows its own line
        chunks = text.splitlines() if label in ON_SCREEN_LABELS else [text]
        for chunk in ([] if label == CHROME_LABEL else chunks):
            for n in NUMBER.finditer(chunk):
                tok = re.sub(r'[\s,]', '', n.group(0).lower())
                if tok not in facts_numbers:
                    ctx = chunk[max(0, n.start() - 25): n.end() + 25].replace('\n', ' ')
                    if label == FLEETING_LABEL:                 # on screen under 0.3 s: too fast to read, so a warning, not a block
                        findings.append(('WARN', 'NUMBER-FLEETING', label, f'"{n.group(0).strip()}" is not in facts.md (…{ctx}…): on screen for under 0.3 s, so check it by eye'))
                    elif re.fullmatch(r'(19|20)\d\d', tok):     # a bare year: low risk, but still say so
                        findings.append(('WARN', 'YEAR', label, f'the year {tok} is not in facts.md (…{ctx}…): true as a date, but check it'))
                    else:
                        findings.append(('ERROR', 'NUMBER-NOT-CLEARED', label, f'"{n.group(0).strip()}" is not in facts.md (…{ctx}…)'))
            if label != CHROME_LABEL:
                for surface, digit in spelled_numbers(chunk):
                    if number_is_cleared(digit, facts_numbers, facts_blob) or number_is_cleared(surface, facts_numbers, facts_blob):
                        continue
                    findings.append(('ERROR', 'NUMBER-NOT-CLEARED', label, f'"{surface}" (spoken {digit}) is not in facts.md'))
        for sent in sentences(text):
            hit = ABSOLUTES.search(sent)
            if hit:
                findings.append(('WARN', 'ABSOLUTE', label, f'"{hit.group(0)}" in: {sent[:90]}. Needs a source that says exactly this'))
            if label in ('script.txt', 'words.json'):      # words.json: what a talking reel actually says
                idx, sc = nearest(sent, rows)
                claims.append({'sentence': sent, 'row': (idx + 1) if idx is not None else None, 'overlap': round(sc, 2), 'label': label})
    for c in claims:
        if c['overlap'] < 0.34:
            findings.append(('WARN', 'UNMATCHED', c.get('label', 'script.txt'), f'no facts row is close to: {c["sentence"][:90]}. If it states a fact, it has to be cleared; if it is a hook or an ask, ignore this'))

    errors = sum(1 for f in findings if f[0] == 'ERROR')
    warns = sum(1 for f in findings if f[0] == 'WARN')
    skipped = [f[1] for f in findings if f[0] == 'SKIP']
    return {'rows': rows, 'never': never, 'findings': findings, 'claims': claims, 'errors': errors, 'warnings': warns, 'skipped': skipped}


def write_worksheet(project, scope, res, facts_path):
    rows = res['rows']
    L = [f'# Fact check worksheet ({scope}, {datetime.now().strftime("%Y-%m-%d %H:%M")})', '',
         'Fill the last column from a fresh read of each source, not from memory and not from facts.md notes.',
         'Verdicts: SUPPORTED, OVERSTATED (the reel says more than the source), NOT FOUND, CHANGED (the page now says something else), UNSOURCED.', '',
         '| # | What the reel says | Nearest cleared row | Source to re-read | Verdict (quote or paraphrase, URL, date read) |', '|---|---|---|---|---|']
    for i, c in enumerate(res['claims'], 1):
        r = rows[c['row'] - 1] if c['row'] else None
        near = f'row {c["row"]}: {r["claim"]}' if r else 'none'
        src = r['source'] if r else ''
        L.append(f'| {i} | {c["sentence"]} | {near} ({int(c["overlap"] * 100)}% overlap) | {src} | |')
    L += ['', '## Rows in facts.md that the reel does not seem to use', '']
    used = {c['row'] for c in res['claims'] if c['row'] and c['overlap'] >= 0.34}
    for i, r in enumerate(rows, 1):
        if i not in used:
            L.append(f'- row {i}: {r["claim"]}')
    L += ['', '## Never say (the reel must not say or imply any of these)', '']
    L += [f'- {n}' for n in res['never']] or ['- (none listed)']
    if scope == 'final':
        seen = on_screen_path(project).exists()
        L += ['', '## Also check by eye', '',
              ('- Text on screen was read from the render (build/on_screen_text.txt): the numbers and wording in it are checked above. ' if seen else
               '- Text on screen was NOT read (no build/on_screen_text.txt yet): read the text in scenes/*.js by eye. ')
              + 'Names on the cover, the handle, anything a picture claims (a chart, a logo, a product screen) are not text and are never checked here.']
    (project / 'build').mkdir(exist_ok=True)
    (project / 'build' / 'factcheck.md').write_text('\n'.join(L) + '\n', encoding='utf-8')


def main():
    flags = Flags()
    args = flags.positional()
    if not args:
        print(__doc__)
        raise SystemExit(1)
    project = resolve_reel(args[0])
    action = args[1] if len(args) > 1 else 'check'
    if action not in ('check', 'record'):
        fail(TOOL, 'second argument must be check or record')
    scope = str(flags.get('scope', 'script')).lower()
    if scope not in ('script', 'final'):
        fail(TOOL, '--scope must be script or final')
    if not project.is_dir():
        fail(TOOL, f'{project} is not a folder')
    fp = flags.get('facts')
    facts_path = project_paths(project, None if fp is True else fp)
    res = check(project, scope, facts_path)

    if action == 'check':
        write_worksheet(project, scope, res, facts_path)
        order = {'ERROR': 0, 'WARN': 1, 'SKIP': 2}
        for lvl, code, where, msg in sorted(res['findings'], key=lambda f: order[f[0]]):
            print(f'{lvl:5} {code:18} {where}: {msg}')
        print(f'FACTS CHECK ({scope}): {"FAIL" if res["errors"] else "OK"}  {res["errors"]} errors, {res["warnings"]} warnings, '
              f'{len(res["rows"])} cleared rows.' + (' SKIPPED: ' + ', '.join(res['skipped']) + ' (see above).' if res['skipped'] else '') + ' Worksheet: build/factcheck.md')
        print('This is the mechanical half. It does not know whether a source is true: next, re-read each source (/reel-factcheck) '
              'and run  facts.py <project> record --scope %s --result PASS|FAIL' % scope)
        if res['errors']:
            sys.exit(1)
        return

    result = str(flags.get('result', '')).upper()
    if result not in ('PASS', 'FAIL'):
        fail(TOOL, 'record needs --result PASS or --result FAIL')
    if result == 'PASS' and res['errors']:
        fail(TOOL, f'cannot record PASS: check still has {res["errors"]} errors (run  facts.py <project> check)')
    note = flags.get('note')
    note = '' if note is True or note is None else str(note)
    stamp = datetime.now().strftime('%Y-%m-%d %H:%M')
    fpr = fingerprint(project, scope, facts_path)
    state = load_state(project)
    state.setdefault('records', {})[scope] = {'result': result, 'at': stamp, 'fingerprint': fpr, 'note': note,
                                              'rows': len(res['rows']), 'warnings': res['warnings'], 'skipped': res['skipped']}
    (project / 'build').mkdir(exist_ok=True)
    (project / 'build' / 'facts_check.json').write_text(json.dumps(state, indent=2) + '\n', encoding='utf-8')

    entry = (f'- {stamp} Fact check ({scope}): {result}, fingerprint {fpr}, {len(res["rows"])} cleared rows'
             + (f'. SKIPPED: {", ".join(res["skipped"])}' if res['skipped'] else '') + (f'. {note}' if note else ''))
    approvals = project / 'approvals.md'
    text = approvals.read_text(encoding='utf-8') if approvals.exists() else ''
    heading = '## Fact check'
    lines = text.split('\n') if text else []
    idx = next((i for i, l in enumerate(lines) if l.strip() == heading), None)
    if idx is None:
        new = (text.rstrip('\n') + '\n\n' if text.strip() else '') + f'{heading}\n\n{entry}\n'
    else:
        end = next((i for i in range(idx + 1, len(lines)) if lines[i].startswith('## ')), len(lines))
        section = '\n'.join(lines[idx:end]).rstrip('\n')
        rest = '\n'.join(lines[end:])
        new = '\n'.join(lines[:idx]) + ('\n' if idx else '') + section + '\n' + entry + '\n' + ('\n' + rest.rstrip('\n') + '\n' if rest.strip() else '')
    approvals.write_text(new, encoding='utf-8')
    print(f'recorded Fact check ({scope}): {result} in {approvals}')
    print(entry)
    if result == 'FAIL':
        sys.exit(1)


def selftest():
    assert strip_notes('# Reel: Claude. Facts: F-29.\nYou have until December.\n// note\n[on screen]\n') == 'You have until December.'
    found = dict(spelled_numbers('fifty requests a day, twenty-nine courses and one quiz, in one place'))
    assert found.get('fifty') == '50', found
    assert found.get('twenty-nine') == '29', found
    assert found.get('one') == '1', found  # one quiz
    assert 'place' not in ' '.join(found)  # "one place" is not a second "one"
    blob = '29 courses, 8 lessons and 1 quiz'
    nums = {re.sub(r'[\s,]', '', n.group(0).lower()) for n in NUMBER.finditer(blob)}
    assert number_is_cleared('29', nums, blob)
    assert not number_is_cleared('50', nums, blob)
    assert number_is_cleared('fifty', nums, 'up to fifty requests')
    print('facts selftest: ok')


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        selftest()
    else:
        main()
