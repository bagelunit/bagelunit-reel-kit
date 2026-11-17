---
name: script-coldread
description: >
  A cold read of a reel script: a fresh reader who sees only the spoken words, as a viewer would hear them, says what it is
  about, who it is for, what to do after, what it promised and whether it delivered, and which lines did not make sense.
  Use on /script-coldread, as stage 7 of /reel-scripter, and again after any change to the spoken words.
user-invokable: true
argument-hint: "[reel folder]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Script cold read

Inputs: `script.txt` (spoken words only). Outputs: `build/coldread.md`. Next step: `/reel-factcheck` and `/ig-human`, then `/script-score`.

The writer cannot hear their own gaps: the brief fills them in. So a reader with no brief hears the script once.

## Run it
1. Run `node ~/.claude/skills/bagelunit-reels/tools/kit.mjs script reels/<slug>` first. A cold read of a script with ERRORs wastes a call.
2. Start a **fresh agent** (the Agent tool, `subagent_type: "general-purpose"`; use the cheaper model alias, such as `model: "haiku"`, if it is available; it needs no tools). Give it ONLY the
   spoken words (the lines of `script.txt` with notes removed) and this prompt. Do not give it the brief, the plan, the facts, the storyboard or the topic:

```
You are a busy person scrolling Instagram with the sound on. You are listening to a 40 second reel once, with no way to rewind. Below is
exactly what the voice says. Answer in this exact format, short and literal, and do not be kind. If something did not make sense, say so.

(a) What is this about, in one sentence?
(b) Who is it for?
(c) What should I do after hearing it?
(d) What did the opening promise or tease? Was each of those answered later? Quote the line that answers each, or say "never answered".
(e) Lines I had to hear twice or did not follow (quote them).
(f) Words or names I did not know.
(g) Anything that did not connect to what came just before (quote it).
(h) Retell it in three sentences, as you would to a friend.

THE REEL:
<the spoken words>
```
3. Save its answer in `reels/<slug>/build/coldread.md`.

## Compare with the brief (you do this, not the reader)
Read `script-brief.md` and check:
- (a) matches the **promise**, (b) matches the **viewer**, (c) matches the **takeaway**;
- (d) says every teaser was answered; any "never answered" is a failure;
- (e) and (g) are empty; (f) words are explained in the script or cut.

Any miss goes back to the script: smallest fix, re-run `kit script`, then this read again on the whole new text (never only the changed line).
After two rounds with no gain, stop and show the owner what blocks it. This read is a model, not the audience: if its retell (h) is not what the owner
wanted to say, that is a finding too. Show the owner (a) and (h) with the script at Gate A.
