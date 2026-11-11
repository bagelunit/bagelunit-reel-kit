#!/usr/bin/env python3
"""outliers.py - find the reels that beat an account's own median (the 3x rule), by arithmetic, not by eye.

Two ways to feed it:
  1. --json FILE      an Instagram scraper export you already have (a list of posts). Offline, no key, no gate.
  1b. --csv FILE      an Instagram Insights export as CSV. Needs a views column and a date or timestamp column
                      (names matched without regard to case). Owner name from --owner (default "account").
  2. --handles a,b    fetch the accounts' latest posts from Apify (paid per result). Needs:
                        - brand/brand.json -> "autopilot": {"scrape": true}   (the brand owner turns this on)
                        - an Apify token in ~/.config/bagelunit-reels/apify.key  (you put it there; this script never prints it)

Rule: for each account, median views over its most recent reels (default 12). Each reel's ratio = views / median.
  ratio >= 3.0  -> STUDY   (a formula worth tearing down)
  ratio >= 1.5  -> NOTE
  below 1.5     -> ignore
Fewer than 5 reels gives no trustworthy median, so the account is reported but not ranked.

Examples:
  python3 outliers.py --json export.json
  python3 outliers.py --handles mybrand,rival1,rival2 --limit 30 --out brand/swipe.md
  python3 outliers.py --handles rival1,rival2 --save-research brand/research --out brand/swipe.md
  python3 outliers.py --handles mybrand --dry-run
  python3 outliers.py --selftest
Standard library only.
"""
import argparse, csv, datetime, json, os, pathlib, statistics, sys, urllib.error, urllib.request

CONFIG = pathlib.Path(os.environ.get("BAGELUNIT_REELS_HOME", pathlib.Path.home() / ".config" / "bagelunit-reels"))
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


