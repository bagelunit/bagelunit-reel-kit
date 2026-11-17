#!/usr/bin/env python3
"""gate_qa.py: run the reel QA on a reel's video and leave a record the gate hook checks.

  python3 scripts/qa/gate_qa.py <slug-or-reel-folder> [--gate B|C] [--skip "reason"]

  --gate C (default)  the final: out/<slug>.mp4 (or the newest top-level mp4 in out/)
  --gate B            the draft: build/draft.mp4, else build/video.mp4 (a reel with only stills has nothing to check yet)
  --skip "reason"     the owner's override: records the reason and lets Gate C through (written into build/qa-gate.json)

Writes <reel>/build/qa-gate.json with the video's sha256, the HOOK verdict, the SAFE lines, the SIZE lines and PASS/FAIL.
Gate C passes only when HOOK and SAFE pass (SIZE is listed for a person to judge, as in reel_qa.py).
scripts/qa/gate_hook.py (a PreToolUse hook in .claude/settings.local.json) refuses `kit gate <reel> record --gate C`
unless this record is for the exact mp4 on disk and passed or was skipped. Exit code 0 = pass or skipped, 1 = fail."""
import argparse, hashlib, json, pathlib, subprocess, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
QA = pathlib.Path(__file__).resolve().parent / 'reel_qa.py'


def find_reel(arg):
    p = pathlib.Path(arg)
    if p.is_dir() and (p / 'reel.json').exists(): return p.resolve()
    if (ROOT / arg).is_dir() and (ROOT / arg / 'reel.json').exists(): return (ROOT / arg).resolve()
    slug = pathlib.Path(arg).name
    hits = [d for d in (ROOT / 'reels').rglob(slug) if d.is_dir() and (d / 'reel.json').exists()]
    if len(hits) != 1: sys.exit(f'gate_qa: {len(hits)} reel folders named "{slug}" under reels/ (give the folder path)')
    return hits[0].resolve()


def video_for(reel, gate):
    if gate == 'C':
        want = reel / 'out' / f'{reel.name}.mp4'
        if want.exists(): return want
        c = sorted((reel / 'out').glob('*.mp4'), key=lambda f: f.stat().st_mtime, reverse=True)
        return c[0] if c else None
    for n in ('draft.mp4', 'video.mp4'):
        if (reel / 'build' / n).exists(): return reel / 'build' / n
    return None


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('reel'); ap.add_argument('--gate', default='C', choices=['B', 'C']); ap.add_argument('--skip')
    a = ap.parse_args()
    reel = find_reel(a.reel); vid = video_for(reel, a.gate)
    if not vid: sys.exit(f'gate_qa: no {"final in out/" if a.gate == "C" else "draft in build/"} to check for {reel.name}')
    rec = {'reel': reel.name, 'gate': a.gate, 'file': str(vid.relative_to(reel)), 'sha256': sha(vid), 'at': time.strftime('%Y-%m-%d %H:%M')}
    if a.skip:
        rec.update(passed=False, skipped=a.skip)
        print(f'QA skipped by the owner: {a.skip}')
    else:
        r = subprocess.run([sys.executable, str(QA), str(vid), '--json'], capture_output=True, text=True)
        if r.returncode not in (0, 1) or not r.stdout.strip(): sys.exit('gate_qa: reel_qa.py failed:\n' + r.stderr[-800:])
        d = json.loads(r.stdout)
        hook = d['hook']; hook_ok = hook['words'] >= 3 and hook['held_to_2s']
        multi = {k: min(h for _, h in v) for k, v in d['size'].items() if len(v) >= 2}
        # text that only touches the zone for one or two samples (0.5 s steps) is a slide-in or a transition, not a placement fault
        stay = {k: v for k, v in d['safe'].items() if len(v) >= 3}
        rec.update(hook_ok=hook_ok, hook=hook['frame0_headline'], safe={k: v[0] for k, v in stay.items()}, safe_brief=len(d['safe']) - len(stay),
                   small_text=dict(sorted(multi.items(), key=lambda kv: kv[1])[:20]), passed=bool(hook_ok and not stay), skipped=None)
        print(f'{reel.name}  Gate {a.gate}  {rec["file"]}')
        print(f'  HOOK  {"PASS" if hook_ok else "FAIL"}  ({" / ".join(hook["frame0_headline"]) or "no headline at 0.1 s"})')
        print(f'  SAFE  {"PASS" if not stay else "FAIL: " + str(len(stay)) + " lines stay 1.5 s or more in the bottom 300 px or right 120 px"}  ({rec["safe_brief"]} brief touches ignored)')
        for k, v in list(rec['safe'].items())[:8]: print(f'        "{k[:40]}" first at {v[0]} s, y={v[1]}')
        print(f'  SIZE  {len(multi)} lines under 30 px seen twice or more (for a person to judge; not a gate)')
        for k, h in list(rec['small_text'].items())[:6]: print(f'        {h:>3} px  "{k[:40]}"')
        print('  RESULT ' + ('PASS' if rec['passed'] else 'FAIL: fix the reel, rebuild, run this again. Only the owner skips it (--skip "reason")'))
    (reel / 'build').mkdir(exist_ok=True)
    (reel / 'build' / 'qa-gate.json').write_text(json.dumps(rec, indent=1))
    sys.exit(0 if (rec['passed'] or rec.get('skipped')) else 1)


main()
