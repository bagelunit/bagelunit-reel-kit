---
name: viral-hook-writer
description: >
  Write scroll-stopping hooks for a short-form video (the first 1 to 3 seconds). Use when the user
  asks for hooks, hook options or opening lines, and at the hook step of every reel in this workspace,
  before the script goes to Gate A. Only cleared facts from brand/facts.md.
user-invokable: true
argument-hint: "[reel topic / what the video is about]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Viral Hook Writer

Generate a batch of scroll-stopping hooks for a reel - the make-or-break first 1-3 seconds.

## When to use
You have a reel topic but the opening is weak. The hook is ~80% of whether anyone watches - this gives you options to test.

## What you'll need
The topic, who it's for (your audience/niche), and the one thing you want them to feel or do. Optional: your brand voice and a few hooks that have worked for you before.

## Instructions
Collect the topic and audience, then run this prompt:

```
You are my short-form video hook writer. Topic: [topic]. Audience: [who it's for]. Desired reaction: [stop scrolling / save it / comment / DM me].

Write 10 hooks for the first 1-3 seconds. Use a spread of proven angles:
- Bold claim / contrarian take
- "If you [situation], do this"
- Mistake / "stop doing X"
- Number + payoff ("3 ways to…")
- Curiosity gap / open loop
- Result-first ("I went from X to Y")
- Question that names the pain

Rules: under 12 words each, spoken-language, no fluff, no hashtags. Never invent a result, number or personal claim; use only brand/facts.md, and write {{needs cleared fact}} where one is missing. For each hook add a 3-5 word on-screen text version. Mark the 3 you'd test first and say why in one line.
```

**Memory tip:** if present, point Claude at the brand's `brand/swipe.md` and `brand/log.md` (they may be empty at first) - "use the hooks that performed best there as the pattern." Hooks grounded in *your* winners beat generic ones.

**Tip:** Always generate 10 and test 2-3. The hook you love is rarely the one that wins.
