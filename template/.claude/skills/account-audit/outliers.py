#!/usr/bin/env python3
"""outliers.py - find the reels that beat an account's own median (the 3x rule), by arithmetic, not by eye.

Two ways to feed it:
  1. --json FILE      an Instagram scraper export you already have (a list of posts). Offline, no key, no gate.
  2. --handles a,b    fetch the accounts' latest posts from Apify (paid per result). Needs:
                        - brand/brand.json -> "autopilot": {"scrape": true}   (the brand owner turns this on)
                        - an Apify token in ~/.config/susanoo-reels/apify.key  (you put it there; this script never prints it)

Rule: for each account, median views over its most recent reels (default 12). Each reel's ratio = views / median.
  ratio >= 3.0  -> STUDY   (a formula worth tearing down)
  ratio >= 1.5  -> NOTE
  below 1.5     -> ignore
Fewer than 5 reels gives no trustworthy median, so the account is reported but not ranked.

Examples:
  python3 outliers.py --json export.json
  python3 outliers.py --handles mybrand,rival1,rival2 --limit 30 --out brand/swipe.md
  python3 outliers.py --handles mybrand --dry-run
  python3 outliers.py --selftest
Standard library only.
"""
import argparse, datetime, json, os, pathlib, statistics, sys, urllib.error, urllib.request

CONFIG = pathlib.Path(os.environ.get("SUSANOO_REELS_HOME", pathlib.Path.home() / ".config" / "susanoo-reels"))
KEYFILE = CONFIG / "apify.key"
ACTOR = "apify~instagram-scraper"
COST_PER_1000 = 2.70          # USD per 1,000 results on Apify's free plan; check your plan
VIEW_FIELDS = ("videoPlayCount", "videoViewCount", "igPlayCount", "playsCount", "viewsCount", "views")
MIN_REELS = 5


def views_of(item):
    for f in VIEW_FIELDS:
        v = item.get(f)
        if isinstance(v, (int, float)) and v >= 0:
            return int(v)
    return None


def is_reel(item):
    return item.get("productType") == "clips" or item.get("type") == "Video" or views_of(item) is not None


def when(item):
    s = item.get("timestamp") or item.get("takenAt") or ""
    try:
        return datetime.datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)


def owner_of(item):
    return item.get("ownerUsername") or (item.get("owner") or {}).get("username") or "unknown"


def analyse(items, window=12):
    """Return {account: {"median": m, "n": n, "reels": [ {ratio, tier, views, ...} ]}}."""
    by = {}
    for it in items:
        if is_reel(it) and views_of(it) is not None:
            by.setdefault(owner_of(it), []).append(it)
    out = {}
    for acct, reels in by.items():
        reels.sort(key=when, reverse=True)
        recent = [views_of(r) for r in reels[:window]]
        n = len(recent)
        med = statistics.median(recent) if n else 0
        rows = []
        for r in reels:
            v = views_of(r)
            ratio = (v / med) if (med and n >= MIN_REELS) else None
            tier = None
            if ratio is not None:
                tier = "STUDY" if ratio >= 3 else "NOTE" if ratio >= 1.5 else "ignore"
            cap = " ".join((r.get("caption") or "").split())[:90]
            rows.append({"ratio": ratio, "tier": tier, "views": v, "likes": r.get("likesCount", ""), "comments": r.get("commentsCount", ""), "url": r.get("url") or "", "caption": cap,
                         "date": when(r).strftime("%Y-%m-%d") if when(r).year > 1 else ""})
        out[acct] = {"median": med, "n": n, "reels": rows}
    return out


def render(result, window, show_all=False):
    lines = []
    for acct, d in sorted(result.items()):
        if d["n"] < MIN_REELS:
            lines.append(f"## @{acct}\nOnly {d['n']} reels found, so no trustworthy median (need {MIN_REELS}). Not ranked.\n")
            continue
        lines.append(f"## @{acct}\nMedian views over the last {min(d['n'], window)} reels: {int(d['median']):,}\n")
        keep = [r for r in d["reels"] if r["ratio"] is not None] if show_all else [r for r in d["reels"] if r["tier"] in ("STUDY", "NOTE")]
        if not keep:
            lines.append("No reel beat 1.5x its median.\n")
            continue
        keep.sort(key=lambda r: r["ratio"], reverse=True)
        lines.append("| Tier | Ratio | Views | Likes | Comments | Date | Hook (first line) | Link |\n|---|---|---|---|---|---|---|---|")
        for r in keep:
            lines.append(f"| {r['tier']} | {r['ratio']:.1f}x | {r['views']:,} | {r['likes']} | {r['comments']} | {r['date']} | {r['caption']} | {r['url']} |")
        lines.append("")
    return "\n".join(lines)


