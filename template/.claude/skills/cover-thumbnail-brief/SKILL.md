---
name: cover-thumbnail-brief
description: >
  Writes the cover-frame text and visual brief that makes your reel stop the scroll on the grid
  and in Explore.
  Use when the user says "write my cover text", "thumbnail brief", "what should the cover say", "grid cover for this reel".
user-invokable: true
argument-hint: "[the reel topic or script]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Cover & Thumbnail Brief - the frame that stops the scroll on the grid

Use when the owner asks for cover text or a cover brief. Input: the reel's topic or script. Output: three
cover texts, a visual brief and the checks below; in a reel workspace it becomes `cover.html`. Next step:
`kit cover reels/<slug>`.

## When to use
The reel is made and the grid cover decides whether anyone opens it.

## What you'll need
The reel topic or script, and a look at your current grid.

## Instructions
Give Claude the input and run this.

```
You are my cover designer. Reel: [TOPIC/SCRIPT]. My grid currently looks like: [describe or paste].

1. COVER TEXT: 3-5 words max. Give me three options, ranked, each legible at thumbnail size.
2. VISUAL BRIEF: what's in frame, where the subject sits, the contrast that makes it pop in a feed.
3. SAFE AREA: keep all text inside the centre 1080x1440 band of a 1080x1920 cover (workspace CLAUDE.md); `scripts/qa/cover_check.py` verifies the stricter core inside it (x 35 to 1045, y 285 to 1635). It is a dedicated still cover scene with a prop that shows the subject, the presenter if any and the handle, never a frame from the hook. No other company's logos. In a reel workspace the brief becomes the reel's `cover.html`, and `kit cover reels/<slug>` turns it into `out/cover.jpg` (Meta's cover rules) and `build/cover-crops.jpg`: check that the title sits inside the white box (the profile grid) and, if the reel is shared to the feed, the yellow square.
4. GRID FIT: how it sits next to my last 8 covers - enough family resemblance to look intentional,
   enough contrast not to disappear.
5. TEST: describe it at 150px wide. If it's unreadable there, give me a simpler option.
Rules: Never invent a result, number or personal claim; use only brand/facts.md, and write {{needs cleared fact}} where one is missing.
```

## Check the cover picture
Once `out/cover.jpg` exists (`kit cover reels/<slug>`), run the cover check on it:

```
python3 scripts/qa/cover_check.py reels/<slug>/out/cover.jpg
```

It reads the picture, not the brief, and reports PASS, WARN or FAIL for each of these:
- **Size:** 1080x1920. Any other 9:16 size or a 1:1 or 4:5 picture is a WARN; any other shape fails.
- **Safe centre:** every line of text sits inside the middle 1010x1350 of the cover (x 35 to 1045, y 285 to 1635), the part the
  profile grid (which crops a reel cover to 3:4 or 4:5) and a feed square never cut.
- **Text size:** the biggest line is at least 80 px tall (`--min-h` changes it), so it reads at the 150 px wide test above; any
  other line under 40 px is a WARN (a handle can be small). No text read at all fails.
- **Light:** not near-black and not near-white (it would vanish on a dark or light grid), and not flat.

Exit code 0 means all pass, 1 means a FAIL (fix the cover and run it again), 2 means a check could not run (no text reader on
this computer: install Xcode command line tools on a Mac, or Tesseract; say so, do not call it passed). Put the result line
in the Gate C review. The picture check does not replace looking at `build/cover-crops.jpg`.

**Honesty:** Legibility beats cleverness. A clever cover nobody can read at thumbnail size does not exist.

**Next:** [caption-and-hashtags](../caption-and-hashtags/SKILL.md)
