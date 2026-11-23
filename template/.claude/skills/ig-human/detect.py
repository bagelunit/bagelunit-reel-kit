#!/usr/bin/env python3
"""
detect.py - a five-check panel that scores how machine-written a draft looks.

What this is:  five local heuristics modelled on the signals public AI
detectors actually measure - sentence-length variation, concreteness, stock
vocabulary, typographic fingerprint, and voice. Every score is computed on
your machine from the text alone. Nothing is uploaded.

What this is NOT:  the commercial AI detectors.
It does not call their APIs and it cannot promise their verdict. It catches
the things they all key on, which is why fixing them tends to move their
numbers too - but the only honest claim is the one on this line.

Each check returns a HUMAN score from 0 to 100. Higher is better.

Usage
  python3 detect.py draft.txt
  pbpaste | python3 detect.py -
  python3 detect.py draft.txt --json
  python3 detect.py before.txt after.txt      # compare two drafts
"""

import argparse
import json
import os
import re
import statistics
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
LEX = os.path.join(HERE, "slop.json")

SENT_RE = re.compile(r"[^.!?\n]+[.!?]*")
WORD_RE = re.compile(r"[A-Za-z']+")
CONTRACTIONS = re.compile(r"\b\w+'(?:s|t|re|ve|ll|d|m)\b", re.IGNORECASE)
PRONOUNS = re.compile(r"\b(i|me|my|mine|we|us|our|you|your)\b", re.IGNORECASE)
NUMBERS = re.compile(r"\b\d[\d,.]*%?\b|\$\d")
# Product names are often CamelCase (ChatGPT, OpenRouter, YouTube). Title-case names count too, including at the
# start of a sentence. Ordinary sentence openers do not.
CAMEL = re.compile(r"\b[A-Z][a-z0-9]*[A-Z][A-Za-z0-9]*\b")
TITLE = re.compile(r"\b[A-Z][a-z]{2,}\b")
# Spoken quantities. "one" is left out: it is an article as often as a number ("one place").
SPOKEN_NUMBERS = {
    "zero", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty",
    "sixty", "seventy", "eighty", "ninety", "hundred", "thousand", "million",
    "billion", "dozen",
}
# Words a sentence may open with that are not names. A name in the middle of a line still counts.
STOP_NAMES = {
    "After", "Once", "Download", "Sign", "Check", "Read", "Customer", "Local",
    "Running", "Took", "Grab", "Start", "Before", "During", "While", "Until",
    "Because", "Since", "Today", "Tomorrow", "Please", "Open", "Close", "Click",
    "Tap", "Look", "Keep", "Make", "Use", "Try", "Get", "See", "Watch", "Want",
    "Need", "Stop", "Wait", "Plus", "With", "From", "Into", "Over", "Under",
    "About", "Around", "Again", "Still", "Already", "Never", "Always", "Maybe",
    "Your", "Their", "This", "That", "Then", "Next", "Here", "Save", "Follow",
    "Send", "Share", "Comment", "Same", "Now", "First", "Last", "And", "But",
    "The", "You", "Who", "What", "When", "Why", "How", "Where", "Are", "Can",
    "Will", "Have", "Has", "Just", "Only", "Also", "Even", "Every", "Most",
    "Some", "Any", "Not", "Yes", "One", "Two", "Three", "Four", "Five", "Six",
    "Seven", "Eight", "Nine", "Ten", "Monday", "Tuesday", "Wednesday", "Thursday",
    "Friday", "Saturday", "Sunday", "January", "February", "March", "April",
    "May", "June", "July", "August", "September", "October", "November", "December",
    "Been", "Were", "Was", "Did", "Does", "Doing", "Going", "Coming", "There",
    "They", "Them", "Its", "It's", "Don't", "Can't", "Won't", "Here's", "That's",
    "What's", "You're", "You've", "You'll", "They're", "We're", "We'll",
}
# Phrases the kit itself teaches (the brand's ask, a snapback). They are not AI tells.
# A brand can add its own in brand.json: cta.default, cta.allowed_phrases, writing.allowed_phrases.
BUILTIN_ALLOWED = (
    "follow for more", "hit follow for more", "save this for later", "save this",
    "send this to", "let me know in the comments", "the catch", "the good news",
    "the kicker", "the best part", "the twist", "the real problem",
)


def spoken_only(text):
    """Drop script notes. A line that starts with '# ' or '//' or '[' is a note, not words the viewer hears.
    A bare #hashtag (no space) is kept: captions use those, and this panel scores captions too."""
    kept = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("# ") or s.startswith("#\t") or s.startswith("//") or s.startswith("["):
            continue
        if re.match(r"^#(?:Series|Episode|Next|Reel|Facts)\b", s, re.I):
            continue
        kept.append(line)
    return "\n".join(kept)


