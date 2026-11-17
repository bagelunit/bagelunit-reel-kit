# scripts/

Small tools for finishing and checking a reel. Claude runs them; nothing here posts, sends or spends anything on its own.
Python tools need Python 3. Shell tools need bash (Mac, Linux; on Windows use Git Bash or WSL). Needs ffmpeg for most.

## The reel QA gate (not optional)

| Tool | What it does | Called by, and when |
|---|---|---|
| `qa/gate_qa.py` | Runs the reel QA on the exact video and writes `build/qa-gate.json` | `/reel-review` and the owner's Gate B (draft) and Gate C (final) steps: `python3 scripts/qa/gate_qa.py <slug>` |
| `qa/gate_hook.py` | A hook in `.claude/settings.json` that refuses `kit gate <reel> record --gate C` until the QA record passed for the file on disk | Runs by itself before every shell command |
| `qa/cover_check.py` | The cover picture: 1080x1920, text inside the middle 1010x1350, the biggest line at least 80 px tall, not near-black or near-white. Uses `reel_qa.py`'s text reader | `/cover-thumbnail-brief`, after `kit cover`: `python3 scripts/qa/cover_check.py reels/<slug>/out/cover.jpg` |
| `abtest.py` | Which of two hook versions is ahead: the chance that A beats B (Beta-binomial, exact), a winner only at 95% and 300 views each, else "keep testing, need about N more" | `/ab-hook-tester record`: `python3 scripts/abtest.py --a <hits> <views> --b <hits> <views> [--lower-better]` |
| `qa/reel_qa.py` | The checks themselves: text size, text in the bottom 300 px or right 120 px, and the frame-0 hook | `gate_qa.py` |
| `qa/ocr.swift` | Reads text from pictures on a Mac (built the first time; needs the Xcode command line tools). On Windows or Linux install Tesseract | `reel_qa.py` |

## Optional finishing tools (run only when the reel needs them)

| Tool | What it does | When |
|---|---|---|
| `fx/grade.sh in.mp4 out.mp4 [mix]` | One warm look across Print, Blender and screen-capture clips (a licensed LUT in `reel.json` `look.lut` is applied by `kit export` and wins over `fx/look.cube`) | After the build, before `/reel-review`, when clips from different tools look unlike each other |
| `fx/music_bed.sh reel.mp4 music out.mp4` | Puts licensed music under the finished reel, ducked under the voice | After the real-sound step. Only music whose licence is on record (`brand/library/sfx/sfx_add.py`). For Uppbeat music, prefer `"music": [{"asset": ...}]` in `reel.json` (`/licensed-assets`), which `kit sound` ducks and records |
| `fx/upscale.sh in out [width]` | Cleans up and enlarges a low-resolution clip or still | When a supplied clip is soft |
| `fx/kinetic_captions.py reels/<slug> in.mp4 out.mp4` | Word-by-word pop captions from `build/words.json` | When the owner wants animated captions; keep them out of the bottom 300 px |
| `capture/page_capture.mjs <url> <out.mp4>` | A phone-sized screen recording of a public web page | `/blender-shot` (phone screens) or a screen-capture scene. Public pages only |
| `qa/board_add.py <video> --format <name> --source <url>` | Pulls reference frames into a board under `brand/research/boards/` | Studying a reel's pacing and layout (`/reel-analyzer`). Shape only, never reuse another creator's work |
| `qa/review_sheet.sh [--yes] <mp4>` | A contact sheet plus a second-opinion review. Spends one short Claude run and asks first | Optional extra look. `/reel-review` still writes the verdict |
| `brandcolors.py` | Reads the brand's colours from `brand/brand.json` for the other scripts | Imported by the tools above, not run on its own |

Sound effects: `brand/library/sfx/sfx_add.py` adds an effect with its licence on record. Blender and Manim shots: `brand/library/3d/README.md`.
