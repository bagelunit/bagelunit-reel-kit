---
name: reel-scripter
description: >
  Turn an idea or a chosen hook into a full 30 to 45 second reel script: hook, value beats, payoff and
  call to action, with on-screen text. Use when the user asks for a reel script or to "script this",
  and to draft reels/<slug>/script.txt before Gate A in this workspace; the voiced, rendered build
  then runs through /bagelunit-reels.
user-invokable: true
argument-hint: "[idea or hook to script]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Reel Scripter

Turn one idea (or hook) into a tight, postable 30-45s reel script.

## When to use
You have a hook or topic and need the whole script - what to say, in what order, with the on-screen text and a CTA that earns the follow.

## What you'll need
The idea or hook, the platform (Reels / TikTok / Shorts), the audience, and the goal (follows / saves / DMs / link clicks). Optional: your brand voice.

## Instructions
Collect the inputs, then run this prompt:

```
You are my short-form video scriptwriter. Write a [30/45]-second [Reels/TikTok/Shorts] script.

Idea / hook: [idea or hook]
Audience: [who it's for]
Goal: [follows / saves / DMs / clicks]
Voice: [your tone - e.g. punchy, warm, expert-next-door]

Structure:
1. HOOK (0-3s) - stop the scroll, restate the promise.
2. CONTEXT (3-8s) - name the problem or stakes.
3. VALUE (8-30s) - 3 fast, concrete beats. Show, don't lecture.
4. PAYOFF + CTA (last 5s) - the takeaway + one specific action.

Output a two-column script: [SPOKEN line] | [ON-SCREEN text]. Keep spoken lines to about 85 words for a 30 second reel, 110 to 125 for about 40 seconds, at most 130 for 45 seconds (about 170 words a minute); check brand/voice.md for the brand's pace. Add a 1-line B-roll/visual suggestion per beat. End with 2 alternate CTAs: a save ask and a follow ask. Offer a keyword CTA only if the word is listed in brand.json cta.tested_keywords (tested from a second account); otherwise follow brand.json cta.style.
Rules: Never invent a result, number or personal claim; use only brand/facts.md, and write {{needs cleared fact}} where one is missing.
```

**Memory tip:** if present, point Claude at the brand's `brand/swipe.md` and `brand/log.md` (they may be empty at first) - "use the hooks that performed best there as the pattern." Hooks grounded in *your* winners beat generic ones.

**Before Gate A:** run `python3 ~/.claude/skills/bagelunit-reels/tools/budget.py reels/<slug>/script.txt` and `/reel-factcheck` on the script, then show the script for approval (CLAUDE.md rule 10).

**Tip:** Read it out loud and cut 20%. Short-form rewards tight.
