#!/usr/bin/env python3
"""Approval gates: record what was approved, and prove later that the file is still that file.

  python3 tools/gate.py <project> record [--gate A|B|C] [--note "text"] [--skip-facts "reason"] [--skip-review "reason"]
                                         [--skip-script-review "reason"] [--skip-human "reason"] [--skip-qa "reason"] [--skip-order "reason"]
  python3 tools/gate.py <project> check  [--gate C]
  python3 tools/gate.py <project> hash      prints the first 12 hex characters of the SHA-256 of the newest out/*.mp4 (the
                                            "[video <hash>]" a /reel-review line ends with; kit gate <reel> hash)

<project> is a reel folder (reels/<slug>); the log is its approvals.md. Default gate: C. The gates go in order, in a brand
folder and for the engine on its own alike: Gate A (script), then Gate B (visual plan), then Gate C (final video).
  record, gate A   appends one dated line under "## Gate A". Needs a current fact check PASS (tools/facts.py, scope script: the
                   script and facts.md unchanged since it was recorded), the human score at its floor (brand.json
                   writing.human_score_min, default 70; --skip-human "reason" when the owner overrides) and the latest
                   "Script review:" line in approvals.md to say "meets the bar" with 90 or more and to carry the fingerprint of the
                   script as it is now ("[script a1b2c3d4e5f6]", from scriptlint.py <project> --hash). That 90 is the retention
                   score. Any change to the spoken words needs a new review (/script-score). No detector in the folder is not a failure.
  record, gate B   appends one dated line under "## Gate B". Needs Gate A recorded first.
  record, gate C   needs Gates A and B recorded; a current fact check PASS (scope final: script, caption and facts.md unchanged);
                   a build/qa.json (kit qa) whose result is PASS, with no FAIL check (SKIPPED checks are fine), written for the
                   very file approved (its "sha256" equals the newest out/*.mp4); and the latest "Review:" line in approvals.md to
                   say "meets the bar" with 90 or more (out of 100; the older 4.5 out of 5 counts) and to end with
                   "[video <12 hex>]" equal to the newest out/*.mp4 (gate.py <project> hash). A review of another file, or a line
                   without the fingerprint, is refused: run /reel-review again on this file. Then it hashes the newest out/*.mp4
                   and appends a dated block under "## Gate C" holding the file name, the first 12 hex characters of the hash,
                   the cover (out/cover.jpg) with its hash when there is one, the QA result, the review line and the fact check.
                   Earlier text is never rewritten.
  check, gate C    hashes the approved mp4 (and the cover, if one was approved) again and compares them with the latest record:
                   MATCH, or CHANGED SINCE APPROVAL (exit code 1). Nothing is written.
Every refusal lists everything that is missing at once. Only the owner overrides a requirement, each with a reason in quotes
that is written into the record:
  --skip-facts "reason"          FACTS NOT RE-CHECKED: reason            (gates A and C)
  --skip-script-review "reason"  SCRIPT REVIEW BELOW THE BAR: reason     (gate A)
  --skip-human "reason"          HUMAN SCORE UNDER THE FLOOR: reason     (gate A: the human score is under its floor)
  --skip-order "reason"          GATE ORDER SKIPPED: reason              (gates B and C: an earlier gate is not recorded)
  --skip-qa "reason"             QA NOT PASSED: reason                   (gate C: qa.json missing, failing or for another file)
  --skip-review "reason"         REVIEW BELOW THE BAR: reason            (gate C: under 90, no score, or not for this file)
Gate C also refuses when  kit licensed check <reel>  fails (an asset the reel uses is not recorded in brand/licensed/assets.json, its file is
missing or changed). That one has no override. The licensed assets the reel uses (title, artist, source, plan, credit) are written into the
Gate C block as "- Licensed asset:" lines (or "- Licensed assets: none used").
No network, no keys.
"""
import json, re, shutil, subprocess, sys
from datetime import datetime
from pathlib import Path

