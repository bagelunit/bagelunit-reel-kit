#!/usr/bin/env python3
"""gate_hook.py: Claude Code PreToolUse hook. Refuses `kit gate <reel> record --gate C` unless
scripts/qa/gate_qa.py has a record for the exact final mp4 that passed (or that the owner skipped with a reason).
Reads the hook JSON on stdin; exit 0 = allow, exit 2 = block (the message goes back to Claude)."""
import hashlib, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()


def rec_possible():
    import platform, shutil
    here = pathlib.Path(__file__).resolve().parent
    return (here / 'ocr').exists() or (platform.system() == 'Darwin' and bool(shutil.which('swiftc'))) or bool(shutil.which('tesseract'))


def licensed_problem(reel):
    """The reel's licensed assets (Uppbeat, recorded with kit licensed add) must be in order: runs the engine's
    `licensed.mjs check`. Returns a message, or None when all is well or the engine tool is not installed here."""
    import shutil, subprocess
    tool = pathlib.Path.home() / '.claude' / 'skills' / 'bagelunit-reels' / 'tools' / 'licensed.mjs'
    node = shutil.which('node')
    if not tool.exists() or not node: return None
    r = subprocess.run([node, str(tool), 'check', str(reel)], capture_output=True, text=True)
    if r.returncode == 0: return None
    bad = [l for l in r.stdout.splitlines() if l.startswith('FAIL')]
    return 'a licensed asset this reel uses is not in order (' + ('; '.join(b[6:] for b in bad) or r.stderr.strip()[-200:]) + '). Run `node ~/.claude/skills/bagelunit-reels/tools/kit.mjs licensed check ' + reel.name + '`, fix it, then record Gate C.'


def main():
    try: ev = json.load(sys.stdin)
    except Exception: return 0
    if ev.get('tool_name') != 'Bash': return 0
    cmd = (ev.get('tool_input') or {}).get('command', '')
    m = re.search(r'\bgate(?:\.py)?\s+("[^"]+"|\'[^\']+\'|\S+)\s+record\b(.*)', cmd, re.S)
    if not m or not re.search(r'--gate[ =]["\']?C\b', m.group(2)): return 0
    arg = m.group(1).strip('"\'')
    slug = pathlib.Path(arg).name
    hits = [d for d in (ROOT / 'reels').rglob(slug) if d.is_dir() and (d / 'reel.json').exists()]
    if len(hits) != 1: return 0                       # not one of this workspace's reels: nothing to check here
    if not rec_possible(): return 0                    # no text reader on this computer (see reel_qa.py): do not lock the owner out
    reel = hits[0]
    lic = licensed_problem(reel)
    if lic:
        print(f'Gate C blocked: {lic}', file=sys.stderr); return 2
    rec_file = reel / 'build' / 'qa-gate.json'
    how = f'python3 scripts/qa/gate_qa.py {slug}'
    if not rec_file.exists():
        print(f'Gate C blocked: no QA record for {slug}. Run `{how}` on the final, fix what it names, then record Gate C. (Only the owner skips it: `{how} --skip "reason"`.)', file=sys.stderr); return 2
    rec = json.loads(rec_file.read_text())
    vid = reel / rec.get('file', '')
    if rec.get('gate') != 'C' or not vid.exists() or sha(vid) != rec.get('sha256'):
        print(f'Gate C blocked: the QA record for {slug} is not for the final that is on disk now (the video changed or it was a Gate B run). Run `{how}` again.', file=sys.stderr); return 2
    if rec.get('skipped') or rec.get('passed'): return 0
    print(f'Gate C blocked: the QA on {slug} did not pass (hook {"ok" if rec.get("hook_ok") else "FAILED"}, {len(rec.get("safe", {}))} safe-zone lines). Fix, rebuild, run `{how}` again. Only the owner skips it with --skip "reason".', file=sys.stderr)
    return 2


sys.exit(main())
