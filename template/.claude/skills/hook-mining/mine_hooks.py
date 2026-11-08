#!/usr/bin/env python3
"""Turn a CSV of real, top-performing hooks into ranked, theme-bucketed mining data.

This does the MECHANICAL half of hook mining - loading a CSV whose column names you cannot predict,
ranking by whatever performance metric it happens to carry, sorting each hook into a psychological
pattern, and marking the power words already doing the work. The creative half (remixing the power
words while holding the psychology fixed) is the model's job - see SKILL.md.

  python mine_hooks.py hooks.csv                 # → hooks.mined.json + a readable summary
  python mine_hooks.py hooks.csv --top 40        # only the top 40 performers (fewer rows is fine)
  python mine_hooks.py hooks.csv --metric Saves  # rank by the named column (default: the first metric found)
  python mine_hooks.py --selftest                # verify the parsing/bucketing logic
"""
import csv, json, re, sys
from collections import Counter, defaultdict
from pathlib import Path

# a hook's psychological pattern - what makes it work, and therefore what must NOT change in a remix
PATTERNS = [
    ("result-proof",   r"^\bi\b.*\b(made|built|got|hit|earned|grew|went from|turned)\b|\b\d[\d,.]*(k|m)?\+?\s*(views|followers|subs|leads|sales|\$)"),
    ("time-bound",     r"\bin\s+\d+\s*(second|minute|hour|day|week|month|year)s?\b|\bfor\s+\d+\s*(day|week|month)s?\b"),
    ("contrarian",     r"\byou'?re\s+(doing|using|making)\b.*\bwrong\b|\bnobody\s+tells\b|\bunpopular\b"),
    ("secret-gap",     r"\b(nobody|no one|99%|most people)\b.*\b(knows?|talks?|realiz)|\bsecret\b|\bhidden\b|\bnever\s+told\b"),
    ("listicle",       r"^\d+\s+\w+|\b(these|top)\s+\d+\b"),
    ("how-to",         r"^\bhow\s+(to|i)\b|\bthis is how\b|\bhere'?s how\b"),
    ("warning-fear",   r"\b(don'?t|never|stop|avoid|warning|mistake|killing|ruining|before you)\b"),
    ("newsjack",       r"\bjust\s+(shipped|dropped|launched|released|announced)\b|\bnew\b.*\b(update|feature|model)\b"),
    ("comparison",     r"\bvs\.?\b|\bversus\b|\binstead of\b|\bbetter than\b"),
    ("question",       r"^\b(what|why|how|who|when|can|do|did|is|are|should)\b.*\?"),
    ("curiosity-tease", r"\bthis\s+(one|is)\b|\bwatch\s+this\b|\bwait\b|\buntil\b"),
]

# words that carry the emotional charge - these are the ONLY things a remix is allowed to swap
POWER = {
    "free","secret","hidden","proven","instantly","instant","actually","literally","nobody","everyone",
    "crazy","insane","illegal","hack","ultimate","brutal","exact","stop","never","always","worst","best",
    "broken","dead","killing","ruining","genius","stupid","obsessed","addictive","unfair","weird","dirty",
    "banned","forbidden","shocking","wild","real","truth","lie","mistake","fastest","easiest","only",
}

def norm(s):
    return re.sub(r"\s+", " ", (s or "").strip())

def pick_col(fields, wants, avoid=()):
    """CSV headers are never what you expect - score each column against the words we want."""
    best, score = None, 0
    for f in fields or []:
        low = (f or "").lower()
        if any(a in low for a in avoid):
            continue
        s = sum(2 if w == low else 1 for w in wants if w in low)
        if s > score:
            best, score = f, s
    return best

def to_num(v):
    v = re.sub(r"[^\d.kmKM]", "", str(v or ""))
    if not v:
        return 0.0
    mult = 1_000_000 if v[-1] in "mM" else 1_000 if v[-1] in "kK" else 1
    try:
        return float(re.sub(r"[kmKM]", "", v)) * mult
    except ValueError:
        return 0.0

def pattern_of(hook):
    h = (hook or "").lower()
    for name, rx in PATTERNS:
        if re.search(rx, h):
            return name
    # catch-all: a hook with a number is a number hook, not a plain statement
    if re.search(r"\d", h):
        return "number-led"
    return "plain-statement"

def power_words(hook):
    return sorted({w for w in re.findall(r"[a-z']+", (hook or "").lower()) if w in POWER})

