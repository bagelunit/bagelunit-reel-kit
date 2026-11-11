---
name: account-audit
description: >
  Audit an Instagram account (the brand's own, or competitors) and find the reels that beat the account's
  own median, by arithmetic. Use when the user says "audit my account", "find my best reels", "what worked
  for my competitors", "find outliers", "3x rule". With the brand's Instagram connected through Unified or
  Facebook Login it reads other business and creator accounts through Meta's official API (business discovery);
  with an export it works offline; fetching from Apify only runs when brand/brand.json autopilot.scrape is true.
user-invokable: true
argument-hint: "[handles, or a path to a scraper export]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: research
---

# Account audit and outliers

The step that tells you what to make next: which reels beat an account's own normal, and why.

## What you need
- The brand workspace (a copy of `template/`), so results go into `brand/swipe.md`.
- ONE of these, best first:
  - **Meta's official API (no scraping, no cost).** When the brand's Instagram is connected with `"login": "unified"`
    or `"facebook"` (`docs/connect.md`), `node .claude/skills/content-calendar/research.mjs competitor <username>`
    reads that account's followers and its latest posts with views, likes and comments, and writes
    `brand/research/<username>.csv` for `outliers.py --csv ... --owner <username>`. It works for business and creator
    accounts only (Meta's rule); a personal account says so. Instagram Login cannot do this (the script says so).
    The same files (and `brand/research/accounts.json`, each account's followers) feed `/content-calendar how-often`,
    which suggests how often to post.
  - An export of posts you already have.
  - Apify with the brand owner's permission:
  `brand/brand.json` -> `autopilot.scrape` is `true`, and the owner has saved an Apify token to
  `~/.config/bagelunit-reels/apify.key`. Never ask for, print, read aloud or search for the token.
- About the export: `--json file` takes a scraper export (a list of posts). An Instagram Insights export saved as CSV goes in with `--csv file --owner <handle>`; it needs a views column and a date or timestamp column (any capitalisation), and `--owner` defaults to "account". `--csv` works offline, like `--json`.

## Steps
1. **Pick accounts.** The brand's own handle, plus 6 to 12 others: about 4 in the niche and a bit ahead, 4 adjacent,
   2 to 4 big ones for format ideas only. Stay within about 10x of the brand's followers. Ask if unsure.
2. **Official API first.** If the connection allows it, run `research.mjs competitor <handle>` for each account,
   then `outliers.py --csv brand/research/<handle>.csv --owner <handle> --out brand/swipe.md`. No cost, no
   scraping. If Meta gives no view counts for an account, say so and compare likes and comments instead. Skip
   steps 2b and 3 for the accounts this covered.
2b. **Apify: check the cost first.** `python3 ./.claude/skills/account-audit/outliers.py --handles a,b,c --dry-run`
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
`python3 ./.claude/skills/account-audit/outliers.py --csv brand/insights.csv --owner <the brand's handle> --all --out brand/stats.md` (the brand's own numbers, no scraping; or `--handles <handle>` with `autopilot.scrape` on, or `--json` on an export) lists every recent reel with views, likes, comments and its ratio to the brand's own median. `/analytics-readout` and the review step read `brand/stats.md`; the reel's row in `brand/log.md` can then point to it. It appends a dated block each time, so history stays.

## Honest limits
- Views only; neither Meta's business discovery nor the scraper gives another account's retention, saves or shares.
- A median over 12 reels is rough. A brand-new account has no median yet.
- Scraping a platform can break its rules. That is the owner's decision, per brand.
