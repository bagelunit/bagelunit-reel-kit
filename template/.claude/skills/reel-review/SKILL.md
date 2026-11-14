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
3. **Frame 0 and the hook.** The triple hook (section 0 of `docs/hook-and-review-playbook.md`): the context lands at once in the voice, the first frame and the on-screen text; a lean follows; then a contrarian snapback that the rest of the reel pays off. Then the eight-point frame-0 checklist (section 1) on the real frames.
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
| Hook strength | A full triple hook (context at once, lean, snapback); a stranger would stop for it, and it still works on mute |
| Payoff | The promise is delivered, specific and usable straight away |
| Ending | Ends on a clean line or loops back; no drag, no "thanks for watching" |
| Brand fit | Sounds, looks and reads like this brand, not a generic template |
| Cover and caption | Cover reads at 150 px wide; caption's first line is under 125 characters, one ask |

**Calm scene styles.** A reel in a calm style (its `reel.json` "style" is in `CALM_STYLES` in the kit's
`tools/kitcore.py`, today `deep-zoom`; `kit pace` prints "calm style" for it) is slow on purpose, so
two rows are scored against the calm bar instead. Every other row, and must-pass 3 (frame 0 and the
hook), keep the full bar: a calm reel still has to stop a stranger at frame 0.

| Check (calm style) | A 5 looks like |
|---|---|
| Movement on the words | A slow camera move or build is always under way; each beat lands on its spoken word; nothing is frozen for more than about 3 s |
| Pace and variety | A new scene, reveal or label arrives every 4 to 8 s; scene layouts vary; the slowness reads as chosen, not stuck |

**The score** is out of 100: the average of the eight scores (1 to 5) divided by 5, times 100, rounded
(an average of 4.5 is 90). Round down, never up.

The reel **meets the bar** when every must-pass check passes and the score is **90 or more**. Below
90, or any must-pass failing, it is **not ready**, and a not-ready reel is **redone and reviewed again
until it reaches 90**: it does not go to the approver as it is, and `kit gate <reel> record --gate C`
refuses it. The loop:

1. Name what pulled the score down (the lowest checks, most valuable first).
2. Make the smallest changes that fix them (re-cue, re-cut, re-time, rewrite the caption, remake the
   cover), rebuild, and run every check again from the start, on the new file. Never carry an old score
   over to a changed reel.
3. Score again, with the same strictness. Never raise a score to reach 90.
4. Stop only at 90 or more. If two passes in a row gain nothing, or the cause is outside the reel (a
   fact that is not cleared, a take the person has to re-record), say exactly what is blocking and ask
   the approver; do not loop forever and do not write a score the files do not support.

## Part 3: the verdict
Write exactly one line, then up to three fixes (most valuable first) when the score is under 100, each
with a second and the smallest possible change:

```
Review: meets the bar (92/100; weakest: ending drags after 27 s).
Review: not ready (84/100; weakest: hook has no snapback, handle hidden by the caption band at 12 to 15 s).
Review: not ready (must-pass 1 failed: "3x faster" is not in facts.md).
```

The number in brackets is required: Gate C reads it. Only the last line counts, so after a redo write
a new verdict line (never edit the old one) and keep the earlier ones as the history of the passes.

Save it in `reels/<slug>/approvals.md` under the Gate C heading, and add the scores to the reel's row
in `brand/log.md`. Only a line that meets the bar goes to the approver. Only the owner may send a reel under 90 to
Gate C anyway (`--skip-review "reason"`, written into the record).

## Honesty
This is a judgement from frames, numbers and the transcript, not a prediction of views. Say plainly
what you could not check (for example, no way to hear the mix). Never claim a result the files do not
show.
