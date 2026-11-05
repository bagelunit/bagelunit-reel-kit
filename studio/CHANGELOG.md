# Changelog

## v1.4.1 (2026-10-28): print, rewritten as our own

- **Same output, our code:** the print runtime, parts and starter are rewritten from the ground up. Renders are frame-for-frame the same as v1.4.0, so v1.4.0 reels keep working.
- **New print examples:** 8 props (badge line, flap board, rail route, score gauge, launch box, tube mail, receipt fan, key ring), each a single drawing function cued on words, plus `examples/props-reel`, a short reel that plays all eight. The full casinos reel is now an example too (`examples/casinos`). 5 worked scenes remain; the older 11 scenes and 6 prop studies are gone.
- **A new print manual:** `modes/print/GUIDE.md` is rewritten and reorganised (the bar, how a reel is built, the toolbox, snippets, checks). New: the layering rule for overlapping paper (fill faces on the ink layer).
- **Updated indexes:** `examples/SHOTS.md` and the idea-to-example table in `playbook/ideas.md` point at the new examples.

## v1.4.0 (2026-10-28): the print engine, rebuilt

- **New print look:** a riso print on warm stock. Shading is an engraved line screen (line thickness carries the tone, two inks crosshatch where they overlap), one accent ink with a slight mis-registration, paper-white cards with hard shadows, big condensed caps captions with a marker underline on the key word, and blind wipes between scenes.
- **The presenter acts:** a sticker-bordered bust docked in the corner that points at the newest thing on stage and re-aims as it moves, follows it with its eyes, changes expression every phrase, jabs on the key words, lip-syncs and has moods for the big moments (panic, shock, celebrate, facepalm, shh, hero…). Same look options as before, plus `dock`.
- **Richer toolkit:** a build-up stage (elements drop, slide, swing and stamp in on their words, older ones step back and keep idling), physics primitives (springs, pendulums, gravity, integrated speed), camera kicks and leans, and kits for devices, cards, charts, comment sheets, DMs, terminals, live stats and more.
- **Reels are written as scenes:** `timeline.js` lists the scene files and the cut points (cued on words), each `scenes/*.js` registers one scene. The guide (`modes/print/GUIDE.md`) has the full API, recipes and the quality bar; `modes/print/examples/` has 16 worked scenes, 6 studied props and 1 fps reference strips of a finished reel.
- **Breaking:** print reels made with v1.3 (`cuts.js` + `shots/`) need to be rebuilt as scenes ("rebuild this reel in v1.4 print"). Depth and talking-head reels are unchanged.

## v1.3.0 (2026-10-27): three modes, a new core

- **Three modes:** print, depth (3D) and talking head. The toybox mode is retired; reels made with it keep rendering in your v1.2 folder.
- **Self-contained modes:** each mode folder now holds everything about it: `GUIDE.md` (was `playbook/modes/<mode>.md`), `runtime/`, `parts/`, `starter/` and `examples/` (was `scenebank/<mode>/`). `playbook/` keeps the craft that applies to every mode.
- **Print running order:** `cuts.js` makes one `order({ shots: [[key, start, { sweep }], …], shared, lines, meter })` call instead of setting `SHOTS`, `CUTS`, `LINES` and `METER`. Shot files read their window with `shotWindow('key')`; `KEYWORD` always exists. The starter page is a loader (`runtime/load.js`).
- **One page handshake:** every mode fills `window.studio = { ready, length, show(t), grab, cues, quiet }` for the tools (see `modes/MODE-RULES.md`).
- **Rewritten from scratch:** the tool layer (`kit`, session, server, render lock, checkup, voice), the 3D shot planner and props sheet, and the guides for setup, staging, self-review and the mode rules. Renders look the same as v1.2.
- **Breaking:** print reels made with v1.2 need their `cuts.js` changed to the `order({ … })` form (Claude can do it: "port this reel to v1.3").

## v1.2.1 (2026-10-27): fixes from the second fresh-install test

