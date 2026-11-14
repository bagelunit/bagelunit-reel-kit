---
name: bagelunit-reels
description: BagelUnit Reel Kit. Makes ready-to-post 1080x1920 Instagram Reels / TikToks / Shorts from one prompt, either animated explainers (it writes or uses the script, voices it, animates every scene, reviews its own frames, exports an mp4) or edited talking-head reels from the user's own face take (layouts, captions, graphics over the footage). Use whenever the user asks for a reel, short, TikTok, explainer video, faceless video, talking-head edit, animated video for social, or says /bagelunit-reels.
---

# BagelUnit Reel Kit · studio guide

You're the editor and this folder is your studio. You write the words and the shot code; the studio's tools voice, render, check and export. `KIT_DIR` = the folder this file is in (`<workspace>/studio`). Run every tool by absolute path, e.g. `node "$KIT_DIR/tools/kit.mjs" frames <project> 2.5`.

**The flow, in one line:** checkup (once) → brief → words → project + voice → concept card → shot cards → build → check → ship.

---

## The three modes

| Mode | On screen | Reach for it when |
|---|---|---|
| `print` (default) | a riso print on warm stock: engraved line shading, one accent ink, paper-white cards with hard shadows, big condensed caps captions with a marker underline on the key word, a sticker host in the corner who points at the focus and acts every phrase, blind wipes | tips, tools, lists, takes, news: anything "here's how / here's why" |
| `depth` | 3D explainers of what goes on inside things, in lit rooms: warm plaster walls, lamps and depth of field, Bix the boxy host (overalls by default, suit and fedora optional), machines, light dashboards, a workbench for close-up object stories, a storefront CTA; taped titles and big caption tiles | how a physical thing or a system works (gadgets, apps, cars, the body, networks) |
| `talking` | the user's own face take, edited: split window, seam, punch-in, full-canvas graphics, dark cards, per-word captions | the user sends a video of themselves talking |

**Branding** comes from `reel.json` and is the same in every mode:
- `"theme"`: `"studio"` (default), `"harbor"`, `"ochre"` or `"ink"` (v1.0 names clay / cobalt / forest / mono still work), or `{ "preset", "accent", "paper", "ink2", "ink" }`.
- `"brand": { "handle": "@name" }`.

**Where a mode lives:** everything about a mode is in `modes/<mode>/`: its manual (`GUIDE.md`), runtime, parts, starter project and example shots. New modes plug in through `modes/MODE-RULES.md`.

---

## A · Checkup (first time on a computer, ~2 minutes)

