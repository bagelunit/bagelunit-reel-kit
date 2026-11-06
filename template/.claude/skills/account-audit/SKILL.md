---
name: account-audit
description: >
  Audit an Instagram account (the brand's own, or competitors) and find the reels that beat the account's
  own median, by arithmetic. Use when the user says "audit my account", "find my best reels", "what worked
  for my competitors", "find outliers", "3x rule". Scraping is OFF by default: with an export the person
  already has it works offline; fetching from Apify only runs when brand/brand.json autopilot.scrape is true.
user-invokable: true
argument-hint: "[handles, or a path to a scraper export]"
metadata:
  author: Susanoo
  version: "1.0.0"
  category: research
---

# Account audit and outliers

The step that tells you what to make next: which reels beat an account's own normal, and why.

## What you need
- The brand workspace (a copy of `template/`), so results go into `brand/swipe.md`.
- EITHER an export of posts you already have (`--json file`), OR Apify with the brand owner's permission:
  `brand/brand.json` -> `autopilot.scrape` is `true`, and the owner has saved an Apify token to
  `~/.config/susanoo-reels/apify.key`. Never ask for, print, read aloud or search for the token.

## Steps
1. **Pick accounts.** The brand's own handle, plus 6 to 12 others: about 4 in the niche and a bit ahead, 4 adjacent,
   2 to 4 big ones for format ideas only. Stay within about 10x of the brand's followers. Ask if unsure.
2. **Check the cost first.** `python3 ./.claude/skills/account-audit/outliers.py --handles a,b,c --dry-run`
   prints the plan and the price (about $2.70 per 1,000 posts on the free plan). Tell the owner the number. Every real fetch is logged in `brand/spend.csv` (date, accounts, results, estimated cost) and the next plan shows the running total.
3. **Run it.** `... --handles a,b,c --limit 30 --out brand/swipe.md` (or `--json export.json`).
   It computes each account's median over its last 12 reels and each reel's ratio to it:
   3x or more = STUDY, 1.5x to 3x = NOTE, below = ignore. Fewer than 5 reels = no ranking.
4. **Explain the winners.** For each STUDY reel (and the brand's own top reels), say in plain words why it worked:
   the hook, the format, the length. Use `/reel-analyzer` on the ones worth a full teardown (the person supplies
   the file, or `/reel-sources` fetches it when scraping is on).
5. **Turn it into the next reels.** Copy the shape (hook, structure, length), never the video, script, colours,
   characters or prompts. Every number in a script still has to be in `brand/facts.md`.

## Own stats for the review (step 14)
`python3 ./.claude/skills/account-audit/outliers.py --handles <the brand's handle> --all --out brand/stats.md` (or `--json` on an export) lists every recent reel with views, likes, comments and its ratio to the brand's own median. `/analytics-readout` and the review step read `brand/stats.md`; the reel's row in `brand/log.md` can then point to it. It appends a dated block each time, so history stays.

## Honest limits
- Views only; the scraper does not give retention, saves or shares.
- A median over 12 reels is rough. A brand-new account has no median yet.
- Scraping a platform can break its rules. That is the owner's decision, per brand.