- **Short reels fit more words:** 10–15 s ≈ 40–48 words, 20–30 s ≈ 80–110 (the voice trims pauses and speeds up ×1.15).
- **Sparser sound:** export keeps at most about one cue per 0.75 s; cuts, stamps and slams win over pops and ticks.
- **Crew builds agree:** shared props go in `shots/_shared.js`, loaded first, and the lead writes a hand-off block in `STORYBOARD.md` (names, ids, colours, the hero item, each shot's end state).
- **Timing rules:** a hit on a shot's last stressed word still lands before the transition (move the cut, not the hit). A payoff stays on screen at least 1.0 s before the cut.
- **Print:** `aroundDeg()` for tilts in degrees (`around()` takes radians, now stated). A shot with its own `cam` gets no automatic lean, now flagged in the manual. The manual's parts preview points at `kit frames` instead of a file that isn't shipped.
- **Numbers line up:** the ideas guide's code and helper targets match the effort gate's bars.

## v1.2 (2026-10-27): the full toolbox

- **Print:** the host acts on its own (points at what lands, faces follow the phrase, jabs on the key word), 14 poses and 14 moods with paper extras, hero moments and a REC frame, props in hand, letter-based lip sync, a build-up stage with a camera that leans to the newest thing, and on-screen words in 11 languages. About 30 more parts: toasts, toggles, progress, stat cards, seals, line/ring/versus charts, an odometer, a prompt box, a video player, skeleton loaders, 7 terminal line kinds, glow, ripple, speed lines and more.
- **3D:** labels pinned to 3D points with leader lines, a studio close-up kit (phone, hand, pen, x-ray), a real city (traffic, routes, airport, jet), whip and swoop cuts with an automatic whoosh, spline and roll camera paths.
- **Toybox:** dolls hold props and walk, 11 named dolls in 5 builds with more hair and outfits, and 85 toy props.
- **Guides:** the ideas guides are back to full depth (hook construction, reel breakdowns, whole reels worked beat by beat).

## v1.1.1 (2026-10-27): fixes from a fresh-install test

- **The ask cut lands on "Comment".** With the voice's tight pauses, the print starter cut to the ask one sentence early. The depth starter now starts its ask on "Comment" too.
- **Sentences end where the next one starts.** Card sublines no longer run into the next sentence.
- **No lone caption words.** A caption page or tile row never shows one word alone (print, depth).
- **Short reels:** the guides size 10–15 s and 20–30 s reels (words, shots, shape). The default stays 35–60 s.
- **Saving the brand:** `checkup.mjs --set-brand @name --set-theme studio`.
- **Named colours:** print has material and status colours (`P.brass`, `P.wood`, `P.skin`, `P.screen`, `P.ok`…). The print scenebank uses them in place of raw hex.
- **The guide now says:**
  - `kit pace` needs a rendered draft;
  - export thins sound cues that sit too close together.

## v1.1 (2026-10-27): own look, new scene API

- **Every mode has a new look.**
  - print: an ink-and-halftone print look: tactile paper, ink-outlined props with halftone shading, bold condensed captions with a marker underline on the key word, and a rigged presenter (make it look like you) who acts on every line. (v1.2.2: the ink-and-halftone engine is back, reskinned: new palette, Barlow Condensed captions with a marker underline, a new default presenter, a new chapter mark and counter tag, a stripe-sweep transition, solid offset shadows, and an accent-edged presenter cut-out.)
  - depth: lit rooms with warm plaster walls, lamps and depth of field. Bix, the boxy host, wears overalls by default (suit and fedora optional). Machines, light dashboards, a workbench for close-up object stories, a clapboard storefront CTA, taped titles and big caption tiles.
  - toybox: a toy town on a play table. Wooden block houses on a play-mat in a playroom, pip the presenter doll and a peg-doll cast, alphabet-block captions on little shelves and a hanging chapter sign.
  - talking: the same layouts, with the new themes.
- **New themes in every mode:** studio (default), harbor, ochre and ink. The v1.0 names clay, cobalt, forest and mono still work.
- **New shot API, renamed per mode.** Each manual in `studio/playbook/modes/` has the new names:
  - `shots/` and `cuts.js` replace `scenes/` and `cuts.js` / `plan.js`;
  - `sound()` replaces `cue()`;
  - `punch()` replaces `kick()`;
  - `host` replaces `presenter` (`presenter` is still read);
  - `at('word')` looks up a word's time.
- **New starter reels and a 68-shot scenebank** (print 16, depth 28, toybox 24): our own shots plus classic devices rebuilt in the new looks, each listed in its mode's `SHOTS.md`.
- **Tools rewritten.** Same commands and flags. `voicebank.py` and the Whisper fallback in `take.py` work again.
- **Breaking:** reels made with v1.0's print, depth or toybox runtime don't run on v1.1. Keep the v1.0 zip to re-render them, or ask Claude to port the shots to the new API.

## v1.2.2
- Print uses the ink-and-halftone print engine again (the v1.0 engine), reskinned in the house look: studio / harbor / ochre / ink themes (signal orange by default), Barlow Condensed captions with an ink marker underline on the key word, a new default presenter (curly hair, square glasses, stubble, navy hoodie), an accent-disc chapter mark and a square counter tag. Print reels made with v1.2 / v1.2.1's cut-paper runtime need that version to re-render.
- Print mode files renamed in our own structure (runtime: core, chrome, footage, timing, mouth, subtitles, gestures, figure, inkscreen, stage; parts: marks, screens, panels, graphs, motion; starter: cuts.js + shots/open, body, ask; scenebank print: pr01-… + props/ + kits/; SHOTS.md; modes/MODE-RULES.md).
- New: "Not happy? Just say what to change" in GET STARTED and a Revise section (R) in KIT.md: keep what they liked, smallest edit, versioned exports.
- Print's presenter guide (`playbook/host.md`) and manual updated; presenter preview is `kit frames <reel> 0 1 2 3 4 5 --only presenter`.

## v1.2.3
- Print is back on the kit's own cut-paper engine (the v1.2.1 print mode: cut-paper collage host that acts on its own, 14 poses and moods, build-up stage, ~30 parts, 11 languages, 24 print scenes). The v1.2.2 ink-and-halftone print engine is removed.
- Kept from v1.2.2: the revise flow (GET STARTED step 4, KIT.md section R), SHOTS.md / MODE-RULES.md names, and the fresh-install fixes.
