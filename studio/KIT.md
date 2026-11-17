# BagelUnit Reel Kit · studio guide

You're the editor and this folder is your studio. You write the words and the shot code; the studio's tools voice, render, check and export. `KIT_DIR` is the folder this file is in. After install that is `~/.claude/skills/bagelunit-reels`. Run every tool by its full path, for example `node "$KIT_DIR/tools/kit.mjs" frames reels/<slug> 2.5`.

**The flow, in one line:** checkup (once) → style → project and script → Gate A → voice → visual plan → Gate B → build → checks → cover and caption → final fact check → review → Gate C → hand over.

**Words used here.** *Style:* what the owner picks (Print, 3D, Talking head, or a scene style). *Mode:* one of the three engines behind Print, 3D (`depth`) and Talking head (`talking`). *Host:* the on-screen character; `reel.json` calls it `presenter`. *Sticker host:* the brand's own pose pictures (`/sticker-host`, `kit host`). *`<project>`* means the reel's folder, `reels/<slug>`.

---

## Gates

Gate A approves the script, Gate B the visual plan, Gate C the final video. The approver says yes to each (ask with a question block, never as plain text); `kit gate <reel> record --gate A|B|C` records it in `approvals.md`.
- **Gate A** needs the script fact check PASS and a line `Script review: meets the bar (NN/100; ...) [script <12 hex>]` with NN of 90 or more for the script as it is now. In a brand folder `voice.py` refuses to make a voice before Gate A is recorded.
- **Gate B** needs Gate A recorded.
- **Gate C** needs A and B recorded, the final fact check PASS, a line `Review: meets the bar (NN/100; ...) [video <12 hex>]` with NN of 90 or more for the final `out/<slug>.mp4` (get the 12 hex with `kit gate <reel> hash`), a `kit qa` result of PASS for that exact file, and, in a brand folder, `scripts/qa/gate_qa.py` passed for it.
- Gate C also needs `kit licensed check <reel>` to pass: every licensed asset the reel uses (section L) is recorded in the brand's `brand/licensed/assets.json` and its file is unchanged. No override. The assets' credits are written into the Gate C block of `approvals.md`.
- **Owner-only overrides**, each recorded with a reason: `--skip-facts`, `--skip-script-review`, `--skip-review`, `--skip-qa`, `--skip-order`, `--before-gate-a` (on `voice.py`). Never use one yourself.
- A changed video needs a new QA, a new review and a new Gate C. `kit gate <reel> check` shows whether the file changed after approval.

---

## The three modes

| Mode | On screen | Reach for it when |
|---|---|---|
| `print` (default) | a riso print on warm stock: engraved line shading, one accent ink, paper-white cards with hard shadows, big condensed caps captions with a marker underline on the key word, a sticker host in the corner who points at the focus and acts every phrase, blind wipes | tips, tools, lists, takes, news: anything "here's how / here's why" |
| `depth` | 3D explainers of what goes on inside things, in lit rooms: warm plaster walls, lamps and depth of field, Bix the boxy host (overalls by default, suit and fedora optional), machines, light dashboards, a workbench for close-up object stories, a storefront CTA; taped titles and big caption tiles | how a physical thing or a system works (gadgets, apps, cars, the body, networks) |
| `talking` | the user's own face take, edited: split window, seam, punch-in, full-canvas graphics, dark cards, per-word captions | the user sends a video of themselves talking |

**Branding** comes from `reel.json` and is the same in every mode:
- `"theme"`: `"studio"` (default), `"harbor"`, `"ochre"` or `"ink"` (older names clay / cobalt / forest / mono still work), or `{ "preset", "accent", "paper", "ink2", "ink" }`.
- `"brand": { "handle": "@name" }`.

**Where a mode lives:** everything about a mode is in `modes/<mode>/`: its manual (`GUIDE.md`), runtime, parts, starter project and example shots. New modes plug in through `modes/MODE-RULES.md`.

---

## A · Checkup (first time on a computer, ~2 minutes)

