---
name: ab-hook-tester
description: >
  Runs a real A/B test on a reel's hook: two genuinely different openings, each built as its own approved version,
  posted as Instagram trial reels (shown to non-followers first), compared on one number, and the winner shared and
  remembered. Use when the user says "give me two hooks to test", "A/B this hook", "which opening should I use",
  "hook variants", "trial reel", "test two versions", or to record a test's result.
user-invokable: true
argument-hint: "[reel folder or idea] | record [reel folder]"
metadata:
  author: BagelUnit
  version: "2.0.0"
  category: content
---

# A/B hook test: two hooks, one variable, a real answer

One variable changes (the hook: the first line spoken and the first words on screen). Everything else stays the same:
script after the hook, visuals after the first shot, cover, caption, length, posting time. If anything else changes, it
is two different reels, not a test.

Ask every choice with a question block (AskUserQuestion), the recommended option first.

## 1. Two hooks (before Gate A)

Write two hooks that use DIFFERENT mechanisms, not one hook reworded:
- **Hook A:** the mechanism (for example result first), the exact on-screen text and the spoken line.
- **Hook B:** a different mechanism (for example objection first), the same.

Then: the hypothesis (what we learn if A wins, and if B wins), what stays the same, the deciding number, and the views
each version needs. Deciding number, in this order of preference: **skip rate** (people who left in the first 3 seconds,
lower is better; it measures the hook), then **average watch time**, then views. Views needed: half the brand's median
views from `brand/insights.csv`, at least 300 each. Only cleared facts (`brand/facts.md`); write `{{needs cleared fact}}`
where one is missing. If both hooks pull the same lever, say so and replace one.

Show both hooks at Gate A in one question: "Test both (Recommended)", "Use A only", "Use B only", "Change something".
Say what version B costs: a second voice (about the script's characters again, `budget.py` shows it) and a second render.

## 2. Record the test and make version B

On "Test both":
1. In version A's folder (`reels/<slug>/`), write `test.json`:
   ```json
   {"title": "<reel title>", "variable": "hook", "metric": "skip", "trial": true, "sample": null,
    "started": "<today>", "variants": [{"label": "A", "reel": "<slug>", "hook": "<hook A>"},
    {"label": "B", "reel": "<slug>-b", "hook": "<hook B>"}], "winner": null}
   ```
   `metric` is `skip`, `watch`, `views`, `saves` or `shares`; `sample` empty means the dashboard works it out.
2. Make version B as its own reel folder: `kit start reels/<slug>-b --style <same style>`, copy A's `script.txt`,
   `reel.json` (name it `<slug>-b`) and visual plan, then change only the hook line and the first shot's words.
3. Record Gate A in both folders (`kit gate <reel> record --gate A --note "A/B test, version A"` and `"... version B"`).
4. From here each version runs the normal loop. One Gate B covers both (the plan is the same apart from the first shot).
   Each final gets its own Gate C, so each file has its own fingerprint.

The dashboard's "A/B tests" section shows both versions side by side from now on.

## 3. Post both as trial reels

Use `/reel-posting` for each version. Trial reels go to non-followers first, so your followers never see two versions.
- **By hand:** in the Instagram app, turn on the trial option when sharing the reel. Post both versions within the same
  hour so they meet the same kind of audience. Choose to share to followers yourself later (do not let Instagram do it
  automatically, so only the winner reaches them).
- **With a connected publisher:** it sends `trial_params` with `graduation_strategy` `MANUAL` (see `docs/auto-post.md`).
- Each version's posting line says it is a trial: `- 2026-11-10 18:02 Posted as a trial reel on @handle: <link>`. The
  link is what matches each version to its numbers.

## 4. Read and record the result (`/ab-hook-tester record`)

The dashboard calls it once each version has the views it needs: a winner when the deciding number differs by 10% or
more, otherwise no clear winner. It is a rule of thumb, not statistics; say so.
1. Show both versions' numbers and the dashboard's verdict. Ask: "B won: record it (Recommended)", "Too early, wait",
   "No clear winner".
2. On a winner: tell the owner to share the winning trial reel to their followers in the Instagram app (from the
   reel's trial results), and to leave the other as a trial. Set `"winner": "B"` and `"decided": "<today>"` in
   `test.json`.
3. Add a row to `brand/tests.md` (date, reel, what was tested, hook A, hook B, deciding number, result, lesson in one
   line, for example "objection-first beat result-first on skip rate, 31% against 44%"). The Planner and the hook
   writers read this file, so the next reels start from what has won for this brand.

**Honesty:** one variable, one deciding number, and enough views before calling it. A test that changed two things
proves nothing.

**Next:** [reel-scripter](../reel-scripter/SKILL.md) for the script, [reel-posting](../reel-posting/SKILL.md) to post.
