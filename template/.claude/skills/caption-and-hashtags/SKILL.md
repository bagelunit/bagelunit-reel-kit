---
name: caption-and-hashtags
description: >
  Write the caption for a reel or post in the kit's three-block layout: the caption, then up to 5 hashtags
  (Instagram's limit, picked from what has worked for this brand), then a line of search keywords, with one
  blank line between each. Use when the user asks for a caption, hashtags or keywords, and at the final
  step of every reel in this workspace (before Gate C). Only cleared facts from brand/facts.md.
user-invokable: true
argument-hint: "[what the reel/post is about]"
metadata:
  author: BagelUnit
  version: "1.2.0"
  category: content
---

# Caption & Hashtags

Write the caption, with its hashtags inside it, that drives saves, follows, and reach.

## When to use
The video's done - now you need the copy that gets it shared and the hashtags that get it found, without looking spammy.

## The layout (three blocks, one blank line between them)

```
Your first line, which earns the "more" tap.

A few short lines of value.
One ask (save, follow or comment).

#tagone #tagtwo #tagthree #tagfour #tagfive

a search phrase, another phrase, a third phrase, a fourth, and so on
```

Save it as `reels/<slug>/out/caption.txt`. Then run `node .claude/skills/caption-and-hashtags/caption.mjs check <slug>` and fix what it names (`fix` tidies the spacing by itself and never changes a word). It must pass before Gate C.

## The hashtag rules
- **At most 5, on their own line after the caption, never inside the caption text and never in a comment.** Instagram limits a caption to 5 hashtags (it moved down from 30), and the kit's scheduler refuses a sixth. Aim for 3 to 5. TikTok: 3 to 5 in the caption. YouTube: `#Shorts` plus 2 or 3 topic tags in the description.
- **Pick them from evidence, not from taste.** First run `node .claude/skills/content-calendar/hashtags.mjs`. It reads the brand's own posts and the researched accounts' posts and writes `brand/hashtags.md`: which tags went with posts that beat their account's own median, with the counts. Choose from the tags that fit THIS reel's topic. Where the file is thin (few posts, one account, no research yet), say so plainly and choose by topic; never present a guess as data.
- **Mix, don't stack.** One or two broad tags for reach, the rest specific to the reel's topic, and the tag the brand already uses for its own series when it has one. Never repeat the same five tags on every reel: keep one or two steady and rotate the others, so `brand/hashtags.md` can show which ones help.
- **No invented numbers.** Never state a tag's size or follower count unless the owner supplies it. Do not use a tag that does not describe the reel (no `#fyp` unless the owner asks), and no banned words from `brand.json` -> `writing`.

## The keyword line
- **What it is:** 8 to 15 plain search phrases in one comma-separated line, last in the caption, after the hashtags. They are the words people type into Instagram's search (for a home baker: "sourdough starter for beginners", "how to feed a starter"), which is how a reel gets found by someone who does not follow you. No `#` signs, no sentences, no full stops.
- **Where the phrases come from:** run `node .claude/skills/caption-and-hashtags/caption.mjs keywords <slug>`. It lists candidate phrases counted from this reel's script, the researched accounts' captions and the audience research (`brand/research/demand-*.md`). Add the tool, topic and problem words the reel really covers, in the way an ordinary person would search for them (the question, the tool name plus "tutorial" or "for beginners", the result they want).
- **Only what the reel covers.** Every phrase must describe this reel. A phrase for something it does not show or teach is not a keyword, it is stuffing, and it breaks the facts rule (house rule 1). No other company's name unless the reel is really about it, no result or number claims, nothing from `brand.json` -> `writing` that is banned. More than 15 phrases reads as stuffing and the check refuses more than 20.
- **Vary them.** Keep the one or two phrases that name the brand's subject on every reel; change the rest with the topic.

## Tailored to the brand's niche

Everything here comes from THIS brand, never from a generic list. `brand.json` -> `niche` holds `topic` (what the content is about), `audience` (who watches), `keywords` (3 to 8 phrases that audience searches for) and `tags` (1 or 2 steady hashtags).
- **First use (niche empty):** ask with a question block (AskUserQuestion), offering guesses from `brand/voice.md` and the brand's website as options, and the person types the real answer under Other: what the content is about, who watches, 3 to 5 phrases they would search for, 1 or 2 steady hashtags. Write them to `brand.json` -> `niche` only after the person confirms; never fill them from your own knowledge of the niche.
- **Every time after:** read `niche`, then the reel's `script.txt`. The caption is in the voice of `voice.md` and speaks to the `audience`; the hashtags are the brand's steady `tags` plus the ones its own data and researched accounts support (`brand/hashtags.md`) that fit this reel; the keyword line starts from the niche `keywords` that fit this reel, plus phrases from the script, the researched captions and the audience research. A brand in another niche gets different tags and different phrases from the same process.
- **Refresh the niche** when the brand's focus shifts (the person says so, or `/going-viral` and the loop show a different topic winning): update `brand.json` -> `niche` with their confirmation.

## What you'll need
What the reel is about, the platform, the goal (saves / follows / comments / link), and the brand's niche (`brand.json` -> `niche`, set on first use). Optional: your handle and brand voice, and a recent `brand/hashtags.md`.

## Instructions
Run this prompt:

```
You are my social copywriter. Write the post copy for this reel.

Reel: [what it's about]   Platform: [Reels/TikTok/Shorts]
Niche: [brand.json niche: topic, audience, keywords, tags]
Goal: [saves / follows / comments / DMs]
Hashtag evidence: [brand/hashtags.md, or "none yet"]

Give me:
1. CAPTION - a strong first line (it's the only line shown before "more"), then 2-4 short lines of value, then one clear CTA. No hashtags in this block.
2. HASHTAGS - on their own line after a blank line: 3 to 5 (Instagram allows 5 at most), chosen from the evidence above and this reel's topic.
3. KEYWORDS - after another blank line, one line of 8 to 15 search phrases separated by commas, taken from the script and the candidate list, each one describing this reel. No # signs.
4. NOTES (not part of the caption file) - one line per hashtag saying why it is there ("on 6 posts from 3 researched accounts, typically 2x their median" or "fits the topic, no data yet"). Nothing about follower counts unless the owner supplied them.
5. ALT TEXT - one accessible description of the video.
6. OPTIONAL FIRST COMMENT - only a neutral question that sparks replies (no claims, no promises, no numbers, and no hashtags).

Match the niche's own language and the audience's: the words THEY use, not the industry's jargon unless the audience uses it. No emojis-as-bullets unless on-brand. The CTA is a keyword only if the word is listed in brand.json cta.tested_keywords; otherwise a save or follow ask, per cta.style. Never invent a result, number or personal claim; use only brand/facts.md, and write {{needs cleared fact}} where one is missing.
```

**Memory tip:** if present, point Claude at the brand's `brand/swipe.md` and `brand/log.md` (they may be empty at first) - "use the hooks that performed best there as the pattern." Hooks grounded in *your* winners beat generic ones.

**Tip:** The first line of the caption is a second hook. Make it earn the "…more" tap.
