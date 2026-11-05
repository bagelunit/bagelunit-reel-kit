# Sound: the real-sound step

The engine writes its sound cues on every render (`build/sfx.json`) and, at export, mixes synthesised effects for them. Those effects can sound like code. The real-sound step replaces them with real recordings, placed on the frames where the motion actually happens. In a side-by-side test, earshot rated the synthesised mix as clearly code-made and the real-recording mix as a real recording.

It uses two open-source tools installed by the setup script into `~/dev/sound/` (not part of this repo):

| Tool | Licence | What it does here |
|---|---|---|
| [opus-sound-layer](https://github.com/Bodila51/opus-sound-layer) | MIT | a library of about 1,100 CC0 recordings (Kenney + Freesound) in 19 types, the mixer (`mix.py`) and the sound checks (`qa.py`) |
| [earshot](https://github.com/Leonxlnx/earshot) | MIT | lets Claude "listen": realness, critique, timelines, A/B |

## Run it

After `kit export <reel>`:

```bash
~/dev/sound/earshot/.venv/bin/python ~/.claude/skills/susanoo-reels/tools/realsound.py <reel> \
  --video out/<name>.mp4 --out out/<name>-real.mp4
```

Use earshot's Python: it has numpy and soundfile. Options:

- `--hits louder` (default) mixes hits as the hero so they cut through the voice; `--hits softer` sits them under it.
- `--lufs -14` loudness target (Instagram).
- `--no-snap` keeps the word cues as they are; `--no-listen` skips earshot.
- With no `--video`, it picks the newest of `out/*.mp4`, `build/final.mp4`, `build/draft.mp4`. You can run it on the draft for the phone review.

## What it does

1. **Thin the cues:** reads `build/sfx.json` and keeps at most about one cue every 0.45 s; cuts, stamps and risers win over pops and ticks.
2. **Snap to the picture:** measures motion frame by frame in the rendered video and moves each hit onto the frame that matches it, using opus-sound-layer's own definitions: a whoosh lands on the motion peak, a cut on the hard frame change, a stamp or landing where the motion stops, anything else on the frame where the element slams in.
3. **Mix:** opus-sound-layer's `mix.py` puts real recordings under the voice (optional music ducked under it), adds a little room, and masters to -14 LUFS with a true-peak limit.
4. **Mux and listen:** writes the new mp4, then runs `earshot realness` and `earshot critique` on it.

Results go to `build/realsound/report.txt`: every picture check, the loudness, and earshot's numbers. Report them honestly; a person listens on a phone and decides.

## Checking by hand

- **opus qa:** the mix lives in `<reel>/build/realsound/` (`cues.json`, `audio/`). From that folder, `uv run --script ~/dev/sound/opus-sound-layer/scripts/qa.py <reel>/out/<name>-real.mp4 --audio audio` checks that each cue matches the picture (cut, move, land), the loudness, sync, that each sound is audible over the voice, that music stays under the voice, and that there is no dead silence. Hero cues fail, support cues warn.
- **earshot:** `~/dev/sound/earshot/.venv/bin/earshot realness out/<name>.mp4`, `earshot critique out/<name>.mp4`, `earshot timeline out/<name>.mp4`. The `earshot` and `real-sound` skills (installed into `~/.claude/skills`) teach Claude how to use them; the optional MCP server lets Claude call them as tools.

## Known limits

- Low whooshes and thumps can hide under a deep voice. The checks flag them; try `--hits louder` or a brighter sound.
- The Kenney packs must be downloaded in a browser (see SETUP.md). Without them the library is smaller and some sound types are thin.
- earshot's first use downloads about 1.1 GB of open models; after that it works offline.
