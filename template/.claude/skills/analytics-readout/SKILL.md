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

Reads your reel insights and explains in plain English what to make more of and what to stop - no
jargon.


## Where the numbers live

This brand keeps one row per posted reel in `brand/insights.csv` (columns: reel, date, views, reach, avg_watch_time_s, skip_rate, likes, comments, saves, shares, follows). When the owner gives new numbers, add the row (never overwrite old rows), read it back, then read the whole file so the comparison uses this brand's own median. Where to find each number: `docs/after-posting.md`.

## When to use
You're looking at insights and can't tell what to do differently.

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

Every number must come from what I pasted. State the number of rows. Under 20 rows or reels, say it is a small sample and give no firm conclusions. If something isn't there, say so - do not estimate.
```

**Honesty:** No invented figures, no industry benchmarks presented as my data. 'Not enough signal' is a valid
answer.

**Next:** `/reel-review` to check a specific reel against what the numbers say, and `/comment-mining` to see what your audience says about the reels that did well or badly.
