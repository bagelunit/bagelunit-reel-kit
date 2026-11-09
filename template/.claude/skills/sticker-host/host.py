# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=10", "numpy>=1.24"]
# ///
"""BagelUnit Reel Kit: sticker host tools. Run with uv (it fetches Pillow and numpy for this script only):

  uv run .claude/skills/sticker-host/host.py <command> ...

Commands (run from the brand folder; the host lives in brand/host/):
  status                      what the set has: the starter 10, extras, custom poses, what is missing
  prompt <pose> [--base]      the full prompt for one pose (paste it into ChatGPT, Gemini or Higgsfield)
  add <pose> --pose "what the body, hands and face do" --use "when a reel uses it"
                              register a new pose (any name); it is then made like the others
  process [<pose> ...]        brand/host/raw/<pose>.png -> brand/host/poses/<pose>.png: remove the plain
                              background, keep or add the white sticker border, fit to the 896x1120 canvas
  logo --logo <file> [--ink #RRGGBB] [<pose>=dx,dy,scale,rot ...]
                              print the real logo on the chest of every finished pose (looks printed, not pasted)
  sheet                       brand/host/sheet.jpg: every finished pose side by side, to check the set
  generate <pose> --tool openai|gemini [--model M] [--dry-run]
                              make brand/host/raw/<pose>.png with your own key (~/.config/bagelunit-reels/
                              openai.key or gemini.key). Paid per image. The key is never printed.
  selftest                    checks the image steps on a drawn test figure (no network)
"""
import base64, json, os, sys, tempfile, urllib.request, urllib.error, uuid
from datetime import date

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = json.load(open(os.path.join(HERE, "pack.json"), encoding="utf-8"))
W, H = PACK["canvas"]["width"], PACK["canvas"]["height"]
CONFIG = os.path.join(os.path.expanduser("~"), ".config", "bagelunit-reels")
DEFAULT_HOST = {"outfit": "a plain hoodie in one solid colour", "bg": "solid bright green (#00B140), like a green screen",
                "tool": "", "logo": "", "ink": "", "poses": {}}
MODELS = {"openai": "gpt-image-1", "gemini": "gemini-2.5-flash-image"}   # change with --model when newer ones are out


