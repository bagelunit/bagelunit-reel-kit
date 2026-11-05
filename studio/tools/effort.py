#!/usr/bin/env python3
"""Effort check: was this reel built for its own script, or put together from the kit's ready-made pieces?

  python3 tools/effort.py <project>

Reels that people remember invent their own objects for the script. This counts the project's own code, per second of video:
  lines/s     non-blank, non-comment lines in the reel's scene code
  makers/s    drawing helpers the reel defines itself (props, machines, characters)
  ready-made  calls to the mode's prop library (modes/<mode>/parts/*.js): fine once when the script is literally about that
              object, generic when the reel leans on them
Starter files left untouched and files copied from the mode are not counted as the reel's own work.
Motion helpers (springs, easing, typing, counters ...) are tools, not props: use them freely.
"""
from pathlib import Path
import re, sys

from kitcore import KIT_ROOT, Flags, fail, load_words, reel_settings

TOOL = 'effort'
# mode: (lines per second, makers per second) at least
BARS = {'print': (40, 2.5), 'depth': (35, 1.5), 'talking': (5, 0.3)}
SCENE_GLOBS = ('scenes/*.js', 'scenes/**/*.js', 'shots/*.js', 'shots/**/*.js', '*.js', 'lib/*.js')
DEFINES = re.compile(r'\bfunction\s+([A-Za-z_]\w*)\s*\(|\b(?:const|let)\s+([A-Za-z_]\w*)\s*=\s*(?:\([^)]*\)|[A-Za-z_]\w*)\s*=>')
TOP_LEVEL = re.compile(r'^(?:function\s+([A-Za-z_]\w*)|(?:const|let|var)\s+([A-Za-z_]\w*)\s*=)', re.M)


def text_of(f):
    return f.read_text(encoding='utf-8', errors='ignore')


def library_props(mode_dir):
    """The mode's ready-made pieces. A mode can list its showcase props in parts/stock.json (["gauge", ...]); then reusing one
    of them twice fails the check. Without that list every top-level name in parts/*.js is reported, for information only."""
    listed = mode_dir / 'parts' / 'stock.json'
    if listed.is_file():
        import json
        return set(json.loads(listed.read_text(encoding='utf-8'))), True
    names = set()
    for f in sorted((mode_dir / 'parts').glob('*.js')) if (mode_dir / 'parts').is_dir() else []:
        for a, b in TOP_LEVEL.findall(text_of(f)):
            name = a or b
            if len(name) > 3 and not name.isupper():
                names.add(name)
    return names, False


def is_mode_copy(f, project, mode_dir):
    """True for files that are just the mode's own files (an untouched starter file, or a copied runtime/parts file)."""
    body = text_of(f)
    starter = mode_dir / 'starter' / f.relative_to(project)
    if starter.is_file() and text_of(starter) == body:
        return True
    return any(other.is_file() and text_of(other)[:4000] == body[:4000] for other in mode_dir.rglob(f.name))


def main():
    flags = Flags()
    args = flags.positional()
    if not args:
        print(__doc__)
        raise SystemExit(1)
    project = Path(args[0]).resolve()
    reel = reel_settings(project)
    mode = reel.get('style', 'print')
    words = load_words(project)
    if not words:
        fail(TOOL, 'no build/words.json yet (voice the script first)')
    seconds = words[-1]['e'] + 0.6
    mode_dir = KIT_ROOT / 'modes' / mode

    files = {f for pattern in SCENE_GLOBS for f in project.glob(pattern) if f.is_file()}
    files |= {project / name for name in (reel.get('scenes') or []) if (project / name).is_file()}
    PREVIEW_PAGES = ('parts_sheet.js', 'props_sheet.js', 'kit_preview.js')   # preview pages are not the reel
    files = sorted(f for f in files if 'build' not in f.relative_to(project).parts and f.name not in PREVIEW_PAGES)
    copies = [f for f in files if is_mode_copy(f, project, mode_dir)]
    own = [f for f in files if f not in copies]
    source = '\n'.join(text_of(f) for f in own)

    code_lines = [l for l in source.splitlines() if l.strip() and not l.strip().startswith(('//', '*', '/*'))]
    defined = {a or b for a, b in DEFINES.findall(source)}
    makers = len(DEFINES.findall(source))
    ready, strict = {}, False
    props, strict = library_props(mode_dir)
    for name in props - defined:          # a helper the reel wrote itself with the same name is its own work
        uses = len(re.findall(r'(?<![.\w])' + re.escape(name) + r'\s*\(', source))
        if uses:
            ready[name] = uses

    need_lines, need_makers = BARS.get(mode, BARS['print'])
    lps, mps = len(code_lines) / seconds, makers / seconds
    leaned_on = {k: v for k, v in ready.items() if v >= 2} if strict else {}
    print(f'effort check ({mode} · {seconds:.1f} s · {len(own)} files of the reel\'s own'
          + (f' · {len(copies)} untouched mode files ignored' if copies else '') + ')')
    print(f'  lines/s   {lps:6.1f}   bar ≥ {need_lines}    {"✓" if lps >= need_lines else "✗ too little of its own: build props and mechanisms for THIS script"}')
    print(f'  makers/s  {mps:6.2f}   bar ≥ {need_makers}   {"✓" if mps >= need_makers else "✗ too few objects drawn for this reel: invent the metaphor (playbook/ideas.md)"}')
    if ready:
        print('  ready-made pieces: ' + ', '.join(f'{k}×{v}' for k, v in sorted(ready.items()))
              + ('   ✗ used more than once: reads generic' if leaned_on else '   (fine if the script is literally about them)' if strict else '   (info)'))
    else:
        print('  ready-made pieces: none ✓')
    passed = lps >= need_lines and mps >= need_makers and not leaned_on
    print('PASS' if passed else 'BELOW THE BAR: see playbook/ideas.md (inventing the metaphor, effort budget)')
    sys.exit(0 if passed else 3)


if __name__ == '__main__':
    main()
