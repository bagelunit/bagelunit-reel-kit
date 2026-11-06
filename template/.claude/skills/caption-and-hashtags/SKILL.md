---
name: caption-and-hashtags
description: >
  Write the caption, hashtag set, and first comment for a reel or post. Use ONLY when
  the user asks for it by name (/caption-and-hashtags) or for a hashtag set and first comment
  as a standalone job. Captions inside a reel workspace come from /ig-caption and the kit's
  final step, so do not trigger on a plain "caption".
user-invokable: true
argument-hint: "[what the reel/post is about]"
metadata:
  author: Susanoo
  version: "1.0.0"
  category: content
---

# Caption & Hashtags

Write the caption, a tiered hashtag set, and a first comment that drives saves, follows, and reach.

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
2. HASHTAGS - 12-15, tiered: a few broad (1M+), several mid (100k-1M), several niche (<100k). Put them in the first comment, not the caption.
3. FIRST COMMENT - the hashtags + a question that sparks replies (comments boost reach).
4. ALT TEXT - one accessible description of the video.

Match the niche's language. No emojis-as-bullets unless on-brand.
```

**Memory tip:** point Claude at the brand's `brand/swipe.md` and `brand/log.md` - "use the hooks that performed best there as the pattern." Hooks grounded in *your* winners beat generic ones.

**Tip:** The first line of the caption is a second hook. Make it earn the "…more" tap.
