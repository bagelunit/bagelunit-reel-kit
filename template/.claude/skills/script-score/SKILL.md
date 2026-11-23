---
name: script-score
description: >
  Scores a reel script out of 100 against a written rubric, in a fresh context that did not write it, and records the line
  Gate A reads. Use on /script-score, as stage 8 of /reel-scripter, after the script lint and the cold read pass.
user-invokable: true
argument-hint: "[reel folder]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Script score (the retention bar is 90)

The retention score reaches 90 or the script is redone and rescored. Never raise a number to reach 90.
The human score is a floor, not this bar: `brand.json` -> `writing.human_score_min` (default 70).

Run `kit score reels/<slug>` first (lint, the human floor, fact structure, and this same weighting where a program can see it).
If `kit score` fails, do not give the script a 90. You may move One viewer or Payoff only when you quote the line the program missed.

## Must-pass first (any fail = not ready, no score)
1. No unclosed loop. A tease is allowed when this reel pays it off, or a note names the next episode (`# Next: Series name episode 3`). Bait that never pays off fails.
2. The announced count equals the items said (script lint). "Three bills" plus One, Two, Three counts.
3. Fits the size: words in the band and estimated seconds at or under the brief (script lint).
4. One viewer: the cold read's "who is it for" matches the brief.
5. No `{{needs cleared fact}}`, and the script-scope fact check passes (`/reel-factcheck`). Facts stay a hard pass or fail. Dramatic framing is allowed. An invented fact is not.
6. The human score meets its floor (`/ig-human`; default 70). Below the floor, run `/humanizer` and score again. Do not chase 90 on this number.

## Scored (1 to 5 each, weighted)
The weights follow what decides whether a short reel is watched: the first line, then whether the tease pays off.

| Criterion | Weight | A 5 | A 2 |
|---|---|---|---|
| Hook | 25 | line 1 scores 70 or more on `hookscore.py`; the viewer's stake is in the first words; context, lean, snapback, and the snapback is paid off | a greeting, a preamble, or a hookscore under 50 |
| Open loop and payoff | 20 | every tease is closed in this reel with something the viewer can use, or the script names the next episode that closes it; the best item is last | a tease with no answer, or "watch till the end" and then nothing |
| Pace | 15 | most spoken lines are 6 to 14 words, none over 22, and a new stat, twist or picture lands about every 3 to 5 seconds | even long lines, or a stretch with nothing concrete |
| Payoff, usable this week | 15 | the last beat answers the promise in words the viewer can act on this week | it ends on observations |
| One viewer | 10 | every beat serves the promise for the same person | a second audience appears |
| Clear aloud | 10 | no unexplained term; no sentence over 28 words; no spoken menu path or URL; every "it/this/they" has a clear referent | jargon or a run-on |
| Call to action | 5 | one ask that matches the goal: save, follow, send it to a named kind of person, or Comment WORD where WORD is in `cta.tested_keywords` or `cta.keywords` | no ask, or a keyword that was never tested |

Score = sum(weight x score / 5), rounded down. A hookscore under 50 cannot be a 5 on Hook. Score the first line with `python3 .claude/skills/ig-reel/hookscore.py --hook "the first line"`. `kit score` runs the same file.

## Run it
1. Start a **fresh agent** that did not write the script. Give it the brief, `script.txt`, `build/script-lint.md`, `build/coldread.md`, the `kit score` printout and this rubric. It
   returns the must-pass results, each criterion's score with the quote that earned it, the weakest criterion, and the smallest fix.
2. If a must-pass fails or the score is under 90: apply the smallest fix, re-run `kit score`, `/script-coldread` and this score on the new text. After two
   passes with no gain, stop and show the owner what blocks it.
3. When it passes, get the script's fingerprint with `node ~/.claude/skills/bagelunit-reels/tools/kit.mjs script reels/<slug> --hash` and write under Gate A in `reels/<slug>/approvals.md`:
   `Script review: meets the bar (NN/100; weakest: <criterion>) [script <fingerprint>]`. `kit gate <reel> record --gate A` refuses without a line of 90 or more
   that carries the fingerprint of the script as it is now, and without the human score at its floor (only the owner overrides, with `--skip-script-review "reason"` or `--skip-human "reason"`).
   A score belongs to one text: any change to the spoken words afterwards, including a fact-check fix, cancels it and sends the script back through the lint, the cold read and this score.