`node "$KIT_DIR/tools/checkup.mjs"` checks Node, ffmpeg, Python, the headless browser, the ElevenLabs key and the voice, and prints the exact fix for each gap. Walk the user through the fixes one at a time, in plain words. They may not be technical, and `SETUP.md` has the details.
- **What you may run** (with the user's OK): `npm install` and `npm run browser` in `$KIT_DIR`, and `pip3 install numpy`. For anything else, point to `bash setup/install.sh` (Windows: `node setup/install.mjs`).
- **Keys:** the user saves their key in the file the checkup names. Never ask for a key in chat; never print or log one.
- **Voice** (animated modes only): if none is saved, pick one with them (section D). It's saved for every future reel.
- **Plan:** ask once which AI plan they're on. You can't detect it. Save it with `checkup.mjs --set-plan <max|pro|api|team|codex|cursor|other>`. Max, API and Team plans build shots with several helpers at once (crew build); other plans build one shot at a time (solo build), see section F.
- **Brand:** ask once for their handle and theme (show the four), and save them with `checkup.mjs --set-brand @handle --set-theme <studio|harbor|ochre|ink>` (either flag works alone). `kit start` copies them into each project.
- **Host look** (print only): in a brand folder offer the sticker host first (`/sticker-host`, then `kit host <project>`); otherwise offer to build the drawn host from a photo (`playbook/host.md`), or no host. It's saved in their config.
- **Ask only what is still missing** (local addition). In a brand folder, `/brand-setup` already answered most of this: take the handle from `brand/brand.json` > `handle`, the theme from `colors.theme`, the voice from `voice.voice_id` and the presenter from `host`, and save them with the flags above without asking again. Skip the plan question when the checkup already shows a saved plan.

Run the checkup again whenever a tool fails with a setup-looking error. Next step: section B. On failure: read the line the checkup prints for the gap, fix that one thing, and run the checkup again.

---

## B · Brief

From the prompt, settle: **topic and angle**, **their script or yours**, **style**, **language**. The ask comes from the brand (section C). Infer the rest. Ask nothing beyond the style question unless the topic itself is unclear.
- **A video of them talking** → `talking`. Jump to section T.
- **A pasted script** is used **word for word**. Fix only obvious typos.
- **Style:** ask one question block with the AskUserQuestion tool, before anything else, even when the topic or a pasted script suggests a style. Options: Print, 3D (`depth`), Talking head (`talking`, only if they sent a video of themselves), the two or three scene styles that fit the brand's niche (`kit scene list`), and "See all styles". Put your pick first with one line why. Never default silently. <!-- local change, owner rule 2026-11-05; re-apply after kit updates -->
  - **The brand's own standing rule is allowed:** if the brand folder's `CLAUDE.local.md` says "you pick the style for each reel", that is the owner's rule. Pick the style, say which one and why in one line, and do not ask.
  - A scene style then follows section S.
- **Language:** set `"language": "xx"` in `reel.json` (ru, es, de, ar…). The voice, captions, CTA and UI text follow it.
  - Latin, Cyrillic, Greek and Vietnamese fonts ship with the kit.
  - For other scripts, run `python3 "$KIT_DIR/tools/glyphs.py" check <project>` after the voice.
- **Voice vs host:** if the saved voice clearly doesn't fit the person they describe, say so and offer `voicebank.py search`. For non-English scripts, prefer a voice tagged with that language.

Next step: section C. On failure (no answer, unclear topic): ask the one clarifying question, then go on.

---

## C · Project, words, Gate A

1. **Start the project:** `node "$KIT_DIR/tools/kit.mjs" start reels/<slug> --style <print|depth|talking|scene style>`. `<slug>` is a short kebab-case topic. It keeps a `script.txt` already there.
2. **Write the words** (skip when they gave a script), following `playbook/writing.md`:
   - the hook is a triple hook (local addition; in a brand folder, `docs/hook-and-review-playbook.md` section 0): the first one or two sentences set the context in the first 1.5 s (said, shown and on screen), lean (proof from `brand/facts.md`, a pain or benefit, or something unexpected), then a contrarian snapback that the rest of the reel pays off;
   - the stakes are concrete;
   - the answer comes only after the problem is felt;
   - it's conversational. Length: about 85 words for 30 s, 110 to 130 words for 40 to 45 s. For 10 to 15 s write 40 to 48 words in 3 to 5 shots; for 20 to 30 s write 80 to 110 words in 5 to 8 shots (`playbook/writing.md`, "Short reels"). `kit script reels/<slug>` checks the length (pass `--seconds 60` for a longer reel);
   - it ends on ONE ask: the brand's own (`brand/brand.json` > `cta.style`: save this, follow, or visit the link). "Comment WORD" only when WORD is listed in `cta.tested_keywords` (its DM auto-reply was tested), or when there is no brand folder and the person asked for it. Write the ask in `reel.json` > `cta`. Where a mode's starter scene is a keyword comment box, see "A save or follow ask" in that mode's guide.
3. **Check the script.** In a brand folder the words come through the staged flow (`/reel-scripter`): `/script-plan` (viewer, one promise, a beat outline), the draft, `kit script reels/<slug>` (the lint), `/script-coldread`, then `/script-score` (90 or more). Where this section and the brand's own word band differ, the brand folder's `CLAUDE.md` and `docs/` win. Outside a brand folder run at least `kit script` on the draft.
4. **Gate A (before any voice credits).** Run `kit facts reels/<slug> check --scope script`, then `/reel-factcheck`, then record it with `kit facts reels/<slug> record --scope script --result PASS`. Run `python3 "$KIT_DIR/tools/budget.py" reels/<slug>/script.txt` (will the script fit the ElevenLabs credits left; `budget.py --left` shows just the account). Show the script, the fact check and the credits, and ask Gate A with a question block. On a yes run `kit gate reels/<slug> record --gate A`. Do not voice anything before that: in a brand folder `voice.py` refuses, and only the owner overrides with `--before-gate-a "reason"`. Outside a brand folder, show the script first only if they asked to review; otherwise keep going.

Next step: section D. On failure: if `kit script` reports errors, fix the words and run it again; if the fact check fails, fix the claim or clear it in `brand/facts.md`, then check again. A script review under 90 means redo and rescore, never fudge the number.

---

## D · Voice

```
python3 "$KIT_DIR/tools/voice.py" reels/<slug>
```
- `voice.py` writes:
  - `audio/vo.mp3`: pauses over 0.45 s cut to 0.28 s, ×1.15, −14 LUFS;
  - `build/words.json` and `build/word_index.txt`: every word with its time.
- **Every animation is cued on those words.**
- **Reels are made only in a brand folder** (local addition): `<brand>-reels`, with `brand/brand.json`. If Claude Code was opened anywhere else, ask which brand and tell the owner to open Claude Code in its folder. If there is no brand folder yet, point them to `/brand-setup` in the kit's folder. `kit start` refuses any other folder (`--anywhere` is for tests only).
- **Choosing a voice:**
  1. `voicebank.py search "<what they want>" [--lang xx]` and give them 3 preview links.
  2. `voicebank.py add <owner> <voice_id> "<name>"`, then `voicebank.py use <voice_id> --name "<name>"`.
- **Other voice sources:**
  - their own voice-only recording: `voice.py reels/<slug> --provider file --audio take.mp3`;
  - OpenAI voices: `voicebank.py provider openai`.
- **Credits:** voice each approved script once. Voice again only when the words change. For timing fixes run `voice.py reels/<slug> --reuse` (free).

Next step: section E (or S for a scene style). On failure: a message about a key or credits means run the checkup (section A); a refusal about Gate A means finish section C step 4.

---

## E · Concept card, then shot cards (plan before code)

**Concept card.** Read `playbook/taste.md` (the bar) and `playbook/ideas.md` (print) or `playbook/ideas-3d.md` (depth). Then write at the top of `STORYBOARD.md`:
- **The world:** one physical object, machine or place whose behaviour *is* the argument, and why it fits.
- **The props:** 3 to 6, invented from THIS script's words. The examples in `playbook/` and `modes/<mode>/examples/` teach techniques; never paste them.
- **The wow:** one per section.
- **The test:** "could this frame sit in someone else's reel?" If yes, it's generic. Invent again.

**Shot cards.** Open `build/word_index.txt` and cut the script into shots of about 1.5 to 5 s (one idea each; `kit lint` flags a shot under 1.0 s). Read the mode manual's quality section and look at its reference frames first. Then fill this card for EVERY shot:
```
shot NN · "<words>" · w i0 to i1 · s to e
  on stage  : what's already there and stays (and where)
  on the beat: stressed word → what enters or changes (one per stressed word, every 0.4 to 0.8 s)
  alive     : each element's idle life (ticks, swings, types, blinks, floats)
  host      : (print) what it points at + its act per phrase · (3D) who/what acts
  camera    : push / kick / cut on which words · how the shot comes in
  new props : which invented props appear here (new code)
  hits      : slams, cuts, whips, reveals (kit pace measures the rate and says what it passes)
```
Staging rules (`playbook/staging.md`):
- **Build up, one focus.** The stage grows: each stressed word adds or changes one thing, and earlier things stay and keep moving. There is one focus at a time.
- **Readable on mute.** The picture makes sense with the sound off.
- **Never still.** Nothing sits for more than 1.2 s (`playbook/staging.md`; `kit pace` lists every flat stretch).
- **Hits land on the stressed word.**
- **The hook is full from the first frame.** It shows the payoff or the conflict straight away.
- **Safe zone:** text and anything that matters stays inside the safe zone, quoted from one place: `docs/craft-playbook.md` "Safe zones and text size" (bottom 300 px, right 120 px, top 250, left 60; x 60 to 960, y 250 to 1620).

**Gate B.** Show the concept card and the shot cards (a scene style: the `scenes.json` plan and the `kit scene check` sheets; talking: the cut length and the layout list), and ask Gate B with a question block. In a brand folder with a sticker host run `kit host reels/<slug> --check` first. Record it with `kit gate reels/<slug> record --gate B`. Start building only after that.

Next step: section F. On failure: if they ask for changes, change the cards and ask again.

---

## F · Build

Read `modes/<mode>/GUIDE.md` in full before writing code: the bar, the look, the tokens, the API, the shot contract and recipes. The runtime gives you HOW things move (springs, swings, gravity, the building stage, host acting, camera, typing, rolling numbers, transitions) and the house finish. WHAT moves is your props, written as new code in the project. Strong reels run 50 to 110 lines of custom shot code and 3 to 7 hand-drawn objects per second.
- **Cue on words, never seconds:** use the mode's word lookup (print: `wordAt('word')`, depth: `at('word')`; both listed in the manual).
- **Colours come from the mode's theme tokens** (named in its manual), never hex codes, so a theme recolours everything. Fixed material colours of a prop (wood, brass, skin, a screen's dark glass) use the mode's named material tokens where it has them (print draws them as tone greys and the `C` tokens; depth names its materials in its manual); in 3D a prop's own paint colour may be a literal, but anything that should follow the brand (accent, tiles, badges) comes from the theme.
- **Preview each new prop alone** (`kit frames <project> <t> --only <id>`). Preview sheets: `kit frames <project> 0 1 2 3 4 5 --only presenter` (print presenter: portrait, poses, expressions, hairstyles, aims, moods).
- **Read the end of every `kit frames` / `kit render` output.** "error while drawing frames" means those frames are broken: fix them first.
- **Crew build vs solo build:**

  | | Crew build (plans max / api / team) | Solo build (pro / codex / cursor / other / unknown) |
  |---|---|---|
  | Builders | one sub-agent per 1 to 2 shots, in parallel | you build every shot yourself, one at a time |
  | Each builder gets / scope | `playbook/taste.md`, the mode manual, `playbook/ideas(-3d).md`, the concept card, its shot cards and words, the neighbours' hand-off state | 3 to 6 richer shots |
  | Stills | each renders `--out <shot>` | at key moments only |
  | Review | 2 to 3 rounds | 1 to 2 rounds and one draft |

  In solo build, tell the user up front that a reel uses a good part of their usage window.

  **Crew hand-off rules** (so builders agree):
  - **Shared props live in one file written by you (the lead) before any builder starts:** in print `scenes/props.js`, listed first in `SCENE_FILES` in `timeline.js` so it loads first (other modes: see the mode's guide). Anything two shots both draw (the story object, a recurring card, a character's look) is defined there once; builders call it, never redraw it.
  - **Write a hand-off block in `STORYBOARD.md`** before spawning builders: names and ids (every person, product, file, number on screen), colours (theme tokens used for each), which slot/seat/item is the hero, and the end state of each shot that the next one starts from. Every builder reads it and follows it exactly; a builder that needs a new shared fact asks you to add it, never invents its own.
