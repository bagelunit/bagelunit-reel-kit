#!/usr/bin/env python3
"""humanize_check.py - list AI tells and brand-banned characters/words in a text, with line numbers.

  python3 humanize_check.py FILE        (or:  echo "text" | python3 humanize_check.py -)
Reads brand/brand.json -> "writing" (banned_characters, banned_words) by walking up from the current folder.
Exit code 0 = clean, 1 = something found. Standard library only. --selftest to check itself.
"""
import json, pathlib, re, sys

TELL_PHRASES = ["here's the thing", "let's dive in", "dive into", "in today's world", "it's worth noting", "at the end of the day",
                "game-changer", "game changer", "in a world where", "buckle up", "without further ado"]
TELL_WORDS = ["delve", "leverage", "unlock", "elevate", "seamless", "seamlessly", "supercharge", "tapestry", "landscape", "revolutionize",
              "cutting-edge", "robust", "holistic", "synergy", "basically", "essentially"]
DEFAULT_CHARS = ["—"]


def brand_rules():
    p = pathlib.Path.cwd()
    for d in [p, *p.parents]:
        f = d / "brand" / "brand.json"
        if f.exists():
            try:
                w = json.loads(f.read_text()).get("writing") or {}
                return w.get("banned_characters") or DEFAULT_CHARS, w.get("banned_words") or []
            except ValueError:
                break
    return DEFAULT_CHARS, []


def check(text):
    chars, words = brand_rules()
    hits = []
    for n, line in enumerate(text.splitlines(), 1):
        low = line.lower()
        for c in chars:
            if c and c in line:
                hits.append((n, f"banned character {c!r}"))
        for w in words:
            if w and re.search(r"\b" + re.escape(w.lower()) + r"\b", low):
                hits.append((n, f"banned word '{w}'"))
        for ph in TELL_PHRASES:
            if ph in low:
                hits.append((n, f"AI tell: '{ph}'"))
        for w in TELL_WORDS:
            if re.search(r"\b" + w + r"\b", low):
                hits.append((n, f"stock word: '{w}'"))
        if re.search(r"\b\w+, \w+(?: \w+)?,? and \w+", line) and len(line.split()) < 14:
            hits.append((n, "possible forced triad"))
        if re.search(r"\bnot (?:just )?[\w ]{1,25}, (?:but |it's |it is )", low):
            hits.append((n, "contrast crutch ('not X, but Y')"))
    return hits


def main():
    if "--selftest" in sys.argv:
        assert any("stock word" in h[1] for h in check("We delve into it."))
        assert any("banned character" in h[1] for h in check("Wait — what."))
        assert check("Save this for later.") == []
        print("selftest OK")
        return
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    text = sys.stdin.read() if sys.argv[1] == "-" else pathlib.Path(sys.argv[1]).read_text()
    hits = check(text)
    for n, msg in hits:
        print(f"line {n}: {msg}")
    print("clean" if not hits else f"{len(hits)} thing(s) to fix")
    sys.exit(1 if hits else 0)


if __name__ == "__main__":
    main()
