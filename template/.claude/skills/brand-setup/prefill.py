#!/usr/bin/env python3
"""prefill.py - read a brand's own public website and PROPOSE brand-setup answers. It writes nothing.

  python3 prefill.py https://example.com            prints JSON: name, description, colours, fonts, instagram handles, logo candidates
  python3 prefill.py --selftest

Every value is a proposal with where it came from. The person confirms each one before it goes into brand/brand.json.
It never proposes facts (numbers, results, prices, client names): those only come from the person, into brand/facts.md.
Fetches the homepage and up to 3 of its own stylesheets, once each. Standard library only.
"""
import collections, json, re, sys, urllib.parse, urllib.request

UA = "Mozilla/5.0 (compatible; reel-kit-brand-setup/1.0)"
GENERIC = {"sans-serif", "serif", "monospace", "system-ui", "inherit", "initial", "cursive", "ui-sans-serif", "ui-serif", "ui-monospace",
           "-apple-system", "blinkmacsystemfont", "segoe ui", "helvetica", "helvetica neue", "arial", "roboto", "emoji", "fantasy"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read(2_000_000).decode("utf-8", "replace")


def meta(html, key):
    m = re.search(r'<meta[^>]+(?:property|name)=["\']%s["\'][^>]*content=["\']([^"\']*)' % re.escape(key), html, re.I) or \
        re.search(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']%s["\']' % re.escape(key), html, re.I)
    return m.group(1).strip() if m else ""


def norm_hex(h):
    h = h.lower().lstrip("#")
    return "#" + (h[0] * 2 + h[1] * 2 + h[2] * 2 if len(h) == 3 else h[:6])


def is_grey(h):
    r, g, b = (int(h[i:i + 2], 16) for i in (1, 3, 5))
    return max(r, g, b) - min(r, g, b) < 24


def analyse(html, css, base):
    title = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    name = meta(html, "og:site_name") or (re.split(r"\s[|\-:]\s", re.sub(r"\s+", " ", title.group(1)).strip())[0] if title else "")
    text = html + "\n" + css
    hexes = collections.Counter(norm_hex(h) for h in re.findall(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b", text))
    colours = [c for c, _ in hexes.most_common(40) if not is_grey(c)][:5]
    greys = [c for c, _ in hexes.most_common(40) if is_grey(c)][:3]
    fonts = collections.Counter()
    for decl in re.findall(r"font-family\s*:\s*([^;}{]+)", text, re.I):
        for f in decl.split(","):
            f = f.strip().strip("'\"").strip()
            if f and f.lower() not in GENERIC and not f.startswith("var("):
                fonts[f] += 1
    insta = sorted(set(m for m in re.findall(r"instagram\.com/([A-Za-z0-9_.]{2,30})/?", html)
                       if m.lower() not in ("p", "reel", "reels", "explore", "accounts", "stories")))
    logos = []
    for tag in re.findall(r"<(?:link|img)[^>]+>", html, re.I):
        low = tag.lower()
        if ("logo" in low) or re.search(r'rel=["\'][^"\']*icon', low):
            m = re.search(r'(?:href|src)=["\']([^"\']+)', tag, re.I)
            if m:
                logos.append(urllib.parse.urljoin(base, m.group(1)))
    og = meta(html, "og:image")
    if og:
        logos.append(urllib.parse.urljoin(base, og))
    return {
        "name": {"value": name, "source": "og:site_name or <title>"},
        "description": {"value": meta(html, "description") or meta(html, "og:description"), "source": "meta description"},
        "colours": {"accent_candidates": colours, "background_or_ink_candidates": greys,
                    "theme_color": meta(html, "theme-color"), "source": "most-used hex codes in the page and its CSS (a guess: confirm)"},
        "fonts": {"candidates": [f for f, _ in fonts.most_common(4)], "source": "font-family declarations"},
        "instagram_handles": {"candidates": ["@" + h for h in insta], "source": "links on the page"},
        "logo_candidates": list(dict.fromkeys(logos))[:5],
        "note": "Proposals only. Nothing written. Facts (numbers, results, prices, clients) are never taken from a website.",
    }


def selftest():
    html = '<html><head><title>Bagel Co | Toronto</title><meta property="og:site_name" content="Bagel Co"><meta name="description" content="Bagels.">' \
           '<style>a{color:#E4572E}.b{background:#e4572e;color:#fff;font-family:"Fraunces",serif}p{color:#111}</style></head>' \
           '<body><a href="https://instagram.com/bagelco/">ig</a><img src="/logo.svg"></body></html>'
    r = analyse(html, "", "https://bagel.test/")
    assert r["name"]["value"] == "Bagel Co", r["name"]
    assert r["colours"]["accent_candidates"][0] == "#e4572e", r["colours"]
    assert r["fonts"]["candidates"] == ["Fraunces"], r["fonts"]
    assert r["instagram_handles"]["candidates"] == ["@bagelco"]
    assert r["logo_candidates"][0] == "https://bagel.test/logo.svg"
    print("selftest OK")


def main():
    if "--selftest" in sys.argv:
        return selftest()
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    url = sys.argv[1] if sys.argv[1].startswith("http") else "https://" + sys.argv[1]
    try:
        html = get(url)
    except Exception as e:
        sys.exit(f"Could not read {url}: {e}")
    css = ""
    host = urllib.parse.urlparse(url).netloc
    for href in re.findall(r'<link[^>]+rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)', html, re.I)[:3]:
        full = urllib.parse.urljoin(url, href)
        if urllib.parse.urlparse(full).netloc == host:
            try:
                css += get(full) + "\n"
            except Exception:
                pass
    print(json.dumps(analyse(html, css, url), indent=2))


if __name__ == "__main__":
    main()