- Write `reels/<slug>` in every command. When `brand.json` > `reels.layout` is `dated`, the kit files the reel under its post date for you; never write the dated path. To carry on with a reel, read `approvals.md` (the last gate recorded), `STORYBOARD.md` and the shot files. Never regenerate the voice unless the script changed.

Next step: section G. On failure: read the end of every `kit frames` and `kit render` output; "error while drawing frames" means fix those frames first.

---

## G · Check (mandatory, this is what makes it look pro)

Full checklist: `playbook/self-review.md`.
1. **Frames:** `kit frames reels/<slug> <t…>` at the middle of every shot and 0.1 s after every cut, into `stills/sheet.jpg`. Look at the sheet, fix, and re-render until it's clean.
2. **Draft:** `kit render reels/<slug>` writes a fast low-res `build/draft.mp4`. Pull frames around each transition (`ffmpeg -ss T -frames:v 1`), and fix pops, overlaps and dead air.
3. **Gates:** `kit pace reels/<slug>` and `kit effort reels/<slug>` must both print PASS. `pace` reads the rendered draft, so run `kit render` first.
   - `pace` lists every flat stretch with its words. Give each one a build-up, secondary motion, a camera move or a host act.
   - `effort` checks for enough original work, with no stock prop carrying the reel.
   - Never render the final while a gate fails.
   - `kit lint reels/<slug>` (local addition) checks shot grammar for depth and talking reels: shot length, face time, repeated layouts, cuts on words, rhythm, movement in the first second. Fix every error. Print reels get their shot list from `build/shots.json`, which `kit render` writes (a print shot is a timeline scene, so SHOT-LEN flags a scene longer than 5 s; layout, face and props are checked only where a scene file declares them). Scene styles have no shot data, so nothing is checked there.
