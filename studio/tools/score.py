#!/usr/bin/env python3
"""Gate A from the command line, with no Claude Code and nothing uploaded.

  python3 score.py <script.md | script.txt | reel-folder> [--seconds 45] [--facts facts.md] [--json]
  python3 score.py --selftest
  node tools/kit.mjs score <the same>

From a brand folder the same command is `kit score`. It is what an outside writer runs on a draft
before a person reads it. It does not write the Gate A line: /script-score still does that, in a fresh
context, and kit gate record --gate A still requires that line plus a fact-check PASS.

Checks, in order
  lint            scriptlint.py. Any ERROR fails.
  human floor     ig-human/detect.py. The floor is brand.json writing.human_score_min (default 70).
                  It measures how machine-written the draft looks. It is not the goal.
  facts structure Digits and spelled-out numbers must be in facts.md. Note lines are ignored.
                  With no facts file this is skipped, and the line says so: a real Gate A still needs
                  /reel-factcheck PASS. When a facts file is in play, a missing number fails.
  retention       The 90 bar. See WEIGHTS.

Retention weights (they add to 100). A short reel is won or lost on the first line and on whether the
tease pays off, so those two are 45 points. The human-sound checks are the floor above, not these points.
hookscore.py is a weak separator of one creator's hits from their misses, so a strong hook is 25 points,
not the whole score. One viewer and "can I use this on Monday" are only partly visible to a program;
/script-score may move those two, and it has to quote the line.

  Hook                     25
  Open loop and payoff     20
  Pace                     15
  Payoff / so-what         15
  One viewer               10
  Clear aloud              10
  Call to action            5

A markdown file is scored from its spoken script block (the fenced block with the most spoken lines),
not from the commentary around it. Lines starting with #, // or [ are notes, not voiceover.
Exit 1 when the result is FAIL.
"""
import importlib.util
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import facts as factlib  # noqa: E402
import scriptlint  # noqa: E402

BAR = 90
FLOOR_DEFAULT = 70
WEIGHTS = (
    ('Hook', 25),
    ('Open loop and payoff', 20),
    ('Pace', 15),
    ('Payoff', 15),
    ('One viewer', 10),
    ('Clear aloud', 10),
    ('Call to action', 5),
)

SNAP = re.compile(r"^(?:the catch|the good news|the twist|the kicker|the best part)\??", re.I)
ASK = re.compile(r"\b(save this|follow for more|send this to|share this|comment\s+[a-z0-9]+)\b", re.I)
ACTION = re.compile(r"\b(save|send|share|follow|comment|start|sign|grab|check|import|download|use|try|open|turn|set|write|book|call|switch)\b", re.I)


