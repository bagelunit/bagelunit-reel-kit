---
name: analytics-readout
description: >
  Reads your reel insights and explains in plain English what to make more of and what to stop -
  no jargon.
  Use when the user says "explain my analytics", "what do my numbers mean", "read my insights", "how did this reel do".
user-invokable: true
argument-hint: "[paste your insights, or give a file path (brand/insights.csv or a CSV export)]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Analytics Readout - your numbers, in plain English

Use when the owner gives numbers or asks what worked. Input: the insights (pasted, a file or
`brand/insights.csv`). Output: a plain-English readout against the brand's own median. Next step: the one
change to try in the next reel (`/reel-loop` turns it into a test).

## Where the numbers live

If the brand connected Instagram (`brand.json` -> `dashboard.instagram`, see `docs/dashboard.md`), run `node .claude/skills/content-calendar/refresh.mjs --no-telegram` first: it pulls the latest numbers and adds each reel's 7-day row to `brand/insights.csv` by itself, so ask the owner only for what the API does not give (follows per reel). This brand keeps one row per posted reel in `brand/insights.csv` (columns: reel, date, views, reach, avg_watch_time_s, skip_rate, likes, comments, saves, shares, follows). When the owner gives new numbers, add the row (never overwrite old rows), read it back, then read the whole file so the comparison uses this brand's own median. Where to find each number: `docs/after-posting.md`.

## When to use
The owner is looking at insights and cannot tell what to do differently.

## What you'll need
Your reel or account insights. Paste them in, export them from the platform, or read `brand/insights.csv` (the raw numbers, one row per reel) and `brand/stats.md` (the median summary `/account-audit --all` writes from them) (written by `/account-audit --all`).

## Instructions
Give Claude the input and run this.

```
You are my analyst. Here are my insights: [paste]. My goal right now is: [reach/saves/leads/follows].

1. THE METRIC THAT MATTERS for that goal - and tell me which numbers to stop staring at.
2. VS MY MEDIAN: every figure judged against my own baseline, not anyone else's screenshot.
3. WHERE IT BROKE: if retention data exists - a drop at ~3s is a hook problem, at ~12s a middle problem,
   at the end a CTA problem. Name which.
4. TWO ACTIONS. Not twelve. The two that would move the metric in point 1.
5. WHAT I CAN'T TELL from this data, stated plainly.

Every number must come from what I pasted. State the number of rows. Under 10 reels, say it is a small sample and give no firm conclusions; under 20, say the sample is thin. If something isn't there, say so - do not estimate.
```

## Retention readout (add this section when `brand/insights.csv` has avg_watch_time_s and skip_rate)

This part is arithmetic on the brand's own file, done by Claude reading the CSV (there is no script for it). Run it after the main readout, or when the owner asks "why do people leave", "which hook worked" or "what should I test". Real numbers only.

1. **Count first.** Say how many reels have a value for `avg_watch_time_s` and `skip_rate`. Under 10 reels: say "small sample (N reels)", show the numbers, and give no firm conclusions; the tests in step 5 become guesses to try, not findings. Skip a reel that has no value for a column; never fill it in.
2. **Length.** For each reel get its length in seconds: `ffprobe -v error -show_entries format=duration -of csv=p=0` on its final mp4 in `out/` (or `build/draft.mp4`), or the last word time in `build/words.json`. If a length cannot be found, leave that reel out of this step and name it. Table, one row per reel: reel, length, avg_watch_time_s, watch-through (avg_watch_time_s divided by length, as a percent, can pass 100 on a loop), skip_rate, views.
3. **Against the median.** Work out the account median of watch-through and of skip_rate across the rows, and show both. List the reels whose watch-through beats the median, and the reels below it. Say which is the middle value for each when the count is even. Do not compare with outside benchmarks.
4. **What the best and worst had in common.** Take the three reels with the highest watch-through and the three with the lowest (fewer if there are fewer). For each, read the first line of `reels/<slug>/script.txt` (and, if it is there, the first on-screen text from `build/on_screen_text.txt`). If a reel has no `script.txt`, say so and leave it out. Compare plainly: length of the first line in words, whether it opens with a number, a question, a claim or a story, and whether the person or a prop is on screen at frame 0. Only report a pattern that appears in at least two of the three best and none or one of the three worst (or the reverse); otherwise say "no clear pattern in these reels".
5. **One to three single-change tests.** Each test changes ONE thing in the next reel and says what to measure: for example "open on the number instead of the question" measured by skip_rate against the median skip_rate. Name the number it should move and by how much it would have to differ to count as a signal given the sample size. Hand the first test to `/reel-loop`.
6. **State what is missing:** reels with no length, no script, or no skip_rate, and that retention curves (the second-by-second drop) are not in the CSV unless the owner pastes them.

**Honesty:** No invented figures, no industry benchmarks presented as my data. 'Not enough signal' is a valid
answer.

**Next:** `/reel-review` to check a specific reel against what the numbers say, and `/comment-mining` to see what your audience says about the reels that did well or badly.
