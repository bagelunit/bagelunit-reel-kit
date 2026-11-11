---
name: content-factory
description: >
  The whole setup in one command - run the reel factory end to end, one reel at a time. Claude takes a
  proven viral format, studies it, writes an original hook + script in your voice, builds the finished
  reel locally with /bagelunit-reels, writes the caption + hashtags, and prepares the comment→DM lead loop,
  stopping at each approval gate. This is the orchestrator that runs the other skills in order, and it
  only does the steps the brand's autopilot permissions allow. Use ONLY when the user says "run the
  content factory", "set up my whole content system" or "build my content machine". Do not use it for a
  plain "make me a reel": that goes to /bagelunit-reels.
user-invokable: true
argument-hint: "[your niche/topic + (optional) a viral reel URL to model + your @handle + a CTA keyword]"
metadata:
  author: BagelUnit
  version: "1.1.0"
  category: content
---

# Content Factory - the whole setup, one command

The Content Factory is the *orchestrator*: it runs the other skills in order so you get a finished,
on-brand reel plus the lead-loop drafts - not just notes. Point it at a topic (and optionally a viral reel
to model) and it drives the pipeline for one reel, one step at a time, within the permissions the brand
owner has given.

> The individual skills each do one job. This one runs them **in sequence** and hands the output of each
> step to the next.

## Gate (read first)

Read `brand/brand.json` -> `autopilot` first (`post`, `dm_replies`, `scrape`, `paid_renders`; all `false`
by default) and run only the steps whose permission is `true`:

- **Without `scrape`:** skip Apify. Ask for a file or transcript the person supplies (rules 7 and 14).
- **Without `paid_renders`:** render locally with `/bagelunit-reels` only. No Runway or Seedance. With it on,
  show the cost first and get the OK for that reel.
- **Without `post`:** stop at the finished mp4 and the caption. A person posts (rule 11).
- **Without `dm_replies`, or without a tested keyword in `cta.tested_keywords`:** no keyword CTA and no
  live DM flow (rule 4). End on a save or follow ask and say why.

These still apply to every reel, whatever is on: ask the style first (Print, 3D, Talking head), run
`budget.py` before Gate A, `/reel-factcheck` before Gate A and before Gate C, `/reel-review` on every
draft and final, and Gates A, B and C from CLAUDE.md rules 10 and 13. Only cleared facts from
`brand/facts.md` (rule 1). Weekly batches follow CLAUDE.md section 3c (up to `brand.json` -> `batch.max_reels` reels, default 3; goals may repeat; angles may not in a batch of up to five, and in a bigger one no two reels next to each other share one).

## The pipeline (what runs, in order)

```
0. GATE+TOOLS   permissions ......... read autopilot, ask the style, check which tools the person has connected
1. MEMORY       brand memory ........ read brand/voice.md + brand/log.md (your voice + past winners)
2. FIND+STUDY   teardown ............ study a proven reel (Apify only if scrape is on; otherwise a file or transcript you supply)
3. HOOK         viral-hook-writer ... 10 scroll-stopping hooks for the first 1-3s, ranked
4. SCRIPT       reel-scripter ....... tight 30-45s ORIGINAL script, then /reel-factcheck, budget.py, Gate A
5. BUILD+RENDER /bagelunit-reels ...... Gate B, then the REAL rendered mp4 (Runway/Seedance only if paid_renders is on)
6. CAPTION      caption-and-hashtags  caption + tiered hashtags + a first comment, then /reel-review and Gate C
7. POST         prepare and pause ... prepares the post and pauses; a person posts (autopilot.post true still needs the owner's OK for that reel)
8. LEADS        comment-responder ... draft the keyword rule (live only if dm_replies is on and the keyword is tested)
9. COMPOUND     brand memory ........ note what worked in brand/log.md after the owner confirms
```

**This runs for real by calling the tools directly - it is a harness, not a description.** The creative
steps (3, 4, 6) are Claude; the execution steps use the underlying tools:
- **Step 0 (once, at onboarding):** read `autopilot` and ask the style. Connecting any tool (Apify,
  Composio/Instagram, a render service) is the person's own action, and only for a permission that is on.
  If a needed tool is not connected, say what to connect and wait; never search for, print or reuse a key.
- **Step 2** uses Apify only if `autopilot.scrape` is true (cost shown first). Otherwise work from a file
  or transcript the person supplies.
- **Step 5** renders the real mp4 locally with `/bagelunit-reels`. Seedance via Runway only with
  `paid_renders` on, cost shown first. See [reel-builder](../reel-builder/SKILL.md) for the shot harness.
- **Step 7** prepares the post and pauses. With `autopilot.post` true it still needs the owner's OK for
  that reel. Nothing is posted by default.