def load_py(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def walk_file(start, rel_parts):
    """Find a skill file: beside the script (a brand folder), from the working directory, or in this repo's template."""
    starts = []
    if start:
        p = Path(start).resolve()
        starts.append(p if p.is_dir() else p.parent)
    starts.append(Path.cwd().resolve())
    seen = set()
    for base in starts:
        for folder in [base, *base.parents]:
            key = str(folder)
            if key in seen:
                continue
            seen.add(key)
            cand = folder.joinpath(*rel_parts)
            if cand.is_file():
                return cand
            if (folder / 'brand' / 'brand.json').is_file() and folder != base:
                break
    bundled = REPO / 'template'
    cand = bundled.joinpath(*rel_parts)
    return cand if cand.is_file() else None


def brand_near(start):
    bases = []
    if start:
        p = Path(start).resolve()
        bases.append(p if p.is_dir() else p.parent)
    bases.append(Path.cwd().resolve())
    seen = set()
    for base in bases:
        for folder in [base, *base.parents]:
            if str(folder) in seen:
                continue
            seen.add(str(folder))
            f = folder / 'brand' / 'brand.json'
            if f.is_file():
                try:
                    data = json.loads(f.read_text(encoding='utf-8'))
                except Exception:
                    return {}
                return data if isinstance(data, dict) else {}
    return {}


def extract_script(path, text):
    """A reel folder uses script.txt. A markdown write-up uses the fenced block that is the script."""
    if path.is_dir():
        f = path / 'script.txt'
        if not f.is_file():
            sys.exit(f'score: {path} has no script.txt')
        return f.read_text(encoding='utf-8'), f
    fences = re.findall(r'```[^\n]*\n(.*?)```', text, re.S)
    if fences and path.suffix.lower() in {'.md', '.markdown'}:
        def spoken_n(block):
            return len(scriptlint.spoken_text(block))
        best = max(fences, key=spoken_n)
        if spoken_n(best):
            return best if best.endswith('\n') else best + '\n', path
    return text, path


def spoken_block(text):
    return '\n'.join(scriptlint.spoken_text(text))


def first_line(text):
    lines = scriptlint.spoken_text(text)
    return lines[0] if lines else ''


def facts_path_for(target, explicit):
    if explicit:
        p = Path(explicit)
        if not p.is_file():
            sys.exit(f'score: no facts file at {p}')
        return p
    start = target if target.is_dir() else target.parent
    for folder in [start, *start.parents]:
        for cand in (folder / 'brand' / 'facts.md', folder / 'facts.md'):
            if cand.is_file():
                return cand
        if (folder / 'brand' / 'brand.json').is_file():
            break
    return None


def facts_structure(spoken, facts_file):
    if facts_file is None:
        return 'SKIP', 'no facts.md beside the script. Gate A still needs /reel-factcheck PASS', []
    rows, _never = factlib.parse_facts(facts_file.read_text(encoding='utf-8'))
    blob = ' '.join((r.get('claim') or '') + ' ' + (r.get('notes') or '') for r in rows)
    nums = {re.sub(r'[\s,]', '', n.group(0).lower()) for n in factlib.NUMBER.finditer(blob)}
    missing = []
    for n in factlib.NUMBER.finditer(spoken):
        tok = n.group(0).strip()
        if re.fullmatch(r'(19|20)\d\d', re.sub(r'[\s,]', '', tok)):
            continue
        if not factlib.number_is_cleared(tok, nums, blob):
            missing.append(tok)
    for surface, digit in factlib.spelled_numbers(spoken):
        if factlib.number_is_cleared(digit, nums, blob) or factlib.number_is_cleared(surface, nums, blob):
            continue
        missing.append(f'{surface} ({digit})')
    absolutes = sorted({h.lower() for h in factlib.ABSOLUTES.findall(spoken)})
    extra = ''
    if absolutes:
        extra = f' {len(absolutes)} absolute word(s) ({", ".join(absolutes[:6])}): keep one only when the source says exactly that.'
    if missing:
        shown = ', '.join(missing[:8])
        return 'FAIL', f'{len(missing)} spoken number(s) not in facts.md: {shown}.{extra}', missing
    return 'PASS', f'every spoken number is in {facts_file.name} ({len(rows)} rows). This is structure only; /reel-factcheck still re-reads the sources.{extra}', []


def hook_points(score):
    """70 on hookscore is 20 of 25. 100 is 25. Under 70 scales down to 0."""
    score = max(0.0, min(100.0, score))
    if score >= 70:
        return 20 + (score - 70) / 30 * 5
    return score / 70 * 20


def pace_points(sents):
    lens = [len(scriptlint.words(s)) for s in sents if s.strip()]
    if not lens:
        return 0.0, 'no sentences'
    n = len(lens)
    band = sum(1 for x in lens if 6 <= x <= 14) / n
    speak = sum(1 for x in lens if 6 <= x <= 22) / n
    runon = sum(1 for x in lens if x > 28)
    # 6-to-22 is speakable. The 6-to-14 band is what the brand asks for, so it is most of the points.
    pts = 15 * (0.45 * speak + 0.55 * min(1.0, band / 0.6))
    note = f'{sum(1 for x in lens if 6 <= x <= 14)} of {n} lines are 6 to 14 words'
    if runon:
        pts = min(pts, 6)
        note += f'; {runon} line(s) over 28 words'
    elif speak >= 0.85 and band >= 0.6:
        pts = max(pts, 13)
    return max(0.0, min(15.0, pts)), note


def loop_points(findings, sents):
    text = ' '.join(m for _, _, m in findings)
    if any(lvl == 'ERROR' and any(k in m for k in ('bait', 'snapback', 'named episode', 'never pays off')) for lvl, _, m in findings):
        return 4.0, 'a tease is opened and not paid off'
    closed = [m for lvl, _, m in findings if lvl == 'INFO' and ('paid off' in m or 'named next episode' in m or 'named later episode' in m)]
    if closed:
        return 18.0, 'the tease is paid off in this reel or in a named next episode'
    tail = ' '.join(sents[-2:])
    if ACTION.search(tail):
        return 15.0, 'no tease, and the ending tells the viewer what to do'
    if 'empty tease' in text:
        return 12.0, 'the tease is answered, but the phrase itself withholds nothing you can use'
    return 8.0, 'no clear tease and no clear action at the end'


def payoff_points(sents, plan):
    if isinstance(plan, dict):
        items = [b for b in plan.get('beats') or [] if b.get('role') == 'item']
        if items and all(str(b.get('so_what') or '').strip() for b in items):
            return 15.0, 'every item in the plan has a so-what'
    tail = ' '.join(sents[-3:])
    hits = ACTION.findall(tail)
    if len(hits) >= 2:
        return 14.0, 'the last lines tell the viewer what to do'
    if hits:
        return 11.0, 'the ending has one action'
    return 5.0, 'the ending states facts and does not say what to do'


def viewer_points(sents):
    """A rough count. Two short questions that are not snapbacks often means two viewers.
    /script-score is the read that decides this for Gate A."""
    qs = []
    for s in sents[1:]:
        if not s.rstrip().endswith('?'):
            continue
        if len(scriptlint.words(s)) > 8 or SNAP.match(s.strip()):
            continue
        qs.append(s)
    n = len(qs)
    pts = {0: 10.0, 1: 9.0, 2: 7.0}.get(n, 4.0)
    if n == 0:
        note = 'one thread of address'
    elif n == 1:
        note = f'one aside ({qs[0][:40]})'
    else:
        note = f'{n} short questions after the hook; the fresh read should check it is still one viewer'
    return pts, note


def clear_points(findings):
    pts = 10.0
    notes = []
    for lvl, _, msg in findings:
        hard = any(k in msg for k in ('jargon', 'menu path', 'too long to say', 'command is spoken'))
        soft = 'words in one sentence' in msg
        if lvl == 'ERROR' and hard:
            pts -= 3
            notes.append('a line will not be clear aloud')
        elif lvl == 'WARN' and (hard or soft):
            pts -= 1
            notes.append('a long or jargon line')
    pts = max(0.0, pts)
    return pts, notes[0] if notes else 'no spoken link, command or run-on'


def cta_points(sents, findings):
    if not sents:
        return 0.0, 'no ending'
    if any(lvl == 'ERROR' and 'tested keyword' in m for lvl, _, m in findings):
        return 1.0, 'the keyword is not one the brand has tested'
    last = sents[-1]
    if ASK.search(last):
        return 5.0, 'the last line is a save, a follow, a send, or a comment keyword'
    return 1.0, 'the last line does not ask for anything'


def hooks_module(start):
    path = walk_file(start, ('.claude', 'skills', 'ig-reel', 'hookscore.py'))
    if not path:
        return None
    return load_py(path, 'hookscore_gate')


def detect_module(start):
    path = walk_file(start, ('.claude', 'skills', 'ig-human', 'detect.py'))
    if not path:
        return None, None
    mod = load_py(path, 'ig_human_detect_gate')
    lex_path = path.with_name('slop.json')
    lex = json.loads(lex_path.read_text(encoding='utf-8')) if lex_path.is_file() else {'words': [], 'phrases': [], 'structures': []}
    return mod, lex


def human_score(text, start, brand):
    mod, lex = detect_module(start)
    if not mod:
        return None
    _results, overall, verdict = mod.run(text, lex, brand=brand or {})
    checks = {k: {'score': round(v[0], 1), 'detail': v[1]} for k, v in _results.items()}
    return {'score': round(overall, 1), 'verdict': verdict, 'checks': checks}


def human_for(raw_text, project):
    """(score, floor) for gate.py, or None when the detector is not in this folder."""
    brand = brand_near(project)
    got = human_score(raw_text, project, brand)
    if not got:
        return None
    try:
        floor = float((brand.get('writing') or {}).get('human_score_min', FLOOR_DEFAULT))
    except (TypeError, ValueError):
        floor = FLOOR_DEFAULT
    return got['score'], floor


def keyword_list(brand):
    cta = brand.get('cta') if isinstance(brand.get('cta'), dict) else {}
    words = [str(k) for k in (cta.get('tested_keywords') or [])]
    for item in cta.get('keywords') or []:
        word = item.get('word') if isinstance(item, dict) else item
        if str(word or '').strip():
            words.append(str(word).strip())
    return words


def first_comment(text, brand):
    """The comment to put in out/first-comment.txt when the script says Comment WORD."""
    spoken = spoken_block(text)
    said = re.findall(r'\bcomment\s+([A-Za-z][A-Za-z0-9]{1,24})\b', spoken, re.I)
    if not said:
        return None
    word = said[-1].upper()
    cta = brand.get('cta') if isinstance(brand.get('cta'), dict) else {}
    sends = 'it'
    template = str(cta.get('first_comment') or "Comment {keyword} and I'll send {sends}.")
    for item in cta.get('keywords') or []:
        if isinstance(item, dict) and str(item.get('word') or '').strip().upper() == word:
            if item.get('sends'):
                sends = str(item['sends'])
            if item.get('first_comment'):
                template = str(item['first_comment'])
    try:
        line = template.format(keyword=word, sends=sends)
    except (KeyError, IndexError, ValueError):
        line = f"Comment {word} and I'll send {sends}."
    return {'keyword': word, 'line': line}


def score_text(raw, target, seconds=45, facts_file=None, brand=None, plan=None, cta_keyword=None, series=None, pace=None):
    brand = brand if brand is not None else brand_near(target)
    spoken = spoken_block(raw)
    sents = scriptlint.sentences(scriptlint.spoken_text(raw))
    # Outside a brand folder there is no keyword list, so a draft is not failed for Comment WORD.
    # An empty list is a real list: no keyword has been tested, so Comment WORD fails.
    cta = brand.get('cta') if isinstance(brand, dict) and isinstance(brand.get('cta'), dict) else None
    tested = keyword_list(brand) if cta is not None else None
    pace_n = pace if pace else scriptlint.pace_for(scriptlint.find_root(Path(target) if not Path(target).is_dir() else Path(target)))[0]
    findings, nwords, est = scriptlint.lint(raw, plan, (), seconds, pace_n, cta_keyword, tested, series)
    errors = [f for f in findings if f[0] == 'ERROR']
    warns = [f for f in findings if f[0] == 'WARN']
    try:
        floor = float((brand.get('writing') or {}).get('human_score_min', FLOOR_DEFAULT))
    except (TypeError, ValueError):
        floor = FLOOR_DEFAULT
    human = human_score(raw, target, brand)
    facts_status, facts_detail, facts_missing = facts_structure(spoken, facts_file)
    hook_mod = hooks_module(target)
    line = first_line(raw)
    h_score, h_verdict = 0.0, 'WEAK'
    if line and hook_mod:
        _r, h_score, h_verdict, _flags = hook_mod.run(line)
    loop_pts, loop_note = loop_points(findings, sents)
    pace_pts, pace_note = pace_points(sents)
    pay_pts, pay_note = payoff_points(sents, plan)
    view_pts, view_note = viewer_points(sents)
    clear_pts, clear_note = clear_points(findings)
    cta_pts, cta_note = cta_points(sents, findings)
    rows = [
        ('Hook', 25, hook_points(h_score) if line else 0.0, f'hookscore {h_score:.1f} {h_verdict}' if line and hook_mod else 'no hook line'),
        ('Open loop and payoff', 20, loop_pts, loop_note),
        ('Pace', 15, pace_pts, pace_note),
        ('Payoff', 15, pay_pts, pay_note),
        ('One viewer', 10, view_pts, view_note),
        ('Clear aloud', 10, clear_pts, clear_note),
        ('Call to action', 5, cta_pts, cta_note),
    ]
    total = round(sum(p for _n, _w, p, _d in rows), 1)
    meta = scriptlint.series_meta(raw, plan, series)
    comment = first_comment(raw, brand or {})
    fails = []
    if errors:
        fails.append('lint')
    if human is None:
        fails.append('human')
    elif human['score'] < floor:
        fails.append('human')
    if facts_status == 'FAIL':
        fails.append('facts')
    if total < BAR:
        fails.append('retention')
    return {
        'result': 'PASS' if not fails else 'FAIL',
        'fails': fails,
        'words': nwords,
        'seconds': round(est, 1),
        'lint': {'errors': len(errors), 'warnings': len(warns), 'findings': [{'level': a, 'where': b, 'message': c} for a, b, c in findings]},
        'human': None if human is None else {**human, 'floor': floor, 'met': human['score'] >= floor},
        'facts': {'status': facts_status, 'detail': facts_detail, 'missing': facts_missing},
        'retention': {'score': total, 'bar': BAR, 'met': total >= BAR, 'checks': [
            {'name': n, 'weight': w, 'points': round(p, 1), 'detail': d} for n, w, p, d in rows]},
        'series': meta,
        'first_comment': comment,
        'hook': {'line': line, 'score': round(h_score, 1), 'verdict': h_verdict},
    }


def render(report, label):
    L = [f'Gate A score: {label}', f'Words: {report["words"]} (about {report["seconds"]} s)', '']
    lint = report['lint']
    L.append(f"Lint: {'PASS' if lint['errors'] == 0 else 'FAIL'}  ({lint['errors']} errors, {lint['warnings']} warnings)")
    for f in lint['findings']:
        if f['level'] == 'INFO':
            continue
        L.append(f"  {f['level']}: {f['message']}")
    h = report['human']
    if h is None:
        L.append('Human: FAIL  ig-human/detect.py was not found')
    else:
        L.append(f"Human: {h['score']:.1f}  floor {h['floor']:.0f}  {'MET' if h['met'] else 'NOT MET'}  ({h['verdict']})")
        for name, row in h['checks'].items():
            L.append(f"  {name}: {row['score']:.1f}  {row['detail']}")
    facts = report['facts']
    L.append(f"Facts: {facts['status']}  {facts['detail']}")
    r = report['retention']
    L.append(f"Retention: {r['score']:.1f} / 100  bar {r['bar']}  {'MET' if r['met'] else 'NOT MET'}")
    for c in r['checks']:
        L.append(f"  {c['name']} ({c['weight']}): {c['points']:.1f}  {c['detail']}")
    if report.get('series', {}).get('name'):
        ep = report['series'].get('episode')
        L.append(f"Series: {report['series']['name']}" + (f", episode {ep}" if ep else ''))
    if report.get('first_comment'):
        L.append(f"First comment: {report['first_comment']['line']}")
    L.append(f"Result: {report['result']}" + (f"  ({', '.join(report['fails'])})" if report['fails'] else ''))
    return '\n'.join(L)


def score_path(target, seconds=45, facts_explicit=None):
    path = Path(target)
    if path.is_dir():
        raw, src = extract_script(path, '')
        plan = None
        pf = path / 'script-plan.json'
        if pf.is_file():
            try:
                plan = json.loads(pf.read_text(encoding='utf-8'))
            except Exception as e:
                sys.exit(f'score: script-plan.json is not valid JSON: {e}')
        series = cta_kw = None
        rj = path / 'reel.json'
        if rj.is_file():
            try:
                cfg = json.loads(rj.read_text(encoding='utf-8')) or {}
                series = cfg.get('series')
                cta = cfg.get('cta') if isinstance(cfg.get('cta'), dict) else {}
                cta_kw = cta.get('keyword')
            except Exception:
                pass
        facts_file = facts_path_for(path, facts_explicit)
        report = score_text(raw, path, seconds, facts_file, brand_near(path), plan, cta_kw, series)
        return report, path.name
    if not path.is_file():
        sys.exit(f'score: no such file or reel folder: {path}')
    raw, src = extract_script(path, path.read_text(encoding='utf-8'))
    facts_file = facts_path_for(path, facts_explicit)
    report = score_text(raw, path, seconds, facts_file, brand_near(path))
    return report, path.name


def selftest():
    brand = {'writing': {'human_score_min': 70}, 'cta': {
        'tested_keywords': ['KIT'],
        'keywords': [{'word': 'KIT', 'sends': 'the setup notes'}],
        'first_comment': 'Comment {keyword} and I will send {sends}.',
    }}
    strong = (
        "# Series: Shop Checks\n# Episode: 2\n"
        "You've got until Friday to cut the Stripe fee on your till.\n"
        "That fee is 2.9 percent of every sale, about forty dollars a week on a small till.\n"
        "The catch?\n"
        "Stripe only drops it when you ask, and eight owners in ten never ask.\n"
        "Open the fee page, match it to last month's statement, and write down the rate.\n"
        "Then call and ask for the rate they give a shop of your size.\n"
        "Save this, and send it to the person who pays the bill.\n"
    )
    weak = (
        "Hey guys, welcome back to the channel.\n"
        "In this video I am going to show you how to leverage AI to unlock seamless growth for your business.\n"
        "It is important to delve into the robust landscape of tools and the future of technology.\n"
        "There are many things you should consider when you think about all of this.\n"
        "Watch till the end.\n"
    )
    root = REPO / 'template'
    # score against no facts file
    a = score_text(strong, root, brand=brand)
    b = score_text(weak, root, brand=brand)
    assert a['lint']['errors'] == 0, a['lint']
    assert a['human'] and a['human']['met'], a['human']
    assert a['retention']['score'] > b['retention']['score'] + 25, (a['retention'], b['retention'])
    assert b['result'] == 'FAIL', b
    assert 'lint' in b['fails'] or 'human' in b['fails'] or 'retention' in b['fails']
    assert a['first_comment'] is None
    commented = strong + "Comment KIT and I will send the notes.\n"
    # replace the save line's reel with a keyword ending by using a shorter script
    commented = (
        "You've got until Friday to cut the card fee on your till.\n"
        "The catch?\n"
        "Your provider only drops it when you ask.\n"
        "Open the fee page and match it to last month.\n"
        "Comment KIT and I will send the notes.\n"
    )
    c = score_text(commented, root, brand=brand)
    assert c['first_comment'] and c['first_comment']['keyword'] == 'KIT', c['first_comment']
    assert 'setup notes' in c['first_comment']['line']
    bad_kw = commented.replace('KIT', 'FREEBIE')
    d = score_text(bad_kw, root, brand=brand)
    assert d['lint']['errors'] >= 1, d['lint']
    print('score selftest: ok')
    print('strong retention', a['retention']['score'], 'human', a['human']['score'])
    print('weak retention', b['retention']['score'], 'human', None if not b['human'] else b['human']['score'], 'fails', b['fails'])


def main():
    if '--selftest' in sys.argv:
        selftest()
        return
    args = sys.argv[1:]
    if not args or args[0].startswith('--'):
        sys.exit(__doc__)
    target = args[0]
    seconds = 45.0
    facts = None
    as_json = '--json' in args
    if '--seconds' in args:
        seconds = float(args[args.index('--seconds') + 1])
    if '--facts' in args:
        facts = args[args.index('--facts') + 1]
    report, label = score_path(target, seconds, facts)
    if as_json:
        print(json.dumps(report, indent=2))
    else:
        print(render(report, label))
    sys.exit(0 if report['result'] == 'PASS' else 1)


if __name__ == '__main__':
    main()