from kitcore import resolve_reel, Flags, fail, read_json, review_score, MIN_SCORE, spoken_hash, file_sha256, newest_out
import facts as factlib

TOOL = 'gate'
NAMES = {'A': 'script', 'B': 'visual plan', 'C': 'final video'}
sha256 = file_sha256


def recorded(text, gate):
    """Is this gate recorded in approvals.md? Gates A and B are one line each ("Gate A (script) approved"), Gate C a block."""
    if gate == 'C':
        return bool(re.search(r'^- File: .+? \| sha256: [0-9a-f]{12}', text, re.M))
    return bool(re.search(rf'Gate {gate} \({re.escape(NAMES[gate])}\) approved', text))


def qa_problem(project, video):
    """(problem or None, the QA text for the record). build/qa.json must say PASS, hold no FAIL, and be for this very file."""
    qa = read_json(project / 'build' / 'qa.json', None)
    if not isinstance(qa, dict):
        return 'kit qa has not been run on it (no build/qa.json)', 'not run'
    rows = qa.get('checks') if isinstance(qa.get('checks'), list) else []
    failed = [str(r.get('check', '?')) for r in rows if isinstance(r, dict) and r.get('status') == 'FAIL']
    result = str(qa.get('result', '?'))
    skipped = [str(r.get('check', '?')) for r in rows if isinstance(r, dict) and r.get('status') == 'SKIPPED']
    text = f'{result} ({qa.get("file") or qa.get("video", "?")}' + (f'; skipped: {", ".join(skipped)}' if skipped else '') + ')'
    if result != 'PASS' or failed:
        return f'kit qa says {result}' + (f' (failed: {", ".join(failed)})' if failed else ''), text
    if not qa.get('sha256'):
        return 'build/qa.json has no fingerprint of the file it checked (written by an older kit qa)', text
    if qa['sha256'] != sha256(video):
        seen = qa.get('file') or qa.get('video') or 'another file'
        if seen in (f'out/{video.name}', video.name):
            return f'kit qa checked an earlier version of out/{video.name} (the file changed after kit qa ran)', text
        return f'kit qa checked {seen}, not out/{video.name}', text
    return None, text


def licensed_state(project):
    """(problems, credit lines, warnings). Every licensed asset the reel uses (kit licensed: look.lut, music, scene clips and overlays) must be in
    brand/licensed/assets.json, unchanged and inside brand/licensed/. A generated asset (AI-generated image or video, any tool) also needs its
    on-screen label (default "Re-creation" for video, "AI-generated" for images) to appear in the reel's on-screen text, unless the record carries a
    reason for having none. If the on-screen text cannot be read at all, that is a warning written into approvals.md, never a silent pass. Own files
    (a scene's {"file": ...}) are not licensed assets and are not listed. Runs tools/licensed.mjs check <reel> --json. There is no owner
    override: a licence is not a quality bar."""
    tool, node = Path(__file__).with_name('licensed.mjs'), shutil.which('node')
    if not tool.exists() or not node:
        return [], [], []
    done = subprocess.run([node, str(tool), 'check', str(project), '--json'], capture_output=True, text=True)
    try:
        data = json.loads((done.stdout or '').strip().splitlines()[-1])
    except (ValueError, IndexError):
        return [f'the licensed-assets check could not run ({(done.stderr or done.stdout or "no output").strip()[-200:]})'], [], []
    label_bad = [str(l) for l in data.get('label_problems') or []]
    skipped = [str(l) for l in data.get('label_skipped') or []]
    problems = []
    bad = [l for l in data.get('lines', []) if str(l).startswith('FAIL') and str(l) not in label_bad]
    if bad:
        problems.append(f'a licensed asset this reel uses is not in order: {"; ".join(b[6:] for b in bad)}. '
                        f'Run  kit licensed check <reel>  and fix it (record the download with kit licensed add, or take the asset out of the reel)')
    if label_bad:
        problems.append(f'a generated asset this reel uses has no on-screen label: {"; ".join(b[6:] for b in label_bad)}. '
                        f'Show the label in the reel and run  kit licensed check <reel>  again. There is no override')
    if problems:
        return problems, [], []
    return [], list(data.get('credits') or []), [s[9:] if s.startswith('SKIPPED: ') else s for s in skipped]


