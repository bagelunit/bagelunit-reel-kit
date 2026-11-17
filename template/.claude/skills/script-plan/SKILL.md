---
name: script-plan
description: >
  Plans a reel's script before a word of it is written: one viewer, one promise, the viewer's question, and a beat outline
  where every promise has a payoff and every list item has a "so what". Use on /script-plan, or as stages 1 and 2 of
  /reel-scripter. Writes reels/<slug>/script-brief.md and script-plan.json and checks them. It writes no script.
user-invokable: true
argument-hint: "[idea or reel folder]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# Script plan: decide what the reel says before writing it

Scripts stop making sense when the writer starts with sentences. This step decides the viewer, the promise and the order of
beats first, then checks the outline by code. A plan is cheap to change; a voiced script is not.

## 1. The brief (`reels/<slug>/script-brief.md`)
Read `brand/voice.md`, `brand/facts.md`, `brand/log.md` (the last two angles and goals) and the one goal chosen for this reel
(`docs/hook-and-review-playbook.md` section 2). Write, in plain words, each on its own line:

- **Viewer:** ONE person, by role and situation ("a shop owner who sells online"), never "everyone" or two audiences.
- **Viewer question:** what that person is asking at second 0.
- **Promise:** one sentence, 20 words or fewer, naming what they will know or be able to do by the end.
- **Takeaway:** the last line as an action or a decision they can make this week.
- **Goal and angle:** one goal; an angle that is not the same as the last reel's.
- **Facts to use:** each cleared fact (its `facts.md` row) and where it goes: **voice** (at most 4 numbers and 6 names), **screen**
  (exact labels, eligibility lists, menu paths, qualifiers) or **caption**. Precision that a listener cannot hold goes on screen.
- **Terms the viewer may not know:** each with a plain swap.

## 2. The outline (`reels/<slug>/script-plan.json`)
```json
{ "viewer": "...", "promise": "...", "announced_count": 3,
  "beats": [
    { "id": 1, "role": "context", "says": "one claim", "so_what": "", "opens": ["can-i-trust-it"], "closes": [], "facts": ["F3"], "words": 14 },
    { "id": 2, "role": "item",    "says": "one claim", "so_what": "what it means for the viewer", "opens": [], "closes": [], "facts": ["F4"], "words": 24 },
    { "id": 5, "role": "payoff",  "says": "the answer to the promise", "so_what": "what to do", "opens": [], "closes": ["can-i-trust-it"], "facts": [], "words": 20 } ] }
```
Roles: `context`, `lean`, `snapback`, `setup`, `item`, `payoff`, `ask`. Rules the outline must meet:
- every loop a beat `opens` has a later beat that `closes` it, and the payoff beat answers the promise;
- `announced_count` equals the number of `item` beats (3 items for 30 to 40 s; 5 at most, only if each is 18 words or fewer), and the hook says the count;
- every `item` has a `so_what`; a beat whose claim is outside the promise is a tangent: cut it;
- the word budgets add up to the size band: about 110 to 130 spoken words for 40 s, never more than 45 s at the brand's pace (this is the one place the band is set; the other skills quote it).

## 3. Check it
`node ~/.claude/skills/bagelunit-reels/tools/kit.mjs script reels/<slug>` (with no `script.txt` yet it checks the plan alone).
Fix every ERROR. Then show the owner six lines: the viewer, the promise and the beats. Wait for a yes or a change. For a news
reel, keep it to 3 items; do not skip this step.

## 4. Record the goal and angle
Write the **Goal** and **Angle** lines into `reels/<slug>/approvals.md` next to the Gate A heading (the example reel shows where).
If this reel came from a row in `brand/plan.md`, write the reel's folder name (the slug) into that row's **Reel (folder)** cell now, so the calendar, the log and the scheduler can find the reel from its plan row.
This skill is the one place that writes them; `/reel-posting` and the log row read them from there.

Inputs: the idea or reel folder. Outputs: `script-brief.md`, `script-plan.json`, the Goal and Angle lines in `approvals.md`, and the slug in the plan row's Reel (folder) cell.
Next: `/viral-hook-writer` writes 10 hooks that open the loop this outline closes, then `/reel-scripter` (draft stage) writes the
script from this plan.
