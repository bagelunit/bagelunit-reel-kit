---
name: viral-hook-writer
description: >
  Write scroll-stopping hooks for a short-form video (the first one or two sentences), each one a
  triple hook: context, lean, contrarian snapback. Use when the user
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

Generate a batch of scroll-stopping hooks for a reel - the make-or-break first one or two sentences. Every hook is a **triple hook** (BagelUnit's method, written out in full in `docs/hook-and-review-playbook.md` section 0; read it before writing):
1. **Context:** the first line says what the video is about, at once, said in the voice, shown in the first frame and written on screen. Never later in the sentence.
2. **Lean:** make the viewer curious in one direction, with proof or a number (only from `brand/facts.md`), a specific pain or benefit, or something interesting, shocking or unexpected.
3. **Contrarian snapback:** pull them away from the direction they were leaning and onto another, true path that the rest of the reel pays off.

## When to use
You have a reel topic but the opening is weak. The hook is ~80% of whether anyone watches - this gives you options to test.

## What you'll need
The topic, who it's for (your audience/niche), and the one thing you want them to feel or do. Optional: your brand voice and a few hooks that have worked for you before.

## Instructions
Collect the topic and audience, then run this prompt:

```
You are my short-form video hook writer. Topic: [topic]. Audience: [who it's for]. Desired reaction: [stop scrolling / save it / comment / DM me].

Write 10 hooks, each a triple hook in one or two sentences:
1. CONTEXT: the first words say what the video is about (never delayed to the back half of the sentence).
2. LEAN: one reason to lean in: a proof point or number from brand/facts.md, a specific pain or benefit, or something interesting, shocking or unexpected.
3. CONTRARIAN SNAPBACK: a true turn that pulls the viewer away from where they were leaning and onto another path.
Vary the lean and the angle across the 10, using a spread of these:
- Bold claim / contrarian take
- "If you [situation], do this"
- Mistake / "stop doing X"
- Number + payoff ("3 ways to…")
- Curiosity gap / open loop
- Result-first ("I went from X to Y")
- Question that names the pain

Rules: the context line under 10 words, the whole hook one or two spoken sentences, no fluff, no hashtags. Never invent a result, number or personal claim; use only brand/facts.md, and write {{needs cleared fact}} where one is missing. For each hook give the three beats labelled (context / lean / snapback), a 3-5 word on-screen text that states the context, and what the first frame shows so the context is also in the picture. Then do the read-back test on each: read its first one or two sentences alone; is the context clear at once, is there a reason to lean in, does it snap back? Drop any hook that fails and replace it. Mark the 3 you'd test first and say why in one line.
```

**Memory tip:** if present, point Claude at the brand's `brand/swipe.md` and `brand/log.md` (they may be empty at first) - "use the hooks that performed best there as the pattern." Hooks grounded in *your* winners beat generic ones.

**Tip:** Always generate 10 and test 2-3. The hook you love is rarely the one that wins.