`node "$KIT_DIR/tools/checkup.mjs"` checks Node, ffmpeg, Python, the headless browser, the ElevenLabs key and the voice, and prints the exact fix for each gap. Walk the user through the fixes one at a time, in plain words. They may not be technical, and `SETUP.md` has the details.
- **What you may run** (with the user's OK): `npm install` and `npm run browser` inside `studio/`, plus `pip3 install numpy`.
- **Keys:** the user saves their key in the file the checkup names. Never ask for a key in chat; never print or log one.
- **Voice** (animated modes only): if none is saved, pick one with them (section D). It's saved for every future reel.
- **Plan:** ask once which AI plan they're on. You can't detect it. Save it with `checkup.mjs --set-plan <max|pro|api|team|codex|cursor|other>`. It picks crew or solo build (section F).
- **Brand:** ask once for their handle and theme (show the four), and save them with `checkup.mjs --set-brand @handle --set-theme <studio|harbor|ochre|ink>` (either flag works alone). `kit start` copies them into each project.
- **Host look** (print only): offer to build their host from a photo (`playbook/host.md`), or no host. It's saved in their config.
- **Ask only what is still missing** (local addition). In a brand folder, `/brand-setup` already answered most of this: take the handle from `brand/brand.json` > `handle`, the theme from `colors.theme`, the voice from `voice.voice_id` and the presenter from `host`, and save them with the flags above without asking again. Skip the plan question when the checkup already shows a saved plan.

Run the checkup again whenever a tool fails with a setup-looking error.

---

## B · Brief (ask at most one question)

From the prompt, settle five things: **topic/angle**, **their script or yours**, **mode**, **CTA keyword**, **language**. Infer the rest. Only ask when the topic itself is unclear.
- **A video of them talking** → `talking`. Jump to section T.
- **A pasted script** is used **word for word**. Fix only obvious typos.
- **Mode:** ALWAYS ask the user which style to use before anything else, even when the topic or a pasted script suggests one: one question block with the AskUserQuestion tool (Print, 3D (`depth`), Talking head (`talking`, only if they have a video of themselves)), with your recommendation first and why. Never default silently. This is the brief's one question. <!-- local change, owner rule 2026-11-05; re-apply after kit updates -->
  - **Scene styles** (local addition 2026-11-12): when `kit scene list` shows styles, add "A drawn scene style (stick figure, map, comic book and more)" as an option. If they pick it, show the list (`kit scene list`) and ask which one in a second question block, three or four that fit the topic with your pick first. Then follow section S.
- **CTA keyword:** one memorable uppercase word tied to the topic (COFFEE, PLUGINS). It goes in `reel.json`.
- **Language:** set `"language": "xx"` in `reel.json` (ru, es, de, ar…). The voice, captions, CTA and UI text follow it.
  - Latin, Cyrillic, Greek and Vietnamese fonts ship with the kit.
  - For other scripts, run `python3 "$KIT_DIR/tools/glyphs.py" check <project>` after the voice.
- **Voice vs host:** if the saved voice clearly doesn't fit the person they describe, say so and offer `voicebank.py search`. For non-English scripts, prefer a voice tagged with that language.

---

## C · Words (skip when they gave a script)

Follow `playbook/writing.md`:
- the hook lands in 1.5 s and is a triple hook (local addition; in a brand folder, `docs/hook-and-review-playbook.md` section 0): the first line sets the context at once (said, shown and on screen), then a lean (proof from `brand/facts.md`, a pain or benefit, or something unexpected), then a contrarian snapback that the reel pays off;
- line 2 opens a loop;
- the stakes are concrete;
- the answer comes only after the problem is felt;
- it's conversational, 110–170 words (≈ 35–60 s) by default. When they ask for a short reel, size it to the ask: 10–15 s ≈ 40–48 words in 3–5 shots, 20–30 s ≈ 80–110 words in 5–8 shots (the voice step trims pauses and speeds up ×1.15, so you fit more words than the clock suggests), built as hook → one turn → ask (`playbook/writing.md`, "Short reels");
- it ends on "Comment KEYWORD and I'll send you …".

Save it as `<project>/script.txt`. Show it first only if they asked to review; otherwise keep going.

---

## D · Project + voice

```
node "$KIT_DIR/tools/kit.mjs" start <REELS>/<slug> --style <print|depth|talking>
python3 "$KIT_DIR/tools/voice.py" <REELS>/<slug>
```
- `<REELS>` is the brand folder's `reels/` folder. `<slug>` is a short kebab-case topic.
- **Reels are made only in a brand folder** (local addition): the brand's `<brand>-reels` folder, which holds `brand/brand.json` and `.kit-version`. If Claude Code was started anywhere else (the brand's project folder, the kit's folder, a home folder), do not start the reel there: ask which brand, look for its `*-reels` folder (for example under `~/Reels/`, or wherever `/brand-setup` put it), and tell the person to open Claude Code in that folder. If the brand has none, point them to `/brand-setup` in the kit's folder. `kit start` refuses a folder outside a set-up brand folder for the same reason (`--anywhere` is for tests only).
- `voice.py` writes:
  - `audio/vo.mp3`: pauses over 0.45 s cut to 0.28 s, ×1.15, −14 LUFS;
  - `build/words.json` and `build/word_index.txt`: every word with its time.
- **Every animation is cued on those words.**
- **Choosing a voice:**
  1. `voicebank.py search "<what they want>" [--lang xx]` and give them 3 preview links.
  2. `voicebank.py add <owner> <voice_id> "<name>"`, then `voicebank.py use <voice_id> --name "<name>"`.
- **Other voice sources:**
  - their own voice-only recording: `voice.py <project> --provider file --audio take.mp3`;
  - OpenAI voices: `voicebank.py provider openai`.
- **Credits:** one generation per reel. If the script changes, generate again. Timing-only fixes use `--reuse` (free).

---

## E · Concept card, then shot cards (plan before code)

**Concept card.** Read `playbook/taste.md` (the bar) and `playbook/ideas.md` (print) or `playbook/ideas-3d.md` (depth). Then write at the top of `STORYBOARD.md`:
- **The world:** one physical object, machine or place whose behaviour *is* the argument, and why it fits.
- **The props:** 3–6, invented from THIS script's words. The examples in `playbook/` and `modes/<mode>/examples/` teach techniques; never paste them.
- **The wow:** one per section.
- **The test:** "could this frame sit in someone else's reel?" If yes, it's generic. Invent again.

**Shot cards.** Open `build/word_index.txt` and cut the script into shots of 1.5–5 s (one idea each). Read the mode manual's quality section and look at its reference frames first. Then fill this card for EVERY shot:
```
shot NN · "<words>" · w i0–i1 · s–e
  on stage  : what's already there and stays (and where)
  on the beat: stressed word → what enters or changes (one per stressed word, every 0.4–0.8 s)
  alive     : each element's idle life (ticks, swings, types, blinks, floats)
  host      : (print) what it points at + its act per phrase · (3D) who/what acts
  camera    : push / kick / cut on which words · how the shot comes in
  new props : which invented props appear here (new code)
  hits      : slams, cuts, whips, reveals: 1+ per second (kit pace measures it)
```
Staging rules (`playbook/staging.md`):
- **Build up, one focus.** The stage grows: each stressed word adds or changes one thing, and earlier things stay and keep moving. There is one focus at a time.
- **Readable on mute.** The picture makes sense with the sound off.
- **Never still.** Nothing sits for more than 1.2 s.
- **Hits land on the stressed word.**
- **The hook is full from the first frame.** It shows the payoff or the conflict straight away.

---

## F · Build

Read `modes/<mode>/GUIDE.md` in full before writing code: the bar, the look, the tokens, the API, the shot contract and recipes. The runtime gives you HOW things move (springs, swings, gravity, the building stage, host acting, camera, typing, rolling numbers, transitions) and the house finish. WHAT moves is your props, written as new code in the project. Strong reels run 50–110 lines of custom shot code and 3–7 hand-drawn objects per second.
- **Cue on words, never seconds:** use the mode's word lookup (print: `wordAt('word')`, depth: `at('word')`; both listed in the manual).
- **Colours come from the mode's theme tokens** (named in its manual), never hex codes, so a theme recolours everything. Fixed material colours of a prop (wood, brass, skin, a screen's dark glass) use the mode's named material tokens where it has them (print draws them as tone greys and the `C` tokens; depth names its materials in its manual); in 3D a prop's own paint colour may be a literal, but anything that should follow the brand (accent, tiles, badges) comes from the theme.
- **Preview each new prop alone** (`kit frames <project> <t> --only <id>`). Preview sheets: `kit frames <project> 0 1 2 3 4 5 --only presenter` (print presenter: portrait, poses, expressions, hairstyles, aims, moods).
- **Read the end of every `kit frames` / `kit render` output.** "error while drawing frames" means those frames are broken: fix them first.
- **Crew build vs solo build:**

  | | Crew build (plans max / api / team) | Solo build (pro / codex / cursor / other / unknown) |
  |---|---|---|
  | Builders | one sub-agent per 1–2 shots, in parallel | you build every shot yourself, one at a time |
  | Each builder gets / scope | `playbook/taste.md`, the mode manual, `playbook/ideas(-3d).md`, the concept card, its shot cards and words, the neighbours' hand-off state | 3–6 richer shots |
  | Stills | each renders `--out <shot>` | at key moments only |
  | Review | 2–3 rounds | 1–2 rounds and one draft |

  In solo build, tell the user up front that a reel uses a good part of their usage window.

  **Crew hand-off rules** (so builders agree):
  - **Shared props live in one file written by you (the lead) before any builder starts:** in print `scenes/props.js`, listed first in `SCENE_FILES` in `timeline.js` so it loads first (other modes: see the mode's guide). Anything two shots both draw (the story object, a recurring card, a character's look) is defined there once; builders call it, never redraw it.
  - **Write a hand-off block in `STORYBOARD.md`** before spawning builders: names and ids (every person, product, file, number on screen), colours (theme tokens used for each), which slot/seat/item is the hero, and the end state of each shot that the next one starts from. Every builder reads it and follows it exactly; a builder that needs a new shared fact asks you to add it, never invents its own.
