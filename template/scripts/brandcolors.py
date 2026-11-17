"""brandcolors.py: the brand's own colours for the scripts (reads brand/brand.json -> colors; falls back to the kit's Print look).
  from brandcolors import colors; c = colors()   ->  {'paper': 'FBF5E6', 'ink': '15110E', 'accent': 'E23B2E'} (hex, no #)"""
import json, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT = {'paper': 'FBF5E6', 'ink': '15110E', 'accent': 'E23B2E'}

def _hex(v):
    v = str(v or '').strip().lstrip('#')
    return v.upper() if re.fullmatch(r'[0-9A-Fa-f]{6}', v) else None

def colors():
    out = dict(DEFAULT)
    try: c = json.loads((ROOT / 'brand' / 'brand.json').read_text()).get('colors', {})
    except Exception: c = {}
    for k, src in (('paper', 'background'), ('ink', 'ink'), ('accent', 'accent')):
        h = _hex(c.get(src))
        if h: out[k] = h
    return out

def rgb(h, a=255): return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)
