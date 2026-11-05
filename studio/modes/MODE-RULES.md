# Mode rules

A mode is one look the kit can produce. This page is the agreement between a mode and the rest of the kit: the tools in `tools/` know nothing about any particular mode and only rely on what is written here. Read it before you add a mode or change one.

## The modes in this kit

| Mode | Drawn with | Frames taken from | The look |
|---|---|---|---|
| `print` | Canvas 2D (two layers: ink + a WebGL print compositor) | the canvas | a riso print on warm stock: engraved line shading, one accent ink, paper-white cards with hard shadows, big condensed caps captions with a marker underline on the key word, a sticker presenter in the corner who points at the focus and acts every phrase, blind wipes (`modes/print/GUIDE.md`) |
| `depth` | three.js (WebGL) | the screen | warm plaster rooms, Bix the boxy host, machines and glowing dashboards, taped titles and big caption tiles, a film finish (`modes/depth/GUIDE.md`) |
| `talking` | HTML over the user's own video frames | the screen | the user's face take, edited (`modes/talking/GUIDE.md`) |

Palette, type, captions and finish belong to each mode's guide. Theme and brand handle come from `reel.json` and every mode honours them.

## Inside a mode folder

```
modes/<mode>/
  GUIDE.md   the guide to read before any shot is written: the look, its tokens, the shot API, recipes and the review list
  runtime/   the engine (boot, clock, camera, captions, finish), served as /mode/runtime/…; a reel never edits it
  parts/     building blocks: sets, props, characters, effects, served as /mode/parts/… (optional)
  starter/   what `kit start` copies into a new reel: index.html, reel.json, script.txt and two or three example shots
  examples/  worked shots to borrow techniques from, listed in SHOTS.md (optional; the talking mode has none)
  tools/     helpers that only this mode needs (optional)
```

A mode is self-contained: everything about it, from its guide to its examples, lives in its own folder. The general craft that applies to every mode sits in `playbook/`.

As soon as `modes/<mode>/starter/` exists, `kit start` offers the mode.

## Serving

`tools/server.mjs` serves a reel over local http and maps four kinds of path:

| Path | Comes from |
|---|---|
| `/mode/…` | `modes/<style>/`, the reel's own mode |
| `/fonts/…` | `fonts/` (pages include `/fonts/fonts.css`) |
| `/studio/…` | the studio folder |
| anything else | the reel's folder |

## The page handshake

A mode's page fills one object, `window.studio`, and `tools/session.mjs` reads it:

| Field | What it holds |
|---|---|
| `ready` | a Promise that settles when fonts, images, word times and every shot have loaded; nothing else is read before it |
| `length` | the reel's length in seconds (usually the last word's end plus a short tail) |
| `show(t)` | draws second `t` of the reel. It depends on `t` alone (no wall clock, no unseeded randomness), so frames can be drawn in any order. It may return a Promise. |
| `grab` | `'canvas'` when the frame is `<canvas id="c">` at 1080×1920, `'screen'` when the whole page must be captured (WebGL, HTML layers) |
| `cues` | optional sound cues `[{t, name, gain}]`; `tools/sound.py` synthesises them, so no mode carries audio files. Names: whoosh, swoosh, pop, click, tick, thud, boom, shimmer, riser, type, cash, stamp. |
| `quiet` | optional regions the motion check leaves out (the talking mode uses it for the face) |

Every page understands three query switches: `?t=3.5` for a single frame, `?play` for real-time playback with `audio/vo.mp3` (click to start) and `?only=<shotId>` to draw one shot by itself.

## What a reel folder always has

- `build/words.json`, `[{"w","s","e"}]`: each spoken word with its start and end on the finished audio, written by `tools/voice.py` or `tools/take.py`. Pages load it when they boot.
- `audio/vo.mp3`, `script.txt` and `reel.json` (`{style, name, voice?, theme?, brand?, cta: {keyword}, host?, …}`).
- Shots start on words, never on typed seconds. Each mode's API has a word lookup with a fallback; its guide shows it.

## Every mode, without exception

- **Fonts** come only from `/fonts/`, and they are all open-licensed. Every font stack names `"Fallback"` (the non-Latin font fetched when needed) before its generic family.
- **Nothing from outside the kit:** no absolute paths, no tools that only exist on one machine, no personal handles, and no other company's brands, logos, footage, music or sound files.
- **Output** is deterministic, 1080×1920, and respects the platform chrome: the bottom ~300 px and right ~120 px are covered by Instagram's and TikTok's own interface, so anything important stays above y ≈ 1400 and between x 60 and 1020.
- **Readability:** one hero per beat, on-screen text of 40 px or more, and every state the viewer must read held for at least 0.4 s.
