#!/usr/bin/env python3
"""reel_fetch.py - turn a reel (URL or local file) into frames + transcript for a teardown.

  python3 reel_fetch.py <URL or video file> --out DIR [--fps 1]

A URL needs brand/brand.json -> autopilot.scrape = true (found by walking up from the current folder).
A local file needs nothing. Writes DIR/video.mp4, DIR/frames/f%04d.jpg, DIR/audio.wav, DIR/transcript.txt (with timestamps) and DIR/timeline.md
(each second: the frame and the words spoken then). Speech-to-text: whisper-cli if present, else faster-whisper.
Standard library only; calls yt-dlp, ffmpeg and whisper-cli if they are installed.
"""
import argparse, json, pathlib, re, shutil, subprocess, sys

HOME = pathlib.Path.home()
MODELS = [HOME / ".config/susanoo-reels/ggml-base.bin", HOME / ".cache/whisper-cpp/ggml-base.bin", HOME / ".cache/whisper-cpp/ggml-base.en.bin"]


def need(tool):
    if not shutil.which(tool):
        sys.exit(f"{tool} is not installed. Run the kit's setup/install.sh, or install it with Homebrew.")


def scrape_on():
    p = pathlib.Path.cwd()
    for d in [p, *p.parents]:
        f = d / "brand" / "brand.json"
        if f.exists():
            try:
                return (json.loads(f.read_text()).get("autopilot") or {}).get("scrape") is True
            except ValueError:
                return False
    return False


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"{cmd[0]} failed: {r.stderr.strip()[-400:]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--out", required=True)
    ap.add_argument("--fps", default="1")
    a = ap.parse_args()
    out = pathlib.Path(a.out).expanduser()
    is_url = a.src.startswith(("http://", "https://"))
    if is_url and not scrape_on():
        sys.exit("Stopped: fetching from a URL is off. The brand owner must set brand/brand.json -> autopilot.scrape to true, "
                 "or give a video file you already have.")
    out.mkdir(parents=True, exist_ok=True)
    video = out / "video.mp4"
    if is_url:
        need("yt-dlp")
        run(["yt-dlp", "-q", "--no-playlist", "-f", "mp4/best", "-o", str(video), a.src])
    else:
        src = pathlib.Path(a.src).expanduser()
        if not src.exists():
            sys.exit(f"No such file: {src}")
        shutil.copyfile(src, video)
    need("ffmpeg")
    (out / "frames").mkdir(exist_ok=True)
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-vf", f"fps={a.fps},scale=540:-2", "-q:v", "4", str(out / "frames" / "f%04d.jpg")])
    wav = out / "audio.wav"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-ar", "16000", "-ac", "1", str(wav)])
    model = next((m for m in MODELS if m.exists()), None)
    segs = None
    if shutil.which("whisper-cli") and model:
        r = subprocess.run(["whisper-cli", "-m", str(model), "-f", str(wav), "-ml", "30", "-sow"], capture_output=True, text=True)   # short phrases, so each second gets its own words
        segs = parse_whisper(r.stdout)
    if not segs:
        segs = faster_whisper_segments(wav)
    if segs is None:
        print(f"Done: {out}/video.mp4, frames/, audio.wav. No transcript: neither whisper-cli (with a model file in "
              f"{', '.join(str(m) for m in MODELS)}) nor faster-whisper (pip install faster-whisper) was found.")
        return
    (out / "transcript.txt").write_text("\n".join(f"[{stamp(s)} --> {stamp(e)}] {x}" for s, e, x in segs) + "\n")
    n = write_timeline(out, segs, float(a.fps))
    print(f"Done: {out}/video.mp4, frames/, audio.wav, transcript.txt (with timestamps), timeline.md ({n} seconds, frame + words each)")


def stamp(sec):
    return f"{int(sec // 60):02d}:{sec % 60:06.3f}"


def parse_whisper(text):
    """whisper-cli prints lines like [00:00:01.000 --> 00:00:03.500]   words. Returns [(start, end, words)]."""
    out = []
    for m in re.finditer(r"\[(\d+):(\d+):(\d+\.\d+)\s*-->\s*(\d+):(\d+):(\d+\.\d+)\]\s*(.*)", text):
        h1, m1, s1, h2, m2, s2, words = m.groups()
        out.append((int(h1) * 3600 + int(m1) * 60 + float(s1), int(h2) * 3600 + int(m2) * 60 + float(s2), words.strip()))
    return [s for s in out if s[2]]


def faster_whisper_segments(wav):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return None
    segs, _ = WhisperModel("base", device="cpu", compute_type="int8").transcribe(str(wav), word_timestamps=True)
    words = [(w.start, w.end, w.word.strip()) for s in segs for w in s.words if w.word.strip()]
    out, cur = [], []
    for w in words:                      # group words into short phrases of about 30 characters
        cur.append(w)
        if sum(len(x[2]) + 1 for x in cur) >= 30:
            out.append((cur[0][0], cur[-1][1], " ".join(x[2] for x in cur))); cur = []
    if cur:
        out.append((cur[0][0], cur[-1][1], " ".join(x[2] for x in cur)))
    return out


def write_timeline(out, segs, fps):
    """One block per frame: the time, the frame file, and the words spoken while it is on screen."""
    frames = sorted((out / "frames").glob("f*.jpg"))
    step = 1.0 / fps
    lines = ["# Timeline (what is shown and what is said, second by second)", ""]
    for i, f in enumerate(frames):
        t0, t1 = i * step, (i + 1) * step
        said = " ".join(x for s, e, x in segs if s < t1 and e > t0)
        lines.append(f"## {stamp(t0)}  frame: frames/{f.name}")
        lines.append(f"said: {said or '(nothing)'}")
        lines.append("")
    (out / "timeline.md").write_text("\n".join(lines))
    return len(frames)


if __name__ == "__main__":
    main()