def die(msg):
    print(f"host: {msg}", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------- the host's files
def host_dir(root="."):
    return os.path.join(root, "brand", "host")


def load_host(root="."):
    p = os.path.join(host_dir(root), "host.json")
    data = dict(DEFAULT_HOST)
    if os.path.exists(p):
        data.update(json.load(open(p, encoding="utf-8")))
    return data


def save_host(data, root="."):
    os.makedirs(host_dir(root), exist_ok=True)
    with open(os.path.join(host_dir(root), "host.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def catalogue(host):
    """Every pose this brand can make: the starter 10, the extras, then its own new ones."""
    poses = {p["name"]: {**p, "group": "starter"} for p in PACK["starter"]}
    for p in PACK["extra"]:
        poses.setdefault(p["name"], {**p, "group": "extra"})
    for name, p in host.get("poses", {}).items():
        if "pose" in p:
            poses[name] = {"name": name, "group": poses.get(name, {}).get("group", "custom"), **p}
    return poses


def prompt_for(name, host, base=False):
    style = PACK["style"].replace("{OUTFIT}", host["outfit"]).replace("{BG}", host["bg"])
    if base:
        return PACK["base"]["prompt"].replace("{STYLE}", style)
    poses = catalogue(host)
    if name not in poses:
        die(f'no pose called "{name}". Add it first: host.py add {name} --pose "..." --use "..."')
    return (f"Use the attached reference image of this character: keep the same face, hair, outfit, colours, line style, "
            f"sticker border and framing exactly, and change only the pose and expression. {style} "
            f"Pose: {poses[name]['pose']}.")


# ---------------------------------------------------------------- image steps
def _bg_mask(rgb, alpha):
    """True where the picture is plain background: already transparent, or the flat colour touching the edges."""
    if (alpha < 16).mean() > 0.05:                       # the tool already cut it out
        return alpha < 16
    h, w = rgb.shape[:2]
    patches = [rgb[:12, :12], rgb[:12, -12:], rgb[-12:, :12], rgb[-12:, -12:]]
    bg = np.median(np.concatenate([p.reshape(-1, 3) for p in patches]), axis=0)
    close = np.sqrt(((rgb.astype(np.float32) - bg) ** 2).sum(axis=2)) < 70
    # flood fill from every edge pixel through background-coloured pixels
    seen = np.zeros((h, w), bool)
    stack = [(y, x) for x in range(w) for y in (0, h - 1)] + [(y, x) for y in range(h) for x in (0, w - 1)]
    while stack:
        y, x = stack.pop()
        if y < 0 or y >= h or x < 0 or x >= w or seen[y, x] or not close[y, x]:
            continue
        seen[y, x] = True
        stack.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    # enclosed gaps (between an arm and the body) of the same flat colour, if big enough to be background
    rest = close & ~seen
    if rest.any():
        lab = np.zeros((h, w), np.int32)
        n = 0
        for y, x in zip(*np.nonzero(rest)):
            if lab[y, x]:
                continue
            n += 1
            region, stack = [], [(y, x)]
            while stack:
                cy, cx = stack.pop()
                if cy < 0 or cy >= h or cx < 0 or cx >= w or lab[cy, cx] or not rest[cy, cx]:
                    continue
                lab[cy, cx] = n
                region.append((cy, cx))
                stack.extend(((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)))
            if len(region) > 0.002 * h * w:
                ys, xs = zip(*region)
                seen[list(ys), list(xs)] = True
    return seen


def _despill(rgb, alpha):
    """Edge pixels that were blended with the background take the colour of the figure next to them."""
    solid = alpha >= 250
    fill = np.where(solid[..., None], rgb, 0).astype(np.uint8)
    spread = Image.fromarray(fill)
    for _ in range(3):
        spread = spread.filter(ImageFilter.MaxFilter(3))
    edge = (alpha > 0) & ~solid
    rgb = rgb.copy()
    rgb[edge] = np.asarray(spread)[edge]
    return rgb


def _has_border(rgba):
    """True when the outer ring of the figure is mostly white (the tool drew the sticker border)."""
    alpha = rgba[..., 3]
    inner = alpha > 128
    for _ in range(6):                                   # a ring about 12 px deep: the dark line plus the white band
        inner = np.asarray(Image.fromarray((inner * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5))) > 128
    ring = (alpha > 128) & ~inner
    if ring.sum() < 50:
        return False
    whiteish = rgba[..., :3].min(axis=2) > 215
    dark = rgba[..., :3].max(axis=2) < 70
    return (whiteish[ring] | dark[ring]).mean() > 0.5 and whiteish[ring].mean() > 0.25


def _add_border(img, width=12, line=3):
    alpha = img.getchannel("A")
    grow = alpha
    for _ in range(width // 2):
        grow = grow.filter(ImageFilter.MaxFilter(5))
    outer = grow
    for _ in range(max(1, line // 2)):
        outer = outer.filter(ImageFilter.MaxFilter(3))
    base = Image.new("RGBA", img.size, (20, 20, 20, 0))
    base.putalpha(outer)
    white = Image.new("RGBA", img.size, (255, 255, 255, 0))
    white.putalpha(grow)
    out = Image.alpha_composite(base, white)
    return Image.alpha_composite(out, img)


def _fit(img):
    """Keep the image tool's own framing (it draws every pose at the same scale): scale the whole picture to the
    canvas width, then set the bottom of the bust on the bottom edge. Only a pose too tall to fit is shrunk."""
    if not img.getchannel("A").getbbox():
        die("the image is empty after removing the background")
    scale = W / img.width
    img = img.resize((W, max(1, round(img.height * scale))), Image.LANCZOS)
    box = img.getchannel("A").getbbox()
    top, bottom = box[1], box[3]
    if bottom - top > H - 12:
        shrink = (H - 12) / (bottom - top)
        print("   note: this pose is taller than the canvas, so it is drawn a little smaller")
        img = img.resize((max(1, round(img.width * shrink)), max(1, round(img.height * shrink))), Image.LANCZOS)
        box = img.getchannel("A").getbbox()
        top, bottom = box[1], box[3]
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.paste(img, ((W - img.width) // 2, (H - 6) - bottom), img)
    return canvas


def process_one(src, dst, border="auto"):
    im = Image.open(src).convert("RGBA")
    rgba = np.asarray(im).copy()
    bg = _bg_mask(rgba[..., :3], rgba[..., 3])
    alpha = np.where(bg, 0, rgba[..., 3]).astype(np.uint8)
    alpha = np.asarray(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.6)))
    rgb = _despill(rgba[..., :3], alpha)
    rgb[alpha == 0] = 0                                  # nothing left behind in the see-through parts
    cut = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
    added = False
    if border == "add" or (border == "auto" and not _has_border(np.asarray(cut))):
        cut, added = _add_border(cut), True
    out = _fit(cut)
    os.makedirs(os.path.dirname(dst) or ".", exist_ok=True)
    out.save(dst)
    return added


def print_logo(src, dst, logo_path, ink=None, dx=0, dy=0, scale=1.0, rot=0.0):
    """Paint the real logo onto the chest: only on fabric (lines and hands stay on top), shaded by the fabric."""
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3]
    Hh, Ww = alpha.shape
    rows = np.nonzero(alpha.max(axis=1) > 200)[0]
    y1 = int(rows.max())
    band = rgb[int(y1 - 0.10 * Hh):y1, int(Ww * 0.30):int(Ww * 0.70)].reshape(-1, 3)
    band_a = alpha[int(y1 - 0.10 * Hh):y1, int(Ww * 0.30):int(Ww * 0.70)].reshape(-1)
    garment = np.median(band[band_a > 200], axis=0)
    dist = np.sqrt(((rgb - garment) ** 2).sum(axis=2))
    body = (dist < 60) & (alpha > 200)
    fabric = (dist < 35) & (alpha > 200)
    y0 = next((y for y in range(int(Hh * 0.45), Hh) if body[y].sum() > 0.45 * Ww), int(Hh * 0.72))
    yc = int(y0 + 0.5 * (y1 - y0)) + dy
    cols = np.nonzero(body[min(yc, Hh - 1)])[0]
    xc = int((cols.min() + cols.max()) / 2) + dx if len(cols) else Ww // 2 + dx
    width = (cols.max() - cols.min()) if len(cols) else Ww * 0.6
    logo = Image.open(logo_path).convert("RGBA")
    lw = max(8, int(width * 0.52 * scale))
    logo = logo.resize((lw, max(1, int(logo.height * lw / logo.width))), Image.LANCZOS)
    if rot:
        logo = logo.rotate(rot, resample=Image.BICUBIC, expand=True)
    logo = logo.filter(ImageFilter.GaussianBlur(0.6))
    la = np.asarray(logo).astype(np.float32)
    if ink:
        ink_rgb = np.array([int(ink.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)], np.float32)
        colour = np.broadcast_to(ink_rgb, la[..., :3].shape)
    else:
        colour = la[..., :3] * 0.92                      # the logo's own colours, a touch deeper, like ink on cloth
    layer = np.zeros((Hh, Ww, 4), np.float32)
    x0, y0l = xc - logo.width // 2, yc - logo.height // 2
    xs, ys = max(0, x0), max(0, y0l)
    xe, ye = min(Ww, x0 + logo.width), min(Hh, y0l + logo.height)
    if xe <= xs or ye <= ys:
        die(f"{os.path.basename(src)}: the logo landed outside the picture; nudge it with <pose>=dx,dy")
    layer[ys:ye, xs:xe, :3] = colour[ys - y0l:ye - y0l, xs - x0:xe - x0]
    layer[ys:ye, xs:xe, 3] = la[ys - y0l:ye - y0l, xs - x0:xe - x0, 3]
    luma = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    ref = np.median(luma[fabric]) if fabric.any() else luma[alpha > 200].mean()
    shade = np.clip(luma / max(ref, 1), 0.45, 1.15)[..., None]
    m = np.asarray(Image.fromarray((fabric * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.5))) / 255.0
    k = (layer[..., 3] / 255.0) * m * 0.97
    out = rgb * (1 - k[..., None]) + layer[..., :3] * shade * k[..., None]
    Image.fromarray(np.dstack([out, alpha]).clip(0, 255).astype(np.uint8), "RGBA").save(dst)


def make_sheet(folder, dst, paper=(232, 228, 218)):
    files = sorted(f for f in os.listdir(folder) if f.endswith(".png"))
    if not files:
        die(f"no poses in {folder} yet")
    tw, th, pad, label = 224, 280, 16, 26
    cols = min(5, len(files))
    rows = -(-len(files) // cols)
    sheet = Image.new("RGB", (cols * (tw + pad) + pad, rows * (th + label + pad) + pad), paper)
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for i, f in enumerate(files):
        im = Image.open(os.path.join(folder, f)).convert("RGBA")
        im.thumbnail((tw, th), Image.LANCZOS)
        x = pad + (i % cols) * (tw + pad)
        y = pad + (i // cols) * (th + label + pad)
        sheet.paste(im, (x + (tw - im.width) // 2, y + th - im.height), im)
        draw.text((x + 4, y + th + 6), f[:-4], fill=(40, 40, 40), font=font)
    sheet.save(dst, quality=90)
    return len(files)


# ---------------------------------------------------------------- automatic generation (your own key)
def _key(name):
    p = os.path.join(CONFIG, f"{name}.key")
    if not os.path.exists(p):
        die(f"no key at {p}. Make one in your {name} account, save it alone on one line in that file yourself, then run this again.")
    return open(p, encoding="utf-8").read().strip()


def _refs(name, root, base):
    hd = host_dir(root)
    photo = next((os.path.join(hd, "photo", f) for f in sorted(os.listdir(os.path.join(hd, "photo")))
                  if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))), None) if os.path.isdir(os.path.join(hd, "photo")) else None
    if base:
        if not photo:
            die("put the reference photo in brand/host/photo/ first")
        return [photo]
    idle = os.path.join(hd, "raw", "idle.png")
    if not os.path.exists(idle):
        die("the base pose brand/host/raw/idle.png is missing: make and approve it first")
    return [idle]


def _post(url, body, headers):
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        die(f"the image service said {e.code}: {e.read().decode('utf-8', 'replace')[:400]}")


def generate(name, tool, root=".", model=None, dry=False):
    host = load_host(root)
    base = name == PACK["base"]["name"] and not os.path.exists(os.path.join(host_dir(root), "raw", "idle.png"))
    prompt = prompt_for(name, host, base=base)
    refs = _refs(name, root, base)
    model = model or MODELS[tool]
    dst = os.path.join(host_dir(root), "raw", f"{name}.png")
    if dry:
        print(json.dumps({"tool": tool, "model": model, "pose": name, "base": base, "references": refs, "out": dst, "prompt": prompt}, indent=2))
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if tool == "openai":
        key, bound = _key("openai"), uuid.uuid4().hex
        parts = []
        for k, v in (("model", model), ("prompt", prompt), ("size", "1024x1536"), ("n", "1")):
            parts.append(f'--{bound}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        for r in refs:
            mime = "image/png" if r.lower().endswith(".png") else "image/jpeg"
            parts.append(f'--{bound}\r\nContent-Disposition: form-data; name="image[]"; filename="{os.path.basename(r)}"\r\nContent-Type: {mime}\r\n\r\n'.encode()
                         + open(r, "rb").read() + b"\r\n")
        parts.append(f"--{bound}--\r\n".encode())
        res = _post("https://api.openai.com/v1/images/edits", b"".join(parts),
                    {"Authorization": f"Bearer {key}", "Content-Type": f"multipart/form-data; boundary={bound}"})
        data = base64.b64decode(res["data"][0]["b64_json"])
    elif tool == "gemini":
        key = _key("gemini")
        parts = [{"inline_data": {"mime_type": "image/png" if r.lower().endswith(".png") else "image/jpeg",
                                  "data": base64.b64encode(open(r, "rb").read()).decode()}} for r in refs]
        parts.append({"text": prompt})
        body = json.dumps({"contents": [{"parts": parts}], "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}}).encode()
        res = _post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", body,
                    {"x-goog-api-key": key, "Content-Type": "application/json"})
        found = [p for c in res.get("candidates", []) for p in c.get("content", {}).get("parts", [])
                 if (p.get("inlineData") or p.get("inline_data"))]
        if not found:
            die("Gemini returned no image (it may have declined the request). Try again, or use another tool.")
        data = base64.b64decode((found[0].get("inlineData") or found[0].get("inline_data"))["data"])
    else:
        die("--tool takes openai or gemini (ChatGPT, the Gemini app and Higgsfield are used by hand or through Claude)")
    open(dst, "wb").write(data)
    host["tool"] = f"{tool} ({model})"
    save_host(host, root)
    print(f"saved {dst} ({tool}, {model})")


# ---------------------------------------------------------------- commands
def cmd_status(root="."):
    host = load_host(root)
    poses_dir = os.path.join(host_dir(root), "poses")
    have = {f[:-4] for f in os.listdir(poses_dir) if f.endswith(".png")} if os.path.isdir(poses_dir) else set()
    cat = catalogue(host)
    print(f"sticker host in {host_dir(root)}  (outfit: {host['outfit']}; tool: {host['tool'] or 'not chosen yet'})")
    for group in ("starter", "extra", "custom"):
        names = [n for n, p in cat.items() if p["group"] == group]
        if names:
            print(f"  {group}: " + ", ".join(f"{n}{'' if n in have else ' (missing)'}" for n in names))
    other = sorted(have - set(cat))
    if other:
        print("  in the folder but not in the catalogue: " + ", ".join(other))
    missing = [n for n, p in cat.items() if p["group"] == "starter" and n not in have]
    print("  starter 10: " + ("complete" if not missing else f"{10 - len(missing)} of 10 done"))


def cmd_add(name, pose, use, root="."):
    if not name or not name.replace("-", "").isalnum() or name.lower() != name:
        die("a pose name is lowercase letters and numbers, words joined by dashes (for example point-down)")
    if not pose or not use:
        die('give both --pose "what the body, hands and face do" and --use "when a reel uses it"')
    host = load_host(root)
    host.setdefault("poses", {})[name] = {"pose": pose, "use": use, "added": date.today().isoformat()}
    save_host(host, root)
    print(f"added pose {name}. Next: make brand/host/raw/{name}.png from its prompt (host.py prompt {name}), then host.py process {name}")


def selftest():
    tmp = tempfile.mkdtemp()
    raw, done = os.path.join(tmp, "raw"), os.path.join(tmp, "poses")
    os.makedirs(raw)
    # a drawn figure: dark hoodie and a head with a white sticker border and a dark line, on green
    im = Image.new("RGB", (1024, 1536), (0, 177, 64))
    d = ImageDraw.Draw(im)
    d.ellipse((330, 240, 694, 640), fill=(20, 20, 20)); d.rectangle((150, 820, 874, 1536), fill=(20, 20, 20))
    d.ellipse((334, 244, 690, 636), fill=(255, 255, 255)); d.rectangle((154, 824, 870, 1536), fill=(255, 255, 255))
    d.ellipse((360, 270, 664, 610), fill=(200, 140, 90)); d.rectangle((180, 850, 844, 1536), fill=(30, 30, 34))
    d.rectangle((440, 600, 584, 860), fill=(200, 140, 90))
    im.save(os.path.join(raw, "idle.png"))
    # the same figure without a border, on grey
    im2 = Image.new("RGB", (1024, 1536), (230, 230, 230))
    d2 = ImageDraw.Draw(im2)
    d2.ellipse((360, 270, 664, 610), fill=(200, 140, 90)); d2.rectangle((180, 850, 844, 1536), fill=(30, 30, 34))
    d2.rectangle((440, 600, 584, 860), fill=(200, 140, 90))
    im2.save(os.path.join(raw, "plain.png"))
    assert not process_one(os.path.join(raw, "idle.png"), os.path.join(done, "idle.png")), "kept the drawn border"
    assert process_one(os.path.join(raw, "plain.png"), os.path.join(done, "plain.png")), "added a border where none was"
    for f in ("idle.png", "plain.png"):
        out = np.asarray(Image.open(os.path.join(done, f)))
        assert out.shape == (H, W, 4), f"{f}: canvas {out.shape}"
        assert out[0, 0, 3] == 0 and out[5, W - 5, 3] == 0, f"{f}: background not removed"
        assert out[H - 8, W // 2, 3] > 200 and out[H - 3, W // 2, 3] == 0, f"{f}: bust not on the bottom line"
        assert ((out[..., 1].astype(int) > out[..., 0].astype(int) + 60) & (out[..., 3] > 20)).sum() < 20, f"{f}: green left on the edges"
    logo = Image.new("RGBA", (400, 100), (0, 0, 0, 0))
    ImageDraw.Draw(logo).rectangle((10, 10, 390, 90), fill=(146, 84, 236, 255))
    logo.save(os.path.join(tmp, "logo.png"))
    print_logo(os.path.join(done, "idle.png"), os.path.join(tmp, "idle-logo.png"), os.path.join(tmp, "logo.png"))
    lo = np.asarray(Image.open(os.path.join(tmp, "idle-logo.png")).convert("RGBA")).astype(int)
    assert ((lo[..., 2] - lo[..., 1]) > 60).sum() > 500, "logo not printed on the chest"
    assert make_sheet(done, os.path.join(tmp, "sheet.jpg")) == 2
    host = dict(DEFAULT_HOST, outfit="a plain black hoodie")
    p = prompt_for("point", host)
    assert "plain black hoodie" in p and "pointing" in p and "{" not in p, "prompt not filled"
    assert "{" not in prompt_for("idle", host, base=True)
    print("host.py selftest: OK (background, border kept and added, canvas, green edges, logo, sheet, prompts)")


def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help", "help"):
        print(__doc__)
        return
    cmd, rest = args[0], args[1:]
    opt = lambda k, d=None: rest[rest.index(k) + 1] if k in rest and rest.index(k) + 1 < len(rest) else d
    flags = {rest[i] for i in range(len(rest)) if rest[i].startswith("--")}
    plain = [a for i, a in enumerate(rest) if not a.startswith("--") and not (i and rest[i - 1] in ("--pose", "--use", "--logo", "--ink", "--tool", "--model"))]
    hd = host_dir()
    if cmd == "selftest":
        selftest()
    elif cmd == "status":
        cmd_status()
    elif cmd == "prompt":
        if not plain:
            die("which pose? e.g. host.py prompt point")
        print(prompt_for(plain[0], load_host(), base="--base" in flags))
    elif cmd == "add":
        cmd_add(plain[0] if plain else "", opt("--pose"), opt("--use"))
    elif cmd == "process":
        raw = os.path.join(hd, "raw")
        names = plain or sorted(f[:-4] for f in os.listdir(raw) if f.lower().endswith(".png")) if os.path.isdir(raw) else plain
        if not names:
            die("nothing to process: save the images as brand/host/raw/<pose>.png first")
        for n in names:
            src = os.path.join(raw, f"{n}.png")
            if not os.path.exists(src):
                die(f"missing {src}")
            added = process_one(src, os.path.join(hd, "poses", f"{n}.png"), "add" if "--border" in flags else "auto")
            print(f"  {n}: done{' (white border added)' if added else ''}")
        print(f"finished poses are in {os.path.join(hd, 'poses')}. Check them together: host.py sheet")
    elif cmd == "logo":
        logo = opt("--logo") or load_host().get("logo")
        if not logo or not os.path.exists(logo):
            die("give the logo file: host.py logo --logo <path to a PNG with a transparent background>")
        tweaks = {}
        for a in plain:
            if "=" in a:
                n, v = a.split("=", 1)
                p = (v.split(",") + ["0", "0", "1", "0"])[:4]
                tweaks[n] = (int(p[0] or 0), int(p[1] or 0), float(p[2] or 1), float(p[3] or 0))
        poses = os.path.join(hd, "poses")
        plain_dir = os.path.join(hd, "poses-plain")
        os.makedirs(plain_dir, exist_ok=True)
        for f in sorted(os.listdir(poses)):
            if not f.endswith(".png"):
                continue
            n, src = f[:-4], os.path.join(plain_dir, f)
            if not os.path.exists(src):
                os.replace(os.path.join(poses, f), src)       # keep the logo-free version to reprint from
            dx, dy, sc, rot = tweaks.get(n, (0, 0, 1.0, 0.0))
            print_logo(src, os.path.join(poses, f), logo, opt("--ink"), dx, dy, sc, rot)
            print(f"  {n}: logo printed")
        host = load_host()
        host["logo"] = logo
        if opt("--ink"):
            host["ink"] = opt("--ink")
        save_host(host)
        print("logo-free originals are kept in brand/host/poses-plain/. Check them together: host.py sheet")
    elif cmd == "sheet":
        n = make_sheet(os.path.join(hd, "poses"), os.path.join(hd, "sheet.jpg"))
        print(f"sheet with {n} poses: {os.path.join(hd, 'sheet.jpg')}")
    elif cmd == "generate":
        if not plain:
            die("which pose? e.g. host.py generate idle --tool openai")
        generate(plain[0], opt("--tool", ""), model=opt("--model"), dry="--dry-run" in flags)
    else:
        die(f"unknown command {cmd}. Run host.py --help")


if __name__ == "__main__":
    main()
