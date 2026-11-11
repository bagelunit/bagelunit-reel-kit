---
name: reel-loop
description: >
  The self-improving reel loop: read what the brand's trial reels did (skip rate, average watch time, views), say what to change,
  make the next reel from that, and take it to the owner for approval, again and again until a reel breaks out. Use on /reel-loop,
  or when the user says "run the loop", "what did my trial reels teach us", "make the next reel from the numbers", "keep improving
  until something goes viral", "self-improving pipeline". It learns and makes; the owner still approves every reel and its time.
user-invokable: true
argument-hint: "[status | next | one cycle]"
metadata:
  author: BagelUnit
  version: "1.0.0"
---

# Reel loop: post, read, improve, repeat

Instagram trial reels show a reel to non-followers first, so the skip rate and watch time of a trial reel are an honest read of the
hook and the middle on a cold audience. This skill turns those numbers into the next reel, and repeats until one breaks out.

**What it never does.** It never posts, schedules or approves by itself (house rule 11). Every reel in the loop goes through the fact
check, Gates A, B and C, a `/reel-review` of **90 or more**, and the owner's one yes to that reel's time and platforms
(`/reel-posting`). The loop is what Claude does between those yeses, not a way around them. It uses only cleared facts (rule 1).

## One cycle

1. **Read.** Run `node .claude/skills/content-calendar/loop.mjs`. It refreshes the numbers first if Instagram is connected
   (`node .claude/skills/content-calendar/refresh.mjs`), then writes `brand/loop.md` (the brief) and `brand/loop.json` (the state).
   Read the brief aloud in two or three lines: the status, what the judged reels show, and the one change it recommends.
2. **Stop if it says so.**
   - `needs-numbers`: connect Instagram or add `brand/insights.csv` rows (`/content-calendar connect instagram`, `/analytics-readout`), then post the first trial reel. Nothing else to learn from yet.
   - `waiting`: reels are out but too fresh to judge (72 hours, 500 views). Say when the next one can be read. Do not make a new reel just to fill the time.
   - `found`: a reel broke out (views at 5 times the median or more, at least 5,000, skip rate no worse than the median; the brand can change these in `brand.json` -> `loop`). Tell the owner, name the reel and what it did differently, and offer the next reel in the same format on a new topic. Do not keep changing everything.
   - `stalled`: the last six judged reels did not beat the best skip rate before them. Say so and offer a bigger change (a new format, goal or topic from `/comment-mining`) rather than another small tweak.
3. **Change one thing.** The brief names the variable: the hook, the middle, the format or the topic. Change only that one, so the next result teaches something. A hook change is an A/B test: `/ab-hook-tester` makes two versions to post as trial reels.
4. **Make it.** `/viral-hook-writer` (triple hook), `/reel-scripter`, then `/reel-factcheck` and Gate A, then `/bagelunit-reels` for the voice, visual plan (Gate B), build and export, `/reel-review` until it scores 90 or more, the caption and cover, Gate C. Each gate is a question to the owner.
5. **Post as a trial reel, with the owner's yes.** `/reel-posting` with the trial option (`node publisher/scripts/schedule.mjs reels/<slug> --from-plan --trial`, preview first). One question shows the time and platforms; the answer is the owner's yes.
6. **Wait, then read again.** After 72 hours, run step 1. Add the reel's numbers to `brand/insights.csv` if Instagram is not connected. Record a finished A/B test (`/ab-hook-tester record`).

## Rules

- Never call something a win from fewer than 500 views, and never from one reel: say "not enough yet".
- Report what the numbers show and what they do not. A breakout can be luck; say it is one reel.
- Never invent numbers, never round a skip rate in the reel's favour, never skip the review or a gate to keep the loop moving. If the loop is blocked (an uncleared fact, no numbers, the owner has not answered), stop and say what is blocking.
- Everything stays in this brand's folder. Read other accounts only through `/account-audit` and `/content-calendar competitors`.
