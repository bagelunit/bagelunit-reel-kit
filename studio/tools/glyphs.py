#!/usr/bin/env python3
"""Make captions render in any writing system, downloading a font only when a reel actually needs it.

  python3 tools/glyphs.py check <project>     read script.txt and build/words.json, fetch what that text needs
  python3 tools/glyphs.py add arabic thai ... fetch specific writing systems now
  python3 tools/glyphs.py list                the writing systems it knows

Fonts come from Google's Noto project (SIL Open Font License) and land in studio/fonts/. They are registered in
fonts/extra.css under the family name "Fallback", which every mode keeps in its font stacks, so the text just renders.
Latin, Cyrillic, Greek and Vietnamese already ship with the kit.
"""
import re, sys, urllib.request

from kitcore import KIT_ROOT

FONT_DIR = KIT_ROOT / 'fonts'
NOTO = 'https://github.com/notofonts/notofonts.github.io/raw/main/fonts'
NOTO_CJK = 'https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF'


def noto(family):
    return f'{NOTO}/{family}/hinted/ttf/{family}-Bold.ttf', f'{family}-Bold.ttf'


# writing system: (first, last) code point ranges, font (url, file)
SYSTEMS = {
    'arabic': ([(0x0600, 0x06FF), (0x0750, 0x077F)], noto('NotoSansArabic')),
    'hebrew': ([(0x0590, 0x05FF)], noto('NotoSansHebrew')),
    'devanagari': ([(0x0900, 0x097F)], noto('NotoSansDevanagari')),
    'bengali': ([(0x0980, 0x09FF)], noto('NotoSansBengali')),
    'tamil': ([(0x0B80, 0x0BFF)], noto('NotoSansTamil')),
    'thai': ([(0x0E00, 0x0E7F)], noto('NotoSansThai')),
    'georgian': ([(0x10A0, 0x10FF)], noto('NotoSansGeorgian')),
    'armenian': ([(0x0530, 0x058F)], noto('NotoSansArmenian')),
    'japanese': ([(0x3040, 0x30FF), (0x4E00, 0x9FFF)], (f'{NOTO_CJK}/Japanese/NotoSansCJKjp-Bold.otf', 'NotoSansCJKjp-Bold.otf')),
    'korean': ([(0xAC00, 0xD7AF)], (f'{NOTO_CJK}/Korean/NotoSansCJKkr-Bold.otf', 'NotoSansCJKkr-Bold.otf')),
    'chinese': ([(0x4E00, 0x9FFF)], (f'{NOTO_CJK}/SimplifiedChinese/NotoSansCJKsc-Bold.otf', 'NotoSansCJKsc-Bold.otf')),
}


def css_range(ranges):
    return ', '.join(f'U+{a:04X}-{b:04X}' for a, b in ranges)


def uses(text, ranges):
    return any(a <= ord(ch) <= b for ch in text for a, b in ranges)


def install(name):
    if name not in SYSTEMS:
        sys.exit(f'glyphs: no font set for "{name}" (known: {", ".join(SYSTEMS)})')
    ranges, (url, filename) = SYSTEMS[name]
    target = FONT_DIR / filename
    if not target.exists():
        print(f'fetching {filename} ...')
        target.write_bytes(urllib.request.urlopen(url, timeout=300).read())
    sheet_file = FONT_DIR / 'extra.css'
    sheet = sheet_file.read_text(encoding='utf-8') if sheet_file.exists() else ''
    if filename not in sheet:
        sheet += f"@font-face {{ font-family: 'Fallback'; src: url('{filename}'); unicode-range: {css_range(ranges)}; }}\n"
        sheet_file.write_text(sheet, encoding='utf-8')
    print(f'{name}: ready (font family "Fallback")')


def check(project):
    from pathlib import Path
    text = ''.join(f.read_text(encoding='utf-8') for f in (Path(project) / 'script.txt', Path(project) / 'build' / 'words.json') if f.exists())
    needed = [name for name, (ranges, _) in SYSTEMS.items() if uses(text, ranges)]
    if 'japanese' in needed and 'chinese' in needed:
        needed.remove('chinese')            # the Japanese face already covers the shared Han characters
    for name in needed:
        install(name)
    print('fonts ok' + (f' (added {", ".join(needed)})' if needed else ' (Latin, Cyrillic, Greek, Vietnamese ship with the kit)'))


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args or args[0] == 'list':
        print('writing systems:', ', '.join(SYSTEMS))
    elif args[0] == 'check' and len(args) > 1:
        check(args[1])
    elif args[0] == 'add':
        for n in args[1:]:
            install(n)
    else:
        print(__doc__)
