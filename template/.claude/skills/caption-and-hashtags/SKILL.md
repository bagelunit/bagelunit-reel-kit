---
name: caption-and-hashtags
description: >
  Write the caption, hashtag set and first comment for a reel or post. Use when the user asks for a
  caption, hashtags or a first comment, and at the final step of every reel in this workspace (before
  Gate C). Only cleared facts from brand/facts.md.
user-invokable: true
argument-hint: "[what the reel/post is about]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Caption & Hashtags

Write the caption, a hashtag set, and a first comment that drives saves, follows, and reach.

## When to use
The video's done - now you need the copy that gets it shared and the hashtags that get it found, without looking spammy.

## What you'll need
What the reel is about, the platform, your niche, and the goal (saves / follows / comments / link). Optional: your handle and brand voice.

## Instructions
Run this prompt:

```
You are my social copywriter. Write the post copy for this reel.

Reel: [what it's about]   Platform: [Reels/TikTok/Shorts]   Niche: [niche]
Goal: [saves / follows / comments / DMs]

Give me:
1. CAPTION - a strong first line (it's the only line shown before "more"), then 2-4 short lines of value, then one clear CTA. No hashtag soup in the caption.
2. HASHTAGS - 12 to 15, grouped broad / mid / niche by judgement; do not state follower counts unless the owner supplies them. They go in the first comment, not the caption. If the workspace's example caption (reels/_example/caption.txt) uses a different format, for instance a few hashtags at the end of the caption, follow that format instead.
3. FIRST COMMENT - the hashtags + a neutral question that sparks replies (no claims, no promises, no numbers).
4. ALT TEXT - one accessible description of the video.

Match the niche's language. No emojis-as-bullets unless on-brand. The CTA is a keyword only if the word is listed in brand.json cta.tested_keywords; otherwise a save or follow ask, per cta.style. Never invent a result, number or personal claim; use only brand/facts.md, and write {{needs cleared fact}} where one is missing.
```

**Memory tip:** if present, point Claude at the brand's `brand/swipe.md` and `brand/log.md` (they may be empty at first) - "use the hooks that performed best there as the pattern." Hooks grounded in *your* winners beat generic ones.

**Tip:** The first line of the caption is a second hook. Make it earn the "…more" tap.