def items_from_csv(path, owner="account"):
    """Read an Insights CSV into the same item shape as the scraper export. Columns are matched case-insensitively:
    views (or plays, reach) and date (or timestamp); caption/title, url/permalink, likes, comments are optional."""
    with open(path, newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        return []
    cols = {(k or "").strip().lower(): k for k in rows[0]}
    def col(*names):
        for n in names:
            if n in cols:
                return cols[n]
        return None
    vc, dc = col("views", "plays", "video views"), col("timestamp", "date", "publish time", "publish date")
    if not vc or not dc:
        sys.exit("The CSV needs a 'views' column and a 'date' or 'timestamp' column. Found: " + ", ".join(rows[0].keys()))
    cc, uc, lc, mc = col("caption", "title", "description"), col("url", "permalink", "link"), col("likes"), col("comments")
    items = []
    for r in rows:
        raw = (r.get(vc) or "").replace(",", "").strip()
        try:
            v = int(float(raw))
        except ValueError:
            continue
        it = {"ownerUsername": owner, "type": "Video", "videoPlayCount": v, "timestamp": (r.get(dc) or "").strip()}
        for key, c in (("caption", cc), ("url", uc)):
            if c:
                it[key] = r.get(c) or ""
        for key, c in (("likesCount", lc), ("commentsCount", mc)):
            if c and (r.get(c) or "").strip():
                it[key] = r[c].strip()
        items.append(it)
    return items


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
        lines.append(f"## @{acct}\nMedian views over the last {min(d['n'], window)} reels: {d['median']:,.1f}\n")
        keep = [r for r in d["reels"] if r["ratio"] is not None] if show_all else [r for r in d["reels"] if r["tier"] in ("STUDY", "NOTE")]
        if not keep:
            lines.append("No reel beat 1.5x its median.\n")
            continue
        keep.sort(key=lambda r: r["ratio"], reverse=True)
        lines.append("| Tier | Ratio | Views | Likes | Comments | Date | Hook (first line) | Link |\n|---|---|---|---|---|---|---|---|")
        for r in keep:
            lines.append(f"| {r['tier']} | {r['ratio']:.2f}x | {r['views']:,} | {r['likes']} | {r['comments']} | {r['date']} | {r['caption']} | {r['url']} |")
        lines.append("")
    return "\n".join(lines)


def save_research_csv(items, folder):
    """Write each account's posts to <folder>/<account>.csv in the format research.mjs uses (url,timestamp,views,likes,comments,caption,type),
    plus the followers the scraper reported, so the dashboard's competitors section reads Apify data the same way as Meta's."""
    folder = pathlib.Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    by = {}
    for it in items:
        by.setdefault(owner_of(it), []).append(it)
    accounts = {}
    for acct, its in by.items():
        safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in acct)
        its.sort(key=when, reverse=True)
        with open(folder / f"{safe}.csv", "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["url", "timestamp", "views", "likes", "comments", "caption", "type"])
            for it in its:
                v = views_of(it)
                w.writerow([it.get("url") or "", it.get("timestamp") or "", "" if v is None else v, it.get("likesCount", ""), it.get("commentsCount", ""),
                            " ".join((it.get("caption") or "").split())[:300], "REELS" if is_reel(it) else (it.get("type") or "")])
        fol = next((it.get("ownerFollowersCount") for it in its if isinstance(it.get("ownerFollowersCount"), (int, float))), None)
        accounts[safe.lower()] = {"followers": fol, "read": len(its), "pulled_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "source": "apify"}
    meta = folder / "accounts.json"
    try:
        cur = json.loads(meta.read_text()) if meta.exists() else {}
    except ValueError:
        cur = {}
    for k, v in accounts.items():
        old = cur.get(k, {})
        if v["followers"] is None:
            v["followers"] = old.get("followers")
        v["media_count"] = old.get("media_count")
        cur[k] = v
    meta.write_text(json.dumps(cur, indent=2) + "\n")
    return sorted(accounts)


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


def brand_dir():
    p = pathlib.Path.cwd()
    for d in [p, *p.parents]:
        if (d / "brand" / "brand.json").exists():
            return d / "brand"
    return None


def spend_total(bdir):
    """Total estimated USD already logged for this brand in brand/spend.csv."""
    f = bdir / "spend.csv" if bdir else None
    if not f or not f.exists():
        return 0.0
    total = 0.0
    for line in f.read_text().splitlines()[1:]:
        try:
            total += float(line.rsplit(",", 1)[1])
        except (IndexError, ValueError):
            pass
    return total


def log_spend(bdir, handles, results):
    """Append one row to brand/spend.csv: date, service, accounts, results, estimated USD."""
    if not bdir:
        return
    f = bdir / "spend.csv"
    new = not f.exists()
    est = results / 1000 * COST_PER_1000
    with open(f, "a") as fh:
        if new:
            fh.write("date,service,accounts,results,estimated_usd\n")
        fh.write(f"{datetime.date.today().isoformat()},apify,{'+'.join(h.strip().lstrip('@') for h in handles)},{results},{est:.2f}\n")


def fetch(handles, limit, max_cost):
    brand = find_brand()
    if not brand or (brand.get("autopilot") or {}).get("scrape") is not True:
        sys.exit("Stopped: scraping is off. The brand owner must set brand/brand.json -> autopilot.scrape to true first "
                 "(or run again with --json on an export you already have).")
    est = len(handles) * limit / 1000 * COST_PER_1000
    print(f"Plan: {len(handles)} account(s) x up to {limit} posts, about ${est:.2f} at ${COST_PER_1000}/1,000 results.", file=sys.stderr)
    so_far = spend_total(brand_dir())
    if so_far:
        print(f"Already spent on this brand (brand/spend.csv): about ${so_far:.2f}.", file=sys.stderr)
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
            items = json.loads(r.read().decode())
        log_spend(brand_dir(), handles, len(items))
        return items
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
    import tempfile
    assert "5.20x" in render(res, 12) and "1,000.0" in render(res, 12)
    with tempfile.TemporaryDirectory() as d:
        cp = pathlib.Path(d) / "ins.csv"
        cp.write_text("Date,Views,Caption\n" + "\n".join(f"2026-10-{i + 1:02d},{v},hook {i}" for i, v in enumerate([1000, 1100, 900, 5200, 1000, 950, 1050])) + "\n")
        ci = items_from_csv(cp, "me")
        cr = analyse(ci)
        assert len(ci) == 7 and cr["me"]["median"] == 1000 and any(r["tier"] == "STUDY" for r in cr["me"]["reels"]), cr
    with tempfile.TemporaryDirectory() as d:
        bd = pathlib.Path(d)
        log_spend(bd, ["@a", "b"], 500)
        log_spend(bd, ["a"], 1000)
        assert abs(spend_total(bd) - 4.05) < 0.001, spend_total(bd)
        assert (bd / "spend.csv").read_text().startswith("date,service")
    with tempfile.TemporaryDirectory() as d:
        names = save_research_csv(items, pathlib.Path(d) / "research")
        assert names == ["few", "t"], names
        txt = (pathlib.Path(d) / "research" / "t.csv").read_text()
        assert txt.startswith("url,timestamp,views,likes,comments,caption,type") and "5200" in txt
        assert json.loads((pathlib.Path(d) / "research" / "accounts.json").read_text())["t"]["source"] == "apify"
    print("selftest OK")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", help="a scraper export (list of posts)")
    ap.add_argument("--csv", help="an Instagram Insights export as CSV (needs views and date or timestamp columns)")
    ap.add_argument("--owner", default="account", help="account name to use for a --csv file (default: account)")
    ap.add_argument("--handles", help="comma-separated Instagram handles to fetch via Apify")
    ap.add_argument("--limit", type=int, default=30, help="posts per account to fetch (default 30)")
    ap.add_argument("--window", type=int, default=12, help="reels used for the median (default 12)")
    ap.add_argument("--max-cost", type=float, default=1.00, help="abort if the estimate is above this many USD (default 1.00)")
    ap.add_argument("--out", help="append the report to this file (for example brand/swipe.md)")
    ap.add_argument("--all", action="store_true", help="list every reel with its ratio (use on the brand's own account to fill brand/stats.md)")
    ap.add_argument("--save-research", metavar="FOLDER", help="with --handles: also save each account's posts as FOLDER/<account>.csv (brand/research) for the dashboard's competitors section")
    ap.add_argument("--dry-run", action="store_true", help="show the plan and cost, fetch nothing")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if a.json:
        data = json.loads(pathlib.Path(a.json).read_text())
        items = data if isinstance(data, list) else data.get("items", [])
    elif a.csv:
        items = items_from_csv(a.csv, a.owner.lstrip("@"))
    elif a.handles:
        handles = [h for h in a.handles.split(",") if h.strip()]
        if a.dry_run:
            est = len(handles) * a.limit / 1000 * COST_PER_1000
            print(f"Would fetch {len(handles)} account(s) x {a.limit} posts, about ${est:.2f}. Nothing sent.")
            return
        items = fetch(handles, a.limit, a.max_cost)
        if a.save_research:
            print("Saved research for: " + ", ".join(save_research_csv(items, a.save_research)), file=sys.stderr)
    else:
        ap.error("give --json FILE, --csv FILE or --handles a,b")
    report = render(analyse(items, a.window), a.window, a.all)
    print(report)
    if a.out:
        with open(a.out, "a") as f:
            f.write(f"\n# Outlier scan {datetime.date.today().isoformat()}\n\n{report}\n")
        print(f"Appended to {a.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
