# 3D and motion tools

Short shots made with Blender and Manim, rendered with a transparent background so they sit over any reel. Use `/blender-shot`: it
writes the shot from a brief, renders one still, looks at it, fixes it, then renders the clip. Needs Blender 5.1 or newer (optional install).

| File | What it is | When to use it |
|---|---|---|
| `lib/bb.py` | The helper library every shot imports: brand colours in linear space, a transparent render, studio lights, a camera on a target, a soft contact shadow, easing, 3D text, model import, and the output. | Never run alone; import it in any new shot you write. |
| `shots/product.py` | A box or can (optionally with a label image), turning, orbited or floating. | A product or packaging hero shot. |
| `shots/phone.py` | A phone showing a screen image (a capture or mock-up), tilting or pushing in. | Showing an app or web page on a phone (pair it with `scripts/capture/page_capture.mjs`). |
| `blender_shot.sh` | Runs a shot headless; `--still N` renders one frame to look at; `--clip x.mov` encodes the frames with alpha. Needs bash. | Every Blender shot: look at a still first, then render the clip. |
| `sprite_voxel.py` | Any pixel mascot or image as voxel blocks, with a hop and turn; `--assemble` flies the blocks together. | A mascot or logo that should build itself out of blocks. Show the owner the subject first. |
| `card_hero.py` | A 3D card. | A single card, ticket or screenshot that needs depth and a slow turn. |
| `stroke_drawon.py` | Hand-drawn circle, underline and arrow strokes. | Marking something on screen as if drawn by hand. |
| `fx_glitch.sh` | An RGB-split glitch burst on any finished clip (ffmpeg). | A short glitch accent on a cut or a "something broke" beat. Use sparingly. |
| `manim/stat_scene.py` | A counting number and a growing bar (Manim: optional, see "Optional tools" in SETUP.md). | A stat that should count up or a bar that grows. Only when Manim is installed. |

Gotchas: colours go through `bb.rgba` (a straight sRGB hex looks washed out); overlay a clip with ffmpeg only after `format=rgba`;
Blender's Python has no PIL (use numpy); each new mascot or object is shown to the owner before first use.
