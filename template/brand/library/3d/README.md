# 3D and motion tools

Short shots made with Blender and Manim, rendered with a transparent background so they sit over any reel. Use `/blender-shot`: it
writes the shot from a brief, renders one still, looks at it, fixes it, then renders the clip. Needs Blender 5.1 or newer (optional install).

| File | What it is | When to use it |
|---|---|---|
| `lib/bb.py` | The helper library every shot imports: brand colours in linear space, a transparent render, studio lights, a camera on a target, a soft contact shadow, easing, 3D text, model import, and the output. | Never run alone; import it in any new shot you write. |
| `shots/product.py` | A box or can (optionally with a label image), turning, orbited or floating. | A product or packaging hero shot. |
| `shots/phone.py` | A phone showing a screen image (a capture or mock-up), tilting or pushing in. | Showing an app or web page on a phone (pair it with `scripts/capture/page_capture.mjs`). |
| `shots/terrain.py` + `terrain.py` | A 3D shaded-relief map of a real place from a latitude/longitude box (free open elevation tiles, no key): soft sun, a colour ramp or plain hillshade, optional label boxes, an orbit or push-in. | A "where is this" or "look at this landscape" shot. `terrain.py fetch` is the only step that uses the network, and only when you run it. |
| `blender_shot.sh` | Runs a shot headless; `--still N` renders one frame to look at; `--clip x.mov` encodes the frames with alpha. Needs bash. | Every Blender shot: look at a still first, then render the clip. |
| `sprite_voxel.py` | Any pixel mascot or image as voxel blocks, with a hop and turn; `--assemble` flies the blocks together. | A mascot or logo that should build itself out of blocks. Show the owner the subject first. |
| `card_hero.py` | A 3D card. | A single card, ticket or screenshot that needs depth and a slow turn. |
| `stroke_drawon.py` | Hand-drawn circle, underline and arrow strokes. | Marking something on screen as if drawn by hand. |
| `fx_glitch.sh` | An RGB-split glitch burst on any finished clip (ffmpeg). | A short glitch accent on a cut or a "something broke" beat. Use sparingly. |
| `manim/stat_scene.py` | A counting number and a growing bar (Manim: optional, see "Optional tools" in SETUP.md). | A stat that should count up or a bar that grows. Only when Manim is installed. |

Gotchas: colours go through `bb.rgba` (a straight sRGB hex looks washed out); overlay a clip with ffmpeg only after `format=rgba`;
Blender's Python has no PIL (use numpy); each new mascot or object is shown to the owner before first use.

## Terrain maps

```
python3 brand/library/3d/terrain.py plan  --bbox 46.5,7.5,46.7,7.9 --zoom 10          # which tiles, no network
python3 brand/library/3d/terrain.py fetch --bbox 46.5,7.5,46.7,7.9 --zoom 10 --out reels/<slug>/build/3d/terrain-data
bash brand/library/3d/blender_shot.sh brand/library/3d/shots/terrain.py reels/<slug>/build/3d/terrain --data reels/<slug>/build/3d/terrain-data --still 45
```
`--bbox` is south,west,north,east in degrees. `fetch` downloads Terrarium elevation tiles from the AWS Open Data "Terrain Tiles" (no key), one at
a time, with a generic User-Agent, retries and a cache in `<out>/../tile-cache` (a tile is never fetched twice). Caps: zoom 1 to 12 and 16 tiles
(`--max-tiles` up to 36); a refusal says what to lower. It writes `height.f32`, a 16-bit `heightmap.png`, `meta.json` and `ATTRIBUTION.txt`, and prints the
credit: **put that line in the caption** (the wording follows Tilezen's attribution page, checked 2026-11-17; the render step copies `ATTRIBUTION.txt` next to the render).
Shot options: `--ramp earth|mono|snow|heat|brand`, `--style ramp|hillshade`, `--exaggeration 1.6`, `--sun-az 315 --sun-el 28`, `--labels labels.json`
(`[{"text": "Peak", "lon": 7.7, "lat": 46.6}]` or `"u"`/`"v"` from 0 to 1), `--move orbit|push|static`, `--transparent 1`, `--size 1080 --height 1920`.
Without `--data` the shot makes a made-up landscape (`terrain.py synthetic --out DIR` makes the same data) so you can try it with no network.
On Windows run the `python` and `blender` commands directly (the `.sh` needs Git Bash or WSL).

## Camera: depth, motion and handheld

Every shot that calls `bb.camera_flags(cam, tgt, subject=...)` (the product, phone and terrain shots do) accepts these flags:

| Flag | What it does |
|---|---|
| `--dof 1 --fstop 2.0` | Depth of field: the subject stays sharp, near and far blur. Lower f-stop = more blur (1.4 strong, 2.8 soft, 8 barely). `--focus-distance 14` focuses on a distance instead. |
| `--rack-focus 1` | Focus shifts from in front of the subject onto it over the clip (uses `--fstop`, default 2.0). |
| `--motion-blur 1 --shutter 0.5` | Motion blur on moving things (needs a clip; a still has none). |
| `--handheld 1.0 --seed 7` | A small seeded camera drift (same seed, same shake; 2.0 is nervous; 0 is off). |
| `--move-preset push\|pull\|orbit\|static` | A slow dolly or orbit with ease in and out, from the camera's start position. `--move-amount 0.25` (fraction of the distance) and `--sweep 30` (orbit degrees). |

In your own shot script: `bb.dof(cam, focus=obj, fstop=2.0)`, `bb.rack_focus(cam, near_obj_or_distance, far_obj_or_distance, start, end)`,
`bb.motion_blur()`, `bb.camera_move(cam, 'push', target, amount)`, `bb.handheld(cam, tgt, amount, seed)` (call it after the move) and
`bb.ease(t, 'smooth'|'smoother'|'in'|'out'|'linear')`; `orbit` and `push_in` take `ease='smoother'` too. Test it: `node setup/test-blender3d.mjs`.