def brand_path():
    root = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
    path = os.path.join(root, "brand", "brand.json")
    return path if os.path.exists(path) else None


def load_brand():
    path = brand_path()
    if not path:
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def allowed_phrases(brand=None):
    """Phrases that must not count as slop or as a structural tell: the kit's own asks and snapbacks, plus the brand's."""
    brand = load_brand() if brand is None else (brand or {})
    found = list(BUILTIN_ALLOWED)
    cta = brand.get("cta") if isinstance(brand.get("cta"), dict) else {}
    writing = brand.get("writing") if isinstance(brand.get("writing"), dict) else {}
    if cta.get("default"):
        found.append(str(cta["default"]))
    for key in ("allowed_phrases",):
        for src in (cta, writing):
            extra = src.get(key)
            if isinstance(extra, list):
                found.extend(str(p) for p in extra if str(p).strip())
    # longest first so a full sentence is masked before a piece of it
    out, seen = [], set()
    for p in sorted(found, key=len, reverse=True):
        p = p.strip()
        if len(p) < 4 or p.lower() in seen:
            continue
        seen.add(p.lower())
        out.append(p)
    return out


def mask_allowed(text, phrases):
    out = text
    for p in phrases:
        out = re.sub(r"\b" + re.escape(p) + r"\b", " ", out, flags=re.IGNORECASE)
    return out


def brand_bar():
    """The human score's floor: brand.json -> writing.human_score_min (the kit default is 70, the panel's own PASS).
    It is a floor, not the goal. The 90 bar is the retention script score."""
    try:
        return float(load_brand().get("writing", {}).get("human_score_min", 70))
    except Exception:
        return 70.0


def clamp(n):
    return max(0.0, min(100.0, n))


def scale(value, human, machine):
    """Map value onto 0-100 where `human` -> 100 and `machine` -> 0."""
    if human == machine:
        return 50.0
    return clamp((value - machine) / (human - machine) * 100)


def sentences(text):
    return [s.strip() for s in SENT_RE.findall(text) if len(s.split()) > 2]


def words(text):
    return WORD_RE.findall(text)


ENUM_WORD = re.compile(r"^(one|two|three|four|five|six|seven|eight|nine|ten|\d+)[.:)]?$", re.IGNORECASE)
LONG_SENTENCE = 28          # words: no one says this in one breath, so it earns no variety credit
MAX_NAMES = 6               # distinct proper names that count towards concreteness (a longer list is a screen job)


def sentence_points(n):
    """How well one sentence fits the brand's rhythm: most lines 6 to 14 words, a few 3-to-5-word punches,
    nothing that needs a second breath. A script of all 6-to-14-word lines scores 100. The old check wanted a
    length variation of 0.70, which that script can never reach."""
    if 6 <= n <= 14:
        return 100.0
    if 3 <= n <= 5:
        return 84.0
    if 15 <= n <= 22:
        return 80.0
    if n <= 2:
        return 42.0
    if n <= LONG_SENTENCE:
        return 40.0
    return 15.0


def check_burstiness(text):
    """Rhythm the brand can actually say. Most sentences 6 to 14 words, a few short punches, none over 28.
    A run-on caps the score. More than three tiny fragments cost points: a fragment has to be a clear thought."""
    chunks = [c.strip() for c in SENT_RE.findall(text) if c.strip() and len(c.split()) >= 1]
    lens = [len(c.split()) for c in chunks]
    if len(lens) < 4:
        return 50.0, "too short to judge"
    score = statistics.mean(sentence_points(n) for n in lens)
    band = sum(1 for n in lens if 6 <= n <= 14)
    punches = sum(1 for n in lens if 3 <= n <= 5)
    notes = [f"{band} of {len(lens)} sentences are 6 to 14 words, {punches} short punch(es) (a few punches are fine)"]
    long_n = sum(1 for n in lens if n > LONG_SENTENCE)
    if long_n:
        score = min(score, 75.0)
        notes.append(f"{long_n} sentence(s) over {LONG_SENTENCE} words: split them, a run-on is not rhythm")
    frags = [c for c in chunks if 0 < len(c.split()) <= 3 and not ENUM_WORD.match(c.split()[0] if c.split() else "") and not NUMBERS.search(c)]
    if len(frags) > 3:
        score = clamp(score - 6 * (len(frags) - 3))
        notes.append(f"{len(frags)} fragments of 3 words or fewer: a fragment should be a clear thought")
    return clamp(score), "; ".join(notes)


