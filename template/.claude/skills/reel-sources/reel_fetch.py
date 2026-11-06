#!/usr/bin/env python3
"""reel_fetch.py - turn a reel (URL or local file) into frames + transcript for a teardown.

  python3 reel_fetch.py <URL or video file> --out DIR [--fps 1]

A URL needs brand/brand.json -> autopilot.scrape = true (found by walking up from the current folder).
A local file needs nothing. Writes DIR/video.mp4, DIR/frames/f%04d.jpg, DIR/audio.wav, DIR/transcript.txt.
Standard library only; calls yt-dlp, ffmpeg and whisper-cli if they are installed.
"""
import argparse, json, pathlib, shutil, subprocess, sys

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
    if shutil.which("whisper-cli") and model:
        run(["whisper-cli", "-m", str(model), "-f", str(wav), "-otxt", "-of", str(out / "transcript"), "-nt"])
        print(f"Done: {out}/video.mp4, frames/, audio.wav, transcript.txt")
    else:
        print(f"Done: {out}/video.mp4, frames/, audio.wav. No transcript: whisper-cli or its model file was not found "
              f"(looked in {', '.join(str(m) for m in MODELS)}).")


if __name__ == "__main__":
    main()