- **Step 8** drafts the keyword rule with [comment-responder](../comment-responder/SKILL.md). It goes live
  only through the owner's own setup, with `dm_replies` on and a tested keyword.

If a tool or permission is missing, do the creative pipeline (script + plan + local render) and tell the
user exactly what is off. Never fake a render or a post.

## When to use
You want the *whole* reel + lead-loop drafts, not one piece. For a single step, call that skill directly
(e.g. just `/viral-hook-writer`).

## What you'll need
- Your **niche/topic** and **audience**.
- Optional but better: a **viral reel URL** or a transcript/file of one, to model the format (step 2).
- Your **@handle**, your **voice** (a line or two, or `brand/voice.md`), and a
  **CTA keyword** (e.g. `GUIDE`) if the DM auto-reply has been tested.

## Instructions

Run this prompt (or invoke `/content-factory`). Claude moves through the pipeline, pausing at the approval
gates and before anything leaves the computer.

```
You are my content factory. Run the pipeline for one reel and produce a finished, on-brand reel
plus the lead-loop drafts. Work in this order, showing me each step's output before moving on:

CONTEXT
- Niche/topic: [what it's about]
- Audience: [who it's for]
- Model this viral reel (optional): [URL, file or transcript]   ← if none, suggest 3 proven formats in my niche, I'll pick
- My @handle: [@you]   ·   My voice: [a line, or "use brand/voice.md"]   ·   CTA keyword: [e.g. GUIDE, only if tested]

PIPELINE
0) GATE+TOOLS: read brand/brand.json autopilot and run only the steps whose permission is true. Ask me the
   style (Print, 3D or Talking head). Connecting any tool is my own action, only for a permission that is
   on; if something is missing, tell me and wait. Never search for or reuse a key.
1) Brand memory: read brand/voice.md and brand/log.md for my voice + past winners.
2) FIND+STUDY: tear down the model reel (Apify only if scrape is on; otherwise use the file or transcript
   I supply) → hook, beats, pacing, visuals.
3) viral-hook-writer: 10 hooks, ranked; I'll pick one (or you pick the strongest).
4) reel-scripter: a 30-45s ORIGINAL script in MY voice on that structure (never a copy). Run
   /reel-factcheck, run budget.py, then take it to Gate A.
5) /bagelunit-reels: Gate B (visual plan), then a local render → a real mp4. Show me the beat table + the
   rendered reel. No Runway or Seedance unless paid_renders is on and I OK the cost.
6) caption-and-hashtags: caption + tiered hashtags + first comment, with my CTA keyword only if it is
   tested. Run /reel-factcheck (final) and /reel-review, then Gate C.
7) POST: prepare the post and pause. If post is off, stop at the mp4 and caption and I post it myself.
   If post is on, you still wait for my OK for this reel.
8) LEADS: with comment-responder, draft the keyword rule (reply + DM). Live only if dm_replies is on and
   the keyword is tested.
9) Brand memory: note the winning hook/format in brand/log.md after I confirm.

If a tool or permission is off, do the creative steps and the local render and tell me exactly what is
off - never fake the render or the post.

RULES
- Model the FORMAT, never the words - original script in my voice (copies get buried by IG Originality).
- The hook carries 80%: front-load it, payoff in the first ~1.5s, works on mute.
- Every line gets a visual; no static "text on a card" for a demo line.
- Only cleared facts from brand/facts.md. No invented numbers or results.
- The public comment reply NEVER contains a link - the link goes in the DM only.
- Be honest: the CTA must deliver exactly what it promises.
```

## Angles to rotate
When you make several reels over time, rotate the angle so the feed stays varied: **proof** (only with a
real, cleared result from `brand/facts.md`), **how-to** (the steps), **contrarian** ("you're doing X
wrong"). One goal and one angle per reel. In a weekly batch, up to `batch.max_reels` reels (default 3) and no two share an angle
(more than five: no two next to each other; CLAUDE.md section 3c). Note every winner in `brand/log.md` so the next batch starts from what already
worked for *you*.

## Memory makes it yours
Generic in → generic out. Fill `brand/voice.md`, `brand/swipe.md` and `brand/log.md` first so every step pulls
from **your** proven hooks, voice, and swipe file - that's the difference between "AI content" and content
that sounds like you.

## Honesty (non-negotiable)
- **Original only.** Model the technique; write your own words. Re-uploads/copies get reach-suppressed.
- **The CTA must be real.** If the reel says "comment GUIDE and I'll send it," the DM must actually send it
  (that's what [comment-responder](../comment-responder/SKILL.md) is for), and only once the keyword is tested.
- **No links in public replies** - the resource goes in the DM.
- **Nothing is posted, scheduled or sent by Claude** unless the owner turned that permission on and says OK for that reel.
