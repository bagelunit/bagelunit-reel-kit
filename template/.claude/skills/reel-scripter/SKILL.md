---
name: reel-scripter
description: >
  Turn an idea or hook into a full 30-45 second reel script - hook, value beats,
  payoff, and CTA, with on-screen text. Use ONLY when the user asks for it by name (/reel-scripter) or
  for a standalone script outside the kit's loop. Inside a Susanoo reel workspace the script is
  written at Gate A by /susanoo-reels, so do not trigger on "write a reel" or "script this".
user-invokable: true
argument-hint: "[idea or hook to script]"
metadata:
  author: Susanoo
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

Output a two-column script: [SPOKEN line] | [ON-SCREEN text]. Keep spoken lines to ~140 words total. Add a 1-line B-roll/visual suggestion per beat. End with 2 alternate CTAs.
```

**Memory tip:** point Claude at the brand's `brand/swipe.md` and `brand/log.md` - "use the hooks that performed best there as the pattern." Hooks grounded in *your* winners beat generic ones.

**Tip:** Read it out loud and cut 20%. Short-form rewards tight.
