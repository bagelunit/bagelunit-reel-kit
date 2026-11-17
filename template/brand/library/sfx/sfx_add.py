#!/usr/bin/env python3
"""Add a sound effect to this brand's own library with its licence on record.

  python3 sfx_add.py <file> --name whoosh-fast --source "https://..." --license CC0 --author "Name" [--notes "..."]
  python3 sfx_add.py --audit        check every row: file present, licence allowed, attribution noted

Allowed licences: CC0, CC-BY (needs attribution, noted in the row and in any caption/credits), own (made by the brand),
purchased (keep the receipt id in --notes). Refused: CC-BY-NC, CC-BY-ND, "unknown", and anything without a source.
Files go to brand/library/sfx/files/ (git ignores audio); the table is brand/library/sfx/INDEX.md (git keeps it).
Nothing is downloaded here: the brand owner (or Claude, after the owner's yes for that file) puts the file on disk first."""
import argparse, datetime, hashlib, pathlib, shutil, subprocess, sys
HERE = pathlib.Path(__file__).resolve().parent; FILES = HERE / 'files'; INDEX = HERE / 'INDEX.md'
ALLOWED = {'cc0', 'cc-by', 'own', 'purchased'}
HEAD = '| Name | File | Seconds | Licence | Author | Source | Added | Notes | sha256 |\n|---|---|---|---|---|---|---|---|---|\n'

def rows():
    if not INDEX.exists(): return []
    return [[c.strip() for c in l.strip().strip('|').split('|')] for l in INDEX.read_text().splitlines() if l.startswith('| ') and not l.startswith('| Name') and not l.startswith('|---')]

def seconds(p):
    try: return f"{float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(p)], text=True).strip()):.2f}"
    except Exception: return '?'

def audit():
    bad = 0
    for r in rows():
        name, file, _, lic, author, source = r[:6]
        probs = []
        if not (FILES / file).exists(): probs.append('file missing')
        if lic.lower() not in ALLOWED: probs.append(f'licence "{lic}" not allowed')
        if lic.lower() == 'cc-by' and not author: probs.append('CC-BY needs the author named')
        if lic.lower() != 'own' and not source: probs.append('no source')
        if probs: bad += 1; print(f'PROBLEM {name}: ' + '; '.join(probs))
    print(f'{len(rows())} rows, {bad} with problems'); return 1 if bad else 0

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('file', nargs='?'); ap.add_argument('--name'); ap.add_argument('--source', default=''); ap.add_argument('--license', dest='lic')
    ap.add_argument('--author', default=''); ap.add_argument('--notes', default=''); ap.add_argument('--audit', action='store_true'); a = ap.parse_args()
    if a.audit: sys.exit(audit())
    if not (a.file and a.name and a.lic): ap.error('file, --name and --license are required')
    lic = a.lic.strip()
    if lic.lower() not in ALLOWED: sys.exit(f'refused: licence "{lic}" is not one of CC0, CC-BY, own, purchased')
    if lic.lower() != 'own' and not a.source: sys.exit('refused: a source address is required unless the licence is "own"')
    if lic.lower() == 'cc-by' and not a.author: sys.exit('refused: CC-BY needs --author (attribution)')
    src = pathlib.Path(a.file).expanduser()
    if not src.exists(): sys.exit(f'no such file: {src}')
    if any(r[0] == a.name for r in rows()): sys.exit(f'a row named {a.name} already exists')
    FILES.mkdir(exist_ok=True); dest = FILES / f'{a.name}{src.suffix.lower()}'; shutil.copy2(src, dest)
    h = hashlib.sha256(dest.read_bytes()).hexdigest()[:12]
    if not INDEX.exists(): INDEX.write_text('# Sound effects (this brand\'s own library)\n\nEvery row has a licence on record. Run `python3 sfx_add.py --audit` to check them.\n\n' + HEAD)
    with INDEX.open('a') as f: f.write(f'| {a.name} | {dest.name} | {seconds(dest)} | {lic} | {a.author} | {a.source} | {datetime.date.today()} | {a.notes} | {h} |\n')
    print(f'added {a.name} ({lic}) -> {dest}')
main()