- Everything is saved in the reel's folder as you go: `reels/<slug>/`, or `reels/2026/11 November/November 12/<slug>/` when the brand's `reels.layout` is `dated` (`kit start reels/<slug>` files it there; every tool, `kit` command and Python tool finds a reel by `reels/<slug>` or its slug, so write that in commands, never the dated path). "Continue the reel" means: read `STORYBOARD.md` and the shot files, and carry on. Never regenerate the voice unless the script changed.

---

## G · Check (mandatory, this is what makes it look pro)

Full checklist: `playbook/self-review.md`.
1. **Frames:** `kit frames <project> <t…>` at the middle of every shot and 0.1 s after every cut, into `stills/sheet.jpg`. Look at the sheet, fix, and re-render until it's clean.
2. **Draft:** `kit render <project>` writes a fast low-res `build/draft.mp4`. Pull frames around each transition (`ffmpeg -ss T -frames:v 1`), and fix pops, overlaps and dead air.
3. **Gates:** `kit pace <project>` and `kit effort <project>` must both print PASS. `pace` reads the rendered draft, so run `kit render` first.
   - `pace` lists every flat stretch with its words. Give each one a build-up, secondary motion, a camera move or a host act.
   - `effort` checks for enough original work, with no stock prop carrying the reel.
   - Never render the final while a gate fails.
   - `kit lint <project>` (local addition) checks shot grammar: shot length, face time, repeated layouts, cuts on words, rhythm, movement in the first second. Errors must be fixed; print reels have no shot data yet, so it says so and checks nothing.
