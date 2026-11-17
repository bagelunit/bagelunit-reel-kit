---
name: reel-scripter
description: >
  Turn an idea or a chosen hook into a full 30 to 45 second reel script: hook, value beats, payoff and
  call to action, with on-screen text. Use when the user asks for a reel script or to "script this",
  and to draft reels/<slug>/script.txt before Gate A in this workspace; the voiced, rendered build
  then runs through /bagelunit-reels.
user-invokable: true
argument-hint: "[idea or hook to script]"
metadata:
  author: BagelUnit
  version: "2.0.0"
  category: content
---

# Reel Scripter

Turn one idea into a postable 30 to 45 second script that makes sense heard once. It is a flow, not one prompt: a script written
in one pass leaves promises unpaid, lists with the wrong count and facts with no point. Each stage saves its output in the reel's
folder, so a fault is caught at the cheapest point. Stages 1 to 7 cost no voice credits.

## About posting
If the script talks about how the brand posts, describe the brand's real setup, not the questions a skill asks: the platforms are fixed per brand (`brand.json` -> `posting.platforms`) and the times are planned ahead in `brand/plan.md`, then adjusted by the numbers. Never write "I pick the time and tick the platforms", and say nothing about posting that the owner has not cleared in `brand/facts.md`.

## The stages
| # | Stage | Who | Saves | Passes when |
|---|---|---|---|---|
| 1 | Brief | `/script-plan` | `script-brief.md` | one viewer, one promise of 20 words or fewer, a takeaway the viewer can do, 4 spoken numbers or fewer, every qualifier assigned to screen or caption |
| 2 | Beat outline | `/script-plan` | `script-plan.json` | `kit script` finds every loop closed, every item with a so-what, the count and the word budget right |
| 3 | Hooks | `/viral-hook-writer` | the 10 hooks, top 3 marked | the hook opens the loop the outline closes; the viewer or their stake is named in the first words; the snapback is aimed at that viewer |
| 4 | Draft | this skill | `script.txt` | every sentence serves one beat; no sentence carries two |
| 5 | Lint | code | `build/script-lint.md` | no ERROR (`node ~/.claude/skills/bagelunit-reels/tools/kit.mjs script reels/<slug>`) |
| 6 | Coherence edit | this skill | `script.txt` | lint clean; the whole script re-read, never only the changed line |
| 7 | Cold read | `/script-coldread` | `build/coldread.md` | a reader who sees only the words retells the promise, the viewer and the takeaway, and finds nothing unanswered or confusing |
| 8 | Score | `/script-score` | the Gate A line in `approvals.md` | 90 or more, every must-pass passes |
| 9 | Facts, credits, human score, owner | `kit facts`, `/reel-factcheck`, `budget.py`, `/ig-human`, then Gate A | the existing records | as before |

## How to draft (stage 4)
Write from the outline, beat by beat, in this order: the triple hook (`docs/hook-and-review-playbook.md` section 0: context at once, the lean, the contrarian snapback, in the first 1.5 s), the setup, the items, the payoff, the ask.
- **Say the count and number the items out loud** ("Three things. One... Two... Three..."), and no list has more than five items.
- **Every item has a so-what**: what it means for the viewer, or what to do. A fact on its own is not an item.
- **One thing per sentence**, mostly 6 to 22 words, none over 28; read it aloud, and cut 20%. A fragment is allowed only when it is a clear thought.
- **Plain words.** A term the viewer may not know is explained next to it or kept on screen only. Never speak a menu path, a link or a command: say what it does and put the path on screen.
- **Precision goes on screen or in the caption**, not in the voice: eligibility lists, jurisdictions, exact labels and "may not" qualifiers. Keep one spoken qualifier only when it changes what the viewer does.
- **Open a loop only if the outline pays it**, and pay it in words the viewer can use. If the opening teases "the biggest one", name it where the outline says.
- Spoken facts only from `brand/facts.md`; where one is missing write `{{needs cleared fact}}`, which blocks the script until cleared. Never invent a result, number or personal claim.
- Length: about 85 words for 30 s, 110 to 125 for about 40 s, at most 130 for 45 s (check the brand's own pace in `brand/voice.md`; the lint measures it from past reels). The CTA is the one the brand picked for this reel (`brand.json` `cta`); offer a keyword only if it is in `cta.tested_keywords`.
- Output a two-column script as before (spoken line | on-screen text) plus a one-line visual per beat, saved so `script.txt` holds only the spoken words (notes start with `#`, `//` or `[`).

## Editing rules
- After stage 4 the spoken words change only by going back through stages 5, 7 and 8. A fact-check fix that changes spoken words does the same.
- Fix by the smallest change, then re-read the whole script from the top.
- A pasted script from the owner is used word for word, but still run stages 5 and 7 and tell the owner what they found.

**Memory tip:** point Claude at `brand/swipe.md` and `brand/log.md`: use the hooks that performed best there as the pattern.

**At Gate A show, in this order:** the viewer and promise (two lines), the script, the cold reader's one-sentence summary and three-sentence retell, the score line, the estimated seconds. One script per question where possible; a batch hides gaps.
