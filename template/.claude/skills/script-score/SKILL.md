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

# Script score (the bar is 90)

The same rule as `/reel-review`: anything scored reaches 90 or it is redone and rescored. Never raise a number to reach 90.

## Must-pass first (any fail = not ready, no score)
1. No unclosed loop or promise (script lint and cold read (d)).
2. The announced count equals the items said (script lint).
3. Fits the size: words in the band and estimated seconds at or under the brief (script lint).
4. One viewer: the cold read's "who is it for" matches the brief.
5. No `{{needs cleared fact}}`, and the script-scope fact check passes (`/reel-factcheck`).
6. The human score is 90 or more (`/ig-human`; `brand.json` -> `writing.human_score_min`, default 90).

## Scored (1 to 5 each, weighted)
| Criterion | Weight | A 5 | A 2 |
|---|---|---|---|
| Promise and payoff match | 20 | the last beat answers the opening's promise in words the viewer can act on; the cold retell has the same payoff | it ends on observations or an ask about something else |
| One idea, one viewer | 15 | every beat serves the promise for the same person | a second product, place or audience appears |
| Flow and logic | 15 | each line follows from the one before; questions are answered next; lists are announced and numbered | a question gets an unrelated answer; an item appears after "that's it" |
| So-what per beat | 15 | each item says what it means for the viewer or what to do | facts in a row with no consequence |
| Clear aloud | 15 | no unexplained term; sentences mostly 6 to 22 words, none over 28; no spoken menu paths; every "it/this/they" has a clear referent | jargon, run-ons, fragments with nothing to point to |
| Hook | 10 | full triple hook; the viewer or their stake is named in the first words; the snapback is aimed at that viewer | context late, snapback for a different person |
| Usable ending and fitting ask | 10 | the takeaway is doable this week; the ask matches the goal and the content | "save this for X" where X is not what the reel was about |

Score = sum(weight x score / 5), rounded down.

## Run it
1. Start a **fresh agent** that did not write the script. Give it the brief, `script.txt`, `build/script-lint.md`, `build/coldread.md` and this rubric. It
   returns the must-pass results, each criterion's score with the quote that earned it, the weakest criterion, and the smallest fix.
2. If a must-pass fails or the score is under 90: apply the smallest fix, re-run `kit script`, `/script-coldread` and this score on the new text. After two
   passes with no gain, stop and show the owner what blocks it.
3. When it passes, get the script's fingerprint with `node ~/.claude/skills/bagelunit-reels/tools/kit.mjs script reels/<slug> --hash` and write under Gate A in `reels/<slug>/approvals.md`:
   `Script review: meets the bar (NN/100; weakest: <criterion>) [script <fingerprint>]`. `kit gate <reel> record --gate A` refuses without a line of 90 or more
   that carries the fingerprint of the script as it is now (only the owner overrides, with `--skip-script-review "reason"`).
   A score belongs to one text: any change to the spoken words afterwards, including a fact-check fix, cancels it and sends the script back through the lint, the cold read and this score.
