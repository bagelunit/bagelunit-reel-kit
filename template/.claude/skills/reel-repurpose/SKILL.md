---
name: reel-repurpose
description: >
  Turns one approved reel into its versions for other places: TikTok and YouTube Shorts (caption, title, description,
  and a check that the video's text is not hidden under each app's buttons), an Instagram carousel and a blog post, all
  from the same approved script and only cleared facts. Use on /reel-repurpose, or when the user says "post this on
  TikTok", "make the Shorts version", "turn this reel into a carousel", "write a blog post from this reel", "every
  platform" or "repurpose".
user-invokable: true
argument-hint: "[reel folder] [tiktok | shorts | carousel | blog | all]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# One reel, every platform

The reel itself does not change: the same approved 1080x1920 mp4 goes to TikTok and YouTube Shorts. What changes is the
words around it and where each app puts its buttons. Everything here comes from the reel's approved script and caption;
nothing new is claimed (house rule 1: only `brand/facts.md`, `{{needs cleared fact}}` where one is missing).

Ask every choice with a question block (AskUserQuestion), the recommended option first.

## Before you start

1. The reel passed Gate C and `kit gate <reel> check` prints MATCH. If not, stop: repurpose the approved file only.
2. Ask which versions (multi-select): "TikTok", "YouTube Shorts", "Instagram carousel", "Blog post". Default: all four.
3. Read `reels/<slug>/script.txt`, `out/caption.txt`, `brand/voice.md` and `brand.json` (handle, CTA, banned words).

Write each version to `reels/<slug>/out/platforms/` (the reel's card on the dashboard lists them).

## TikTok (`tiktok.txt`)

- Caption: the hook as the first line, one or two short lines of value, one call to action. Three to five hashtags in the caption (never in a comment) at
  the end (niche first, no generic ones like #fyp unless the owner asks).
- A suggested on-screen text for TikTok's own text box only if the reel's first second has none.
- With TikTok connected on the brand's publisher (`docs/connect.md` step 6C), `/reel-posting` sends this file's caption with the approved mp4 (as a draft in the owner's TikTok inbox unless the brand uses direct posts). Without it, the owner uploads the same mp4 from `out/`.

## YouTube Shorts (`youtube.txt`)

- The file is the title on its **first line** (under 60 characters if possible, 100 at most, the hook in plain words, no clickbait the video does not pay off), a blank line, then the description. The publisher reads it that way.
- Description: two or three lines, then `#Shorts` and two or three topic hashtags. No `<` or `>` anywhere (YouTube refuses them).
- With YouTube connected on the brand's publisher (`docs/connect.md` step 6B), `/reel-posting` posts it as a Short. Without it, the owner uploads the same mp4 from `out/`.

## The buttons check (TikTok and Shorts)

Each app lays its buttons and caption over the video in a different place than Instagram does. As a rough guide on a
1080x1920 frame: TikTok covers about the right 150 px (buttons) and the bottom 350 px (caption and music);
Shorts covers about the right 130 px and the bottom 300 px. Apps change these, so treat them as a guide.
1. Grab frames where on-screen text appears: `node ~/.claude/skills/bagelunit-reels/tools/kit.mjs frames reels/<slug> <t> ...`
   (use the times of the captions and cards from `build/word_index.txt` or the storyboard).
2. Look at each frame against those areas. Note any text, face or key object that would sit under them, with its time.
3. Report it plainly in `platforms/notes.md`. A fix means moving text and rendering again, which changes the file, so
   it goes back through Gate C. Ask before doing that; often the answer is "post as is".

## Instagram carousel (`carousel.md`)

Six to ten slides from the script's beats: slide 1 is the hook as a title (under 8 words), one idea per slide (under
25 words each), the last slide is the call to action. For each slide: the words, and one line on what is on it (reuse
the reel's shots or props where possible). It is a plan to build, not a finished image.

## Blog post (`blog.md`)

400 to 700 words in the brand's voice: a title, a two-sentence opening that makes the reel's point, three to five short
sections with headings from the script's beats, and the call to action. Embed note: "[the reel]" where the video goes.
No numbers or claims beyond `brand/facts.md`.

## Finish

1. Run `/humanizer` on every text version and check the brand's banned words and characters (no em dashes by default).
2. Show the owner the versions (paths, plus the TikTok caption and the YouTube title in chat) and the buttons-check
   result. Ask: "Looks good (Recommended)", "Change something", "Drop one".
3. After they post elsewhere, a line in the reel's `approvals.md` under `## Posting` keeps the record:
   `- 2026-11-12 18:10 Posted on TikTok: <link>` or `- ... Posted on YouTube Shorts: <link>`.

## Never

- Never post or upload to any platform; the owner does.
- Never change the approved video here. A change goes back through Gate C.
- Never add a claim, number or result that is not in `brand/facts.md`.
