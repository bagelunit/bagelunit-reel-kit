---
name: blender-shot
description: >
  Makes a short 3D shot in Blender for a reel, of anything: a product, a box or can with a label, a phone showing a screen
  capture, 3D text, a model, a scene. Claude writes the shot from a brief, renders one still, LOOKS at it, fixes what is wrong,
  then renders a transparent clip to place over a Print or scene-style reel. Use on /blender-shot, or when a reel's "Tools per
  scene" plan calls for a 3D hero shot, or when the user asks for a 3D object, product shot, phone mock-up or 3D title.
user-invokable: true
argument-hint: "[what the shot shows]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Blender shot: any subject, checked by eye before it is rendered

Blender renders almost anything. This skill makes one 3-to-5 second shot per use, from a short brief, and joins it to a reel as a
transparent clip. A shot is only worth it when it earns its place in the reel (list it in the reel's "Tools per scene" line at Gate B).
The owner sees each new subject (a mascot, a product, an object) before its first use in a reel.

## Before you start
- Blender is installed: `blender --version` (Mac: `brew install --cask blender`; others: blender.org). Blender 5.1 or newer. If a different
  path, set `BLENDER_PATH`. Without it, say so and stop; the rest of the reel does not need it.
- Tools are in `brand/library/3d/`: `lib/bb.py` (the helper library), `shots/product.py`, `shots/phone.py` and the older recipes
  (`sprite_voxel.py` for a pixel mascot as blocks, `card_hero.py`, `stroke_drawon.py`). `blender_shot.sh` runs a shot and can encode the clip.
- Optional: the official Blender Lab MCP (`blender` server, if the owner installed it) can open a `.blend` and take screenshots. The scripts here do not need it.

## The flow
1. **Brief (three lines).** What the shot shows, what it does in 3 to 5 seconds (turn, orbit, push in, float, assemble), and the mood
   (colours from `brand/brand.json`; the helpers read them). Say which scene of the reel it is for and what is behind it.
2. **Pick or write the shot.** A template if it fits: `shots/product.py` (a box or can, optional `--label`), `shots/phone.py`
   (a phone with `--screen`: a capture from `scripts/capture/page_capture.mjs` or a still). Otherwise write a new script into the reel's
   `build/3d/<shot>.py` using `lib/bb.py` (`setup`, `mat`, `mat_image`, `rounded_box`, `cylinder`, `plane`, `text3d`, `import_model`,
   `blob_shadow`, `studio_lights`, `camera`, `orbit`, `push_in`, `smooth`, `render`). Anything an object needs but the library lacks, write inline.
3. **Look before you render the clip.** Render ONE frame (a few seconds):
   `zsh brand/library/3d/blender_shot.sh <shot.py> reels/<slug>/build/3d/<shot> --still 45 [options]`.
   Put it over the paper colour so you judge it as the reel will show it (`ffmpeg -f lavfi -i color=c=0xFBF5E6:s=1080x1080 -i still.png
   -filter_complex "[1:v]format=rgba[c];[0:v][c]overlay=format=auto" -frames:v 1 look.jpg`), then open `look.jpg` and check:
   subject centred and not cut off, colours match the brand (not washed out), nothing floating above its shadow, text readable and spelled right,
   no intersecting parts, a screen's picture at its true colours. Fix the script and render the still again. Up to 3 rounds; then show the owner what blocks it.
4. **Render the clip** with the transparent background: add `--clip <name>.mov` (ProRes 4444) or `.webm`. Check the first, middle and last frames the same way.
5. **Join it to the reel.** Overlay on the scene's video with ffmpeg after `format=rgba` on the clip (without it the overlay comes out empty). Keep the clip
   inside the safe area (bottom 300 px and right 120 px stay clear of text). Note it in `STORYBOARD.md` under "Tools per scene".

## Rules
- **Colours:** always through the helpers (`bb.rgba`, `bb.mat`): Blender wants linear colour, and a straight sRGB hex looks washed out.
- **Other people's work:** only your own models, or ones whose licence allows it (CC0 is the safe default). Record the source and licence in `brand/library/INDEX.md`
  before using one. Never recreate another company's logo, product or character as an object (house rule 9); a mascot of a company needs the owner's yes and a record in `CLAUDE.local.md`.
- **Real screens are evidence:** a phone showing a product's page is first-party material; still clear each claim on it in `brand/facts.md` (rule 1).
- **Cost:** a 4-second 1080 clip takes about a minute; physics or smoke much more. Use `--size 720` for tests, and say before a long render.
- **Heavy output** (`build/3d/`, frames, clips) stays out of git.
