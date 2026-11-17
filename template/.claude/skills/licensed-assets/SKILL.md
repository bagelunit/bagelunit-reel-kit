---
name: licensed-assets
description: >
  Record and use licensed material (music, sound effects, stock video, motion graphics, LUTs; Uppbeat is the one we suggest, any source works) in this brand's reels.
  Use when the user says they downloaded something from Uppbeat, asks for a music bed, a stock-video cutaway, a light leak or a
  colour look, or before Gate C of a reel that uses licensed material. The kit ships no assets; this records each download and checks it.
user-invokable: true
argument-hint: "[add <file> | list | check <reel> | use <reel> <id>]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: brand
---

# Licensed assets: record every download, use it by id, never commit it

Inputs: a file the owner downloaded by hand (from Uppbeat, which we suggest and which has no API, or from any other source they have rights to), or a reel that should use one. Outputs: an entry in `brand/licensed/assets.json`, the file in `brand/licensed/<type>/`, and a line in `reel.json` or `scenes.json`. Next step: `kit licensed check <reel>`, then `/reel-review`.

Any licensed source is fine; Uppbeat is what we use and suggest. Record where each file came from (`--source`, `--plan`, `--url`) so its licence can be shown later. Never download for the owner, and never commit the media (the brand's `.gitignore` keeps it out; `assets.json` stays tracked). `brand/licensed/README.md` explains the download by hand.

The tool is the engine's `kit licensed` (`node ~/.claude/skills/bagelunit-reels/tools/kit.mjs licensed ...`).

## When the owner has downloaded something

1. Ask where the file is and which type it is: `music`, `sfx`, `stock-video`, `motion-graphic` or `lut`. For music, remind them to set the download type to **WAV** in Uppbeat (an MP3 works but is lossier).
2. Ask for the title, the artist (music), the Uppbeat page link, the channels it is cleared for, and the credit line Uppbeat asks for (if any). Do not guess any of these.
3. Record it: `kit licensed add <file> --type <type> --title "..." [--artist ...] [--url ...] [--channels a,b] [--credit "..."] [--notes ...]`. It copies the file (add `--move` to move it), stores the SHA-256 and refuses a missing file, a duplicate id, a path with `..` or slashes in the id, and a `.cube` that is not a complete LUT.
4. **YouTube Shorts only:** the channel must also be safelisted in Uppbeat (Account > Safelist) or YouTube may flag the music. Instagram and TikTok are covered by the licence; still record the asset and its channels.
5. `kit licensed list [--type T]` shows what is recorded. `kit licensed remove <id>` takes an entry out (and deletes its file unless `--keep-file`).

## What each type does in a reel

- **lut** (a `.cube` file): `reel.json` `"look": {"lut": "<id>", "strength": 1}` (strength 0 to 1, default 1). It is applied to the whole picture when the reel is exported (`kit export`). A reel-level LUT wins over the brand's `scripts/fx/look.cube` slot, and the export says so.
- **music**: `reel.json` `"music": [{"asset": "<id>", "from": 0, "fade": 1.5, "gain_db": -18}]`. The bed loops to the end, fades in and out, and is ducked under the voice (`kit sound` / `kit export`). It is recorded in `build/music.json` with its hash. A plain text path in `"music"` still works for a track that is not licensed material, but then the rights rule (house rule 9) applies by hand.
- **stock-video** (scene-style reels): a scene `{"clip": {"asset": "<id>", "start": 2, "duration": 5, "mute": true}, "narration": "..."}` is a cutaway. It is scaled and cropped to fill 1080x1920, timed from the narration like any scene, and muted unless `"mute": false`.
- **motion-graphic**: any scene may add `"overlay": {"asset": "<id>", "blend": "normal|screen", "opacity": 0-1, "at": 0, "duration": 3}`. `.mov` and `.webm` keep their alpha; use `screen` for a light leak on a black background. An overlay is picture only: it is not text and does not count for the safe zone.
- **sfx**: recorded like the rest and kept for the real-sound step; the kit's own sound cues do not use it automatically.

## Before Gate C

Run `kit licensed check <reel>`. It prints PASS or FAIL per asset (recorded, file present, inside `brand/licensed/`, hash unchanged) and exits 1 on any FAIL. `kit gate <reel> record --gate C` runs the same check and refuses a failing reel (no override: fix the registry or take the asset out), then writes each asset's title, artist, source, plan and credit into `approvals.md`.

The caption: `/caption-and-hashtags` adds a music credit line only when the asset's `credit` field is set and the platform needs it.