4. **Last look:** the sheet once more through `playbook/taste.md`'s questions. If any answer is "not yet", improve first.
5. **Final:** `kit render <project> --final`, then `kit export <project>`, which writes `out/<name>.mp4` (1080×1920, 30 fps, H.264 + AAC). **Then the real-sound step (local add-on, owner 2026-11-05, replaces the synthesised effects):** `~/dev/sound/earshot/.venv/bin/python "$KIT_DIR/tools/realsound.py" <project> --video out/<name>.mp4 --out out/<name>.mp4.tmp.mp4`, check `build/realsound/report.txt` (every picture check passes; earshot realness), then replace `out/<name>.mp4` with it. It mixes real CC0 recordings (opus-sound-layer), snaps every hit to the frame where the motion lands, and keeps the voice on top. <!-- local change, re-apply after kit updates --> Export mixes the sound cues and keeps them sparse: at most about one cue per 0.75 s, with cuts, stamps and slams winning over pops and ticks. Fewer cues may play than the shots asked for; that's on purpose, so place sounds only on the moments that matter.

5b. **Fact check (local addition):** `kit facts <project> check --scope final` (mechanical: digits, sources, clearance dates, absolute wording; writes `build/factcheck.md`), then the fresh re-read of every source (`/reel-factcheck` in the brand workspace) and `kit facts <project> record --scope final --result PASS|FAIL`. The same check runs on the script before Gate A (`--scope script`, before any voice credits). `kit gate` refuses Gate A and Gate C without a current PASS.
6. **File check and fingerprint (local addition):** run `kit qa <project>` on `out/<name>.mp4` (format, loudness and peak, black or frozen stretches, first-word sync; it must print PASS, and it says which checks it skipped). After the approver says yes at Gate C, run `kit gate <project> record --gate C`: it stores the file's fingerprint with the QA result and the review verdict in `approvals.md`. Later, `kit gate <project> check` shows whether the file changed after approval.
7. **Facts and estimate (local addition):** `kit measure <project>` writes plain facts (cuts, pauses, loudness, still stretches, contact sheets); `kit predict <project>` adds a watch-time and skip-rate estimate only once `kit calibrate <insights.csv>` has been run on at least 8 of the brand's own reels. Until then it gives measurements, never a prediction.

