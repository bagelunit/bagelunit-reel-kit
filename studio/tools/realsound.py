#!/usr/bin/env python3
"""LOCAL ADD-ON (added 2026-11-05, see LOCAL-CHANGES.md)

Real-recording sound step for a reel, replacing the kit's synthesised effects:
  1. read build/sfx.json (the cue list the page writes on every render) and thin it (<= ~1 cue / 0.45 s,
     cuts / stamps / risers win over pops and ticks);
  2. SNAP each cue to the picture: read the rendered video, measure motion per frame, move each hit onto the frame where
     the motion starts (whooshes onto the motion peak) within a small window around the word cue;
  3. mix real CC0 recordings with opus-sound-layer (voice, optional music, ducking, room, -14 LUFS, true-peak limit);
  4. mux the mix into the video and LISTEN with earshot (realness + critique), report in build/realsound/report.txt.

Usage (run with earshot's Python, which has numpy/soundfile):
  ~/dev/sound/earshot/.venv/bin/python realsound.py <reel> [--video out/<name>.mp4|build/draft.mp4] [--out FILE.mp4]
        [--lufs -14] [--no-snap] [--no-listen]
Default video: the newest of out/*.mp4, build/final.mp4, build/draft.mp4. Default output: the same file with -real before .mp4.
"""
import argparse, glob, json, os, subprocess, sys
import numpy as np

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
}
SNAP_HIT = (-0.10, 0.35)    # search window around the word cue for a landing (s)
SNAP_MOVE = (-0.20, 0.35)   # for whooshes: the motion peak
MIN_GAP = 0.45              # s between kept cues (pro reels run ~1.25 hits/s; the kit used 0.75 and sounded too few events)


def sh(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


def pick_video(reel):
    c = [p for p in glob.glob(os.path.join(reel, "out", "*.mp4")) if "-real" not in p]
    c += [os.path.join(reel, "build", f) for f in ("final.mp4", "draft.mp4")]
    c = [p for p in c if os.path.exists(p)]
    if not c: sys.exit("no rendered video: run kit render first")
    return max(c, key=os.path.getmtime)


def motion(video):
    """per-frame motion, measured exactly like opus-sound-layer's qa.py (160x90 grey, mean abs change)"""
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
    n = len(m)
    for i in range(max(2, lo), min(n, hi)):
        pre = m[max(1, i - 15):max(2, i - 1)]
        if len(pre) == 0 or pre.max() < 0.5: continue
        thr = max(0.25, 0.05 * pre.max())
        if m[i] <= thr and m[i - 1] > thr: return i
    return None


def snap(cues, m, fps):
    """move each cue onto the picture using qa.py's own definitions; returns how many moved"""
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
    reel = os.path.abspath(a.reel)
    video = os.path.abspath(a.video) if a.video else pick_video(reel)
    out = a.out or video[:-4] + "-real.mp4"
    work = os.path.join(reel, "build", "realsound")
    os.makedirs(work, exist_ok=True)
    if not os.path.exists(os.path.join(KIT, "catalog.json")):
        sys.exit("opus-sound-layer library missing: run `uv run scripts/sfx.py kit` in " + OPUS)

    raw_cues = json.load(open(os.path.join(reel, "build", "sfx.json")))
    plan = []
    for c in raw_cues:
        name = c["name"]
        if name == "thud" and c.get("gain", 0) >= -2: name = "thud_hero"
        if name not in MAP: continue
        snd, w, al, vis, pri = MAP[name]
        plan.append({"t": float(c["t"]), "pri": pri, "name": name, "sound": snd, "weight": w, "align": al, "visual": vis})
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
    sh(["ffmpeg", "-v", "error", "-y", "-i", video, "-i", mix, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
        "-c:a", "aac", "-b:a", "256k", "-shortest", out])

    lines = [f"video: {video}", f"output: {out}", f"cues: {len(kept)} kept of {len(plan)}; {moved} snapped to the picture",
             r.stdout.strip().splitlines()[0] if r.stdout.strip() else ""]
    for c in kept:
        lines.append(f"  {c['t']:7.3f}s  {c['sound']:<10} {c['weight']:<8}" +
                     (f"  (word {c['t_word']:.3f}s, {1000 * (c['t'] - c['t_word']):+.0f} ms)" if "t_word" in c else ""))
    if not a.no_listen and os.path.exists(EARSHOT):
        rl = subprocess.run([EARSHOT, "realness", out], capture_output=True, text=True).stdout.strip().splitlines()
        cr = subprocess.run([EARSHOT, "critique", out], capture_output=True, text=True).stdout.splitlines()
        lines.append("earshot: " + (rl[-1] if rl else "no reading"))
        lines += ["  " + x.strip() for x in cr if any(k in x for k in ("onset +-1", "salient hit", "brightness", "L/R", "loudness"))]
    report = "\n".join(lines)
    open(os.path.join(work, "report.txt"), "w").write(report + "\n")
    print(report)


if __name__ == "__main__":
    main()
