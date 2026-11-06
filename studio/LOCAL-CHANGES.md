# Local changes to the Susanoo Reel Kit engine (keep this list when the engine is updated)

1. 2026-11-05 · KIT.md section B: always ask the user which style (Print / 3D / Talking head) before a reel. Owner rule.
2. 2026-11-05 · Picture-sticker presenter for print reels (a brand's own pose set, 19 poses):
   - NEW `modes/print/runtime/stickerhost.js` (whole file is ours).
   - `modes/print/runtime/load.js`: loads stickerhost.js after presenter.js.
   - `modes/print/runtime/engine.js`: `applyReelSettings()` calls `STICKER_HOST.setup(REEL)`; `guy()` draws the sticker
     instead of the code bust when reel.json "presenter".type is "stickers".
   - The installed copy keeps the originals as `*.orig-2026-11-05` next to each file; the repo does not ship them (diff against the original kit instead).
   - Use: reel.json "presenter": {"type": "stickers", "dir": "host", "cues": [[word, pose, nth]]}; the reel's `host/` folder
     holds the pose PNGs (each brand keeps its own set outside the repo; see docs/avatar.md).
   - Defaults: height 600, lift 120 (owner 2026-11-05: the chest logo must always be visible inside the frame). Poses include `raise` (finger up, the old idle).
3. 2026-11-05 · Real-recording sound step (owner: kit's synthesised effects sound fake; A/B: real 0.64 vs synth 0.05 realness):
   - NEW `tools/realsound.py` (ours): thins build/sfx.json, snaps cues to the picture with opus-sound-layer qa.py's own
     motion definitions (move = peak, cut = hard change, land = motion stops, else appear = the slam frame), mixes with
     opus-sound-layer mix.py (~/dev/sound/opus-sound-layer, library in audio/kit), muxes, listens with earshot.
   - `KIT.md` section G step 5: run it after `kit export`.
   - Needs ~/dev/sound/opus-sound-layer (library built) and ~/dev/sound/earshot (.venv). Run with earshot's Python.
   - realsound.py --hits louder|softer (default louder: hits mixed as hero; owner 2026-11-05).
4. 2026-11-05 · Susanoo Reel Kit repo: this folder ships as `studio/` in the repo and is installed to `~/.claude/skills/susanoo-reels`
   by `setup/install.sh`. `CHANGELOG.md` is the engine's changelog up to v1.4.1.
5. 2026-11-05 · Rebrand to Susanoo Reel Kit, with the creator's written permission: product name, skill name
   `susanoo-reels`, install path `~/.claude/skills/susanoo-reels`, settings folder `~/.config/susanoo-reels/` (tools fall back to the pre-rebrand folder until `setup/install.sh` copies it over),
   page titles, file headers, the render lock file name and the example handles. Behaviour unchanged.
6. 2026-11-06 · Cross-platform: `tools/voicebank.py` plays the voice preview on Windows (default player) and Linux (ffplay, mpv, paplay or aplay) as well as Mac (afplay); `tools/realsound.py` finds earshot at `.venv/Scripts/earshot.exe` on Windows. Behaviour on Mac unchanged.
7. 2026-11-06 · NEW `tools/budget.py` (ours): counts a script's characters and compares them with the ElevenLabs credits left (a free read of your own subscription; the key is never printed). Run before Gate A.
