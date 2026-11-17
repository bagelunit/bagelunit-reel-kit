#!/usr/bin/env python3
"""LOCAL ADD-ON (added 2026-11-05, see LOCAL-CHANGES.md)

Real-recording sound step for a reel, replacing the kit's synthesised effects:
  1. read build/sfx.json (the cue list the page writes on every render; no file = no cues, voice and music only) and thin it
     (<= ~1 cue / 0.45 s, cuts / stamps / risers win over pops and ticks). A cue name the map below does not know is matched
     by keyword the way tools/sound.py does (impact, hit, slam ...); a name that still matches nothing is skipped and named
     in the output and the report, never dropped silently;
  2. SNAP each cue to the picture: read the rendered video, measure motion per frame, move each hit onto the frame where
     the motion starts (whooshes onto the motion peak) within a small window around the word cue;
  3. mix real CC0 recordings with opus-sound-layer (voice, optional music, ducking, room, -14 LUFS, true-peak limit);
  4. mux the mix into the video and LISTEN with earshot (realness + critique), report in build/realsound/report.txt.

Usage (run with earshot's Python, which has numpy/soundfile):
  ~/dev/sound/earshot/.venv/bin/python realsound.py <reel> [--video out/<name>.mp4|build/draft.mp4] [--out FILE.mp4]
        [--lufs -14] [--no-snap] [--no-listen]
Relative --video and --out paths are looked up in the reel folder first, so it works from any folder (then in the folder you ran it from).
Default video: the newest of out/*.mp4, build/video.mp4, build/final.mp4, build/draft.mp4 and build/pre-real/*.mp4. An out/ file
that this step made itself (its fingerprint is in build/realsound/last.json) is never mixed again: its kit-sound original is used.
The final is always out/<name>.mp4, the name kit export wrote and the gate, the review and the publisher expect:
  - video in out/ (the usual case): the mix is written beside it as a temporary file, then the kit-sound original moves to
    build/pre-real/<name>-kitsound.mp4 (kept, so the step can be redone) and the result takes its place as out/<name>.mp4;
  - video in build/pre-real/ (a redo): the result goes back to out/<name>.mp4;
  - video in build/ (draft.mp4, video.mp4, final.mp4): the result is written next to it with -real before .mp4;
  - --out FILE: exactly that file, and nothing is moved.
"""
import argparse, glob, hashlib, json, os, subprocess, sys

HOME = os.path.expanduser("~")
OPUS = os.path.join(HOME, "dev/sound/opus-sound-layer")
EARSHOT = os.path.join(HOME, "dev", "sound", "earshot", ".venv", "Scripts" if sys.platform == "win32" else "bin", "earshot.exe" if sys.platform == "win32" else "earshot")
KIT = os.path.join(OPUS, "audio/kit")

# kit cue name -> (opus sound, weight, align, what qa should see, priority)
MAP = {
    "whoosh": ("whoosh", "support", "peak", "move", 3),
    "swoosh": ("swish", "support", "peak", "move", 2),
    "stamp": ("hit+boom", "hero", "start", "land", 3),
    "boom": ("boom", "hero", "start", "cut", 3),
    "riser": ("riser", "support", "peak", None, 3),
    "shimmer": ("shimmer", "support", "start", None, 2),
    "thud_hero": ("thump+tap", "hero", "start", "land", 2),
    "thud": ("thump", "support", "start", "land", 1),
    "pop": ("pop", "support", "start", "land", 1),
    "click": ("click", "support", "start", None, 1),
    "tick": ("tick", "support", "start", None, 1),
    "type": ("key", "support", "start", None, 1),
    "cash": ("chime", "support", "start", None, 2),
    "impact": ("hit", "hero", "start", "land", 3),
}
SNAP_HIT = (-0.10, 0.35)    # search window around the word cue for a landing (s)
SNAP_MOVE = (-0.20, 0.35)   # for whooshes: the motion peak
MIN_GAP = 0.45              # s between kept cues (pro reels run ~1.25 hits/s; the kit used 0.75 and sounded too few events)


