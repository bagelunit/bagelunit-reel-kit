# Reference: what other reel makers do

What we learned from studying how other creators make animated reels, and what we took into this kit's process. We copied ideas and formulas, never code, scripts, colours, mascots or prompts.

Sources studied (November 2026):
- a creator's guide on how they make reels, and their free guide on deciding what to post, which uses the open-source Instagram skill pack by Jake Schincariol (MIT);
- the reel engine in this kit's `studio/` (v1.4.1);

## 1. The making process (8 steps)

1. **Script, 30 to 40 s, 85 to 100 words.** Hook (0 to 3 s, gives the value, not a teaser) > proof (a name, a number) > how (3 or 4 steps) > twist or own proof > CTA "Comment WORD and I'll send you X". Claude drafts 3 hook versions.
2. **Voice.** ElevenLabs, one voice forever (the voice becomes the brand). The whole script in one take, two takes, keep the better one. Write for the ear ("sixteen thousand", names spelled the way they sound).
3. **Word timings.** Whisper turns the audio into `words.json` (every word with its start and end). Pauses over 0.25 s are cut and the audio is sped up 8%. Every animation and caption is locked to a spoken word.
4. **Build the scene.** Claude writes one HTML page with a "draw the frame at time t" function, from one of a few fixed prompts (list reel, documentary reel, 3D story reel, captions, end card) with the brand's colours filled in.
5. **Check 6 stills before rendering.** Fix in plain words ("move the card down", "the stamp lands on the word free"). Stills take seconds, renders take minutes.
6. **Render.** HyperFrames (HeyGen's open-source HTML-to-video engine, a Claude Code plugin) or Remotion: a headless browser captures every frame, ffmpeg joins them.
7. **Sound.** Synced pops, whooshes, thuds and key clicks; music under the voice, ducked; final mix at -14 LUFS.
8. **Post.** The comment keyword is said, shown and in the caption; a DM tool sends the link; after 24 h check skip rate, saves and keyword comments.

**Their look:** cream background, near-black ink, one accent colour, a heavy sans-serif, captions at the top one sentence at a time, cards that slide up with overshoot, stamps that slam in rotated, a punch zoom on key words, one mascot at the bottom that reacts.

**Their own data point:** the same idea did about ten times better in the bright style with the result shown in frame one than in a dark, text-heavy style. The first frame decides it.

**Time per reel:** 1 to 2 hours, mostly the person going back and forth.

## 2. Deciding what to post

- **voice.md:** one file describing who you talk to, words you would never say, 3 to 5 positions you hold, what is off limits. Every script reads it.
- **The 3x rule:** rank other reels by views divided by that account's median views (last 12 reels). Under 1.5x ignore, 1.5x to 3x note, 3x and up is a formula worth copying. Copy the shape (hook, structure, length), never the video.
- **Account mix:** 4 direct (your niche, a bit ahead), 4 adjacent (same audience, other topic), 2 to 4 big ones for format ideas. Stay within about 10x of your follower count.
- **Look, don't scrape:** read reels in the browser at human speed. No scraping services (platform rules, account bans).
- **Hook scoring:** 3 hooks per idea, scored, keep 75 or more. Flags: a hook over 3 s, a beat long enough to leave, lines with nothing concrete, no loop back.
- **Weekly loop:** monthly research, Monday plan, each reel scored, caption check (first 125 characters), keyword DM, Sunday review.

## 3. The engine (this kit's studio)

The same core idea (a page that draws frame t, `words.json` drives everything), packaged as a full studio with its own guardrails.

**Flow:** checkup > brief > words > project + voice > concept card > shot cards > build > check > ship.

- **Three modes:** `print` (riso-print look, a presenter who points and lip-syncs), `depth` (three.js 3D rooms with a boxy host), `talking` (edits your own face video: cuts pauses, adds captions and graphics).
- **Voice tool:** ElevenLabs by API; shortens long pauses, speeds up slightly, sets -14 LUFS, writes `words.json`. Also takes your own recording.
- **Concept card before any code:** one world or object whose behaviour IS the argument, 3 to 6 props invented from this script, one wow per section, and the swap test ("could this frame sit in someone else's reel? then it is generic").
- **Shot cards:** every 1.5 to 5 s planned: what is on stage, what changes on each stressed word, idle motion, presenter action, camera, at least one hit per second.
- **Crew build:** one sub-agent per 1 or 2 shots in parallel, with a shared props file and a hand-off block so they agree.
- **Quality gates:** stills sheet > half-size draft > a `pace` gate (finds flat stretches) and an `effort` gate (rejects reels carried by stock props) must PASS > only then the final render.
- **Safe zones:** nothing important in the bottom 300 px or right 120 px (Instagram covers them). Text 40 px minimum.
- **Ship:** mp4 + caption + cover timestamp + DM reminder. It never posts.
- **Time per reel:** 30 to 80 minutes of Claude time, little of yours.

## 4. Side by side

| | Fixed-prompt approach | Engine approach |
|---|---|---|
| Engine | HyperFrames + a few copy-paste prompts | its own engine (Playwright + three.js) and tools |
| Planning | straight to the prompt | concept card + a shot card per shot |
| Quality control | the person eyeballs 6 stills | stills + draft + 2 automatic gates |
| Your time | high (1 to 2 h) | low (approve, then wait) |
| Look | one fixed house style | 3 modes, themeable |
| What to post | yes (3x rule, Instagram skill) | no |
| Distribution | keyword > DM > email capture | caption + DM reminder only |

This kit combines both: the engine for making, the Instagram skill pack for research, hooks and captions, and our own gates and rules on top.

## 5. Ideas we took (ideas only, no code)

- Captions where the accent word lands a beat before it is spoken.
- An automatic motion score with a flat-moment finder (the engine's `pace` gate does this).
- A banned-openers list and a banned corporate-words list for scripts.
- A "find the one object that explains the idea" step (the concept card).
- Sparse sound effects with ducking, mastered for Instagram; real recordings instead of synthesised ones (the real-sound step).
- Studying your own best reels frame by frame once you have some.
- Ignore sales tactics such as countdown prices and invented urgency.

## 5b. The kit's reel skills (added 2026-11-06)

The template ships 23 skills in its `.claude/skills/` folder, so a copy of the template carries them (brand setup, kit update, account audit, reel sources, teardown, comment mining, going viral, virality, hook writer, hook mining, A/B test, script, shoot plan, humanizer, fact check, review, predict, caption, cover brief, posting, readout, comment responder, and the opt-in autopilot one). The template's `CLAUDE.md` has a "which skill for which step" table. The checklists are in [hook-and-review-playbook.md](../template/docs/hook-and-review-playbook.md): the eight-point frame-0 hook checklist (built from side-by-side winners and flops), one goal and one rotated angle per reel, re-hooks at the dips, reel teardowns, comment mining, A/B hook tests with one variable, a cover legibility test, and a retention-based review (drop at 3 s = hook, 12 s = middle, end = CTA). The skills' numbers come from one account, so we test them against each brand's own median. Auto-posting, automated DMs, scraping services and paid cloud renders are off by default and only a brand owner turns them on (template `CLAUDE.md` section 3b). The fact check (`/reel-factcheck`), review (`/reel-review`), estimate (`/reel-predict`), posting (`/reel-posting`) and update (`/kit-update`) skills were added in kit 1.7.0.

## 6. Rules we adopted

- **Only cleared facts.** Other creators lean on big round numbers; we put a claim on screen only if it is in `brand/facts.md`. No invented stats, no price or offer claims unless cleared.
- **Keyword CTA only with a tested auto-reply.** Otherwise end on save or follow.
- **The generated voice never says** the words in `voice.never_say` (for example a brand name it mispronounces); show them on screen instead.
- **No em dashes** in on-screen text, captions or scripts.
- **Approval gates:** script approved before any voice credits, visual plan approved before the build, final approved before filing. Each claim is fact checked against its source before Gate A and again before Gate C.
- **Copy the formula, never the video,** and never reuse another creator's colours, mascot or prompts.
