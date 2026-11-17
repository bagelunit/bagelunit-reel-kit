# 3D and motion tools

Short shots made with Blender and Manim, rendered with a transparent background so they sit over any reel. Use `/blender-shot`: it
writes the shot from a brief, renders one still, looks at it, fixes it, then renders the clip. Needs Blender 5.1 or newer (optional install).

| File | What it is |
|---|---|
| `lib/bb.py` | The helper library every shot imports: brand colours in linear space, a transparent render, studio lights, a camera on a target, a soft contact shadow, easing, 3D text, model import, and the output. |
| `shots/product.py` | A box or can (optionally with a label image), turning, orbited or floating. |
| `shots/phone.py` | A phone showing a screen image (a capture or mock-up), tilting or pushing in. |
| `blender_shot.sh` | Runs a shot headless; `--still N` renders one frame to look at; `--clip x.mov` encodes the frames with alpha. |
| `sprite_voxel.py` | Any pixel mascot or image as voxel blocks, with a hop and turn; `--assemble` flies the blocks together. |
| `card_hero.py`, `stroke_drawon.py` | A 3D card; hand-drawn circle, underline and arrow strokes. |
| `fx_glitch.sh` | An RGB-split glitch burst on any finished clip (ffmpeg). |
| `manim/stat_scene.py` | A counting number and a growing bar (Manim; the installer's Manim step). |

Gotchas: colours go through `bb.rgba` (a straight sRGB hex looks washed out); overlay a clip with ffmpeg only after `format=rgba`;
Blender's Python has no PIL (use numpy); each new mascot or object is shown to the owner before first use.
