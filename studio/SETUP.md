# Setup

One time per computer, roughly ten minutes, no coding. Open the kit folder in your AI and type **"set up the reel kit"**: it runs the checkup, explains every ✗ in plain words and fixes it with you. This page is the same path written down, in case you'd like to do it by hand.

## Where the kit runs

| AI | How to open the kit |
|---|---|
| Claude Code | start `claude` from a terminal opened in `susanoo-reel-kit` (or pick that folder in the desktop app's Code tab) |
| Codex | start `codex` from the same folder |
| Cursor | open the folder as a project and work in Agent mode |

`CLAUDE.md` and `AGENTS.md` in the folder send the AI to `studio/KIT.md`. Finished reels go to `reels/`.
Prefer one global install? Copy just `studio/` into your skills folder as `susanoo-reels` (`~/.claude/skills/susanoo-reels` or `~/.codex/skills/susanoo-reels`); reels are then made in a `reels/` folder of whatever project you're in.

## Programs the kit calls

Three programs: Node.js (version 18 or later), ffmpeg (it brings ffprobe along) and Python 3.

| System | One line installs all three |
|---|---|
| Mac (with Homebrew, https://brew.sh) | `brew install python ffmpeg node` |
| Windows | `winget install Python.Python.3.12 Gyan.FFmpeg OpenJS.NodeJS.LTS` (open a fresh terminal afterwards) |
| Linux (Debian/Ubuntu) | `sudo apt install python3 python3-pip ffmpeg nodejs npm` |

Then, from `studio/`, fetch the kit's own pieces:

```
npm install                    # three.js and the browser driver
npm run browser                # the headless Chromium used for rendering
python3 -m pip install numpy   # used by the sound mix
```

`npm run browser` fetches a separate headless Chromium (~100 MB) that only the renderer uses; your normal browser stays as it is.

## The voice

The voice comes from ElevenLabs; a free account covers a handful of reels each month.

1. Make an ElevenLabs account at https://elevenlabs.io and generate an API key that is allowed to use **Text to Speech** and **Voices**. "User: read" is optional; with it, the checkup can show your credits.
2. Put the key, alone on one line, in `~/.config/susanoo-reels/elevenlabs.key` (Windows: `%USERPROFILE%\.config\susanoo-reels\elevenlabs.key`). Make the folders if needed. Keys never go in the chat.
3. Ask Claude to **find you a voice**: it searches the library, plays you samples and saves the one you like.

Prefer your own voice? Hand Claude a recording. OpenAI voices are supported as well; just ask for them.

## Talking-head edits (only if you want them)

Editing your own face takes needs a clock for every spoken word. Two ways:
- add **Speech to Text** to the same ElevenLabs key (a few credits per take), or
- run it on your computer for free: `python3 -m pip install faster-whisper`.

Shoot vertical (9:16) if you can; wider takes get cropped to fill the frame.

## Handle and colours

During setup you're asked for both; they're stored in `~/.config/susanoo-reels/config.json` and every new reel starts with them.
- **Handle**, e.g. `@yourname`, small in the top bar.
- **Theme:** `studio` (warm white + vermilion, the house look), `harbor` (deep blue), `ochre` (warm gold), `ink` (black and white), or any accent colour. Older names (clay, cobalt, forest, mono) still work.

Any single reel can differ: "make this one harbor".

## Done when

`node tools/checkup.mjs` shows only ✓ (○ lines are optional). Then ask for something, for example: **"A reel on why hotels put mints on the pillow."**

## Common snags

- **headless browser ✗:** in `studio/`, run `npm run browser` once more.
- **ffmpeg not found although you just installed it:** the terminal was opened before the install; open a new one.
- **ElevenLabs 401:** wrong key or no credits left; create a new key.
- **The laptop gets loud:** normal for the length of a final render. Drafts are half size, and renders take turns.
