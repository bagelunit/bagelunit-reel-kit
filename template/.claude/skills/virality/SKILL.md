---
name: virality
description: >
  Plan and review short-form videos (Instagram Reels, TikTok, YouTube Shorts) so they actually get
  watched, with a first 3 seconds that does something unexpected. Works for any topic or niche. Use
  when the user wants a reel planned so it gets watched, asks why a post flopped or got no views, or
  asks for /virality.
---

# Virality

This skill is about how a short video earns its first 3 seconds. It works for any niche: cooking, fitness, money, travel, pets, software, a local shop, a craft. Nothing here depends on what the brand makes. The topic always comes from `brand/brand.json` -> `niche`, `brand/voice.md` and `brand/facts.md`, never from this file.

> The rules below are patterns, not promises. Test each one against this brand's own median (`docs/hook-and-review-playbook.md`), and never put a figure from this file in a script or caption (house rule 1).

## Rule 1: The hook is the whole game

Most viewers decide in the first 3 seconds.
If nothing happens in those 3 seconds, nothing else you made matters.

**In the first 3 seconds, something has to happen on screen.**
Not a title card.
Not a logo fading in.
Not "Hi guys, today I want to talk about".
An event the eye cannot ignore.

### What strong openings look like (illustrative, in different niches)

| Niche | Frame 0 to 3s |
|---|---|
| Home baking | A loaf is cut open and steam rolls out. The words build: "Why your bread is dense". |
| Fitness | A rep is mid-air, the camera snaps to the bar path, a counter climbs: "Your squat is losing you 20%". |
| Personal finance | A bank balance ticks down line by line as each subscription is crossed out: "Three charges you forgot". |
| Travel | A map pin drops, a route draws itself across the screen: "Lisbon in 48 hours, no car". |
| Pet care | A dog freezes at a closed treat jar, the lid pops: "Stop doing this at feeding time". |
| Software or a tool | The real screen types the request, the result appears: "Do this in one click". |

### What weak openings look like

- A still title card with small text.
- An abstract background (tunnels, clouds, gradients) with nothing the viewer recognises.
- A black or almost empty frame 0.
- Thin, low-contrast text.
- A hook about the brand, the maker or "the future", not about the viewer.

### The patterns

**What tends to win:**

1. **Something the viewer already knows, on frame 0.** The real object, place, screen or problem from the brand's own world, so they know at once what this is about and that it is about them. Use plain text for other companies' names; no third-party logos (house rule 9).
2. **Something moves or happens on frame 0.** A counter climbs, a pin drops, a loaf is cut, a price is crossed out. Never a still card.
3. **The claim builds word by word, in sync with the voice**, big and high contrast, readable on mute.
4. **It promises a result for the viewer's own situation.** Their kitchen, their budget, their dog, their trip, their work.
5. **Curiosity or contrarian words.** "Stop doing this", "nobody tells you", "this is why", "the real reason".
6. **The real thing appears fast.** The real product, place, food or screen, not a stand-in.

**What tends to lose:**

1. Abstract backgrounds with nothing the viewer recognises.
2. A static card. The frames at 0.5s and 3s look the same.
3. An empty or black frame 0.
4. Small, low-contrast text.
5. Being about the maker, the topic in general or "the future" instead of the viewer's own situation.

### The checklist (every hook must pass all eight)

1. **Frame 0 is already moving.** No fade-in, no black frame, no empty frame.
2. **Frame 0 shows something the viewer instantly recognises** (the object, the place, the screen, their problem), not abstract art.
3. **The biggest element owns at least 40% of the frame** and moves from frame 1.
4. **Something striking happens before 3 seconds:** it breaks, builds itself, collapses, opens, or a number races and locks.
5. **The claim lands around 1.2 to 1.6 seconds**, word by word, big, high contrast. Never at 0, never after 3.
6. **The first spoken word is within 0.5 seconds**, and it is the subject, not filler.
7. **It works on mute.**
8. **It is about the viewer's own situation**, not about you or the topic in general.

