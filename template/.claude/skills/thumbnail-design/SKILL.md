---
name: thumbnail-design
description: >
  Takes a cover or thumbnail brief into an outside design tool (Canva, Adobe Firefly or Express, any editor) or a Blender still, saves the finished
  image in the brand folder and puts it on the reel with kit cover --image. Use when the user says "design the cover in Canva", "make the thumbnail
  in Firefly", "use my own cover image", or after /cover-thumbnail-brief when the owner wants a designed picture rather than the kit's HTML cover.
user-invokable: true
argument-hint: "[reel folder, e.g. reels/<slug>] [the brief, or leave empty to write it first]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Thumbnail design: the brief, made in the tool you like, checked here

Inputs: the cover brief (from `/cover-thumbnail-brief`; if there is none, run that first) and the reel folder. Outputs: one image inside the brand folder and `out/cover.jpg`. Next step: `/caption-and-hashtags`, then `/reel-review`.

Canva and Adobe Firefly or Express are what we suggest; any design tool or a Blender still works, and none is required. If the owner has the Canva or Adobe connector in Claude, Claude can use it for the design. Otherwise the owner designs by hand and exports. Never ask for a password or key in the chat, and ask before anything paid or public.

## Rules
1. **1080x1920, a 9:16 still.** Export a JPG or PNG at that size. The title text stays inside the safe centre: x 35 to 1045, y 285 to 1635 (the 3:4 grid crop and the feed square never cut it). Text is big: the biggest line at least 80 px tall.
2. **Your own image only.** Use elements you made or have rights to (a licensed stock element is recorded with `kit licensed add`). No real people, no lookalikes, no other brand's logos or product screens, nothing copied from another creator's cover.
3. **Generated pictures are labelled** per `/generated-shots` when the platform or the subject needs it.
4. **Facts.** Any number or claim on the cover must be in `brand/facts.md`.

## Steps
1. Read the brief: three cover texts (3 to 5 words), the visual brief, the safe area. Pick one with the owner.
2. Design it: in Canva or Adobe by hand or through the connector, or as a Blender still (`/blender-shot` renders one still; use its still and add the text in the design tool). Export at 1080x1920.
3. Save the export inside the brand folder, for example `reels/<slug>/build/cover-source.jpg`, not in Downloads and not in the repo's tracked media.
4. Put it on the reel:

   ```
   kit cover reels/<slug> --image reels/<slug>/build/cover-source.jpg
   ```

   `--image` is the way to use a finished picture: it is resized to Meta's cover rules and written as `out/cover.jpg` and `build/cover-crops.jpg`. (The engine is gaining this flag; if `kit cover` does not know `--image`, run `/kit-update`.)
5. Check the picture itself:

   ```
   python3 scripts/qa/cover_check.py reels/<slug>/out/cover.jpg
   ```

   Fix any FAIL and run it again; exit 2 means no text reader is installed, so say that and do not call it passed. Look at `build/cover-crops.jpg`: the title inside the white box (profile grid) and, if shared to the feed, the yellow square.
6. Test at 150 px wide. If it is unreadable, simplify the text and redo from step 2.

**Honesty:** a pretty cover nobody can read at thumbnail size does not exist. Put the check result in the Gate C review.

**Next:** [caption-and-hashtags](../caption-and-hashtags/SKILL.md)
