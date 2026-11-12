#!/usr/bin/env python3
"""engagement.py - score each posted reel by how people reacted, against this brand's own normal.

Reads brand/insights.csv (reel, date, views, reach, avg_watch_time_s, skip_rate, likes, comments, saves, shares, follows).

The maths, in plain steps:
  1. For each reel, turn every reaction into a rate: reactions divided by reach (views if reach is empty).
     A reel seen by 10,000 people and a reel seen by 800 people become comparable.
  2. For each kind of reaction, find the brand's own median rate across its reels.
  3. A reel's ratio for that reaction is its rate divided by that median. 1.0 is typical for this brand,
     2.0 is twice as much as usual, 0.5 is half.
  4. A reel's score is the weighted average of its ratios. By default every kind of reaction counts the same:
     nothing in the numbers says a comment is worth 3 likes, so the kit does not pretend it is.
     Change the weights if the brand's goal says otherwise (--weights comments=2,shares=2, or
     brand.json -> scoring.weights, for example a goal of reach cares most about shares).
  5. 3.0 or more = STAND OUT, 1.5 to 3.0 = ABOVE USUAL, 0.5 or less = BELOW USUAL.
Fewer than 5 reels with numbers: no ranking (a median of a few reels is noise).

Usage:
  python3 engagement.py [--csv brand/insights.csv] [--weights comments=2,shares=2] [--out brand/stats.md]
  python3 engagement.py --selftest
Stdlib only. It reads one file and writes nothing unless --out is given.
"""
import argparse, csv, json, pathlib, statistics, sys

KINDS = ["likes", "comments", "saves", "shares", "follows"]
MIN_REELS = 5


def num(v):
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return None


def load(path):
    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    out = []
    for r in rows:
        r = {(k or "").strip().lower(): v for k, v in r.items()}
        base = num(r.get("reach")) or num(r.get("views"))
        if not r.get("reel") or not base or base <= 0:
            continue
        rates = {}
        for k in KINDS:
            v = num(r.get(k))
            if v is not None and v >= 0:
                rates[k] = v / base
        if rates:
            out.append({"reel": r["reel"].strip(), "date": (r.get("date") or "").strip(), "base": base, "rates": rates})
    return out


def parse_weights(text, brand_weights=None):
    w = {k: 1.0 for k in KINDS}
    for src in (brand_weights or {}, dict(p.split("=", 1) for p in text.split(",") if "=" in p) if text else {}):
        for k, v in src.items():
            k = k.strip().lower()
            if k not in w:
                raise ValueError(f"unknown reaction '{k}' (use: {', '.join(KINDS)})")
            n = num(v)
            if n is None or n < 0:
                raise ValueError(f"weight for {k} must be a number of 0 or more")
            w[k] = n
    return w


def score(reels, weights):
    """Returns (rows, medians). rows are the reels in order of score, best first. No ranking below MIN_REELS."""
    if len(reels) < MIN_REELS:
        return [], {}
    medians = {}
    for k in KINDS:
        xs = [r["rates"][k] for r in reels if k in r["rates"]]
        medians[k] = statistics.median(xs) if len(xs) >= MIN_REELS else 0
    rows = []
    for r in reels:
        ratios = {k: r["rates"][k] / medians[k] for k in KINDS if k in r["rates"] and medians[k] > 0}
        total = sum(weights[k] for k in ratios)
        if not ratios or total <= 0:
            continue
        s = sum(weights[k] * ratios[k] for k in ratios) / total
        best = max(ratios, key=ratios.get)
        rows.append({"reel": r["reel"], "date": r["date"], "score": s, "best": best, "best_ratio": ratios[best], "ratios": ratios})
    rows.sort(key=lambda x: -x["score"])
    return rows, medians


def label(s):
    return "STAND OUT" if s >= 3 else "ABOVE USUAL" if s >= 1.5 else "BELOW USUAL" if s <= 0.5 else "usual"


def render(rows, medians, weights):
    if not rows:
        return f"Not enough yet: this needs at least {MIN_REELS} reels with numbers in brand/insights.csv.\n"
    lines = ["# Reactions against this brand's own normal", "",
             "Score 1.0 is a typical reel for this brand. Every reaction is divided by reach first, then compared with the brand's own median.",
             "Weights: " + ", ".join(f"{k} {weights[k]:g}" for k in KINDS), "",
             "| Reel | Score | Verdict | Strongest reaction |", "|---|---|---|---|"]
    for r in rows:
        lines.append(f"| {r['reel']} | {r['score']:.2f} | {label(r['score'])} | {r['best']} ({r['best_ratio']:.1f}x usual) |")
    lines += ["", "Median rate per reaction (the brand's usual): " + ", ".join(f"{k} {medians[k] * 100:.2f}% of reach" for k in KINDS if medians[k] > 0), ""]
    return "\n".join(lines) + "\n"


def brand_weights(csv_path):
    p = pathlib.Path(csv_path).resolve().parent / "brand.json"
    try:
        return json.loads(p.read_text(encoding="utf-8")).get("scoring", {}).get("weights", {})
    except (OSError, ValueError):
        return {}


def selftest():
    import tempfile
    head = "reel,date,views,reach,avg_watch_time_s,skip_rate,likes,comments,saves,shares,follows\n"
    body = "".join(f"r{i},2026-01-0{i},{1000 + i * 10},{800 + i * 10},8,0.4,{80 + i},{8 + i % 2},{10 + i},{4 + i % 3},{3 + i % 2}\n" for i in range(1, 8))
    body += "star,2026-01-09,5000,4000,12,0.2,900,300,400,600,60\n"       # reacts far above this brand's usual
    body += "empty,2026-01-10,,,,,,,,,\n"                                 # no reach, no views: ignored
    with tempfile.TemporaryDirectory() as d:
        f = pathlib.Path(d) / "insights.csv"
        f.write_text(head + body, encoding="utf-8")
        reels = load(f)
        assert len(reels) == 8, "the empty row is skipped"
        rows, med = score(reels, parse_weights(""))
        assert rows[0]["reel"] == "star" and rows[0]["score"] >= 3 and label(rows[0]["score"]) == "STAND OUT", rows[0]
        assert 0.5 < statistics.median([r["score"] for r in rows]) < 1.6, "most reels sit near usual"
        w = parse_weights("shares=3")
        assert w["shares"] == 3 and w["likes"] == 1
        try:
            parse_weights("claps=2")
            raise SystemExit("an unknown reaction must be refused")
        except ValueError:
            pass
        assert score(reels[:3], parse_weights(""))[0] == [], "fewer than 5 reels: no ranking"
        (pathlib.Path(d) / "brand.json").write_text('{"scoring": {"weights": {"comments": 2}}}')
        assert brand_weights(f) == {"comments": 2}
        assert "Not enough yet" in render([], {}, w)
    print("engagement.py self-test passed")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", default="brand/insights.csv")
    ap.add_argument("--weights", default="", help="for example comments=2,shares=2 (default: every reaction counts the same)")
    ap.add_argument("--out", help="append the report to this file (for example brand/stats.md)")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    try:
        weights = parse_weights(a.weights, brand_weights(a.csv))
        rows, medians = score(load(a.csv), weights)
    except (OSError, ValueError) as e:
        sys.exit(f"engagement.py: {e}")
    text = render(rows, medians, weights)
    if a.out:
        with open(a.out, "a", encoding="utf-8") as fh:
            fh.write("\n" + text)
    print(text)


if __name__ == "__main__":
    main()