def concrete_names(text):
    """CamelCase product names and title-case names, including at the start of a sentence. Not ordinary openers."""
    names = set(CAMEL.findall(text))
    for n in TITLE.findall(text):
        if n not in STOP_NAMES:
            names.add(n)
    return names


def concrete_numbers(text):
    """Digits and spoken quantities. "fifty" and "8" both count. "one" does not (it is usually an article)."""
    digits = NUMBERS.findall(text)
    spoken = [w for w in words(text) if w.lower().strip("'") in SPOKEN_NUMBERS]
    return digits, spoken


def check_specificity(text):
    """Numbers, names and concrete nouns. Slop is abstract.
    Spoken numbers and product names count: an AI-news script is made of them."""
    w = words(text)
    if len(w) < 25:
        return 50.0, "too short to judge"
    per100 = 100 / len(w)
    names = concrete_names(text)
    digits, spoken = concrete_numbers(text)
    hits = len(digits) + len(spoken) + min(len(names), MAX_NAMES)   # a list of ten brand names is not ten facts
    density = hits * per100
    score = scale(density, human=6.0, machine=0.5)
    return score, f"{hits} concrete markers, {density:.1f} per 100 words (want 4+; at most {MAX_NAMES} names count; spoken numbers count)"


def check_slop(text, lex, phrases=()):
    """Stock vocabulary density against the lexicon. The brand's own asks and snapbacks are not stock words."""
    text = mask_allowed(text, phrases)
    w = words(text)
    if not w:
        return 50.0, "empty"
    hits, found = 0, []
    for entry in lex["words"] + lex["phrases"]:
        pattern = re.compile(r"\b" + re.escape(entry["find"]).replace(r"\ ", r"\s+") + r"\b",
                             re.IGNORECASE)
        n = len(pattern.findall(text))
        if n:
            hits += n
            found.append(entry["find"])
    density = hits * 100 / len(w)
    score = scale(density, human=0.0, machine=4.0)
    detail = f"{hits} stock terms, {density:.1f} per 100 words"
    if found:
        detail += " (" + ", ".join(sorted(found)[:4]) + (", ..." if len(found) > 4 else "") + ")"
    return score, detail


def check_fingerprint(text):
    """Characters a phone keyboard does not produce."""
    invisible = sum(1 for c in text if unicodedata.category(c) == "Cf")
    em = text.count("\u2014")
    curly = sum(text.count(c) for c in "‘’“”")
    ellip = text.count("…")
    nbsp = sum(text.count(c) for c in "   ")
    total = invisible * 4 + em * 2 + curly + ellip + nbsp
    per1k = total * 1000 / max(len(text), 1)
    score = scale(per1k, human=0.0, machine=12.0)
    detail = (f"{invisible} invisible, {em} em dash, {curly} curly quote, "
              f"{ellip} ellipsis, {nbsp} hard space")
    return score, detail


def check_voice(text, lex, phrases=()):
    """Contractions, person, and the shapes models default to. A brand snapback or ask is not a tell."""
    raw = text
    text = mask_allowed(text, phrases)
    w = words(raw)  # contractions and pronouns are counted on the real words, not the masked copy
    if len(w) < 25:
        return 50.0, "too short to judge"
    per100 = 100 / len(w)
    contractions = len(CONTRACTIONS.findall(raw)) * per100
    person = len(PRONOUNS.findall(raw)) * per100
    tells = 0
    names = []
    for s in lex["structures"]:
        try:
            n = len(re.compile(s["regex"], re.MULTILINE).findall(text))
        except re.error:
            continue
        if n:
            tells += n
            names.append(s["id"])
    bullets = [len(b.split()) for b in re.findall(r"(?m)^\s*[-*•]\s+(.+)$", text)]
    uniform = (len(bullets) >= 3 and statistics.pstdev(bullets) < 1.6)
    score = (scale(contractions, human=3.0, machine=0.0) * 0.35
             + scale(person, human=8.0, machine=1.0) * 0.35
             + clamp(100 - tells * 22) * 0.30)
    if uniform:
        score -= 12
        names.append("uniform-bullets")
    detail = (f"{contractions:.1f} contractions, {person:.1f} personal pronouns "
              f"per 100 words, {tells} structural tell(s)")
    if names:
        detail += " [" + ", ".join(names[:4]) + "]"
    return clamp(score), detail


CHECKS = ["BURSTINESS", "SPECIFICITY", "SLOP DENSITY", "FINGERPRINT", "VOICE"]


