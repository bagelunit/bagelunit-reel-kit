---
name: reel-review
description: >
  Review a finished or draft reel against the kit's own quality bar and write a one-line verdict
  before Gate C. Use ONLY when the user asks to "review this reel", "run the review", "score this
  draft", or by name (/reel-review). It is a check on a built video, not a script or hook writer:
  inside the loop it runs at the end of step 10 (verify) and again on the final at Gate C.
user-invokable: true
argument-hint: "[reel folder, e.g. reels/<slug>, or a video file]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Reel review: one honest verdict before Gate C

Look at the reel the way a viewer on a phone would, then write down what you saw. Judge what is on
screen and in the audio, not how hard it was to make. When two scores are close, take the lower one.

## What you need
A draft or final mp4 (usually `reels/<slug>/build/draft.mp4` or `out/<name>.mp4`) plus the reel's
`script.txt`, `STORYBOARD.md` and `build/words.json`. Pull frames and timing from the CURRENT video,
never from an old stills folder.

## How to look
1. Frames: the `earshot` `sheet` tool (contact sheets) or `ffmpeg` frames at 0, 0.5, 1, 2 and 3 s,
   then one every 2 to 3 s to the end.
2. Timing: the `earshot` `timeline` tool for what happens when, and `measure` for loudness and peaks.
3. Words: `build/words.json` against what is on screen.

If earshot is not installed, use `ffmpeg` for frames and `ffprobe` or the kit's sound report for the
numbers, and say which checks you could not make.

## Part 1: must-pass checks
Each is pass or fail. A fail is named in the verdict with the second it happens.

1. **Facts.** Every number, claim, name and price on screen, in the voice and in the caption is in
   `brand/facts.md`. No `{{needs cleared fact}}` left. A current `Fact check (final): PASS` from
   `/reel-factcheck` is in `approvals.md` (`kit facts <dir> check --scope final` shows if it is out of date).
   No current PASS, or a FAIL, fails this check.
2. **Words match.** The spoken words and on-screen text are the approved script (typos aside). The
   brand's `voice.never_say` words are not spoken.
3. **Frame 0 and the hook.** The eight-point checklist in `docs/hook-and-review-playbook.md`.
4. **Safe zones and size.** Nothing important in the bottom 300 px or right 120 px. Text about 40 px or
   more. Nothing clipped, overlapping or placeholder.
5. **Handle and payoffs.** The handle is visible. Typed lines finish and hold before the cut. A payoff
   stays on screen at least a second.
6. **Sound.** Voice clear on top of effects; overall near the loudness the kit targets, true peak
   under the limit; real sound step done (not synthesised effects). Report the numbers.
7. **Honesty.** No other company's logos or footage without rights, no invented product screens with
   a real brand on them, nothing copied from another creator's reel.

## Part 2: scored checks (1 to 5)
Score whole numbers. 5 is the best work the brand has shipped, 3 is acceptable, 1 is broken.

| Check | A 5 looks like |
|---|---|
| Picture says the words | Each shot shows exactly what is being said at that moment, concretely |
| Movement on the words | Beats land on their spoken words; nothing sits still for more than about a second |
| Pace and variety | Shot lengths and layouts vary; something new arrives every 2 to 4 s |
| Hook strength | A stranger would stop for it, and it still works on mute |
| Payoff | The promise is delivered, specific and usable straight away |
| Ending | Ends on a clean line or loops back; no drag, no "thanks for watching" |
| Brand fit | Sounds, looks and reads like this brand, not a generic template |
| Cover and caption | Cover reads at 150 px wide; caption's first line is under 125 characters, one ask |

The reel **meets the bar** when every must-pass check passes and the scored average is 4.0 or more.
It is **close** at 3.5 to 3.9 with all must-passes passing. Below that, or any must-pass failing, it
is **not ready**.

## Part 3: the verdict
Write exactly one line, then up to three fixes (most valuable first), each with a second and the
smallest possible change:

```
Review: meets the bar (4.3/5; weakest: ending drags after 27 s).
Review: close (3.7/5; must-pass 4 failed: handle hidden by the caption band at 12 to 15 s).
Review: not ready (must-pass 1 failed: "3x faster" is not in facts.md).
```

Save it in `reels/<slug>/approvals.md` under the Gate C heading, and add the scores to the reel's row
in `brand/log.md`. A reel that is not ready still goes to the approver with the line attached, so the
person decides.

## Honesty
This is a judgement from frames, numbers and the transcript, not a prediction of views. Say plainly
what you could not check (for example, no way to hear the mix). Never claim a result the files do not
show.