def find_brand():
    p = pathlib.Path.cwd()
    for d in [p, *p.parents]:
        f = d / "brand" / "brand.json"
        if f.exists():
            try:
                return json.loads(f.read_text())
            except ValueError:
                return None
    return None


def fetch(handles, limit, max_cost):
    brand = find_brand()
    if not brand or (brand.get("autopilot") or {}).get("scrape") is not True:
        sys.exit("Stopped: scraping is off. The brand owner must set brand/brand.json -> autopilot.scrape to true first "
                 "(or run again with --json on an export you already have).")
    est = len(handles) * limit / 1000 * COST_PER_1000
    print(f"Plan: {len(handles)} account(s) x up to {limit} posts, about ${est:.2f} at ${COST_PER_1000}/1,000 results.", file=sys.stderr)
    if est > max_cost:
        sys.exit(f"Stopped: estimate ${est:.2f} is over --max-cost ${max_cost:.2f}. Lower --limit or raise --max-cost.")
    if not KEYFILE.exists() or not KEYFILE.read_text().strip():
        sys.exit(f"No Apify token. Make one at https://console.apify.com/settings/integrations and save it to {KEYFILE} yourself "
                 f"(chmod 600). This script never asks for, prints or stores it.")
    token = KEYFILE.read_text().strip()
    body = json.dumps({"directUrls": [f"https://www.instagram.com/{h.strip().lstrip('@')}/" for h in handles],
                       "resultsType": "posts", "resultsLimit": limit, "addParentData": False}).encode()
    req = urllib.request.Request(f"https://api.apify.com/v2/acts/{ACTOR}/run-sync-get-dataset-items", data=body, method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        hint = " (the token looks wrong or expired)" if e.code in (401, 403) else ""
        sys.exit(f"Apify answered HTTP {e.code}{hint}.")
    except (urllib.error.URLError, TimeoutError) as e:
        sys.exit(f"Could not reach Apify: {getattr(e, 'reason', e)}")


def selftest():
    base = datetime.datetime(2026, 11, 1, tzinfo=datetime.timezone.utc)
    items = [{"ownerUsername": "t", "type": "Video", "videoPlayCount": v, "timestamp": (base - datetime.timedelta(days=i)).isoformat(),
              "caption": f"hook {i}", "url": f"u{i}"} for i, v in enumerate([1000, 5200, 1100, 900, 2000, 1000, 950, 1050, 1000, 980, 1020, 1000])]
    items.append({"ownerUsername": "t", "type": "Image", "likesCount": 5})              # not a reel: ignored
    items.append({"ownerUsername": "few", "type": "Video", "videoPlayCount": 10, "timestamp": base.isoformat()})
    res = analyse(items)
    t = {r["views"]: r["tier"] for r in res["t"]["reels"]}
    assert t[5200] == "STUDY", t
    assert t[2000] == "NOTE", t
    assert t[1000] == "ignore", t
    assert res["few"]["reels"][0]["tier"] is None
    assert "Only 1 reels" in render(res, 12)
    print("selftest OK")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", help="a scraper export (list of posts)")
    ap.add_argument("--handles", help="comma-separated Instagram handles to fetch via Apify")
    ap.add_argument("--limit", type=int, default=30, help="posts per account to fetch (default 30)")
    ap.add_argument("--window", type=int, default=12, help="reels used for the median (default 12)")
    ap.add_argument("--max-cost", type=float, default=1.00, help="abort if the estimate is above this many USD (default 1.00)")
    ap.add_argument("--out", help="append the report to this file (for example brand/swipe.md)")
    ap.add_argument("--all", action="store_true", help="list every reel with its ratio (use on the brand's own account to fill brand/stats.md)")
    ap.add_argument("--dry-run", action="store_true", help="show the plan and cost, fetch nothing")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if a.json:
        data = json.loads(pathlib.Path(a.json).read_text())
        items = data if isinstance(data, list) else data.get("items", [])
    elif a.handles:
        handles = [h for h in a.handles.split(",") if h.strip()]
        if a.dry_run:
            est = len(handles) * a.limit / 1000 * COST_PER_1000
            print(f"Would fetch {len(handles)} account(s) x {a.limit} posts, about ${est:.2f}. Nothing sent.")
            return
        items = fetch(handles, a.limit, a.max_cost)
    else:
        ap.error("give --json FILE or --handles a,b")
    report = render(analyse(items, a.window), a.window, a.all)
    print(report)
    if a.out:
        with open(a.out, "a") as f:
            f.write(f"\n# Outlier scan {datetime.date.today().isoformat()}\n\n{report}\n")
        print(f"Appended to {a.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
