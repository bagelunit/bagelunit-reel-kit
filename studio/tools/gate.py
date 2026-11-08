#!/usr/bin/env python3
"""Approval gates: record what was approved, and prove later that the file is still that file.

  python3 tools/gate.py <project> record [--gate A|B|C] [--note "text"] [--skip-facts "reason"]
  python3 tools/gate.py <project> check  [--gate C]

<project> is a reel folder (reels/<slug>); the log is its approvals.md. Default gate: C.
  record, gate C   hashes (SHA-256) the newest out/*.mp4, reads build/qa.json (if any) and the latest "Review:" line in
                   approvals.md (if any), and appends a dated block under a "## Gate C" heading (created if missing).
                   Earlier text is never rewritten. The block holds the file name, the first 12 hex characters of the hash,
                   the QA result and the verdict line.
  record, gate A or B   appends one dated line (with the note) under "## Gate A" / "## Gate B". No hash.
  check, gate C    hashes the newest out/*.mp4 again and compares it with the latest recorded hash:
                   MATCH, or CHANGED SINCE APPROVAL (exit code 1). Nothing is written.
  gate A / gate C  also need a current PASS from the fact check (tools/facts.py, scope script for A, scope final for C): the
                   script, the caption and facts.md must be unchanged since it was recorded. Otherwise the record is refused.
                   --skip-facts "reason" records anyway and writes "FACTS NOT RE-CHECKED: reason" into the entry.
No network, no keys.
"""
import hashlib, re, sys
from datetime import datetime
from pathlib import Path

from kitcore import Flags, fail, read_json
import facts as factlib

TOOL = 'gate'
NAMES = {'A': 'script', 'B': 'visual plan', 'C': 'final video'}


def newest_out(project):
    outs = [f for f in (project / 'out').glob('*.mp4') if '.tmp.' not in f.name] if (project / 'out').is_dir() else []
    return max(outs, key=lambda f: f.stat().st_mtime) if outs else None


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    flags = Flags()
    args = flags.positional()
    if len(args) < 2 or args[1] not in ('record', 'check'):
        print(__doc__)
        raise SystemExit(1)
    project, action = Path(args[0]).resolve(), args[1]
    gate = str(flags.get('gate', 'C')).upper()
    if gate not in NAMES:
        fail(TOOL, '--gate must be A, B or C')
    note = flags.get('note')
    note = '' if note is True or note is None else str(note)
    if not project.is_dir():
        fail(TOOL, f'{project} is not a folder')
    approvals = project / 'approvals.md'
    text = approvals.read_text(encoding='utf-8') if approvals.exists() else ''

    if action == 'check':
        if gate != 'C':
            fail(TOOL, 'check only applies to gate C (gates A and B do not hash anything)')
        found = re.findall(r'^- File: (.+?) \| sha256: ([0-9a-f]{12})', text, re.M)
        if not found:
            fail(TOOL, 'no Gate C record in approvals.md: run  gate.py <project> record --gate C  first')
        name, recorded = found[-1]
        video = project / 'out' / name
        if not video.exists():
            print(f'CHANGED SINCE APPROVAL: {name} (recorded {recorded}) is no longer in out/')
            sys.exit(1)
        now = sha256(video)[:12]
        if now == recorded:
            print(f'MATCH: {name} sha256 {now} is the file that was approved')
            return
        print(f'CHANGED SINCE APPROVAL: {name} recorded {recorded}, now {now}')
        sys.exit(1)

    facts_line = ''
    if gate in ('A', 'C'):
        scope = 'script' if gate == 'A' else 'final'
        state, detail = factlib.status_for(project, scope)
        skip = flags.get('skip-facts')
        if state == 'PASS':
            facts_line = f'Fact check: PASS ({detail})'
        elif skip:
            reason = '' if skip is True else str(skip)
            if not reason:
                fail(TOOL, '--skip-facts needs a reason in quotes')
            facts_line = f'FACTS NOT RE-CHECKED: {reason} (state was {state})'
        else:
            fail(TOOL, f'Gate {gate} needs a current fact check, and it is {state}: {detail}. Run /reel-factcheck '
                       f'(or  facts.py <project> check  then  record --scope {scope} --result PASS). '
                       f'To go ahead without it, add  --skip-facts "reason".')
    stamp = datetime.now().strftime('%Y-%m-%d %H:%M')
    if gate == 'C':
        video = newest_out(project)
        if not video:
            fail(TOOL, 'no out/*.mp4 to approve: run  kit export <project>  first')
        digest = sha256(video)[:12]
        qa = read_json(project / 'build' / 'qa.json', None)
        qa_text = f'{qa.get("result", "?")} ({qa.get("video", "?")})' if isinstance(qa, dict) else 'not run'
        reviews = re.findall(r'^\s*(?:[-*]\s*)?(Review:.*)$', text, re.M)
        verdict = reviews[-1].strip() if reviews else 'none recorded'
        lines = [f'### {stamp}', f'- File: {video.name} | sha256: {digest}', f'- QA: {qa_text}', f'- {verdict}', f'- {facts_line}']
        if note:
            lines.append(f'- Note: {note}')
        entry = '\n'.join(lines)
    else:
        entry = f'- {stamp} Gate {gate} ({NAMES[gate]}) approved' + (f': {note}' if note else '') + (f' [{facts_line}]' if facts_line else '')

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