def review_problem(text, video_hash):
    """(problem or None, latest Review line)."""
    reviews = re.findall(r'^\s*(?:[-*]\s*)?(Review:.*)$', text, re.M)
    last = reviews[-1].strip() if reviews else ''
    score = review_score(last)
    if not last:
        return 'there is no "Review:" line in approvals.md yet', last
    if score is None:
        return 'the latest review line has no score (write it as "Review: meets the bar (92/100; ...)")', last
    if score < MIN_SCORE or 'meets the bar' not in last.lower():
        return f'the latest review scores {score:g}/100' + ('' if 'meets the bar' in last.lower() else ' and does not say "meets the bar"'), last
    m = re.search(r'\[video ([0-9a-f]{12})\]', last)
    if not m:
        return (f'the latest review line names no file: it has no [video <hash>]. Run /reel-review again on this file; its line ends '
                f'with [video {video_hash}] (kit gate <reel> hash)'), last
    if m.group(1) != video_hash:
        return (f'the latest review was of another file ([video {m.group(1)}]; the newest out/ file is {video_hash}). '
                f'Run /reel-review again on this file'), last
    return None, last


def override(flags, name, label, problems, want):
    """The owner's override for one requirement: returns the record text, or adds the refusal to problems."""
    skip = flags.get(name)
    if skip is True:
        problems.append(f'--{name} needs a reason in quotes')
        return ''
    if skip:
        return f'{label}: {skip}'
    problems.append(want)
    return ''


def human_floor(project, flags, problems):
    """The human score is a floor (brand.json writing.human_score_min, default 70), not the 90 bar.
    No detector in this folder (an engine reel with no brand skills) is not a failure."""
    script = project / 'script.txt'
    if not script.is_file():
        return ''
    try:
        import score as gatescore
        got = gatescore.human_for(script.read_text(encoding='utf-8'), project)
    except Exception:
        return ''
    if not got:
        return ''
    score_n, floor = got
    if score_n >= floor:
        return f'Human score: {score_n:.1f} (floor {floor:.0f})'
    return override(flags, 'skip-human', 'HUMAN SCORE UNDER THE FLOOR', problems,
                    f'the human score is {score_n:.1f}, under the floor of {floor:.0f}. Rewrite the weakest check and run '
                    f'kit score again. Only the owner overrides this, with  --skip-human "reason"')