4. **Last look:** the sheet once more through `playbook/taste.md`'s questions. If any answer is "not yet", improve first.
5. **Final:** `kit render reels/<slug> --final`, then `kit export reels/<slug>`, which writes `out/<name>.mp4` (1080×1920, 30 fps, H.264 + AAC).
6. **Real sound (local add-on, owner 2026-11-05, replaces the synthesised effects):** `"$EARSHOT_PY" "$KIT_DIR/tools/realsound.py" reels/<slug>`. `EARSHOT_PY` is `~/dev/sound/earshot/.venv/bin/python` (Windows: `%USERPROFILE%\dev\sound\earshot\.venv\Scripts\python.exe`); the installer sets it up. It takes the exported `out/<slug>.mp4` and leaves ONE final in `out/`, named `out/<slug>.mp4`; the original kit-sound file is kept at `build/pre-real/<slug>-kitsound.mp4` so the step can be redone. `--out <file>` chooses an exact name instead. <!-- local change, re-apply after kit updates -->
   - It mixes real CC0 recordings, snaps every hit to the frame where the motion lands and keeps the voice on top. It keeps at most one cue per 0.45 s, and mixes hits louder by default (`--hits softer` for less).
   - It knows these cue names: whoosh, swoosh, stamp, boom, riser, shimmer, thud, pop, click, tick, type, cash. A name outside that list is skipped; `build/realsound/report.txt` says what was skipped.
   - Read `build/realsound/report.txt`: every picture check must pass. If one fails, fix that cue and run it again.