If a hook does not pass all eight, rewrite it before writing anything else.

## Rule 2: Talk about their thing, not yours

Name the viewer ("you", "your") in the first line, and say what happens in their own life.

- Weak: "7 facts about sourdough".
- Better: "Your sourdough is dense because of this one step".

The viewer is the main character.
The topic, the product or the tool is the vehicle.

## Rule 3: Every line is shown, never just said

- The visual changes on every spoken line.
- Each sentence gets its own mechanism on screen: something that is made, moved, counted, opened or broken.
- Nothing on screen is ever static. If two frames a second apart look the same, add motion.
- Text appears word by word, in sync with the voice.
- Show real proof: real footage, real numbers from `brand/facts.md`, real results. A fake number gets caught and kills trust.
- With stock footage, pick the clip where something is visibly happening (a person reacting, celebrating, surprised), not a still scene. Search for the action or emotion, not the noun. Cut the person out and put the words behind them.

## Rule 4: Give them a reason to comment

- A keyword ask ("Comment GUIDE and I'll send it") is allowed only if the word is listed in `brand.json` -> `cta.tested_keywords` (the DM auto-reply was tested from a second account). In a reel workspace a keyword CTA needs a tested keyword; otherwise end on a save or follow ask, per `cta.style`.
- The keyword must deliver something real in the DM. If you promise it, send it.
- The link goes in the DM, never in a public comment.
- Keep the reel short and put the depth in the caption.

## Rule 5: Rotate the angle

The same hook framing twice in a row fatigues fast.
Rotate between:

- **Result first:** open on the outcome, then show how.
- **Self-proving:** the video proves its own claim by existing or by showing the thing happen live.
- **Contrarian:** go against the usual advice in the brand's niche.
- **Pain first:** name the specific problem the viewer has right now.
- **Something breaks:** the thing on screen literally fails, then gets fixed.

## How to use this skill

When the user asks for a reel, a hook, or a script:

0. In a reel workspace, ask the style first (Print, 3D, or Talking head) as one multiple-choice question, and pick one goal and one angle for the reel.
1. Read `brand/brand.json` -> `niche` (topic and audience). If it is empty, ask who the video is for and what they should get, in one sentence.
2. Write **three** hooks. For each, describe frame 0 and every half second up to 3 seconds, and check all eight points of the checklist.
3. Pick the strongest and say why, naming the winning pattern it uses.
4. Write the script line by line. Next to every line, write what happens on screen. No line without a visual.
5. Write the comment keyword and the real thing the DM delivers.
6. Write the caption: problem, solution, the steps, then the ask (a tested keyword, or save or follow).
7. In a reel workspace: run /reel-factcheck on the script (and budget.py) before Gate A, and record the gates, goal and angle in `reels/<slug>/approvals.md`. Numbers never go in a script or caption unless they are in `brand/facts.md`.

When the user asks why a post flopped:

1. Look at frame 0, 0.5s, 1s, 2s and 3s only.
2. Compare against the weak patterns: abstract background, static card, empty frame 0, small text, about the maker instead of the viewer.
3. Check Rules 2, 3 and 4.
4. Give the one change that would have mattered most, then a rewritten hook that passes the checklist.

## Output format for a reel plan

```
WHO IT'S FOR: ...
HOOK (0-3s):
  0.0s  [what is on screen, already moving, recognisable]
  0.5s  [first spoken word] ...
  1.2s  [the striking event lands] + [the claim, word by word]
  3.0s  [transition into the body]
CHECKLIST: 1 ✓ 2 ✓ 3 ✓ 4 ✓ 5 ✓ 6 ✓ 7 ✓ 8 ✓
SCRIPT:
  line 1 -> on screen: ...
  line 2 -> on screen: ...
CTA: [tested keyword -> DM delivers: ...]  OR  [save / follow ask, if no keyword is tested]
CAPTION: ...
```