def mine(rows, fields, top=None, metric=None):
    hcol = pick_col(fields, ["hook", "title", "caption", "text", "headline"], avoid=("url", "link", "id"))
    pcol = pick_col(fields, ["view", "play", "score", "like", "engagement", "reach", "performance"])
    if metric:
        wanted = [f for f in (fields or []) if (f or "").strip().lower() == metric.strip().lower()]
        if not wanted:
            raise SystemExit(f"--metric {metric!r} is not a column. Columns: {', '.join(f or '' for f in (fields or []))}")
        pcol = wanted[0]
    out = []
    for r in rows:
        hook = norm(r.get(hcol) if hcol else next((v for v in r.values() if v and len(str(v)) > 12), ""))
        if not hook or len(hook) < 8:
            continue
        out.append({"hook": hook, "metric": to_num(r.get(pcol)) if pcol else 0.0,
                    "pattern": pattern_of(hook), "power_words": power_words(hook),
                    "words": len(hook.split())})
    out.sort(key=lambda d: -d["metric"])
    if top and top > 0:
        out = out[:top]          # slicing past the end just returns every row
    buckets = defaultdict(list)
    for h in out:
        buckets[h["pattern"]].append(h)
    synthetic = any(re.search(r"synthetic", str(v or ""), re.I) for r in rows for v in r.values())
    return {"hook_column": hcol, "metric_column": pcol, "total": len(out), "synthetic": synthetic,
            "buckets": {k: v for k, v in sorted(buckets.items(), key=lambda kv: -len(kv[1]))},
            "power_word_frequency": Counter(w for h in out for w in h["power_words"]).most_common(20)}

def selftest():
    fields = ["Video URL", "Hook Text", "Views"]
    rows = [
        {"Hook Text": "How I got 64,000 views with one reel", "Views": "64.8k", "Video URL": "x"},
        {"Hook Text": "You're using Claude wrong", "Views": "12000", "Video URL": "x"},
        {"Hook Text": "5 skills nobody is using", "Views": "3.1M", "Video URL": "x"},
        {"Hook Text": "Claude just shipped a new model", "Views": "900", "Video URL": "x"},
        {"Hook Text": "short", "Views": "5", "Video URL": "x"},          # too short → dropped
    ]
    r = mine(rows, fields)
    assert r["hook_column"] == "Hook Text", r["hook_column"]
    assert r["metric_column"] == "Views", r["metric_column"]
    assert r["total"] == 4, r["total"]                                    # the 5-char row is dropped
    order = [h["hook"] for b in r["buckets"].values() for h in b]
    assert "5 skills nobody is using" in order
    assert to_num("3.1M") == 3_100_000 and to_num("64.8k") == 64_800
    assert pattern_of("You're using Claude wrong") == "contrarian"
    assert pattern_of("How I got 64,000 views with one reel") in ("result-proof", "how-to")
    assert pattern_of("Claude just shipped a new model") == "newsjack"
    assert pattern_of("5 skills nobody is using") == "listicle"
    assert "nobody" in power_words("5 skills nobody is using")
    assert power_words("a plain sentence") == []
    # catch-all buckets
    assert pattern_of("Stop scrolling and read this") == "warning-fear"
    assert pattern_of("My 2 favourite tools for editing") == "number-led"
    assert pattern_of("A calm note about editing") == "plain-statement"
    # --metric ranks by the named column; --top larger than the row count is fine
    f2 = ["Hook Text", "Views", "Saves"]
    r2 = [{"Hook Text": "Hook number one here", "Views": "100", "Saves": "1"},
          {"Hook Text": "Hook number two here", "Views": "50", "Saves": "9"}]
    byv = mine(r2, f2, top=99)
    bys = mine(r2, f2, top=99, metric="saves")
    assert byv["metric_column"] == "Views" and bys["metric_column"] == "Saves"
    assert [h["hook"] for b in bys["buckets"].values() for h in b][0] == "Hook number two here"
    assert byv["total"] == 2 and bys["total"] == 2
    assert mine([{"Hook Text": "A SYNTHETIC sample hook", "Views": "1"}], ["Hook Text", "Views"])["synthetic"] is True
    print("selftest OK")

def main():
    if "--selftest" in sys.argv:
        return selftest()
    skip = {sys.argv[i + 1] for i, a in enumerate(sys.argv[:-1]) if a in ("--top", "--metric")}
    args = [a for a in sys.argv[1:] if not a.startswith("--") and a not in skip]
    if not args:
        print(__doc__)
        sys.exit(1)
    top = None
    metric = None
    if "--top" in sys.argv:
        top = int(sys.argv[sys.argv.index("--top") + 1])
    if "--metric" in sys.argv:
        metric = sys.argv[sys.argv.index("--metric") + 1]
    src = Path(args[0])
    with src.open(newline="", encoding="utf-8-sig") as f:
        rd = csv.DictReader(f)
        res = mine(list(rd), rd.fieldnames, top, metric)
    out = src.with_suffix(".mined.json")
    out.write_text(json.dumps(res, indent=2), encoding="utf-8")
    print(f"hook column   : {res['hook_column']}\nmetric column : {res['metric_column']}\nhooks mined   : {res['total']}\n")
    if res["synthetic"]:
        print("WARNING: this data is marked SYNTHETIC. It is not real hooks; never present it as real.\n")
    for name, hooks in res["buckets"].items():
        print(f"  {name:18s} {len(hooks):3d}   e.g. {hooks[0]['hook'][:70]!r}")
    print(f"\ntop power words: {', '.join(w for w, _ in res['power_word_frequency'][:12])}")
    print(f"\n→ {out}   (feed this to Claude, then follow SKILL.md to remix)")

if __name__ == "__main__":
    main()
