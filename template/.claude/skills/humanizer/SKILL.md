---
name: humanizer
description: >
  Rewrite a script, caption or reply so it sounds like the person and not like AI, without changing what it
  says, and check it against the brand's banned characters and words. Use when the user asks to
  "humanize" or "make this sound less like AI", or by name (/humanizer). The kit also runs it
  automatically on any text before it is handed over (script, caption, reply). /ig-human detects
  and scores; this rewrites and checks the brand's word list.
user-invokable: true
argument-hint: "[text to rewrite, or a path to a script or caption]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Humanizer

Input: text or a file path. Output: the rewritten text and a short list of
what changed. Next step: the caller's next step (for a script, `/script-score`).

How it relates to `/ig-human`: `/ig-human` detects and gives the score (the Gate A must-pass). This skill rewrites
what was flagged. Run `/ig-human` again afterwards to confirm the score.

Same meaning, fewer tells. Never add a fact, number or claim that was not in the text.

## Steps
1. Run the check: `python3 ./.claude/skills/humanizer/humanize_check.py <file>` (or pipe the text in).
   It reads `brand/brand.json` -> `writing` for banned characters and words, and lists the usual AI tells with line numbers.
2. Rewrite only what it flagged, plus anything else that reads stiff aloud. Keep the person's own words where there are any
   (read `brand/voice.md`).
3. Run the check again. Report what changed in one short list. If the text needs a fact it does not have, write
   `{{needs cleared fact}}` instead of inventing one.

## The tells to remove
- Staged openers ("Here's the thing", "Let's dive in", "In today's world").
- Forced triads ("fast, simple, and powerful") when two or one would do.
- Contrast crutches ("It's not X, it's Y") used more than once.
- Stock words: delve, leverage, unlock, elevate, seamless, game-changer, supercharge, landscape, tapestry.
- Em dashes. Use a full stop or a comma.
- Filler before the point ("It's worth noting that", "Basically", "Essentially").
- Hype and unearned superlatives; every number needs to be in `brand/facts.md`.

## For spoken scripts
Read it out loud. Short sentences. One idea per line. Commands, URLs and codes go on screen, not in the voice.