def run(text, lex, brand=None):
    text = spoken_only(text)
    phrases = allowed_phrases(brand)
    results = {}
    results["BURSTINESS"] = check_burstiness(text)
    results["SPECIFICITY"] = check_specificity(text)
    results["SLOP DENSITY"] = check_slop(text, lex, phrases)
    results["FINGERPRINT"] = check_fingerprint(text)
    results["VOICE"] = check_voice(text, lex, phrases)
    scores = [results[c][0] for c in CHECKS]
    # The weakest check drags the verdict: a detector only needs one signal.
    overall = statistics.mean(scores) * 0.6 + min(scores) * 0.4
    verdict = "PASS" if overall >= 70 and min(scores) >= 55 else (
        "REVIEW" if overall >= 50 else "FLAGGED")
    return results, overall, verdict


def bar(score, width=24):
    filled = round(score / 100 * width)
    return "#" * filled + "." * (width - filled)


def render(results, overall, verdict, label=None, out=sys.stdout):
    title = "AI DETECTION PANEL" + (f"  -  {label}" if label else "")
    print("\n" + title, file=out)
    print("=" * max(len(title), 62), file=out)
    for name in CHECKS:
        score, detail = results[name]
        print(f"  {name:<13} {bar(score)} {score:5.1f}", file=out)
        print(f"  {'':<13} {detail}", file=out)
    print("-" * 62, file=out)
    print(f"  {'HUMAN SCORE':<13} {bar(overall)} {overall:5.1f}   {verdict}", file=out)
    need = brand_bar()
    print(f"  {'FLOOR':<13} {need:5.0f} needed   {'MET' if overall >= need else 'NOT MET: rewrite the weakest check'}", file=out)
    print(f"  {'':<13} floor only. The 90 bar is the retention score (kit score / /script-score).", file=out)
    if verdict != "PASS":
        weakest = min(CHECKS, key=lambda c: results[c][0])
        print(f"\n  Weakest signal: {weakest}. Fix that first.", file=out)
    print("", file=out)


def main():
    ap = argparse.ArgumentParser(description="Score how machine-written a draft looks.")
    ap.add_argument("input", nargs="?", default="-", help="file, or - for stdin")
    ap.add_argument("compare", nargs="?", help="second file, to show before/after")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--lexicon", default=LEX)
    args = ap.parse_args()

    lex = json.load(open(args.lexicon, encoding="utf-8"))
    read = lambda p: sys.stdin.read() if p == "-" else open(p, encoding="utf-8").read()

    targets = [(args.input, read(args.input))]
    if args.compare:
        targets.append((args.compare, read(args.compare)))

    payload = []
    for name, text in targets:
        results, overall, verdict = run(text, lex)
        payload.append({
            "source": name,
            "checks": {k: {"score": round(v[0], 1), "detail": v[1]} for k, v in results.items()},
            "human_score": round(overall, 1),
            "verdict": verdict,
        })

    if args.json:
        print(json.dumps(payload if args.compare else payload[0], indent=2))
        return

    for (name, text), p in zip(targets, payload):
        results, overall, verdict = run(text, lex)
        render(results, overall, verdict, label=os.path.basename(name) if args.compare else None)
    if args.compare:
        a, b = payload
        delta = b["human_score"] - a["human_score"]
        print(f"  {a['human_score']:.1f} {a['verdict']}  ->  "
              f"{b['human_score']:.1f} {b['verdict']}   ({delta:+.1f})\n")

    sys.exit(0 if payload[-1]["verdict"] == "PASS" else 1)


def selftest():
    lex = json.load(open(LEX, encoding="utf-8"))
    notes = "# Reel: not spoken. Facts: F-1.\nYou've got eight lessons in ChatGPT today.\nOpenRouter's free tier is fifty requests.\n"
    spoken = spoken_only(notes)
    assert "not spoken" not in spoken and "ChatGPT" in spoken
    names = concrete_names("ChatGPT and OpenRouter ship today. Claude too.")
    assert "ChatGPT" in names and "OpenRouter" in names and "Claude" in names, names
    assert "After" not in concrete_names("After the site closes, Claude stays.")
    digits, spoken_n = concrete_numbers("fifty requests and 8 lessons")
    assert spoken_n and digits, (digits, spoken_n)
    even = " ".join(["You check the shop before you open the door today."] * 8)
    b, detail = check_burstiness(even)
    assert b >= 90, (b, detail)
    slop, _ = check_slop("Save this, and follow for more tomorrow. The catch? It is fine.", lex, allowed_phrases({}))
    assert slop == 100, slop
    voice, vdetail = check_voice(
        "The catch?\nYou still follow for more after you save this and send this to the person who runs the shop with you every single Monday morning.",
        lex, allowed_phrases({}))
    assert "the-result" not in vdetail and "follow-bait" not in vdetail, vdetail
    print("detect selftest: ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
    else:
        main()
