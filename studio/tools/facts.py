#!/usr/bin/env python3
"""Fact check, the second look at every claim before it is voiced and before it is approved.

  python3 tools/facts.py <project> [check] [--scope script|final] [--facts path]
  python3 tools/facts.py <project> record --scope script|final --result PASS|FAIL [--note "text"]

<project> is a reel folder (reels/<slug>); the brand's cleared facts are ../../brand/facts.md (or --facts).

  check    The mechanical half. No network, no keys. It reads brand/facts.md and the reel's words and checks:
           - every facts row has a source and a cleared date (blank = error); a cleared date older than 30 days is a warning;
           - every digit, price or percentage in script.txt, caption.txt (and build/on_screen_text.txt if it exists)
             appears in facts.md (error if not);
           - no {{needs cleared fact}} is left in them (error);
           - lines with absolute or comparative wording (only, never, always, best, better, faster, free, every, can't ...) are
             listed as warnings, because those need a source that says exactly that;
           - each script sentence is paired with the nearest facts row, as a hint (a poor match is a warning);
           - a worksheet is written to build/factcheck.md for the re-read, with the "Never say" list.
           --scope script (default) looks at the script; --scope final also looks at the caption and the on-screen text file.
           It cannot tell whether a source is TRUE. That is the second half: the /reel-factcheck skill re-reads each source
           fresh and records its verdict with `record`.
  record   Saves the re-read verdict (PASS or FAIL) for this scope together with a fingerprint of the words and the facts
           table, writes build/facts_check.json and adds a "Fact check:" line under "## Fact check" in approvals.md.
           PASS is refused while `check` still has errors. Change the script, the caption or a facts row afterwards and the
           record is out of date: `kit gate` will ask for a new one.
Exit code 1 when check finds errors.
"""
import hashlib, json, re, sys
from datetime import date, datetime
from pathlib import Path

from kitcore import resolve_reel, Flags, fail

TOOL = 'facts'
STALE_DAYS = 30
ABSOLUTES = re.compile(
    r"\b(only|never|always|best|better|worst|fastest|faster|slowest|cheaper|cheapest|free|every|lacks?|without|"
    r"can't|cannot|doesn't|does not|don't|no longer|guarantee[sd]?|unlimited|none|nobody|everyone)\b", re.I)
NUMBER = re.compile(r"(?<![\w#])[$£€]?\d[\d,]*(?:\.\d+)?\s?(?:%|x|k|m|b)?(?![\w])", re.I)
STOP = set('the a an and or of to in on for with is are be it its this that your you they their them at as by from has have '
           'can will not no but so if then than into out up all any both each also more most one two what when where which who'.split())


def project_paths(project, facts_override=None):
    facts = Path(facts_override) if facts_override else project.parent.parent / 'brand' / 'facts.md'
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


def words_text(project, scope):
    """The reel's words for this scope: [(file label, text)]."""
    out = []
    for label, path in (('script.txt', project / 'script.txt'),):
        out.append((label, path.read_text(encoding='utf-8') if path.exists() else ''))
    if scope == 'final':
        for label, path in (('caption.txt', project / 'out' / 'caption.txt'),
                            ('caption.txt', project / 'caption.txt'),
                            ('on_screen_text.txt', project / 'build' / 'on_screen_text.txt')):
            if path.exists():
                out.append((label, path.read_text(encoding='utf-8')))
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
    surfaces = words_text(project, scope)
    if not surfaces[0][1].strip():
        findings.append(('ERROR', 'NO-SCRIPT', 'script.txt', 'script.txt is missing or empty'))
    claims = []
    for label, text in surfaces:
        for m in re.finditer(r'\{\{\s*needs cleared fact.*?\}\}', text, re.I):
            findings.append(('ERROR', 'NEEDS-FACT', label, 'a {{needs cleared fact}} marker is still in the text'))
        for n in NUMBER.finditer(text):
            tok = re.sub(r'[\s,]', '', n.group(0).lower())
            if tok not in facts_numbers:
                ctx = text[max(0, n.start() - 25): n.end() + 25].replace('\n', ' ')
                if re.fullmatch(r'(19|20)\d\d', tok):     # a bare year: low risk, but still say so
                    findings.append(('WARN', 'YEAR', label, f'the year {tok} is not in facts.md (…{ctx}…): true as a date, but check it'))
                else:
                    findings.append(('ERROR', 'NUMBER-NOT-CLEARED', label, f'"{n.group(0).strip()}" is not in facts.md (…{ctx}…)'))
        for sent in sentences(text):
            hit = ABSOLUTES.search(sent)
            if hit:
                findings.append(('WARN', 'ABSOLUTE', label, f'"{hit.group(0)}" in: {sent[:90]}. Needs a source that says exactly this'))
            if label == 'script.txt':
                idx, sc = nearest(sent, rows)
                claims.append({'sentence': sent, 'row': (idx + 1) if idx is not None else None, 'overlap': round(sc, 2)})
    for c in claims:
        if c['overlap'] < 0.34:
            findings.append(('WARN', 'UNMATCHED', 'script.txt', f'no facts row is close to: {c["sentence"][:90]}. If it states a fact, it has to be cleared; if it is a hook or an ask, ignore this'))

    errors = sum(1 for f in findings if f[0] == 'ERROR')
    warns = sum(1 for f in findings if f[0] == 'WARN')
    return {'rows': rows, 'never': never, 'findings': findings, 'claims': claims, 'errors': errors, 'warnings': warns}


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
        L += ['', '## Also check by eye', '', '- Text on screen in scenes/*.js, names on the cover, the handle, anything a picture claims (a chart, a logo, a product screen).']
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
        order = {'ERROR': 0, 'WARN': 1}
        for lvl, code, where, msg in sorted(res['findings'], key=lambda f: order[f[0]]):
            print(f'{lvl:5} {code:18} {where}: {msg}')
        print(f'FACTS CHECK ({scope}): {"FAIL" if res["errors"] else "OK"}  {res["errors"]} errors, {res["warnings"]} warnings, '
              f'{len(res["rows"])} cleared rows. Worksheet: build/factcheck.md')
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
                                              'rows': len(res['rows']), 'warnings': res['warnings']}
    (project / 'build').mkdir(exist_ok=True)
    (project / 'build' / 'facts_check.json').write_text(json.dumps(state, indent=2) + '\n', encoding='utf-8')

    entry = f'- {stamp} Fact check ({scope}): {result}, fingerprint {fpr}, {len(res["rows"])} cleared rows' + (f'. {note}' if note else '')
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


if __name__ == '__main__':
    main()