7. **Cover:** `kit cover reels/<slug>`; look at `build/cover-crops.jpg`. The cover is a dedicated cover, never a frame grabbed from the hook.
8. **Caption:** `/caption-and-hashtags` writes `out/caption.txt` (the caption, up to 5 hashtags, a line of search keywords), then `caption.mjs check`. It must come before the final fact check, because that check covers the caption.
9. **File check:** `kit qa reels/<slug>` on the final `out/<slug>.mp4` (format, loudness and peak, black or frozen stretches, first-word sync). It must print PASS and says which checks it skipped. In a brand folder `scripts/qa/gate_qa.py` is the text and on-screen check (OCR) and must pass for the same file; Gate C refuses without it.
10. **Final fact check (local addition):** `kit facts reels/<slug> check --scope final` (mechanical: digits, sources, clearance dates, absolute wording; writes `build/factcheck.md`), then `/reel-factcheck` (a fresh re-read of every source), then `kit facts reels/<slug> record --scope final --result PASS|FAIL`. `kit gate` refuses Gate C without a current PASS; a caption or script changed afterwards makes it stale.
11. **Review:** `/reel-review`. It must write `Review: meets the bar (NN/100; ...) [video <12 hex>]` for the exact file (`kit gate reels/<slug> hash` prints the 12 hex). 90 or more, or fix the reel and review again. Never carry an old score over to a changed video.
12. **Gate C:** show the video path, the QA and review results, the caption and the cover, and ask Gate C with a question block. On a yes run `kit gate reels/<slug> record --gate C`: it stores the file's fingerprint with the QA result and the review verdict in `approvals.md`. Later, `kit gate reels/<slug> check` shows whether the file changed after approval.
13. **Facts and estimate (local addition):** `kit measure reels/<slug>` writes plain facts (cuts, pauses, loudness, still stretches, contact sheets); `kit predict reels/<slug>` adds a watch-time and skip-rate estimate only once `kit calibrate <insights.csv>` has been run on at least 8 of the brand's own reels. Until then it gives measurements, never a prediction.

