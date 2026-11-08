---
name: reel-builder
description: >
  Turn a teardown or a rough idea into a ready-to-shoot plan: beat-by-beat script in the brand's
  voice, on-screen text, the scene for each beat, pacing cues and the caption. Use when the user wants
  an idea turned into a shoot plan or build table without rendering, or /content-factory calls it. For
  a voiced, rendered reel use /bagelunit-reels.
user-invokable: true
argument-hint: "[a reel-analyzer teardown, or a topic + the structure to follow]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Reel Builder - Claude assembles the whole reel for you

The last step of the factory. Hand Claude a teardown (from [reel-analyzer](../reel-analyzer/SKILL.md))
or just an idea + the structure to follow, and it **builds the finished reel** - every beat scripted in
your voice, with the on-screen text and the visual for each beat - so you can shoot/render it as-is.

## When to use
You have the structure you want to model (or a hook + topic) and you want the entire reel assembled, not
just notes. Run this after the analyzer + hook writer, or standalone with your own outline.

## What you'll need
The **teardown or structure** to follow, your **topic/offer**, your **voice**, and the **CTA** (what you
want them to do). Optional: your past winners (from `brand/log.md` and `brand/swipe.md`) so it sounds like you.

## Instructions
```
You are my reel builder. Build a complete, ready-to-make reel.
STRUCTURE TO FOLLOW: [paste the reel-analyzer teardown, or describe the beat structure].
TOPIC: [what it's about] · VOICE: [yours] · GOAL/CTA: [save / follow / comment / DM].

Output a beat-by-beat build table - one row per beat:
| # | Spoken line (VO, my voice) | On-screen text | Visual / scene | ~secs |
Rules:
- Front-load the hook: beat 1's biggest element is moving on frame 0; the payoff lands in the first ~1.5s.
- The visual CHANGES every beat (show what's said - never plain text for a demo line).
- Original words on the modeled structure; total length is about the reference, or 30 to 45 s if there is no reference.
- End on ONE clear CTA that matches the deliverable. Keyword CTA only if the word is in `brand.json` -> `cta.tested_keywords`; otherwise a save or follow ask, per `cta.style`.
Then give me: the final hook (3 options), the full VO script as one paragraph, and a caption + hashtags.
```

In a reel workspace also do these, in this order:
- Ask the style first (Print, 3D, or Talking head), one multiple-choice question, recommendation first.
- Run `/reel-factcheck` on the script and `budget.py` (see CLAUDE.md rule 10) before Gate A.
- Record the goal and angle, and each approval, in `reels/<slug>/approvals.md`.

**Pairs with:** [reel-analyzer](../reel-analyzer/SKILL.md) (what to model) →
[viral-hook-writer](../viral-hook-writer/SKILL.md) (the opener) → this (the full build) →
[caption-and-hashtags](../caption-and-hashtags/SKILL.md) (the post).

## Rendering the reel - the video engine (make it, not just script it)

Scripting is half the job; this is how you turn the build table into a real, cinematic reel that
actually gets watched. Use a **hybrid engine**, matched to the tier:

- **Character-acting / cinematic beats → Seedance (image-to-video).** Seedance runs on **Runway** via
  the RunwayML SDK with `model: "seedance2"` (portrait `720:1280` for a 9:16 reel, ~5s per clip).
  Generate a conditioning still of the character/scene, then i2v it so the subject genuinely MOVES and
  performs. Only if `brand.json` -> `autopilot.paid_renders` is true and the owner approves the cost first.
- **Hook, chapter, text, payoff, CTA beats → `/bagelunit-reels`, the gated local render route.** Fast, on-theme,
  no extra render cost. It runs the Gate A/B/C approvals. This is the default for the whole reel and the
  text scaffolding of any paid one.

**Non-negotiables (each of these was a real failure once - do not repeat them):**
1. **The hook needs a gripping VISUAL, not just text.** Open on something that grabs (e.g. a creator
   hacking a glowing terminal, a lock cracking, sparks) - the payoff word lands in the first ~1.5s.
2. **The character ACTS through a progressive action - never ping-pong/loop a few poses.** Looping a small
   pose set back-and-forth (A→B→A→B) reads as "replaying" and plays actions in reverse. Each beat is ONE
   forward action, start to finish. Seedance i2v does this natively; posed-frame code renders do NOT (they
   loop and read choppy - avoid them for real acting).
3. **Sync the visual to the VOICEOVER, not a wall-clock.** Transcribe the VO (word timestamps) and cut/act
   ON the word - the action must match what's being said. Lead the cut ~10 frames.
4. **Emphasis text must be high-contrast and readable** on every background (e.g. bright amber `#FFCC33`
   with a dark outline stroke reads on both dark and light beats).
5. **Close on an on-screen CTA card that matches the brand's CTA setting.** If the keyword is listed in
   `brand.json` -> `cta.tested_keywords` (the auto-reply was tested from a second account), end with a themed
   "Comment [KEYWORD] and I'll DM you [the thing]" card and use the SAME keyword in the caption. If no keyword is
   tested, end on a save or follow card, per `cta.style`. Wiring a keyword in
   [comment-responder](../comment-responder/SKILL.md) needs the matching autopilot permission. Honest only:
   the keyword must be really wired.
6. **No fabricated numbers.** Every number on screen must be in `brand/facts.md`; otherwise write `{{needs cleared fact}}`. Never show another company's logos (CLAUDE.md rule 9).

**Verify before you ship - WATCH and MEASURE the playback, never trust a still.** Extract frames at ~12fps
and confirm: motion is progressive (no repeating/ping-pong autocorrelation period), no frozen beats while
the VO talks, and each action's cut aligns to its narration cue. Then eyeball the whole thing end to end.
A reel that was never watched ships broken.

**Credentials:** use an API key you were explicitly given, from your OWN project's env only. Never search
the filesystem for a key or read another product's `.env` - if you don't have the key, stop and ask.

**Honesty:** only promise a CTA you can deliver (if "comment WORD → I'll DM it", the keyword must be tested and the DM actually sent).
