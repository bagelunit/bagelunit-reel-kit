# Making a sticker presenter

Print-style reels can show your own character as die-cut stickers instead of the engine's drawn presenter. You make one pose set per brand, keep it outside this repo (it is your likeness and your logo), and point the brand workspace at it (`brand.json` > `host.poses_dir`).

No poses ship with the kit. This repo must never hold anyone's photos or poses.

## What the engine expects

- One folder of transparent PNGs, one file per pose, named exactly: `idle`, `point`, `guns`, `thumbs`, `shock`, `shrug`, `think`, `wave`, `magnifier`, `open`, `tshirt`, `one`, `two`, `three`, `four`, `five`, `celebrate`, `facepalm`, `raise` (for example `point.png`).
- Each PNG already carries its own white die-cut sticker border. The engine does not draw a border.
- Head and upper body (a bust), cut at the waist, the same scale and framing in every pose, so switching poses does not make the character jump.
- Portrait PNG, about 1000 to 1400 px tall. The engine draws it 600 px tall at the default dock.
- Missing poses are fine: the presenter falls back to `idle`. Start with `idle`, `point`, `thumbs`, `shock` and `one` to `three`.

| Pose | Used for |
|---|---|
| idle | default, between moments |
| point | aims at the newest thing on stage |
| raise | finger up, "here's the thing" |
| thumbs, celebrate | wins, "save this" |
| shock, facepalm, shrug, think | reactions |
| one to five | counting steps |
| wave | hello, goodbye |
| magnifier | "look closer", research |
| open | presenting, "here it is" |
| guns | playful, confident |
| tshirt | pointing at the logo on the chest |

## Step 1: the base character

1. Decide the look: a stylised version of the person (from a photo they give, with their consent) or an invented mascot. Keep it simple: flat colours, a clear outline, a plain top with room on the chest for a logo.
2. Generate one front-facing base image with an image model, on a plain background. Iterate until the face, hair, outfit and proportions are right. This image is the reference for every pose.
3. Write down the exact description that produced it (outfit, colours, line style). You reuse it in every pose prompt so the set stays consistent.

## Step 2: the poses

1. For each pose, give the image model the base image as a reference plus the saved description, and change only the pose and expression: "same character, same outfit, same framing, now pointing to the right with one finger, mouth open".
2. Keep the top plain at this stage: no logo. Models redraw logos badly.
3. Remove the background (any background-removal tool) and add a white sticker border of the same width on every pose.
4. Line them up: same canvas size, same head height, the bottom of the bust on the same line. Check them side by side on one contact sheet.

## Step 3: the real logo, printed on

Do not ask the model to draw the logo: it will misspell or reshape it. Put the real logo file on the chest so it looks printed, not pasted:

1. **Composite:** a small script places the real logo (PNG with transparency) on the chest of each pose: centred between the shoulders, scaled to the chest width, rotated with the torso.
2. **Make it look printed:** paint the logo only where the fabric is (so fold lines, seams, outlines, drawstrings and hands that cross the chest stay on top of it), darken it where the fabric is in shadow, curve it slightly as if on a rounded chest, use an ink colour slightly deeper than the screen colour, and soften the edges a touch.
3. **Optional model redraw:** if a pose still looks pasted, give the model the composited image and ask for a light redraw of the shirt only, with the logo kept exactly as is. Compare against the real logo and reject any redraw that changes a letter or shape.
4. Fine-tune per pose (small offsets, scale and rotation) where an arm or a twist moves the chest.

The presenter's default lift (120 px) keeps the chest logo inside the frame; keep it that way if the logo matters.

## Step 4: test

1. Make a short test reel in Print style with a few cues: `"presenter": {"type": "stickers", "dir": "host", "cues": [["one", "one"], ["two", "two"], ["save", "thumbs"]]}`.
2. Link the pose folder into the reel: `ln -s <your pose folder> <reel>/host`.
3. Render a draft and check: no jump between poses, the border reads on the paper background, the logo stays visible and readable, the presenter does not cover captions or safe zones.

## Where to keep it

Keep the pose folder with the brand's other identity files (outside this repo, ideally outside iCloud-synced folders), and set `brand.json` > `host.type` to `stickers` and `host.poses_dir` to its path. `/brand-setup` asks for this and lists any missing poses.
