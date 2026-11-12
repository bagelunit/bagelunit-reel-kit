# Mode rules

A mode is one look the kit can produce. This page is the agreement between a mode and the rest of the kit: the tools in `tools/` know nothing about any particular mode and only rely on what is written here. Read it before you add a mode or change one.

## The modes in this kit

| Mode | Drawn with | Frames taken from | The look |
|---|---|---|---|
| `print` | Canvas 2D (two layers: ink + a WebGL print compositor) | the canvas | a riso print on warm stock: engraved line shading, one accent ink, paper-white cards with hard shadows, big condensed caps captions with a marker underline on the key word, a sticker host in the corner who points at the focus and acts every phrase, blind wipes (`modes/print/GUIDE.md`) |
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

## Scene styles

Besides the three modes the kit offers the scene styles in `styles/` (local addition, 2026-11-12): looks like Stick Figure Folk, Map or Comic, written and tested in the separate `bagelunit-styles` repo and copied in by its sync script. `node tools/kit.mjs scene list` names them; `kit scene list <id>` shows one style's templates.

**How they differ from a mode.** A mode is one page that draws the whole reel (`window.studio`, above). A scene style has no reel page: the reel is an ordered list of scenes, and each scene is its own self-contained page that `styles/_core/build-scene.mjs` builds from the shared runtime, the style's engine and ONE template with its props, the scene's narration and its slice of the word times. That page fills `window.__scene` instead of `window.studio`:

| Field | What it holds |
|---|---|
| `ready` | a Promise that settles once the scene is built and drawn at 0 |
| `seek(t)` | draws second `t` of the scene; depends on `t` alone, works backwards too |
| `errors` | everything the runtime or the engine complained about |
| `window.SceneStyle.inspect(t)` | optional: `[{kind, label, x, y, w, h, moving}]`, the screen boxes of what is drawn at `t`; the kit uses it for the safe-area checks |

`kit render` renders each scene to its own mp4 with its slice of the voice (`build/scenes/NNN.mp4`), skips a scene whose page and voice slice did not change (content hash in `build/scenes/NNN.json`), joins the scenes without encoding the picture again, and puts the whole `audio/vo.mp3` (plus `reel.json` `"music"`, ducked under the voice at `"music_volume"`, default 0.18) under it at -14 LUFS. It writes `build/video.mp4` (1080x1920) and `build/draft.mp4` (540x960), where the modes' renders go, so `kit qa`, `kit pace`, `kit cover`, `kit export`, the gates and the publisher work as before. Scenes are hard cuts; a scene's transitions and motion are the engine's. `kit export` mixes the final sound with `tools/sound.py` as for every mode (the voice and `reel.json` `"music"`; scene styles publish no sound cues).

**Folder layout** (never edit it here: `styles/README.md`):

```
styles/
  STYLES.json      the registry: id, name, description, palette, fonts, formats, template ids, the styles repo version and sync date, a fingerprint per file
  README.md        "edit in the styles repo, never here"
  _core/           runtime.js, build-scene.mjs (used by the kit), render-scene.mjs, assemble.sh, playwright.mjs (the styles repo's own, kept for reference)
  <id>/            engine.js, engine.css, meta.json, SKILL.md (art direction: read it first), docs.md (the drawing API for custom scenes), templates.json
```

A style appears in `kit start` as soon as it is in `STYLES.json` with `tall` among its formats and its `engine.js` is there.

**The plan: `scenes.json`** in the reel folder, next to `reel.json` (`{style: "<id>", name, cta: {keyword}, seed?, tail?, music?, music_volume?}`) and `script.txt`:

```json
{ "scenes": [
  { "template": "title-card", "props": { "title": "The *Universe*, briefly" }, "narration": "Chapter one. The universe, briefly." },
  { "template": "figure-explains", "props": { "doodle": "sun", "label": "sunlight = all colours" }, "narration": "Sunlight looks white, but blue scatters the most." },
  { "code": "scenes/03.js", "narration": "Cats or dogs? Science has no answer." }
] }
```

- One scene per idea, in script order. `narration` is the exact words of `script.txt` that the scene covers; together the scenes cover the whole script.
- `template` is one of the style's template ids, and `props` follow that template's `propsSchema` in `templates.json` (every prop has a default; unknown props are ignored and `kit scene <dir> plan` names them). `*word*` marks the accent word where the style supports it. `"code": "<file>"` instead of a template is the body of `function scene(V, S, root)` using the style's `docs.md` API.
- Optional per scene: `id`, `seed`.
- **No times are typed.** Each scene's start and end come from `build/words.json`: its narration is matched to the spoken words, and the cut between two scenes falls in the middle of the pause between them, on a frame. A scene whose words cannot be found (no voice yet, or narration that is not in the script) shares the time between its neighbours evenly. `kit scene <dir> plan` prints the times and how each was found, into `build/scene_times.json`. Scenes run best at 3 to 12 s.

**Checks.** `kit scene <dir> check` builds every scene and reports `window.__scene.errors`, boxes outside the safe area (y 250 to 1470, x 60 to 1020 on 1080x1920, 6 px slack) and frames that change after seeking away and back, with four stills per scene and a sheet in `build/scenes/check/`. `kit render` keeps the resting `S.inspect` boxes on the reel's clock in `build/scene_boxes.json`, and `kit qa` checks the safe zone on them (text size is not measured for scene styles). `kit effort` does not apply (there is no shot code) and `kit lint` finds no shot data; `kit pace` measures the draft against the print bar.

**Voice.** `tools/voice.py` voices `script.txt` exactly as for a mode (`reel.json` `"voice"` applies). `kit scene <dir> stand-in` makes a stand-in instead: a tone on each word with fake word times, no key and no credits, for previewing timing and for tests. It never replaces a real voice take, and `kit render` warns while it is in use.