def sh(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


def in_reel(reel, path, must_exist=True):
    """A relative --video or --out is looked up in the reel folder first (out/name.mp4 means <reel>/out/name.mp4, from any
    folder you run this in), then in the folder you ran it from. An absolute path is used as it is."""
    if os.path.isabs(path): return path
    inside = os.path.join(reel, path)
    here = os.path.abspath(path)
    if must_exist: return inside if os.path.exists(inside) or not os.path.exists(here) else here
    return inside if os.path.isdir(os.path.dirname(inside)) or not os.path.isdir(os.path.dirname(here)) else here


KITSOUND = "-kitsound"       # build/pre-real/<name>-kitsound.mp4: the kit-sound original of out/<name>.mp4


def file_sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def last_run(reel):
    try:
        return json.load(open(os.path.join(reel, "build", "realsound", "last.json")))
    except (OSError, ValueError):
        return {}


def pick_video(reel):
    """The video to mix: the newest rendered file. An out/ file this step made itself is swapped for its kit-sound original in
    build/pre-real/, so a redo never mixes an already mixed file (and never overwrites the kept original with it)."""
    last, c = last_run(reel), []
    for p in glob.glob(os.path.join(reel, "out", "*.mp4")):
        if ".tmp." in os.path.basename(p) or p.endswith("-real.mp4"): continue
        src = last.get("source") and os.path.join(reel, last["source"])
        if last.get("final_sha256") and src and os.path.exists(src) and file_sha(p) == last["final_sha256"]:
            c.append((os.path.getmtime(p), src))                           # our own result: redo from its original
        else:
            c.append((os.path.getmtime(p), p))
    for f in ("video.mp4", "final.mp4", "draft.mp4"):
        p = os.path.join(reel, "build", f)
        if os.path.exists(p): c.append((os.path.getmtime(p), p))
    for p in glob.glob(os.path.join(reel, "build", "pre-real", "*.mp4")):
        if p not in [x[1] for x in c]: c.append((os.path.getmtime(p), p))
    if not c: sys.exit("no rendered video: run kit render first")
    return max(c)[1]


def plan_output(reel, video, out_arg):
    """(final, original_keep): where the result goes, and where the kit-sound original moves (None: nothing moves)."""
    out_dir = os.path.join(reel, "out")
    name = os.path.basename(video)
    if out_arg:
        return in_reel(reel, out_arg, must_exist=False), None
    if os.path.dirname(os.path.abspath(video)) == os.path.abspath(out_dir):
        stem = name[:-4]
        return video, os.path.join(reel, "build", "pre-real", stem + KITSOUND + ".mp4")
    if os.path.basename(os.path.dirname(os.path.abspath(video))) == "pre-real":     # a redo: the result goes back to out/
        stem = name[:-4]
        stem = stem[:-len(KITSOUND)] if stem.endswith(KITSOUND) else stem
        return os.path.join(out_dir, stem + ".mp4"), None
    return video[:-4] + "-real.mp4", None


def map_cues(raw_cues):
    """build/sfx.json cues -> (plan, skipped names). Known names first, then sound.py's keyword match (impact, hit, slam ...)."""
    try:
        from sound import ALIASES                    # one list of names: the kit's own sound step
    except Exception:
        ALIASES = []
    plan, skipped = [], []
    for c in raw_cues or []:
        name = str(c.get("name", ""))
        if name == "thud" and c.get("gain", 0) >= -2: name = "thud_hero"
        if name not in MAP:
            low = name.lower()
            alias = next((e for e, words in ALIASES if low == e or any(w in low for w in words.split())), None)
            if alias in MAP: name = alias
            else:
                skipped.append(name or "(no name)")
                continue
        snd, w, al, vis, pri = MAP[name]
        plan.append({"t": float(c["t"]), "pri": pri, "name": name, "sound": snd, "weight": w, "align": al, "visual": vis})
    return plan, skipped


def motion(video):
    """per-frame motion, measured exactly like opus-sound-layer's qa.py (160x90 grey, mean abs change)"""
    import numpy as np
    fps_s = sh(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate",
                "-of", "csv=p=0", video]).stdout.decode().strip().strip(",").splitlines()[0].strip(",")
    n, d = fps_s.split("/")
    fps = float(n) / float(d)
    raw = sh(["ffmpeg", "-v", "error", "-i", video, "-an", "-vf", f"fps={fps},scale=160:90,format=gray",
              "-f", "rawvideo", "-"]).stdout
    fr = np.frombuffer(raw, np.uint8).reshape(-1, 90, 160).astype(np.float32)
    m = np.zeros(len(fr)); m[1:] = np.mean(np.abs(np.diff(fr, axis=0)), axis=(1, 2))
    return m, fps


def _stop_frame(m, f, lo, hi):
    """qa.py's landing: motion falls below 5 % of the recent peak"""
    import numpy as np
    n = len(m)
    for i in range(max(2, lo), min(n, hi)):
        pre = m[max(1, i - 15):max(2, i - 1)]
        if len(pre) == 0 or pre.max() < 0.5: continue
        thr = max(0.25, 0.05 * pre.max())
        if m[i] <= thr and m[i - 1] > thr: return i
    return None