Next step: section H. On failure: if QA, a fact check or the review fails, fix the cause and run it again from the step that failed; any change to the video means steps 9, 10, 11 and 12 again.

**Paid calls are guarded (local addition):** `voice.py` and `take.py` keep a marker in `build/.markers/` for every paid request. The same request again prints "reused (no credits spent)"; a request that may already have been billed is refused until you re-run with `--force`.

One render runs at a time (built-in lock). Drafts first, final once.

---

## S · Scene styles (local addition, 2026-11-12)

A scene style is a drawn look from `styles/` (`modes/MODE-RULES.md`, "Scene styles"): the reel is a list of scenes, each one template of the style with props, timed by the voice. Sections B to D and G apply; section E becomes the plan below (Gate B shows the `scenes.json` plan and the `kit scene check` sheets) and section F is replaced by it.
```
node "$KIT_DIR/tools/kit.mjs" scene list [<style>]                 the styles, then one style's templates
node "$KIT_DIR/tools/kit.mjs" start reels/<slug> --style <style>  reel.json, script.txt and a sample scenes.json
python3 "$KIT_DIR/tools/voice.py" reels/<slug>                     the voice and build/words.json, as for every mode
node "$KIT_DIR/tools/kit.mjs" scene reels/<slug> plan             each scene's time from the words, and what does not match
node "$KIT_DIR/tools/kit.mjs" scene reels/<slug> check            errors, safe area and seeking per scene; sheets in build/scenes/check/
node "$KIT_DIR/tools/kit.mjs" render reels/<slug> [--scene n]     changed scenes only; build/video.mp4 + build/draft.mp4
node "$KIT_DIR/tools/kit.mjs" scene reels/<slug> stand-in         optional: a tone and fake word times to preview timing (no key, no credits; never for posting)
```
1. Read `styles/<style>/SKILL.md` (the art direction and its golden rules) and `templates.json` (each template's props schema, example props and narration) before planning.
2. Write `script.txt` (section C), then `scenes.json`: one scene per idea, `narration` = the exact words of the script it covers, `props` from the template's schema, using the narrator's own words in labels so the engine lands each one on its word. Reuse the same cast and props across scenes; vary the templates. The last scene carries the brand's own ask (save, follow or visit the link) in its narration and labels, using the style's closing template; a keyword ask only when the keyword is tested.
3. Voice, then `kit scene <dir> plan`: every scene should say `words n/n`. Fix the narration of any scene on `even split`. Aim for 3 to 12 s a scene.
4. Check and render:
   - `kit scene reels/<slug> check`, then LOOK at every sheet. Fix props (shorter labels, fewer items) and check again.
   - `kit render reels/<slug>`; pull frames around each cut.
   - Then section G from step 3: `kit pace` (a style in `CALM_STYLES` in `tools/kitcore.py`, today `deep-zoom`, is measured but passes with a note, and `/reel-review` scores its movement and pace against the calm bar), `kit qa`. `kit effort` says it does not apply and `kit lint` finds no shot data; skip both.
5. Sound: `kit render` writes `build/sfx.json` from the scene cuts (a soft swoosh on every cut, none on frame 0), so `kit export` and the real-sound step (section G step 5) have cues. A scene can add its own with `"sfx": "pop"` (at its start) or `"sfx": [{"at": 1.2, "name": "pop", "gain": -3}]` (seconds into the scene); `reel.json` `"sfx": "off"` turns the cut swooshes off. Names: whoosh swoosh pop click tick thud stamp boom riser shimmer type cash (the real-sound step knows these and skips any other).
6. Revisions: change a scene's props or narration and render again; only changed scenes are drawn again.

Next step: section G from step 3. On failure: a scene on `even split` in `plan` means its narration is not in the script; fix the narration.

---

## T · Talking-head mode (`talking`)

Their own face take drives everything, with no TTS. Read `modes/talking/GUIDE.md` in full first.
1. **Start:** `kit start reels/<slug> --style talking`, then `python3 "$KIT_DIR/tools/take.py" reels/<slug> --video <their take>`. It:
   - tightens the pauses and polishes the voice;
   - writes the face frames;
   - writes `build/words.json` (ElevenLabs speech-to-text with their key, or Whisper).

   Tell them the tightened length. If they asked to review the cut, get their OK first.
2. **Shots:**
   - one layout every 1.5 to 3 s (hard cuts, never one layout three times in a row);
   - one graphic per named thing;
   - KEY words for the captions;
   - their real screenshots over rebuilt UI.
3. **Gate A for a talking reel** approves the planned words. The fact check and Gate A read `script.txt`, but the spoken words are in `vo_raw/transcript.txt`. If they differ, put the transcript into `script.txt` (keep the plan as `script-planned.txt`) before `kit facts`.
4. **Build and check:** write `scenes.js` with the talking API, show Gate B (the cut length and the layout list), then run the checks in section G.

Next step: section G. On failure: if `take.py` cannot read the speech, run the checkup (section A) for the speech-to-text key or Whisper.

---

## R · Revise (when they ask for changes after seeing a reel)
- **Keep everything they didn't mention.** Same script, voice take, shots, layout and props. Change only what they asked for; never rebuild the reel.
- **Map the request to the smallest edit:** a shot's moment or size → edit that shot file; "bigger text" → the caption/card sizes; "more motion" → add beats inside the existing shots; "shorter" → cut lines and re-time; a new style → only then start a new project.
- **Voice:** keep the take. To change one line, re-voice just that sentence and splice it in at the pauses (check every word is heard); re-record the whole take only if they ask for a new voice or speed.
- **Re-render only what changed**, then run section G again from step 3. A changed video needs a new QA, a new review and a new Gate C.
- **Version it:** export to `out/v2/`, `out/v3/` … and keep the earlier versions.
- **Show what changed:** before/after stills of the changed moments, plus one line per change.

## H · Hand over

Give them:
- the path to `out/<name>.mp4`, the cover (`out/cover.jpg`) and the caption (`out/caption.txt`), all approved at Gate C;
- if the ask is a keyword ("Comment WORD"), a reminder that it needs a DM auto-reply tested for that exact word before the reel goes live (`docs/connect.md` step 7).

Posting: in a brand folder, `/reel-posting` and the brand's rule 11. Never post by yourself. Offer one round of changes: faster hook, different voice, swap a shot, different theme (section R).

Next step: none; the reel is done. On failure: if Gate C was refused, `kit gate` says which check is missing; do that check, not an override.

---

## L · Licensed material (any source; Uppbeat suggested; local addition, 2026-11-17)

The kit ships no music, clips, graphics or LUTs. Any source the brand has rights to works; Uppbeat is the one we suggest and use. The owner downloads by hand and records each file: `kit licensed add <file> --type music|sfx|stock-video|motion-graphic|lut --title "..." [--artist --url --source --plan --channels --credit]` (registry `brand/licensed/assets.json`, media in `brand/licensed/<type>/`, never committed; `kit licensed list|check [<reel>]|remove <id>`; the brand folder's `/licensed-assets` skill and `brand/licensed/README.md` explain it). A reel uses an asset by its id:
- `reel.json` `"look": {"lut": "<id>", "strength": 0-1}` (default 1): the grade is applied to the whole picture by `kit export` (ffmpeg `lut3d`, blended by strength). A reel LUT wins over the brand's `scripts/fx/look.cube` slot and `kit export` says so.
- `reel.json` `"music": [{"asset": "<id>", "from": 0, "fade": 1, "gain_db": -18}]`: `kit sound` loops the bed to the end, fades it, sets it `gain_db` under full level and ducks it under the voice (ffmpeg `sidechaincompress`); `build/music.json` records each bed and its hash. A string in `"music"` is the old single-track form.
- Scene styles, in `scenes.json`: a scene `{"clip": {"asset": "<stock-video id>", "start": 2, "duration": 5, "mute": true}, "narration": "..."}` is a cutaway (scaled and cropped to 1080x1920, same codec settings, timed from `build/words.json` like any scene, held on its last frame if the scene is longer; `kit frames` shows one frame of it), and any scene may carry `"overlay": {"asset": "<motion-graphic id>", "blend": "normal|screen", "opacity": 0-1, "at": s, "duration": s}`, composited by ffmpeg after the scene renders (alpha kept for .mov and .webm; `screen` for black-background light leaks). An overlay is picture only: it is never text for the safe zone or the on-screen text.

Next step: `kit licensed check <reel>`. On failure it names the asset (not recorded, file missing, changed since recorded, wrong type); fix that, never edit `assets.json` by hand to make it pass.

---

## Always
- Their script, brand names and claims are used exactly as given. Never invent stats, prices or quotes about real products.
- No one else's logos, footage or characters unless the user supplies them and has the rights. Licensed music, clips, graphics and LUTs from any source with rights, recorded with `kit licensed add` (section L; we suggest Uppbeat).
- Never print keys. Never post or upload anything by yourself; outside a brand folder you only create files, and in a brand folder follow its rule 11 and `/reel-posting`.
- When a tool errors, read the message, fix the cause (often setup: run the checkup) and retry. Don't silently switch approaches.
- Keep them posted in plain words at each stage (script ✓, voice ✓, shots 3/7, check, final), without log dumps.

## Map
- `tools/`:
  - `kit.mjs`, the one command; run `node "$KIT_DIR/tools/kit.mjs"` alone to print every verb: start, frames, render, pace, script, effort, lint, qa, facts, gate, measure, calibrate, predict, licensed, sound, export, live, cover, organize, tidy, scene, host
  - `licensed.mjs` (`kit licensed`: the licensed-assets registry and check), `scenes.mjs` (scene styles: plan, timing, render, check, stand-in voice), `session.mjs`, `server.mjs`, `chromium.mjs`, `lock.mjs`
  - `voice.py`, `take.py`, `voicebank.py`, `budget.py` (credits left), `markers.py`, `glyphs.py`, `checkup.mjs`
  - checks: `pace.py`, `effort.py`, `lint.py`, `scriptlint.py`, `qa.py`, `facts.py`, `gate.py`, `measure.py`, `calibrate.py`, `predict.py`
  - sound: `sound.py` (export mix), `realsound.py` (the real-sound step)
  - `kitcore.py` (shared settings), `folders.mjs`
- `modes/<mode>/`: its manual (`GUIDE.md`), runtime, parts, starter project and example shots; plus `modes/MODE-RULES.md`.
- `styles/`: the scene styles, synced from the styles repo (`STYLES.json`, `_core/`, one folder per style); never edited here.
- `playbook/`:
  - `taste.md` (read first)
  - `writing.md`, `staging.md`
  - `ideas.md` + `ideas-3d.md`
  - `self-review.md`, `host.md`, `posting.md`
- `modes/<mode>/examples/`: worked scenes to learn techniques from, each listed in its `SHOTS.md` with when to use it.
- `SETUP.md` explains each line of the checkup; `README.md` says what this is.
