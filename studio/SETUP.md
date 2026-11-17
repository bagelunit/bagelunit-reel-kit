# Setup troubleshooting

This page explains each line of `node tools/checkup.mjs` and how to fix a ✗. To install the kit, run `bash setup/install.sh` (Windows: `node setup/install.mjs`) from the kit's repo. The repo's `SETUP.md` has the full steps, including the browser tool and the sound library.

The engine is installed once as the `bagelunit-reels` skill (`~/.claude/skills/bagelunit-reels`). Reels are made in a brand folder, which `/brand-setup` creates. In the commands below, run them from the engine folder (`cd ~/.claude/skills/bagelunit-reels`).

## Programs the kit calls

Node.js (version 22 or later), ffmpeg (it brings ffprobe along) and Python 3.

| System | Install |
|---|---|
| Mac (with Homebrew, https://brew.sh) | `brew install python ffmpeg node` |
| Windows | `winget install Python.Python.3.12 Gyan.FFmpeg OpenJS.NodeJS.LTS` (open a fresh terminal afterwards) |
| Linux (Debian/Ubuntu) | Node.js 22 or newer from https://nodejs.org (the `nodejs` package from apt is too old on most versions), then `sudo apt install python3 python3-pip ffmpeg` |

Then, in the engine folder, fetch the kit's own pieces:

```
npm install                    # three.js and the browser driver
npm run browser                # the headless Chromium used for rendering
python3 -m pip install numpy   # used by the sound mix
```

`npm run browser` fetches a separate headless Chromium (~100 MB) that only the renderer uses; your normal browser stays as it is.

## The voice

The voice comes from ElevenLabs; a free account covers a handful of reels each month.

1. Make an ElevenLabs account at https://elevenlabs.io and generate an API key that is allowed to use **Text to Speech** and **Voices**. "User: read" is optional; with it, the checkup can show your credits.
2. Put the key, alone on one line, in `~/.config/bagelunit-reels/elevenlabs.key` (Windows: `%USERPROFILE%\.config\bagelunit-reels\elevenlabs.key`). Make the folders if needed. Keys never go in the chat.
3. Ask Claude to **find you a voice**: it searches the library, plays you samples and saves the one you like.

Prefer your own voice? Hand Claude a recording. OpenAI voices are supported as well; just ask for them. `python3 tools/budget.py --left` shows the credits left.

## Talking-head edits (only if you want them)

Editing your own face takes needs a clock for every spoken word. Two ways:
- add **Speech to Text** to the same ElevenLabs key (a few credits per take), or
- run it on your computer for free: `python3 -m pip install faster-whisper`.

Shoot vertical (9:16) if you can; wider takes get cropped to fill the frame.

## Handle and colours

In a brand folder `/brand-setup` answers these. By hand: `node tools/checkup.mjs --set-brand @name --set-theme <studio|harbor|ochre|ink>`. Older theme names (clay, cobalt, forest, mono) still work. Any single reel can differ: "make this one harbor".

## Done when

`node tools/checkup.mjs` shows only ✓ (○ lines are optional). Then open Claude Code in your brand folder and type `/bagelunit-reels`.

## Common snags

- **headless browser ✗:** in the engine folder, run `npm run browser` once more.
- **ffmpeg not found although you just installed it:** the terminal was opened before the install; open a new one.
- **ElevenLabs 401:** wrong key or no credits left; create a new key.
- **The laptop gets loud:** normal for the length of a final render. Drafts are half size, and renders take turns.