def main():
    flags = Flags()
    args = flags.positional()
    if len(args) < 2 or args[1] not in ('record', 'check', 'hash'):
        print(__doc__)
        raise SystemExit(1)
    project, action = resolve_reel(args[0]), args[1]
    gate = str(flags.get('gate', 'C')).upper()
    if gate not in NAMES:
        fail(TOOL, '--gate must be A, B or C')
    note = flags.get('note')
    note = '' if note is True or note is None else str(note)
    if not project.is_dir():
        fail(TOOL, f'{project} is not a folder')
    approvals = project / 'approvals.md'
    text = approvals.read_text(encoding='utf-8') if approvals.exists() else ''

    if action == 'hash':
        video = newest_out(project)
        if not video:
            fail(TOOL, 'no out/*.mp4 yet: run  kit export <project>  first')
        print(sha256(video)[:12])
        return

    if action == 'check':
        if gate != 'C':
            fail(TOOL, 'check only applies to gate C (gates A and B do not hash anything)')
        found = re.findall(r'^- File: (.+?) \| sha256: ([0-9a-f]{12})', text, re.M)
        if not found:
            fail(TOOL, 'no Gate C record in approvals.md: run  gate.py <project> record --gate C  first')
        name, rec = found[-1]
        video = project / 'out' / name
        if not video.exists():
            print(f'CHANGED SINCE APPROVAL: {name} (recorded {rec}) is no longer in out/')
            sys.exit(1)
        now = sha256(video)[:12]
        if now != rec:
            print(f'CHANGED SINCE APPROVAL: {name} recorded {rec}, now {now}')
            sys.exit(1)
        covers = re.findall(r'^- Cover: (.+?) \| sha256: ([0-9a-f]{12})', text, re.M)
        block_start = text.rfind('- File: ')
        cover = next((c for c in reversed(covers) if text.rfind(f'- Cover: {c[0]} | sha256: {c[1]}') > block_start), None)
        if cover:
            cfile = project / 'out' / cover[0]
            cnow = sha256(cfile)[:12] if cfile.exists() else None
            if cnow != cover[1]:
                print(f'CHANGED SINCE APPROVAL: the cover {cover[0]} ' + (f'recorded {cover[1]}, now {cnow}' if cnow else 'is no longer in out/'))
                sys.exit(1)
            print(f'MATCH: {name} sha256 {now} and cover {cover[0]} sha256 {cover[1]} are the files that were approved')
            return
        print(f'MATCH: {name} sha256 {now} is the file that was approved')
        return                                  # check writes nothing: never fall through into the record step

    problems, extra = [], []                    # extra: the owner's overrides, written into the record
    video = newest_out(project) if gate == 'C' else None
    if gate == 'C' and not video:
        fail(TOOL, 'no out/*.mp4 to approve: run  kit export <project>  first')

    # the order: B after A, C after A and B
    before = {'A': [], 'B': ['A'], 'C': ['A', 'B']}[gate]
    missing = [g for g in before if not recorded(text, g)]
    if missing:
        names = ' and '.join(f'Gate {g} ({NAMES[g]})' for g in missing)
        line = override(flags, 'skip-order', 'GATE ORDER SKIPPED', problems,
                        f'{names} {"is" if len(missing) == 1 else "are"} not recorded in approvals.md yet: the gates go A, B, C '
                        f'(record each with  kit gate <reel> record --gate {missing[0]}  after the approver says yes). '
                        f'Only the owner skips this, with  --skip-order "reason"')
        if line:
            extra.append(f'{line} (missing: {", ".join("Gate " + g for g in missing)})')

    facts_line = ''
    if gate in ('A', 'C'):
        scope = 'script' if gate == 'A' else 'final'
        state, detail = factlib.status_for(project, scope)
        if state == 'PASS':
            facts_line = f'Fact check: PASS ({detail})'
        else:
            line = override(flags, 'skip-facts', 'FACTS NOT RE-CHECKED', problems,
                            f'it needs a current fact check, and it is {state}: {detail}. Run /reel-factcheck '
                            f'(or  facts.py <project> check  then  record --scope {scope} --result PASS). '
                            f'To go ahead without it, add  --skip-facts "reason"')
            if line:
                facts_line = f'{line} (state was {state})'

    if gate == 'A':
        sr = re.findall(r'^\s*(?:[-*]\s*)?(Script review:.*)$', text, re.M)
        last_s = sr[-1].strip() if sr else ''
        sscore = review_score(last_s)
        now_hash = spoken_hash(project / 'script.txt')
        m_h = re.search(r'\[script ([0-9a-f]{12})\]', last_s)
        s_ok = bool(last_s) and sscore is not None and sscore >= MIN_SCORE and 'meets the bar' in last_s.lower()
        h_ok = bool(m_h) and m_h.group(1) == now_hash
        if not (s_ok and h_ok):
            what = ('no "Script review:" line in approvals.md yet' if not last_s else
                    f'the latest script review scores {sscore:g}/100' if sscore is not None and not s_ok else
                    'the latest script review line has no score' if sscore is None else
                    'the script changed after it was reviewed (the line has no matching [script <hash>])')
            line = override(flags, 'skip-script-review', 'SCRIPT REVIEW BELOW THE BAR', problems,
                            f'it needs a script review of {MIN_SCORE}/100 or more for these exact words, and {what}. Run /script-score '
                            f'(after kit script and /script-coldread); it writes  Script review: meets the bar (NN/100; weakest: ...) [script {now_hash}] . '
                            f'Only the owner overrides this, with  --skip-script-review "reason"')
            if line:
                extra.append(f'{line} (latest: {last_s or "none recorded"})')
        human_line = human_floor(project, flags, problems)
        if human_line:
            extra.append(human_line)

    qa_text, review_line, verdict = '', '', ''
    if gate == 'C':
        digest = sha256(video)[:12]
        qa_bad, qa_text = qa_problem(project, video)
        if qa_bad:
            line = override(flags, 'skip-qa', 'QA NOT PASSED', problems,
                            f'{qa_bad}. Run  kit qa <reel>  on the final file (after the real-sound step) until it prints QA: PASS. '
                            f'Only the owner skips this, with  --skip-qa "reason"')
            if line:
                qa_text = f'{qa_text} | {line} ({qa_bad})'
        rv_bad, verdict = review_problem(text, digest)
        if rv_bad:
            line = override(flags, 'skip-review', 'REVIEW BELOW THE BAR', problems,
                            f'it needs a review of {MIN_SCORE}/100 or more of this exact file, and {rv_bad}. Fix what the review named, '
                            f'rebuild, run /reel-review again, and repeat until it reaches {MIN_SCORE}. '
                            f'Only the owner overrides this, with  --skip-review "reason"')
            if line:
                review_line = f'{line} (latest: {verdict or "none recorded"})'

    credits, lic_warn = [], []
    if gate == 'C':
        lic_bad, credits, lic_warn = licensed_state(project)
        problems.extend(lic_bad)
        for w in lic_warn:
            print(f'WARNING: SKIPPED {w}', file=sys.stderr)

    if problems:
        fail(TOOL, f'Gate {gate} ({NAMES[gate]}) is not recorded:\n' + '\n'.join(f'  - {p}' for p in problems))

    stamp = datetime.now().strftime('%Y-%m-%d %H:%M')
    if gate == 'C':
        lines = [f'### {stamp}', f'- File: {video.name} | sha256: {digest}']
        cover = project / 'out' / 'cover.jpg'
        if cover.exists():
            lines.append(f'- Cover: {cover.name} | sha256: {sha256(cover)[:12]}')
        lines += [f'- QA: {qa_text}', f'- {verdict or "none recorded"}', f'- {facts_line}']
        lines += [f'- Licensed asset: {c}' for c in credits] or ['- Licensed assets: none used']
        lines += [f'- Generated-label check SKIPPED: {w}' for w in lic_warn]
        lines += [f'- {x}' for x in extra] + ([f'- {review_line}'] if review_line else [])
        if note:
            lines.append(f'- Note: {note}')
        entry = '\n'.join(lines)
    else:
        entry = (f'- {stamp} Gate {gate} ({NAMES[gate]}) approved' + (f': {note}' if note else '')
                 + (f' [{facts_line}]' if facts_line else '') + ''.join(f' [{x}]' for x in extra))

    heading = f'## Gate {gate}'
    lines = text.split('\n') if text else []
    idx = next((i for i, l in enumerate(lines) if l.strip() == heading), None)
    if idx is None:
        body = text.rstrip('\n')
        new = (body + '\n\n' if body else '') + f'{heading}\n\n{entry}\n'
    else:
        end = next((i for i in range(idx + 1, len(lines)) if lines[i].startswith('## ')), len(lines))
        section = '\n'.join(lines[idx:end]).rstrip('\n')
        glue = '\n' if gate != 'C' else '\n\n'      # one-line entries stay together; Gate C blocks are separated
        rest = '\n'.join(lines[end:])
        new = '\n'.join(lines[:idx]) + ('\n' if idx else '') + section + glue + entry + '\n' + ('\n' + rest.rstrip('\n') + '\n' if rest.strip() else '')
    approvals.write_text(new, encoding='utf-8')
    print(f'recorded Gate {gate} in {approvals}')
    print(entry)


if __name__ == '__main__':
    main()