def snap(cues, m, fps):
    """move each cue onto the picture using qa.py's own definitions; returns how many moved"""
    import numpy as np
    moved, n = 0, len(m)
    for c in cues:
        if c["visual"] is None:
            continue                                  # risers, shimmers, keys, clicks: keep the word time
        f = int(round(c["t"] * fps))
        new = None
        if c["visual"] == "move":
            lo, hi = max(1, f - 6), min(n, f + 11)
            i = lo + int(np.argmax(m[lo:hi]))
            if m[i] > 0.5: new = i
        elif c["visual"] == "cut":
            lo, hi = max(1, f - 3), min(n, f + 8)
            i = lo + int(np.argmax(m[lo:hi]))
            base = np.median(m[max(1, i - 15):min(n, i + 15)]) + 1.0
            if m[i] > 4 * base and m[i] > 6.0: new = i
            else: c["visual"] = "appear"
        if c["visual"] == "land":
            i = _stop_frame(m, f, f - 3, f + 11)
            if i is not None: new = i
            else: c["visual"] = "appear"              # the kit's stage never fully stops: score the slam instead
        if c["visual"] == "appear" and new is None:
            lo, hi = max(1, f - 3), min(n, f + 9)
            i = lo + int(np.argmax(m[lo:hi]))
            base = np.median(m[max(1, i - 15):min(n, i + 15)])
            if m[i] >= 0.3 and m[i] >= 3 * (base + 0.1): new = i
            else: c["visual"] = None                  # nothing on screen to sync to: keep the word time, no check
        if new is not None:
            t_new = round(new / fps, 4)
            if abs(t_new - c["t"]) >= 0.5 / fps:
                c["t_word"], c["t"] = c["t"], t_new
                moved += 1
            else:
                c["t"] = t_new
    return moved


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("reel")
    ap.add_argument("--video")
    ap.add_argument("--out")
    ap.add_argument("--lufs", type=float, default=-14.0)
    ap.add_argument("--no-snap", action="store_true")
    ap.add_argument("--no-listen", action="store_true")
    ap.add_argument("--hits", choices=["louder", "softer"], default="louder",
                    help="louder (default, owner 2026-11-05): hits mixed as hero so they cut through the voice; softer: support weights")
    a = ap.parse_args()
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from kitcore import resolve_reel
    reel = str(resolve_reel(a.reel))                # a folder, reels/<slug> or the slug; dated folders too
    video = in_reel(reel, a.video) if a.video else pick_video(reel)
    if not os.path.exists(video): sys.exit(f"no video at {video}")
    out, keep = plan_output(reel, video, a.out)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    work = os.path.join(reel, "build", "realsound")
    os.makedirs(work, exist_ok=True)
    if not os.path.exists(os.path.join(KIT, "catalog.json")):
        sys.exit("opus-sound-layer library missing: run `uv run scripts/sfx.py kit` in " + OPUS)

    sfx = os.path.join(reel, "build", "sfx.json")
    try:
        raw_cues = json.load(open(sfx)) if os.path.exists(sfx) else []
    except ValueError:
        sys.exit(f"{sfx} is not valid JSON: render again (kit render) so the page writes it")
    if not os.path.exists(sfx): print("no build/sfx.json: no sound cues, so this mixes the voice (and music) only")
    plan, skipped = map_cues(raw_cues if isinstance(raw_cues, list) else [])
    if skipped: print(f"skipped {len(skipped)} cue(s) with a name this step does not know: {', '.join(sorted(set(skipped)))}")
    plan.sort(key=lambda c: c["t"])
    kept = []
    for c in plan:
        if kept and c["t"] - kept[-1]["t"] < MIN_GAP:
            if c["pri"] > kept[-1]["pri"]: kept[-1] = c
            continue
        kept.append(c)

    m, fps = motion(video)
    moved = 0 if a.no_snap else snap(kept, m, fps)
    dur = len(m) / fps
    kept = [c for c in kept if c["t"] <= dur - 0.25]   # every sound must fit inside the picture

    reel_json = json.load(open(os.path.join(reel, "reel.json")))
    sheet = {"fps": round(fps), "duration_s": round(dur, 3), "energy": "punchy", "lufs": a.lufs, "kit": KIT,
             "room": {"decay_s": 0.6, "wet_db": -16}, "duck_db": 10, "cues": []}
    vo = os.path.join(reel, "audio", "vo.mp3")
    if os.path.exists(vo): sheet["voice"] = [{"file": vo, "start_s": 0}]
    music = reel_json.get("music")
    if isinstance(music, list):   # licensed beds (kit licensed): the first one, as sound.py recorded it with its hash in build/music.json
        beds = []
        try: beds = json.load(open(os.path.join(reel, "build", "music.json")))
        except (OSError, ValueError): pass
        if not beds: sys.exit('reel.json "music" lists licensed beds, but there is no build/music.json: run  kit sound <reel>  first, so the beds are checked and recorded')
        d = os.path.abspath(reel)
        while d != os.path.dirname(d) and not os.path.isfile(os.path.join(d, "brand", "brand.json")): d = os.path.dirname(d)
        bp = os.path.join(d, beds[0]["file"])
        if not os.path.exists(bp): sys.exit(f"the licensed bed {beds[0]['asset']} is missing: {beds[0]['file']}")
        sheet["music"] = {"file": bp, "start_s": beds[0].get("from", 0), "loop": True, "fade_out_s": 1.0}
        if len(beds) > 1: print(f"note: only the first of {len(beds)} licensed beds goes into the real-sound mix")
        music = None
    if music:
        mp = music if os.path.isabs(music) else os.path.join(reel, music)
        if os.path.exists(mp): sheet["music"] = {"file": mp, "start_s": 0, "loop": True, "fade_out_s": 1.0}
    for i, c in enumerate(kept):
        w = "hero" if (a.hits == "louder" and c["sound"] not in ("riser", "shimmer")) else c["weight"]
        cue = {"id": f"c{i:02d}-{c['name']}", "t": c["t"], "sound": c["sound"], "weight": w, "align": c["align"]}
        if c["visual"]: cue["visual"] = c["visual"]
        sheet["cues"].append(cue)
    cues_path = os.path.join(work, "cues.json")
    json.dump(sheet, open(cues_path, "w"), indent=1)

    r = subprocess.run(["uv", "run", "--script", os.path.join(OPUS, "scripts", "mix.py"), "cues.json"],
                       cwd=work, capture_output=True, text=True)
    if r.returncode: sys.exit("mix.py failed:\n" + r.stdout[-2000:] + r.stderr[-2000:])
    mix = os.path.join(work, "audio", "mix.wav")
    # the mix goes to a temporary file first, so a failed step leaves out/ as it was (and the step never reads and writes one file)
    tmp = out[:-4] + ".tmp.mp4"
    sh(["ffmpeg", "-v", "error", "-y", "-i", video, "-i", mix, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
        "-c:a", "aac", "-b:a", "256k", "-shortest", tmp])
    moved_to = None
    if keep:                                            # one final in out/: the kit-sound original goes to build/pre-real/
        os.makedirs(os.path.dirname(keep), exist_ok=True)
        os.replace(video, keep)
        moved_to = keep
    os.replace(tmp, out)
    if os.path.dirname(os.path.abspath(out)) == os.path.abspath(os.path.join(reel, "out")):
        src = moved_to or video
        json.dump({"final": os.path.relpath(out, reel), "final_sha256": file_sha(out), "source": os.path.relpath(src, reel)},
                  open(os.path.join(work, "last.json"), "w"), indent=1)

    lines = [f"video: {video}", f"output: {out}", f"cues: {len(kept)} kept of {len(plan)}; {moved} snapped to the picture",
             f"skipped cue names (not mapped): {', '.join(sorted(set(skipped)))}" if skipped else "",
             r.stdout.strip().splitlines()[0] if r.stdout.strip() else ""]
    for c in kept:
        lines.append(f"  {c['t']:7.3f}s  {c['sound']:<10} {c['weight']:<8}" +
                     (f"  (word {c['t_word']:.3f}s, {1000 * (c['t'] - c['t_word']):+.0f} ms)" if "t_word" in c else ""))
    if not a.no_listen and os.path.exists(EARSHOT):
        rl = subprocess.run([EARSHOT, "realness", out], capture_output=True, text=True).stdout.strip().splitlines()
        cr = subprocess.run([EARSHOT, "critique", out], capture_output=True, text=True).stdout.splitlines()
        lines.append("earshot: " + (rl[-1] if rl else "no reading"))
        lines += ["  " + x.strip() for x in cr if any(k in x for k in ("onset +-1", "salient hit", "brightness", "L/R", "loudness"))]
    # the final keeps the name kit export gave it (out/<name>.mp4); the kit-sound original was moved above, before the result took
    # its place, and stays in build/pre-real/ for a redo. With --out nothing is moved (you chose the name).
    lines.append(f"final: {os.path.relpath(out, reel)}" + (f"; the kit-sound original is now {os.path.relpath(moved_to, reel)}" if moved_to else ""))
    lines = [l for l in lines if l]
    report = "\n".join(lines)
    open(os.path.join(work, "report.txt"), "w").write(report + "\n")
    print(report)


if __name__ == "__main__":
    main()
