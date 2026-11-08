---
name: reel-predict
description: >
  Estimate how a finished or draft reel is likely to hold viewers before it is posted, and say in plain
  words where people may drop off. Use ONLY when the user asks to "predict", "estimate retention", "check
  where viewers will drop", "will this hold people", or by name (/reel-predict). It is not a script or hook
  writer and not the quality review: run it after the draft exists, next to reel-review.
user-invokable: true
argument-hint: "[reel folder, e.g. reels/<slug>]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Reel predict: measurements first, then an honest reading

Nobody can know how a reel will perform before it is posted. This skill gives you the measurable facts about the
video, and, only when this brand has calibrated a model on its own past reels, a number with a range. Everything
else is judgement and is labelled that way.

## Steps
1. Make sure `build/draft.mp4` or `build/video.mp4` exists (the tool does not read `out/`; for a finished mp4 elsewhere, copy it to `build/draft.mp4`). It needs `reel.json` in the folder. For a video outside the kit run `python3 ~/.claude/skills/bagelunit-reels/tools/predict.py <dir>` directly. The words stats are n/a without `build/words.json`.
2. Run `kit predict <reel folder>`. It measures the video if `build/measure.json` is missing, then prints either
   the measurements alone or, with a fitted model, a prediction with a range. It writes `build/measure.json` and
   `build/predict.json`.
3. Look at the contact sheets in `build/measure/`: `first3s.jpg` (the opening at half-second steps), `body_1.jpg` (and
   `body_2.jpg` on longer reels; frames just after cuts), `last3s.jpg`. Say what a stranger would see in the first second.
4. Read `build/measure.json` and describe, in plain words, where viewers are most likely to drop. Cite seconds.
   Look for:
   - **Late first word:** `first_word_s` over about 1 s with nothing compelling on screen before it.
   - **Flat opening:** `energy_first3` low, or `energy_first3_ratio` under about 1, or `first_strong_change_s` late or null.
   - **Static stretches:** every pair in `static_stretches` (2 s or more with little change), with the words spoken then
     from `build/words.json`.
   - **Dead air:** `silence_stretches` in the middle of the reel.
   - **Pace:** `cuts_per_min` and `energy_per_s` dips; `words_per_s_first5` very low.
   - **Sound:** `loudness_lufs` far from the kit's target, or a wide `loudness_range_lu`.
5. Write three to five lines: the likeliest drop point first, then what would fix it, each with a second and the
   smallest change.

## How to label it
- No fitted model (the output says "No calibrated model yet"): everything you say about drop-off is **judgement
  from measurements**, not a prediction. Do not state any watch time, percentage or skip rate. Say so in the note.
- Fitted model: quote the printed numbers and range exactly, say how many reels it was fitted on, and repeat its
  warning if it printed one. A prediction is a description of this brand's past reels, not a promise.
- Never invent a number, never compare to other accounts, and say what you could not check (for example, no way to
  hear the mix).

## Where to log it
Add a block next to the reel review, under the same Gate C heading in `reels/<slug>/approvals.md`:

```
Predict: judgement only (no fitted model). Likeliest drop: 6.1 to 12.0 s static, hold on "..." ; first word at 2.5 s.
Predict: model on 12 reels says about 8.8 s average watch (8.4 to 9.1), skip 49 %; typical miss 0.4 s.
```

Add the one-line result to the reel's row in `brand/log.md`. A weak result does not block the reel; it goes to the
approver with the line attached.

## Calibration
The numbers only mean something once the model has learned from this brand's own reels.

1. In Instagram, open Insights for your reels and export the per-reel table, or copy it into a spreadsheet and save
   as CSV. Keep one row per reel with these columns (names can vary, formats are forgiving):
   `reel` (the reel's folder name or video file name), `avg_watch_time_s` (`0:09` or `9.4`), `skip_rate` (`41.2%`),
   `views` (`18.4K`).
2. Make sure each of those reels has been measured: `kit measure <reel folder>` writes `build/measure.json`.
3. Run `kit calibrate insights.csv --project-root reels`. It needs at least 8 measured reels and refuses with fewer,
   saying how many more. It fits a small, penalised linear model (ridge) and reports a leave-one-out error in plain
   words, for example "typically off by 4 s of watch time", plus a warning when that is large or no better than
   guessing the average.
4. The model is saved to `~/.config/bagelunit-reels/predict-model.json` and is used by every later `kit predict`.
   Refit every time you add reels. Its error shrinks slowly: expect a rough hint at 8 to 15 reels, and something
   steadier past 30.

It never leaves the computer and does no network calls.