**Paid calls are guarded (local addition):** `voice.py` and `take.py` keep a marker in `build/.markers/` for every paid request. The same request again prints "reused (no credits spent)"; a request that may already have been billed is refused until you re-run with `--force`.

One render runs at a time (built-in lock). Drafts first, final once.

---

## S · Scene styles (local addition, 2026-11-12)

A scene style is a drawn look from `styles/` (`modes/MODE-RULES.md`, "Scene styles"): the reel is a list of scenes, each one template of the style with props, timed by the voice. Sections B to D and G apply; section E becomes the plan below and section F is replaced by it.
```
node "$KIT_DIR/tools/kit.mjs" scene list [<style>]                 the styles, then one style's templates
node "$KIT_DIR/tools/kit.mjs" start <REELS>/<slug> --style <style>  reel.json, script.txt and a sample scenes.json
python3 "$KIT_DIR/tools/voice.py" <REELS>/<slug>                     the voice and build/words.json, as for every mode
node "$KIT_DIR/tools/kit.mjs" scene <REELS>/<slug> plan             each scene's time from the words, and what does not match
node "$KIT_DIR/tools/kit.mjs" scene <REELS>/<slug> check            errors, safe area and seeking per scene; sheets in build/scenes/check/
node "$KIT_DIR/tools/kit.mjs" render <REELS>/<slug> [--scene n]     changed scenes only; build/video.mp4 + build/draft.mp4
node "$KIT_DIR/tools/kit.mjs" scene <REELS>/<slug> stand-in         optional: a tone and fake word times to preview timing (no key, no credits; never for posting)
```
1. Read `styles/<style>/SKILL.md` (the art direction and its golden rules) and `templates.json` (each template's props schema, example props and narration) before planning.
2. Write `script.txt` (section C), then `scenes.json`: one scene per idea, `narration` = the exact words of the script it covers, `props` from the template's schema, using the narrator's own words in labels so the engine lands each one on its word. Reuse the same cast and props across scenes; vary the templates.
3. Voice, then `kit scene <dir> plan`: every scene should say `words n/n`. Fix the narration of any scene on `even split`. Aim for 3 to 12 s a scene.
4. `kit scene <dir> check`, then LOOK at every sheet; fix props (shorter labels, fewer items) and check again. Then `kit render`, pull frames around each cut, and section G from step 3 on: `kit pace` (the print bar; a calm style in `CALM_STYLES` in `tools/kitcore.py`, today `deep-zoom`, is measured but passes with a note, and `/reel-review` scores its movement and pace against the calm bar), `kit effort` says it does not apply, `kit lint` finds no shot data, `kit qa` checks the safe zone from the engine's boxes.
5. Sound: `kit render` writes `build/sfx.json` from the scene cuts (a soft swoosh on every cut, none on frame 0), so `kit export` and the real-sound step (section G step 5) have cues. A scene can add its own with `"sfx": "pop"` (at its start) or `"sfx": [{"at": 1.2, "name": "pop", "gain": -3}]` (seconds into the scene); `reel.json` `"sfx": "off"` turns the cut swooshes off. Names: whoosh swoosh pop click tick thud stamp boom riser shimmer type cash.
6. Revisions: change a scene's props or narration and render again; only changed scenes are drawn again.

---

## T · Talking-head mode (`talking`)

Their own face take drives everything, with no TTS. Read `modes/talking/GUIDE.md` in full first.
1. **Start:** `kit start <REELS>/<slug> --style talking`, then `python3 "$KIT_DIR/tools/take.py" <REELS>/<slug> --video <their take>`. It:
   - tightens the pauses and polishes the voice;
   - writes the face frames;
   - writes `build/words.json` (ElevenLabs speech-to-text with their key, or Whisper).

   Tell them the tightened length. If they asked to review the cut, get their OK first.
2. **Shots:**
   - one layout every 1.5–3 s (hard cuts, never one layout three times in a row);
   - one graphic per named thing;
   - KEY words for the captions;
   - their real screenshots over rebuilt UI.
3. **Build and check:** write `scenes.js` with the talking API, then run the same checks as section G.

---

## R · Revise (when they ask for changes after seeing a reel)
- **Keep everything they didn't mention.** Same script, voice take, shots, layout and props. Change only what they asked for; never rebuild the reel.
- **Map the request to the smallest edit:** a shot's moment or size → edit that shot file; "bigger text" → the caption/card sizes; "more motion" → add beats inside the existing shots; "shorter" → cut lines and re-time; a new style → only then start a new project.
- **Voice:** keep the take. To change one line, re-voice just that sentence and splice it in at the pauses (check every word is heard); re-record the whole take only if they ask for a new voice or speed.
- **Re-render only what changed**, then re-run section G (pace + effort) on the new draft.
- **Version it:** export to `out/v2/`, `out/v3/` … and keep the earlier versions.
- **Show what changed:** before/after stills of the changed moments, plus one line per change.

## H · Ship

Give them:
- the path to `out/<name>.mp4`;
- a caption (2–3 lines of context, the CTA keyword, 3–5 hashtags);
- a reminder that "Comment KEYWORD" needs a DM auto-reply (the brand's publisher, a no-code comment-to-DM tool, or Instagram's own automations) carrying what they promised (`playbook/posting.md`).

Offer one round of changes: faster hook, different voice, swap a shot, different theme.

---

## Always
- Their script, brand names and claims are used exactly as given. Never invent stats, prices or quotes about real products.
- No one else's logos, footage or characters unless the user supplies them and has the rights.
- Never print keys. Never post or upload anything; you only create files.
- When a tool errors, read the message, fix the cause (often setup: run the checkup) and retry. Don't silently switch approaches.
- Keep them posted in plain words at each stage (script ✓, voice ✓, shots 3/7, check, final), without log dumps.

## Map
- `tools/`:
  - `kit.mjs` (start · frames · render · pace · effort · sound · export · live · scene)
  - `scenes.mjs` (scene styles: plan, timing, render, check, stand-in voice)
  - `voice.py`, `take.py`, `voicebank.py`, `sound.py`, `glyphs.py`, `checkup.mjs`
- `modes/<mode>/`: runtime, parts and starter project; plus `modes/MODE-RULES.md`.
- `styles/`: the scene styles, synced from the styles repo (`STYLES.json`, `_core/`, one folder per style); never edited here.
- `playbook/`:
  - `taste.md` (read first)
  - `writing.md`, `staging.md`
  - `ideas.md` + `ideas-3d.md`
  - `self-review.md`, `host.md`, `posting.md`
  - `modes/<mode>.md`
- `modes/<mode>/examples/`: worked scenes to learn techniques from (print: 5 scenes, 8 props with a showcase reel, the casinos reel and reference strips; depth: 28 shots), each listed in its `SHOTS.md` with when to use it.
- `SETUP.md` is setup for humans; `README.md` says what this is.
