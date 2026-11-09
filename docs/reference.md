# Reference: the kit's method

How the BagelUnit Reel Kit decides what to make, how it makes it, and the rules it keeps. The step-by-step loop is in [process.md](process.md); this page is the thinking behind it.

## 1. Deciding what to post

- **voice.md:** one file describing who you talk to, words you would never say, 3 to 5 positions you hold, what is off limits. Every script reads it.
- **The 3x rule:** rank reels by views divided by that account's median views (last 12 reels). Under 1.5x ignore, 1.5x to 3x note, 3x and up is a formula worth studying. Copy the shape (hook, structure, length), never the video.
- **Account mix:** 4 direct (your niche, a bit ahead), 4 adjacent (same audience, other topic), 2 to 4 big ones for format ideas. Stay within about 10x of your follower count.
- **Look, don't scrape:** read reels in the browser at human speed. Scraping services stay off unless the brand owner turns them on.
- **Hook scoring:** 3 hooks per idea, scored, keep 75 or more. Flags: a hook over 3 s, a beat long enough to leave, lines with nothing concrete, no loop back.
- **Weekly loop:** monthly research, Monday plan, each reel scored, caption check (first 125 characters), Sunday review.

## 2. How a reel is made

**Flow:** checkup > brief > words > project + voice > concept card > shot cards > build > check > ship.

- **Three styles:** `print` (riso-print look, with the drawn presenter or the brand's own sticker host), `depth` (three.js 3D rooms with a boxy host), `talking` (edits your own face video: cuts pauses, adds captions and graphics).
- **Voice:** ElevenLabs by API; shortens long pauses, speeds up slightly, sets -14 LUFS, and writes `words.json`, every word with its start and end. Every animation and caption is locked to a spoken word. It also takes your own recording.
- **Concept card before any code:** one world or object whose behaviour IS the argument, 3 to 6 props invented from this script, one wow per section, and the swap test ("could this frame sit in someone else's reel? then it is generic").
- **Shot cards:** every 1.5 to 5 s planned: what is on stage, what changes on each stressed word, idle motion, presenter action, camera, at least one hit per second.
- **Crew build:** one sub-agent per 1 or 2 shots in parallel, with a shared props file and a hand-off block so they agree.
- **Quality gates:** stills sheet > half-size draft > a `pace` gate (finds flat stretches) and an `effort` gate (rejects reels carried by stock props) must PASS > only then the final render.
- **Safe zones:** nothing important in the bottom 300 px or right 120 px (Instagram covers them). Text 40 px minimum.
- **Ship:** mp4 + caption + cover + posting card. A person posts unless the brand owner connected a publisher.
- **Time per reel:** 30 to 80 minutes of Claude time, little of yours.

## 3. Craft ideas built in

- Captions where the accent word lands a beat before it is spoken.
- An automatic motion score with a flat-moment finder (the `pace` gate).
- A banned-openers list and a banned corporate-words list for scripts.
- A "find the one object that explains the idea" step (the concept card).
- Sparse sound effects with ducking, mastered for Instagram; real recordings instead of synthesised ones (the real-sound step).
- Studying your own best reels frame by frame once you have some.
- No sales tactics such as countdown prices and invented urgency.

## 4. The kit's reel skills

The template ships its skills in its `.claude/skills/` folder, so every brand folder carries them: brand setup, sticker host, kit update, account audit, reel sources, teardown, comment mining, going viral, virality, hook writer, hook mining, A/B test, script, shoot plan, humanizer, fact check, review, predict, caption, cover brief, posting, readout, comment responder, and the opt-in autopilot one. The full list with what each does is in [COMMANDS.md](../COMMANDS.md). The template's `CLAUDE.md` has a "which skill for which step" table. The checklists are in [hook-and-review-playbook.md](../template/docs/hook-and-review-playbook.md): the eight-point frame-0 hook checklist, one goal and one rotated angle per reel, re-hooks at the dips, reel teardowns, comment mining, A/B hook tests with one variable, a cover legibility test, and a retention-based review (drop at 3 s = hook, 12 s = middle, end = CTA). The skills' numbers are starting points, so we test them against each brand's own median. Auto-posting, automated DMs, scraping services and paid cloud renders are off by default and only a brand owner turns them on (template `CLAUDE.md` section 3b).

## 5. Rules

- **Only cleared facts.** A claim goes on screen only if it is in `brand/facts.md`. No invented stats, no price or offer claims unless cleared.
- **Keyword CTA only with a tested auto-reply.** Otherwise end on save or follow.
- **The generated voice never says** the words in `voice.never_say` (for example a brand name it mispronounces); show them on screen instead.
- **No em dashes** in on-screen text, captions or scripts.
- **Approval gates:** script approved before any voice credits, visual plan approved before the build, final approved before filing. Each claim is fact checked against its source before Gate A and again before Gate C.
- **Copy the formula, never the video,** and never reuse another creator's colours, mascot or prompts.
